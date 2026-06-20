// tracing.js — OpenTelemetry bootstrap for the API gateway.
//
// Loaded via `node --require ./tracing.js server.js` so it runs BEFORE any
// application module (express, axios, http) is imported — auto-instrumentation
// can only patch libraries it loads first.
//
// Config comes from the standard OTEL_* env vars already set on the pod:
//   OTEL_SERVICE_NAME            -> shows up as the service name in Tempo
//   OTEL_EXPORTER_OTLP_ENDPOINT  -> http://otel-collector.observability-stack:4317
// The gRPC exporter matches the collector's OTLP/gRPC receiver on :4317, the
// same transport the Go and Python services already use.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');

const sdk = new NodeSDK({
  // No args: reads OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.
  traceExporter: new OTLPTraceExporter(),
  // Auto-instruments http, express and axios. The axios hooks are what make the
  // gateway's downstream calls (order/product/analytics) appear as child spans,
  // turning isolated per-service traces into one end-to-end waterfall.
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch(() => {}).finally(() => process.exit(0));
});
