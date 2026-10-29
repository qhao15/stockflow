import { useEffect, useState } from 'react';
import {
  Alert, Box, Card, Chip, MenuItem, Select, Skeleton, Snackbar, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import api, { errorMessage } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', hint: 'Users, warehouses, settings, audit log' },
  { value: 'manager', label: 'Manager', hint: 'Approves purchase orders, sees reports' },
  { value: 'staff', label: 'Staff', hint: 'Creates sales orders, checks stock' },
];

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api
      .get('/users')
      .then((res) => setUsers(res.data.users))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load users')));
  }, []);

  const update = async (id, changes) => {
    setSavingId(id);
    try {
      const res = await api.patch(`/users/${id}`, changes);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data.user : u)));
      setToast({ severity: 'success', message: `Updated ${res.data.user.name}` });
    } catch (err) {
      setToast({ severity: 'error', message: errorMessage(err, 'Could not update user') });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Change roles and deactivate accounts. Changes apply to the user's next request.
      </Typography>

      {loadError && <Alert severity="error">{loadError}</Alert>}
      {!users && !loadError && <Skeleton variant="rounded" height={240} />}

      {users && (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell sx={{ width: 180 }}>Role</TableCell>
                  <TableCell sx={{ width: 100 }}>Active</TableCell>
                  <TableCell sx={{ width: 140 }}>Joined</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => {
                  const isMe = u.id === me.id;
                  const busy = savingId === u.id;
                  return (
                    <TableRow key={u.id} sx={{ opacity: u.isActive ? 1 : 0.55 }}>
                      <TableCell>
                        {u.name}
                        {isMe && <Chip label="You" size="small" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Tooltip title={isMe ? "You can't change your own role" : ''}>
                          <span>
                            <Select
                              size="small"
                              fullWidth
                              value={u.role}
                              disabled={isMe || busy}
                              onChange={(e) => update(u.id, { role: e.target.value })}
                              renderValue={(v) => ROLE_OPTIONS.find((r) => r.value === v)?.label}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <MenuItem key={r.value} value={r.value}>
                                  <Box>
                                    <Typography>{r.label}</Typography>
                                    <Typography variant="caption" color="text.secondary">{r.hint}</Typography>
                                  </Box>
                                </MenuItem>
                              ))}
                            </Select>
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={isMe ? "You can't deactivate yourself" : ''}>
                          <span>
                            <Switch
                              checked={u.isActive}
                              disabled={isMe || busy}
                              onChange={(e) => update(u.id, { isActive: e.target.checked })}
                            />
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        // Just below the top bar instead of covering it.
        sx={{ top: { xs: 64, sm: 76 } }}
      >
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
