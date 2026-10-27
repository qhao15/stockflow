import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './auth/RequireAuth';
import RequirePermission from './auth/RequirePermission';
import Dashboard from './pages/Dashboard';
import ComingSoon from './pages/ComingSoon';
import Login from './pages/Login';
import Register from './pages/Register';
import Users from './pages/Users';
import Account from './pages/Account';
import { navItems } from './navItems';

// Modules that have a real page; the rest show "Coming soon" for now.
const pages = {
  '/admin': Users,
};

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
                <Route
                  key={path}
                  path={path}
                  element={
                    <RequirePermission permission={permission}>
                      {Page ? <Page /> : <ComingSoon title={label} />}
                    </RequirePermission>
                  }
                />
              );
            })}
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}
