// Sales order tests against a real database (the one in server/.env). Each run creates
// its own user, customer, category, products and warehouse, and deletes them afterwards.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDatabase, pool, withTransaction } from '../src/db/pool.js';
import { ensureSchema } from '../src/db/schema.js';
import { AppError } from '../src/services/errors.js';
import { changeStock } from '../src/services/stockLedger.js';
import { cancelSalesOrder, createSalesOrder, getSalesOrder } from '../src/services/salesOrders.js';
import { buildInvoicePdf } from '../src/services/invoicePdf.js';

const tag = `S${Date.now().toString(36).slice(-6).toUpperCase()}`;
const ids = {};

const quantity = async (productId) => {
  const [[row]] = await pool.query('SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?', [productId, ids.warehouse]);
  return row?.quantity ?? 0;
};

// Sets a product's stock in the test warehouse to an exact amount, through the ledger.
async function setStock(productId, target) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?', [productId, ids.warehouse]);
    const change = target - (row?.quantity ?? 0);
    if (change) await changeStock(conn, { productId, warehouseId: ids.warehouse, change, type: 'adjustment', note: 'test setup', userId: ids.user });
  });
}

// Every stock row of the test products equals the sum of its movements.
async function assertLedgerInSync() {
  const [rows] = await pool.query(
    `SELECT s.product_id, s.quantity,
            (SELECT COALESCE(SUM(m.quantity_change), 0) FROM stock_movements m
             WHERE m.product_id = s.product_id AND m.warehouse_id = s.warehouse_id) AS moved
     FROM stock s WHERE s.product_id IN (?)`,
    [[ids.p1, ids.p2]]
  );
  for (const r of rows) assert.equal(Number(r.moved), r.quantity, `product ${r.product_id}: stock ${r.quantity}, movements ${r.moved}`);
}

const sell = (items, discount = 0) => withTransaction((conn) => createSalesOrder(conn, {
  customerId: ids.customer, warehouseId: ids.warehouse, discount, note: null, items,
}, ids.user));
const cancel = (id) => withTransaction((conn) => cancelSalesOrder(conn, id, 'test', ids.user));

before(async () => {
  await ensureDatabase();
  await ensureSchema();
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.user = await insert("INSERT INTO users (name, email, password_hash, role) VALUES ('SO test', ?, 'x', 'staff')", [`${tag.toLowerCase()}@test.invalid`]);
  ids.customer = await insert('INSERT INTO customers (code, name, city) VALUES (?, ?, ?)', [tag, 'Công ty Thử Nghiệm Đà Nẵng', 'Da Nang']);
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.p1 = await insert('INSERT INTO products (sku, name, category_id, cost_price, sale_price) VALUES (?, ?, ?, 6.5, 9.99)', [`TEST-${tag}-1`, 'Test product 1', ids.category]);
  ids.p2 = await insert('INSERT INTO products (sku, name, category_id, cost_price, sale_price) VALUES (?, ?, ?, 0.2, 0.29)', [`TEST-${tag}-2`, 'Test product 2', ids.category]);
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
    if (ids.customer) await pool.query('DELETE FROM sales_orders WHERE customer_id = ?', [ids.customer]); // items cascade
    if (products.length) await pool.query('DELETE FROM products WHERE id IN (?)', [products]);
    if (ids.category) await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    if (ids.warehouse) await pool.query('DELETE FROM warehouses WHERE id = ?', [ids.warehouse]);
    if (ids.customer) await pool.query('DELETE FROM customers WHERE id = ?', [ids.customer]);
    if (ids.user) await pool.query('DELETE FROM users WHERE id = ?', [ids.user]);
  } finally {
    await pool.end();
  }
});

