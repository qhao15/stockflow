// Authentication over HTTP: register, login, tokens, deactivation, role changes and
// password changes. Failed logins and registrations count towards the rate limit (10
// per 15 minutes), so this file stays below it; rateLimit.test.js tests the limit itself.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { PASSWORD, cleanupUsers, createUser, login, newTag, pool, startApi, trackEmail } from './helpers.js';

const tag = newTag('A');
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('register: later sign-ups become Staff, emails are unique and stored lowercase', async () => {
  const email = `${tag.toLowerCase()}-new@test.invalid`;
  trackEmail(email);

  const res = await api.call('POST', '/auth/register', { body: { name: '  New Person ', email: email.toUpperCase(), password: PASSWORD } });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'staff', 'the database already has users, so this one is Staff');
  assert.equal(res.body.user.email, email);
  assert.equal(res.body.user.name, 'New Person');
  assert.ok(res.body.user.permissions.includes('sales_orders.create'));
  assert.ok(!res.body.user.permissions.includes('users.manage'));

  const me = await api.call('GET', '/auth/me', { token: res.body.token });
  assert.equal(me.status, 200, 'the token from register works straight away');

  const again = await api.call('POST', '/auth/register', { body: { name: 'Copy', email, password: PASSWORD } });
  assert.equal(again.status, 409);

  const [[row]] = await pool.query('SELECT password_hash FROM users WHERE email = ?', [email]);
  assert.notEqual(row.password_hash, PASSWORD, 'the password is not stored as plain text');
  assert.match(row.password_hash, /^\$2[aby]\$/, 'it is a bcrypt hash');
});

test('register: validation', async () => {
  const short = await api.call('POST', '/auth/register', { body: { name: 'X', email: `${tag}-v@test.invalid`, password: 'short' } });
  assert.equal(short.status, 400);
  assert.match(short.body.message, /at least 8/);
  const badEmail = await api.call('POST', '/auth/register', { body: { name: 'X', email: 'not-an-email', password: PASSWORD } });
  assert.equal(badEmail.status, 400);
});

test('login: same answer for an unknown email and a wrong password', async () => {
  const user = await createUser(tag, 'staff');
  const wrongPassword = await api.call('POST', '/auth/login', { body: { email: user.email, password: 'wrong-password' } });
  const unknownEmail = await api.call('POST', '/auth/login', { body: { email: `${tag}-nobody@test.invalid`, password: 'wrong-password' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.message, unknownEmail.body.message, "the message doesn't reveal which emails exist");

  const ok = await api.call('POST', '/auth/login', { body: { email: `  ${user.email.toUpperCase()} `, password: user.password } });
  assert.equal(ok.status, 200, 'email is matched case-insensitively');
  assert.equal(ok.body.user.id, user.id);
  assert.equal(ok.body.user.password_hash, undefined, 'the hash is never sent');
});

test('protected routes: missing, invalid, expired or forged tokens get 401', async () => {
  const user = await createUser(tag, 'staff');
  const now = Math.floor(Date.now() / 1000);
  const tokens = {
    missing: undefined,
    garbage: 'not-a-token',
    expired: jwt.sign({ sub: user.id, role: 'staff', iat: now - 7200, exp: now - 3600 }, process.env.JWT_SECRET),
    forged: jwt.sign({ sub: user.id, role: 'admin' }, 'some-other-secret'),
  };
  for (const [kind, token] of Object.entries(tokens)) {
    const res = await api.call('GET', '/auth/me', { token });
    assert.equal(res.status, 401, `${kind} token`);
  }
});

test('the role is read from the database, not the token', async () => {
  const staff = await createUser(tag, 'staff');
  // A token that claims Admin, signed with the real secret, still only gets Staff rights.
  const claimsAdmin = jwt.sign({ sub: staff.id, role: 'admin' }, process.env.JWT_SECRET);
  const res = await api.call('GET', '/users', { token: claimsAdmin });
  assert.equal(res.status, 403);
});

test('deactivating an account and changing a role take effect on the next request', async () => {
  const admin = await createUser(tag, 'admin');
  const staff = await createUser(tag, 'staff');
  const adminToken = await login(api.call, admin);
  const staffToken = await login(api.call, staff);

  assert.equal((await api.call('POST', '/products', { token: staffToken, body: {} })).status, 403, 'Staff cannot manage products');
  const promoted = await api.call('PATCH', `/users/${staff.id}`, { token: adminToken, body: { role: 'manager' } });
  assert.equal(promoted.status, 200);
  const me = await api.call('GET', '/auth/me', { token: staffToken });
  assert.equal(me.body.user.role, 'manager', 'same token, new role');
  assert.ok(me.body.user.permissions.includes('products.manage'));

  await api.call('PATCH', `/users/${staff.id}`, { token: adminToken, body: { isActive: false } });
  assert.equal((await api.call('GET', '/auth/me', { token: staffToken })).status, 401, 'the existing token stops working');
  const relogin = await api.call('POST', '/auth/login', { body: { email: staff.email, password: staff.password } });
  assert.equal(relogin.status, 403, 'a deactivated account cannot log in');
});

test('changing the password signs out other sessions but keeps this one', async () => {
  const user = await createUser(tag, 'staff');
  const otherDevice = await login(api.call, user);
  // Tokens carry whole seconds; one issued in the same second as the change still counts as new.
  await wait(1100);
  const thisDevice = await login(api.call, user);

  const wrongCurrent = await api.call('PUT', '/account/password', { token: thisDevice, body: { currentPassword: 'nope-nope', newPassword: 'Another-pass-1' } });
  assert.equal(wrongCurrent.status, 400, 'the current password is required');

  const changed = await api.call('PUT', '/account/password', { token: thisDevice, body: { currentPassword: user.password, newPassword: 'Another-pass-1' } });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.token, 'this tab gets a fresh token');

  assert.equal((await api.call('GET', '/auth/me', { token: otherDevice })).status, 401, 'the other device is signed out');
  assert.equal((await api.call('GET', '/auth/me', { token: changed.body.token })).status, 200);
  const oldPassword = await api.call('POST', '/auth/login', { body: { email: user.email, password: user.password } });
  assert.equal(oldPassword.status, 401);
  assert.equal(await login(api.call, { ...user, password: 'Another-pass-1' }).then(() => 'ok'), 'ok');
});
