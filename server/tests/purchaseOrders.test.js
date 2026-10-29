// Purchase order tests against a real database (the one in server/.env). Each run creates
// its own user, supplier, category, products and warehouse, and deletes them afterwards.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDatabase, pool, withTransaction } from '../src/db/pool.js';
import { ensureSchema } from '../src/db/schema.js';
import { AppError } from '../src/services/errors.js';
import {
  approvePurchaseOrder, cancelPurchaseOrder, createPurchaseOrder, receivePurchaseOrder, updatePurchaseOrder,
} from '../src/services/purchaseOrders.js';

const tag = `P${Date.now().toString(36).slice(-6).toUpperCase()}`;
const ids = {};

const quantity = async (productId) => {
  const [[row]] = await pool.query('SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?', [productId, ids.warehouse]);
  return row?.quantity ?? 0;
};

const movementCount = async () => {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM stock_movements WHERE warehouse_id = ?', [ids.warehouse]);
  return count;
};

const draft = (items = [{ productId: ids.p1, quantity: 10, unitCost: 2.5 }, { productId: ids.p2, quantity: 3, unitCost: 0.29 }]) => (
  withTransaction((conn) => createPurchaseOrder(conn, { supplierId: ids.supplier, warehouseId: ids.warehouse, expectedDate: null, note: null, items }, ids.user))
);
const approve = (id) => withTransaction((conn) => approvePurchaseOrder(conn, id, ids.user));
const receive = (id) => withTransaction((conn) => receivePurchaseOrder(conn, id, ids.user));
const cancel = (id) => withTransaction((conn) => cancelPurchaseOrder(conn, id, 'test', ids.user));

const isStatusError = (err) => err instanceof AppError && err.details.reason === 'wrong_status';

before(async () => {
  await ensureDatabase();
  await ensureSchema();
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.user = await insert("INSERT INTO users (name, email, password_hash, role) VALUES ('PO test', ?, 'x', 'manager')", [`${tag.toLowerCase()}@test.invalid`]);
  ids.supplier = await insert('INSERT INTO suppliers (code, name) VALUES (?, ?)', [tag, `Test supplier ${tag}`]);
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.p1 = await insert('INSERT INTO products (sku, name, category_id, sale_price) VALUES (?, ?, ?, 5)', [`TEST-${tag}-1`, 'Test product 1', ids.category]);
  ids.p2 = await insert('INSERT INTO products (sku, name, category_id, sale_price) VALUES (?, ?, ?, 1)', [`TEST-${tag}-2`, 'Test product 2', ids.category]);
  ids.warehouse = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [tag, `Test ${tag}`]);
});

// Removes whatever `before` managed to create, even if it failed part-way.
after(async () => {
  try {
    const products = [ids.p1, ids.p2].filter(Boolean);
    if (products.length) {
      await pool.query('DELETE FROM stock_movements WHERE product_id IN (?)', [products]);
      await pool.query('DELETE FROM stock WHERE product_id IN (?)', [products]);
    }
    if (ids.supplier) await pool.query('DELETE FROM purchase_orders WHERE supplier_id = ?', [ids.supplier]); // items cascade
    if (products.length) await pool.query('DELETE FROM products WHERE id IN (?)', [products]);
    if (ids.category) await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    if (ids.warehouse) await pool.query('DELETE FROM warehouses WHERE id = ?', [ids.warehouse]);
    if (ids.supplier) await pool.query('DELETE FROM suppliers WHERE id = ?', [ids.supplier]);
    if (ids.user) await pool.query('DELETE FROM users WHERE id = ?', [ids.user]);
  } finally {
    await pool.end();
  }
});

test('totals are exact in cents', async () => {
  const po = await draft();
  assert.match(po.poNumber, /^PO-\d{6,}$/);
  assert.equal(po.status, 'draft');
  assert.deepEqual(po.items.map((i) => i.lineTotal), [25, 0.87]);
  assert.equal(po.totalAmount, 25.87);
});

