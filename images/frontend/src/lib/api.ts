import axios from 'axios';
import type {
  Product,
  ProductInput,
  Order,
  OrderInput,
  AnalyticsSummary,
} from './types';

// Relative base URL: in dev, Vite proxies /api -> api-gateway; in prod, nginx
// proxies /api -> api-gateway. Same code path in both environments.
const http = axios.create({
  baseURL: '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Some endpoints return an array; guard against non-array bodies (e.g. errors).
function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export const api = {
  // ---- Products (full CRUD) ----
  listProducts: async (): Promise<Product[]> => {
    const { data } = await http.get('/products');
    return asArray<Product>(data);
  },
  createProduct: async (input: ProductInput): Promise<Product> => {
    const { data } = await http.post('/products', input);
    return data as Product;
  },
  updateProduct: async (id: string, input: ProductInput): Promise<Product> => {
    const { data } = await http.put(`/products/${id}`, input);
    return data as Product;
  },
  deleteProduct: async (id: string): Promise<void> => {
    await http.delete(`/products/${id}`);
  },

  // ---- Orders (list + create) ----
  listOrders: async (): Promise<Order[]> => {
    const { data } = await http.get('/orders');
    return asArray<Order>(data);
  },
  createOrder: async (input: OrderInput): Promise<Order> => {
    const { data } = await http.post('/orders', input);
    return data as Order;
  },

  // ---- Analytics summary (server-derived, matches the lists) ----
  getSummary: async (): Promise<AnalyticsSummary> => {
    const { data } = await http.get('/analytics/summary');
    return data as AnalyticsSummary;
  },
};
