// Stock ledger tests against a real database (the one in server/.env). Each run creates
// its own user, category, product and two warehouses, and deletes them afterwards, so
// existing data is left alone.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDatabase, pool, withTransaction } from '../src/db/pool.js';
import { ensureSchema } from '../src/db/schema.js';
import { StockError, adjustStock, changeStock, transferStock } from '../src/services/stockLedger.js';

const tag = `T${Date.now().toString(36).slice(-6).toUpperCase()}`;
const ids = {};

const quantity = async (warehouseId) => {
  const [[row]] = await pool.query('SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?', [ids.product, warehouseId]);
  return row?.quantity ?? 0;
};

// The core rule: every stock row equals the sum of its movements, and its last
// movement's balance_after matches it.
async function assertLedgerInSync() {
  const [rows] = await pool.query(
    `SELECT s.warehouse_id, s.quantity, COALESCE(SUM(m.quantity_change), 0) AS moved,
            (SELECT balance_after FROM stock_movements l WHERE l.product_id = s.product_id
               AND l.warehouse_id = s.warehouse_id ORDER BY l.id DESC LIMIT 1) AS last_balance
     FROM stock s LEFT JOIN stock_movements m ON m.product_id = s.product_id AND m.warehouse_id = s.warehouse_id
     WHERE s.product_id = ? GROUP BY s.warehouse_id, s.quantity`,
    [ids.product]
  );
  for (const r of rows) {
    assert.equal(Number(r.moved), r.quantity, `warehouse ${r.warehouse_id}: stock ${r.quantity}, movements sum to ${r.moved}`);
    assert.equal(r.last_balance ?? 0, r.quantity, `warehouse ${r.warehouse_id}: last balance_after ${r.last_balance}`);
  }
}

// Sets the fixture product's stock in a warehouse to an exact amount, through the ledger.
async function setStock(warehouseId, target) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?', [ids.product, warehouseId]);
    const change = target - (row?.quantity ?? 0);
    if (change) await changeStock(conn, { productId: ids.product, warehouseId, change, type: 'adjustment', note: 'test setup', userId: ids.user });
  });
}

const transfer = (from, to, qty) => withTransaction((conn) => transferStock(conn, {
  productId: ids.product, fromWarehouseId: from, toWarehouseId: to, quantity: qty, userId: ids.user,
}));

before(async () => {
  await ensureDatabase();
  await ensureSchema();
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.user = await insert("INSERT INTO users (name, email, password_hash, role) VALUES ('Stock test', ?, 'x', 'manager')", [`${tag.toLowerCase()}@test.invalid`]);
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.product = await insert('INSERT INTO products (sku, name, category_id, sale_price) VALUES (?, ?, ?, 1)', [`TEST-${tag}`, `Test product ${tag}`, ids.category]);
  ids.a = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [`${tag}A`, `Test ${tag} A`]);
  ids.b = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [`${tag}B`, `Test ${tag} B`]);
});

// Removes whatever `before` managed to create, even if it failed part-way.
after(async () => {
  try {
    if (ids.product) {
      const p = [ids.product];
      await pool.query('DELETE FROM stock_movements WHERE product_id = ?', p);
      await pool.query('DELETE FROM stock_transfers WHERE product_id = ?', p);
      await pool.query('DELETE FROM stock WHERE product_id = ?', p);
      await pool.query('DELETE FROM products WHERE id = ?', p);
    }
    if (ids.category) await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    const warehouses = [ids.a, ids.b].filter(Boolean);
    if (warehouses.length) await pool.query('DELETE FROM warehouses WHERE id IN (?)', [warehouses]);
    if (ids.user) await pool.query('DELETE FROM users WHERE id = ?', [ids.user]);
  } finally {
    await pool.end();
  }
});

beforeEach(async () => {
  await setStock(ids.a, 0);
  await setStock(ids.b, 0);
});

test('two concurrent transfers of the last units: one succeeds, one is rejected', async () => {
  await setStock(ids.a, 5);

  const results = await Promise.allSettled([transfer(ids.a, ids.b, 5), transfer(ids.a, ids.b, 5)]);

  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, 'exactly one transfer succeeds');
  assert.equal(failed.length, 1, 'exactly one transfer is rejected');
  assert.ok(failed[0].reason instanceof StockError, `rejected with a StockError, got: ${failed[0].reason}`);
  assert.equal(failed[0].reason.details.reason, 'insufficient_stock');
  assert.equal(await quantity(ids.a), 0);
  assert.equal(await quantity(ids.b), 5);
  await assertLedgerInSync();
});

test('many transfers in opposite directions at once: no deadlock, nothing lost', async () => {
  await setStock(ids.a, 100);
  await setStock(ids.b, 100);

  const runs = [];
  for (let i = 0; i < 10; i += 1) runs.push(transfer(ids.a, ids.b, 3), transfer(ids.b, ids.a, 2));
  const results = await Promise.allSettled(runs);

  assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => String(r.reason)), []);
  assert.equal(await quantity(ids.a), 100 - 30 + 20);
  assert.equal(await quantity(ids.b), 100 + 30 - 20);
  await assertLedgerInSync();
});

test('a failure half-way rolls back the stock and its movement', async () => {
  await setStock(ids.a, 10);
  const [[{ count: movementsBefore }]] = await pool.query('SELECT COUNT(*) AS count FROM stock_movements WHERE product_id = ?', [ids.product]);

  await assert.rejects(withTransaction(async (conn) => {
    await changeStock(conn, { productId: ids.product, warehouseId: ids.a, change: -4, type: 'transfer_out', userId: ids.user });
    throw new Error('crash after the first half');
  }), /crash after the first half/);

  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM stock_movements WHERE product_id = ?', [ids.product]);
  assert.equal(count, movementsBefore, 'no movement was kept');
  assert.equal(await quantity(ids.a), 10, 'stock is unchanged');
  await assertLedgerInSync();
});

test('stock can never go below zero', async () => {
  await setStock(ids.a, 2);
  await assert.rejects(transfer(ids.a, ids.b, 3), (err) => err instanceof StockError && err.details.available === 2);
  assert.equal(await quantity(ids.a), 2);
  await assertLedgerInSync();
});

test('an adjustment is refused when stock changed since it was counted', async () => {
  await setStock(ids.a, 10);
  const adjust = (counted, expected) => withTransaction((conn) => adjustStock(conn, {
    productId: ids.product, warehouseId: ids.a, countedQuantity: counted, expectedQuantity: expected, reason: 'stock_take', userId: ids.user,
  }));

  await transfer(ids.a, ids.b, 1); // someone moves a unit while the count is going on
  await assert.rejects(adjust(8, 10), (err) => err instanceof StockError && err.details.reason === 'stock_changed');
  assert.equal(await quantity(ids.a), 9);

  const result = await adjust(8, 9);
  assert.equal(result.change, -1);
  assert.equal(await quantity(ids.a), 8);
  await assertLedgerInSync();
});
