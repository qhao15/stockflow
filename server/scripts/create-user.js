// Creates an account with the given role, or updates the existing account with the same email.
// Usage: npm run create-user -- <admin|manager|staff> <email> <password> [name]
//        npm run create-admin -- <email> <password> [name]
import bcrypt from 'bcryptjs';
import { ensureDatabase, pool } from '../src/config/db.js';
import { ensureSchema } from '../src/db/schema.js';

const ROLES = ['admin', 'manager', 'staff'];
const args = process.argv.slice(2);
// create-admin passes --admin so the role argument can be left out.
const role = args[0] === '--admin' ? 'admin' : args.shift();
if (args[0] === '--admin') args.shift();
const [rawEmail, password, name] = args;

if (!ROLES.includes(role) || !rawEmail || !password) {
  console.error('Usage: npm run create-user -- <admin|manager|staff> <email> <password> [name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();
const displayName = name || role[0].toUpperCase() + role.slice(1);

try {
  await ensureDatabase();
  await ensureSchema();
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash),
       role = VALUES(role), is_active = 1`,
    [displayName, email, passwordHash, role]
  );
  console.log(`${displayName} account ready: ${email} (${role})`);
} catch (err) {
  console.error('Could not create user:', err.message || err.code);
  process.exitCode = 1;
} finally {
  await pool.end();
}
