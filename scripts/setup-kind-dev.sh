#!/bin/bash
set -e

# ============================================================================
# setup-kind-dev.sh - Create local Kind development cluster
# ============================================================================
# Usage: bash scripts/setup-kind-dev.sh
# Creates: product-app-dev Kind cluster (3 nodes, v1.30.0)
# ============================================================================

CLUSTER_NAME="product-app-dev"
# Digest-pinned node image shipped with kind v0.32.0 (Kubernetes 1.36.1).
# Pinning the @sha256 digest guarantees the image matches the installed kind
# release and is reproducible. Update this when you upgrade kind.
KUBERNETES_VERSION="v1.36.1"
NODE_IMAGE="kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5"
NODES=3

echo "🚀 Creating Kind cluster: $CLUSTER_NAME"
echo "  Kubernetes Version: $KUBERNETES_VERSION"
echo "  Nodes: $NODES (1 control-plane, 2 workers)"
echo ""

# Check prerequisites
if ! command -v kind &> /dev/null; then
  echo "❌ kind not found."
  echo "   Linux:  curl -fsSLo /tmp/kind https://kind.sigs.k8s.io/dl/v0.32.0/kind-linux-amd64 && sudo install -m0755 /tmp/kind /usr/local/bin/kind"
  echo "   macOS:  brew install kind"
  exit 1
fi

if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl not found."
  echo "   Linux:  see https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/"
  echo "   macOS:  brew install kubectl"
  exit 1
fi

# Create Kind cluster with port mappings
cat > /tmp/kind-cluster.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4

name: $CLUSTER_NAME
kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        system-reserved: cpu=100m,memory=100Mi
        kube-reserved: cpu=100m,memory=100Mi

nodes:
  # Control plane
  - role: control-plane
    extraPortMappings:
      # Prometheus
      - containerPort: 30090
        hostPort: 9090
        listenAddress: "127.0.0.1"
      # Grafana
      - containerPort: 30300
        hostPort: 3000
        listenAddress: "127.0.0.1"
      # Loki
      - containerPort: 30100
        hostPort: 3100
        listenAddress: "127.0.0.1"
      # Tempo (gRPC OTLP)
      - containerPort: 30317
        hostPort: 4317
        listenAddress: "127.0.0.1"
      # Tempo (HTTP OTLP)
      - containerPort: 30318
        hostPort: 4318
        listenAddress: "127.0.0.1"
      # AlertManager
      - containerPort: 30093
        hostPort: 9093
        listenAddress: "127.0.0.1"
      # ArgoCD
      - containerPort: 30080
        hostPort: 8080
        listenAddress: "127.0.0.1"
      # API Gateway
      - containerPort: 30000
        hostPort: 8000
        listenAddress: "127.0.0.1"

  # Worker nodes
  - role: worker
  - role: worker
EOF

# Create the cluster
if kind get clusters | grep -q "^$CLUSTER_NAME$"; then
  echo "⚠️  Cluster '$CLUSTER_NAME' already exists"
  read -p "Delete and recreate? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kind delete cluster --name "$CLUSTER_NAME"
  else
    echo "✅ Using existing cluster"
    exit 0
  fi
fi

kind create cluster --config /tmp/kind-cluster.yaml --image "$NODE_IMAGE"

echo "✅ Kind cluster created"
echo ""

# Verify cluster
echo "🔍 Verifying cluster..."
kubectl cluster-info
kubectl get nodes

# Install metric-server (required for HPA)
echo ""
echo "📦 Installing metrics-server..."
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# kind's kubelet serving certs are self-signed and NOT signed by the cluster CA,
# so metrics-server's TLS verification fails and it never becomes Ready. The
# supported workaround for local kind clusters is --kubelet-insecure-tls.
# (Do NOT use this flag on real clusters with proper kubelet serving certs.)
echo "🔧 Patching metrics-server for kind (--kubelet-insecure-tls)..."
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

# Wait for metrics-server
echo "⏳ Waiting for metrics-server..."
kubectl -n kube-system rollout status deployment/metrics-server --timeout=120s || true

echo ""
echo "✅ Kind cluster '$CLUSTER_NAME' ready!"
echo ""
echo "📝 Next steps:"
echo "   1. Configure GitHub Action secrets: DOCKERHUB_USERNAME and DOCKERHUB_TOKEN"
echo "   2. bash scripts/deploy-all.sh --cluster dev"
echo ""
echo "🔗 Cluster info:"
echo "   - API Server: $(kubectl cluster-info | grep -i 'control plane' | awk '{print $NF}')"
echo "   - Nodes: $(kubectl get nodes -o name | wc -l)"

