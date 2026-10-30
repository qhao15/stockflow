// Dates for display, in the viewer's locale.

// 'YYYY-MM-DD' (a date without time) is shown as that calendar day in any time zone.
export function formatDate(value) {
  if (!value) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return (dateOnly ? new Date(dateOnly[1], dateOnly[2] - 1, dateOnly[3]) : new Date(value)).toLocaleDateString();
}

export const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '');
