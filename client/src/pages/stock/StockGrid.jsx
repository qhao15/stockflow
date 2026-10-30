import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  Alert, Box, FormControlLabel, IconButton, InputAdornment, MenuItem, Snackbar, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TuneIcon from '@mui/icons-material/Tune';
import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { gridTheme } from '../../lib/agGrid';
import MovementsDrawer from './MovementsDrawer';
import TransferDialog from './TransferDialog';
import AdjustDialog from './AdjustDialog';

const PAGE_SIZE = 50;
const center = { textAlign: 'center', justifyContent: 'center' };

const quantityIn = (data, warehouseId) => data?.quantities[warehouseId] ?? 0;

// One row per product, one column per active warehouse. Paging, sorting and filtering
// run on the server, like the products grid.
export default function StockGrid({ options }) {
  const { can } = useAuth();
  const canTransfer = can('stock.transfer');
  const canAdjust = can('stock.adjust');
  const { warehouses } = options;
  const gridRef = useRef(null);
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', categoryId: '', warehouseId: '', lowStock: false });
  const [toast, setToast] = useState(null);
  const [history, setHistory] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [adjusting, setAdjusting] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((prev) => ({ ...prev, search: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const res = await api.get('/stock', {
            params: {
              search: filters.search || undefined,
              categoryId: filters.categoryId || undefined,
              warehouseId: filters.warehouseId || undefined,
              lowStock: filters.lowStock || undefined,
              sort: params.sortModel[0]?.colId,
              dir: params.sortModel[0]?.sort,
              offset: params.startRow,
              limit: params.endRow - params.startRow,
            },
          });
          setTotal(res.data.total);
          params.successCallback(res.data.rows, res.data.total);
        } catch (err) {
          setToast({ severity: 'error', message: errorMessage(err, 'Could not load stock') });
          params.failCallback();
        }
      },
    }),
    [filters]
  );

  const refresh = () => gridRef.current?.api.refreshInfiniteCache();

  // Picking a warehouse shows only its column.
  const shownWarehouses = useMemo(
    () => (filters.warehouseId ? warehouses.filter((w) => w.id === filters.warehouseId) : warehouses),
    [warehouses, filters.warehouseId]
  );

  const columnDefs = useMemo(() => [
    { colId: 'sku', field: 'sku', headerName: 'SKU', width: 200, minWidth: 200, pinned: 'left', cellStyle: { fontFamily: 'monospace', fontSize: 12 } },
    { colId: 'name', field: 'name', headerName: 'Name', flex: 1, minWidth: 250 },
    { colId: 'category', field: 'categoryName', headerName: 'Category', width: 120, minWidth: 120, cellStyle: center, headerClass: 'header-center' },
    { colId: 'minStock', field: 'minStock', headerName: 'Min stock', width: 95, minWidth: 95, cellStyle: center, headerClass: 'header-center' },
    ...shownWarehouses.map((w) => ({
      colId: `w${w.id}`,
      headerName: w.code,
      headerTooltip: w.name,
      width: 80, minWidth: 80,
      headerClass: 'header-center',
      cellStyle: center,
      valueGetter: ({ data }) => (data ? quantityIn(data, w.id) : null),
      valueFormatter: ({ value }) => (value == null ? '' : value.toLocaleString()),
      cellClassRules: { 'low-stock': ({ data }) => Boolean(data) && quantityIn(data, w.id) <= data.minStock },
      tooltipValueGetter: ({ data }) => (data && quantityIn(data, w.id) <= data.minStock ? `At or below min stock (${data.minStock})` : undefined),
    })),
    {
      colId: 'total', field: 'total', headerName: 'Total', width: 80, minWidth: 80, cellStyle: { ...center, fontWeight: 600 },
      headerClass: 'header-center',
      valueFormatter: ({ value }) => (value == null ? '' : value.toLocaleString()),
    },
    {
      colId: 'actions', headerName: 'Action', width: canTransfer || canAdjust ? 120 : 64, pinned: 'right',
      sortable: false, resizable: false, suppressMovable: true, headerClass: 'header-center',
      cellStyle: { padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      cellRenderer: ({ data }) => data && (
        <>
          <Tooltip title="Movement history">
            <IconButton size="small" onClick={() => setHistory(data)}><HistoryIcon fontSize="small" /></IconButton>
          </Tooltip>
          {canTransfer && (
            <Tooltip title={data.total > 0 ? 'Transfer' : 'No stock to transfer'}>
              <span>
                <IconButton size="small" disabled={data.total === 0} onClick={() => setTransferring(data)}>
                  <SwapHorizIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
          {canAdjust && (
            <Tooltip title="Adjust (stock take, damage)">
              <IconButton size="small" onClick={() => setAdjusting(data)}><TuneIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </>
      ),
    },
  ], [shownWarehouses, canTransfer, canAdjust]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);

  // After a transfer or adjustment: reload the rows (quantities, low flags) and say what happened.
  const onDone = useCallback((message) => {
    setTransferring(null);
    setAdjusting(null);
    refresh();
    setToast({ severity: 'success', message });
  }, []);

  const showError = useCallback((message) => setToast({ severity: 'error', message }), []);

  const setFilter = (field) => (e) => setFilters((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField
          size="small" placeholder="Search SKU or name" value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 260 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField select size="small" label="Category" value={filters.categoryId} onChange={setFilter('categoryId')} sx={{ minWidth: 170 }}>
          <MenuItem value="">All categories</MenuItem>
          {options.categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Warehouse" value={filters.warehouseId} onChange={setFilter('warehouseId')} sx={{ minWidth: 170 }}>
          <MenuItem value="">All warehouses</MenuItem>
          {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </TextField>
        <FormControlLabel
          control={<Switch checked={filters.lowStock} onChange={(e) => setFilters((prev) => ({ ...prev, lowStock: e.target.checked }))} />}
          label="Low stock only"
        />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {total === null ? ' ' : `${total.toLocaleString()} product${total === 1 ? '' : 's'}`}
        {' · Highlighted: at or below min stock'}
      </Typography>

      <Box
        sx={{
          height: 'calc(100vh - 290px)',
          minHeight: 420,
          '& .header-center .ag-header-cell-label': { justifyContent: 'center' },
          '& .low-stock': { bgcolor: 'rgba(247, 144, 9, 0.14)', color: '#b54708', fontWeight: 600 },
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
          tooltipShowDelay={300}
          overlayNoRowsTemplate="No products match these filters"
        />
      </Box>

      <MovementsDrawer product={history} warehouses={warehouses} onClose={() => setHistory(null)} />
      <TransferDialog product={transferring} warehouses={warehouses} onClose={() => setTransferring(null)} onDone={onDone} onError={showError} />
      <AdjustDialog product={adjusting} warehouses={warehouses} reasons={options.reasons} onClose={() => setAdjusting(null)} onDone={onDone} onError={showError} />

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
