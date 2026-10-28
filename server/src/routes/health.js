import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// GET /api/health - reports API and database status for the main page.
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT VERSION() AS version, DATABASE() AS name');
    res.json({
      api: 'ok',
      database: { status: 'connected', name: rows[0].name, version: rows[0].version },
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      api: 'ok',
      database: { status: 'disconnected', error: err.message || err.code },
      time: new Date().toISOString(),
    });
  }
});

export default router;
