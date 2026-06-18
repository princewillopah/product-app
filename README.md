# product-app: Production-Grade Kubernetes + Observability Stack

**Status**: Production-ready  
**Architecture**: Multi-cluster ArgoCD + Helm + kube-prometheus-stack  
**Container Registry**: GitHub Container Registry (GHCR)  
**CI/CD**: GitHub Actions (build matrix)  

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GitHub Repository (Source of Truth)             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ .github/workflows/                                           │ │
│  │ ├── build-images.yml    (multi-service build → GHCR)        │ │
│  │ └── deploy-argocd.yml   (sync ArgoCD on manifest change)   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ images/{order,analytics,product}-service/Dockerfile         │ │
│  │ k8s/{services,observability,argocd}/**/*.yaml              │ │
│  │ helm-values/{prometheus,alertmanager,grafana}-values.yaml  │ │
│  │ argocd-apps/applications.yaml                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
         ↓ (on commit)
         GitHub Actions Workflow
         ├─ Build multi-service Docker images (matrix: order, analytics, product)
         ├─ Push to ghcr.io/{owner}/product-app/{service}:{git-sha}
         └─ Trigger ArgoCD sync (webhook)
                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    GitHub Container Registry                        │
│  ghcr.io/owner/product-app/order-service:abc123                    │
│  ghcr.io/owner/product-app/analytics-service:abc123               │
│  ghcr.io/owner/product-app/product-service:abc123                │
└─────────────────────────────────────────────────────────────────────┘
         ↓ (ArgoCD pulls and deploys)
┌──────────────────────────────────────────────────────────────────────────┐
│              Multi-Cluster Kubernetes Deployments                        │
│                                                                          │
│  ┌────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐ │
│  │   DEV Cluster      │  │  STAGING Cluster    │  │   PROD Cluster   │ │
│  │ (Kind/minikube)    │  │  (Kind/EKS)         │  │  (AWS EKS)       │ │
│  │                    │  │                     │  │                  │ │
│  │ ┌────────────────┐ │  │ ┌─────────────────┐│  │┌─────────────────┐│ │
│  │ │ order-service  │ │  │ │order-service    ││  ││order-service    ││ │
│  │ │analytics-sv    │ │  │ │analytics-service││  ││analytics-service││ │
│  │ │product-service │ │  │ │product-service  ││  ││product-service  ││ │
│  │ │api-gateway     │ │  │ │api-gateway      ││  ││api-gateway      ││ │
│  │ │                │ │  │ │                 ││  ││                 ││ │
│  │ │[kube-prom-stack]│ │  │ │[kube-prom-stack]││  ││[kube-prom-stack]││ │
│  │ │├─ Prometheus   │ │  │ │├─ Prometheus    ││  ││├─ Prometheus    ││ │
│  │ │├─ AlertManager │ │  │ │├─ AlertManager  ││  ││├─ AlertManager  ││ │
│  │ │├─ Grafana      │ │  │ │├─ Grafana       ││  ││├─ Grafana       ││ │
│  │ │└─ Loki         │ │  │ │└─ Loki          ││  ││└─ Loki          ││ │
│  │ │                │ │  │ │                 ││  ││                 ││ │
│  │ │[OpenTelemetry] │ │  │ │[OpenTelemetry]  ││  ││[OpenTelemetry]  ││ │
│  │ │ Collector      │ │  │ │ Collector       ││  ││ Collector       ││ │
│  │ │ Tempo          │ │  │ │ Tempo           ││  ││ Tempo           ││ │
│  │ └────────────────┘ │  │ └─────────────────┘│  │└─────────────────┘│ │
│  │                    │  │                     │  │                  │ │
│  │ ArgoCD             │  │ ArgoCD              │  │ ArgoCD           │ │
│  └────────────────────┘  │ (watches this repo) │  │ (watches this repo)│ │
│                          └─────────────────────┘  └──────────────────┘ │
│                                                                          │
│  All clusters auto-sync manifests from this GitHub repo               │
│  Image updates trigger automatic ArgoCD rollouts                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Directory Structure

