import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link, Skeleton, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { money } from '../../lib/agGrid';
import { daysAgo, formatDate, formatDateTime } from '../../lib/format';
import { StatusChip } from '../salesOrders/status';
import ContactDialog from '../../components/ContactDialog';
import { Field, Stat } from '../../components/DetailParts';

const PAGE_SIZE = 20;

export default function CustomerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const canManage = can('customers.manage');
  const navigate = useNavigate();
  const location = useLocation();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/customers/${id}`)
      .then((res) => setCustomer(res.data.customer))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the customer')));
    api
      .get(`/customers/${id}/orders`, { params: { limit: PAGE_SIZE } })
      .then((res) => setOrders(res.data))
      .catch(() => setOrders({ rows: [], total: 0 }));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!location.state?.saved || !customer) return;
    setToast({ severity: 'success', message: `${customer.name} ${location.state.saved}` });
    navigate(location.pathname, { replace: true, state: null });
  }, [location, customer, navigate]);

  const loadMore = async () => {
    const res = await api.get(`/customers/${id}/orders`, { params: { limit: PAGE_SIZE, offset: orders.rows.length } });
    setOrders((prev) => ({ rows: [...prev.rows, ...res.data.rows], total: res.data.total }));
  };

  const setActive = async (isActive) => {
    setBusy(true);
    try {
      const res = await api.patch(`/customers/${id}`, { isActive });
      setCustomer(res.data.customer);
      setToast({ severity: 'success', message: `${res.data.customer.name} ${isActive ? 'activated' : 'deactivated'}` });
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not update the customer') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/customers/${id}`);
      navigate('/customers', { replace: true });
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not delete the customer') });
      setBusy(false);
      setDeleting(false);
    }
  };

  if (loadError) {
    return (
      <Box>
        <Button component={RouterLink} to="/customers" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Customers</Button>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }
  if (!customer) return <Skeleton variant="rounded" height={420} />;

  const { stats } = customer;

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <Button component={RouterLink} to="/customers" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>Customers</Button>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{customer.name}</Typography>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }} color="text.secondary">{customer.code}</Typography>
        </Box>
        {!customer.isActive && <Chip label="Inactive" variant="outlined" />}
        <Box sx={{ flexGrow: 1 }} />
        {canManage && (
          <>
            {customer.isActive
              ? <Button onClick={() => setActive(false)} disabled={busy}>Deactivate</Button>
              : <Button onClick={() => setActive(true)} disabled={busy}>Activate</Button>}
            <Tooltip title={customer.inUse ? 'Has orders - deactivate it instead' : ''}>
              <span>
                <Button color="error" startIcon={<DeleteIcon />} disabled={customer.inUse || busy} onClick={() => setDeleting(true)}>Delete</Button>
              </span>
            </Tooltip>
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(customer)}>Edit</Button>
          </>
        )}
      </Box>

      {!customer.isActive && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This customer is inactive: it can't be picked for new orders. Old orders and invoices are unchanged.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Orders" value={stats.orderCount.toLocaleString()} hint={stats.cancelledCount ? `+ ${stats.cancelledCount} cancelled` : 'completed'} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Revenue" value={money.format(stats.revenue)} hint="completed orders" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Average order" value={money.format(stats.averageOrder)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Last order" value={stats.lastOrder ? formatDate(stats.lastOrder) : '—'}
            hint={stats.lastOrder ? `${daysAgo(stats.lastOrder)} · customer since ${formatDate(stats.firstOrder)}` : 'No orders yet'} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Contact</Typography>
              <Stack spacing={2}>
                <Field label="Contact person">{customer.contactName}</Field>
                <Field label="Phone">{customer.phone && <Link href={`tel:${customer.phone}`}>{customer.phone}</Link>}</Field>
                <Field label="Email">{customer.email && <Link href={`mailto:${customer.email}`}>{customer.email}</Link>}</Field>
                <Field label="Address">{[customer.address, customer.city].filter(Boolean).join('\n')}</Field>
                <Field label="Notes">{customer.notes}</Field>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>Order history</Typography>
                {customer.isActive && can('sales_orders.create') && (
                  <Button size="small" startIcon={<AddIcon />} component={RouterLink} to="/sales-orders/new" state={{ customer }}>New order</Button>
                )}
              </Box>
            </CardContent>
            {!orders && <Skeleton variant="rectangular" height={200} />}
            {orders && orders.rows.length === 0 && (
              <Typography color="text.secondary" sx={{ px: 2, pb: 3 }}>No orders yet.</Typography>
            )}
            {orders && orders.rows.length > 0 && (
              <>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Order</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell align="center">Warehouse</TableCell>
                      <TableCell align="center">Lines</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.rows.map((o) => (
                      <TableRow key={o.id} hover>
                        <TableCell>
                          <Link component={RouterLink} to={`/sales-orders/${o.id}`} underline="hover" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                            {o.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDateTime(o.orderDate)}</TableCell>
                        <TableCell align="center">{o.warehouse.code}</TableCell>
                        <TableCell align="center">{o.itemCount}</TableCell>
                        <TableCell align="right" sx={{ textDecoration: o.status === 'cancelled' ? 'line-through' : 'none' }}>{money.format(o.totalAmount)}</TableCell>
                        <TableCell><StatusChip status={o.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Showing {orders.rows.length.toLocaleString()} of {orders.total.toLocaleString()}
                  </Typography>
                  {orders.rows.length < orders.total && <Button onClick={loadMore}>Load more</Button>}
                </Box>
              </>
            )}
          </Card>
        </Grid>
      </Grid>

      <ContactDialog
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          setCustomer(saved);
          setToast({ severity: 'success', message: `${saved.name} saved` });
        }}
      />

      <Dialog open={deleting} onClose={busy ? undefined : () => setDeleting(false)}>
        <DialogTitle>Delete customer?</DialogTitle>
        <DialogContent>
          <DialogContentText>"{customer.name}" will be deleted. This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={remove} disabled={busy}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        // Just below the top bar instead of covering it.
        sx={{ top: { xs: 64, sm: 76 } }}
      >
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
