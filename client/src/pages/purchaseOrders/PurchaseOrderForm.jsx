import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, IconButton, MenuItem, Skeleton, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import api, { errorMessage } from '../../lib/api';
import { money } from '../../lib/agGrid';
import ProductPicker from '../../components/ProductPicker';

const emptyForm = { supplierId: '', warehouseId: '', expectedDate: '', note: '', items: [] };

// Line total in cents, so the numbers shown add up exactly like the server's.
const lineCents = (item) => {
  const qty = Number(item.quantity);
  const cost = Number(item.unitCost);
  return Number.isInteger(qty) && qty > 0 && cost >= 0 ? qty * Math.round(cost * 100) : 0;
};

// New PO (/purchase-orders/new) or edit a draft (/purchase-orders/:id/edit).
export default function PurchaseOrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [options, setOptions] = useState(null);
  // Coming from a supplier's page ("New purchase order"): start with that supplier picked.
  const location = useLocation();
  const [form, setForm] = useState({ ...emptyForm, supplierId: location.state?.supplierId ?? '' });
  const [version, setVersion] = useState(null);
  const [poNumber, setPoNumber] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const requests = [api.get('/suppliers', { params: { limit: 500 } }), api.get('/warehouses')];
    if (isEdit) requests.push(api.get(`/purchase-orders/${id}`));
    Promise.all(requests)
      .then(([s, w, po]) => {
        setOptions({ suppliers: s.data.rows, warehouses: w.data.warehouses });
        if (!po) return;
        const order = po.data.purchaseOrder;
        if (order.status !== 'draft') {
          setLoadError(`${order.poNumber} is ${order.status}. Only drafts can be edited.`);
          return;
        }
        setPoNumber(order.poNumber);
        setVersion(order.version);
        setForm({
          supplierId: order.supplier.id,
          warehouseId: order.warehouse.id,
          expectedDate: order.expectedDate ?? '',
          note: order.note ?? '',
          items: order.items.map((i) => ({
            product: { id: i.productId, sku: i.sku, name: i.name, unit: i.unit },
            quantity: String(i.quantity),
            unitCost: String(i.unitCost),
          })),
        });
      })
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the purchase order')));
  }, [id, isEdit]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const setItem = (index, field) => (e) => setForm((prev) => ({
    ...prev,
    items: prev.items.map((item, i) => (i === index ? { ...item, [field]: e.target.value } : item)),
  }));
  const removeItem = (index) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  const addProduct = (product) => setForm((prev) => ({
    ...prev,
    items: [...prev.items, { product, quantity: '1', unitCost: String(product.costPrice) }],
  }));

  const totalCents = form.items.reduce((sum, item) => sum + lineCents(item), 0);
  const unitCount = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const usedIds = useMemo(() => form.items.map((i) => i.product.id), [form.items]);

  // Active ones, plus the current choice when editing (it may have been deactivated since).
  const selectable = (list, currentId) => list.filter((x) => x.isActive || x.id === currentId);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      supplierId: form.supplierId,
      warehouseId: form.warehouseId,
      expectedDate: form.expectedDate || null,
      note: form.note,
      items: form.items.map((i) => ({ productId: i.product.id, quantity: Number(i.quantity), unitCost: i.unitCost })),
    };
    try {
      const res = isEdit
        ? await api.put(`/purchase-orders/${id}`, { ...body, version })
        : await api.post('/purchase-orders', body);
      navigate(`/purchase-orders/${res.data.purchaseOrder.id}`, { state: { saved: isEdit ? 'saved' : 'created' } });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the purchase order'));
      setSaving(false);
    }
  };

  const back = isEdit ? `/purchase-orders/${id}` : '/purchase-orders';

  if (loadError) {
    return (
      <Box>
        <Button component={RouterLink} to={back} startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="warning">{loadError}</Alert>
      </Box>
    );
  }
  if (!options) return <Skeleton variant="rounded" height={420} />;

  return (
    <Box component="form" onSubmit={submit} sx={{ maxWidth: 1100 }}>
      <Button component={RouterLink} to={back} startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>Back</Button>
      <Typography variant="h5" fontWeight={700}>{isEdit ? `Edit ${poNumber}` : 'New purchase order'}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Saved as a draft. It can be changed until it's approved.
      </Typography>

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select fullWidth label="Supplier" value={form.supplierId} onChange={set('supplierId')} required>
                  {selectable(options.suppliers, form.supplierId).map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select fullWidth label="Deliver to warehouse" value={form.warehouseId} onChange={set('warehouseId')} required>
                  {selectable(options.warehouses, form.warehouseId).map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth type="date" label="Expected delivery" value={form.expectedDate} onChange={set('expectedDate')}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField fullWidth label="Note" value={form.note} onChange={set('note')} inputProps={{ maxLength: 500 }} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Products</Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="center" sx={{ width: 130 }}>Quantity</TableCell>
                  <TableCell align="center" sx={{ width: 150 }}>Unit cost</TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>Line total</TableCell>
                  <TableCell sx={{ width: 56 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {form.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
                      No products yet. Search below to add the first one.
                    </TableCell>
                  </TableRow>
                )}
                {form.items.map((item, index) => (
                  <TableRow key={item.product.id}>
                    <TableCell>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{item.product.sku}</Typography>
                      <Typography variant="body2">{item.product.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <TextField size="small" type="number" value={item.quantity} onChange={setItem(index, 'quantity')} required
                        inputProps={{ min: 1, step: 1, style: { textAlign: 'center' } }} />
                    </TableCell>
                    <TableCell>
                      <TextField size="small" type="number" value={item.unitCost} onChange={setItem(index, 'unitCost')} required
                        inputProps={{ min: 0, step: 0.01, style: { textAlign: 'center' } }} />
                    </TableCell>
                    <TableCell align="right">{money.format(lineCents(item) / 100)}</TableCell>
                    <TableCell>
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => removeItem(index)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {form.items.length > 0 && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{unitCount.toLocaleString()}</TableCell>
                    <TableCell />
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 16 }}>{money.format(totalCents / 100)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ProductPicker onSelect={addProduct} excludeIds={usedIds} />
          </CardContent>
        </Card>

        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button component={RouterLink} to={back} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || form.items.length === 0}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create draft'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
