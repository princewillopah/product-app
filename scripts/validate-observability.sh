#!/bin/bash

# ============================================================================
# validate-observability.sh - Smoke tests for observability stack
# ============================================================================
# Usage: bash scripts/validate-observability.sh
# Validates: Prometheus, AlertManager, Loki, Tempo, OTEL Collector
# ============================================================================

echo "🧪 Validating observability stack..."
echo ""

# Set variables
PROM_URL="http://127.0.0.1:9090"
AM_URL="http://127.0.0.1:9093"
LOKI_URL="http://127.0.0.1:3100"
TEMPO_URL="http://127.0.0.1:4317"
OTEL_METRICS_URL="http://127.0.0.1:8888"

CHECKS_PASSED=0
CHECKS_FAILED=0

# Test function
test_endpoint() {
  local name=$1
  local url=$2
  local expected_status=${3:-200}
  
  echo -n "  Testing $name... "
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  
  if [[ "$response" == "$expected_status" ]]; then
    echo "✅"
    ((CHECKS_PASSED++))
  else
    echo "❌ (HTTP $response, expected $expected_status)"
    ((CHECKS_FAILED++))
  fi
}

# ============================================================================
# Test Prometheus
# ============================================================================
echo "📊 Prometheus:"
test_endpoint "Prometheus health" "$PROM_URL/-/healthy"
test_endpoint "Prometheus API" "$PROM_URL/api/v1/query?query=up"

# Check targets
echo -n "  Checking targets... "
targets=$(curl -s "$PROM_URL/api/v1/targets" | grep -o '"activeTargets":\[' | wc -l)
if [[ $targets -gt 0 ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "❌ (no targets found)"
  ((CHECKS_FAILED++))
fi

# Check rules
echo -n "  Checking alert rules... "
rules=$(curl -s "$PROM_URL/api/v1/rules" | grep -o '"name":"' | wc -l)
if [[ $rules -gt 0 ]]; then
  echo "✅ ($rules rules loaded)"
  ((CHECKS_PASSED++))
else
  echo "❌ (no rules found)"
  ((CHECKS_FAILED++))
fi

# ============================================================================
# Test AlertManager
# ============================================================================
echo ""
echo "🚨 AlertManager:"
test_endpoint "AlertManager API" "$AM_URL/api/v2/alerts" 200
test_endpoint "AlertManager status" "$AM_URL/api/v2/status" 200

# ============================================================================
# Test Loki
# ============================================================================
echo ""
echo "📝 Loki:"
test_endpoint "Loki health" "$LOKI_URL/ready" 200
test_endpoint "Loki API" "$LOKI_URL/loki/api/v1/label" 200

# Check log streams
echo -n "  Checking log streams... "
streams=$(curl -s "$LOKI_URL/loki/api/v1/label/pod/values" | grep -o 'pod' | wc -l)
if [[ $streams -gt 0 ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "⚠️  (no logs yet - deploy services)"
  ((CHECKS_PASSED++))
fi

# ============================================================================
# Test Tempo (gRPC - harder to test)
# ============================================================================
echo ""
echo "🔍 Tempo:"
echo -n "  Checking Tempo pod status... "
tempo_ready=$(kubectl get pod -n observability-stack -l app=tempo -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
if [[ "$tempo_ready" == "True" ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "❌ (Tempo not ready)"
  ((CHECKS_FAILED++))
fi

# ============================================================================
# Test OTEL Collector
# ============================================================================
echo ""
echo "🌐 OpenTelemetry Collector:"
test_endpoint "OTEL metrics" "$OTEL_METRICS_URL/metrics" 200

echo -n "  Checking OTEL Collector pod... "
otel_ready=$(kubectl get deployment otel-collector -n observability-stack -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
if [[ "$otel_ready" -gt 0 ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "❌ (OTEL not ready)"
  ((CHECKS_FAILED++))
fi

# ============================================================================
# Test Kubernetes Components
# ============================================================================
echo ""
echo "⚙️  Kubernetes Components:"

echo -n "  Checking Prometheus Operator... "
operator_ready=$(kubectl get deployment -n observability-stack -l app.kubernetes.io/name=prometheus-operator -o jsonpath='{.items[0].status.readyReplicas}' 2>/dev/null)
if [[ "$operator_ready" -gt 0 ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "❌ (Operator not ready)"
  ((CHECKS_FAILED++))
fi

echo -n "  Checking Prometheus pod... "
prom_ready=$(kubectl get deployment -n observability-stack -l app.kubernetes.io/name=prometheus -o jsonpath='{.items[0].status.readyReplicas}' 2>/dev/null)
if [[ "$prom_ready" -gt 0 ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "❌ (Prometheus not ready)"
  ((CHECKS_FAILED++))
fi

echo -n "  Checking Grafana pod... "
grafana_ready=$(kubectl get deployment -n observability-stack -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].status.readyReplicas}' 2>/dev/null)
if [[ "$grafana_ready" -gt 0 ]]; then
  echo "✅"
  ((CHECKS_PASSED++))
else
  echo "❌ (Grafana not ready)"
  ((CHECKS_FAILED++))
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "================================================================"
echo "Test Summary: $CHECKS_PASSED passed, $CHECKS_FAILED failed"
echo "================================================================"
echo ""

if [[ $CHECKS_FAILED -eq 0 ]]; then
  echo "✅ All observability checks passed!"
  echo ""
  echo "🎯 Next steps:"
  echo "   1. Deploy application services"
  echo "   2. Send test traffic to generate metrics/logs/traces"
  echo "   3. Check Grafana dashboards at http://127.0.0.1:3000"
  exit 0
else
  echo "⚠️  Some checks failed - review logs above"
  exit 1
fi

