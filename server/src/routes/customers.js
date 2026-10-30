import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { escapeLike } from '../services/format.js';

const router = Router();

router.use(apiLimiter);
router.use(requireAuth);

// GET /api/customers?search=&status=&limit= - for pickers (sales orders). Searches code,
// name and contact. Managing customers comes with the customers and suppliers module.
router.get('/', requirePermission('customers.view'), async (req, res, next) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const where = [];
  const params = [];
  const search = String(req.query.search ?? '').trim();
  if (search) {
    where.push('(code LIKE ? OR name LIKE ? OR contact_name LIKE ?)');
    params.push(...Array(3).fill(`%${escapeLike(search)}%`));
  }
  if (req.query.status === 'active') where.push('is_active = 1');
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, contact_name, phone, city, is_active FROM customers
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name LIMIT ?`,
      [...params, limit]
    );
    res.json({
      customers: rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        contactName: c.contact_name,
        phone: c.phone,
        city: c.city,
        isActive: Boolean(c.is_active),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
