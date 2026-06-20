import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Minus, Plus, PackageOpen, Tag, Sparkles } from 'lucide-react';
import { useProducts, useCreateOrder } from '../hooks/useApi';
import type { Product } from '../lib/types';
import { Badge } from '../components/Badge';
import { Skeleton, EmptyState } from '../components/Feedback';
import { formatCurrency } from '../lib/format';

// Stock -> a friendly availability pill.
function stockLabel(stock: number): { tone: 'green' | 'amber' | 'rose'; text: string } {
  if (stock <= 0) return { tone: 'rose', text: 'Out of stock' };
  if (stock <= 5) return { tone: 'amber', text: `Only ${stock} left` };
  return { tone: 'green', text: 'In stock' };
}

function QtyStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200">
      <button
        type="button"
        aria-label="Decrease quantity"
        className="icon-btn rounded-l-xl rounded-r-none disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={disabled || value <= 1}
      >
        <Minus size={15} />
      </button>
      <span className="w-9 text-center text-sm font-semibold text-slate-800">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        className="icon-btn rounded-r-xl rounded-l-none disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export function Storefront() {
  const { data: products = [], isLoading } = useProducts();
  const createMut = useCreateOrder();
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});

  const getQty = (id: string) => qty[id] ?? 1;
  const setProductQty = (id: string, n: number) =>
    setQty((q) => ({ ...q, [id]: n }));

  const placeOrder = (p: Product) => {
    setOrderingId(p.id);
    createMut.mutate(
      { product_id: p.id, quantity: getQty(p.id) },
      {
        onSuccess: () => setProductQty(p.id, 1),
        onSettled: () => setOrderingId(null),
      },
    );
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-tr from-brand-600 via-brand-500 to-violet-500 px-7 py-9 text-white shadow-glow">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
          <Sparkles size={14} /> Fresh picks
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Shop the catalog
        </h1>
        <p className="mt-2 max-w-lg text-sm text-white/80">
          Browse the products below and place an order in one click. Your order
          starts as <span className="font-semibold">pending</span> and updates
          as it is processed.
        </p>
      </section>

      {/* Catalog */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<PackageOpen size={26} />}
            title="No products available"
            message="Check back soon — new products will appear here as they are added."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p, i) => {
            const s = stockLabel(p.stock);
            const ordering = orderingId === p.id;
            const soldOut = p.stock <= 0;
            return (
              <motion.div
                key={p.id}
                className="card flex flex-col p-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <Badge tone="brand">
                    <Tag size={12} /> {p.category}
                  </Badge>
                  <Badge tone={s.tone}>{s.text}</Badge>
                </div>

                <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
                  {p.description}
                </p>

                <div className="mt-4 flex items-end justify-between">
                  <p className="text-2xl font-extrabold text-slate-900">
                    {formatCurrency(p.price)}
                  </p>
                  <QtyStepper
                    value={getQty(p.id)}
                    max={Math.max(1, p.stock)}
                    disabled={soldOut || ordering}
                    onChange={(n) => setProductQty(p.id, n)}
                  />
                </div>

                <button
                  className="btn-primary mt-4 w-full"
                  onClick={() => placeOrder(p)}
                  disabled={soldOut || ordering}
                >
                  <ShoppingCart size={17} />
                  {soldOut ? 'Sold out' : ordering ? 'Placing…' : 'Order now'}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
