import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../lib/api';

// Sets the quantity in one warehouse to what was counted. The quantity shown here is
// sent as expectedQuantity: if stock changed meanwhile (a sale, a transfer), the server
// refuses instead of silently overwriting it.
export default function AdjustDialog({ product, warehouses, reasons, onClose, onDone, onError }) {
  const [form, setForm] = useState({ warehouseId: '', countedQuantity: '', reason: 'stock_take', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    setForm({ warehouseId: warehouses[0]?.id ?? '', countedQuantity: '', reason: 'stock_take', note: '' });
  }, [product, warehouses]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const current = product?.quantities[form.warehouseId] ?? 0;
  const counted = Number(form.countedQuantity);
  const countError = form.countedQuantity !== '' && (!Number.isInteger(counted) || counted < 0);
  const change = form.countedQuantity === '' || countError ? null : counted - current;
  const noteRequired = form.reason === 'other';
  const ready = form.warehouseId && change !== null && change !== 0 && (!noteRequired || form.note.trim());

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/stock/adjustments', {
        productId: product.id,
        warehouseId: form.warehouseId,
        countedQuantity: counted,
        expectedQuantity: current,
        reason: form.reason,
        note: form.note,
      });
      const a = res.data.adjustment;
      const code = warehouses.find((w) => w.id === a.warehouseId)?.code;
      onDone(`${a.product.sku} in ${code}: ${a.change > 0 ? '+' : ''}${a.change}, now ${a.quantity}`);
    } catch (err) {
      onError(errorMessage(err, 'Could not adjust the stock'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(product)} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{product?.sku}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{product?.name}</Typography>
          <Stack spacing={2}>
            <TextField select label="Warehouse" value={form.warehouseId} onChange={set('warehouseId')} required>
              {warehouses.map((w) => (
                <MenuItem key={w.id} value={w.id}>{w.name} ({(product?.quantities[w.id] ?? 0).toLocaleString()} in stock)</MenuItem>
              ))}
            </TextField>
            <TextField label="Counted quantity" type="number" value={form.countedQuantity} onChange={set('countedQuantity')} required autoFocus
              inputProps={{ min: 0, step: 1 }} error={countError}
              helperText={countError ? 'A whole number, 0 or more' : `Currently ${current.toLocaleString()} in the system`} />
            {change !== null && change !== 0 && (
              <Alert severity={change > 0 ? 'info' : 'warning'}>
                {change > 0 ? `Adds ${change}` : `Removes ${-change}`} unit{Math.abs(change) === 1 ? '' : 's'}
              </Alert>
            )}
            {change === 0 && <Alert severity="info">Matches the system - nothing to adjust</Alert>}
            <TextField select label="Reason" value={form.reason} onChange={set('reason')} required>
              {reasons.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </TextField>
            <TextField label={noteRequired ? 'Note (required)' : 'Note'} value={form.note} onChange={set('note')} multiline minRows={2}
              required={noteRequired} inputProps={{ maxLength: 200 }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ready || saving}>{saving ? 'Saving...' : 'Save adjustment'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
