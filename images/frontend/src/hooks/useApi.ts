import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import type { ProductInput, OrderInput, OrderStatus } from '../lib/types';

// Shared query keys — every component that needs products/orders/summary reads
// THESE keys, so the data is shared from one cache entry. The Dashboard count
// and the Products table read the same array; they can never diverge.
export const keys = {
  products: ['products'] as const,
  orders: ['orders'] as const,
  summary: ['summary'] as const,
};

export function useProducts() {
  return useQuery({ queryKey: keys.products, queryFn: api.listProducts });
}

export function useOrders() {
  return useQuery({ queryKey: keys.orders, queryFn: api.listOrders });
}

export function useSummary() {
  return useQuery({ queryKey: keys.summary, queryFn: api.getSummary });
}

// After any mutation we invalidate every affected key so the whole UI — stat
// cards, charts, tables — refetches together and stays consistent.
function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.products }),
      qc.invalidateQueries({ queryKey: keys.orders }),
      qc.invalidateQueries({ queryKey: keys.summary }),
    ]);
}

export function useCreateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ProductInput) => api.createProduct(input),
    onSuccess: () => {
      invalidate();
      toast.success('Product created');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error || 'Failed to create product'),
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) =>
      api.updateProduct(id, input),
    onSuccess: () => {
      invalidate();
      toast.success('Product updated');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error || 'Failed to update product'),
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => {
      invalidate();
      toast.success('Product deleted');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error || 'Failed to delete product'),
  });
}

export function useCreateOrder() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: OrderInput) => api.createOrder(input),
    onSuccess: () => {
      invalidate();
      toast.success('Order placed');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error || 'Failed to place order'),
  });
}

export function useUpdateOrderStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.updateOrderStatus(id, status),
    onSuccess: () => {
      invalidate();
      toast.success('Order status updated');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error || 'Failed to update status'),
  });
}
