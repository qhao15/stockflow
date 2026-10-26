import { Box, Button, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import { Link as RouterLink } from 'react-router-dom';

export default function ComingSoon({ title }) {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <ConstructionIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
      <Typography variant="h5" fontWeight={700} sx={{ mt: 2 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>This module will be built in a later step.</Typography>
      <Button variant="contained" component={RouterLink} to="/">Back to dashboard</Button>
    </Box>
  );
}
