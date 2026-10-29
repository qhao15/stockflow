import { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../lib/api';

const available = (product, warehouseId) => product?.quantities[warehouseId] ?? 0;

// Moves units of one product between two warehouses. The server re-checks the quantity
// under a row lock, so two people moving the same units can't both succeed.
export default function TransferDialog({ product, warehouses, onClose, onDone, onError }) {
  const [form, setForm] = useState({ fromWarehouseId: '', toWarehouseId: '', quantity: '', note: '' });
  const [saving, setSaving] = useState(false);

  // Default to moving from the warehouse with the most stock to the one with the least.
  useEffect(() => {
    if (!product) return;
    const byStock = [...warehouses].sort((a, b) => available(product, b.id) - available(product, a.id));
    setForm({
      fromWarehouseId: byStock[0]?.id ?? '',
      toWarehouseId: byStock[byStock.length - 1]?.id ?? '',
      quantity: '',
      note: '',
    });
  }, [product, warehouses]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const max = available(product, form.fromWarehouseId);
  const quantity = Number(form.quantity);
  const quantityError = form.quantity !== '' && (!Number.isInteger(quantity) || quantity < 1 || quantity > max);
  const sameWarehouse = form.fromWarehouseId && form.fromWarehouseId === form.toWarehouseId;
  const ready = form.fromWarehouseId && form.toWarehouseId && !sameWarehouse && form.quantity !== '' && !quantityError;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/stock/transfers', { productId: product.id, ...form, quantity });
      const t = res.data.transfer;
      onDone(`${t.transferNumber}: moved ${t.quantity} × ${t.product.sku} from ${t.from.code} to ${t.to.code}`);
    } catch (err) {
      onError(errorMessage(err, 'Could not transfer the stock'));
    } finally {
      setSaving(false);
    }
  };

  const warehouseLabel = (w) => `${w.name} (${available(product, w.id).toLocaleString()} in stock)`;

  return (
    <Dialog open={Boolean(product)} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>Transfer stock</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{product?.sku}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{product?.name}</Typography>
          <Stack spacing={2}>
            <TextField select label="From" value={form.fromWarehouseId} onChange={set('fromWarehouseId')} required>
              {warehouses.map((w) => (
                <MenuItem key={w.id} value={w.id} disabled={available(product, w.id) === 0}>{warehouseLabel(w)}</MenuItem>
              ))}
            </TextField>
            <TextField select label="To" value={form.toWarehouseId} onChange={set('toWarehouseId')} required
              error={Boolean(sameWarehouse)} helperText={sameWarehouse ? 'Pick a different warehouse' : ' '}>
              {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{warehouseLabel(w)}</MenuItem>)}
            </TextField>
            <TextField label="Quantity" type="number" value={form.quantity} onChange={set('quantity')} required autoFocus
              inputProps={{ min: 1, max, step: 1 }}
              error={quantityError} helperText={`1 to ${max.toLocaleString()}`} />
            <TextField label="Note" value={form.note} onChange={set('note')} multiline minRows={2}
              placeholder="e.g. Rebalancing for weekend sales" inputProps={{ maxLength: 500 }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ready || saving}>{saving ? 'Transferring...' : 'Transfer'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
