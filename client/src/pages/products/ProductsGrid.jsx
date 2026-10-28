import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  Alert, Box, Button, Checkbox, Chip, Divider, FormControlLabel, IconButton, InputAdornment, ListItemText,
  Menu, MenuItem, Snackbar, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import api, { downloadFile, errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { gridTheme, money } from '../../lib/agGrid';
import ProductDialog from './ProductDialog';
import ImportDialog from './ImportDialog';
import DeleteProductDialog from './DeleteProductDialog';

const PAGE_SIZE = 50;
const COLUMNS_PREF = 'products.grid.columns';

function StockCell({ data }) {
  if (!data) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
      <span>{data.stock.toLocaleString()}</span>
      {data.lowWarehouses > 0 && (
        <Tooltip title={`At or below min stock in ${data.lowWarehouses} warehouse(s)`}>
          <Chip label="Low" size="small" color="warning" sx={{ height: 20, fontSize: 11 }} />
        </Tooltip>
      )}
    </Box>
  );
}

function StatusCell({ data }) {
  if (!data) return null;
  return data.isActive
    ? <Chip label="Active" size="small" color="success" variant="outlined" sx={{ height: 22 }} />
    : <Chip label="Inactive" size="small" variant="outlined" sx={{ height: 22 }} />;
}

