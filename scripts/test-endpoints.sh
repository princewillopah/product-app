#!/usr/bin/env bash
# test-endpoints.sh — prove every app + observability endpoint is reachable.
#
# Two access classes on this kind cluster:
#   (A) HOST-MAPPED (browser-reachable, no port-forward):
#         API Gateway   http://localhost:8000
#         Grafana       http://localhost:3000   (admin / prom-operator)
#         Prometheus    http://localhost:9090
#         Alertmanager  http://localhost:9093
#   (B) CLUSTER-INTERNAL (reached via Grafana, or kubectl port-forward):
#         Loki, Tempo, ArgoCD, product/order/analytics services, mongodb, postgres
#
# This script tests BOTH classes. For class B it opens a short-lived
# port-forward, tests, then tears it down (trap cleans up on exit).
#
# Usage:  scripts/test-endpoints.sh
set -uo pipefail

GW="${GW:-http://localhost:8000}"
PROM="${PROM:-http://localhost:9090}"
GRAF="${GRAF:-http://localhost:3000}"
ALERT="${ALERT:-http://localhost:9093}"

PASS=0; FAIL=0
G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'
PF_PIDS=()
cleanup() { for p in "${PF_PIDS[@]:-}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

section() { printf "\n${B}== %s ==${N}\n" "$1"; }

# check <label> <expected_code> <url> [extra curl args...]
check() {
  local label="$1" exp="$2" url="$3"; shift 3
  local code
  code=$(curl -s -o /dev/null -m 8 -w "%{http_code}" "$@" "$url" 2>/dev/null)
  if [[ "$code" == "$exp" ]]; then
    printf "  ${G}PASS${N}  %-44s HTTP %s\n" "$label" "$code"; PASS=$((PASS+1))
  else
    printf "  ${R}FAIL${N}  %-44s HTTP %s (want %s)\n" "$label" "$code" "$exp"; FAIL=$((FAIL+1))
  fi
}

# pf <ns> <svc> <localport:targetport> — start a background port-forward, wait for it
pf() {
  local ns="$1" svc="$2" map="$3"
  kubectl port-forward -n "$ns" "svc/$svc" "$map" >/dev/null 2>&1 &
  PF_PIDS+=($!)
  sleep 3
}

#############################################
section "A1. App — via API Gateway (host:8000)"
#############################################
check "GET  /health"                  200 "$GW/health"
check "GET  /metrics"                  200 "$GW/metrics"
check "GET  /api/products"             200 "$GW/api/products"
check "GET  /api/orders"               200 "$GW/api/orders"
check "GET  /api/analytics/summary"    200 "$GW/api/analytics/summary"
# write paths
check "POST /api/products"             200 "$GW/api/products" \
      -X POST -H 'Content-Type: application/json' \
      -d '{"name":"test-widget","description":"endpoint test","category":"test","price":9.99,"stock":10}'
check "POST /api/orders"               200 "$GW/api/orders" \
      -X POST -H 'Content-Type: application/json' \
      -d '{"product_id":"test","quantity":1,"customer":"tester"}'
# negative test (intentional 404 — proves error handling + error telemetry)
check "GET  /api/does-not-exist (404)" 404 "$GW/api/does-not-exist"

#############################################
section "A2. Observability UIs (host-mapped)"
#############################################
check "Grafana  /api/health"          200 "$GRAF/api/health"
check "Grafana  /login"               200 "$GRAF/login"
check "Prometheus  /-/healthy"        200 "$PROM/-/healthy"
check "Prometheus  /-/ready"          200 "$PROM/-/ready"
check "Prometheus  /api/v1/query"     200 "$PROM/api/v1/query?query=up"
check "Alertmanager  /-/healthy"      200 "$ALERT/-/healthy"
check "Alertmanager  /api/v2/status"  200 "$ALERT/api/v2/status"

#############################################
section "A3. Prometheus — data sanity (not just reachable)"
#############################################
have() {  # have <label> <promql>
  local label="$1" expr="$2" n
  n=$(curl -s -m 8 "$PROM/api/v1/query" --data-urlencode "query=$expr" \
        | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]["result"]))' 2>/dev/null || echo 0)
  if [[ "${n:-0}" -gt 0 ]]; then
    printf "  ${G}PASS${N}  %-44s %s series\n" "$label" "$n"; PASS=$((PASS+1))
  else
    printf "  ${R}FAIL${N}  %-44s 0 series\n" "$label"; FAIL=$((FAIL+1))
  fi
}
have "targets up{}"                    'up == 1'
have "app http_requests_total"         'http_requests_total'
have "Tempo span-metrics"              'traces_spanmetrics_calls_total'
have "Tempo service-graph"             'traces_service_graph_request_total'
have "kube-state-metrics (pods)"       'kube_pod_info'
have "node-exporter (host)"            'node_cpu_seconds_total'

#############################################
section "B1. Loki — logs API (port-forward 3100)"
#############################################
pf observability-stack loki 13100:3100
check "Loki  /ready"                   200 "http://localhost:13100/ready"
check "Loki  /loki/api/v1/labels"      200 "http://localhost:13100/loki/api/v1/labels"
have_loki() {
  local n
  n=$(curl -s -m 8 "http://localhost:13100/loki/api/v1/label/service_name/values" \
        | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d.get("data",[])))' 2>/dev/null || echo 0)
  if [[ "${n:-0}" -gt 0 ]]; then
    printf "  ${G}PASS${N}  %-44s %s services logging\n" "service_name label values" "$n"; PASS=$((PASS+1))
  else
    printf "  ${Y}WARN${N}  %-44s 0 (logs may still be flushing)\n" "service_name label values"
  fi
}
have_loki

#############################################
section "B2. Tempo — traces query API (port-forward 3200)"
#############################################
pf observability-stack tempo 13200:3200
check "Tempo  /ready"                  200 "http://localhost:13200/ready"
check "Tempo  /api/search/tags"        200 "http://localhost:13200/api/search/tags"
check "Tempo  /api/search (services)"  200 "http://localhost:13200/api/search?tags=&limit=5"

#############################################
section "B3. ArgoCD — GitOps UI/API (port-forward, insecure http)"
#############################################
pf argocd argocd-server 18080:80
check "ArgoCD  /healthz"               200 "http://localhost:18080/healthz"
check "ArgoCD  /api/version"           200 "http://localhost:18080/api/version"

#############################################
section "B4. Internal services — direct (bypass gateway, port-forward)"
#############################################
pf product-app product-service 18001:8080
check "product-service  /api/products"        200 "http://localhost:18001/api/products"
check "product-service  /actuator/prometheus" 200 "http://localhost:18001/actuator/prometheus"
pf product-app order-service 18002:8080
check "order-service  /health"                200 "http://localhost:18002/health"
check "order-service  /api/orders"            200 "http://localhost:18002/api/orders"
check "order-service  /metrics"               200 "http://localhost:18002/metrics"
pf product-app analytics-service 18004:8080
check "analytics-service  /health"            200 "http://localhost:18004/health"
check "analytics-service  /api/summary"       200 "http://localhost:18004/api/summary"
check "analytics-service  /metrics"           200 "http://localhost:18004/metrics"

#############################################
section "RESULT"
#############################################
printf "  ${B}%d passed, %d failed${N}\n\n" "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
