import { useState } from 'react';
import { Link as RouterLink, Navigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Link, TextField, Typography } from '@mui/material';
import { safeRedirect, useAuth } from '../auth/AuthContext';
import AuthLayout from '../auth/AuthLayout';
import { errorMessage } from '../lib/api';

export default function Register() {
  const { user, register } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirect = searchParams.get('redirect');
  if (user) return <Navigate to={safeRedirect(redirect)} replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const mismatch = form.confirm !== '' && form.confirm !== form.password;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');

    setSubmitting(true);
    try {
      // Reloads the page on success, so the button stays disabled until then.
      await register(form.name, form.email, form.password, redirect);
    } catch (err) {
      setError(errorMessage(err, 'Registration failed'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create an account" subtitle="Start managing your sales and inventory.">
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Full name" name="name" autoComplete="name" autoFocus required fullWidth
          value={form.name} onChange={handleChange}
        />
        <TextField
          label="Email" name="email" type="email" autoComplete="email" required fullWidth
          value={form.email} onChange={handleChange}
        />
        <TextField
          label="Password" name="password" type="password" autoComplete="new-password" required fullWidth
          helperText="At least 8 characters"
          value={form.password} onChange={handleChange}
        />
        <TextField
          label="Confirm password" name="confirm" type="password" autoComplete="new-password" required fullWidth
          error={mismatch} helperText={mismatch ? 'Passwords do not match' : ' '}
          value={form.confirm} onChange={handleChange}
        />
        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <Typography variant="body2" textAlign="center" color="text.secondary">
          Already have an account?{' '}
          <Link
            component={RouterLink}
            to={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
            fontWeight={600}
          >
            Sign in
          </Link>
        </Typography>
      </Box>
    </AuthLayout>
  );
}
