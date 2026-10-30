// The login rate limit, in its own file: each test file runs in its own process, so the
// in-memory counter starts at zero here.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUsers, createUser, newTag, pool, startApi } from './helpers.js';

const tag = newTag('R');
let api;

before(async () => {
  api = await startApi();
});

after(async () => {
  try {
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

test('successful logins never count, and the 11th failed attempt is refused', async () => {
  const user = await createUser(tag, 'staff');
  const attempt = (password) => api.call('POST', '/auth/login', { body: { email: user.email, password } });

  for (let i = 0; i < 12; i += 1) assert.equal((await attempt(user.password)).status, 200, `successful login ${i + 1}`);

  const statuses = [];
  for (let i = 0; i < 11; i += 1) statuses.push((await attempt('wrong-password')).status);
  assert.deepEqual(statuses, [...Array(10).fill(401), 429]);

  const blocked = await attempt(user.password);
  assert.equal(blocked.status, 429, 'even the right password waits until the window ends');
  assert.match(blocked.body.message, /Too many attempts/);
  assert.ok(blocked.headers.get('ratelimit'), 'the standard RateLimit header tells the client when to retry');
});
