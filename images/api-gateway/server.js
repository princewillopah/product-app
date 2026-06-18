const express = require('express');
const { v4: uuidv4 } = require('uuid');
const prometheus = require('prom-client');
const pino = require('pino');
const axios = require('axios');

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'api-gateway',
    environment: process.env.ENVIRONMENT || 'kubernetes',
  },
});

// Prometheus Registry
const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register });

const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
  registers: [register],
});

const downstreamRequestsTotal = new prometheus.Counter({
  name: 'downstream_requests_total',
  help: 'Total downstream requests',
  labelNames: ['service', 'status'],
  registers: [register],
});

// Express app
const app = express();

// CORS middleware for frontend on localhost:3000
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Request-ID,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json());

// Request ID Middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Add request ID to logger context
  req.logger = logger.child({ request_id: requestId });
  next();
});

// Metrics Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    httpRequestsTotal
      .labels(req.method, req.path, res.statusCode)
      .inc();
    httpRequestDuration
      .labels(req.method, req.path)
      .observe(duration);
    
    req.logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: (Date.now() - startTime),
    });
  });
  
  next();
});

// Helper function to call downstream services
async function callDownstream(service, url, method = 'GET', data = null, headers = {}) {
  try {
    const config = {
      method,
      url: url,
      headers: {
        'X-Request-ID': headers['x-request-id'],
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 5000,
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    downstreamRequestsTotal.labels(service, response.status).inc();
    return response.data;
  } catch (error) {
    downstreamRequestsTotal.labels(service, error.response?.status || 'error').inc();
    throw error;
  }
}

// Routes
app.get('/health', (req, res) => {
  req.logger.info('health_check');
  res.json({ status: 'healthy' });
});

app.get('/metrics', async (req, res) => {
  req.logger.info('metrics_scrape');
  try {
    const metricsPayload = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metricsPayload);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to generate metrics');
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Product Service routes (proxied)
app.get('/api/products', async (req, res) => {
  try {
    req.logger.info('GET /api/products (proxying to product-service)');
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://product-service:8001';
    const data = await callDownstream('product-service', `${productServiceUrl}/api/products`, 'GET', null, { 'x-request-id': req.id });
    res.json(data);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to fetch products');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    req.logger.info('GET /api/products/:id (proxying to product-service)');
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://product-service:8001';
    const data = await callDownstream('product-service', `${productServiceUrl}/api/products/${req.params.id}`, 'GET', null, { 'x-request-id': req.id });
    res.json(data);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to fetch product');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    req.logger.info('POST /api/products (proxying to product-service)');
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://product-service:8001';
    const data = await callDownstream('product-service', `${productServiceUrl}/api/products`, 'POST', req.body, { 'x-request-id': req.id });
    res.json(data);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to create product');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    req.logger.info('PUT /api/products/:id (proxying to product-service)');
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://product-service:8001';
    const data = await callDownstream('product-service', `${productServiceUrl}/api/products/${req.params.id}`, 'PUT', req.body, { 'x-request-id': req.id });
    res.json(data);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to update product');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    req.logger.info('DELETE /api/products/:id (proxying to product-service)');
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://product-service:8001';
    await callDownstream('product-service', `${productServiceUrl}/api/products/${req.params.id}`, 'DELETE', null, { 'x-request-id': req.id });
    res.status(204).send();
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to delete product');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Order Service routes (proxied)
app.get('/api/orders', async (req, res) => {
  try {
    req.logger.info('GET /api/orders (proxying to order-service)');
    const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8002';
    const data = await callDownstream('order-service', `${orderServiceUrl}/api/orders`, 'GET', null, { 'x-request-id': req.id });
    res.json(data);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to fetch orders');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    req.logger.info('POST /api/orders (proxying to order-service)');
    const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8002';
    const data = await callDownstream('order-service', `${orderServiceUrl}/api/orders`, 'POST', req.body, { 'x-request-id': req.id });
    res.json(data);
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to create order');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Analytics Service routes (proxied)
app.get('/api/analytics/summary', async (req, res) => {
  try {
    req.logger.info('GET /api/analytics/summary (proxying to analytics-service)');
    const analyticsServiceUrl = process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8004';
    const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://product-service:8001';
    const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8002';

    const [analyticsSummary, products, orders] = await Promise.all([
      callDownstream('analytics-service', `${analyticsServiceUrl}/api/summary`, 'GET', null, { 'x-request-id': req.id }),
      callDownstream('product-service', `${productServiceUrl}/api/products`, 'GET', null, { 'x-request-id': req.id }),
      callDownstream('order-service', `${orderServiceUrl}/api/orders`, 'GET', null, { 'x-request-id': req.id }),
    ]);

    const safeProducts = Array.isArray(products) ? products : [];
    const safeOrders = Array.isArray(orders) ? orders : [];

    const totalRevenue = safeOrders.reduce((acc, order) => acc + Number(order.total_price || 0), 0);

    res.json({
      ...analyticsSummary,
      total_revenue: Number(totalRevenue.toFixed(2)),
      order_count: safeOrders.length,
      product_count: safeProducts.length,
      avg_order_value: safeOrders.length > 0 ? Number((totalRevenue / safeOrders.length).toFixed(2)) : 0,
    });
  } catch (error) {
    req.logger.error({ error: error.message }, 'Failed to fetch analytics');
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});
