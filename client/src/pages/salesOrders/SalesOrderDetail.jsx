import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Skeleton, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import api, { downloadFile, errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { money } from '../../lib/agGrid';
import { formatDateTime } from '../../lib/format';
import { StatusChip } from './status';

function Field({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography component="div">{children || '—'}</Typography>
    </Box>
  );
}

export default function SalesOrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/sales-orders/${id}`)
      .then((res) => setOrder(res.data.salesOrder))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the order')));
  }, [id]);

  useEffect(load, [load]);

  // Coming from the form: say it was created, once.
  useEffect(() => {
    if (!location.state?.saved || !order) return;
    setToast({ severity: 'success', message: `${order.orderNumber} created - stock updated` });
    navigate(location.pathname, { replace: true, state: null });
  }, [location, order, navigate]);

  const cancelOrder = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/sales-orders/${id}/cancel`, { reason });
      setOrder(res.data.salesOrder);
      setToast({ severity: 'success', message: `${res.data.salesOrder.orderNumber} cancelled - stock returned` });
    } catch (err) {
      if (err.response?.data?.salesOrder) setOrder(err.response.data.salesOrder);
      setToast({ severity: 'error', message: errorMessage(err, 'Could not cancel the order') });
    } finally {
      setBusy(false);
      setCancelling(false);
      setReason('');
    }
  };

  const downloadInvoice = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/sales-orders/${id}/invoice.pdf`, undefined, `invoice-${order.orderNumber}.pdf`);
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not download the invoice') });
    } finally {
      setDownloading(false);
    }
  };

  if (loadError) {
    return (
      <Box>
        <Button component={RouterLink} to="/sales-orders" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Sales orders</Button>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }
  if (!order) return <Skeleton variant="rounded" height={420} />;

  const canCancel = order.status === 'completed' && can('sales_orders.cancel');

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Button component={RouterLink} to="/sales-orders" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>Sales orders</Button>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{order.orderNumber}</Typography>
        <StatusChip status={order.status} size="medium" />
        <Box sx={{ flexGrow: 1 }} />
        {canCancel && <Button color="error" startIcon={<CloseIcon />} onClick={() => setCancelling(true)}>Cancel order</Button>}
        <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={downloadInvoice} disabled={downloading}>
          {downloading ? 'Preparing...' : 'Download invoice'}
        </Button>
      </Box>

      {order.status === 'cancelled' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Cancelled by {order.cancelledBy.name} on {formatDateTime(order.cancelledBy.at)}: {order.cancelReason}. The stock was returned to {order.warehouse.name}.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="center">Quantity</TableCell>
                  <TableCell align="right">Unit price</TableCell>
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
                    <TableCell align="right">{money.format(item.unitPrice)}</TableCell>
                    <TableCell align="right">{money.format(item.lineTotal)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ color: 'text.secondary' }}>Subtotal</TableCell>
                  <TableCell align="right">{money.format(order.subtotal)}</TableCell>
                </TableRow>
                {order.discount > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="right" sx={{ color: 'text.secondary' }}>Discount</TableCell>
                    <TableCell align="right">-{money.format(order.discount)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 16 }}>{money.format(order.totalAmount)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Field label="Customer">
                  {order.customer.name}
                  <Typography variant="body2" color="text.secondary">
                    {[order.customer.code, order.customer.contactName, order.customer.phone].filter(Boolean).join(' · ')}
                  </Typography>
                </Field>
                <Field label="Shipped from">{order.warehouse.name}</Field>
                <Field label="Date">{formatDateTime(order.orderDate)}</Field>
                <Field label="Sold by">{order.createdBy.name}</Field>
                <Field label="Note">{order.note}</Field>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={cancelling} onClose={busy ? undefined : () => setCancelling(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel order?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {order.orderNumber} will be cancelled and its {order.unitCount.toLocaleString()} unit{order.unitCount === 1 ? '' : 's'} returned
            to {order.warehouse.name}. This can't be undone.
          </DialogContentText>
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus fullWidth
            multiline minRows={2} sx={{ mt: 2 }} inputProps={{ maxLength: 255 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(false)} disabled={busy}>Back</Button>
          <Button variant="contained" color="error" onClick={cancelOrder} disabled={busy || !reason.trim()}>
            {busy ? 'Cancelling...' : 'Cancel order'}
          </Button>
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
