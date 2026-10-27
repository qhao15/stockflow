import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardActionArea, CardContent, Chip, Skeleton, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api from '../api/client';
import { navItems } from '../navItems';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../auth/AuthContext';

// Placeholder KPIs - wired to real data once the sales/stock modules exist.
const kpis = [
  { label: 'Revenue (this month)', value: '—', icon: TrendingUpIcon, color: '#1e5eff', permission: 'reports.view' },
  { label: 'Sales orders', value: '—', icon: ReceiptLongIcon, color: '#12b76a' },
  { label: 'Products', value: '—', icon: Inventory2Icon, color: '#7a5af8' },
  { label: 'Low-stock items', value: '—', icon: WarningAmberIcon, color: '#f79009' },
];

function SystemStatus() {
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api
      .get('/health')
      .then((res) => setHealth(res.data))
      .catch((err) => {
        // 503 still carries a body describing the DB error
        if (err.response?.data?.api) setHealth(err.response.data);
        else setOffline(true);
      });
  }, []);

  if (!health && !offline) return <Skeleton variant="rounded" height={90} />;

  const dbOk = health?.database?.status === 'connected';

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          System status
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={offline ? 'API: offline' : 'API: online'} color={offline ? 'error' : 'success'} size="small" />
          <Chip
            label={dbOk ? `MySQL: ${health.database.name} (v${health.database.version})` : 'MySQL: disconnected'}
            color={dbOk ? 'success' : 'error'}
            size="small"
          />
        </Box>
        {!dbOk && health?.database?.error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            {health.database.error}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const visibleKpis = kpis.filter((kpi) => can(kpi.permission));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <LogoMark size={52} />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Welcome back{user ? `, ${user.name}` : ''}
          </Typography>
          <Typography color="text.secondary">
            Overview of your sales, stock and orders.
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {visibleKpis.map(({ label, value, icon: Icon, color }) => (
          <Grid size={{ xs: 12, sm: 6, lg: 12 / visibleKpis.length }} key={label}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    width: 48, height: 48, borderRadius: 2, display: 'grid', placeItems: 'center',
                    bgcolor: `${color}1a`, color,
                  }}
                >
                  <Icon />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="h5" fontWeight={700}>{value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mb: 3 }}>
        <SystemStatus />
      </Box>

      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        Modules
      </Typography>
      <Grid container spacing={2}>
        {navItems
          .filter((item) => item.path !== '/' && can(item.permission))
          .map(({ label, path, description, icon: Icon }) => (
            <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={path}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea component={RouterLink} to={path} sx={{ height: '100%' }}>
                  <CardContent sx={{ display: 'flex', gap: 2 }}>
                    <Icon color="primary" />
                    <Box>
                      <Typography fontWeight={600}>{label}</Typography>
                      <Typography variant="body2" color="text.secondary">{description}</Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
      </Grid>
    </Box>
  );
}
