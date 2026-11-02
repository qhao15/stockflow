import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import api, { errorMessage } from '../../lib/api';

// The products furthest below their minimum, per warehouse. Every role that can see stock gets this.
export default function LowStockTable() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/reports/low-stock', { params: { limit: 8 } })
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err, 'Could not load low stock')));
  }, []);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={600}>Low stock</Typography>
            <Typography variant="caption" color="text.secondary">
              {data ? `${data.total.toLocaleString()} at or below minimum, furthest below first` : ' '}
            </Typography>
          </Box>
          <Button size="small" component={RouterLink} to="/stock?lowStock=1">View all</Button>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && <Skeleton variant="rounded" height={280} />}
        {data && data.rows.length === 0 && <Typography color="text.secondary">Nothing is below its minimum.</Typography>}
        {data && data.rows.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="center">Warehouse</TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>In stock</TableCell>
                  <TableCell align="center">Minimum</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={`${r.productId}-${r.warehouseId}`} hover>
                    <TableCell>
                      <Typography variant="body2">{r.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{r.sku}</Typography>
                    </TableCell>
                    <TableCell align="center">{r.warehouseCode}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{r.quantity.toLocaleString()}</TableCell>
                    <TableCell align="center">{r.minStock.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
