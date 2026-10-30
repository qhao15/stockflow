import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import api from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import ContactDialog from './ContactDialog';

const NEW = { id: 'new', isNewOption: true };

// Searches active customers on the server as the user types (code, name, contact,
// phone or email). Users who may manage customers also get "+ New customer", which
// opens the add dialog with what they typed and selects the new customer.
export default function CustomerPicker({ value, onChange, required, disabled }) {
  const { can } = useAuth();
  const canAdd = can('customers.manage');
  const [input, setInput] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get('/customers', { params: { search: input.trim() || undefined, status: 'active', limit: 20 } })
        .then((res) => !cancelled && setOptions(res.data.rows))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  const shown = value && !options.some((c) => c.id === value.id) ? [value, ...options] : options;

  return (
    <>
      <Autocomplete
        value={value}
        onChange={(e, customer) => {
          if (customer?.isNewOption) setAdding({});
          else onChange(customer);
        }}
        inputValue={input}
        onInputChange={(e, text) => setInput(text)}
        options={canAdd ? [...shown, NEW] : shown}
        loading={loading}
        disabled={disabled}
        filterOptions={(x) => x}
        getOptionLabel={(c) => (c.isNewOption ? input : c.name)}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={input ? 'No active customer matches' : 'Type a name or code'}
        renderOption={({ key, ...props }, c) => (c.isNewOption ? (
          <Box component="li" key={key} {...props} sx={{ borderTop: 1, borderColor: 'divider', color: 'primary.main', gap: 1 }}>
            <AddIcon fontSize="small" />
            <Typography variant="body2" fontWeight={600}>New customer{input && !value ? ` "${input}"` : ''}</Typography>
          </Box>
        ) : (
          <Box component="li" key={key} {...props} sx={{ display: 'block !important' }}>
            <Typography variant="body2" fontWeight={500}>{c.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {[c.code, c.contactName, c.city].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        ))}
        renderInput={(params) => <TextField {...params} label="Customer" required={required} placeholder="Search name or code" />}
      />
      <ContactDialog
        contact={adding}
        initialName={value ? '' : input}
        onClose={() => setAdding(null)}
        onSaved={(customer) => {
          setAdding(null);
          onChange(customer);
        }}
      />
    </>
  );
}
