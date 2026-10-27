import { Box, Button, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Guards a page by permission. The API enforces the same rule, so this is about a
// clear message for someone who follows a link, not about security.
export default function RequirePermission({ permission, children }) {
  const { user, can } = useAuth();
  if (can(permission)) return children;

  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <LockIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
      <Typography variant="h5" fontWeight={700} sx={{ mt: 2 }}>No access</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Your role ({user?.role}) does not have access to this page. Ask an admin if you need it.
      </Typography>
      <Button variant="contained" component={RouterLink} to="/">Back to dashboard</Button>
    </Box>
  );
}
