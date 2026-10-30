import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import api from '../lib/api';

// Searches active customers on the server as the user types (code, name or contact).
export default function CustomerPicker({ value, onChange, required, disabled }) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get('/customers', { params: { search: input.trim() || undefined, status: 'active', limit: 20 } })
        .then((res) => !cancelled && setOptions(res.data.customers))
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
      value={value}
      onChange={(e, customer) => onChange(customer)}
      inputValue={input}
      onInputChange={(e, text) => setInput(text)}
      options={value && !options.some((c) => c.id === value.id) ? [value, ...options] : options}
      loading={loading}
      disabled={disabled}
      filterOptions={(x) => x}
      getOptionLabel={(c) => c.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={input ? 'No active customer matches' : 'Type a name or code'}
      renderOption={({ key, ...props }, c) => (
        <Box component="li" key={key} {...props} sx={{ display: 'block !important' }}>
          <Typography variant="body2" fontWeight={500}>{c.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {[c.code, c.contactName, c.city].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label="Customer" required={required} placeholder="Search name or code" />}
    />
  );
}
