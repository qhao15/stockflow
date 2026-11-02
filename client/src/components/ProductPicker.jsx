import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import api from '../lib/api';
import { money } from '../lib/agGrid';

// Searches active products on the server as the user types (SKU or name) and calls
// onSelect with the chosen product. The box clears itself after each pick, ready for
// the next line. excludeIds: products already used, shown as disabled.
// For selling, pass warehouses (and the chosen warehouseId): each option then shows its sale
// price and what's available, instead of the cost and the total stock shown for buying.
export default function ProductPicker({ onSelect, excludeIds = [], label = 'Add a product', disabled, warehouses, warehouseId }) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quantities, setQuantities] = useState({}); // productId -> { warehouseId: quantity }
  const selling = Boolean(warehouses);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get('/products', { params: { search: input.trim() || undefined, status: 'active', limit: 20, sort: 'sku' } })
        .then((res) => !cancelled && setOptions(res.data.rows))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  const idsKey = options.map((p) => p.id).join(',');
  useEffect(() => {
    if (!selling || !idsKey) return;
    let cancelled = false;
    api
      .get('/stock', { params: { ids: idsKey, limit: 500 } })
      .then((res) => {
        if (!cancelled) setQuantities(Object.fromEntries(res.data.rows.map((r) => [r.id, r.quantities])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selling, idsKey]);

  const availability = (p) => {
    const stock = quantities[p.id];
    if (!stock) return { text: 'Checking stock...' };
    if (!warehouseId) return { text: warehouses.map((w) => `${w.code}: ${(stock[w.id] ?? 0).toLocaleString()}`).join(' · ') };
    const available = stock[warehouseId] ?? 0;
    const code = warehouses.find((w) => w.id === warehouseId)?.code;
    return { text: `${available.toLocaleString()} available in ${code}`, none: available === 0 };
  };

  return (
    <Autocomplete
      value={null}
      inputValue={input}
      onInputChange={(e, value, reason) => reason !== 'reset' && setInput(value)}
      onChange={(e, product) => {
        if (!product) return;
        onSelect(product);
        setInput('');
      }}
      options={options}
      loading={loading}
      disabled={disabled}
      filterOptions={(x) => x}
      getOptionLabel={(p) => `${p.sku} ${p.name}`}
      getOptionDisabled={(p) => excludeIds.includes(p.id)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={input ? 'No active product matches' : 'Type a SKU or name'}
      renderOption={({ key, ...props }, p) => (
        <Box component="li" key={key} {...props} sx={{ display: 'block !important' }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.sku}</Typography>
          <Typography variant="body2">{p.name}</Typography>
          {selling ? (
            <Typography variant="caption" color={availability(p).none ? 'error.main' : 'text.secondary'}>
              {money.format(p.salePrice)} · {availability(p).text}
              {excludeIds.includes(p.id) && ' · already added'}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Cost {money.format(p.costPrice)} · {p.stock.toLocaleString()} in stock
              {excludeIds.includes(p.id) && ' · already added'}
            </Typography>
          )}
        </Box>
      )}
      renderInput={(params) => <TextField {...params} size="small" label={label} placeholder="Search SKU or name" />}
    />
  );
}
