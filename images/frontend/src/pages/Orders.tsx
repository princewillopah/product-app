import { useMemo, useState } from 'react';
import { Plus, ShoppingCart, Hash } from 'lucide-react';
import { motion } from 'framer-motion';
import { Topbar } from '../components/Topbar';
import { Modal } from '../components/Modal';
import { OrderForm } from '../components/OrderForm';
import { Badge, statusTone } from '../components/Badge';
import { Skeleton, EmptyState } from '../components/Feedback';
import { useOrders, useProducts, useCreateOrder } from '../hooks/useApi';
import type { OrderInput } from '../lib/types';
import { formatCurrency, shortId } from '../lib/format';

export function Orders() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: products = [] } = useProducts();
  const createMut = useCreateOrder();
  const [formOpen, setFormOpen] = useState(false);

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? shortId(id);

  const totalRevenue = useMemo(
    () => orders.reduce((acc, o) => acc + Number(o.total_price || 0), 0),
    [orders],
  );

  const handleSubmit = (input: OrderInput) => {
    createMut.mutate(input, { onSuccess: () => setFormOpen(false) });
  };

  return (
    <>
      <Topbar
        title="Orders"
        subtitle={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'} • ${formatCurrency(totalRevenue)} total`}
        actions={
          <button
            className="btn-primary"
            onClick={() => setFormOpen(true)}
            disabled={products.length === 0}
            title={products.length === 0 ? 'Add a product first' : 'Create order'}
          >
            <Plus size={18} /> Create Order
          </button>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart size={26} />}
              title="No orders yet"
              message="Create your first order to see it reflected on the dashboard."
              action={
                <button
                  className="btn-primary"
                  onClick={() => setFormOpen(true)}
                  disabled={products.length === 0}
                >
                  <Plus size={18} /> Create Order
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5">Order</th>
                    <th className="px-5 py-3.5">Product</th>
                    <th className="px-5 py-3.5 text-right">Qty</th>
                    <th className="px-5 py-3.5 text-right">Total</th>
                    <th className="px-5 py-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders
                    .slice()
                    .reverse()
                    .map((o, i) => (
                      <motion.tr
                        key={o.id}
                        className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <Hash size={14} className="text-slate-300" />
                            {shortId(o.id, 8)}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">
                          {productName(o.product_id)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm text-slate-600">
                          {o.quantity}
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold text-slate-900">
                          {formatCurrency(o.total_price)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                        </td>
                      </motion.tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New order"
        description="Place an order for one of your products."
      >
        <OrderForm
          products={products}
          submitting={createMut.isPending}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </>
  );
}