test('receiving the same PO twice at the same moment adds stock only once', async () => {
  const po = await draft();
  await approve(po.id);
  const [before1, before2] = [await quantity(ids.p1), await quantity(ids.p2)];

  const results = await Promise.allSettled([receive(po.id), receive(po.id)]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one receive succeeds');
  const failed = results.find((r) => r.status === 'rejected');
  assert.ok(isStatusError(failed?.reason), `the other is refused because the PO is already received, got: ${failed?.reason}`);
  assert.equal(await quantity(ids.p1), before1 + 10);
  assert.equal(await quantity(ids.p2), before2 + 3);

  const [movements] = await pool.query(
    "SELECT product_id, quantity_change FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = ? ORDER BY product_id",
    [po.id]
  );
  assert.deepEqual(movements.map((m) => [m.product_id, m.quantity_change]), [[ids.p1, 10], [ids.p2, 3]]);
});

test('an error on any line rolls back the whole receipt', async () => {
  const po = await draft();
  await approve(po.id);
  const [before1, before2, movementsBefore] = [await quantity(ids.p1), await quantity(ids.p2), await movementCount()];

  // Fail the second line: the movement for line 2 can't be written.
  let movementWrites = 0;
  await assert.rejects(withTransaction(async (conn) => {
    const failing = Object.create(conn);
    failing.query = (sql, params) => {
      if (/INSERT INTO stock_movements/.test(sql) && ++movementWrites === 2) throw new Error('disk full on line 2');
      return conn.query(sql, params);
    };
    return receivePurchaseOrder(failing, po.id, ids.user);
  }), /disk full on line 2/);

  assert.equal(await quantity(ids.p1), before1, 'line 1 stock was rolled back');
  assert.equal(await quantity(ids.p2), before2);
  assert.equal(await movementCount(), movementsBefore, 'no movements kept');
  const [[row]] = await pool.query('SELECT status, received_by FROM purchase_orders WHERE id = ?', [po.id]);
  assert.deepEqual({ ...row }, { status: 'approved', received_by: null }, 'still approved, so it can be received again');

  await receive(po.id);
  assert.equal(await quantity(ids.p1), before1 + 10);
});

test('status rules: approve only drafts, receive only approved, never cancel received', async () => {
  const po = await draft();
  await assert.rejects(receive(po.id), isStatusError, 'a draft cannot be received');

  const approvals = await Promise.allSettled([approve(po.id), approve(po.id)]);
  assert.equal(approvals.filter((r) => r.status === 'fulfilled').length, 1, 'approving twice at once succeeds once');

  await assert.rejects(
    withTransaction((conn) => updatePurchaseOrder(conn, po.id, {
      supplierId: ids.supplier, warehouseId: ids.warehouse, expectedDate: null, note: null, items: [{ productId: ids.p1, quantity: 1, unitCost: 1 }],
    }, 1)),
    isStatusError,
    'an approved PO cannot be edited'
  );

  await receive(po.id);
  await assert.rejects(cancel(po.id), isStatusError, 'a received PO cannot be cancelled');

  const other = await draft();
  const cancelled = await cancel(other.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelReason, 'test');
  await assert.rejects(approve(other.id), isStatusError, 'a cancelled PO cannot be approved');
});

test('editing a draft from an old version is refused', async () => {
  const po = await draft();
  const edit = (version, qty) => withTransaction((conn) => updatePurchaseOrder(conn, po.id, {
    supplierId: ids.supplier, warehouseId: ids.warehouse, expectedDate: '2030-01-31', note: 'edited',
    items: [{ productId: ids.p2, quantity: qty, unitCost: 1.1 }],
  }, version));

  const saved = await edit(po.version, 4);
  assert.equal(saved.version, po.version + 1);
  assert.equal(saved.totalAmount, 4.4);
  assert.deepEqual(saved.items.map((i) => i.productId), [ids.p2], 'lines were replaced');

  await assert.rejects(edit(po.version, 9), (err) => err instanceof AppError && err.details.reason === 'version_conflict');
});
