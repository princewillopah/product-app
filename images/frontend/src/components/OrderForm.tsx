import { useState } from 'react';
import { Package } from 'lucide-react';
import type { Product, OrderInput } from '../lib/types';
import { formatCurrency } from '../lib/format';

export function OrderForm({
  products,
  submitting,
  onSubmit,
  onCancel,
}: {
  products: Product[];
  submitting: boolean;
  onSubmit: (input: OrderInput) => void;
  onCancel: () => void;
}) {
  const [productId, setProductId] = useState<string>(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState<number>(1);
  const [error, setError] = useState<string>('');

  const selected = products.find((p) => p.id === productId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      setError('Select a product');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Quantity must be a whole number greater than 0');
      return;
    }
    setError('');
    onSubmit({ product_id: productId, quantity });
  };

  if (products.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-500">
        You need at least one product before creating an order.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Product</label>
        <select
          className="input appearance-none"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatCurrency(p.price)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Quantity</label>
        <input
          type="number"
          min="1"
          step="1"
          className="input"
          value={Number.isNaN(quantity) ? '' : quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
        />
      </div>

      {/* Selected product summary */}
      {selected && (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-gradient-to-tr from-brand-500 to-violet-500 text-white">
            <Package size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {selected.name}
            </p>
            <p className="text-xs text-slate-500">
              {selected.category} • {selected.stock} in stock
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-900">
            {formatCurrency(selected.price)}
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400">
        The order service calculates and returns the final total on submit.
      </p>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Placing…' : 'Place order'}
        </button>
      </div>
    </form>
  );
}
