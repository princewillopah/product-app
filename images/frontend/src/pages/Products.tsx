import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Package, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { Topbar } from '../components/Topbar';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProductForm } from '../components/ProductForm';
import { Badge } from '../components/Badge';
import { Skeleton, EmptyState } from '../components/Feedback';
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from '../hooks/useApi';
import type { Product, ProductInput } from '../lib/types';
import { formatCurrency, initials } from '../lib/format';

export function Products() {
  const { data: products = [], isLoading } = useProducts();
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category?.trim()).filter(Boolean))) as string[],
    [products],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesText =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q);
      const matchesCat = category === 'all' || p.category === category;
      return matchesText && matchesCat;
    });
  }, [products, search, category]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleSubmit = (input: ProductInput) => {
    if (editing) {
      updateMut.mutate(
        { id: editing.id, input },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createMut.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    deleteMut.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
  };

  return (
    <>
      <Topbar
        title="Products"
        subtitle={`${products.length} ${products.length === 1 ? 'product' : 'products'} in catalog`}
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={18} /> Add Product
          </button>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-10"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select
              className="input w-auto py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Package size={26} />}
              title={products.length === 0 ? 'No products yet' : 'No matches'}
              message={
                products.length === 0
                  ? 'Create your first product to get started.'
                  : 'Try a different search or category filter.'
              }
              action={
                products.length === 0 ? (
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus size={18} /> Add Product
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5">Product</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5 text-right">Price</th>
                    <th className="px-5 py-3.5 text-right">Stock</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/60"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-violet-500 text-sm font-bold text-white">
                            {initials(p.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">
                              {p.name}
                            </p>
                            <p className="max-w-xs truncate text-xs text-slate-400">
                              {p.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone="brand">{p.category || '—'}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold text-slate-900">
                        {formatCurrency(p.price)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Badge tone={p.stock <= 5 ? 'rose' : p.stock <= 20 ? 'amber' : 'green'}>
                          {p.stock}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="icon-btn"
                            onClick={() => openEdit(p)}
                            aria-label="Edit"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => setToDelete(p)}
                            aria-label="Delete"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit product' : 'New product'}
        description={
          editing ? 'Update the details below.' : 'Add a new product to the catalog.'
        }
      >
        <ProductForm
          initial={editing ?? undefined}
          categories={categories}
          submitting={createMut.isPending || updateMut.isPending}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleteMut.isPending}
        title="Delete product"
        message={`Are you sure you want to delete "${toDelete?.name}"? This action cannot be undone.`}
      />
    </>
  );
}
