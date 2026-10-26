import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Verifies the Bearer token and reloads the user, so a deactivated account or
// changed role takes effect immediately instead of when the token expires.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ?',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ message: 'Account not available' });
    req.user = publicUser(user);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'You do not have permission to do this' });
    }
    next();
  };
}
