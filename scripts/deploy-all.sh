#!/bin/bash
set -e

# ============================================================================
# deploy-all.sh - Full production stack deployment
# ============================================================================
# Usage: bash scripts/deploy-all.sh --cluster [dev|staging|prod]
# Deploys:
#   - kube-prometheus-stack (Helm) with Prometheus Operator CRDs
#   - OpenTelemetry Collector
#   - Application services (order, analytics, product, api-gateway)
#   - ArgoCD for GitOps
# ============================================================================

CLUSTER="${1:---cluster}"
CLUSTER_NAME="dev"

if [[ "$CLUSTER" == "--cluster" ]]; then
  CLUSTER_NAME="$2"
fi

CLUSTER_NAME="${CLUSTER_NAME:-dev}"

echo "🚀 Deploying product-app to cluster: $CLUSTER_NAME"
echo ""

# Validate prerequisites
for cmd in kubectl helm; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "❌ $cmd not found. Install required tools."
    exit 1
  fi
done

# Change to script directory
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# ============================================================================
# STEP 1: Create Namespaces
# ============================================================================
echo "📦 Step 1/7: Creating namespaces..."
kubectl apply -f k8s/namespaces.yaml

echo "✅ Namespaces created"
sleep 2

# ============================================================================
# STEP 2: Add Helm Repositories
# ============================================================================
echo ""
echo "📦 Step 2/7: Adding Helm repositories..."

echo "  - prometheus-community (kube-prometheus-stack)"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update prometheus-community

echo "  - argoproj (ArgoCD)"
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update argo

echo "✅ Helm repositories added"
sleep 2

# ============================================================================
# STEP 3: Deploy kube-prometheus-stack via Helm
# ============================================================================
echo ""
echo "📦 Step 3/7: Deploying kube-prometheus-stack (Prometheus Operator)..."
echo "  This includes: Prometheus, AlertManager, Grafana, node-exporter, kube-state-metrics"

helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace observability-stack \
  --version 60.0.0 \
  --values helm-values/kube-prometheus-stack-values.yaml \
  --wait \
  --timeout 10m

echo "✅ kube-prometheus-stack deployed"
sleep 2

# ============================================================================
# STEP 4: Deploy PrometheusRule CRDs (Alert Rules)
# ============================================================================
echo ""
echo "📦 Step 4/7: Deploying PrometheusRule CRDs (production alerts)..."

kubectl apply -f k8s/observability/prometheus-rule.yaml

echo "✅ PrometheusRule CRDs deployed (SLO burn-rate alerts configured)"
sleep 2

# ============================================================================
# STEP 5: Deploy ServiceMonitor CRDs (Dynamic Scrape Config)
# ============================================================================
echo ""
echo "📦 Step 5/7: Deploying ServiceMonitor CRDs (dynamic scrape config)..."

kubectl apply -f k8s/observability/service-monitor.yaml

echo "✅ ServiceMonitor CRDs deployed"
sleep 2

# ============================================================================
# STEP 6: Deploy OpenTelemetry Collector
# ============================================================================
echo ""
echo "📦 Step 6/7: Deploying OpenTelemetry Collector (centralized telemetry)..."

kubectl apply -f k8s/observability/otel-collector.yaml

# Wait for OTEL Collector to be ready
echo "⏳ Waiting for OpenTelemetry Collector deployment..."
kubectl rollout status deployment/otel-collector -n observability-stack --timeout=5m

echo "✅ OpenTelemetry Collector deployed"
sleep 2

# ============================================================================
# STEP 7: Deploy Application Services (with OTEL instrumentation)
# ============================================================================
echo ""
echo "📦 Step 7/7: Deploying application services..."
echo "  - order-service (Go + OTEL)"
echo "  - analytics-service (Python + OTEL)"
echo "  - product-service (Java + OTEL)"
echo "  - api-gateway (Node.js)"

echo "⏳ Applying service manifests..."
kubectl apply -k k8s/services

echo "⏳ Waiting for service deployments..."
kubectl rollout status deployment/order-service -n product-app --timeout=5m
kubectl rollout status deployment/analytics-service -n product-app --timeout=5m
kubectl rollout status deployment/product-service -n product-app --timeout=5m
kubectl rollout status deployment/api-gateway -n product-app --timeout=5m

echo "✅ Application services configured"
sleep 2

# ============================================================================
# Wait for Prometheus & Grafana to be ready
# ============================================================================
echo ""
echo "⏳ Waiting for Prometheus pods..."
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=prometheus -n observability-stack --timeout=5m

echo "⏳ Waiting for Grafana deployment..."
kubectl rollout status deployment/kube-prometheus-stack-grafana -n observability-stack --timeout=5m

# ============================================================================
# Verify Deployment
# ============================================================================
echo ""
echo "🔍 Verifying deployment..."
echo ""

echo "Observability Stack Pods:"
kubectl get pods -n observability-stack --no-headers | head -10

echo ""
echo "Application Namespace:"
kubectl get pods -n product-app --no-headers || echo "  (no pods deployed yet - deploy services manually)"

# ============================================================================
# Port Forwarding Setup (Optional)
# ============================================================================
echo ""
echo "🔗 Setting up port forwarding (background)..."

# Kill existing port-forwards
pkill -f "kubectl port-forward" || true
sleep 1

# Start new port-forwards
kubectl port-forward -n observability-stack svc/kube-prometheus-stack-prometheus 9090:9090 &
kubectl port-forward -n observability-stack svc/kube-prometheus-stack-grafana 3000:80 &
kubectl port-forward -n observability-stack svc/otel-collector 4317:4317 &
kubectl port-forward -n observability-stack svc/kube-prometheus-stack-alertmanager 9093:9093 &

sleep 2

# ============================================================================
# Output URLs & Credentials
# ============================================================================
echo ""
echo "================================================================"
echo "✅ Deployment Complete!"
echo "================================================================"
echo ""
echo "📊 Access URLs:"
echo "   Prometheus:  http://127.0.0.1:9090"
echo "   Grafana:     http://127.0.0.1:3000"
echo "   AlertManager: http://127.0.0.1:9093"
echo "   OTEL Collector: http://127.0.0.1:4317 (gRPC)"
echo ""
echo "🔑 Default Credentials:"
echo "   Grafana Admin Username: admin"
echo "   Grafana Admin Password: prom-operator"
echo ""
echo "📝 Next Steps:"
echo "   1. Re-apply application services if needed:"
echo "      kubectl apply -k k8s/services"
echo ""
echo "   2. Deploy ArgoCD for GitOps:"
echo "      bash scripts/setup-argocd.sh"
echo ""
echo "   3. Validate observability:"
echo "      bash scripts/validate-observability.sh"
echo ""
echo "   4. Check Prometheus targets:"
echo "      curl http://127.0.0.1:9090/api/v1/targets"
echo ""
echo "   5. Check alerts loaded:"
echo "      curl http://127.0.0.1:9090/api/v1/rules"
echo ""
echo "📚 Documentation:"
echo "   - README.md (architecture overview)"
echo "   - helm-values/kube-prometheus-stack-values.yaml (Prometheus config)"
echo "   - k8s/observability/prometheus-rule.yaml (alert rules)"
echo "   - k8s/observability/service-monitor.yaml (scrape config)"
echo ""

