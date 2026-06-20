import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShoppingBag, Hash, ArrowRight } from 'lucide-react';
import { useOrders, useProducts } from '../hooks/useApi';
import { Badge, statusTone } from '../components/Badge';
import { Skeleton, EmptyState } from '../components/Feedback';
import { formatCurrency, shortId } from '../lib/format';

// Customer-side, read-only view of orders and their live status. Customers
// place orders here as "pending"; an admin moves them through the lifecycle on
// the dashboard, and this page reflects those changes automatically (shared
// query cache + background refetch).
export function StoreOrders() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: products = [] } = useProducts();

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? shortId(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Your orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Status updates automatically as each order is processed.
          </p>
        </div>
        <Link to="/shop" className="btn-ghost">
          Continue shopping <ArrowRight size={16} />
        </Link>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={26} />}
            title="No orders yet"
            message="Place an order from the catalog and it will show up here."
            action={
              <Link to="/shop" className="btn-primary">
                Browse catalog
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-50">
            {orders
              .slice()
              .reverse()
              .map((o, i) => (
                <motion.li
                  key={o.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50/60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {productName(o.product_id)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <Hash size={12} />
                      {shortId(o.id, 8)} · qty {o.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(o.total_price)}
                    </span>
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                  </div>
                </motion.li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
