// Customers over HTTP: create with a generated code, validation, search, sales totals
// that leave out cancelled orders, the order history, and delete vs deactivate.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../src/db/pool.js';
import { changeStock } from '../src/services/stockLedger.js';
import { cancelSalesOrder, createSalesOrder } from '../src/services/salesOrders.js';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('U');
let api;
let staff;
let token;
const ids = { customers: new Set() };

before(async () => {
  api = await startApi();
  staff = await createUser(tag, 'staff');
  token = await login(api.call, staff);
  // A product with stock in a test warehouse, to place real orders.
  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;
  ids.category = await insert('INSERT INTO categories (code, name) VALUES (?, ?)', [tag, `Test ${tag}`]);
  ids.product = await insert('INSERT INTO products (sku, name, category_id, cost_price, sale_price) VALUES (?, ?, ?, 5, 12.5)', [`TEST-${tag}`, 'Test product', ids.category]);
  ids.warehouse = await insert("INSERT INTO warehouses (code, name, city) VALUES (?, ?, 'Test')", [tag, `Test ${tag}`]);
  await withTransaction((conn) => changeStock(conn, {
    productId: ids.product, warehouseId: ids.warehouse, change: 100, type: 'adjustment', note: 'test setup', userId: staff.id,
  }));
});

after(async () => {
  try {
    if (ids.customers.size) await pool.query('DELETE FROM sales_orders WHERE customer_id IN (?)', [[...ids.customers]]);
    if (ids.product) {
      await pool.query('DELETE FROM stock_movements WHERE product_id = ?', [ids.product]);
      await pool.query('DELETE FROM stock WHERE product_id = ?', [ids.product]);
      await pool.query('DELETE FROM products WHERE id = ?', [ids.product]);
    }
    if (ids.customers.size) await pool.query('DELETE FROM customers WHERE id IN (?)', [[...ids.customers]]);
    if (ids.category) await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    if (ids.warehouse) await pool.query('DELETE FROM warehouses WHERE id = ?', [ids.warehouse]);
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

const createCustomer = async (body) => {
  const res = await api.call('POST', '/customers', { token, body });
  if (res.status === 201) ids.customers.add(res.body.customer.id);
  return res;
};

const sell = (customerId, quantity) => withTransaction((conn) => createSalesOrder(conn, {
  customerId, warehouseId: ids.warehouse, discount: 0, note: null, items: [{ productId: ids.product, quantity }],
}, staff.id));

test('create: Staff can add a customer; the code is generated', async () => {
  const res = await createCustomer({
    name: `  ${tag} Trading Co. `, contactName: 'Nguyễn Văn Bình', email: `Sales@${tag}.Example`,
    phone: '+84 (24) 3999-0000', city: 'Hanoi', address: '1 Test Street', notes: 'Pays by transfer',
  });
  assert.equal(res.status, 201, res.body?.message);
  const c = res.body.customer;
  assert.equal(c.code, `CUS-${String(c.id).padStart(5, '0')}`);
  assert.equal(c.name, `${tag} Trading Co.`);
  assert.equal(c.email, `sales@${tag.toLowerCase()}.example`, 'email stored lowercase');
  assert.equal(c.contactName, 'Nguyễn Văn Bình');
  assert.deepEqual([c.isActive, c.orderCount, c.revenue, c.inUse], [true, 0, 0, false]);
});

test('create and edit: validation', async () => {
  for (const [body, message] of [
    [{ name: '' }, /Name is required/],
    [{ name: 'X', email: 'not-an-email' }, /valid email/],
    [{ name: 'X', phone: 'call me maybe' }, /Phone/],
    [{ name: 'X', notes: 'x'.repeat(1001) }, /Notes/],
  ]) {
    const res = await createCustomer(body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    assert.match(res.body.message, message);
  }
  const { body } = await createCustomer({ name: `${tag} Edit Me` });
  const edited = await api.call('PATCH', `/customers/${body.customer.id}`, { token, body: { phone: '0912 345 678', email: '' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.customer.phone, '0912 345 678');
  assert.equal(edited.body.customer.email, null, 'clearing a field stores null');
  assert.equal(edited.body.customer.name, `${tag} Edit Me`, 'fields not sent are kept');
  assert.equal((await api.call('PATCH', `/customers/${body.customer.id}`, { token, body: { name: '' } })).status, 400);
});

test('search finds by code, name, contact, phone or email; status filter', async () => {
  const { body } = await createCustomer({ name: `${tag} Searchable`, contactName: `Contact ${tag}`, phone: '0900 111 222', city: 'Da Nang' });
  const c = body.customer;
  const find = async (q) => (await api.call('GET', `/customers?${q}`, { token })).body.rows.map((r) => r.id);
  assert.ok((await find(`search=${c.code}`)).includes(c.id), 'by code');
  assert.ok((await find(`search=${encodeURIComponent(`Contact ${tag}`)}`)).includes(c.id), 'by contact');
  assert.ok((await find('search=0900%20111%20222')).includes(c.id), 'by phone');

  await api.call('PATCH', `/customers/${c.id}`, { token, body: { isActive: false } });
  assert.ok(!(await find(`search=${tag}%20Searchable&status=active`)).includes(c.id), 'inactive ones are hidden from the picker');
  assert.ok((await find(`search=${tag}%20Searchable&status=inactive`)).includes(c.id));
});

test('totals count completed orders only; the history shows every order', async () => {
  const { body } = await createCustomer({ name: `${tag} Buyer` });
  const id = body.customer.id;
  await sell(id, 2); // 25.00
  await sell(id, 4); // 50.00
  const toCancel = await sell(id, 1); // 12.50, then cancelled
  await withTransaction((conn) => cancelSalesOrder(conn, toCancel.id, 'test', staff.id));

  const { customer } = (await api.call('GET', `/customers/${id}`, { token })).body;
  assert.deepEqual(
    { orders: customer.stats.orderCount, cancelled: customer.stats.cancelledCount, revenue: customer.stats.revenue, average: customer.stats.averageOrder },
    { orders: 2, cancelled: 1, revenue: 75, average: 37.5 }
  );
  assert.ok(customer.stats.firstOrder && customer.stats.lastOrder);

  const history = (await api.call('GET', `/customers/${id}/orders`, { token })).body;
  assert.equal(history.total, 3);
  assert.deepEqual(history.rows.map((o) => o.status), ['cancelled', 'completed', 'completed'], 'newest first');

  const sorted = (await api.call('GET', `/customers?search=${tag}&sort=revenue&dir=desc`, { token })).body.rows;
  assert.equal(sorted[0].id, id, 'can sort by revenue');
});

test('a customer with orders is kept (deactivate instead); one without can be deleted', async () => {
  const buyer = (await createCustomer({ name: `${tag} Has Orders` })).body.customer;
  const order = await sell(buyer.id, 1);
  await withTransaction((conn) => cancelSalesOrder(conn, order.id, 'test', staff.id));

  const refused = await api.call('DELETE', `/customers/${buyer.id}`, { token });
  assert.equal(refused.status, 409, 'even a cancelled order keeps the customer');
  assert.equal(refused.body.reason, 'in_use');
  const deactivated = await api.call('PATCH', `/customers/${buyer.id}`, { token, body: { isActive: false } });
  assert.equal(deactivated.body.customer.isActive, false);

  const unused = (await createCustomer({ name: `${tag} No Orders` })).body.customer;
  assert.equal((await api.call('DELETE', `/customers/${unused.id}`, { token })).status, 204);
  assert.equal((await api.call('GET', `/customers/${unused.id}`, { token })).status, 404);
});

test('cities list for the filter', async () => {
  const { cities } = (await api.call('GET', '/customers/cities', { token })).body;
  assert.ok(cities.includes('Hanoi'));
  assert.deepEqual(cities, [...cities].sort(), 'sorted');
});
