import { lazy, Suspense, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Card, CardActionArea, CardContent, Chip, Skeleton, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api, { errorMessage } from '../lib/api';
import { money } from '../lib/format';
import { navItems } from '../navItems';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../auth/AuthContext';
import LowStockTable from './dashboard/LowStockTable';

// Loaded only for roles that see the charts: Recharts is large.
const DashboardCharts = lazy(() => import('./dashboard/DashboardCharts'));

// Revenue so far this month against the same days of last month.
function revenueChange(summary) {
  const previous = summary.revenueLastMonthToDate;
  if (!previous) return 'No sales in the same days last month';
  const percent = Math.round(((summary.revenueThisMonth - previous) / previous) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}% vs same days last month`;
}

// summary is null until loaded; the revenue fields are only sent to roles allowed to see them.
const kpis = (s) => [
  {
    label: 'Revenue (this month)', icon: TrendingUpIcon, color: '#1e5eff', permission: 'reports.view',
    value: s && s.revenueThisMonth !== undefined ? money.format(s.revenueThisMonth) : null,
    hint: s && s.revenueThisMonth !== undefined ? revenueChange(s) : '',
  },
  {
    label: 'Sales orders (this month)', icon: ReceiptLongIcon, color: '#12b76a', to: '/sales-orders',
    value: s?.ordersThisMonth.toLocaleString(), hint: s ? `${s.ordersLastMonth.toLocaleString()} last month` : '',
  },
  {
    label: 'Active products', icon: Inventory2Icon, color: '#7a5af8', to: '/products',
    value: s?.activeProducts.toLocaleString(), hint: 'In the catalog',
  },
  {
    label: 'Low-stock products', icon: WarningAmberIcon, color: '#f79009', to: '/stock?lowStock=1',
    value: s?.lowStockProducts.toLocaleString(), hint: 'At or below minimum',
  },
];

// Based on the computer's local time.
function greeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

// Admins only. The public health check says only whether things are up; the database's
// name and version come from a separate Admin endpoint, and errors go to the server log.
function SystemStatus() {
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);
  const [database, setDatabase] = useState(null);

  useEffect(() => {
    api
      .get('/health')
      .then((res) => setHealth(res.data))
      .catch((err) => {
        // 503 still answers: the API is up but the database isn't
        if (err.response?.data?.api) setHealth(err.response.data);
        else setOffline(true);
      });
    api.get('/health/details').then((res) => setDatabase(res.data.database)).catch(() => {});
  }, []);

  if (!health && !offline) return <Skeleton variant="rounded" height={90} />;

  const dbOk = health?.database?.status === 'connected';
  const dbLabel = database ? `Database: ${database.name} (v${database.version})` : 'Database: connected';

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          System status
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={offline ? 'API: offline' : 'API: online'} color={offline ? 'error' : 'success'} size="small" />
          <Chip label={dbOk ? dbLabel : 'Database: disconnected'} color={dbOk ? 'success' : 'error'} size="small" />
        </Box>
        {!dbOk && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            See the server log for details.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    api
      .get('/reports/summary')
      .then((res) => setSummary(res.data))
      .catch((err) => setSummaryError(errorMessage(err, 'Could not load the figures')));
  }, []);

  const visibleKpis = kpis(summary).filter((kpi) => can(kpi.permission));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <LogoMark size={52} />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {greeting()}{user ? `, ${user.name}` : ''}
          </Typography>
          <Typography color="text.secondary">
            Overview of your sales, stock and orders.
          </Typography>
        </Box>
      </Box>

      {summaryError && <Alert severity="error" sx={{ mb: 2 }}>{summaryError}</Alert>}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {visibleKpis.map(({ label, value, hint, to, icon: Icon, color }) => {
          const content = (
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 48, height: 48, borderRadius: 2, display: 'grid', placeItems: 'center', flexShrink: 0,
                  bgcolor: `${color}1a`, color,
                }}
              >
                <Icon />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="h5" fontWeight={700}>
                  {value ?? (summaryError ? '—' : <Skeleton width={90} />)}
                </Typography>
                <Typography variant="caption" color="text.secondary">{hint}</Typography>
              </Box>
            </CardContent>
          );
          return (
            <Grid size={{ xs: 12, sm: 6, lg: 12 / visibleKpis.length }} key={label}>
              <Card sx={{ height: '100%' }}>
                {to ? <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>{content}</CardActionArea> : content}
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {can('reports.view') ? (
        <Suspense fallback={<Skeleton variant="rounded" height={420} sx={{ mb: 3 }} />}>
          <DashboardCharts lowStock={<LowStockTable />} />
        </Suspense>
      ) : (
        can('stock.view') && <Box sx={{ mb: 3 }}><LowStockTable /></Box>
      )}

      {can('settings.manage') && (
        <Box sx={{ mb: 3 }}>
          <SystemStatus />
        </Box>
      )}

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
