import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LinearProgress } from '@mui/material';
import Layout from './components/Layout';
import RequireAuth from './auth/RequireAuth';
import RequirePermission from './auth/RequirePermission';
import Dashboard from './pages/Dashboard';
import ComingSoon from './pages/ComingSoon';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminPage from './pages/admin/AdminPage';
import Account from './pages/Account';
import { navItems } from './navItems';

// Loaded on first visit: AG Grid is large, and not every user opens these pages.
const ProductsPage = lazy(() => import('./pages/products/ProductsPage'));
const StockPage = lazy(() => import('./pages/stock/StockPage'));
const PurchaseOrdersPage = lazy(() => import('./pages/purchaseOrders/PurchaseOrdersPage'));
const PurchaseOrderForm = lazy(() => import('./pages/purchaseOrders/PurchaseOrderForm'));
const PurchaseOrderDetail = lazy(() => import('./pages/purchaseOrders/PurchaseOrderDetail'));
const SalesOrdersPage = lazy(() => import('./pages/salesOrders/SalesOrdersPage'));
const SalesOrderForm = lazy(() => import('./pages/salesOrders/SalesOrderForm'));
const SalesOrderDetail = lazy(() => import('./pages/salesOrders/SalesOrderDetail'));
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage'));
const CustomerDetail = lazy(() => import('./pages/customers/CustomerDetail'));
const SuppliersPage = lazy(() => import('./pages/suppliers/SuppliersPage'));
const SupplierDetail = lazy(() => import('./pages/suppliers/SupplierDetail'));

// Modules that have a real page; the rest show "Coming soon" for now.
const pages = {
  '/admin': AdminPage,
  '/products': ProductsPage,
  '/stock': StockPage,
  '/purchase-orders': PurchaseOrdersPage,
  '/sales-orders': SalesOrdersPage,
  '/customers': CustomersPage,
  '/suppliers': SuppliersPage,
};

// Pages below a module (detail, form), each with the permission it needs.
const subPages = [
  { path: '/purchase-orders/new', Page: PurchaseOrderForm, permission: 'purchase_orders.create' },
  { path: '/purchase-orders/:id', Page: PurchaseOrderDetail, permission: 'purchase_orders.view' },
  { path: '/purchase-orders/:id/edit', Page: PurchaseOrderForm, permission: 'purchase_orders.create' },
  { path: '/sales-orders/new', Page: SalesOrderForm, permission: 'sales_orders.create' },
  { path: '/sales-orders/:id', Page: SalesOrderDetail, permission: 'sales_orders.view' },
  { path: '/customers/:id', Page: CustomerDetail, permission: 'customers.view' },
  { path: '/suppliers/:id', Page: SupplierDetail, permission: 'suppliers.view' },
];

const guarded = (permission, element) => (
  <RequirePermission permission={permission}>
    <Suspense fallback={<LinearProgress />}>{element}</Suspense>
  </RequirePermission>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/account" element={<Account />} />
          {navItems
            .filter((item) => item.path !== '/')
            .map(({ path, label, permission }) => {
              const Page = pages[path];
              return (
                <Route key={path} path={path} element={guarded(permission, Page ? <Page /> : <ComingSoon title={label} />)} />
              );
            })}
          {subPages.map(({ path, Page, permission }) => (
            <Route key={path} path={path} element={guarded(permission, <Page />)} />
          ))}
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}
