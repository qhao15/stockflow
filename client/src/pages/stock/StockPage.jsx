import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Skeleton, Typography } from '@mui/material';
import api, { errorMessage } from '../../lib/api';
import StockGrid from './StockGrid';

export default function StockPage() {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');

  // Warehouses become grid columns; categories and reasons feed the filters and dialogs.
  const load = useCallback(() => {
    Promise.all([api.get('/warehouses'), api.get('/products/options'), api.get('/stock/adjustment-reasons')])
      .then(([w, p, r]) => setOptions({
        warehouses: w.data.warehouses.filter((wh) => wh.isActive),
        categories: p.data.categories,
        reasons: r.data.reasons,
      }))
      .catch((err) => setError(errorMessage(err, 'Could not load warehouses')));
  }, []);

  useEffect(load, [load]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>Warehouses &amp; Stock</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Quantities per warehouse. Every change is recorded in the movement history.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {options ? <StockGrid options={options} /> : !error && <Skeleton variant="rounded" height={480} />}
    </Box>
  );
}
