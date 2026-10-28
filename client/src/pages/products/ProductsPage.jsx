import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Skeleton, Tab, Tabs, Typography } from '@mui/material';
import api, { errorMessage } from '../../lib/api';
import ProductsGrid from './ProductsGrid';
import CategoriesTab from './CategoriesTab';

export default function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'categories' ? 'categories' : 'products';
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');

  // Categories, units and brands for the filters and the product form.
  const loadOptions = useCallback(() => {
    api
      .get('/products/options')
      .then((res) => setOptions(res.data))
      .catch((err) => setError(errorMessage(err, 'Could not load product options')));
  }, []);

  useEffect(loadOptions, [loadOptions]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>Products</Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>Catalog, prices, categories and stock levels.</Typography>

      <Tabs
        value={tab}
        onChange={(e, value) => setParams(value === 'products' ? {} : { tab: value }, { replace: true })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="products" label="Products" />
        <Tab value="categories" label="Categories" />
      </Tabs>

      {error && <Alert severity="error">{error}</Alert>}
      {tab === 'products' && (options ? <ProductsGrid options={options} /> : !error && <Skeleton variant="rounded" height={480} />)}
      {tab === 'categories' && <CategoriesTab onChanged={loadOptions} />}
    </Box>
  );
}
