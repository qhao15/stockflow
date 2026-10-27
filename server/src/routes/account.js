import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';
import { EMAIL_RE, MIN_PASSWORD_LENGTH } from '../utils/validation.js';

// The logged-in user's own account. Any role can use it.
const router = Router();

router.use(requireAuth);

// PATCH /api/account - change own name and email.
router.patch('/', async (req, res, next) => {
  const name = String(req.body.name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();

  if (!name || name.length > 100) return res.status(400).json({ message: 'Name is required (max 100 characters)' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email' });

  try {
    await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, req.user.id]);
    res.json({ user: { ...req.user, name, email } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Another account already uses this email' });
    next(err);
  }
});

// PUT /api/account/password - change own password. Tokens issued before the change stop
// working (see requireAuth), so other devices are signed out; this one gets a new token.
router.put('/password', async (req, res, next) => {
  const currentPassword = String(req.body.currentPassword ?? '');
  const newPassword = String(req.body.newPassword ?? '');

  if (!currentPassword) return res.status(400).json({ message: 'Current password is required' });
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'New password must be different from the current one' });
  }

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Whole seconds, to match the token's iat (also whole seconds).
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', [
      passwordHash, changedAt, req.user.id,
    ]);
    res.json({ token: signToken(req.user), user: publicUser(req.user) });
  } catch (err) {
    next(err);
  }
});

export default router;
