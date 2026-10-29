import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Drawer, IconButton, MenuItem, Skeleton, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import api, { errorMessage } from '../../lib/api';

const PAGE_SIZE = 50;

export const MOVEMENT_TYPES = {
  opening: { label: 'Opening balance', color: 'default' },
  purchase_receipt: { label: 'Purchase received', color: 'success' },
  sale: { label: 'Sale', color: 'primary' },
  sale_cancel: { label: 'Sale cancelled', color: 'warning' },
  transfer_in: { label: 'Transfer in', color: 'info' },
  transfer_out: { label: 'Transfer out', color: 'info' },
  adjustment: { label: 'Adjustment', color: 'secondary' },
};

function Reference({ movement: m }) {
  if (!m.referenceNumber) return null;
  const direction = m.type === 'transfer_out' ? `to ${m.otherWarehouseCode}` : m.type === 'transfer_in' ? `from ${m.otherWarehouseCode}` : '';
  return (
    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
      {m.referenceNumber}{direction && <Box component="span" sx={{ fontFamily: 'inherit', color: 'text.secondary' }}> {direction}</Box>}
    </Typography>
  );
}

// The ledger for one product, newest first. Each row is one change to one warehouse's
// stock, with what caused it.
export default function MovementsDrawer({ product, warehouses, onClose }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Start over when another product (or warehouse) is picked.
  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    setRows(null);
    setError('');
    api
      .get('/stock/movements', { params: { productId: product.id, warehouseId: warehouseId || undefined, limit: PAGE_SIZE } })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data.rows);
        setTotal(res.data.total);
      })
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load the movement history')));
    return () => { cancelled = true; };
  }, [product, warehouseId]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock/movements', {
        params: { productId: product.id, warehouseId: warehouseId || undefined, limit: PAGE_SIZE, offset: rows.length },
      });
      setRows((prev) => [...prev, ...res.data.rows]);
      setTotal(res.data.total);
    } catch (err) {
      setError(errorMessage(err, 'Could not load more'));
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setWarehouseId('');
    onClose();
  };

  return (
    <Drawer anchor="right" open={Boolean(product)} onClose={close} PaperProps={{ sx: { width: { xs: '100%', md: 760 } } }}>
      {product && (
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>Movement history</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{product.sku}</Typography>
              <Typography color="text.secondary" noWrap>{product.name}</Typography>
            </Box>
            <IconButton onClick={close} aria-label="Close"><CloseIcon /></IconButton>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            <TextField select size="small" label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">All warehouses</MenuItem>
              {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
            {warehouses.map((w) => (
              <Chip key={w.id} size="small" variant="outlined" label={`${w.code}: ${(product.quantities[w.id] ?? 0).toLocaleString()}`} />
            ))}
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!rows && !error && <Skeleton variant="rounded" height={300} />}
          {rows && rows.length === 0 && <Typography color="text.secondary">No movements yet.</Typography>}
          {rows && rows.length > 0 && (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Warehouse</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="center">Change</TableCell>
                    <TableCell align="center">Balance</TableCell>
                    <TableCell>Reference / note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((m) => {
                    const type = MOVEMENT_TYPES[m.type] ?? { label: m.type, color: 'default' };
                    return (
                      <TableRow key={m.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(m.createdAt).toLocaleString()}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{m.userName}</Typography>
                        </TableCell>
                        <TableCell>{m.warehouseCode}</TableCell>
                        <TableCell><Chip size="small" label={type.label} color={type.color} variant="outlined" /></TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: m.change > 0 ? 'success.main' : 'error.main' }}>
                          {m.change > 0 ? `+${m.change}` : m.change}
                        </TableCell>
                        <TableCell align="center">{m.balanceAfter.toLocaleString()}</TableCell>
                        <TableCell>
                          <Reference movement={m} />
                          {m.note && <Typography variant="caption" color="text.secondary">{m.note}</Typography>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
                </Typography>
                {rows.length < total && <Button onClick={loadMore} disabled={loading}>{loading ? 'Loading...' : 'Load more'}</Button>}
              </Box>
            </>
          )}
        </Box>
      )}
    </Drawer>
  );
}
