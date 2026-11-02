import { Router } from 'express';
import { pool } from '../db/pool.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';

const router = Router();

router.use(apiLimiter);

// GET /api/health - public, for uptime checks: only whether the API and database are up.
// No database name, version or error text, which would help an attacker. Errors go to the
// server log.
router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ api: 'ok', database: { status: 'connected' }, time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check: database not reachable:', err.message || err.code);
    res.status(503).json({ api: 'ok', database: { status: 'disconnected' }, time: new Date().toISOString() });
  }
});

// GET /api/health/details - the database name and version, for the Admin's system status card.
router.get('/details', requireAuth, requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT VERSION() AS version, DATABASE() AS name');
    res.json({ database: { name: rows[0].name, version: rows[0].version } });
  } catch (err) {
    next(err);
  }
});

export default router;
