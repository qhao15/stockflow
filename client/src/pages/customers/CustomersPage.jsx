import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import {
  Alert, Box, Button, Chip, InputAdornment, Link, MenuItem, Snackbar, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { gridTheme, money } from '../../lib/agGrid';
import { formatDate } from '../../lib/format';
import ContactDialog from '../../components/ContactDialog';

const PAGE_SIZE = 50;
const center = { textAlign: 'center', justifyContent: 'center' };

export default function CustomersPage() {
  const { can } = useAuth();
  const canManage = can('customers.manage');
  const navigate = useNavigate();
  const gridRef = useRef(null);
  const [cities, setCities] = useState([]);
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', city: '', status: 'active' });
  const [adding, setAdding] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/customers/cities').then((res) => setCities(res.data.cities)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((prev) => ({ ...prev, search: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const res = await api.get('/customers', {
            params: {
              search: filters.search || undefined,
              city: filters.city || undefined,
              status: filters.status === 'all' ? undefined : filters.status,
              sort: params.sortModel[0]?.colId,
              dir: params.sortModel[0]?.sort,
              offset: params.startRow,
              limit: params.endRow - params.startRow,
            },
          });
          setTotal(res.data.total);
          params.successCallback(res.data.rows, res.data.total);
        } catch (err) {
          setToast({ severity: 'error', message: errorMessage(err, 'Could not load customers') });
          params.failCallback();
        }
      },
    }),
    [filters]
  );

  const columnDefs = useMemo(() => [
    {
      // A real link, so it can also be opened in a new tab.
      colId: 'code', field: 'code', headerName: 'Code', width: 120, minWidth: 120, pinned: 'left',
      cellStyle: { fontFamily: 'monospace', fontSize: 12 },
      cellRenderer: ({ data }) => data && (
        <Link component={RouterLink} to={`/customers/${data.id}`} underline="hover" fontWeight={600} sx={{ fontFamily: 'inherit' }}>
          {data.code}
        </Link>
      ),
    },
    {
      colId: 'name', field: 'name', headerName: 'Name', flex: 1, minWidth: 260,
      cellRenderer: ({ data }) => data && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
          {data.name}
          {!data.isActive && <Chip label="Inactive" size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
        </Box>
      ),
    },
    { colId: 'contact', field: 'contactName', headerName: 'Contact', width: 160, minWidth: 160, cellStyle: center, headerClass: 'header-center', sortable: false },
    { colId: 'phone', field: 'phone', headerName: 'Phone', width: 120, minWidth: 120, cellStyle: center, headerClass: 'header-center', sortable: false },
    { colId: 'city', field: 'city', headerName: 'City', width: 140, minWidth: 140, cellStyle: center, headerClass: 'header-center' },
    { colId: 'orderCount', field: 'orderCount', headerName: 'Orders', width: 90, minWidth: 90, cellStyle: center, headerClass: 'header-center' },
    {
      colId: 'revenue', field: 'revenue', headerName: 'Revenue', width: 130, minWidth: 130, cellStyle: center, headerClass: 'header-center',
      valueFormatter: ({ value }) => (value == null ? '' : money.format(value)),
    },
    { colId: 'lastOrder', field: 'lastOrder', headerName: 'Last order', width: 100, minWidth: 100, cellStyle: center, headerClass: 'header-center', valueFormatter: ({ value }) => formatDate(value) },
  ], []);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);
  const setFilter = (field) => (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));

  const onSaved = (customer) => {
    setAdding(null);
    navigate(`/customers/${customer.id}`, { state: { saved: 'added' } });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>Customers</Typography>
          <Typography color="text.secondary">Contacts, what they buy and how much.</Typography>
        </Box>
        {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding({})}>New customer</Button>}
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField
          size="small" placeholder="Search name, code, contact, phone, email" value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField select size="small" label="City" value={filters.city} onChange={setFilter('city')} sx={{ minWidth: 170 }}>
          <MenuItem value="">All cities</MenuItem>
          {cities.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={filters.status} onChange={setFilter('status')} sx={{ minWidth: 120 }}>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="inactive">Inactive</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {total === null ? ' ' : `${total.toLocaleString()} customer${total === 1 ? '' : 's'} · Revenue counts completed orders`}
      </Typography>

      <Box
        sx={{
          height: 'calc(100vh - 300px)',
          minHeight: 420,
          '& .header-center .ag-header-cell-label': { justifyContent: 'center' },
        }}
      >
        <AgGridReact
          ref={gridRef}
          theme={gridTheme}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={PAGE_SIZE}
          pagination
          paginationPageSize={PAGE_SIZE}
          paginationPageSizeSelector={false}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => String(p.data.id)}
          overlayNoRowsTemplate="No customers match these filters"
        />
      </Box>

      <ContactDialog contact={adding} onClose={() => setAdding(null)} onSaved={onSaved} />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        // Just below the top bar instead of covering it.
        sx={{ top: { xs: 64, sm: 76 } }}
      >
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
