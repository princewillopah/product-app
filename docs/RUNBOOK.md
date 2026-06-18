# Production Operations Runbook

**Last Updated**: 2026-06-17  
**Status**: Production-ready architecture  
**Owner**: DevOps / SRE Team

---

## 📋 Table of Contents

1. [Quick Reference](#quick-reference)
2. [Deployment Procedures](#deployment-procedures)
3. [Monitoring & Alerting](#monitoring--alerting)
4. [Incident Response](#incident-response)
5. [Troubleshooting](#troubleshooting)
6. [Maintenance](#maintenance)
7. [Scaling](#scaling)
8. [Disaster Recovery](#disaster-recovery)

---

## Quick Reference

### Essential Commands

```bash
# Check cluster health
kubectl get nodes -o wide
kubectl top nodes
kubectl top pods -A

# View all alerting rules
kubectl port-forward -n observability-stack svc/prometheus 9090:9090 &
curl http://127.0.0.1:9090/api/v1/rules | jq '.data.groups[] | {name, rules: [.rules[].name]}'

# View active alerts
curl http://127.0.0.1:9090/api/v1/alerts | jq '.data.alerts[] | {labels, annotations}'

# View AlertManager routing
curl http://127.0.0.1:9093/api/v2/alerts | jq '.[] | {labels, status}'

# Check service health
kubectl get pods -n product-app -o wide
kubectl logs -f deployment/order-service -n product-app

# View recent changes (ArgoCD)
argocd app get product-app-prod
argocd app sync product-app-prod --dry-run

# View SLO status
kubectl port-forward -n observability-stack svc/grafana 3000:80 &
# Navigate to: SLO Dashboard in Grafana
```

### Service URLs (prod)

| Service | URL | Notes |
|---------|-----|-------|
| Prometheus | https://prometheus.prod.internal:9090 | Metrics DB |
| Grafana | https://grafana.prod.internal:3000 | Dashboards |
| AlertManager | https://alertmanager.prod.internal:9093 | Alert routing |
| ArgoCD | https://argocd.prod.internal:8080 | GitOps control |
| Order Service | https://order-service.prod.internal | API |
| Analytics Service | https://analytics.prod.internal | API |
| Product Service | https://product.prod.internal | API |

---

## Deployment Procedures

### Deploying to Development

```bash
# 1. Create/update Kind dev cluster
bash scripts/setup-kind-dev.sh

# 2. Configure GHCR auth
bash scripts/setup-ghcr-secret.sh --github-username YOUR_USERNAME --github-token YOUR_PAT

# 3. Deploy full stack
bash scripts/deploy-all.sh --cluster dev

# 4. Validate everything
bash scripts/validate-observability.sh

# 5. Deploy application services
kubectl apply -f k8s/services/
```

### Deploying to Staging

```bash
# 1. Merge code to main branch (triggers GitHub Actions)
# 2. Images built and pushed to GHCR automatically
# 3. ArgoCD syncs staging cluster

# Verify sync
argocd app sync product-app-staging --dry-run
argocd app get product-app-staging

# Monitor for errors
kubectl logs -f deployment/order-service -n product-app --timestamps=true
```

### Deploying to Production

```bash
# 1. All changes must be reviewed in PR
# 2. GitHub Actions builds and validates
# 3. ArgoCD detects changes (manual sync required for prod)

# Manual approval workflow
argocd app get product-app-prod
argocd app sync product-app-prod --dry-run

# If safe, sync
argocd app sync product-app-prod

# Monitor rollout
kubectl rollout status deployment/order-service -n product-app --timeout=10m
kubectl get pods -n product-app -L version
```

### Rolling Back a Deployment

```bash
# 1. Identify the bad commit
git log --oneline -n 5

# 2. Revert in Git
git revert <commit-hash>
git push origin main

# 3. ArgoCD auto-syncs (or manual)
argocd app sync product-app-prod

# 4. Verify rollback
argocd app diff product-app-prod
kubectl get pods -n product-app -L version
```

---

## Monitoring & Alerting

### Critical Alerts

| Alert | Severity | SLO Impact | Action |
|-------|----------|-----------|--------|
| `ServiceDown` | 🔴 Critical | Immediate | Page on-call, check logs, restart if needed |
| `HighErrorRate` | 🔴 Critical | Minutes | Incident war room, root cause analysis |
| `SLOErrorBurnRate5m` | 🔴 Critical | Fast burn | Halt deployments, focus on stability |
| `SLOErrorBurnRate1h` | 🟡 Warning | Medium burn | Create incident ticket, investigate |
| `HighLatencyP95` | 🟡 Warning | Degraded UX | Performance optimization ticket |

### Dashboard Access

**Grafana** (http://grafana.prod.internal:3000)
- Username: `admin`
- Password: (see Kubernetes secret: `kube-prometheus-stack-grafana`)

**Pre-built Dashboards**:
- Kubernetes Cluster Overview
- Service Health & SLOs
- Error Rate & Latency Analysis
- Pod Resource Usage
- Network I/O
- Custom Business Metrics

### SLO Tracking

**Monthly Error Budget**: 30 days @ 99.9% = 43.2 minutes downtime allowed

**Burn-rate Windows**:
- **5-min @ 1000x**: Alert if 43.2 min budget exhausted in 5 min
- **1-hour @ 100x**: Alert if budget exhausted in 1 hour
- **6-hour @ 10x**: Alert if budget exhausted in 6 hours
- **30-day @ 1x**: Track actual burn vs budget

**Check remaining budget**:
```bash
curl -s http://prometheus.prod:9090/api/v1/query \
  --data-urlencode 'query=increase(http_requests_total{status=~"5.."}[30d]) / increase(http_requests_total[30d])' \
  | jq '.data.result[] | {job: .metric.job, error_rate: .value[1]}'
```

---

## Incident Response

### Service Down (Critical)

**Timeline**: Act within 30 seconds

```
Alert triggered (ServiceDown)
    ↓
Page on-call engineer (PagerDuty)
    ↓
Check: kubectl get pods -n product-app
    ↓
Check: kubectl logs deployment/order-service -n product-app
    ↓
Decision tree:
    ├─ Pod CrashLoopBackOff? → kubectl describe pod <pod>
    ├─ Image pull error? → Check GHCR credentials, image registry
    ├─ OOMKilled? → Increase memory limits
    ├─ Readiness probe failing? → Check service health endpoint
    └─ Database connectivity? → Check PostgreSQL/MongoDB status
```

**Recovery Steps**:
```bash
# Option 1: Restart deployment
kubectl rollout restart deployment/order-service -n product-app

# Option 2: Scale up if replicas=0
kubectl scale deployment order-service --replicas=2 -n product-app

# Option 3: Check image & rollback if needed
kubectl get deployment/order-service -n product-app -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl rollout history deployment/order-service -n product-app
kubectl rollout undo deployment/order-service -n product-app

# Monitor recovery
kubectl rollout status deployment/order-service -n product-app --timeout=5m
```

### High Error Rate (Critical)

**Timeline**: Act within 5 minutes

```
Alert: HighErrorRate > 5% for 1 minute
    ↓
Check error logs: kubectl logs -f deployment/order-service -n product-app --timestamps=true | grep ERROR
    ↓
Check downstream services:
    - curl http://analytics-service.product-app:8080/health
    - curl http://product-service.product-app:8080/health
    - curl http://inventory-service.product-app:8080/health
    ↓
Check database:
    - MongoDB: kubectl exec mongodb-0 -n product-app -- mongosh --eval 'db.adminCommand("ping")'
    - PostgreSQL: kubectl exec postgres-0 -n product-app -- psql -U admin -c 'SELECT 1'
    ↓
Decision:
    ├─ Dependency down? → Restart that service
    ├─ Database down? → Page DBA, check PVC status
    ├─ Resource exhaustion? → Check CPU/memory usage
    └─ Code issue? → Rollback last deployment
```

### Memory Leak (Gradual Performance Degradation)

```bash
# Identify pod with growing memory
kubectl top pod -n product-app --sort-by=memory -A

# View memory usage over time
kubectl logs deployment/order-service -n product-app | grep -i 'memory\|heap'

# Check for finalizers blocking deletion
kubectl get all -n product-app -o json | jq '.items[] | select(.metadata.finalizers != null)'

# Trigger garbage collection (if supported by service)
curl -X POST http://order-service.product-app:8080/admin/gc

# Or restart the pod
kubectl delete pod <pod-name> -n product-app
```

---

## Troubleshooting

### Prometheus Not Scraping Metrics

```bash
# Check Prometheus targets
curl http://prometheus.prod:9090/api/v1/targets | jq '.data.activeTargets[] | {job, state, lastError}'

# Common issues:
# 1. ServiceMonitor not discovered → kubectl get servicemonitor -n product-app
# 2. Service ports mismatched → kubectl get svc order-service -n product-app -o yaml | grep -A5 ports
# 3. Network policy blocking → kubectl get networkpolicies -n product-app
# 4. RBAC issue → Check Prometheus service account permissions
```

### Alerts Not Firing

```bash
# Check if AlertManager is configured
curl http://prometheus.prod:9090/api/v1/alertmanagers

# Check AlertManager config
kubectl get configmap alertmanager-config -n observability-stack -o yaml

# Test alert manually
curl -X POST http://prometheus.prod:9090/api/v1/alerts \
  -d '[{"labels": {"alertname": "TestAlert"}}]'

# Check if alerts reached AlertManager
curl http://alertmanager.prod:9093/api/v2/alerts
```

### Loki Not Receiving Logs

```bash
# Check Promtail pod status
kubectl get pods -n observability-stack -l app=promtail

# Check Promtail logs
kubectl logs -f daemonset/promtail -n observability-stack

# Verify scrape config
kubectl get configmap promtail-config -n observability-stack -o yaml

# Query Loki for logs
curl 'http://loki.prod:3100/loki/api/v1/query_range?query={job="order-service"}' \
  | jq '.data.result[] | {stream: .stream, entries: (length)}'
```

### Tempo Not Receiving Traces

```bash
# Check OTEL Collector status
kubectl get deployment otel-collector -n observability-stack

# Check OTEL Collector logs
kubectl logs -f deployment/otel-collector -n observability-stack

# Verify services sending traces (check their logs)
kubectl logs deployment/order-service -n product-app | grep OTEL_EXPORTER

# Test trace export
curl -X POST http://otel-collector.observability-stack:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{"resourceSpans": []}'
```

---

## Maintenance

### Weekly Tasks

- [ ] Review Prometheus disk usage: `kubectl exec prometheus-0 -n observability-stack -- du -sh /prometheus`
- [ ] Check for failed pod events: `kubectl get events -n product-app --sort-by='.lastTimestamp'`
- [ ] Review CloudWatch logs for errors (production)
- [ ] Test backup restoration process

### Monthly Tasks

- [ ] Rotate secrets and credentials
- [ ] Review and update SLO targets based on actual performance
- [ ] Analyze slow queries and optimize
- [ ] Capacity planning review

### Cluster Upgrades

```bash
# Kubernetes patch update (non-breaking)
kind create cluster --image kindest/node:v1.30.1 --name product-app-dev-temp
# Migrate workloads
kind delete cluster --name product-app-dev

# Helm chart updates
helm repo update prometheus-community
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n observability-stack \
  -f helm-values/kube-prometheus-stack-values.yaml \
  --timeout 10m

# Application updates
# Use ArgoCD to manage: git push → GitHub Actions → GHCR → ArgoCD syncs
```

---

## Scaling

### Horizontal Scaling (add replicas)

```bash
# Manual scale
kubectl scale deployment order-service --replicas=5 -n product-app

# Or update Deployment in Git (ArgoCD will sync)
# k8s/services/order-service/deployment.yaml: spec.replicas: 5
git commit -am "Scale order-service to 5 replicas"
git push origin main
```

### Vertical Scaling (increase resources)

```bash
# Update resource requests in k8s/services/order-service/deployment.yaml
# resources:
#   requests:
#     cpu: 500m      # increased from 200m
#     memory: 512Mi  # increased from 256Mi

git commit -am "Increase order-service resource limits"
git push origin main
# ArgoCD syncs automatically
```

### Auto-Scaling (HPA)

Already configured in k8s/services/order-service/hpa.yaml:
- Min replicas: 2
- Max replicas: 5
- CPU target: 70%
- Memory target: 80%

---

## Disaster Recovery

### Backup Strategy

**Daily automated backups**:
- Prometheus data: S3 (retention: 15 days + 30d archive)
- Application state: Database backups (see DBA runbook)
- Configuration: Git (source of truth for all K8s manifests)

### Full Cluster Recovery (RTO: 4 hours, RPO: 1 hour)

```bash
# 1. Provision new EKS cluster (or Kind if dev)
eksctl create cluster --name product-app-prod-recovery ...

# 2. Deploy observability stack
bash scripts/deploy-all.sh --cluster prod

# 3. Deploy ArgoCD
helm upgrade --install argocd argo/argo-cd -n argocd -f helm-values/argocd-values.yaml

# 4. Sync all applications from Git
argocd app sync product-app-prod --all

# 5. Restore application data from backups
# (handled by individual service DRPs)

# 6. Verify all checks pass
bash scripts/validate-observability.sh
```

### Single Service Recovery (RTO: 30 minutes)

```bash
# 1. Delete failed deployment
kubectl delete deployment order-service -n product-app

# 2. ArgoCD syncs from Git (auto-restores)
argocd app sync product-app-prod

# Or manual restore
kubectl apply -k k8s/services/order-service

# 3. Wait for pods to ready
kubectl rollout status deployment/order-service -n product-app --timeout=5m
```

---

## Contact & Escalation

| Severity | Owner | Escalation |
|----------|-------|-----------|
| 🔴 Critical | On-call SRE | Escalate to Ops Manager after 15 min |
| 🟡 Warning | Platform Team | Create ticket, schedule within 24h |
| 🟢 Info | Team Lead | Schedule for next sprint |

**On-call Contact**: See PagerDuty schedule  
**Slack Channel**: #incidents (critical only), #alerts (all)  
**War Room**: jitsi.internal/incident

---

**Last Updated**: 2026-06-17  
**Version**: 1.0  
**Next Review**: 2026-07-17

