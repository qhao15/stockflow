// Suppliers over HTTP: generated codes, purchasing totals (spend counts received POs,
// open POs are separate, cancelled ones count for neither), the PO history, delete vs
// deactivate, and that Staff can't see suppliers at all.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../src/db/pool.js';
import {
  approvePurchaseOrder, cancelPurchaseOrder, createPurchaseOrder, receivePurchaseOrder,
} from '../src/services/purchaseOrders.js';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('V');
let api;
let manager;
let token;
const ids = { suppliers: new Set() };

before(async () => {
  api = await startApi();
  manager = await createUser(tag, 'manager');
  token = await login(api.call, manager);
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.product = await insert('INSERT INTO products (sku, name, category_id, cost_price, sale_price) VALUES (?, ?, ?, 4, 9)', [`TEST-${tag}`, 'Test product', ids.category]);
  ids.warehouse = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [tag, `Test ${tag}`]);
});

after(async () => {
  try {
    if (ids.product) {
      await pool.query('DELETE FROM stock_movements WHERE product_id = ?', [ids.product]);
      await pool.query('DELETE FROM stock WHERE product_id = ?', [ids.product]);
    }
    if (ids.suppliers.size) await pool.query('DELETE FROM purchase_orders WHERE supplier_id IN (?)', [[...ids.suppliers]]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id = ?', [ids.product]);
    if (ids.suppliers.size) await pool.query('DELETE FROM suppliers WHERE id IN (?)', [[...ids.suppliers]]);
    if (ids.category) await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    if (ids.warehouse) await pool.query('DELETE FROM warehouses WHERE id = ?', [ids.warehouse]);
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

const createSupplier = async (body) => {
  const res = await api.call('POST', '/suppliers', { token, body });
  if (res.status === 201) ids.suppliers.add(res.body.supplier.id);
  return res;
};

// A PO of `quantity` × 4.00, taken to the given status through the real service.
async function purchase(supplierId, quantity, status) {
  const po = await withTransaction((conn) => createPurchaseOrder(conn, {
    supplierId, warehouseId: ids.warehouse, expectedDate: null, note: null, items: [{ productId: ids.product, quantity, unitCost: 4 }],
  }, manager.id));
  const step = (fn) => withTransaction((conn) => fn(conn, po.id, manager.id));
  if (status === 'cancelled') await withTransaction((conn) => cancelPurchaseOrder(conn, po.id, 'test', manager.id));
  if (['approved', 'received'].includes(status)) await step(approvePurchaseOrder);
  if (status === 'received') await step(receivePurchaseOrder);
  return po;
}

test('create: the code is generated; contact fields are validated', async () => {
  const res = await createSupplier({ name: `${tag} Components Ltd.`, contactName: 'Trần Thị Hoa', phone: '028 3822 1234', city: 'Ho Chi Minh City', email: `Buy@${tag}.example` });
  assert.equal(res.status, 201, res.body?.message);
  const s = res.body.supplier;
  assert.equal(s.code, `SUP-${String(s.id).padStart(3, '0')}`);
  assert.equal(s.email, `buy@${tag.toLowerCase()}.example`);
  assert.deepEqual([s.receivedCount, s.spend, s.openCount, s.inUse], [0, 0, 0, false]);

  assert.equal((await createSupplier({ name: '' })).status, 400);
  assert.equal((await createSupplier({ name: 'X', email: 'nope' })).status, 400);
});

test('totals: spend counts received POs, open POs are separate, cancelled count for neither', async () => {
  const { body } = await createSupplier({ name: `${tag} Totals` });
  const id = body.supplier.id;
  await purchase(id, 10, 'received'); // 40.00
  await purchase(id, 5, 'received'); // 20.00
  await purchase(id, 2, 'approved'); // 8.00 open
  await purchase(id, 1, 'draft'); // 4.00 open
  await purchase(id, 7, 'cancelled');

  const { supplier } = (await api.call('GET', `/suppliers/${id}`, { token })).body;
  assert.deepEqual(
    {
      received: supplier.stats.receivedCount, spend: supplier.stats.spend, average: supplier.stats.averageOrder,
      open: supplier.stats.openCount, openValue: supplier.stats.openValue, cancelled: supplier.stats.cancelledCount,
    },
    { received: 2, spend: 60, average: 30, open: 2, openValue: 12, cancelled: 1 }
  );

  const history = (await api.call('GET', `/suppliers/${id}/purchase-orders`, { token })).body;
  assert.equal(history.total, 5);
  assert.deepEqual(history.rows.map((po) => po.status), ['cancelled', 'draft', 'approved', 'received', 'received'], 'newest first');

  const sorted = (await api.call('GET', `/suppliers?search=${tag}&sort=spend&dir=desc`, { token })).body.rows;
  assert.equal(sorted[0].id, id);
});

test('a supplier with purchase orders is kept (deactivate instead); one without can be deleted', async () => {
  const used = (await createSupplier({ name: `${tag} Used` })).body.supplier;
  await purchase(used.id, 1, 'cancelled');
  const refused = await api.call('DELETE', `/suppliers/${used.id}`, { token });
  assert.equal(refused.status, 409, 'even a cancelled PO keeps the supplier');
  assert.equal(refused.body.reason, 'in_use');

  const deactivated = await api.call('PATCH', `/suppliers/${used.id}`, { token, body: { isActive: false } });
  assert.equal(deactivated.body.supplier.isActive, false);
  const active = (await api.call('GET', `/suppliers?search=${tag}%20Used&status=active`, { token })).body.rows;
  assert.equal(active.length, 0, 'hidden from the PO form');
  const poForInactive = await withTransaction((conn) => createPurchaseOrder(conn, {
    supplierId: used.id, warehouseId: ids.warehouse, expectedDate: null, note: null, items: [{ productId: ids.product, quantity: 1, unitCost: 1 }],
  }, manager.id)).catch((err) => err);
  assert.match(String(poForInactive.message), /inactive/, 'and a new PO for it is refused');

  const unused = (await createSupplier({ name: `${tag} Unused` })).body.supplier;
  assert.equal((await api.call('DELETE', `/suppliers/${unused.id}`, { token })).status, 204);
});

test('Staff cannot see or manage suppliers', async () => {
  const staffToken = await login(api.call, await createUser(tag, 'staff'));
  assert.equal((await api.call('GET', '/suppliers', { token: staffToken })).status, 403);
  assert.equal((await api.call('POST', '/suppliers', { token: staffToken, body: { name: 'X' } })).status, 403);
});
