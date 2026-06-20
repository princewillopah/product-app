# Operations Runbook — product-app

**Scope:** the local `product-app-dev` kind cluster running ArgoCD + Helm.
**Audience:** whoever is operating or demoing this stack.

> **GitOps ground rule:** Git is the source of truth and both Applications run
> with `selfHeal: true`. Any manual `kubectl edit` / `kubectl scale` /
> `kubectl apply` against a managed resource is **reverted by ArgoCD** within
> minutes. To make a change stick, change it in Git and let ArgoCD sync. The only
> exception is `kubectl rollout restart` (it doesn't change desired state).

---

## Table of contents

1. [Quick reference](#quick-reference)
2. [Deployment procedures](#deployment-procedures)
3. [ArgoCD operations](#argocd-operations)
4. [Observability](#observability)
5. [Incident response](#incident-response)
6. [Troubleshooting](#troubleshooting)
7. [Scaling](#scaling)
8. [Rollback & recovery](#rollback--recovery)

---

## Quick reference

### Access

| UI | URL / command | Credentials |
|----|---------------|-------------|
| Frontend / Storefront | http://localhost:8080 · http://localhost:8080/shop | — |
| API Gateway | http://localhost:8000 | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3000 | `admin` / `prom-operator` |
| Alertmanager | http://localhost:9093 | — |
| ArgoCD | `kubectl -n argocd port-forward svc/argocd-server 8089:443` → https://localhost:8089 | `admin` / (secret below) |
| Loki | `kubectl -n observability-stack port-forward svc/loki 3100:3100` | — |
| Tempo | `kubectl -n observability-stack port-forward svc/tempo 3200:3200` | — |

```bash
# ArgoCD initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d && echo
```

### Health at a glance

```bash
kubectl get nodes -o wide
kubectl top nodes ; kubectl top pods -A          # needs metrics-server (installed by setup-kind-dev.sh)
kubectl -n argocd get applications               # product-app-services-dev / product-app-observability-dev
kubectl get pods -n product-app -o wide
kubectl get pods -n observability-stack -o wide
kubectl get hpa,pdb -n product-app
```

### Namespaces

| Namespace | Contents |
|-----------|----------|
| `product-app` | 5 services + MongoDB + PostgreSQL |
| `observability-stack` | Prometheus, Grafana, Alertmanager, Loki, Tempo, OTel Collector |
| `argocd` | ArgoCD control plane |

---

## Deployment procedures

### Normal deployment (the only one you should use)

```bash
# 1. Make a code change under images/** and push.
git add -A && git commit -m "feat: ..." && git push origin main
# 2. GitHub Actions builds + pushes 5 images, then writes global.image.tag=<sha>
#    into charts/product-app/values.yaml and commits [skip ci].
# 3. ArgoCD detects the commit and syncs. Watch it:
kubectl -n argocd get applications -w
```

There is no `deploy-all.sh` and no `kubectl apply` step — deployment is the CI
write-back plus ArgoCD sync. See [docs/github-action-pipeline.md](github-action-pipeline.md).

### First-time bring-up

See [HowTo.md](../HowTo.md). Summary: set Docker Hub secrets → push (CI) →
`scripts/setup-kind-dev.sh` → `scripts/setup-argocd.sh`.

### Force an immediate sync (don't wait for ArgoCD's poll)

```bash
# UI: ArgoCD → the app → SYNC.  CLI:
argocd app sync product-app-services-dev
argocd app sync product-app-observability-dev
# Or trigger reconciliation without the CLI:
kubectl -n argocd annotate application product-app-services-dev \
  argocd.argoproj.io/refresh=hard --overwrite
```

---

## ArgoCD operations

```bash
# Status / drift
argocd app get product-app-services-dev
argocd app diff product-app-services-dev        # desired (Git) vs live

# What image tag is currently deployed?
kubectl -n product-app get deploy order-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo

# Pause auto-sync (e.g. during an incident) and resume
argocd app set product-app-services-dev --sync-policy none
argocd app set product-app-services-dev --sync-policy automated --self-heal --auto-prune
```

`OutOfSync` that never resolves is usually one of: image tag not yet pushed to
Docker Hub, a private Docker Hub repo (`ImagePullBackOff`), or a chart render
error (`argocd app get` shows the message).

---

## Observability

```bash
# Prometheus targets / active alerts
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job:.labels.job, health}'
curl -s localhost:9090/api/v1/alerts  | jq '.data.alerts[]   | {alertname:.labels.alertname, state}'

# Alertmanager
curl -s localhost:9093/api/v2/alerts | jq '.[] | {labels, status}'

# Loki (after port-forward 3100)
curl -s 'localhost:3100/loki/api/v1/labels' | jq .

# Tempo readiness (after port-forward 3200)
curl -s localhost:3200/ready
```

Metrics scraping is driven by pod annotations (`prometheus.io/scrape: "true"`,
`prometheus.io/port`, `prometheus.io/path`) set in `charts/product-app/values.yaml`.
The frontend (nginx) has scraping **off** on purpose — it has no `/metrics`.

Traces: services export OTLP to `otel-collector.observability-stack:4317`, which
forwards to Tempo. Grafana has Prometheus, Loki and Tempo datasources pre-wired.

---

## Incident response

### Service down / not ready

```bash
kubectl get pods -n product-app
kubectl describe pod <pod> -n product-app          # Events at the bottom
kubectl logs <pod> -n product-app --previous       # last crash

# Decision tree:
#  CrashLoopBackOff      → read logs --previous; usually bad config/env or dependency down
#  ImagePullBackOff      → tag not pushed yet, OR Docker Hub repo is private (make it public)
#  OOMKilled             → raise resources.limits.memory in values.yaml, push
#  Readiness failing     → hit the service's health endpoint; check dependencies (DB)

# Safe recovery that ArgoCD won't fight:
kubectl rollout restart deployment/<service> -n product-app
kubectl rollout status  deployment/<service> -n product-app --timeout=5m
```

### Datastore connectivity

```bash
kubectl exec -n product-app mongodb-0 -- mongosh --quiet --eval 'db.adminCommand("ping")'
kubectl exec -n product-app <postgres-pod> -- psql -U postgres -c 'SELECT 1'
```

### High error rate / latency

```bash
kubectl logs -f deployment/api-gateway -n product-app | grep -iE 'error|5[0-9][0-9]'
# Check each downstream from inside the cluster:
kubectl run tmp --rm -it --image=curlimages/curl -n product-app -- \
  sh -c 'for s in order-service product-service analytics-service; do
           echo "== $s =="; curl -s http://$s.product-app:8080/health || echo down; done'
```

If a bad release is the cause, jump to [Rollback & recovery](#rollback--recovery).

---

## Troubleshooting

### Prometheus not scraping a service

```bash
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health!="up") | {job:.labels.job, lastError}'
# Checklist: pod has prometheus.io/scrape:"true"; the port annotation matches a
# real containerPort; the /metrics path responds inside the cluster.
```

### Loki has no logs

```bash
kubectl get pods -n observability-stack -l app.kubernetes.io/name=loki
kubectl logs -n observability-stack -l app.kubernetes.io/name=loki --tail=50
# Loki runs as a StatefulSet (loki-0). Query from the host after port-forward 3100.
```

### Tempo has no traces

```bash
kubectl logs -n observability-stack deploy/otel-collector --tail=50   # is the collector receiving?
kubectl logs deployment/api-gateway -n product-app | grep -i otel     # is the service exporting?
# Verify OTEL_EXPORTER_OTLP_ENDPOINT points at otel-collector.observability-stack:4317.
```

### ArgoCD stuck OutOfSync / Degraded

```bash
argocd app get product-app-services-dev          # read the condition message
kubectl -n product-app get events --sort-by=.lastTimestamp | tail -20
# Common: ImagePullBackOff (private/ missing tag) or a values/template error.
```

---

## Scaling

Scaling is a **Git change**, not a `kubectl scale` (that gets reverted by
`selfHeal`).

```yaml
# charts/product-app/values.yaml
services:
  order-service:
    replicas: 4          # change, commit, push → ArgoCD syncs
```

HPAs are defined per service in the same `values.yaml`. To change autoscaling
bounds or targets, edit the service's `hpa:` block and push. Confirm:

```bash
kubectl get hpa -n product-app
```

> HPA targets may show `<unknown>` for ~1–2 minutes after a fresh cluster while
> `metrics-server` warms up. That's expected, not a failure.

---

## Rollback & recovery

### Roll back a bad release (preferred)

```bash
git log --oneline -n 5                    # find the "chore(deploy): release <sha>" commit
git revert <bad-commit> && git push       # ArgoCD syncs the previous tag back
```

### Roll back one deployment immediately (stop-gap)

```bash
kubectl rollout undo deployment/<service> -n product-app
# NOTE: selfHeal will re-pull the Git-desired tag on the next sync, so follow up
# with a git revert to make the rollback permanent.
```

### Rebuild the cluster from scratch

The cluster is disposable; Git is the source of truth.

```bash
kind delete cluster --name product-app-dev
bash scripts/setup-kind-dev.sh
bash scripts/setup-argocd.sh              # ArgoCD re-syncs everything from Git
```

Application data in MongoDB/PostgreSQL is **not** preserved by a cluster rebuild
(no PV backups are configured in this demo). Treat the datastores as ephemeral.
