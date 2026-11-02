import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { useAuth } from './AuthContext';

// Wraps every private route: no session -> login page, remembering where the user was going.
// The target is kept in the URL (not router state) because signing in reloads the page.
export default function RequireAuth() {
  const { user, loading, serverDown, restoreSession, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // The login may well be fine, so don't send the user to the login page for this.
  if (serverDown) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <Alert severity="error">Cannot reach the server. Check that it is running, then try again.</Alert>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => logout()}>Log out</Button>
            <Button variant="contained" onClick={restoreSession}>Try again</Button>
          </Stack>
        </Stack>
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
