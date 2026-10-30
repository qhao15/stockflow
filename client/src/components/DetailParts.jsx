import { Box, Card, CardContent, Typography } from '@mui/material';

// Small building blocks shared by the customer and supplier detail pages.

// A totals card: label, big value, optional hint underneath.
export function Stat({ label, value, hint }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h5" fontWeight={700}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  );
}

// A label with its value, or a dash when there is none.
export function Field({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography component="div" sx={{ whiteSpace: 'pre-line' }}>{children || '—'}</Typography>
    </Box>
  );
}
