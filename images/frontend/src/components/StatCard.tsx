import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useCountUp } from '../lib/format';

type Accent = 'brand' | 'emerald' | 'amber' | 'sky';

const accents: Record<Accent, { ring: string; icon: string; glow: string }> = {
  brand: {
    ring: 'from-brand-500 to-violet-500',
    icon: 'text-white',
    glow: 'shadow-[0_8px_24px_-8px_rgba(99,102,241,0.6)]',
  },
  emerald: {
    ring: 'from-emerald-500 to-teal-500',
    icon: 'text-white',
    glow: 'shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]',
  },
  amber: {
    ring: 'from-amber-500 to-orange-500',
    icon: 'text-white',
    glow: 'shadow-[0_8px_24px_-8px_rgba(245,158,11,0.6)]',
  },
  sky: {
    ring: 'from-sky-500 to-blue-500',
    icon: 'text-white',
    glow: 'shadow-[0_8px_24px_-8px_rgba(14,165,233,0.6)]',
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'brand',
  format = (n: number) => Math.round(n).toLocaleString(),
  sub,
  index = 0,
  loading = false,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: Accent;
  format?: (n: number) => string;
  sub?: string;
  index?: number;
  loading?: boolean;
}) {
  const animated = useCountUp(value);
  const a = accents[accent];

  return (
    <motion.div
      className="card relative overflow-hidden p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {loading ? (
              <span className="inline-block h-8 w-24 skeleton rounded-md align-middle" />
            ) : (
              format(animated)
            )}
          </p>
          {sub && <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p>}
        </div>
        <div
          className={`flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-gradient-to-tr ${a.ring} ${a.glow}`}
        >
          <Icon size={22} className={a.icon} />
        </div>
      </div>
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-tr ${a.ring} opacity-[0.07] blur-2xl`}
      />
    </motion.div>
  );
}
