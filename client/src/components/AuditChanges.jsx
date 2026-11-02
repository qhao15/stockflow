import { Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Labels and colours for the actions in the audit log.
export const AUDIT_ACTIONS = {
  create: { label: 'Created', color: 'success' },
  update: { label: 'Updated', color: 'primary' },
  delete: { label: 'Deleted', color: 'error' },
  import: { label: 'Imported', color: 'secondary' },
  adjust: { label: 'Adjusted', color: 'warning' },
  transfer: { label: 'Transferred', color: 'info' },
  approve: { label: 'Approved', color: 'info' },
  receive: { label: 'Received', color: 'success' },
  cancel: { label: 'Cancelled', color: 'error' },
  password_change: { label: 'Password changed', color: 'default' },
};

export const AUDIT_ENTITIES = {
  product: 'Product',
  category: 'Category',
  warehouse: 'Warehouse',
  stock: 'Stock',
  stock_transfer: 'Transfer',
  purchase_order: 'Purchase order',
  sales_order: 'Sales order',
  customer: 'Customer',
  supplier: 'Supplier',
  user: 'User',
};

export function ActionChip({ action }) {
  const a = AUDIT_ACTIONS[action] ?? { label: action, color: 'default' };
  return <Chip label={a.label} color={a.color} size="small" variant="outlined" sx={{ fontWeight: 600 }} />;
}

// salePrice -> "Sale price", isActive -> "Is active".
const label = (field) => field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/\bId\b/, 'ID');

function Value({ value }) {
  if (value === null || value === undefined || value === '') return <Typography component="span" color="text.disabled">—</Typography>;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  // Order lines come as one "SKU × qty @ price; ..." string: one per line.
  if (typeof value === 'string' && value.includes('; ')) {
    return <Box component="span" sx={{ whiteSpace: 'pre-line', fontSize: 13 }}>{value.split('; ').join('\n')}</Box>;
  }
  return String(value);
}

// The changes of one audit row: { field: [old, new] } as a before -> after table, and
// plain details (a transfer's quantity, a cancel reason) as single values.
export default function AuditChanges({ changes }) {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return <Typography variant="body2" color="text.secondary">No details recorded.</Typography>;
  const isPair = (v) => Array.isArray(v) && v.length === 2;
  return (
    <Table size="small" sx={{ '& td, & th': { verticalAlign: 'top' } }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: 180 }}>Field</TableCell>
          <TableCell>Before</TableCell>
          <TableCell sx={{ width: 32, px: 0 }} />
          <TableCell>After</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map(([field, value]) => (
          <TableRow key={field}>
            <TableCell sx={{ color: 'text.secondary' }}>{label(field)}</TableCell>
            {isPair(value) ? (
              <>
                <TableCell sx={{ color: 'error.main', textDecoration: value[0] != null && value[1] != null ? 'line-through' : 'none' }}>
                  <Value value={value[0]} />
                </TableCell>
                <TableCell sx={{ px: 0, color: 'text.disabled' }}><ArrowForwardIcon sx={{ fontSize: 16 }} /></TableCell>
                <TableCell sx={{ color: 'success.dark', fontWeight: 500 }}><Value value={value[1]} /></TableCell>
              </>
            ) : (
              <TableCell colSpan={3}><Value value={value} /></TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
