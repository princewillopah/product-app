#!/usr/bin/env bash
# ============================================================================
# seal-repo-credential.sh
# ----------------------------------------------------------------------------
# ONE job: encrypt an existing SSH deploy key into a SealedSecret that ArgoCD
# uses to clone the PRIVATE repo. Nothing else.
#
# It does NOT generate keys, does NOT talk to GitHub, does NOT apply to the
# cluster. Those are separate steps in the runbook below — kept separate
# ON PURPOSE so each step is obvious and re-runnable on its own.
#
# ----------------------------------------------------------------------------
# FULL RUNBOOK (do these in order — only step 3 is this script)
# ----------------------------------------------------------------------------
# [HUMAN · once] 1. Generate a read-only deploy key (stays on YOUR machine):
#        ssh-keygen -t ed25519 -N "" -C argocd-readonly -f ./argocd_deploy_key
#
# [HUMAN · once] 2. Add the PUBLIC half to GitHub as a deploy key:
#        repo ▸ Settings ▸ Deploy keys ▸ Add deploy key
#        Title: argocd-readonly   |   paste contents of argocd_deploy_key.pub
#        "Allow write access": LEAVE UNCHECKED  (ArgoCD only reads)
#
# [TOOLING]      3. Seal the PRIVATE half into an encrypted file (THIS SCRIPT):
#        ./scripts/seal-repo-credential.sh ./argocd_deploy_key
#
# [HUMAN]        4. Destroy the plaintext key — it is no longer needed:
#        shred -u ./argocd_deploy_key   (or: rm -P / srm on macOS)
#
# [GITOPS]       5. Commit the ENCRYPTED file (safe: only the cluster decrypts):
#        git add k8s/argocd/sealed-repo-credential.yaml k8s/argocd/kustomization.yaml
#        git commit -m "feat(argocd): private-repo credential via SealedSecret"
#        git push
#
# [BOOTSTRAP · once] 6. Apply the argocd bootstrap layer DIRECTLY. ArgoCD cannot
#     sync the very credential it needs to read the repo (chicken-and-egg), so
#     this first apply is manual:
#        kubectl apply -k k8s/argocd
# ============================================================================
set -euo pipefail

# --- config: the only values you'd ever change -----------------------------
REPO_SSH_URL="git@github.com:princewillopah/product-app.git"
SECRET_NAME="repo-product-app"
SECRET_NS="argocd"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

# --- input: the private deploy key you generated in step 1 -----------------
KEY_FILE="${1:-}"
[[ -n "$KEY_FILE" ]] || { echo "usage: $0 <path-to-private-deploy-key>"; exit 1; }
[[ -f "$KEY_FILE" ]] || { echo "ERROR: key file not found: $KEY_FILE"; exit 1; }

# --- prerequisites ---------------------------------------------------------
command -v kubeseal >/dev/null || { echo "ERROR: kubeseal not in PATH"; exit 1; }
command -v kubectl  >/dev/null || { echo "ERROR: kubectl not in PATH";  exit 1; }
kubectl get deploy "$CONTROLLER_NAME" -n "$CONTROLLER_NS" >/dev/null 2>&1 \
  || { echo "ERROR: sealed-secrets controller not found in '$CONTROLLER_NS'"; exit 1; }

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/k8s/argocd"
OUT_FILE="${OUT_DIR}/sealed-repo-credential.yaml"
KFILE="${OUT_DIR}/kustomization.yaml"
mkdir -p "$OUT_DIR"

# --- the transform: plaintext Secret -> labelled -> sealed -----------------
# The whole chain runs in a pipe; the plaintext Secret never touches disk.
#   1) kubectl create secret --dry-run  -> render a normal Secret as YAML
#   2) kubectl label --local             -> add the label ArgoCD looks for
#   3) kubeseal                          -> encrypt with the controller's cert
echo "==> Sealing '$KEY_FILE' into an encrypted SealedSecret"
kubectl create secret generic "$SECRET_NAME" \
      --namespace "$SECRET_NS" \
      --from-literal=type=git \
      --from-literal=url="$REPO_SSH_URL" \
      --from-file=sshPrivateKey="$KEY_FILE" \
      --dry-run=client -o yaml \
  | kubectl label --local -f - \
      argocd.argoproj.io/secret-type=repository -o yaml \
  | kubeseal --controller-namespace "$CONTROLLER_NS" \
             --controller-name "$CONTROLLER_NAME" \
             --format yaml \
  > "$OUT_FILE"
echo "==> Wrote: $OUT_FILE  (encrypted — safe to commit)"

# --- GitOps wiring: register the artifact so 'apply -k' picks it up --------
if ! grep -q 'sealed-repo-credential.yaml' "$KFILE" 2>/dev/null; then
  printf '  - sealed-repo-credential.yaml\n' >> "$KFILE"
  echo "==> Registered sealed-repo-credential.yaml in $KFILE"
fi

# --- remind the human of the remaining steps (this script applies nothing) -
cat <<EOF

Next:
  4. shred -u "$KEY_FILE"          # destroy the plaintext key
  5. git add k8s/argocd/ && git commit -m "feat(argocd): repo credential" && git push
  6. kubectl apply -k k8s/argocd   # one-time bootstrap (chicken-and-egg)
EOF
