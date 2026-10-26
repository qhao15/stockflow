import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './auth/RequireAuth';
import Dashboard from './pages/Dashboard';
import ComingSoon from './pages/ComingSoon';
import Login from './pages/Login';
import Register from './pages/Register';
import { navItems } from './navItems';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {navItems
            .filter((item) => item.path !== '/')
            .map((item) => (
              <Route key={item.path} path={item.path} element={<ComingSoon title={item.label} />} />
            ))}
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}
