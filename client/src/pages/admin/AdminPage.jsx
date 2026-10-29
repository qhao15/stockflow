import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import Users from '../Users';
import WarehousesTab from './WarehousesTab';

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'warehouses' ? 'warehouses' : 'users';

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>Users &amp; Settings</Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>Accounts, roles and warehouses.</Typography>

      <Tabs
        value={tab}
        onChange={(e, value) => setParams(value === 'users' ? {} : { tab: value }, { replace: true })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="users" label="Users" />
        <Tab value="warehouses" label="Warehouses" />
      </Tabs>

      {tab === 'users' && <Users />}
      {tab === 'warehouses' && <WarehousesTab />}
    </Box>
  );
}
