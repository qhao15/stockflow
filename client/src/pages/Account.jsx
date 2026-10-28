import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from '@mui/material';
import api, { errorMessage } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

const MIN_PASSWORD_LENGTH = 8;

function ProfileForm() {
  const { user, updateSession } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const changed = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await api.patch('/account', { name, email });
      updateSession(res.data);
      setName(res.data.user.name);
      setEmail(res.data.user.email);
      setStatus({ severity: 'success', message: 'Profile updated' });
    } catch (err) {
      setStatus({ severity: 'error', message: errorMessage(err, 'Could not update profile') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent component="form" onSubmit={submit}>
        <Typography variant="h6" fontWeight={600}>Profile</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your name is shown on orders you create. Your email is what you log in with.
        </Typography>
        <Stack spacing={2}>
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required inputProps={{ maxLength: 100 }} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Box>
            <Typography variant="body2" color="text.secondary" component="span" sx={{ mr: 1 }}>Role:</Typography>
            <Chip label={user.role} size="small" color="primary" variant="outlined" sx={{ textTransform: 'capitalize' }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Only admin can change roles.
            </Typography>
          </Box>
          {status && <Alert severity={status.severity}>{status.message}</Alert>}
          <Box>
            <Button type="submit" variant="contained" disabled={!changed || saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const { updateSession } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const tooShort = form.newPassword.length > 0 && form.newPassword.length < MIN_PASSWORD_LENGTH;
  const mismatch = form.confirmPassword.length > 0 && form.confirmPassword !== form.newPassword;
  const ready = form.currentPassword && form.newPassword.length >= MIN_PASSWORD_LENGTH && form.confirmPassword === form.newPassword;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await api.put('/account/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      updateSession(res.data);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatus({ severity: 'success', message: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setStatus({ severity: 'error', message: errorMessage(err, 'Could not change password') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent component="form" onSubmit={submit}>
        <Typography variant="h6" fontWeight={600}>Password</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Changing your password signs you out on every other device.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Current password" type="password" autoComplete="current-password"
            value={form.currentPassword} onChange={set('currentPassword')} required
          />
          <TextField
            label="New password" type="password" autoComplete="new-password"
            value={form.newPassword} onChange={set('newPassword')} required
            error={tooShort} helperText={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
          <TextField
            label="Confirm new password" type="password" autoComplete="new-password"
            value={form.confirmPassword} onChange={set('confirmPassword')} required
            error={mismatch} helperText={mismatch ? 'Passwords do not match' : ' '}
          />
          {status && <Alert severity={status.severity}>{status.message}</Alert>}
          <Box>
            <Button type="submit" variant="contained" disabled={!ready || saving}>
              {saving ? 'Saving...' : 'Change password'}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Account() {
  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h5" fontWeight={700}>Account settings</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Manage your profile and password.</Typography>
      <Stack spacing={3}>
        <ProfileForm />
        <PasswordForm />
      </Stack>
    </Box>
  );
}
