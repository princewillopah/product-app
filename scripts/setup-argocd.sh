#!/bin/bash
set -euo pipefail

# Install ArgoCD and bootstrap product-app GitOps resources.
# The repo (https://github.com/princewillopah/product-app.git) is PUBLIC, so
# ArgoCD needs NO repository credentials — it clones over anonymous HTTPS.
#   bash scripts/setup-argocd.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMESPACE="argocd"

echo "🚀 Installing ArgoCD via Helm..."

if ! command -v kubectl >/dev/null 2>&1; then
  echo "❌ kubectl is required"
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "❌ helm is required"
  exit 1
fi

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

helm repo add argo https://argoproj.github.io/argo-helm >/dev/null 2>&1 || true
helm repo update argo >/dev/null

helm upgrade --install argocd argo/argo-cd \
  --namespace "$NAMESPACE" \
  --set configs.params."server\.insecure"=true \
  --wait \
  --timeout 10m

echo "✅ ArgoCD installed"

echo "📦 Applying ArgoCD project and ApplicationSets..."
kubectl apply -f "$ROOT_DIR/k8s/argocd/appproject.yaml"
kubectl apply -f "$ROOT_DIR/argocd-apps/applicationset-multi-cluster.yaml"

echo "✅ ArgoCD bootstrap resources applied"

echo "🔑 Get ArgoCD admin password with:"
echo "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d && echo"
