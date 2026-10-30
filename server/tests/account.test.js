// Account settings over HTTP: own profile and saved UI preferences. (Password changes
// are in auth.test.js, with the sign-out of other sessions.)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('C');
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

test('profile: change own name and email; emails stay unique', async () => {
  const user = await createUser(tag, 'staff');
  const other = await createUser(tag, 'manager');
  const token = await login(api.call, user);

  const newEmail = `${tag.toLowerCase()}-renamed@test.invalid`;
  const res = await api.call('PATCH', '/account', { token, body: { name: '  Renamed Person ', email: newEmail.toUpperCase() } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, 'Renamed Person');
  assert.equal(res.body.user.email, newEmail);
  assert.equal(res.body.user.role, 'staff', 'the role cannot be changed here');
  user.email = newEmail;
  assert.ok(await login(api.call, user), 'can log in with the new email');

  const taken = await api.call('PATCH', '/account', { token, body: { name: 'X', email: other.email } });
  assert.equal(taken.status, 409);
  assert.equal((await api.call('PATCH', '/account', { token, body: { name: 'X', email: 'nope' } })).status, 400);
  assert.equal((await api.call('PATCH', '/account', { token, body: { name: ' ', email: newEmail } })).status, 400);

  const sneaky = await api.call('PATCH', '/account', { token, body: { name: 'X', email: newEmail, role: 'admin' } });
  assert.equal(sneaky.status, 200);
  const [[row]] = await pool.query('SELECT role FROM users WHERE id = ?', [user.id]);
  assert.equal(row.role, 'staff', 'sending a role is ignored');
});

test('preferences: saved per user, and keys and sizes are checked', async () => {
  const a = await createUser(tag, 'staff');
  const b = await createUser(tag, 'staff');
  const tokenA = await login(api.call, a);
  const tokenB = await login(api.call, b);
  const key = 'products.grid.columns';
  const value = [{ colId: 'sku', width: 220 }, { colId: 'brand', hide: true }];

  assert.deepEqual((await api.call('GET', `/account/preferences/${key}`, { token: tokenA })).body, { value: null }, 'nothing saved yet');
  assert.equal((await api.call('PUT', `/account/preferences/${key}`, { token: tokenA, body: { value } })).status, 204);
  assert.deepEqual((await api.call('GET', `/account/preferences/${key}`, { token: tokenA })).body, { value });
  assert.deepEqual((await api.call('GET', `/account/preferences/${key}`, { token: tokenB })).body, { value: null }, "another user doesn't see it");

  assert.equal((await api.call('GET', '/account/preferences/bad%20key!', { token: tokenA })).status, 400);
  const huge = await api.call('PUT', `/account/preferences/${key}`, { token: tokenA, body: { value: 'x'.repeat(30_000) } });
  assert.equal(huge.status, 400);
});
