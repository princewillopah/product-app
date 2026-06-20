package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.uber.org/zap"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration",
			Buckets: []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1.0},
		},
		[]string{"method", "path"},
	)

	ordersCreatedTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "orders_created_total",
			Help: "Total orders created",
		},
	)

	logger *zap.Logger
	client *mongo.Client
	tracer = otel.Tracer("order-service")
)

type Order struct {
	ID        string    `bson:"_id,omitempty"`
	ProductID string    `bson:"product_id"`
	Quantity  int       `bson:"quantity"`
	TotalPrice float64  `bson:"total_price"`
	Status    string    `bson:"status"`
	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}

type CreateOrderRequest struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

// productInfo is the subset of the product-service payload we need to price an order.
type productInfo struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

// UpdateOrderStatusRequest is the payload for changing an order's status.
type UpdateOrderStatusRequest struct {
	Status string `json:"status"`
}

// allowedOrderStatuses is the set of valid lifecycle states for an order.
// An order starts as "pending" and an admin moves it through the lifecycle.
var allowedOrderStatuses = map[string]bool{
	"pending":    true,
	"processing": true,
	"completed":  true,
	"cancelled":  true,
}

type ResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *ResponseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func init() {
	prometheus.MustRegister(httpRequestsTotal)
	prometheus.MustRegister(httpRequestDuration)
	prometheus.MustRegister(ordersCreatedTotal)

	var err error
	logger, err = zap.NewProduction()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
}

func metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wrapped := &ResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		start := time.Now()

		// Add request ID to context
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}

		// Create logger with request context
		reqLogger := logger.With(
			zap.String("request_id", requestID),
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
		)

		// Extract parent trace context, then create a span for this request.
		ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		ctx, span := tracer.Start(ctx, r.Method+" "+r.URL.Path)
		span.SetAttributes(
			attribute.String("http.method", r.Method),
			attribute.String("http.route", r.URL.Path),
			attribute.String("request.id", requestID),
		)
		defer span.End()

		// Store in context for use in handlers
		ctx = context.WithValue(ctx, "logger", reqLogger)
		ctx = context.WithValue(ctx, "request_id", requestID)

		wrapped.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(wrapped, r.WithContext(ctx))

		duration := time.Since(start).Seconds()
		httpRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
		httpRequestsTotal.WithLabelValues(r.Method, r.URL.Path, fmt.Sprintf("%d", wrapped.statusCode)).Inc()
		span.SetAttributes(attribute.Int("http.status_code", wrapped.statusCode))
		if wrapped.statusCode >= http.StatusInternalServerError {
			span.SetStatus(codes.Error, "server_error")
		}

		reqLogger.Info("request_completed", zap.Int("status", wrapped.statusCode), zap.Float64("duration_ms", duration*1000))
	})
}

func getLogger(r *http.Request) *zap.Logger {
	if l, ok := r.Context().Value("logger").(*zap.Logger); ok {
		return l
	}
	return logger
}

func getRequestID(r *http.Request) string {
	if id, ok := r.Context().Value("request_id").(string); ok {
		return id
	}
	return ""
}

