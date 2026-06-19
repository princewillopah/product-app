import { useEffect, useState } from 'react';
import type { Product, ProductInput } from '../lib/types';

const empty: ProductInput = {
  name: '',
  description: '',
  category: '',
  price: 0,
  stock: 0,
};

type Errors = Partial<Record<keyof ProductInput, string>>;

// Mirrors the product-service validation: name, description, category, price,
// stock are all required (else the backend returns HTTP 400).
function validate(v: ProductInput): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = 'Name is required';
  if (!v.description.trim()) e.description = 'Description is required';
  if (!v.category.trim()) e.category = 'Category is required';
  if (v.price === null || Number.isNaN(v.price) || v.price < 0)
    e.price = 'Enter a valid price';
  if (v.stock === null || Number.isNaN(v.stock) || v.stock < 0 || !Number.isInteger(v.stock))
    e.stock = 'Enter a whole number';
  return e;
}

export function ProductForm({
  initial,
  categories,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: Product;
  categories: string[];
  submitting: boolean;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProductInput>(empty);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? '',
        description: initial.description ?? '',
        category: initial.category ?? '',
        price: initial.price ?? 0,
        stock: initial.stock ?? 0,
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [initial]);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Product name</label>
        <input
          className="input"
          placeholder="e.g. Wireless Headphones"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          autoFocus
        />
        {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input min-h-[80px] resize-none"
          placeholder="Short description of the product"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
        {errors.description && (
          <p className="mt-1 text-xs text-rose-600">{errors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <input
            className="input"
            placeholder="e.g. Electronics"
            list="category-options"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {errors.category && (
            <p className="mt-1 text-xs text-rose-600">{errors.category}</p>
          )}
        </div>

        <div>
          <label className="label">Category preview</label>
          <div className="flex h-[44px] items-center rounded-xl border border-dashed border-slate-200 px-3 text-sm text-slate-400">
            {form.category.trim() || '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Price (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            placeholder="0.00"
            value={Number.isNaN(form.price) ? '' : form.price}
            onChange={(e) => set('price', parseFloat(e.target.value))}
          />
          {errors.price && (
            <p className="mt-1 text-xs text-rose-600">{errors.price}</p>
          )}
        </div>
        <div>
          <label className="label">Stock</label>
          <input
            type="number"
            step="1"
            min="0"
            className="input"
            placeholder="0"
            value={Number.isNaN(form.stock) ? '' : form.stock}
            onChange={(e) => set('stock', parseInt(e.target.value, 10))}
          />
          {errors.stock && (
            <p className="mt-1 text-xs text-rose-600">{errors.stock}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  );
}
