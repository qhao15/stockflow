import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';

const router = Router();

router.use(apiLimiter);
router.use(requireAuth);

// GET /api/suppliers - for pickers (purchase orders). Managing suppliers comes with the
// customers and suppliers module.
router.get('/', requirePermission('suppliers.view'), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, code, name, contact_name, email, phone, is_active FROM suppliers ORDER BY name');
    res.json({
      suppliers: rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contactName: s.contact_name,
        email: s.email,
        phone: s.phone,
        isActive: Boolean(s.is_active),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
