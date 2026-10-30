// Products and categories over HTTP: validation, optimistic locking, safe search and
// sorting, delete rules, and the all-or-nothing Excel import / export.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('D');
const sku = (suffix) => `TEST-${tag}-${suffix}`;
let api;
let token;
let categoryId;
const created = { categories: new Set() };

before(async () => {
  api = await startApi();
  token = await login(api.call, await createUser(tag, 'manager'));
  const res = await api.call('POST', '/categories', { token, body: { code: tag, name: `Test ${tag}` } });
  assert.equal(res.status, 201, res.body?.message);
  categoryId = res.body.category.id;
  created.categories.add(categoryId);
});

// Test products all have SKUs starting with TEST-<tag>-.
after(async () => {
  try {
    const [products] = await pool.query('SELECT id FROM products WHERE sku LIKE ?', [`TEST-${tag}-%`]);
    const ids = products.map((p) => p.id);
    if (ids.length) {
      await pool.query('DELETE FROM stock_movements WHERE product_id IN (?)', [ids]);
      await pool.query('DELETE FROM stock WHERE product_id IN (?)', [ids]);
      await pool.query('DELETE FROM products WHERE id IN (?)', [ids]);
    }
    if (created.categories.size) await pool.query('DELETE FROM categories WHERE id IN (?)', [[...created.categories]]);
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

const product = (overrides = {}) => ({
  sku: sku('X'), name: `${tag} product`, categoryId, unit: 'pcs', costPrice: '10.00', salePrice: '15.50', minStock: 3, ...overrides,
});
const create = (body) => api.call('POST', '/products', { token, body });

test('create: validation, SKU is uppercased and unique', async () => {
  const bad = await create(product({ sku: 'x', salePrice: '1.999', unit: 'kg', name: '' }));
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.errors).sort(), ['name', 'salePrice', 'sku', 'unit'], 'every problem is reported at once');

  const ok = await create(product({ sku: sku('a1').toLowerCase() }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.product.sku, sku('A1'));
  assert.equal(ok.body.product.salePrice, 15.5);
  assert.equal(ok.body.product.version, 0);

  assert.equal((await create(product({ sku: sku('A1') }))).status, 409, 'duplicate SKU');
  assert.equal((await create(product({ sku: sku('A2'), categoryId: 999999999 }))).status, 400, 'unknown category');
});

test('edit: optimistic locking refuses a save based on an old version', async () => {
  const { body } = await create(product({ sku: sku('LOCK') }));
  const { id, version } = body.product;

  const first = await api.call('PATCH', `/products/${id}`, { token, body: { version, salePrice: '20' } });
  assert.equal(first.status, 200);
  assert.equal(first.body.product.version, version + 1);

  // A second person still has the old version open.
  const second = await api.call('PATCH', `/products/${id}`, { token, body: { version, salePrice: '99' } });
  assert.equal(second.status, 409);
  assert.equal(second.body.product.salePrice, 20, 'the 409 carries the latest product');
  const [[row]] = await pool.query('SELECT sale_price FROM products WHERE id = ?', [id]);
  assert.equal(Number(row.sale_price), 20, 'nothing was overwritten');

  assert.equal((await api.call('PATCH', `/products/${id}`, { token, body: { salePrice: '1' } })).status, 400, 'version is required');
});

test('search treats % and _ literally, and unknown sort columns are ignored safely', async () => {
  await create(product({ sku: sku('P1'), name: `${tag} 50% off` }));
  await create(product({ sku: sku('P2'), name: `${tag} 500 off` }));
  const search = async (text) => (await api.call('GET', `/products?search=${encodeURIComponent(text)}`, { token })).body.rows.map((p) => p.sku);

  assert.deepEqual(await search(`${tag} 50%`), [sku('P1')], '% is not a wildcard');
  assert.deepEqual(await search(`${tag} 5_0`), [], '_ is not a wildcard');

  const injected = await api.call('GET', `/products?search=${tag}&sort=${encodeURIComponent('name; DROP TABLE products')}`, { token });
  assert.equal(injected.status, 200, 'falls back to the default order');
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM products');
  assert.ok(count > 0, 'the products table is still there');
});

test('delete: a product with history is kept; one without is deleted', async () => {
  const unused = (await create(product({ sku: sku('DEL1') }))).body.product;
  const used = (await create(product({ sku: sku('DEL2') }))).body.product;
  const [[warehouse]] = await pool.query('SELECT id FROM warehouses ORDER BY id LIMIT 1');
  const [[anyUser]] = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
  await pool.query('INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, 1)', [used.id, warehouse.id]);
  await pool.query(
    "INSERT INTO stock_movements (product_id, warehouse_id, type, quantity_change, balance_after, user_id, created_at) VALUES (?, ?, 'adjustment', 1, 1, ?, NOW())",
    [used.id, warehouse.id, anyUser.id]
  );

  assert.equal((await api.call('GET', `/products/${used.id}`, { token })).body.product.inUse, true, 'the grid disables Delete for it');
  const refused = await api.call('DELETE', `/products/${used.id}`, { token });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.reason, 'in_use');

  assert.equal((await api.call('DELETE', `/products/${unused.id}`, { token })).status, 200);
  assert.equal((await api.call('GET', `/products/${unused.id}`, { token })).status, 404);
});

test('categories: codes are unique, and a category with products cannot be deleted', async () => {
  assert.equal((await api.call('POST', '/categories', { token, body: { code: tag, name: 'Other name' } })).status, 409);

  const refused = await api.call('DELETE', `/categories/${categoryId}`, { token });
  assert.equal(refused.status, 409, 'it has the products from the tests above');

  const empty = await api.call('POST', '/categories', { token, body: { code: `${tag}E`, name: `Empty ${tag}` } });
  created.categories.add(empty.body.category.id);
  assert.equal((await api.call('DELETE', `/categories/${empty.body.category.id}`, { token })).status, 204);
});

// Builds an .xlsx like a user would: the Products sheet with headers in any order.
async function workbook(rows, headers = ['Name', 'SKU', 'Category', 'Unit', 'Sale price', 'Cost price', 'Min stock', 'Active']) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Products');
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(headers.map((h) => r[h] ?? '')));
  return Buffer.from(await book.xlsx.writeBuffer());
}

