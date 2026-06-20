import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  ExternalLink,
  Boxes,
  Store,
} from 'lucide-react';
import clsx from 'clsx';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package, end: false },
  { to: '/orders', label: 'Orders', icon: ShoppingCart, end: false },
];

// Quick links to the observability stack (host-mapped). New tab.
const observability = [
  { href: 'http://localhost:3000', label: 'Grafana', icon: BarChart3 },
  { href: 'http://localhost:9090', label: 'Prometheus', icon: BarChart3 },
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-slate-300">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-violet-500 shadow-glow">
          <Boxes size={22} className="text-white" />
        </div>
        <div>
          <p className="text-[15px] font-bold leading-tight text-white">
            Product Console
          </p>
          <p className="text-xs text-slate-400">Commerce Platform</p>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="mt-2 flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Menu
        </p>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-gradient-to-tr from-brand-600/90 to-violet-600/80 text-white shadow-lg'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}

        <NavLink
          to="/shop"
          className="group relative mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/5 hover:text-white"
        >
          <Store size={19} />
          <span className="flex-1">Customer Storefront</span>
          <ExternalLink size={14} className="text-slate-500" />
        </NavLink>

        <p className="px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Observability
        </p>
        {observability.map(({ href, label, icon: Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/5 hover:text-white"
          >
            <Icon size={19} />
            <span className="flex-1">{label}</span>
            <ExternalLink size={14} className="text-slate-500" />
          </a>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs font-medium text-slate-300">Kubernetes • kind</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            GitOps-managed via ArgoCD
          </p>
        </div>
      </div>
    </aside>
  );
}
