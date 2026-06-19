import { useMemo } from 'react';
import {
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Boxes,
  Tag,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { Topbar } from '../components/Topbar';
import { StatCard } from '../components/StatCard';
import { Badge, statusTone } from '../components/Badge';
import { Skeleton } from '../components/Feedback';
import { useProducts, useOrders } from '../hooks/useApi';
import { formatCurrency, formatNumber, pluralize, shortId } from '../lib/format';

const CATEGORY_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#0ea5e9',
  '#f43f5e',
  '#14b8a6',
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-xs font-semibold text-slate-700">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs text-slate-600">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: p.color || p.payload?.fill }}
          />
          {p.name}: <span className="font-semibold">{formatNumber(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { data: products = [], isLoading: pLoading } = useProducts();
  const { data: orders = [], isLoading: oLoading } = useOrders();

  // ---- Headline metrics: derived from the SAME lists the pages render ----
  const totalRevenue = useMemo(
    () => orders.reduce((acc, o) => acc + Number(o.total_price || 0), 0),
    [orders],
  );
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;

  // ---- Aggregations for charts ----
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const c = p.category?.trim() || 'Uncategorized';
      map.set(c, (map.get(c) || 0) + 1);
    }
    return Array.from(map, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count,
    );
  }, [products]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const s = o.status?.trim() || 'unknown';
      map.set(s, (map.get(s) || 0) + 1);
    }
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [orders]);

  const recentProducts = useMemo(() => products.slice(-5).reverse(), [products]);
  const recentOrders = useMemo(() => orders.slice(-5).reverse(), [orders]);
  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? shortId(id);

  const loading = pLoading || oLoading;

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Live overview of products, orders and revenue"
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Products"
            value={products.length}
            icon={Package}
            accent="brand"
            index={0}
            loading={loading}
            sub={pluralize(byCategory.length, 'category', 'categories')}
          />
          <StatCard
            label="Total Orders"
            value={orders.length}
            icon={ShoppingCart}
            accent="sky"
            index={1}
            loading={loading}
            sub={pluralize(byStatus.length, 'status', 'statuses')}
          />
          <StatCard
            label="Total Revenue"
            value={totalRevenue}
            icon={DollarSign}
            accent="emerald"
            index={2}
            loading={loading}
            format={formatCurrency}
          />
          <StatCard
            label="Avg Order Value"
            value={avgOrder}
            icon={TrendingUp}
            accent="amber"
            index={3}
            loading={loading}
            format={formatCurrency}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Products by category */}
          <motion.div
            className="card p-5 lg:col-span-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.4 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Tag size={18} className="text-brand-500" />
              <h3 className="text-sm font-semibold text-slate-800">
                Products by Category
              </h3>
            </div>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : byCategory.length === 0 ? (
              <EmptyChart message="No products yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byCategory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="count" name="Products" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          {/* Orders by status */}
          <motion.div
            className="card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <ShoppingCart size={18} className="text-sky-500" />
              <h3 className="text-sm font-semibold text-slate-800">
                Orders by Status
              </h3>
            </div>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : byStatus.length === 0 ? (
              <EmptyChart message="No orders yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={byStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {byStatus.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    formatter={(v) => (
                      <span className="text-xs capitalize text-slate-600">{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* Recent activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentCard
            title="Recent Products"
            icon={<Boxes size={18} className="text-brand-500" />}
            loading={loading}
            empty={recentProducts.length === 0}
          >
            {recentProducts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-slate-50 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.category}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={p.stock <= 5 ? 'rose' : 'slate'}>{p.stock} in stock</Badge>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(p.price)}
                  </span>
                </div>
              </div>
            ))}
          </RecentCard>

          <RecentCard
            title="Recent Orders"
            icon={<ShoppingCart size={18} className="text-sky-500" />}
            loading={loading}
            empty={recentOrders.length === 0}
          >
            {recentOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 border-b border-slate-50 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {productName(o.product_id)}
                  </p>
                  <p className="text-xs text-slate-400">Qty {o.quantity}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(o.total_price)}
                  </span>
                </div>
              </div>
            ))}
          </RecentCard>
        </div>
      </div>
    </>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
      {message}
    </div>
  );
}

function RecentCard({
  title,
  icon,
  loading,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {loading ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : empty ? (
        <p className="py-8 text-center text-sm text-slate-400">Nothing here yet</p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
