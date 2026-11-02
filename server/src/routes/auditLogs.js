import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { AUDIT_ACTIONS, AUDIT_ENTITIES, listAuditLogs } from '../services/audit.js';

const router = Router();

router.use(apiLimiter);
router.use(requireAuth, requirePermission('audit_log.view'));

// GET /api/audit-logs?offset=&limit=&userId=&entity=&entityId=&action=&from=&to=&search=
// Newest first. entity + entityId give one record's history (e.g. a PO's detail page).
router.get('/', async (req, res, next) => {
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  try {
    res.json(await listAuditLogs(req.query, { offset, limit }));
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-logs/options - values for the filters: entity types, actions, and the
// users who appear in the log.
router.get('/options', async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u
       WHERE EXISTS (SELECT 1 FROM audit_logs a WHERE a.user_id = u.id) ORDER BY u.name`
    );
    res.json({ entities: AUDIT_ENTITIES, actions: AUDIT_ACTIONS, users });
  } catch (err) {
    next(err);
  }
});

export default router;