```
product-app/
├── .github/workflows/
│   ├── build-images.yml              # CI/CD: Build & push to GHCR (matrix)
│   └── deploy-argocd.yml             # Trigger ArgoCD sync
│
├── images/                           # Dockerfile for each service
│   ├── order-service/
│   │   ├── Dockerfile
│   │   └── main.go (+ src code)
│   ├── analytics-service/
│   │   ├── Dockerfile
│   │   └── main.py (+ src code)
│   └── product-service/
│       ├── Dockerfile
│       └── pom.xml (+ src code)
│
├── k8s/
│   ├── observability/                # kube-prometheus-stack + Tempo + Loki
│   │   ├── namespace.yaml
│   │   ├── helm-release.yaml         # HelmRelease for kube-prom-stack
│   │   ├── prometheus-rule.yaml      # PrometheusRule CRDs
│   │   ├── service-monitor.yaml      # ServiceMonitor CRDs (scrape config)
│   │   ├── pod-monitor.yaml          # PodMonitor for system metrics
│   │   ├── alert-slack-receiver.yaml # Real Slack integration
│   │   ├── tempo.yaml                # Tempo deployment
│   │   ├── loki.yaml                 # Loki + Promtail
│   │   └── otel-collector.yaml       # OpenTelemetry Collector
│   │
│   ├── services/                     # Application deployments
│   │   ├── kustomization.yaml
│   │   ├── order-service/
│   │   │   ├── kustomization.yaml
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── serviceaccount.yaml
│   │   │   ├── role.yaml
│   │   │   ├── rolebinding.yaml
│   │   │   ├── configmap.yaml
│   │   │   ├── hpa.yaml
│   │   │   └── pdb.yaml
│   │   ├── analytics-service/        # same split pattern per resource
│   │   ├── product-service/          # same split pattern per resource
│   │   └── api-gateway/              # same split pattern per resource
│   │
│   └── argocd/
│       ├── namespace.yaml
│       ├── argocd-helm-release.yaml  # ArgoCD deployed via Helm
│       ├── argocd-config.yaml        # Clusters, repositories, settings
│       ├── app-project.yaml          # AppProject for RBAC/policies
│       └── cluster-secrets.yaml      # Multi-cluster connection secrets
│
├── helm-values/
│   ├── kube-prometheus-stack-values.yaml  # Prometheus Operator settings
│   ├── alertmanager-values.yaml           # AlertManager config
│   ├── grafana-values.yaml                # Grafana dashboards + datasources
│   ├── argocd-values.yaml                 # ArgoCD Helm values
│   ├── otel-collector-values.yaml         # OpenTelemetry Collector config
│   └── loki-values.yaml                   # Loki storage + scrape config
│
├── argocd-apps/
│   ├── application-order-service.yaml    # ArgoCD Application: order-service
│   ├── application-analytics-service.yaml # ArgoCD Application: analytics
│   ├── application-product-service.yaml  # ArgoCD Application: product
│   ├── application-observability.yaml    # ArgoCD Application: observability
│   └── applicationset-multi-cluster.yaml # ApplicationSet for dev/staging/prod
│
├── scripts/
│   ├── setup-kind-dev.sh             # Create local Kind dev cluster
│   ├── setup-argocd.sh               # Bootstrap ArgoCD + connect clusters
│   ├── setup-ghcr-secret.sh          # Configure GHCR credentials
│   ├── deploy-all.sh                 # Full deployment script
│   └── validate-observability.sh     # Smoke tests for metrics/logs/traces
│
└── README.md (this file)
```

---

## 🚀 Quick Start (Dev Environment)

### 1. **Prerequisites**
```bash
# Install required tools
brew install kind kubectl helm argocd
# On Linux: use apt/snap instead of brew

# Verify installations
kind version && kubectl version --client && helm version && argocd version
```

### 2. **Setup Local Dev Cluster**
```bash
cd /home/princewillopah/DevOps/product-app
bash scripts/setup-kind-dev.sh
# Creates: product-app-dev cluster (3 nodes, Kind v1.30)
```

### 3. **Configure GitHub Container Registry Authentication**
```bash
# Create GitHub Personal Access Token (PAT) with `read:packages` scope
# See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

bash scripts/setup-ghcr-secret.sh \
  --github-username YOUR_USERNAME \
  --github-token YOUR_PAT
# Creates: imagePullSecret in k8s/services for GHCR auth
```

### 4. **Deploy Full Stack**
```bash
bash scripts/deploy-all.sh --cluster dev
# Deploys:
# - observability-stack namespace (kube-prometheus-stack, Tempo, Loki, OTEL Collector)
# - product-app namespace (order-service, analytics-service, product-service, api-gateway)
# - ArgoCD with multi-cluster config
```

### 5. **Access UIs**
```bash
# ArgoCD (port-forward automatically started)
kubectl port-forward -n argocd svc/argocd-server 8080:443 &
# → https://127.0.0.1:8080
# Password: (printed by deploy-all.sh)

# Prometheus
kubectl port-forward -n observability-stack svc/prometheus 9090:9090 &
# → http://127.0.0.1:9090

# Grafana
kubectl port-forward -n observability-stack svc/grafana 3000:80 &
# → http://127.0.0.1:3000 (admin/prom-operator)

# Tempo (traces)
kubectl port-forward -n observability-stack svc/tempo 4317:4317 &

# Loki (logs)
kubectl port-forward -n observability-stack svc/loki 3100:3100 &
```

