import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, Skeleton, Snackbar, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api, { errorMessage } from '../../lib/api';

// On failure the dialog stays open so the input can be fixed; the error is shown by onError.
function WarehouseDialog({ warehouse, onClose, onSaved, onError }) {
  const isEdit = Boolean(warehouse?.id);
  const [form, setForm] = useState({ code: '', name: '', city: '', address: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouse) return;
    setForm({ code: warehouse.code ?? '', name: warehouse.name ?? '', city: warehouse.city ?? '', address: warehouse.address ?? '' });
  }, [warehouse]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = isEdit
        ? await api.patch(`/warehouses/${warehouse.id}`, form)
        : await api.post('/warehouses', form);
      onSaved(res.data.warehouse, isEdit);
    } catch (err) {
      onError(errorMessage(err, isEdit ? 'Could not update the warehouse' : 'Could not add the warehouse'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(warehouse)} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>{isEdit ? 'Edit warehouse' : 'Add warehouse'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Code" value={form.code} onChange={set('code')} required autoFocus
              helperText="2-10 letters or numbers, shown as the stock column header (e.g. HN)"
              inputProps={{ maxLength: 10, style: { textTransform: 'uppercase' } }} />
            <TextField label="Name" value={form.name} onChange={set('name')} required inputProps={{ maxLength: 100 }} />
            <TextField label="City" value={form.city} onChange={set('city')} required inputProps={{ maxLength: 100 }} />
            <TextField label="Address" value={form.address} onChange={set('address')} multiline minRows={2} inputProps={{ maxLength: 255 }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const deleteBlockedReason = (w) => {
  if (w.units > 0) return 'Still holds stock - Cannot delete it';
  if (w.inUse) return 'Has stock or order history - Cannot delete it, deactivate it instead';
  return 'Delete';
};

export default function WarehousesTab() {
  const [warehouses, setWarehouses] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // {} = new, warehouse = edit
  const [deleting, setDeleting] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  const showError = (message) => setToast({ severity: 'error', message });

  const load = useCallback(() => {
    api
      .get('/warehouses')
      .then((res) => setWarehouses(res.data.warehouses))
      .catch((err) => setError(errorMessage(err, 'Could not load warehouses')));
  }, []);

  useEffect(load, [load]);

  const saved = (warehouse, isEdit) => {
    setEditing(null);
    load();
    setToast({ severity: 'success', message: `${warehouse.name} ${isEdit ? 'updated' : 'added'}` });
  };

  const setActive = async (w, isActive) => {
    setSavingId(w.id);
    try {
      await api.patch(`/warehouses/${w.id}`, { isActive });
      load();
      setToast({ severity: 'success', message: `${w.name} ${isActive ? 'activated' : 'deactivated'}` });
    } catch (err) {
      showError(errorMessage(err, `Could not update ${w.name}`));
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async () => {
    const { id, name } = deleting;
    setDeleting(null);
    try {
      await api.delete(`/warehouses/${id}`);
      load();
      setToast({ severity: 'success', message: `${name} deleted` });
    } catch (err) {
      showError(errorMessage(err, `Could not delete ${name}`));
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
          {warehouses ? `${warehouses.length} warehouse${warehouses.length === 1 ? '' : 's'} · A warehouse must be empty before it can be deactivated` : ' '}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>Add warehouse</Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!warehouses && !error && <Skeleton variant="rounded" height={240} />}
      {warehouses && (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 90 }}>Code</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>City</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell align="center" sx={{ width: 100 }}>Products</TableCell>
                  <TableCell align="center" sx={{ width: 100 }}>Units</TableCell>
                  <TableCell align="center" sx={{ width: 90 }}>Active</TableCell>
                  <TableCell align="center" sx={{ width: 110 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow key={w.id} hover sx={{ opacity: w.isActive ? 1 : 0.55 }}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{w.code}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{w.name}</TableCell>
                    <TableCell>{w.city}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{w.address}</TableCell>
                    <TableCell align="center">{w.products.toLocaleString()}</TableCell>
                    <TableCell align="center">{w.units.toLocaleString()}</TableCell>
                    <TableCell align="center">
                      <Tooltip title={w.isActive && w.units > 0 ? 'Transfer its stock out before deactivating' : ''}>
                        <span>
                          <Switch checked={w.isActive} disabled={savingId === w.id || (w.isActive && w.units > 0)}
                            onChange={(e) => setActive(w, e.target.checked)} />
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => setEditing(w)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title={deleteBlockedReason(w)}>
                        <span>
                          <IconButton size="small" disabled={w.inUse || w.units > 0} onClick={() => setDeleting(w)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <WarehouseDialog warehouse={editing} onClose={() => setEditing(null)} onSaved={saved} onError={showError} />

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete warehouse?</DialogTitle>
        <DialogContent>
          <DialogContentText>"{deleting?.name}" will be deleted. This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
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
