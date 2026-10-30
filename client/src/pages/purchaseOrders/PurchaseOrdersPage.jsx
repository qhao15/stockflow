import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import {
  Alert, Box, Button, InputAdornment, Link, MenuItem, Snackbar, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { gridTheme, money } from '../../lib/agGrid';
import { PO_STATUSES, StatusChip } from './status';
import { formatDate } from '../../lib/format';

const PAGE_SIZE = 50;
const center = { textAlign: 'center', justifyContent: 'center' };

export default function PurchaseOrdersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const gridRef = useRef(null);
  const [options, setOptions] = useState({ suppliers: [], warehouses: [] });
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', supplierId: '', warehouseId: '', from: '', to: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/suppliers'), api.get('/warehouses')])
      .then(([s, w]) => setOptions({ suppliers: s.data.suppliers, warehouses: w.data.warehouses }))
      .catch((err) => setToast({ severity: 'error', message: errorMessage(err, 'Could not load suppliers and warehouses') }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((prev) => ({ ...prev, search: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
          const res = await api.get('/purchase-orders', {
            params: {
              ...query,
              sort: params.sortModel[0]?.colId,
              dir: params.sortModel[0]?.sort,
              offset: params.startRow,
              limit: params.endRow - params.startRow,
            },
          });
          setTotal(res.data.total);
          params.successCallback(res.data.rows, res.data.total);
        } catch (err) {
          setToast({ severity: 'error', message: errorMessage(err, 'Could not load purchase orders') });
          params.failCallback();
        }
      },
    }),
    [filters]
  );

  const columnDefs = useMemo(() => [
    {
      // A real link, so it can also be opened in a new tab (Ctrl+click, middle click).
      colId: 'poNumber', field: 'poNumber', headerName: 'PO number', width: 130, minWidth: 130, pinned: 'left',
      cellStyle: { fontFamily: 'monospace', fontSize: 12 },
      cellRenderer: ({ data }) => data && (
        <Link component={RouterLink} to={`/purchase-orders/${data.id}`} underline="hover" fontWeight={600} sx={{ fontFamily: 'inherit' }}>
          {data.poNumber}
        </Link>
      ),
    },
    { colId: 'orderDate', field: 'orderDate', headerName: 'Order date', width: 120, minWidth: 120, valueFormatter: ({ value }) => formatDate(value) },
    { colId: 'supplier', headerName: 'Supplier', flex: 1, minWidth: 200, valueGetter: ({ data }) => data?.supplier.name },
    { colId: 'warehouse', headerName: 'Warehouse', width: 110, minWidth: 110, cellStyle: center, headerClass: 'header-center', valueGetter: ({ data }) => data?.warehouse.code },
    { colId: 'items', headerName: 'Lines', width: 80, minWidth: 80, sortable: false, cellStyle: center, headerClass: 'header-center', valueGetter: ({ data }) => data?.itemCount },
    { colId: 'units', headerName: 'Units', width: 90, minWidth: 90, sortable: false, cellStyle: center, headerClass: 'header-center', valueGetter: ({ data }) => data?.unitCount.toLocaleString() },
    { colId: 'totalAmount', field: 'totalAmount', headerName: 'Total', width: 130, minWidth: 130, cellStyle: center, headerClass: 'header-center', valueFormatter: ({ value }) => (value == null ? '' : money.format(value)) },
    { colId: 'expectedDate', field: 'expectedDate', headerName: 'Expected', width: 100, minWidth: 100, valueFormatter: ({ value }) => formatDate(value) },
    {
      colId: 'status', field: 'status', headerName: 'Status', width: 110, minWidth: 110, cellStyle: center, headerClass: 'header-center',
      cellRenderer: ({ value }) => value && <StatusChip status={value} />,
    },
    { colId: 'createdBy', headerName: 'Created by', width: 120, minWidth: 120, sortable: false, valueGetter: ({ data }) => data?.createdBy?.name },
  ], []);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);
  const setFilter = (field) => (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>Purchase Orders</Typography>
          <Typography color="text.secondary">Buying from suppliers: draft → approved → received.</Typography>
        </Box>
        {can('purchase_orders.create') && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/purchase-orders/new')}>New purchase order</Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField
          size="small" placeholder="Search PO number or supplier" value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 260 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField select size="small" label="Status" value={filters.status} onChange={setFilter('status')} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          {Object.entries(PO_STATUSES).map(([value, s]) => <MenuItem key={value} value={value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Supplier" value={filters.supplierId} onChange={setFilter('supplierId')} sx={{ minWidth: 190 }}>
          <MenuItem value="">All suppliers</MenuItem>
          {options.suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Warehouse" value={filters.warehouseId} onChange={setFilter('warehouseId')} sx={{ minWidth: 150 }}>
          <MenuItem value="">All warehouses</MenuItem>
          {options.warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="From" value={filters.from} onChange={setFilter('from')} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={filters.to} onChange={setFilter('to')} InputLabelProps={{ shrink: true }} />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {total === null ? ' ' : `${total.toLocaleString()} purchase order${total === 1 ? '' : 's'} · Click the PO number to open it`}
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
          overlayNoRowsTemplate="No purchase orders match these filters"
        />
      </Box>

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
