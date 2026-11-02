import { Fragment, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Card, Collapse, IconButton, InputAdornment, Link, MenuItem, Skeleton, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api, { errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import AuditChanges, { AUDIT_ACTIONS, AUDIT_ENTITIES, ActionChip } from '../../components/AuditChanges';

// Where a logged record can be opened. Deleted records still link; their page says "not found".
const recordPath = (row) => ({
  purchase_order: `/purchase-orders/${row.entityId}`,
  sales_order: `/sales-orders/${row.entityId}`,
  customer: `/customers/${row.entityId}`,
  supplier: `/suppliers/${row.entityId}`,
  product: `/products?search=${encodeURIComponent(row.label ?? '')}`,
  category: '/products?tab=categories',
  warehouse: '/admin?tab=warehouses',
  stock: '/stock',
  stock_transfer: '/stock',
  user: '/admin',
})[row.entity];

// A short summary of what changed, shown in the collapsed row.
function summary(row) {
  const fields = Object.keys(row.changes ?? {});
  if (row.action === 'import') return `${row.changes?.created ?? 0} created, ${row.changes?.updated ?? 0} updated`;
  if (row.action === 'transfer') return `${row.changes?.quantity} × ${row.changes?.product}: ${row.changes?.from} → ${row.changes?.to}`;
  if (row.action === 'update') return fields.join(', ');
  if (row.action === 'cancel') return row.changes?.reason ?? '';
  return '';
}

function Row({ row }) {
  const [open, setOpen] = useState(false);
  const path = recordPath(row);
  const canExpand = row.changes && Object.keys(row.changes).length > 0;
  return (
    <Fragment>
      <TableRow hover sx={{ '& > td': { borderBottom: open ? 'none' : undefined } }}>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.createdAt)}</TableCell>
        <TableCell>
          {row.user ? row.user.name : <Typography component="span" color="text.disabled">Deleted user</Typography>}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{row.ip}</Typography>
        </TableCell>
        <TableCell><ActionChip action={row.action} /></TableCell>
        <TableCell>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{AUDIT_ENTITIES[row.entity] ?? row.entity}</Typography>
          {path ? (
            <Link component={RouterLink} to={path} underline="hover" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: 13 }}>
              {row.label ?? `#${row.entityId}`}
            </Link>
          ) : (row.label ?? '')}
        </TableCell>
        <TableCell sx={{ color: 'text.secondary', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary(row)}
        </TableCell>
        <TableCell align="right" sx={{ width: 56 }}>
          {canExpand && (
            <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Hide changes' : 'Show changes'}>
              <ExpandMoreIcon fontSize="small" sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </IconButton>
          )}
        </TableCell>
      </TableRow>
      {canExpand && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0, bgcolor: 'grey.50' }}>
            <Collapse in={open} unmountOnExit>
              <Box sx={{ py: 2, maxWidth: 900 }}><AuditChanges changes={row.changes} /></Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

// Admin: every change in the system, newest first, with filters and a before/after view.
export default function AuditLogPage() {
  const [options, setOptions] = useState({ users: [] });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', entity: '', action: '', userId: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/audit-logs/options').then((res) => setOptions(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: search.trim() }));
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    api
      .get('/audit-logs', { params: { ...params, offset: page * pageSize, limit: pageSize } })
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load the audit log')));
    return () => { cancelled = true; };
  }, [filters, page, pageSize]);

  const setFilter = (field) => (e) => {
    setFilters((prev) => ({ ...prev, [field]: e.target.value }));
    setPage(0);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>Audit Log</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Every change, who made it and when. Expand a row to see the values before and after.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField
          size="small" placeholder="Search record (SKU, PO number, name...)" value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 300 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField select size="small" label="Record type" value={filters.entity} onChange={setFilter('entity')} sx={{ minWidth: 160 }}>
          <MenuItem value="">All types</MenuItem>
          {Object.entries(AUDIT_ENTITIES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Action" value={filters.action} onChange={setFilter('action')} sx={{ minWidth: 150 }}>
          <MenuItem value="">All actions</MenuItem>
          {Object.entries(AUDIT_ACTIONS).map(([value, a]) => <MenuItem key={value} value={value}>{a.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="User" value={filters.userId} onChange={setFilter('userId')} sx={{ minWidth: 170 }}>
          <MenuItem value="">Everyone</MenuItem>
          {options.users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="From" value={filters.from} onChange={setFilter('from')} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={filters.to} onChange={setFilter('to')} InputLabelProps={{ shrink: true }} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 180 }}>Time</TableCell>
                <TableCell sx={{ width: 180 }}>User</TableCell>
                <TableCell sx={{ width: 150 }}>Action</TableCell>
                <TableCell sx={{ width: 240 }}>Record</TableCell>
                <TableCell>Changes</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {!data && !error && (
                <TableRow><TableCell colSpan={6}><Skeleton variant="rounded" height={240} /></TableCell></TableRow>
              )}
              {data && data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                    No changes match these filters. Changes are logged from now on: the demo data was loaded directly, not through the app.
                  </TableCell>
                </TableRow>
              )}
              {data?.rows.map((row) => <Row key={row.id} row={row} />)}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={data?.total ?? 0}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Card>
    </Box>
  );
}
