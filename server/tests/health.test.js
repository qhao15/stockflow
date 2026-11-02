// The health check: public answers say only whether things are up; the database name and
// version are for Admins; a database failure's error text never reaches a response.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('H');
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

test('public health says the database is connected, and nothing about which one', async () => {
  const res = await api.call('GET', '/health');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['api', 'database', 'time']);
  assert.deepEqual(res.body.database, { status: 'connected' });
});

test('a database failure answers 503 without the error text', async (t) => {
  const secret = "Access denied for user 'root'@'db.internal.example'";
  t.mock.method(pool, 'query', async () => { throw new Error(secret); });
  t.mock.method(console, 'error', () => {}); // keep the expected log line out of the test output

  const res = await api.call('GET', '/health');

  assert.equal(res.status, 503);
  assert.deepEqual(res.body.database, { status: 'disconnected' });
  assert.ok(!JSON.stringify(res.body).includes('db.internal.example'), 'the host stays private');
  assert.match(console.error.mock.calls[0].arguments.join(' '), /Access denied/, 'it goes to the server log');
});

test('database name and version are for Admins only', async () => {
  assert.equal((await api.call('GET', '/health/details')).status, 401);
  for (const role of ['manager', 'staff']) {
    const token = await login(api.call, await createUser(tag, role));
    assert.equal((await api.call('GET', '/health/details', { token })).status, 403, role);
  }
  const token = await login(api.call, await createUser(tag, 'admin'));
  const res = await api.call('GET', '/health/details', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.database.name, process.env.DB_NAME);
  assert.ok(res.body.database.version);
});
