import { useEffect, useRef, useState } from 'react';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const number = new Intl.NumberFormat('en-US');

export function formatCurrency(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number): string {
  return number.format(Number.isFinite(value) ? value : 0);
}

export function shortId(id: string, len = 8): string {
  if (!id) return '—';
  return id.length <= len ? id : `${id.slice(0, len)}…`;
}

export function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// Returns "<count> <word>" with correct singular/plural, e.g. pluralize(1,
// 'category', 'categories') -> "1 category". Falls back to appending 's'.
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : plural ?? `${singular}s`;
  return `${formatNumber(count)} ${word}`;
}

// Smoothly animates a number from its previous value to the next one. Used by
// the dashboard stat cards so updates feel alive rather than snapping.
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current ?? 0);

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (target - from) * eased;
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current ?? 0);
  }, [target, duration]);

  return value;
}
