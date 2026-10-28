import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, Skeleton, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';

// On failure the dialog stays open so the input can be fixed; the error is shown by onError.
function CategoryDialog({ category, onClose, onSaved, onError }) {
  const isEdit = Boolean(category?.id);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!category) return;
    setForm({ code: category.code ?? '', name: category.name ?? '', description: category.description ?? '' });
  }, [category]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = isEdit
        ? await api.patch(`/categories/${category.id}`, form)
        : await api.post('/categories', form);
      onSaved(res.data.category, isEdit);
    } catch (err) {
      onError(errorMessage(err, isEdit ? 'Could not update the category' : 'Could not add the category'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(category)} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>{isEdit ? 'Edit category' : 'Add category'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Code" value={form.code} onChange={set('code')} required autoFocus
              helperText="2-10 letters or numbers, used in SKUs and imports (e.g. LAP)"
              inputProps={{ maxLength: 10, style: { textTransform: 'uppercase' } }} />
            <TextField label="Name" value={form.name} onChange={set('name')} required inputProps={{ maxLength: 100 }} />
            <TextField label="Description" value={form.description} onChange={set('description')} multiline minRows={2} inputProps={{ maxLength: 255 }} />
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

// onChanged: lets the products tab reload its category filter.
export default function CategoriesTab({ onChanged }) {
  const { can } = useAuth();
  const canManage = can('products.manage');
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // {} = new, category = edit
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);

  const showError = (message) => setToast({ severity: 'error', message });

  const load = useCallback(() => {
    api
      .get('/categories')
      .then((res) => setCategories(res.data.categories))
      .catch((err) => setError(errorMessage(err, 'Could not load categories')));
  }, []);

  useEffect(load, [load]);

  const saved = (category, isEdit) => {
    setEditing(null);
    load();
    onChanged();
    setToast({ severity: 'success', message: `Category "${category.name}" ${isEdit ? 'updated' : 'added'}` });
  };

  const confirmDelete = async () => {
    const { id, name } = deleting;
    setDeleting(null);
    try {
      await api.delete(`/categories/${id}`);
      load();
      onChanged();
      setToast({ severity: 'success', message: `Category "${name}" deleted` });
    } catch (err) {
      showError(errorMessage(err, `Could not delete "${name}"`));
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
          {categories ? `${categories.length} categories` : ' '}
        </Typography>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>Add category</Button>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!categories && !error && <Skeleton variant="rounded" height={300} />}
      {categories && (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 100 }}>Code</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="center" sx={{ width: 110 }}>Products</TableCell>
                  {canManage && <TableCell align="center" sx={{ width: 110 }}>Action</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{c.code}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{c.name}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{c.description}</TableCell>
                    <TableCell align="center">{c.productCount}</TableCell>
                    {canManage && (
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => setEditing(c)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title={c.productCount > 0 ? 'Still has products - Cannot delete it' : 'Delete'}>
                          <span>
                            <IconButton size="small" disabled={c.productCount > 0}
                              onClick={() => setDeleting(c)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <CategoryDialog category={editing} onClose={() => setEditing(null)} onSaved={saved} onError={showError} />

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete category?</DialogTitle>
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