const upload = (buffer) => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'products.xlsx');
  return api.call('POST', '/products/import', { token, form });
};

const productCount = async () => {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM products WHERE sku LIKE ?', [`TEST-${tag}-IMP%`]);
  return count;
};

test('Excel import is all or nothing, and an export can be imported again', async () => {
  const template = await api.call('GET', '/products/import-template', { token });
  assert.equal(template.status, 200);
  assert.match(template.headers.get('content-type'), /spreadsheetml/);

  const good = (n) => ({ Name: `${tag} imported ${n}`, SKU: sku(`IMP${n}`), Category: tag, Unit: 'pcs', 'Sale price': 12.5, 'Cost price': 8, 'Min stock': 2, Active: 'yes' });

  // Row 4 has three problems and row 5 repeats row 2's SKU: nothing is saved.
  const bad = await upload(await workbook([
    good(1), good(2),
    { Name: '', SKU: sku('IMP3'), Category: 'No such category', Unit: 'kg', 'Sale price': 1 },
    { ...good(4), SKU: sku('IMP1') },
  ]));
  assert.equal(bad.status, 422);
  assert.equal(await productCount(), 0, 'no row was saved');
  const problems = bad.body.errors.map((e) => `${e.row}:${e.column}`);
  assert.deepEqual(problems.sort(), ['4:Category', '4:Name', '4:Unit', '5:SKU'].sort());

  const ok = await upload(await workbook([good(1), good(2), good(3)]));
  assert.equal(ok.status, 200, ok.body?.message);
  assert.deepEqual([ok.body.created, ok.body.updated], [3, 0]);

  // Export the imported products, change a price in the file, and import it again.
  const exported = await api.call('GET', `/products/export?search=${encodeURIComponent(`${tag} imported`)}`, { token });
  assert.equal(exported.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(exported.body);
  const sheet = book.getWorksheet('Products');
  assert.equal(sheet.rowCount, 4, 'header + 3 products');
  const priceCol = sheet.getRow(1).values.indexOf('Sale price');
  sheet.getRow(2).getCell(priceCol).value = 13.75;

  const again = await upload(Buffer.from(await book.xlsx.writeBuffer()));
  assert.equal(again.status, 200, again.body?.message);
  assert.deepEqual([again.body.created, again.body.updated], [0, 3]);
  const [prices] = await pool.query('SELECT sale_price FROM products WHERE sku LIKE ? ORDER BY sale_price DESC', [`TEST-${tag}-IMP%`]);
  assert.equal(Number(prices[0].sale_price), 13.75);

  assert.equal((await upload(Buffer.from('not a spreadsheet'))).status, 400);
});
