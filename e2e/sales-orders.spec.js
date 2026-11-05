// Selling through the screens: stock goes down, can't be oversold and comes back on a cancel.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { apiAs, clearLogin, createCustomer, createProduct, createTestUser, createWarehouse, signIn, stockOf } from './helpers.js';

let page;
let api;
let manager;
let staff;
let warehouse;
let customer;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  manager = createTestUser('manager');
  staff = createTestUser('staff');
  api = await apiAs(createTestUser('admin'));
  warehouse = await createWarehouse(api);
  customer = await createCustomer(api);
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

// Picks the customer and warehouse, and adds the product as the first line.
async function startOrder(product) {
  await page.goto('/sales-orders/new');
  await page.getByRole('combobox', { name: 'Customer' }).fill(customer.name);
  // By code, because the "New customer" option also shows the name that was typed.
  await page.getByRole('option', { name: customer.code }).click();
  await page.getByRole('combobox', { name: 'Ship from warehouse' }).click();
  await page.getByRole('option', { name: warehouse.name }).click();
  await page.getByRole('combobox', { name: 'Add a product' }).fill(product.sku);
  await page.getByRole('option', { name: product.sku }).click();
}

const quantityOf = (product) => page.getByRole('row', { name: product.sku }).getByRole('spinbutton');

const sell = (product, quantity) => api.post('/sales-orders', {
  customerId: customer.id, warehouseId: warehouse.id, items: [{ productId: product.id, quantity }],
});

test('creating an order takes the goods out of stock', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 10, salePrice: 25 });
  await signIn(page, manager);
  await startOrder(product);

  await quantityOf(product).fill('3');
  await page.getByLabel('Discount ($)').fill('5');
  await expect(page.getByText('$70.00')).toBeVisible(); // 3 × $25 - $5

  await page.getByRole('button', { name: 'Create order' }).click();

  await expect(page).toHaveURL(/\/sales-orders\/\d+$/);
  await expect(page.getByText(/created - stock updated/)).toBeVisible();
  await expect(page.getByText('Completed')).toBeVisible();
  await expect(page.getByRole('row', { name: /^Total/ })).toContainText('$70.00');
  expect(await stockOf(api, product.id, warehouse.id)).toBe(7);
});

test('the form refuses more than is available', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 10 });
  await signIn(page, manager);
  await startOrder(product);

  await quantityOf(product).fill('11');

  await expect(page.getByText('Only 10 left')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create order' })).toBeDisabled();
});

test('the server refuses the order if someone else sold the stock first', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 10 });
  await signIn(page, manager);
  await startOrder(product);
  await quantityOf(product).fill('5');

  // The form still shows 10 available when this other sale leaves only 2.
  await sell(product, 8);
  const response = page.waitForResponse((res) => res.url().endsWith('/api/sales-orders'));
  await page.getByRole('button', { name: 'Create order' }).click();

  expect((await response).status()).toBe(409);
  await expect(page.getByText('Only 2 left')).toBeVisible();
  await expect(page).toHaveURL(/\/sales-orders\/new$/);
  expect(await stockOf(api, product.id, warehouse.id)).toBe(2);
});

test('cancelling an order needs a reason and returns the stock', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 10 });
  const { salesOrder } = await sell(product, 4);
  expect(await stockOf(api, product.id, warehouse.id)).toBe(6);

  await signIn(page, manager);
  await page.goto(`/sales-orders/${salesOrder.id}`);
  await page.getByRole('button', { name: 'Cancel order' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cancel order' })).toBeDisabled();
  await dialog.getByLabel('Reason').fill('Customer changed their mind');
  await dialog.getByRole('button', { name: 'Cancel order' }).click();

  await expect(page.getByText(/cancelled - stock returned/)).toBeVisible();
  await expect(page.getByText('Customer changed their mind')).toBeVisible();
  expect(await stockOf(api, product.id, warehouse.id)).toBe(10);
});

test('Staff can download the invoice but not cancel the order', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 10 });
  const { salesOrder } = await sell(product, 1);

  await signIn(page, staff);
  await page.goto(`/sales-orders/${salesOrder.id}`);

  const invoiceButton = page.getByRole('button', { name: 'Download invoice' });
  await expect(invoiceButton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

  // Wait for the download before clicking, or it could be missed.
  const download = page.waitForEvent('download');
  await invoiceButton.click();
  const file = await download;

  expect(file.suggestedFilename()).toBe(`invoice-${salesOrder.orderNumber}.pdf`);
  const content = await readFile(await file.path());
  expect(content.subarray(0, 5).toString()).toBe('%PDF-');
});
