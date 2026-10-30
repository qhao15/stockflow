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
