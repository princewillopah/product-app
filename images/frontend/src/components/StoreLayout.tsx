import { NavLink, Outlet, Link } from 'react-router-dom';
import { Store, ShoppingBag, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { useOrders } from '../hooks/useApi';

// Customer-facing shell: a light, spacious storefront with a top nav. Distinct
// from the dark admin Sidebar so the two surfaces feel like different products,
// even though they share one SPA, one /api proxy, and one query cache (so a
// customer order reflects on the admin dashboard immediately).
const navCls = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-slate-900 text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  );

export function StoreLayout() {
  const { data: orders = [] } = useOrders();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link to="/shop" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-violet-500 shadow-glow">
              <Store size={20} className="text-white" />
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight text-slate-900">
                Product Store
              </p>
              <p className="text-xs text-slate-500">Browse &amp; order</p>
            </div>
          </Link>

          <nav className="flex items-center gap-1.5">
            <NavLink to="/shop" end className={navCls}>
              Catalog
            </NavLink>
            <NavLink to="/shop/orders" className={navCls}>
              <span className="inline-flex items-center gap-2">
                <ShoppingBag size={16} />
                Orders
                {orders.length > 0 && (
                  <span className="badge bg-brand-50 text-brand-700">
                    {orders.length}
                  </span>
                )}
              </span>
            </NavLink>
            <Link
              to="/"
              className="ml-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-700"
              title="Back to the admin console"
            >
              <ArrowLeft size={15} /> Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-4 text-center text-xs text-slate-400">
        Product Store · every order reflects live on the admin dashboard
      </footer>
    </div>
  );
}
