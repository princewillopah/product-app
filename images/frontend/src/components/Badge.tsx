import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'brand' | 'green' | 'amber' | 'rose' | 'slate' | 'sky';

const tones: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-50 text-sky-700',
};

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={clsx('badge', tones[tone], className)}>{children}</span>;
}

// Maps an order status string to a sensible colour.
export function statusTone(status: string): Tone {
  const s = (status || '').toLowerCase();
  if (['completed', 'paid', 'delivered', 'success'].includes(s)) return 'green';
  if (['pending', 'processing'].includes(s)) return 'amber';
  if (['cancelled', 'failed', 'error'].includes(s)) return 'rose';
  return 'slate';
}
