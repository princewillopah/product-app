#!/bin/bash
set -e

# ============================================================================
# setup-ghcr-secret.sh - Configure GitHub Container Registry authentication
# ============================================================================
# Usage: bash scripts/setup-ghcr-secret.sh --github-username YOUR_USERNAME --github-token YOUR_PAT
# Creates: imagePullSecret in k8s/services for GHCR auth
# Reason: By default K8s can't pull private images from ghcr.io. 
#   You get ErrImagePull or unauthorized. This script gives K8s your GitHub PAT so it can authenticate.
#   GitHub PAT scope needed: At minimum read:packages. 
#   If your GHCR image is private, you need that scope when you generate the token at GitHub → Settings → Developer settings → Personal access tokens
# ============================================================================
# This script sets up credentials for pulling Docker images from GitHub Container Registry ghcr.io into your Kubernetes cluster.
# It's the first half of a setup script - it only collects/validates the creds, doesn't create the K8s secret yet.
NAMESPACE="product-app"

echo "🔐 Setting up GitHub Container Registry (GHCR) authentication"
echo ""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --github-username)
      GITHUB_USERNAME="$2"
      shift 2
      ;;
    --github-token)
      GITHUB_TOKEN="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate inputs
if [[ -z "$GITHUB_USERNAME" ]]; then
  read -p "GitHub username: " GITHUB_USERNAME
fi

if [[ -z "$GITHUB_TOKEN" ]]; then
  read -sp "GitHub PAT (will not echo): " GITHUB_TOKEN
  echo
fi

if [[ -z "$GITHUB_USERNAME" ]] || [[ -z "$GITHUB_TOKEN" ]]; then
  echo "❌ GitHub username and PAT required"
  exit 1
fi

echo ""
echo "✓ GitHub username: $GITHUB_USERNAME"
echo "✓ GitHub token: (provided)"
echo ""

# Create namespace if not exists
echo "📦 Creating namespace '$NAMESPACE'..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Create docker-registry secret
# This creates a K8s docker-registry secret named ghcr-secret, then patches the default serviceaccount so pods in product-app namespace can pull from GHCR automatically.
echo "🔑 Creating docker-registry secret..."
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GITHUB_USERNAME" \
  --docker-password="$GITHUB_TOKEN" \
  --docker-email="noreply@github.com" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

# Patch service account to use the secret
echo "🔗 Patching service account..."
kubectl patch serviceaccount default -n "$NAMESPACE" -p '{"imagePullSecrets": [{"name": "ghcr-secret"}]}' || true

# Also create in observability-stack namespace
echo "📦 Creating namespace 'observability-stack'..."
kubectl create namespace "observability-stack" --dry-run=client -o yaml | kubectl apply -f -

echo "🔑 Creating docker-registry secret in observability-stack..."
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GITHUB_USERNAME" \
  --docker-password="$GITHUB_TOKEN" \
  --docker-email="noreply@github.com" \
  --namespace="observability-stack" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "🔗 Patching service account in observability-stack..."
kubectl patch serviceaccount default -n "observability-stack" -p '{"imagePullSecrets": [{"name": "ghcr-secret"}]}' || true

# Create ArgoCD namespace
echo "📦 Creating namespace 'argocd'..."
kubectl create namespace "argocd" --dry-run=client -o yaml | kubectl apply -f -

echo "🔑 Creating docker-registry secret in argocd..."
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GITHUB_USERNAME" \
  --docker-password="$GITHUB_TOKEN" \
  --docker-email="noreply@github.com" \
  --namespace="argocd" \
  --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "✅ GHCR authentication configured!"
echo ""
echo "📝 GitHub Actions Setup:"
echo "   1. Go to: https://github.com/YOUR_ORG/product-app/settings/secrets/actions"
echo "   2. Add secrets:"
echo "      - GHCR_USERNAME: $GITHUB_USERNAME"
echo "      - GHCR_TOKEN: (your PAT with 'read:packages' scope)"
echo ""

