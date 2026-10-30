import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link, Skeleton, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import InventoryIcon from '@mui/icons-material/Inventory';
import CloseIcon from '@mui/icons-material/Close';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { money } from '../../lib/agGrid';
import { StatusChip } from './status';
import { formatDate, formatDateTime } from '../../lib/format';

function Field({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography component="div">{children || '—'}</Typography>
    </Box>
  );
}

// Who did each step and when; steps not reached yet are greyed out.
function Timeline({ order }) {
  const steps = [
    { label: 'Created', by: order.createdBy },
    { label: 'Approved', by: order.approvedBy },
    order.status === 'cancelled'
      ? { label: 'Cancelled', by: order.cancelledBy, note: order.cancelReason, error: true }
      : { label: 'Received', by: order.receivedBy },
  ];
  return (
    <Stack spacing={1.5}>
      {steps.map((s) => (
        <Box key={s.label} sx={{ display: 'flex', gap: 1.5, opacity: s.by ? 1 : 0.4 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', mt: 0.8, flexShrink: 0, bgcolor: s.error ? 'error.main' : s.by ? 'primary.main' : 'grey.400' }} />
          <Box>
            <Typography fontWeight={600}>{s.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {s.by ? `${s.by.name} · ${formatDateTime(s.by.at)}` : 'Not yet'}
            </Typography>
            {s.note && <Typography variant="body2">Reason: {s.note}</Typography>}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

const ACTIONS = {
  approve: {
    title: 'Approve purchase order?',
    button: 'Approve',
    text: (o) => `${o.poNumber} for ${money.format(o.totalAmount)} will be approved. After that it can't be edited.`,
    done: 'approved',
  },
  receive: {
    title: 'Receive goods?',
    button: 'Receive',
    text: (o) => `This adds ${o.unitCount.toLocaleString()} units of ${o.itemCount} product${o.itemCount === 1 ? '' : 's'} to the stock of ${o.warehouse.name}. It can't be undone.`,
    done: 'received - stock updated',
  },
  cancel: {
    title: 'Cancel purchase order?',
    button: 'Cancel order',
    text: (o) => `${o.poNumber} will be cancelled. No stock is changed.`,
    done: 'cancelled',
  },
};

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [confirm, setConfirm] = useState(null); // 'approve' | 'receive' | 'cancel'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/purchase-orders/${id}`)
      .then((res) => setOrder(res.data.purchaseOrder))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the purchase order')));
  }, [id]);

  useEffect(load, [load]);

  // Coming from the form: say it was saved, once.
  useEffect(() => {
    if (!location.state?.saved || !order) return;
    setToast({ severity: 'success', message: `${order.poNumber} ${location.state.saved}` });
    navigate(location.pathname, { replace: true, state: null });
  }, [location, order, navigate]);

  const run = async () => {
    const action = confirm;
    setBusy(true);
    try {
      const res = await api.post(`/purchase-orders/${id}/${action}`, action === 'cancel' ? { reason } : undefined);
      setOrder(res.data.purchaseOrder);
      setToast({ severity: 'success', message: `${res.data.purchaseOrder.poNumber} ${ACTIONS[action].done}` });
    } catch (err) {
      // Someone else changed it first (e.g. received it in another tab): show the latest.
      if (err.response?.data?.purchaseOrder) setOrder(err.response.data.purchaseOrder);
      setToast({ severity: 'error', message: errorMessage(err, 'Could not update the purchase order') });
    } finally {
      setBusy(false);
      setConfirm(null);
      setReason('');
    }
  };

  if (loadError) {
    return (
      <Box>
        <Button component={RouterLink} to="/purchase-orders" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Purchase orders</Button>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }
  if (!order) return <Skeleton variant="rounded" height={420} />;

  const { status } = order;
  const actions = {
    edit: status === 'draft' && can('purchase_orders.create'),
    approve: status === 'draft' && can('purchase_orders.approve'),
    receive: status === 'approved' && can('purchase_orders.receive'),
    cancel: ['draft', 'approved'].includes(status) && can('purchase_orders.cancel'),
  };
  const action = confirm && ACTIONS[confirm];

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Button component={RouterLink} to="/purchase-orders" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>Purchase orders</Button>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{order.poNumber}</Typography>
        <StatusChip status={status} size="medium" />
        <Box sx={{ flexGrow: 1 }} />
        {actions.cancel && <Button color="error" startIcon={<CloseIcon />} onClick={() => setConfirm('cancel')}>Cancel order</Button>}
        {actions.edit && <Button startIcon={<EditIcon />} component={RouterLink} to={`/purchase-orders/${id}/edit`}>Edit</Button>}
        {actions.approve && <Button variant="contained" startIcon={<CheckIcon />} onClick={() => setConfirm('approve')}>Approve</Button>}
        {actions.receive && <Button variant="contained" color="success" startIcon={<InventoryIcon />} onClick={() => setConfirm('receive')}>Receive goods</Button>}
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Field label="Supplier">
                      {order.supplier.name}
                      <Typography variant="body2">
                        {can('suppliers.view') ? (
                          <Link component={RouterLink} to={`/suppliers/${order.supplier.id}`} underline="hover" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                            {order.supplier.code}
                          </Link>
                        ) : order.supplier.code}
                      </Typography>
                    </Field>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}><Field label="Deliver to">{order.warehouse.name}</Field></Grid>
                  <Grid size={{ xs: 6, sm: 3 }}><Field label="Order date">{formatDate(order.orderDate)}</Field></Grid>
                  <Grid size={{ xs: 6, sm: 3 }}><Field label="Expected">{formatDate(order.expectedDate)}</Field></Grid>
                  <Grid size={{ xs: 12, sm: 6 }}><Field label="Note">{order.note}</Field></Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="center">Quantity</TableCell>
                    <TableCell align="right">Unit cost</TableCell>
                    <TableCell align="right">Line total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{item.sku}</Typography>
                        <Typography variant="body2">{item.name}</Typography>
                      </TableCell>
                      <TableCell align="center">{item.quantity.toLocaleString()} {item.unit}</TableCell>
                      <TableCell align="right">{money.format(item.unitCost)}</TableCell>
                      <TableCell align="right">{money.format(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{order.unitCount.toLocaleString()}</TableCell>
                    <TableCell />
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 16 }}>{money.format(order.totalAmount)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>History</Typography>
              <Timeline order={order} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={Boolean(action)} onClose={busy ? undefined : () => setConfirm(null)} maxWidth="xs" fullWidth>
        {action && (
          <>
            <DialogTitle>{action.title}</DialogTitle>
            <DialogContent>
              <DialogContentText>{action.text(order)}</DialogContentText>
              {confirm === 'cancel' && (
                <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus fullWidth
                  multiline minRows={2} sx={{ mt: 2 }} inputProps={{ maxLength: 255 }} />
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirm(null)} disabled={busy} autoFocus={confirm !== 'cancel'}>Back</Button>
              <Button variant="contained" color={confirm === 'cancel' ? 'error' : confirm === 'receive' ? 'success' : 'primary'}
                onClick={run} disabled={busy || (confirm === 'cancel' && !reason.trim())}>
                {busy ? 'Working...' : action.button}
              </Button>
            </DialogActions>
          </>
        )}
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