test('the last unit cannot be sold twice', async () => {
  await setStock(ids.p1, 1);

  const results = await Promise.allSettled([
    sell([{ productId: ids.p1, quantity: 1 }]),
    sell([{ productId: ids.p1, quantity: 1 }]),
  ]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one order succeeds');
  const failed = results.find((r) => r.status === 'rejected')?.reason;
  assert.ok(failed instanceof AppError && failed.details.reason === 'insufficient_stock', `the other is refused for stock, got: ${failed}`);
  assert.match(failed.message, /out of stock/);
  assert.equal(await quantity(ids.p1), 0);
  await assertLedgerInSync();
});

test('an order with one short line deducts nothing', async () => {
  await setStock(ids.p1, 10);
  await setStock(ids.p2, 2);

  await assert.rejects(
    sell([{ productId: ids.p1, quantity: 4 }, { productId: ids.p2, quantity: 3 }]),
    (err) => err instanceof AppError && /Only 2 × TEST-.*-2 left/.test(err.message) && err.details.available === 2
  );
  assert.equal(await quantity(ids.p1), 10, 'line 1 was not deducted');
  assert.equal(await quantity(ids.p2), 2);
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM sales_orders WHERE customer_id = ? AND status = ?', [ids.customer, 'completed']);
  assert.equal(count, 1, 'only the order from the previous test exists');
  await assertLedgerInSync();
});

test('totals use exact cents, and prices are copied onto the lines', async () => {
  await setStock(ids.p1, 10);
  await setStock(ids.p2, 10);
  const order = await sell([{ productId: ids.p2, quantity: 3 }, { productId: ids.p1, quantity: 2 }], '1.50');

  assert.match(order.orderNumber, /^SO-\d{6,}$/);
  assert.equal(order.subtotal, 20.85); // 3 × 0.29 + 2 × 9.99
  assert.equal(order.discount, 1.5);
  assert.equal(order.totalAmount, 19.35);
  assert.deepEqual(order.items.map((i) => [i.productId, i.unitPrice, i.lineTotal]), [[ids.p2, 0.29, 0.87], [ids.p1, 9.99, 19.98]]);

  // A later price change doesn't touch the old order (or its cost, kept for profit reports).
  await pool.query('UPDATE products SET sale_price = 99, cost_price = 50 WHERE id = ?', [ids.p1]);
  const again = await getSalesOrder(order.id);
  assert.equal(again.items[1].unitPrice, 9.99);
  assert.equal(again.totalAmount, 19.35);
  const [[cost]] = await pool.query('SELECT unit_cost FROM sales_order_items WHERE sales_order_id = ? AND product_id = ?', [order.id, ids.p1]);
  assert.equal(Number(cost.unit_cost), 6.5);
  await pool.query('UPDATE products SET sale_price = 9.99, cost_price = 6.5 WHERE id = ?', [ids.p1]);

  await assert.rejects(sell([{ productId: ids.p2, quantity: 1 }], 5), /can't be more than the subtotal/);
});

test('cancelling returns the stock once, even when clicked twice', async () => {
  await setStock(ids.p1, 5);
  await setStock(ids.p2, 5);
  const order = await sell([{ productId: ids.p1, quantity: 2 }, { productId: ids.p2, quantity: 1 }]);
  assert.equal(await quantity(ids.p1), 3);

  const results = await Promise.allSettled([cancel(order.id), cancel(order.id)]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one cancel succeeds');
  const failed = results.find((r) => r.status === 'rejected')?.reason;
  assert.ok(failed instanceof AppError && failed.details.reason === 'wrong_status', `the other is refused, got: ${failed}`);
  assert.equal(await quantity(ids.p1), 5, 'stock is back, once');
  assert.equal(await quantity(ids.p2), 5);

  const [movements] = await pool.query(
    "SELECT type, product_id, quantity_change FROM stock_movements WHERE reference_type = 'sales_order' AND reference_id = ? ORDER BY id",
    [order.id]
  );
  assert.deepEqual(movements.map((m) => [m.type, m.product_id, m.quantity_change]), [
    ['sale', ids.p1, -2], ['sale', ids.p2, -1], ['sale_cancel', ids.p1, 2], ['sale_cancel', ids.p2, 1],
  ]);
  await assertLedgerInSync();
});

test('the invoice PDF is generated, with Vietnamese text', async () => {
  await setStock(ids.p1, 5);
  const order = await sell([{ productId: ids.p1, quantity: 1 }]);
  const pdf = await buildInvoicePdf(order);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 5000, `PDF is ${pdf.length} bytes`);

  const cancelled = await buildInvoicePdf(await cancel(order.id));
  assert.equal(cancelled.subarray(0, 5).toString(), '%PDF-');
});
