#!/usr/bin/env bash
# generate-traffic.sh — steady synthetic load against the product-app gateway so
# the observability stack (metrics / logs / traces) always has fresh data to
# explore while you learn. Targets the kind host port-map (localhost:8000), so it
# needs NO kubectl port-forward.
#
# Usage:
#   scripts/generate-traffic.sh            # run until you press Ctrl-C
#   scripts/generate-traffic.sh 300        # run for 300 seconds then stop
#   RPS=8 scripts/generate-traffic.sh      # ~8 request-cycles per second
#   BASE_URL=http://localhost:8000 scripts/generate-traffic.sh
#
# Why deliberate errors? A stream of only HTTP 200s makes every dashboard look
# flat and green. Injecting a few 404s lets you SEE error rates, error logs, and
# error spans — which is the whole point of learning observability.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
RPS="${RPS:-3}"                 # approx request-cycles per second
DURATION="${1:-0}"             # 0 = run until interrupted

# Happy-path routes (all return HTTP 200).
ENDPOINTS=(
  "/health"
  "/api/products"
  "/api/orders"
  "/api/analytics/summary"
)

# Routes that intentionally fail (404) so errors show up in the telemetry.
ERROR_ENDPOINTS=(
  "/api/products/does-not-exist"
  "/api/orders/99999999"
)

sleep_per=$(awk "BEGIN { printf \"%.3f\", 1/${RPS} }")
start=$(date +%s)
count=0
errors=0
trap 'echo; echo "stopped: ${count} requests (${errors} deliberate errors)"; exit 0' INT TERM

echo "Generating traffic -> ${BASE_URL}  (~${RPS} cycles/s, duration=${DURATION:-infinite}s)"
echo "Press Ctrl-C to stop."
while true; do
  for ep in "${ENDPOINTS[@]}"; do
    curl -s -o /dev/null -m 5 "${BASE_URL}${ep}"
    count=$((count + 1))
  done

  # roughly 1 in 5 cycles, fire an intentional error request
  if (( RANDOM % 5 == 0 )); then
    err="${ERROR_ENDPOINTS[$((RANDOM % ${#ERROR_ENDPOINTS[@]}))]}"
    curl -s -o /dev/null -m 5 "${BASE_URL}${err}"
    count=$((count + 1))
    errors=$((errors + 1))
  fi

  if (( count % 40 == 0 )); then
    echo "  ... ${count} requests sent ($(date +%H:%M:%S))"
  fi

  if (( DURATION > 0 )); then
    now=$(date +%s)
    (( now - start >= DURATION )) && break
  fi
  sleep "${sleep_per}"
done
echo "done: ${count} requests in ${DURATION}s (${errors} deliberate errors)"