---

## 📋 Production Standards Applied

### ✅ Container Images
- **Build**: GitHub Actions matrix (3 services in parallel)
- **Registry**: GitHub Container Registry (ghcr.io)
- **Tagging**: `latest` + git-sha for traceability
- **Auth**: imagePullSecret with GHCR token
- **Security**: Multi-stage Dockerfile, minimal base images

### ✅ Kubernetes Deployment
- **Manifests**: Helm charts (values-driven, not static YAML)
- **Operators**: kube-prometheus-stack (Prometheus Operator)
- **CRDs**: ServiceMonitor, PodMonitor, PrometheusRule, AlertmanagerConfig
- **Namespaces**: observability-stack, product-app (isolated)
- **RBAC**: Role-based access control per namespace
- **PVC**: Persistent volumes for Prometheus, Loki data

### ✅ Observability
**Metrics**
- Prometheus via kube-prometheus-stack Operator
- ServiceMonitor per service (dynamic scrape config)
- SLO burn-rate alerts (30-day budget, 5-min/1-hour/6-hour/30-day windows)
- Custom PrometheusRule CRDs

**Logs**
- Loki (3-day retention by default)
- Promtail DaemonSet with static + dynamic scrape
- JSON structured logging from all services

**Traces**
- OpenTelemetry Collector (centralized)
- Tempo backend (gRPC/HTTP OTLP receivers)
- W3C Trace Context propagation
- Service instrumentationJavaScript: Micrometer → Prometheus + distributed traces

**Alerting**
- AlertManager with PrometheusRule CRDs
- Real receivers: Slack webhook (production), PagerDuty (optional)
- Inhibition rules: critical suppresses warning
- SLO-based: error rate, latency P95, availability burn-rate

### ✅ GitOps (ArgoCD)
- **Source of Truth**: This GitHub repository
- **Multi-Cluster**: dev/staging/prod with separate clusters
- **Auto-Sync**: Automatic rollout on manifest change
- **ApplicationSet**: Template-based app deployment across clusters
- **ImageUpdater**: Auto-update image tags in manifests (optional)
- **Notifications**: ArgoCD → Slack on sync events

### ✅ CI/CD Pipeline
- **Trigger**: Git push to main branch
- **Build Matrix**: 3 services built in parallel
- **Registry**: Push to ghcr.io with git-sha tag
- **Deployment**: ArgoCD webhook auto-syncs on image update
- **Validation**: Smoke tests (metrics endpoint, logs, trace export)

### ✅ Service Instrumentation
**Go (order-service)**
- OpenTelemetry v1.21.0
- gRPC OTLP export to Tempo
- W3C Trace Context propagation
- Prometheus metrics via promhttp

**Python (analytics-service)**
- OpenTelemetry v1.21.0 + auto-instrumentation
- FastAPI instrumentation
- SQLAlchemy instrumentation
- JSON structured logging via structlog
- gRPC OTLP export to Tempo

**Java (product-service)**
- Micrometer Prometheus metrics
- OpenTelemetry OTLP instrumentation (todo: full integration)
- Spring Boot 3.2.0 tracing support

---

## 🔄 Deployment Workflow

### Local Development (Kind)
```
1. Code changes → Git push → GitHub
2. GitHub Actions workflow triggered
3. Build images (3 services in parallel)
4. Push to ghcr.io/owner/product-app/{service}:{git-sha}
5. Create pull request with updated k8s manifests
6. Merge PR → ArgoCD syncs to dev cluster
7. Validate metrics/logs/traces via port-forwards
```

### Staging/Production
```
1. Same build + push as dev
2. Merge to main branch
3. ArgoCD ApplicationSet deploys to staging cluster
4. Smoke tests run (observability validation script)
5. Manual approval in ArgoCD → Deploy to prod
6. Monitor SLO burn-rate, alert routing via Slack/PagerDuty
```

---

## 🛠️ Customization Guide

### Scaling Services
**Edit**: [argocd-apps/applicationset-multi-cluster.yaml](argocd-apps/applicationset-multi-cluster.yaml)  
Add cluster generator entries for new environments:
```yaml
clusters:
  - name: production
    url: https://prod-eks-cluster:6443  # EKS endpoint
    clusterSecret: prod-cluster-secret  # ArgoCD cluster registration
```

