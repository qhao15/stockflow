import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';
import api, { errorMessage } from '../../lib/api';

// Confirms deleting a product. The server only deletes products that were never used;
// for one with history it explains why and offers to set it inactive instead.
export default function DeleteProductDialog({ product, onClose, onDeleted, onDeactivated, onError }) {
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (product) setBlocked(null);
  }, [product]);

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/products/${product.id}`);
      onDeleted(product);
    } catch (err) {
      if (err.response?.data?.reason === 'in_use') setBlocked(err.response.data.message);
      else onError(errorMessage(err, `Could not delete ${product.sku}`));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const res = await api.patch(`/products/${product.id}`, { version: product.version, isActive: false });
      onDeactivated(res.data.product);
    } catch (err) {
      onError(errorMessage(err, `Could not set ${product.sku} inactive`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(product)} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete product?</DialogTitle>
      <DialogContent>
        {blocked ? (
          <Alert severity="warning">{blocked}</Alert>
        ) : (
          <DialogContentText>
            <b>{product?.sku}</b> – {product?.name} will be deleted. This cannot be undone.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{blocked ? 'Close' : 'Cancel'}</Button>
        {!blocked && (
          <Button color="error" variant="contained" onClick={remove} disabled={busy}>
            {busy ? 'Deleting...' : 'Delete'}
          </Button>
        )}
        {blocked && product?.isActive && (
          <Button variant="contained" onClick={deactivate} disabled={busy}>
            {busy ? 'Saving...' : 'Set inactive instead'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