// Handlers
func getAllOrders(w http.ResponseWriter, r *http.Request) {
	l := getLogger(r)
	l.Info("GET /api/orders")

	collection := client.Database("orders_db").Collection("orders")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := collection.Find(ctx, bson.M{})
	if err != nil {
		l.Error("Failed to fetch orders", zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	var orders []Order
	if err := cursor.All(ctx, &orders); err != nil {
		l.Error("Failed to decode orders", zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "[")
	for i, order := range orders {
		fmt.Fprintf(w, `{"id":"%s","product_id":"%s","quantity":%d,"total_price":%.2f,"status":"%s"}`,
			order.ID, order.ProductID, order.Quantity, order.TotalPrice, order.Status)
		if i < len(orders)-1 {
			fmt.Fprint(w, ",")
		}
	}
	fmt.Fprint(w, "]")
}

// productServiceBaseURL is where we look up product prices when creating an order.
func productServiceBaseURL() string {
	if v := strings.TrimSpace(os.Getenv("PRODUCT_SERVICE_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://product-service.product-app:8080"
}

// orderHTTPClient is reused for internal service-to-service calls.
var orderHTTPClient = &http.Client{Timeout: 5 * time.Second}

// fetchProduct retrieves a product (name + price) from product-service so an
// order's total reflects the real catalog price instead of a hardcoded value.
// The active trace context is propagated so the order->product hop shows up in
// the distributed trace and service graph.
func fetchProduct(ctx context.Context, productID string) (productInfo, error) {
	ctx, span := tracer.Start(ctx, "fetchProduct")
	defer span.End()
	span.SetAttributes(attribute.String("product.id", productID))

	var p productInfo
	url := fmt.Sprintf("%s/api/products/%s", productServiceBaseURL(), productID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		span.RecordError(err)
		return p, err
	}
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))

	resp, err := orderHTTPClient.Do(req)
	if err != nil {
		span.RecordError(err)
		return p, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		err := fmt.Errorf("product lookup returned status %d", resp.StatusCode)
		span.SetStatus(codes.Error, err.Error())
		return p, err
	}
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		span.RecordError(err)
		return p, err
	}
	if p.Price <= 0 {
		return p, fmt.Errorf("product %s has no valid price", productID)
	}
	span.SetAttributes(attribute.Float64("product.price", p.Price))
	return p, nil
}

func createOrder(w http.ResponseWriter, r *http.Request) {
	l := getLogger(r)
	l.Info("POST /api/orders")

	var payload CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		l.Error("Invalid order payload", zap.Error(err))
		http.Error(w, "invalid json payload", http.StatusBadRequest)
		return
	}

	if payload.ProductID == "" || payload.Quantity <= 0 {
		l.Error("Invalid order fields", zap.String("product_id", payload.ProductID), zap.Int("quantity", payload.Quantity))
		http.Error(w, "product_id and quantity (>0) are required", http.StatusBadRequest)
		return
	}

	var order Order
	order.ID = uuid.New().String()
	order.ProductID = payload.ProductID
	order.Quantity = payload.Quantity
	order.CreatedAt = time.Now()
	order.UpdatedAt = time.Now()
	order.Status = "pending"

	// Price the order from the real product catalog (not a hardcoded value) so
	// totals, revenue, and average order value reflect reality.
	product, err := fetchProduct(r.Context(), payload.ProductID)
	if err != nil {
		l.Error("Failed to price order from product-service",
			zap.String("product_id", payload.ProductID), zap.Error(err))
		http.Error(w, "could not price order: product not found or unavailable", http.StatusBadRequest)
		return
	}
	order.TotalPrice = float64(payload.Quantity) * product.Price

	collection := client.Database("orders_db").Collection("orders")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = collection.InsertOne(ctx, order)
	if err != nil {
		l.Error("Failed to create order", zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ordersCreatedTotal.Inc()
	l.Info("Order created", zap.String("order_id", order.ID))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"id":"%s","product_id":"%s","quantity":%d,"total_price":%.2f,"status":"%s"}`,
		order.ID, order.ProductID, order.Quantity, order.TotalPrice, order.Status)
}

// updateOrderStatus moves an existing order to a new lifecycle state
// (pending -> processing -> completed, or cancelled). This is the admin action
// behind the status toggle in the dashboard.
func updateOrderStatus(w http.ResponseWriter, r *http.Request) {
	l := getLogger(r)
	id := chi.URLParam(r, "id")
	l.Info("PATCH /api/orders/{id}", zap.String("order_id", id))

	var payload UpdateOrderStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		l.Error("Invalid status payload", zap.Error(err))
		http.Error(w, "invalid json payload", http.StatusBadRequest)
		return
	}

	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if !allowedOrderStatuses[status] {
		l.Error("Invalid order status", zap.String("status", payload.Status))
		http.Error(w, "status must be one of: pending, processing, completed, cancelled", http.StatusBadRequest)
		return
	}

	collection := client.Database("orders_db").Collection("orders")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated Order
	err := collection.FindOneAndUpdate(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"status": status, "updated_at": time.Now()}},
		opts,
	).Decode(&updated)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			l.Error("Order not found for status update", zap.String("order_id", id))
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		l.Error("Failed to update order status", zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	l.Info("Order status updated", zap.String("order_id", id), zap.String("status", status))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"id":"%s","product_id":"%s","quantity":%d,"total_price":%.2f,"status":"%s"}`,
		updated.ID, updated.ProductID, updated.Quantity, updated.TotalPrice, updated.Status)
}

func health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"healthy"}`)
}

func normalizeOtlpEndpoint(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.TrimPrefix(raw, "https://")
	if raw == "" {
		return "tempo.observability-stack:4317"
	}
	return raw
}

func initTracing(ctx context.Context) (func(context.Context) error, error) {
	endpoint := normalizeOtlpEndpoint(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "order-service"
	}

	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(endpoint),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.Merge(resource.Default(), resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		attribute.String("deployment.environment", os.Getenv("ENVIRONMENT")),
	))
	if err != nil {
		return nil, err
	}

	tp := tracesdk.NewTracerProvider(
		tracesdk.WithSampler(tracesdk.AlwaysSample()),
		tracesdk.WithBatcher(exporter),
		tracesdk.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	return tp.Shutdown, nil
}

func main() {
	defer logger.Sync()

	shutdownTracing, err := initTracing(context.Background())
	if err != nil {
		logger.Fatal("Failed to initialize tracing", zap.Error(err))
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownTracing(ctx); err != nil {
			logger.Error("Failed to shutdown tracing", zap.Error(err))
		}
	}()

	// Connect to MongoDB
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://mongodb:27017/orders_db"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var connectErr error
	client, connectErr = mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if connectErr != nil {
		logger.Fatal("Failed to connect to MongoDB", zap.Error(connectErr))
	}
	defer client.Disconnect(ctx)

	// Verify connection
	ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx, nil); err != nil {
		logger.Fatal("Failed to ping MongoDB", zap.Error(err))
	}

	logger.Info("Connected to MongoDB", zap.String("uri", mongoURI))

	// Create router
	router := chi.NewRouter()
	router.Use(metricsMiddleware)

	// Routes
	router.Get("/health", health)
	router.Get("/metrics", promhttp.Handler().ServeHTTP)
	router.Get("/api/orders", getAllOrders)
	router.Post("/api/orders", createOrder)
	router.Patch("/api/orders/{id}", updateOrderStatus)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8002"
	}

	logger.Info("Starting Order Service", zap.String("port", port))
	if err := http.ListenAndServe(":"+port, router); err != nil {
		logger.Fatal("Server error", zap.Error(err))
	}
}
