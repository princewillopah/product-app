import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

// App shell: fixed sidebar + scrollable content column.
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="pl-64">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
