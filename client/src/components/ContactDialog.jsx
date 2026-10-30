import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import api, { errorMessage } from '../lib/api';

const EMPTY = { name: '', contactName: '', email: '', phone: '', city: '', address: '', notes: '' };

// What differs between the two kinds of contact.
const KINDS = {
  customer: { path: '/customers', key: 'customer', noun: 'customer', nameLabel: 'Company or customer name' },
  supplier: { path: '/suppliers', key: 'supplier', noun: 'supplier', nameLabel: 'Supplier name' },
};

// Add (contact = {}) or edit (contact = an existing one) a customer or supplier. Used by
// the Customers and Suppliers pages and by the sales order form's customer picker
// ("+ New customer"). initialName pre-fills the name, e.g. with what was typed.
export default function ContactDialog({ kind = 'customer', contact, initialName = '', onClose, onSaved }) {
  const { path, key, noun, nameLabel } = KINDS[kind];
  // The parent clears `contact` as soon as it closes the dialog, but the dialog still
  // fades out for a moment; keep the last one so the title and button don't flip to
  // "New ..." / "Add ..." during the fade.
  const [shown, setShown] = useState(contact);
  if (contact && contact !== shown) setShown(contact);
  const isEdit = Boolean(shown?.id);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setError('');
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, contact[k] ?? (k === 'name' ? initialName : '')])));
  }, [contact, initialName]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // the dialog can sit inside another form (the sales order form)
    setSaving(true);
    setError('');
    try {
      const res = isEdit ? await api.patch(`${path}/${shown.id}`, form) : await api.post(path, form);
      onSaved(res.data[key], isEdit);
    } catch (err) {
      setError(errorMessage(err, `Could not save the ${noun}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(contact)} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>{isEdit ? `Edit ${shown.code}` : `New ${noun}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={nameLabel} value={form.name} onChange={set('name')} required autoFocus inputProps={{ maxLength: 150 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Contact person" value={form.contactName} onChange={set('contactName')} inputProps={{ maxLength: 100 }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Phone" value={form.phone} onChange={set('phone')} inputProps={{ maxLength: 30 }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Email" type="email" value={form.email} onChange={set('email')} inputProps={{ maxLength: 255 }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="City" value={form.city} onChange={set('city')} inputProps={{ maxLength: 100 }} />
              </Grid>
            </Grid>
            <TextField label="Address" value={form.address} onChange={set('address')} inputProps={{ maxLength: 255 }} />
            <TextField label="Notes" value={form.notes} onChange={set('notes')} multiline minRows={2} inputProps={{ maxLength: 1000 }}
              placeholder={kind === 'supplier' ? 'e.g. Delivers in 5 working days, 30-day payment terms' : 'e.g. Pays by bank transfer, deliveries before 5 pm'} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save' : `Add ${noun}`}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
