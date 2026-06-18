import os
import time
import uuid
import json
import structlog
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request
from prometheus_client import Counter, Histogram, CollectorRegistry, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from opentelemetry import trace, propagate
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Configure structlog
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


def _normalize_otlp_endpoint(raw: str) -> str:
    raw = (raw or "").strip()
    if raw.startswith("http://"):
        raw = raw[len("http://"):]
    if raw.startswith("https://"):
        raw = raw[len("https://"):]
    return raw or "tempo.observability-stack:4317"


def setup_tracing() -> TracerProvider:
    endpoint = _normalize_otlp_endpoint(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
    service_name = os.getenv("OTEL_SERVICE_NAME", "analytics-service")

    resource = Resource(attributes={
        SERVICE_NAME: service_name,
        "deployment.environment": os.getenv("ENVIRONMENT", "kubernetes"),
    })

    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    return provider


tracer_provider = setup_tracing()
tracer = trace.get_tracer("analytics-service")

# Prometheus Metrics
registry = CollectorRegistry()

http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'path', 'status'],
    registry=registry
)

http_request_duration = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'path'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
    registry=registry
)

analytics_events_total = Counter(
    'analytics_events_total',
    'Total analytics events tracked',
    registry=registry
)

# Database setup
postgres_url = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@postgres:5432/analytics_db'
)

engine = create_engine(postgres_url, poolclass=NullPool, echo=False)
SQLAlchemyInstrumentor().instrument(engine=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Analytics(Base):
    __tablename__ = "analytics"
    id = Column(Integer, primary_key=True)
    order_id = Column(String, index=True)
    product_id = Column(String, index=True)
    revenue = Column(Float)
    quantity = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)

# FastAPI app initialization
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Analytics Service started")
    yield
    # Shutdown
    logger.info("Analytics Service shutting down...")
    engine.dispose()
    tracer_provider.shutdown()

app = FastAPI(title="analytics-service", lifespan=lifespan)
FastAPIInstrumentor.instrument_app(app)

# Middleware for metrics and logging
class RequestMetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Clear and bind context
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        # Extract parent trace headers, then create a request span.
        ctx = propagate.extract(dict(request.headers))
        with tracer.start_as_current_span(f"{request.method} {request.url.path}", context=ctx) as span:
            span.set_attribute("request.id", request_id)
            span.set_attribute("http.method", request.method)
            span.set_attribute("http.route", request.url.path)

            start_time = time.time()
            response = await call_next(request)
            duration = time.time() - start_time

            span.set_attribute("http.status_code", response.status_code)
            if response.status_code >= 500:
                span.set_status(trace.Status(trace.StatusCode.ERROR))
        
        http_request_duration.labels(
            method=request.method,
            path=request.url.path
        ).observe(duration)
        
        http_requests_total.labels(
            method=request.method,
            path=request.url.path,
            status=response.status_code
        ).inc()
        
        logger.info(
            "request_completed",
            status=response.status_code,
            duration_ms=duration * 1000
        )
        
        response.headers["X-Request-ID"] = request_id
        return response

app.add_middleware(RequestMetricsMiddleware)

# Routes
@app.get("/health")
async def health():
    logger.info("health_check")
    return {"status": "healthy"}

@app.get("/metrics")
async def metrics():
    logger.info("metrics_scrape")
    return Response(content=generate_latest(registry), media_type="text/plain")

@app.get("/api/summary")
async def get_summary():
    logger.info("fetching_analytics_summary")
    try:
        session = SessionLocal()
        analytics_count = session.query(Analytics).count()
        total_revenue = 0.0
        
        for record in session.query(Analytics).all():
            total_revenue += record.revenue or 0
        
        session.close()
        
        return {
            "total_revenue": total_revenue,
            "order_count": analytics_count,
            "product_count": analytics_count,
            "avg_order_value": total_revenue / max(analytics_count, 1)
        }
    except Exception as e:
        logger.error("Failed to fetch summary", error=str(e))
        return {"error": str(e)}, 500

@app.post("/api/analytics/track")
async def track_event(data: dict):
    logger.info("tracking_event", data=data)
    
    try:
        session = SessionLocal()
        
        analytics = Analytics(
            order_id=data.get("order_id"),
            product_id=data.get("product_id"),
            revenue=data.get("revenue", 0),
            quantity=data.get("quantity", 1),
            timestamp=datetime.utcnow()
        )
        
        session.add(analytics)
        session.commit()
        session.close()
        
        analytics_events_total.inc()
        logger.info("event_tracked", order_id=data.get("order_id"))
        
        return {"status": "tracked"}
    except Exception as e:
        logger.error("Failed to track event", error=str(e))
        return {"error": str(e)}, 500

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
