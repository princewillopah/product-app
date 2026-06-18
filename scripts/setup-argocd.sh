#!/bin/bash
set -euo pipefail

# Install ArgoCD and bootstrap product-app GitOps resources.
# Optional private repo registration:
#   export GITHUB_REPO_URL="https://github.com/<owner>/<repo>.git"
#   export GITHUB_USERNAME="<github-username>"
#   export GITHUB_PAT="<github-personal-access-token>"
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
kubectl apply -k "$ROOT_DIR/k8s/argocd"
kubectl apply -f "$ROOT_DIR/argocd-apps/applicationset-multi-cluster.yaml"

if [[ -n "${GITHUB_REPO_URL:-}" && -n "${GITHUB_USERNAME:-}" && -n "${GITHUB_PAT:-}" ]]; then
  echo "🔐 Registering private GitHub repository credentials in ArgoCD..."
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: repo-private-github
  namespace: ${NAMESPACE}
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: ${GITHUB_REPO_URL}
  username: ${GITHUB_USERNAME}
  password: ${GITHUB_PAT}
EOF
  echo "✅ ArgoCD repository credentials applied"
else
  echo "ℹ️  Private GitHub repo credentials not provided to script."
  echo "   If your repo is private, set GITHUB_REPO_URL, GITHUB_USERNAME, and GITHUB_PAT before running this script."
fi

echo "✅ ArgoCD bootstrap resources applied"

echo "🔑 Get ArgoCD admin password with:"
echo "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d && echo"


###############################################################
# How to use the new private-repo support:
# 1. Set the following environment variables:
#    export GITHUB_REPO_URL="<your_github_repo_url>"
#    export GITHUB_USERNAME="<your_github_username>"
#    export GITHUB_PAT="<your_github_personal_access_token>"
# 2. Run this script: bash scripts/setup-argocd.sh
# 3. This will create a Kubernetes secret in the argocd namespace with the provided credentials, and ArgoCD will use it to access the private repo.
# 4. If you need to update the credentials later, just change the env vars and re-run the script - it will apply the updated secret.
# 5. Make sure your GitHub PAT has at least read:packages scope if you're pulling images from GHCR in your Kubernetes manifests.
## Verify ArgoCD repo secret exists:
# if [[ -n "${GITHUB_REPO_URL:-}" ]]; then
#   if kubectl -n "$NAMESPACE" get secret repo-private-github >/dev/null 2>&1; then
#     echo "✅ ArgoCD repository secret 'repo-private-github' exists"
#   else
#     echo "❌ ArgoCD repository secret 'repo-private-github' not found"
#     exit 1
#   fi
# fi
###############################################################