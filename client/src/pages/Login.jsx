import { useState } from 'react';
import { Link as RouterLink, Navigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Link, TextField, Typography } from '@mui/material';
import { safeRedirect, useAuth } from '../auth/AuthContext';
import AuthLayout from '../auth/AuthLayout';
import { errorMessage } from '../api/client';

export default function Login() {
  const { user, login } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirect = searchParams.get('redirect');
  if (user) return <Navigate to={safeRedirect(redirect)} replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // Reloads the page on success, so the button stays disabled until then.
      await login(form.email, form.password, redirect);
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back! Please enter your details.">
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Email" name="email" type="email" autoComplete="email" autoFocus required fullWidth
          value={form.email} onChange={handleChange}
        />
        <TextField
          label="Password" name="password" type="password" autoComplete="current-password" required fullWidth
          value={form.password} onChange={handleChange}
        />
        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <Typography variant="body2" textAlign="center" color="text.secondary">
          Don&apos;t have an account?{' '}
          <Link component={RouterLink} to={redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register'} fontWeight={600}>
            Create one
          </Link>
        </Typography>
      </Box>
    </AuthLayout>
  );
}
