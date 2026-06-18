

---

## Step-by-Step Execution Guide

**Your starting point:** Kind cluster `my-cluster` is running, 3 nodes, all namespaces clean.

---

### STEP 1 — Understand the two blockers you must resolve first

Before running anything, two values must be set for Docker Hub + GitHub:

**a) Your Docker Hub username** — appears as `YOUR_DOCKERHUB_USERNAME` in image references.

**b) Your GitHub PAT** — needed only for ArgoCD to connect to your Git repo.

**c) Your Docker Hub access token** — needed by GitHub Actions to push images to Docker Hub.

**Create your GitHub PAT now (for ArgoCD repo access):**
1. Go to → https://github.com/settings/Developer Settings/tokens
2. Click **"Generate new token (classic)"**
3. Scopes: tick `repo`
4. Copy the token — you'll need it in Step 6.

**Create your Docker Hub access token now (for CI push):**
1. Go to → https://hub.docker.com/settings/security
2. Click New Access Token
3. Permission: Read, Write, Delete
4. Copy token — you'll add it as GitHub secret in Step 3.

---

### STEP 2 — Replace `YOUR_DOCKERHUB_USERNAME` with your Docker Hub username

Run this once, substituting your actual GitHub username:

```bash
cd /home/princewillopah/DevOps/product-app

# Replace Docker Hub placeholder everywhere
DOCKERHUB_USER="princewillopah"   # ← CHANGE THIS

grep -rl "YOUR_DOCKERHUB_USERNAME" . | xargs sed -i "s|YOUR_DOCKERHUB_USERNAME|${DOCKERHUB_USER}|g"

# Confirm it's replaced
grep -r "YOUR_DOCKERHUB_USERNAME" . && echo "STILL HAS PLACEHOLDERS" || echo "✅ All replaced"
```

---

### STEP 3 — Configure GitHub Actions secrets for Docker Hub push

```bash
# Go to your GitHub repo Settings > Secrets and variables > Actions
# Add these secrets:
# - DOCKERHUB_USERNAME=your_dockerhub_username
# - DOCKERHUB_TOKEN=your_dockerhub_access_token
```

For Docker Hub public images, Kubernetes imagePullSecret is not required.

---

### STEP 4 — Push your code to GitHub (so CI builds the images)

This is **required before deploying** because the deployments reference images from Docker Hub. Those images only exist if the GitHub Actions pipeline has run at least once.

```bash
# Create a new GitHub repo named: product-app
# Go to: https://github.com/new
# Name: product-app, Private or Public, no README

cd /home/princewillopah/DevOps/product-app
git init
git add .
git commit -m "Initial production setup"
git branch -M main
git remote add origin https://github.com/princewillopah/product-app.git
git push -u origin main
```

GitHub Actions will then automatically:
- Build all 4 Docker images in parallel
- Push them to `docker.io/princewillopah/order-service:latest` etc.

Watch it at: `https://github.com/princewillopah/product-app/actions`

**Wait for the pipeline to go green before proceeding.**

---

### STEP 5 — Deploy the observability stack (Helm)

```bash
cd /home/princewillopah/DevOps/product-app

bash scripts/deploy-all.sh --cluster dev
```

This installs (in order):
1. Namespaces (`observability-stack`, product-app, `argocd`)
2. `kube-prometheus-stack` via Helm → Prometheus Operator + AlertManager + Grafana + node-exporter
3. PrometheusRule CRDs (your SLO alert rules)
4. ServiceMonitor CRDs (dynamic scrape config)
5. OpenTelemetry Collector
6. All 4 application services via `kubectl apply -k k8s/services`
7. Waits for all rollouts to finish
8. Starts port-forwards so you can access the UIs

**Expected time: ~8–12 minutes** (Helm chart download + pod startup).

---

### STEP 6 — Install ArgoCD and connect it to your Git repo

```bash
cd /home/princewillopah/DevOps/product-app

bash scripts/setup-argocd.sh
```

This:
1. Installs ArgoCD via Helm in the `argocd` namespace
2. Applies the AppProject (RBAC policies)
3. Applies the two ApplicationSets (services + observability)

After it finishes, get the initial admin password:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d && echo
```

Access ArgoCD UI:
```bash
kubectl port-forward -n argocd svc/argocd-server 8080:443 &
# Open: http://127.0.0.1:8080
# Username: admin
# Password: (from command above)
```

---

### STEP 7 — Connect ArgoCD to your GitHub repo

In the ArgoCD UI:
1. Go to **Settings → Repositories → Connect Repo**
2. Method: **HTTPS**
3. URL: `https://github.com/princewillopah/product-app.git`
4. Username: `princewillopah`
5. Password: your GitHub PAT from Step 1
6. Click **Connect**

Then go to **Applications** — you should see `product-app-services-dev` and `product-app-observability-dev` syncing automatically.

---

### STEP 8 — Validate everything is working

```bash
cd /home/princewillopah/DevOps/product-app

bash scripts/validate-observability.sh
```

You should see all checks pass. Then verify services:
```bash
kubectl get pods -n product-app
kubectl get pods -n observability-stack
kubectl get hpa -n product-app
kubectl get pdb -n product-app
```

---

### STEP 9 — Access the UIs

After Step 5 the port-forwards are already running. Bookmarks:

| UI | URL | Credentials |
|----|-----|------------|
| Grafana | http://127.0.0.1:3000 | admin / prom-operator |
| Prometheus | http://127.0.0.1:9090 | none |
| AlertManager | http://127.0.0.1:9093 | none |
| ArgoCD | http://127.0.0.1:8080 | admin / (from Step 6) |

---

### What happens after every code change (day-to-day flow)

```
You push code → GitHub Actions builds image → pushes to Docker Hub
→ ArgoCD detects new manifest → auto-deploys to dev cluster
→ Prometheus scrapes metrics → Grafana shows them
→ Alert fires if SLO is breached → routes to Slack/PagerDuty
```

---

### Summary of the order

| # | Command | Prerequisite |
|---|---------|-------------|
| 1 | Create GitHub PAT + Docker Hub token | GitHub + Docker Hub account |
| 2 | `sed` replace `YOUR_DOCKERHUB_USERNAME` | Docker Hub username known |
| 3 | Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` GitHub Action secrets | GitHub repo created |
| 4 | `git push` to new GitHub repo | Repo created |
| 5 | `bash scripts/deploy-all.sh --cluster dev` | Images built in CI (Step 4 green) |
| 6 | `bash scripts/setup-argocd.sh` | Step 5 complete |
| 7 | Connect repo in ArgoCD UI | Step 6 complete |
| 8 | `bash scripts/validate-observability.sh` | Step 7 complete |

---

If you get stuck at any step, tell me which step and what error you see. I will fix it immediately without another back-and-forth.

**Accuracy footer**: [certain] on the execution order and what each step does. [likely] that HPA will show `<unknown>` targets until metrics-server is fully warm (~2 min after deploy). No major hallucination risk here.