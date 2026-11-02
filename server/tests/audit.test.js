// The audit log: a committed change always has exactly one row, a change that rolls back
// has none, only changed fields are stored, secrets never are, and only Admins can read it.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../src/db/pool.js';
import { audit } from '../src/services/audit.js';
import { changeStock } from '../src/services/stockLedger.js';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('L');
let api;
const users = {};
const tokens = {};
const ids = {};

before(async () => {
  api = await startApi();
  for (const role of ['admin', 'manager', 'staff']) {
    users[role] = await createUser(tag, role);
    tokens[role] = await login(api.call, users[role]);
  }
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.warehouse = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [tag, `Test ${tag}`]);
  ids.supplier = await insert('INSERT INTO suppliers (code, name) VALUES (?, ?)', [tag, `Test supplier ${tag}`]);
  ids.customer = await insert('INSERT INTO customers (code, name) VALUES (?, ?)', [tag, `Test customer ${tag}`]);
});

after(async () => {
  try {
    const [products] = await pool.query('SELECT id FROM products WHERE sku LIKE ?', [`TEST-${tag}-%`]);
    const productIds = products.map((p) => p.id);
    if (productIds.length) {
      await pool.query('DELETE FROM stock_movements WHERE product_id IN (?)', [productIds]);
      await pool.query('DELETE FROM stock WHERE product_id IN (?)', [productIds]);
    }
    if (ids.supplier) await pool.query('DELETE FROM purchase_orders WHERE supplier_id = ?', [ids.supplier]);
    if (ids.customer) await pool.query('DELETE FROM sales_orders WHERE customer_id = ?', [ids.customer]);
    if (productIds.length) await pool.query('DELETE FROM products WHERE id IN (?)', [productIds]);
    for (const [table, id] of [['categories', ids.category], ['warehouses', ids.warehouse], ['suppliers', ids.supplier], ['customers', ids.customer]]) {
      if (id) await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    }
    await pool.query("DELETE FROM audit_logs WHERE entity_label LIKE ? OR entity_label = 'rollback test'", [`%${tag}%`]);
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

const history = async (entity, entityId) => (await api.call('GET', `/audit-logs?entity=${entity}&entityId=${entityId}`, { token: tokens.admin })).body.rows;
// Rows written by this file's users only: other test files run at the same time.
const count = async () => (await pool.query('SELECT COUNT(*) AS n FROM audit_logs WHERE user_id IN (?)', [Object.values(users).map((u) => u.id)]))[0][0].n;

const createProduct = async (suffix) => {
  const res = await api.call('POST', '/products', {
    token: tokens.manager,
    body: { sku: `TEST-${tag}-${suffix}`, name: `${tag} product ${suffix}`, categoryId: ids.category, unit: 'pcs', costPrice: '10', salePrice: '15.50' },
  });
  assert.equal(res.status, 201, res.body?.message);
  return res.body.product;
};

test('a committed change has exactly one audit row, with only the fields that changed', async () => {
  const product = await createProduct('A');
  const edited = await api.call('PATCH', `/products/${product.id}`, { token: tokens.manager, body: { version: product.version, salePrice: '18', minStock: 4 } });
  assert.equal(edited.status, 200);

  const rows = await history('product', product.id);
  assert.deepEqual(rows.map((r) => r.action), ['update', 'create'], 'one row per change, newest first');
  const [update, create] = rows;
  assert.deepEqual(update.changes, { salePrice: [15.5, 18], minStock: [0, 4] }, 'only what changed');
  assert.equal(update.label, `TEST-${tag}-A`);
  assert.equal(update.user.id, users.manager.id);
  assert.ok(update.ip, 'the IP address is recorded');
  assert.deepEqual(create.changes.sku, [null, `TEST-${tag}-A`], 'a new record is [null, value]');
  assert.equal(create.changes.version, undefined, 'bookkeeping fields are left out');

  const unchanged = await api.call('PATCH', `/products/${product.id}`, { token: tokens.manager, body: { version: edited.body.product.version, salePrice: '18' } });
  assert.equal(unchanged.status, 200);
  assert.equal((await history('product', product.id)).length, 2, 'a save that changes nothing writes nothing');
});

test('a change that rolls back leaves no audit row', async () => {
  const product = await createProduct('B');
  const start = await count();

  // Fails after the audit row is written: both go.
  await assert.rejects(withTransaction(async (conn) => {
    await conn.query('UPDATE products SET sale_price = 99 WHERE id = ?', [product.id]);
    await audit(conn, { userId: users.manager.id, ip: null }, { action: 'update', entity: 'product', entityId: product.id, label: 'rollback test', changes: { salePrice: [15.5, 99] } });
    throw new Error('something failed later');
  }), /something failed later/);
  assert.equal(await count(), start, 'the audit row was rolled back with the change');

  // Refused by the API: an outdated edit (409) and an order for stock that isn't there (409).
  const stale = await api.call('PATCH', `/products/${product.id}`, { token: tokens.manager, body: { version: product.version + 5, salePrice: '1' } });
  assert.equal(stale.status, 409);
  const oversold = await api.call('POST', '/sales-orders', {
    token: tokens.staff, body: { customerId: ids.customer, warehouseId: ids.warehouse, items: [{ productId: product.id, quantity: 1 }] },
  });
  assert.equal(oversold.status, 409);
  assert.equal(await count(), start, 'nothing was logged for refused changes');
});

test('passwords and other secrets are never stored', async () => {
  const user = await createUser(tag, 'staff');
  const token = await login(api.call, user);
  const changed = await api.call('PUT', '/account/password', { token, body: { currentPassword: user.password, newPassword: 'Brand-new-pass-1' } });
  assert.equal(changed.status, 200);
  const [row] = await history('user', user.id);
  assert.equal(row.action, 'password_change');
  assert.equal(row.changes, null, 'only the fact, no values');

  await withTransaction((conn) => audit(conn, { userId: user.id }, {
    action: 'update', entity: 'user', entityId: user.id, label: `${tag} secrets`,
    changes: { name: ['A', 'B'], password: 'x', passwordHash: 'y', token: 'z' },
  }));
  const [secretRow] = await history('user', user.id);
  assert.deepEqual(secretRow.changes, { name: ['A', 'B'] });

  const [[{ leaks }]] = await pool.query("SELECT COUNT(*) AS leaks FROM audit_logs WHERE changes LIKE '%$2%'");
  assert.equal(leaks, 0, 'no bcrypt hash anywhere in the log');
});

test('orders, stock moves and admin changes are logged with their details', async () => {
  const product = await createProduct('C');
  await withTransaction((conn) => changeStock(conn, {
    productId: product.id, warehouseId: ids.warehouse, change: 20, type: 'adjustment', note: 'test setup', userId: users.manager.id,
  }));

  // Purchase order: create, approve, receive.
  const po = (await api.call('POST', '/purchase-orders', {
    token: tokens.manager, body: { supplierId: ids.supplier, warehouseId: ids.warehouse, items: [{ productId: product.id, quantity: 5, unitCost: '9.5' }] },
  })).body.purchaseOrder;
  await api.call('POST', `/purchase-orders/${po.id}/approve`, { token: tokens.manager });
  await api.call('POST', `/purchase-orders/${po.id}/receive`, { token: tokens.manager });
  const poRows = await history('purchase_order', po.id);
  assert.deepEqual(poRows.map((r) => r.action), ['receive', 'approve', 'create']);
  assert.deepEqual(poRows[0].changes, { status: ['approved', 'received'], warehouse: tag, unitsReceived: 5 });
  assert.equal(poRows[2].changes.lines[1], `TEST-${tag}-C × 5 @ 9.5`);

  // Sales order: create, cancel.
  const so = (await api.call('POST', '/sales-orders', {
    token: tokens.staff, body: { customerId: ids.customer, warehouseId: ids.warehouse, items: [{ productId: product.id, quantity: 2 }] },
  })).body.salesOrder;
  await api.call('POST', `/sales-orders/${so.id}/cancel`, { token: tokens.manager, body: { reason: 'Customer changed their mind' } });
  const soRows = await history('sales_order', so.id);
  assert.deepEqual(soRows.map((r) => [r.action, r.user.id]), [['cancel', users.manager.id], ['create', users.staff.id]]);
  assert.equal(soRows[0].changes.reason, 'Customer changed their mind');

  // Stock adjustment: before and after quantity.
  const adjusted = await api.call('POST', '/stock/adjustments', {
    token: tokens.manager, body: { productId: product.id, warehouseId: ids.warehouse, countedQuantity: 24, expectedQuantity: 25, reason: 'damaged' },
  });
  assert.equal(adjusted.status, 201, adjusted.body?.message);
  const [adjustRow] = await history('stock', product.id);
  assert.deepEqual(adjustRow.changes, { warehouse: tag, quantity: [25, 24], reason: 'Damaged', note: null });

  // An admin changing someone's role.
  await api.call('PATCH', `/users/${users.staff.id}`, { token: tokens.admin, body: { role: 'manager' } });
  const [roleRow] = await history('user', users.staff.id);
  assert.deepEqual(roleRow.changes, { role: ['staff', 'manager'] });
  assert.equal(roleRow.user.id, users.admin.id);
});

test('filters: action, user, record label and dates; options for the filter lists', async () => {
  const get = async (q) => (await api.call('GET', `/audit-logs?${q}`, { token: tokens.admin })).body;
  const mine = await get(`userId=${users.manager.id}`);
  assert.ok(mine.total > 0 && mine.rows.every((r) => r.user.id === users.manager.id));
  const receipts = await get(`action=receive&userId=${users.manager.id}`);
  assert.ok(receipts.rows.length > 0 && receipts.rows.every((r) => r.action === 'receive'));
  const bySku = await get(`search=TEST-${tag}-A`);
  assert.ok(bySku.rows.length >= 2 && bySku.rows.every((r) => r.label === `TEST-${tag}-A`));
  assert.equal((await get(`userId=${users.manager.id}&to=2000-01-01`)).total, 0, 'nothing before 2000');
  assert.equal((await get(`userId=${users.manager.id}&from=2000-01-01`)).total, mine.total, 'everything since 2000');

  const options = await get('').then(() => api.call('GET', '/audit-logs/options', { token: tokens.admin }));
  assert.ok(options.body.entities.includes('purchase_order'));
  assert.ok(options.body.users.some((u) => u.id === users.manager.id));
});

test('only Admins can read the audit log', async () => {
  for (const role of ['manager', 'staff']) {
    assert.equal((await api.call('GET', '/audit-logs', { token: tokens[role] })).status, 403, role);
  }
  assert.equal((await api.call('GET', '/audit-logs')).status, 401);
});
