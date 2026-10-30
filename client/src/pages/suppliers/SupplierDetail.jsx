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
import { daysAgo, formatDate } from '../../lib/format';
import { StatusChip } from '../purchaseOrders/status';
import ContactDialog from '../../components/ContactDialog';
import { Field, Stat } from '../../components/DetailParts';

const PAGE_SIZE = 20;

export default function SupplierDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const canManage = can('suppliers.manage');
  const navigate = useNavigate();
  const location = useLocation();
  const [supplier, setSupplier] = useState(null);
  const [orders, setOrders] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/suppliers/${id}`)
      .then((res) => setSupplier(res.data.supplier))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the supplier')));
    api
      .get(`/suppliers/${id}/purchase-orders`, { params: { limit: PAGE_SIZE } })
      .then((res) => setOrders(res.data))
      .catch(() => setOrders({ rows: [], total: 0 }));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!location.state?.saved || !supplier) return;
    setToast({ severity: 'success', message: `${supplier.name} ${location.state.saved}` });
    navigate(location.pathname, { replace: true, state: null });
  }, [location, supplier, navigate]);

  const loadMore = async () => {
    const res = await api.get(`/suppliers/${id}/purchase-orders`, { params: { limit: PAGE_SIZE, offset: orders.rows.length } });
    setOrders((prev) => ({ rows: [...prev.rows, ...res.data.rows], total: res.data.total }));
  };

  const setActive = async (isActive) => {
    setBusy(true);
    try {
      const res = await api.patch(`/suppliers/${id}`, { isActive });
      setSupplier(res.data.supplier);
      setToast({ severity: 'success', message: `${res.data.supplier.name} ${isActive ? 'activated' : 'deactivated'}` });
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not update the supplier') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/suppliers/${id}`);
      navigate('/suppliers', { replace: true });
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not delete the supplier') });
      setBusy(false);
      setDeleting(false);
    }
  };

  if (loadError) {
    return (
      <Box>
        <Button component={RouterLink} to="/suppliers" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Suppliers</Button>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }
  if (!supplier) return <Skeleton variant="rounded" height={420} />;

  const { stats } = supplier;

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <Button component={RouterLink} to="/suppliers" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>Suppliers</Button>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{supplier.name}</Typography>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }} color="text.secondary">{supplier.code}</Typography>
        </Box>
        {!supplier.isActive && <Chip label="Inactive" variant="outlined" />}
        <Box sx={{ flexGrow: 1 }} />
        {canManage && (
          <>
            {supplier.isActive
              ? <Button onClick={() => setActive(false)} disabled={busy}>Deactivate</Button>
              : <Button onClick={() => setActive(true)} disabled={busy}>Activate</Button>}
            <Tooltip title={supplier.inUse ? 'Has purchase orders - deactivate it instead' : ''}>
              <span>
                <Button color="error" startIcon={<DeleteIcon />} disabled={supplier.inUse || busy} onClick={() => setDeleting(true)}>Delete</Button>
              </span>
            </Tooltip>
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(supplier)}>Edit</Button>
          </>
        )}
      </Box>

      {!supplier.isActive && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This supplier is inactive: it can't be picked for new purchase orders. Old orders are unchanged.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Received POs" value={stats.receivedCount.toLocaleString()} hint={stats.cancelledCount ? `+ ${stats.cancelledCount} cancelled` : 'delivered'} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Spend" value={money.format(stats.spend)} hint={`average ${money.format(stats.averageOrder)} per PO`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Open POs" value={stats.openCount.toLocaleString()} hint={stats.openCount ? `${money.format(stats.openValue)} on order` : 'nothing on order'} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Last PO" value={stats.lastOrder ? formatDate(stats.lastOrder) : '—'}
            hint={stats.lastOrder ? `${daysAgo(stats.lastOrder)} · first ${formatDate(stats.firstOrder)}` : 'No purchase orders yet'} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Contact</Typography>
              <Stack spacing={2}>
                <Field label="Contact person">{supplier.contactName}</Field>
                <Field label="Phone">{supplier.phone && <Link href={`tel:${supplier.phone}`}>{supplier.phone}</Link>}</Field>
                <Field label="Email">{supplier.email && <Link href={`mailto:${supplier.email}`}>{supplier.email}</Link>}</Field>
                <Field label="Address">{[supplier.address, supplier.address?.endsWith(supplier.city) ? null : supplier.city].filter(Boolean).join('\n')}</Field>
                <Field label="Notes">{supplier.notes}</Field>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>Purchase orders</Typography>
                {supplier.isActive && can('purchase_orders.create') && (
                  <Button size="small" startIcon={<AddIcon />} component={RouterLink} to="/purchase-orders/new" state={{ supplierId: supplier.id }}>
                    New purchase order
                  </Button>
                )}
              </Box>
            </CardContent>
            {!orders && <Skeleton variant="rectangular" height={200} />}
            {orders && orders.rows.length === 0 && (
              <Typography color="text.secondary" sx={{ px: 2, pb: 3 }}>No purchase orders yet.</Typography>
            )}
            {orders && orders.rows.length > 0 && (
              <>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>PO number</TableCell>
                      <TableCell>Order date</TableCell>
                      <TableCell align="center">Warehouse</TableCell>
                      <TableCell align="center">Lines</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.rows.map((po) => (
                      <TableRow key={po.id} hover>
                        <TableCell>
                          <Link component={RouterLink} to={`/purchase-orders/${po.id}`} underline="hover" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                            {po.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(po.orderDate)}</TableCell>
                        <TableCell align="center">{po.warehouse.code}</TableCell>
                        <TableCell align="center">{po.itemCount}</TableCell>
                        <TableCell align="right" sx={{ textDecoration: po.status === 'cancelled' ? 'line-through' : 'none' }}>{money.format(po.totalAmount)}</TableCell>
                        <TableCell><StatusChip status={po.status} /></TableCell>
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
        kind="supplier"
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          setSupplier(saved);
          setToast({ severity: 'success', message: `${saved.name} saved` });
        }}
      />

      <Dialog open={deleting} onClose={busy ? undefined : () => setDeleting(false)}>
        <DialogTitle>Delete supplier?</DialogTitle>
        <DialogContent>
          <DialogContentText>"{supplier.name}" will be deleted. This cannot be undone.</DialogContentText>
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
