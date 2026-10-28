import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  InputAdornment, MenuItem, Switch, TextField,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import api, { errorMessage } from '../../lib/api';

const EMPTY = {
  sku: '', name: '', categoryId: '', brand: '', unit: 'pcs', costPrice: '', salePrice: '',
  minStock: '0', imageUrl: '', description: '', isActive: true,
};

function toForm(product) {
  if (!product) return EMPTY;
  return {
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    brand: product.brand ?? '',
    unit: product.unit,
    costPrice: String(product.costPrice),
    salePrice: String(product.salePrice),
    minStock: String(product.minStock),
    imageUrl: product.imageUrl ?? '',
    description: product.description ?? '',
    isActive: product.isActive,
  };
}

// Add (product = null) or edit a product. Edits send the version that was loaded, so a
// change saved by someone else in the meantime is never silently overwritten.
export default function ProductDialog({ open, product, options, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [version, setVersion] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(product);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(product));
    setVersion(product?.version ?? null);
    setErrors({});
    setMessage(null);
  }, [open, product]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    const body = { ...form, brand: form.brand.trim() };
    try {
      const res = isEdit
        ? await api.patch(`/products/${product.id}`, { ...body, version })
        : await api.post('/products', body);
      onSaved(res.data.product, isEdit);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.product) {
        // Someone else saved first: show their version and let the user redo the change.
        setForm(toForm(data.product));
        setVersion(data.product.version);
        setMessage({ severity: 'warning', text: data.message });
      } else {
        setErrors(data?.errors ?? {});
        setMessage({ severity: 'error', text: errorMessage(err, 'Could not save the product') });
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (name) => ({ error: Boolean(errors[name]), helperText: errors[name] ?? ' ' });

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{isEdit ? `Edit ${product.sku}` : 'Add product'}</DialogTitle>
        <DialogContent dividers>
          {message && <Alert severity={message.severity} sx={{ mb: 2 }}>{message.text}</Alert>}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField label="SKU" value={form.sku} onChange={set('sku')} required fullWidth autoFocus={!isEdit}
                inputProps={{ style: { textTransform: 'uppercase' } }} {...field('sku')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField label="Name" value={form.name} onChange={set('name')} required fullWidth {...field('name')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField select label="Category" value={form.categoryId} onChange={set('categoryId')} required fullWidth {...field('categoryId')}>
                {options.categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Autocomplete
                freeSolo
                options={options.brands}
                inputValue={form.brand}
                onInputChange={(e, value) => setForm((prev) => ({ ...prev, brand: value }))}
                renderInput={(params) => <TextField {...params} label="Brand" {...field('brand')} />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select label="Unit" value={form.unit} onChange={set('unit')} required fullWidth {...field('unit')}>
                {options.units.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Cost price" type="number" value={form.costPrice} onChange={set('costPrice')} fullWidth
                inputProps={{ min: 0, step: '0.01' }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} {...field('costPrice')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Sale price" type="number" value={form.salePrice} onChange={set('salePrice')} required fullWidth
                inputProps={{ min: 0, step: '0.01' }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} {...field('salePrice')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Min stock (per warehouse)" type="number" value={form.minStock} onChange={set('minStock')} fullWidth
                inputProps={{ min: 0, step: 1 }} {...field('minStock')} />
            </Grid>
            <Grid size={12}>
              <TextField label="Image URL" value={form.imageUrl} onChange={set('imageUrl')} fullWidth placeholder="https://..." {...field('imageUrl')} />
            </Grid>
            <Grid size={12}>
              <TextField label="Description" value={form.description} onChange={set('description')} fullWidth multiline minRows={2} {...field('description')} />
            </Grid>
            {isEdit && (
              <Grid size={12}>
                <FormControlLabel
                  control={<Switch checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />}
                  label={form.isActive ? 'Active - can be sold and ordered' : 'Inactive - hidden from new orders'}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add product'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
