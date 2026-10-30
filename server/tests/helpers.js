// Shared by the HTTP tests: start the API on a free port against the database in
// server/.env, make temporary users, call the API, and remove everything afterwards.
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { ensureDatabase, pool } from '../src/db/pool.js';
import { ensureSchema } from '../src/db/schema.js';
import app from '../src/app.js';

export const PASSWORD = 'Test-pass-123';

// A short tag unique to this run, so test rows never clash with real ones or each other.
export const newTag = (prefix) => `${prefix}${Date.now().toString(36).slice(-6).toUpperCase()}`;

export async function startApi() {
  await ensureDatabase();
  await ensureSchema();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // call('POST', '/auth/login', { body, token }) -> { status, body, headers }
  const call = async (method, path, { body, token, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const type = res.headers.get('content-type') ?? '';
    let data = null;
    if (type.includes('json')) data = await res.json();
    else if (res.status !== 204) data = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: data, headers: res.headers };
  };

  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, call, close };
}

// Users made by a test file, deleted by cleanupUsers().
const userIds = new Set();
const userEmails = new Set();

export async function createUser(tag, role, { name = `Test ${role}`, password = PASSWORD, isActive = true } = {}) {
  const email = `${tag.toLowerCase()}-${role}-${userIds.size + 1}@test.invalid`;
  const hash = await bcrypt.hash(password, 4); // low cost: fast tests, still a real bcrypt hash
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [name, email, hash, role, isActive ? 1 : 0]
  );
  userIds.add(result.insertId);
  return { id: result.insertId, email, password, role };
}

// Accounts made through the API (register) are tracked by email.
export const trackEmail = (email) => userEmails.add(email.toLowerCase());

export async function login(call, user) {
  const res = await call('POST', '/auth/login', { body: { email: user.email, password: user.password } });
  if (res.status !== 200) throw new Error(`login failed for ${user.email}: ${res.status} ${res.body?.message}`);
  return res.body.token;
}

export async function cleanupUsers() {
  if (userEmails.size) {
    const [rows] = await pool.query('SELECT id FROM users WHERE email IN (?)', [[...userEmails]]);
    rows.forEach((r) => userIds.add(r.id));
  }
  if (userIds.size) {
    await pool.query('DELETE FROM user_preferences WHERE user_id IN (?)', [[...userIds]]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [[...userIds]]);
  }
}

export { pool };
