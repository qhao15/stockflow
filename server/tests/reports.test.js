// Reports over HTTP. The orders here are dated 2001, so exact totals can be checked even
// while other test files create orders at the same time.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('T');
let api;
let manager;
let staff;
const ids = {};

// An order written directly with a past date: the API always dates orders now.
async function order(number, date, status, { subtotal, discount = 0, lines }) {
  const [result] = await pool.query(
    `INSERT INTO sales_orders (order_number, customer_id, warehouse_id, status, order_date, subtotal, discount, total_amount, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`${tag}-${number}`, ids.customer, ids.warehouse, status, date, subtotal, discount, (subtotal * 100 - discount * 100) / 100, ids.user]
  );
  await pool.query(
    'INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, unit_cost, line_total) VALUES ?',
    [lines.map(([productId, quantity, price, cost]) => [result.insertId, productId, quantity, price, cost, (quantity * Math.round(price * 100)) / 100])]
  );
}

before(async () => {
  api = await startApi();
  const managerUser = await createUser(tag, 'manager');
  manager = await login(api.call, managerUser);
  staff = await login(api.call, await createUser(tag, 'staff'));
  ids.user = managerUser.id;
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.customer = await insert('INSERT INTO customers (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.warehouse = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [tag, `Test ${tag}`]);
  const product = (suffix, minStock, active = 1) => insert(
    'INSERT INTO products (sku, name, category_id, sale_price, min_stock, is_active) VALUES (?, ?, ?, 1, ?, ?)',
    [`TEST-${tag}-${suffix}`, `Test ${suffix}`, ids.category, minStock, active]
  );
  // Far below any real minimum, so they sort first in the low-stock report.
  ids.a = await product('A', 900000);
  ids.b = await product('B', 0);
  ids.inactive = await product('OFF', 900000, 0);
  await pool.query('INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, 7)', [ids.a, ids.warehouse]);

  await order('1', '2001-03-10 09:00:00', 'completed', { subtotal: 110, discount: 10, lines: [[ids.a, 2, 55, 30]] });
  await order('2', '2001-03-12 23:59:59', 'completed', { subtotal: 50, lines: [[ids.b, 5, 10, 4]] });
  await order('3', '2001-03-11 12:00:00', 'cancelled', { subtotal: 999, lines: [[ids.a, 99, 10.09, 1]] });
  await order('4', '2001-04-02 00:00:00', 'completed', { subtotal: 0.3, lines: [[ids.a, 1, 0.1, 0.05], [ids.b, 1, 0.2, 0.05]] });
});

after(async () => {
  try {
    if (ids.customer) await pool.query('DELETE FROM sales_orders WHERE customer_id = ?', [ids.customer]);
    const products = [ids.a, ids.b, ids.inactive].filter(Boolean);
    if (products.length) {
      await pool.query('DELETE FROM stock WHERE product_id IN (?)', [products]);
      await pool.query('DELETE FROM products WHERE id IN (?)', [products]);
    }
    if (ids.customer) await pool.query('DELETE FROM customers WHERE id = ?', [ids.customer]);
    if (ids.category) await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    if (ids.warehouse) await pool.query('DELETE FROM warehouses WHERE id = ?', [ids.warehouse]);
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

const get = (path, token = manager) => api.call('GET', `/reports${path}`, { token });

test('revenue per day: discounts count, cancelled orders do not, empty days are 0', async () => {
  const { status, body } = await get('/revenue?group=day&from=2001-03-09&to=2001-03-13');
  assert.equal(status, 200);
  assert.deepEqual(body.rows, [
    { period: '2001-03-09', revenue: 0, profit: 0, orders: 0 },
    { period: '2001-03-10', revenue: 100, profit: 40, orders: 1 }, // 110 - 10 discount - 2 × 30 cost
    { period: '2001-03-11', revenue: 0, profit: 0, orders: 0 }, // only the cancelled order
    { period: '2001-03-12', revenue: 50, profit: 30, orders: 1 }, // 23:59:59 still counts as that day
    { period: '2001-03-13', revenue: 0, profit: 0, orders: 0 },
  ]);
  assert.deepEqual(body.totals, { revenue: 150, profit: 70, orders: 2 });
});

test('revenue per month, with exact cents', async () => {
  const { body } = await get('/revenue?group=month&from=2001-03-01&to=2001-05-31');
  assert.deepEqual(body.rows, [
    { period: '2001-03', revenue: 150, profit: 70, orders: 2 },
    { period: '2001-04', revenue: 0.3, profit: 0.2, orders: 1 }, // not 0.30000000000000004
    { period: '2001-05', revenue: 0, profit: 0, orders: 0 },
  ]);
  assert.deepEqual(body.totals, { revenue: 150.3, profit: 70.2, orders: 3 });
});

test('revenue: defaults and invalid ranges', async () => {
  const day = (await get('/revenue')).body;
  assert.equal(day.group, 'day');
  assert.equal(day.rows.length, 30, 'the last 30 days');
  const month = (await get('/revenue?group=month')).body;
  assert.equal(month.rows.length, 12, 'the last 12 months');

  assert.equal((await get('/revenue?from=2001-02-30')).status, 400, 'not a real date');
  assert.equal((await get('/revenue?from=2001-03-02&to=2001-03-01')).status, 400, 'from after to');
  assert.equal((await get('/revenue?group=day&from=2000-01-01&to=2010-01-01')).status, 400, 'too many days');
});

test('top products by quantity or revenue, without cancelled orders', async () => {
  const range = 'from=2001-03-01&to=2001-04-30';
  const byQuantity = (await get(`/top-products?${range}`)).body;
  assert.equal(byQuantity.by, 'quantity');
  assert.deepEqual(byQuantity.rows.map((r) => [r.id, r.quantity, r.revenue]), [[ids.b, 6, 50.2], [ids.a, 3, 110.1]]);
  const byRevenue = (await get(`/top-products?${range}&by=revenue&limit=1`)).body;
  assert.deepEqual(byRevenue.rows.map((r) => r.id), [ids.a], 'the limit applies');
});

test('low stock: per active warehouse, inactive products left out, no stock row counts as 0', async () => {
  const { body } = await get('/low-stock?limit=200');
  const mine = body.rows.filter((r) => r.productId === ids.a);
  assert.ok(mine.length >= 1 && body.total >= mine.length);
  assert.deepEqual(mine.find((r) => r.warehouseId === ids.warehouse), {
    productId: ids.a, sku: `TEST-${tag}-A`, name: 'Test A', warehouseId: ids.warehouse, warehouseCode: tag, quantity: 7, minStock: 900000,
  });
  assert.ok(!body.rows.some((r) => r.productId === ids.inactive), 'inactive products are left out');

  const [[other]] = await pool.query('SELECT id FROM warehouses WHERE is_active = 1 AND id <> ? ORDER BY id LIMIT 1', [ids.warehouse]);
  if (other) assert.equal(mine.find((r) => r.warehouseId === other.id).quantity, 0, 'no stock row counts as 0');
});

test('summary: Staff get the counts but never revenue; revenue reports are refused', async () => {
  const managerView = (await get('/summary')).body;
  for (const field of ['ordersThisMonth', 'ordersLastMonth', 'activeProducts', 'lowStockProducts', 'revenueThisMonth', 'revenueLastMonth', 'revenueLastMonthToDate']) {
    assert.equal(typeof managerView[field], 'number', field);
  }
  const staffView = await get('/summary', staff);
  assert.equal(staffView.status, 200);
  assert.deepEqual(Object.keys(staffView.body).filter((k) => /revenue/i.test(k)), []);
  assert.equal(typeof staffView.body.activeProducts, 'number');

  assert.equal((await get('/revenue', staff)).status, 403);
  assert.equal((await get('/top-products', staff)).status, 403);
  assert.equal((await get('/low-stock', staff)).status, 200, 'Staff may see stock');
});

test('summary: an order placed now counts this month; a cancelled one does not', async () => {
  // Other test files add and remove small orders this month at the same time, so these
  // amounts are far larger than anything they do, and compared with a wide margin.
  const start = (await get('/summary')).body;
  await order('5', new Date(), 'cancelled', { subtotal: 5000000, lines: [[ids.a, 1, 5000000, 1]] });
  const withCancelled = (await get('/summary')).body;
  assert.ok(withCancelled.revenueThisMonth < start.revenueThisMonth + 1000000, 'the cancelled order is left out');
  await order('6', new Date(), 'completed', { subtotal: 7000000, lines: [[ids.a, 1, 7000000, 1]] });
  const end = (await get('/summary')).body;
  assert.ok(end.revenueThisMonth > start.revenueThisMonth + 6000000, 'the completed order counts');
  await pool.query('DELETE FROM sales_orders WHERE order_number IN (?)', [[`${tag}-5`, `${tag}-6`]]);
});
