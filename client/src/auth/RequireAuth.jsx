import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './AuthContext';

// Wraps every private route: no session -> login page, remembering where the user was going.
// The target is kept in the URL (not router state) because signing in reloads the page.
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    const target = location.pathname + location.search;
    const to = target === '/' ? '/login' : `/login?redirect=${encodeURIComponent(target)}`;
    return <Navigate to={to} replace />;
  }

  return <Outlet />;
}
