import { useEffect, useState } from 'react';
import {
  Box, Button, Card, CardContent, Collapse, IconButton, Skeleton, Stack, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime } from '../lib/format';
import AuditChanges, { ActionChip } from './AuditChanges';

const PAGE_SIZE = 10;

function Entry({ row }) {
  const [open, setOpen] = useState(false);
  const hasDetails = row.changes && Object.keys(row.changes).length > 0;
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ActionChip action={row.action} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={500} noWrap>{row.user?.name ?? 'Deleted user'}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDateTime(row.createdAt)}</Typography>
        </Box>
        {hasDetails && (
          <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Hide changes' : 'Show changes'}>
            <ExpandMoreIcon fontSize="small" sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        )}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1 }}><AuditChanges changes={row.changes} /></Box>
      </Collapse>
    </Box>
  );
}

// A record's change history (who changed what, when), newest first. Admin only: renders
// nothing for anyone else. reloadKey: change it to load again (e.g. after an action).
export default function AuditHistory({ entity, entityId, reloadKey, card = true }) {
  const { can } = useAuth();
  const allowed = can('audit_log.view');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!allowed || !entityId) return;
    let cancelled = false;
    api
      .get('/audit-logs', { params: { entity, entityId, limit: PAGE_SIZE } })
      .then((res) => !cancelled && setData(res.data))
      .catch(() => !cancelled && setData({ rows: [], total: 0 }));
    return () => { cancelled = true; };
  }, [allowed, entity, entityId, reloadKey]);

  if (!allowed) return null;

  const loadMore = async () => {
    const res = await api.get('/audit-logs', { params: { entity, entityId, limit: PAGE_SIZE, offset: data.rows.length } });
    setData((prev) => ({ rows: [...prev.rows, ...res.data.rows], total: res.data.total }));
  };

  const body = (
    <>
      <Typography variant="h6" fontWeight={600}>History</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Who changed what, from the audit log</Typography>
      {!data && <Skeleton variant="rounded" height={80} />}
      {data && data.rows.length === 0 && <Typography variant="body2" color="text.secondary">No changes recorded yet.</Typography>}
      {data && data.rows.length > 0 && (
        <Stack>
          {data.rows.map((row) => <Entry key={row.id} row={row} />)}
          {data.rows.length < data.total && (
            <Button size="small" onClick={loadMore} sx={{ alignSelf: 'flex-start', mt: 1 }}>
              Show older ({data.total - data.rows.length})
            </Button>
          )}
        </Stack>
      )}
    </>
  );

  return card ? <Card><CardContent>{body}</CardContent></Card> : body;
}
