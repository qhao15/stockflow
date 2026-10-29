import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import api from '../lib/api';
import { money } from '../lib/agGrid';

// Searches active products on the server as the user types (SKU or name) and calls
// onSelect with the chosen product. The box clears itself after each pick, ready for
// the next line. excludeIds: products already used, shown as disabled.
export default function ProductPicker({ onSelect, excludeIds = [], label = 'Add a product', disabled }) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

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
          <Typography variant="caption" color="text.secondary">
            Cost {money.format(p.costPrice)} · {p.stock.toLocaleString()} in stock
            {excludeIds.includes(p.id) && ' · already added'}
          </Typography>
        </Box>
      )}
      renderInput={(params) => <TextField {...params} size="small" label={label} placeholder="Search SKU or name" />}
    />
  );
}
