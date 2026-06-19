// ---------------------------------------------------------------------------
// API contracts — mirror the backend services exactly (verified from source).
// ---------------------------------------------------------------------------

// product-service (Java/Spring, MongoDB) — GET/POST/PUT/DELETE /api/products
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}

// Payload accepted by POST/PUT /api/products. The backend requires every field
// (name, description, category, price, stock) or it returns HTTP 400.
export interface ProductInput {
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
}

// order-service (Go, MongoDB) — GET/POST /api/orders (no update/delete in API)
export interface Order {
  id: string;
  product_id: string;
  quantity: number;
  total_price: number;
  status: string;
}

// Payload accepted by POST /api/orders.
export interface OrderInput {
  product_id: string;
  quantity: number;
}

// Gateway /api/analytics/summary — counts are derived server-side from the real
// product and order lists, so they always match the list pages.
export interface AnalyticsSummary {
  total_revenue: number;
  order_count: number;
  product_count: number;
  avg_order_value: number;
}