// Product list. Paging, sorting and filtering run on the server (AG Grid infinite row
// model), so it stays fast with tens of thousands of products.
export default function ProductsGrid({ options }) {
  const { can } = useAuth();
  const canManage = can('products.manage');
  const gridRef = useRef(null);
  const [total, setTotal] = useState(null);
  const [filters, setFilters] = useState({ search: '', categoryId: '', status: 'all', lowStock: false });
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [dialogProduct, setDialogProduct] = useState(undefined); // undefined = closed, null = new
  const [importOpen, setImportOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [columnsMenu, setColumnsMenu] = useState(null);
  const [, refreshColumnsMenu] = useState(0);
  const saveTimer = useRef(null);
  const columnsLoaded = useRef(false);

  // Search waits until typing pauses, so every keystroke doesn't hit the server.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((prev) => ({ ...prev, search: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = useCallback(
    (sortModel = []) => ({
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      status: filters.status,
      lowStock: filters.lowStock || undefined,
      sort: sortModel[0]?.colId,
      dir: sortModel[0]?.sort,
    }),
    [filters]
  );

  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const res = await api.get('/products', {
            params: { ...queryParams(params.sortModel), offset: params.startRow, limit: params.endRow - params.startRow },
          });
          setTotal(res.data.total);
          params.successCallback(res.data.rows, res.data.total);
        } catch (err) {
          setToast({ severity: 'error', message: errorMessage(err, 'Could not load products') });
          params.failCallback();
        }
      },
    }),
    [queryParams]
  );

  const refresh = () => gridRef.current?.api.refreshInfiniteCache();

  // ---------- inline editing ----------

  const onCellValueChanged = async (event) => {
    const { data, node, colDef, oldValue, newValue } = event;
    const field = colDef.field;
    if (oldValue === newValue) return;
    const revert = () => node.setData({ ...data, [field]: oldValue });
    if (newValue === null || newValue === undefined || newValue < 0) {
      revert();
      setToast({ severity: 'error', message: `${colDef.headerName} must be 0 or more` });
      return;
    }
    try {
      const res = await api.patch(`/products/${data.id}`, { version: data.version, [field]: newValue });
      node.setData(res.data.product);
      event.api.flashCells({ rowNodes: [node], columns: [colDef.colId] });
    } catch (err) {
      const latest = err.response?.status === 409 ? err.response.data.product : null;
      if (latest) node.setData(latest);
      else revert();
      setToast({ severity: latest ? 'warning' : 'error', message: errorMessage(err, 'Could not save the change') });
    }
  };

  // ---------- columns: show/hide, order and width, saved per user on the server ----------

  const saveColumns = () => {
    if (!columnsLoaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const state = gridRef.current?.api.getColumnState().map(({ colId, hide, width, pinned }) => ({ colId, hide, width, pinned }));
      api.put(`/account/preferences/${COLUMNS_PREF}`, { value: state }).catch(() => {});
    }, 800);
  };

  const onGridReady = async ({ api: grid }) => {
    try {
      const res = await api.get(`/account/preferences/${COLUMNS_PREF}`);
      if (Array.isArray(res.data.value)) grid.applyColumnState({ state: res.data.value, applyOrder: true });
    } catch {
      // keep the default layout
    }
    columnsLoaded.current = true;
  };

  const resetColumns = () => {
    gridRef.current.api.resetColumnState();
    api.put(`/account/preferences/${COLUMNS_PREF}`, { value: null }).catch(() => {});
    setColumnsMenu(null);
  };

  // ---------- columns ----------

  const columnDefs = useMemo(() => {
    const priceCol = (colId, headerName) => ({
      colId, field: colId, headerName, width: 100, minWidth: 100,
      cellStyle: { textAlign: 'center', justifyContent: 'center' },
      valueFormatter: ({ value }) => (value == null ? '' : money.format(value)),
      editable: canManage,
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: { min: 0, precision: 2 },
      cellClass: canManage ? 'editable-cell' : undefined,
    });
    return [
      { colId: 'sku', field: 'sku', headerName: 'SKU', width: 200, minWidth: 200, pinned: 'left', cellStyle: { fontFamily: 'monospace', fontSize: 12 } },
      { colId: 'name', field: 'name', headerName: 'Name', flex: 1, minWidth: 250 },
      { colId: 'category', field: 'categoryName', headerName: 'Category', width: 120, minWidth: 120 },
      { colId: 'brand', field: 'brand', headerName: 'Brand', width: 100, minWidth: 100 },
      { colId: 'unit', field: 'unit', headerName: 'Unit', width: 70, minWidth: 70 },
      priceCol('costPrice', 'Cost price'),
      priceCol('salePrice', 'Sale price'),
      {
        colId: 'margin', headerName: 'Margin', width: 80, minWidth: 80, sortable: false,
        cellStyle: { textAlign: 'center', justifyContent: 'center' },
        valueGetter: ({ data }) => (data && data.salePrice > 0 ? (data.salePrice - data.costPrice) / data.salePrice : null),
        valueFormatter: ({ value }) => (value == null ? '' : `${(value * 100).toFixed(1)}%`),
      },
      {
        colId: 'minStock', field: 'minStock', headerName: 'Min stock', width: 95, minWidth: 95,
        cellStyle: { textAlign: 'center', justifyContent: 'center' },
        editable: canManage, cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 0, precision: 0 },
        cellClass: canManage ? 'editable-cell' : undefined,
      },
      { colId: 'stock', headerName: 'Stock', width: 90, minWidth: 90, cellRenderer: StockCell },
      { colId: 'status', headerName: 'Status', width: 90, minWidth: 90, sortable: false, cellRenderer: StatusCell },
      {
        colId: 'updatedAt', field: 'updatedAt', headerName: 'Updated', width: 170, hide: true,
        valueFormatter: ({ value }) => (value ? new Date(value).toLocaleString() : ''),
      },
      ...(canManage
        ? [{
          // Fixed width that fits the two icons; without width AG Grid defaults to 200px.
          colId: 'actions', headerName: 'Action', width: 84, pinned: 'right', sortable: false, resizable: false,
          suppressMovable: true, lockVisible: true, headerClass: 'header-center',
          cellStyle: { padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
          cellRenderer: ({ data }) => data && (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => setDialogProduct(data)}><EditIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title={data.inUse ? 'Has sales, purchase or stock history - Cannot delete it' : 'Delete'}>
                <span>
                  <IconButton size="small" disabled={data.inUse} onClick={() => setDeletingProduct(data)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          ),
        }]
        : []),
    ];
  }, [canManage]);

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true }), []);
  const hideableColumns = columnDefs.filter((c) => !c.lockVisible && c.colId !== 'sku');

  // ---------- toolbar actions ----------

  const exportExcel = async () => {
    try {
      const sortModel = gridRef.current.api.getColumnState().filter((c) => c.sort).map((c) => ({ colId: c.colId, sort: c.sort }));
      await downloadFile('/products/export', queryParams(sortModel), 'products.xlsx');
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not export') });
    }
  };

  const onSaved = (product, isEdit) => {
    setDialogProduct(undefined);
    const node = isEdit && gridRef.current.api.getRowNode(String(product.id));
    if (node) node.setData(product);
    else refresh();
    setToast({ severity: 'success', message: `${product.sku} ${isEdit ? 'saved' : 'added'}` });
  };

  const onDeleted = (product) => {
    setDeletingProduct(null);
    refresh();
    setToast({ severity: 'success', message: `${product.sku} deleted` });
  };

  const onDeactivated = (product) => {
    setDeletingProduct(null);
    gridRef.current.api.getRowNode(String(product.id))?.setData(product);
    setToast({ severity: 'success', message: `${product.sku} set to inactive` });
  };

  const onDeleteError = (message) => {
    setDeletingProduct(null);
    setToast({ severity: 'error', message });
  };

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
        <TextField select size="small" label="Status" value={filters.status} onChange={setFilter('status')} sx={{ minWidth: 120 }}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="inactive">Inactive</MenuItem>
        </TextField>
        <FormControlLabel
          control={<Switch checked={filters.lowStock} onChange={(e) => setFilters((prev) => ({ ...prev, lowStock: e.target.checked }))} />}
          label="Low stock only"
        />
        <Box sx={{ flexGrow: 1 }} />
        <Button startIcon={<ViewColumnIcon />} onClick={(e) => { refreshColumnsMenu((n) => n + 1); setColumnsMenu(e.currentTarget); }}>
          Columns
        </Button>
        {canManage && <Button startIcon={<FileUploadIcon />} onClick={() => setImportOpen(true)}>Import</Button>}
        <Button startIcon={<FileDownloadIcon />} onClick={exportExcel}>Export</Button>
        {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogProduct(null)}>Add product</Button>}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {total === null ? ' ' : `${total.toLocaleString()} product${total === 1 ? '' : 's'}`}
        {canManage && ' · Double-click a price or min stock to edit it'}
      </Typography>

      <Box
        sx={{
          height: 'calc(100vh - 290px)',
          minHeight: 420,
          '& .editable-cell': { cursor: 'text' },
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
          onGridReady={onGridReady}
          onCellValueChanged={onCellValueChanged}
          onColumnVisible={saveColumns}
          onColumnMoved={(e) => e.finished && saveColumns()}
          onColumnResized={(e) => e.finished && saveColumns()}
          onColumnPinned={saveColumns}
          stopEditingWhenCellsLoseFocus
          overlayNoRowsTemplate="No products match these filters"
        />
      </Box>

      <Menu anchorEl={columnsMenu} open={Boolean(columnsMenu)} onClose={() => setColumnsMenu(null)}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: 'block' }}>Saved to your account</Typography>
        {hideableColumns.map((c) => {
          const visible = gridRef.current?.api.getColumn(c.colId)?.isVisible() ?? !c.hide;
          return (
            <MenuItem key={c.colId} dense onClick={() => {
              gridRef.current.api.setColumnsVisible([c.colId], !visible);
              refreshColumnsMenu((n) => n + 1);
            }}>
              <Checkbox size="small" checked={visible} sx={{ p: 0, mr: 1 }} />
              <ListItemText primary={c.headerName} />
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem dense onClick={resetColumns}>Reset to default</MenuItem>
      </Menu>

      <ProductDialog
        open={dialogProduct !== undefined}
        product={dialogProduct}
        options={options}
        onClose={() => setDialogProduct(undefined)}
        onSaved={onSaved}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={refresh} />
      <DeleteProductDialog
        product={deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onDeleted={onDeleted}
        onDeactivated={onDeactivated}
        onError={onDeleteError}
      />

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