### Changing Alert Thresholds
**Edit**: [k8s/observability/prometheus-rule.yaml](k8s/observability/prometheus-rule.yaml)  
Example: Change HighErrorRate threshold from 5% to 3%
```yaml
- alert: HighErrorRate
  expr: |
    rate(http_requests_total{status=~"5.."}[5m]) / 
    rate(http_requests_total[5m]) > 0.03  # Changed from 0.05
```
Commit → ArgoCD syncs automatically.

### Adding New Service
1. Create `images/new-service/Dockerfile`
2. Add matrix entry in `.github/workflows/build-images.yml`
3. Create `k8s/services/new-service.yaml` (Deployment + Service)
4. Create `argocd-apps/application-new-service.yaml`
5. Add ServiceMonitor in `k8s/observability/service-monitor.yaml`
6. Commit → GitHub Actions build + ArgoCD deploy

---

## 📊 Monitoring & Alerting

### Built-in Alerts
| Alert | Severity | Condition | Action |
|-------|----------|-----------|--------|
| `ServiceDown` | critical | Target down 30s | Page on-call (PagerDuty) |
| `HighErrorRate` | critical | 5xx > 5% for 1m | Alert Slack #incidents |
| `HighLatencyP95` | warning | P95 > 1000ms for 2m | Slack notification |
| `SLOErrorBurnRate` | critical | 30-day error budget exhausted in <30 days | Page + escalate |
| `SLOLatencyBurnRate` | warning | Latency budget burn at 2x rate | Slack warning |

See [k8s/observability/prometheus-rule.yaml](k8s/observability/prometheus-rule.yaml) for full definitions.

### SLO Configuration
**Error Budget**: 30-day window, 99.9% availability (0.1% error budget)  
**Latency SLO**: P95 < 1s for 95% of requests  
**Availability**: 99.9% uptime (4.38 hours downtime per month)

Burn-rate windows:
- **5-min**: 1000x burn rate → page immediately
- **1-hour**: 100x burn rate → alert + escalate
- **6-hour**: 10x burn rate → create incident ticket
- **30-day**: 1x burn rate → track for next sprint

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [RUNBOOK.md](docs/RUNBOOK.md) | Incident response procedures |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues + fixes |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Detailed design decisions |
| [CI-CD-PIPELINE.md](docs/CI-CD-PIPELINE.md) | GitHub Actions workflow details |
| [MULTI-CLUSTER.md](docs/MULTI-CLUSTER.md) | ArgoCD cluster management |
| [OTEL-INSTRUMENTATION.md](docs/OTEL-INSTRUMENTATION.md) | Adding tracing to new services |

---

## ❓ FAQ

**Q: How do I deploy to production?**  
A: Merge code to main branch → GitHub Actions build + push → ArgoCD syncs to prod cluster. Manual approval available in ArgoCD for prod deployments.

**Q: How do I update Prometheus scrape config without redeploying?**  
A: Edit `k8s/observability/service-monitor.yaml` → Commit → ArgoCD syncs → Prometheus Operator reconciles ServiceMonitor → scrape config auto-updates.

**Q: Can I deploy to multiple clusters at once?**  
A: Yes. ApplicationSet in `argocd-apps/applicationset-multi-cluster.yaml` deploys to all registered clusters with environment-specific overlays.

**Q: What if ArgoCD goes down?**  
A: Core applications continue running. ArgoCD reconciliation pauses. On recovery, ArgoCD re-syncs to match Git state automatically.

---

## 🔐 Security Considerations

- **Container Images**: Signed with Cosign (optional, in CI/CD)
- **GHCR Access**: GitHub PAT with read-only scope for pull, CI token for push
- **K8s Secrets**: Sealed Secrets (optional) for sensitive data
- **RBAC**: AppProject restricts ArgoCD to specific namespaces/resources
- **Network Policies**: (Optional) restrict inter-pod communication
- **Pod Security**: Pod Security Standards (restricted) enforced by default

---

## 🎯 Next Steps

1. ✅ Fork/clone this repository
2. ✅ Configure GitHub PAT for GHCR access
3. ✅ Run `scripts/setup-kind-dev.sh` for local dev environment
4. ✅ Run `scripts/deploy-all.sh --cluster dev` to deploy
5. ✅ Access ArgoCD UI and verify app syncing
6. ✅ Monitor metrics/logs/traces in Grafana
7. ✅ Test alert routing (manual trigger in Prometheus)
8. ✅ Deploy to staging → Validate → Promote to prod

---

**Questions?** See [RUNBOOK.md](docs/RUNBOOK.md) or contact the observability team.  
**Last Updated**: 2026-06-17  
**Status**: Production-ready

