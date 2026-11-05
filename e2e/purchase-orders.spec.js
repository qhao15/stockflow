// Buying through the screens: stock only goes up when the goods are received.
import { expect, test } from '@playwright/test';
import { apiAs, clearLogin, createProduct, createSupplier, createTestUser, createWarehouse, signIn, stockOf } from './helpers.js';

let page;
let api;
let manager;
let supplier;
let warehouse;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  manager = createTestUser('manager');
  api = await apiAs(createTestUser('admin'));
  supplier = await createSupplier(api);
  warehouse = await createWarehouse(api);
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

// The status shown next to the PO number. The first chip on the page, because the words
// "Approved" and "Received" also appear in the history timeline.
const status = () => page.locator('.MuiChip-root').first();

const totalRow = () => page.getByRole('row', { name: /^Total/ });

const createDraft = async (product, quantity = 5) => {
  const { purchaseOrder } = await api.post('/purchase-orders', {
    supplierId: supplier.id, warehouseId: warehouse.id, items: [{ productId: product.id, quantity, unitCost: 10 }],
  });
  return purchaseOrder;
};

// Clicks the button on the page, then the one that confirms it in the dialog.
async function confirmAction(button, confirmButton = button) {
  await page.getByRole('button', { name: button }).click();
  await page.getByRole('dialog').getByRole('button', { name: confirmButton }).click();
}

test('draft, approve, receive: stock only goes up when the goods are received', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id });
  await signIn(page, manager);

  // Create the draft through the form.
  await page.goto('/purchase-orders/new');
  await page.getByRole('combobox', { name: 'Supplier' }).click();
  await page.getByRole('option', { name: supplier.name }).click();
  await page.getByRole('combobox', { name: 'Deliver to warehouse' }).click();
  await page.getByRole('option', { name: warehouse.name }).click();
  await page.getByRole('combobox', { name: 'Add a product' }).fill(product.sku);
  await page.getByRole('option', { name: product.sku }).click();

  const line = page.getByRole('row', { name: product.sku });
  await line.getByRole('spinbutton').nth(0).fill('5');
  await line.getByRole('spinbutton').nth(1).fill('12.5');
  await expect(totalRow()).toContainText('$62.50'); // 5 × $12.50
  await page.getByRole('button', { name: 'Create draft' }).click();

  await expect(page).toHaveURL(/\/purchase-orders\/\d+$/);
  await expect(status()).toHaveText('Draft');
  await expect(totalRow()).toContainText('$62.50');
  expect(await stockOf(api, product.id, warehouse.id)).toBe(0);

  // Approving doesn't change the stock, and the order can't be edited any more.
  await confirmAction('Approve');
  await expect(status()).toHaveText('Approved');
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  expect(await stockOf(api, product.id, warehouse.id)).toBe(0);

  // Receiving adds the goods.
  await confirmAction('Receive goods', 'Receive');
  await expect(status()).toHaveText('Received');
  await expect(page.getByText(/received - stock updated/)).toBeVisible();
  expect(await stockOf(api, product.id, warehouse.id)).toBe(5);

  // Nothing more can be done with it.
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Receive goods' })).toHaveCount(0);
});

test('a draft can be edited', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id });
  const draft = await createDraft(product);
  await signIn(page, manager);

  await page.goto(`/purchase-orders/${draft.id}`);
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('row', { name: product.sku }).getByRole('spinbutton').nth(0).fill('8');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/purchase-orders/${draft.id}$`));
  await expect(page.getByText(`${draft.poNumber} saved`)).toBeVisible();
  await expect(totalRow()).toContainText('$80.00'); // 8 × $10
});

test('cancelling a draft needs a reason and changes no stock', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 3 });
  const draft = await createDraft(product);
  await signIn(page, manager);

  await page.goto(`/purchase-orders/${draft.id}`);
  await page.getByRole('button', { name: 'Cancel order' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cancel order' })).toBeDisabled();
  await dialog.getByLabel('Reason').fill('Ordered by mistake');
  await dialog.getByRole('button', { name: 'Cancel order' }).click();

  await expect(status()).toHaveText('Cancelled');
  await expect(page.getByText('Reason: Ordered by mistake')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  expect(await stockOf(api, product.id, warehouse.id)).toBe(3);
});

test('if someone else approved it first, the page refuses and shows the latest status', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id });
  const draft = await createDraft(product);
  await signIn(page, manager);
  await page.goto(`/purchase-orders/${draft.id}`);
  await expect(status()).toHaveText('Draft');

  // This page still shows a draft when another user approves it.
  await api.post(`/purchase-orders/${draft.id}/approve`);
  const response = page.waitForResponse((res) => res.url().endsWith('/approve'));
  await confirmAction('Approve');

  expect((await response).status()).toBe(409);
  await expect(status()).toHaveText('Approved');
  await expect(page.getByRole('button', { name: 'Receive goods' })).toBeVisible();
});

test('an approved order can no longer be opened for editing', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id });
  const draft = await createDraft(product);
  await api.post(`/purchase-orders/${draft.id}/approve`);
  await signIn(page, manager);

  await page.goto(`/purchase-orders/${draft.id}/edit`);

  await expect(page.getByText(`${draft.poNumber} is approved. Only drafts can be edited.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
});
