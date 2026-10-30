// Role-based access: the permission table itself, and that every route refuses (403)
// exactly the roles the table says it should.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, ROLES, hasPermission, permissionsFor } from '../src/auth/permissions.js';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

// The table in the README ("Roles and permissions"). Admin has everything.
const EXPECTED = {
  staff: [
    'products.view', 'stock.view', 'sales_orders.view', 'sales_orders.create', 'customers.view', 'customers.manage',
  ],
  manager: [
    'products.view', 'products.manage',
    'stock.view', 'stock.transfer', 'stock.adjust',
    'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.approve', 'purchase_orders.receive', 'purchase_orders.cancel',
    'sales_orders.view', 'sales_orders.create', 'sales_orders.cancel',
    'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage', 'reports.view',
  ],
};

test('each role has exactly the permissions in the README table', () => {
  assert.deepEqual(ROLES, ['admin', 'manager', 'staff']);
  assert.deepEqual(permissionsFor('admin'), Object.keys(PERMISSIONS), 'admin has every permission');
  for (const role of ['manager', 'staff']) {
    assert.deepEqual([...permissionsFor(role)].sort(), [...EXPECTED[role]].sort(), role);
  }
  assert.equal(hasPermission('staff', 'no.such.permission'), false, 'unknown permissions are refused');
  assert.equal(hasPermission('nobody', 'products.view'), false, 'unknown roles get nothing');
});

// One request per permission. Bodies are empty or ids don't exist, so a role that is
// allowed gets 400/404 (validation) and nothing changes; a role that isn't gets 403.
const ROUTES = [
  ['products.view', 'GET', '/products?limit=1'],
  ['products.manage', 'POST', '/categories', {}],
  ['stock.view', 'GET', '/stock?limit=1'],
  ['stock.transfer', 'POST', '/stock/transfers', {}],
  ['stock.adjust', 'POST', '/stock/adjustments', {}],
  ['warehouses.manage', 'POST', '/warehouses', {}],
  ['purchase_orders.view', 'GET', '/purchase-orders?limit=1'],
  ['purchase_orders.create', 'POST', '/purchase-orders', {}],
  ['purchase_orders.approve', 'POST', '/purchase-orders/999999999/approve'],
  ['purchase_orders.receive', 'POST', '/purchase-orders/999999999/receive'],
  ['purchase_orders.cancel', 'POST', '/purchase-orders/999999999/cancel', {}],
  ['sales_orders.view', 'GET', '/sales-orders?limit=1'],
  ['sales_orders.create', 'POST', '/sales-orders', {}],
  ['sales_orders.cancel', 'POST', '/sales-orders/999999999/cancel', {}],
  ['customers.view', 'GET', '/customers?limit=1'],
  ['suppliers.view', 'GET', '/suppliers'],
  ['users.manage', 'GET', '/users'],
];

const tag = newTag('P');
let api;
const tokens = {};
const users = {};

before(async () => {
  api = await startApi();
  for (const role of ROLES) {
    users[role] = await createUser(tag, role);
    tokens[role] = await login(api.call, users[role]);
  }
});

after(async () => {
  try {
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

for (const role of ['admin', 'manager', 'staff']) {
  test(`${role}: the API allows and refuses what the table says`, async () => {
    const wrong = [];
    for (const [permission, method, path, body] of ROUTES) {
      const res = await api.call(method, path, { token: tokens[role], body });
      const allowed = hasPermission(role, permission);
      if (allowed ? res.status === 403 : res.status !== 403) {
        wrong.push(`${method} ${path} (${permission}): ${res.status}, expected ${allowed ? 'not 403' : '403'}`);
      }
      assert.ok(res.status < 500, `${method} ${path} returned ${res.status}`);
    }
    assert.deepEqual(wrong, []);
  });
}

test("an admin can't demote or deactivate themselves, but can change others", async () => {
  const { id } = users.admin;
  const token = tokens.admin;
  const demote = await api.call('PATCH', `/users/${id}`, { token, body: { role: 'staff' } });
  assert.equal(demote.status, 400);
  const deactivate = await api.call('PATCH', `/users/${id}`, { token, body: { isActive: false } });
  assert.equal(deactivate.status, 400);
  const [[me]] = await pool.query('SELECT role, is_active FROM users WHERE id = ?', [id]);
  assert.deepEqual({ ...me }, { role: 'admin', is_active: 1 });

  assert.equal((await api.call('PATCH', `/users/${users.staff.id}`, { token, body: { role: 'nonsense' } })).status, 400);
  const other = await api.call('PATCH', `/users/${users.staff.id}`, { token, body: { role: 'manager' } });
  assert.equal(other.status, 200);
  assert.equal(other.body.user.role, 'manager');
});
