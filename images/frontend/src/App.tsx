import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { StoreLayout } from './components/StoreLayout';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Orders } from './pages/Orders';
import { Storefront } from './pages/Storefront';
import { StoreOrders } from './pages/StoreOrders';

export default function App() {
  return (
    <Routes>
      {/* Customer-facing storefront (light, no admin sidebar) */}
      <Route path="/shop" element={<StoreLayout />}>
        <Route index element={<Storefront />} />
        <Route path="orders" element={<StoreOrders />} />
      </Route>

      {/* Admin console */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="orders" element={<Orders />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
