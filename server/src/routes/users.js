import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ROLES } from '../auth/permissions.js';
import { publicUser, requireAuth, requirePermission } from '../auth/middleware.js';

const router = Router();

router.use(requireAuth, requirePermission('users.manage'));

function toUser(row) {
  return { ...publicUser(row), isActive: Boolean(row.is_active), createdAt: row.created_at };
}

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at, id'
    );
    res.json({ users: rows.map(toUser) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id - change role and/or active status.
router.patch('/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  const { role, isActive } = req.body;

  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ message: 'Unknown role' });
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive must be true or false' });
  }
  if (role === undefined && isActive === undefined) return res.status(400).json({ message: 'Nothing to update' });
  // Admins can't demote or deactivate themselves, so there is always at least one active admin.
  if (id === req.user.id && ((role !== undefined && role !== 'admin') || isActive === false)) {
    return res.status(400).json({ message: 'You cannot remove your own admin access' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE users SET role = COALESCE(?, role), is_active = COALESCE(?, is_active) WHERE id = ?',
      [role ?? null, isActive === undefined ? null : Number(isActive), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });

    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?',
      [id]
    );
    res.json({ user: toUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
