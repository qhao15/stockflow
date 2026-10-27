import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';
import { EMAIL_RE, MIN_PASSWORD_LENGTH } from '../utils/validation.js';

const router = Router();

// POST /api/auth/register - the first account becomes Admin, everyone after is Staff.
router.post('/register', async (req, res, next) => {
  const name = String(req.body.name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');

  if (!name || name.length > 100) return res.status(400).json({ message: 'Name is required (max 100 characters)' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users');
    const role = count === 0 ? 'admin' : 'staff';
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role]
    );
    const user = { id: result.insertId, name, email, role };
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with this email already exists' });
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    // Same message for unknown email and wrong password, so emails can't be probed.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.is_active) return res.status(403).json({ message: 'This account has been deactivated' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - the logged-in user, used to restore the session on page load.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
