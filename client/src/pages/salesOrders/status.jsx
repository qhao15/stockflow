import { Chip } from '@mui/material';

export const SO_STATUSES = {
  completed: { label: 'Completed', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'error' },
};

export function StatusChip({ status, size = 'small' }) {
  const s = SO_STATUSES[status] ?? { label: status, color: 'default' };
  return <Chip label={s.label} color={s.color} size={size} variant="outlined" sx={{ fontWeight: 600 }} />;
}
