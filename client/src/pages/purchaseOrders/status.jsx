import { Chip } from '@mui/material';

export const PO_STATUSES = {
  draft: { label: 'Draft', color: 'default' },
  approved: { label: 'Approved', color: 'info' },
  received: { label: 'Received', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'error' },
};

export function StatusChip({ status, size = 'small' }) {
  const s = PO_STATUSES[status] ?? { label: status, color: 'default' };
  return <Chip label={s.label} color={s.color} size={size} variant={status === 'draft' ? 'outlined' : 'filled'} sx={{ fontWeight: 600 }} />;
}

// 'YYYY-MM-DD' (a date without time) is shown as that calendar day in any time zone.
export function formatDate(value) {
  if (!value) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return (dateOnly ? new Date(dateOnly[1], dateOnly[2] - 1, dateOnly[3]) : new Date(value)).toLocaleDateString();
}

export const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '');
