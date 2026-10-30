import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
import CustomerPicker from '../../components/CustomerPicker';

const cents = (amount) => Math.round(Number(amount) * 100);

// New sales order. Prices are the products' current sale prices (the server uses its own
// copy, not what the browser shows). The available column is the stock in the chosen
// warehouse; the server checks it again under a row lock when the order is saved.
export default function SalesOrderForm() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [available, setAvailable] = useState({}); // productId -> quantity in the chosen warehouse
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/warehouses')
      .then((res) => {
        const active = res.data.warehouses.filter((w) => w.isActive);
        setWarehouses(active);
        if (active.length === 1) setWarehouseId(active[0].id);
      })
      .catch((err) => setError(errorMessage(err, 'Could not load warehouses')));
  }, []);

  // Refresh what's available whenever the warehouse or the set of products changes.
  const productIds = useMemo(() => items.map((i) => i.product.id), [items]);
  const idsKey = productIds.join(',');
  useEffect(() => {
    if (!warehouseId || !idsKey) return;
    let cancelled = false;
    api
      .get('/stock', { params: { ids: idsKey, limit: 500 } })
      .then((res) => {
        if (cancelled) return;
        setAvailable(Object.fromEntries(res.data.rows.map((r) => [r.id, r.quantities[warehouseId] ?? 0])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [warehouseId, idsKey]);

  const addProduct = (product) => setItems((prev) => [...prev, { product, quantity: '1' }]);
  const setQuantity = (index) => (e) => setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: e.target.value } : item)));
  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const lines = items.map((item) => {
    const qty = Number(item.quantity);
    const valid = Number.isInteger(qty) && qty > 0;
    const stock = warehouseId ? available[item.product.id] : undefined;
    return {
      ...item,
      valid,
      stock,
      short: valid && stock !== undefined && qty > stock,
      totalCents: valid ? qty * cents(item.product.salePrice) : 0,
    };
  });
  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const discountValid = discount === '' || /^\d+(\.\d{1,2})?$/.test(discount.trim());
  const discountCents = discountValid && discount !== '' ? cents(discount) : 0;
  const discountTooBig = discountCents > subtotalCents;
  const shortLines = lines.filter((l) => l.short);
  const ready = customer && warehouseId && lines.length > 0 && lines.every((l) => l.valid)
    && shortLines.length === 0 && discountValid && !discountTooBig;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/sales-orders', {
        customerId: customer.id,
        warehouseId,
        discount: discount.trim() || 0,
        note,
        items: items.map((i) => ({ productId: i.product.id, quantity: Number(i.quantity) })),
      });
      navigate(`/sales-orders/${res.data.salesOrder.id}`, { state: { saved: 'created' } });
    } catch (err) {
      // Someone sold the stock in the meantime: refresh the available numbers.
      if (err.response?.data?.reason === 'insufficient_stock') {
        const { productId, available: left } = err.response.data;
        setAvailable((prev) => ({ ...prev, [productId]: left }));
      }
      setError(errorMessage(err, 'Could not create the order'));
      setSaving(false);
    }
  };

  if (!warehouses) return error ? <Alert severity="error">{error}</Alert> : <Skeleton variant="rounded" height={420} />;

  return (
    <Box component="form" onSubmit={submit} sx={{ maxWidth: 1100 }}>
      <Button component={RouterLink} to="/sales-orders" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>Back</Button>
      <Typography variant="h5" fontWeight={700}>New sales order</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Saving completes the order and takes the goods out of the warehouse's stock.
      </Typography>

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <CustomerPicker value={customer} onChange={setCustomer} required />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select fullWidth label="Ship from warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth label="Note" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 500 }}
                  placeholder="Printed on the invoice" />
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
                  <TableCell align="center" sx={{ width: 110 }}>Available</TableCell>
                  <TableCell align="center" sx={{ width: 130 }}>Quantity</TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>Unit price</TableCell>
                  <TableCell align="right" sx={{ width: 130 }}>Line total</TableCell>
                  <TableCell sx={{ width: 56 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
                      No products yet. Search below to add the first one.
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((line, index) => (
                  <TableRow key={line.product.id}>
                    <TableCell>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{line.product.sku}</Typography>
                      <Typography variant="body2">{line.product.name}</Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ color: line.stock === 0 || line.short ? 'error.main' : 'text.primary', fontWeight: line.short ? 600 : 400 }}>
                      {warehouseId ? (line.stock ?? '…') : '—'}
                    </TableCell>
                    <TableCell>
                      <TextField size="small" type="number" value={line.quantity} onChange={setQuantity(index)} required
                        error={!line.valid || line.short}
                        helperText={line.short ? `Only ${line.stock} left` : ''}
                        inputProps={{ min: 1, max: line.stock, step: 1, style: { textAlign: 'center' } }} />
                    </TableCell>
                    <TableCell align="right">{money.format(line.product.salePrice)}</TableCell>
                    <TableCell align="right">{money.format(line.totalCents / 100)}</TableCell>
                    <TableCell>
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => removeItem(index)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ProductPicker onSelect={addProduct} excludeIds={productIds} />

            {lines.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Stack spacing={1} sx={{ width: 320 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Subtotal</Typography>
                    <Typography>{money.format(subtotalCents / 100)}</Typography>
                  </Box>
                  <TextField size="small" label="Discount ($)" value={discount} onChange={(e) => setDiscount(e.target.value)}
                    error={!discountValid || discountTooBig}
                    helperText={!discountValid ? 'An amount with up to 2 decimals' : discountTooBig ? "Can't be more than the subtotal" : ' '}
                    inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: 1, borderColor: 'divider', pt: 1 }}>
                    <Typography fontWeight={700}>Total</Typography>
                    <Typography fontWeight={700} fontSize={18}>{money.format(Math.max(0, subtotalCents - discountCents) / 100)}</Typography>
                  </Box>
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>

        {shortLines.length > 0 && (
          <Alert severity="warning">
            Not enough stock for {shortLines.map((l) => l.product.sku).join(', ')} in this warehouse. Lower the quantity or ship from another warehouse.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button component={RouterLink} to="/sales-orders" disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ready || saving}>{saving ? 'Saving...' : 'Create order'}</Button>
        </Box>
      </Stack>
    </Box>
  );
}
