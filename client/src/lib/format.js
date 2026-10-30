// Dates for display, in the viewer's locale.

// 'YYYY-MM-DD' (a date without time) is shown as that calendar day in any time zone.
export function formatDate(value) {
  if (!value) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return (dateOnly ? new Date(dateOnly[1], dateOnly[2] - 1, dateOnly[3]) : new Date(value)).toLocaleDateString();
}

export const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '');

// Days since a date, as "today", "yesterday" or "12 days ago".
export function daysAgo(value) {
  if (!value) return '';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days.toLocaleString()} days ago`;
}
