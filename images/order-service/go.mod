module order-service

go 1.21

require (
	github.com/go-chi/chi/v5 v5.0.10
	github.com/prometheus/client_golang v1.18.0
	go.mongodb.org/mongo-driver v1.13.0
	go.uber.org/zap v1.26.0
	google.golang.org/grpc v1.59.0
)

require (
	github.com/golang/protobuf v1.5.3
	github.com/google/uuid v1.5.0
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.21.0
	go.opentelemetry.io/otel/sdk v1.21.0
)
