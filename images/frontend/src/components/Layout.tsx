import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

// Admin app shell: fixed sidebar + scrollable content column. The active route
// renders into the Outlet.
export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="pl-64">
        <main className="min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
