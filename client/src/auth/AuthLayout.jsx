import { Box, Card, CardContent, Typography } from '@mui/material';
import Logo from '../components/Logo';

// Shared centered card for the login and register pages.
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <Logo size={40} variant="h5" />
          </Box>
          <Typography variant="h6" fontWeight={700} textAlign="center">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
