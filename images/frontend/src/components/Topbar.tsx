import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const fetching = useIsFetching();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {/* Live data indicator */}
          <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span
                className={clsx(
                  'absolute inline-flex h-full w-full rounded-full opacity-75',
                  fetching ? 'animate-ping bg-emerald-400' : 'bg-emerald-400',
                )}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-slate-600">
              {fetching ? 'Syncing…' : 'Live'}
            </span>
          </div>

          <button
            className="icon-btn border border-slate-200"
            onClick={() => qc.invalidateQueries()}
            aria-label="Refresh data"
            title="Refresh now"
          >
            <RefreshCw size={16} className={clsx(fetching && 'animate-spin')} />
          </button>

          {actions}
        </div>
      </div>
    </header>
  );
}
