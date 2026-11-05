// The stock grid: transfers, adjustments, low-stock alerts and the movement history behind them.
import { expect, test } from '@playwright/test';
import { apiAs, clearLogin, createProduct, createTestUser, createWarehouse, gridCell, signIn, stockOf } from './helpers.js';

let page;
let api;
let manager;
let staff;
let warehouseA;
let warehouseB;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  manager = createTestUser('manager');
  staff = createTestUser('staff');
  api = await apiAs(createTestUser('admin'));
  warehouseA = await createWarehouse(api);
  warehouseB = await createWarehouse(api);
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

const cell = (product, column) => gridCell(page, product, column);

const stocked = (quantity = 10, options = {}) => createProduct(api, { warehouseId: warehouseA.id, quantity, ...options });

const stockIn = (product, warehouse) => stockOf(api, product.id, warehouse.id);

async function openStock(product) {
  await page.goto('/stock');
  await page.getByPlaceholder('Search SKU or name').fill(product.sku);
  await expect(page.getByText(/^1 product\b/)).toBeVisible();
  await expect(cell(product, 'sku')).toHaveText(product.sku);
}

// Opens a dropdown in the dialog and picks the warehouse, whose option also shows its stock.
// "Starts with", because a dropdown's name includes its value: "To" alone also matches
// "From Hanoi (10 in sTOck)".
async function pickWarehouse(dialog, label, warehouse) {
  await dialog.getByRole('combobox', { name: new RegExp(`^${label}`) }).click();
  await page.getByRole('option', { name: warehouse.name }).click();
}

// The Transfer button sits inside a <span>, which is what carries the label.
async function openTransfer(product) {
  await cell(product, 'actions').getByLabel('Transfer').click();
  const dialog = page.getByRole('dialog');
  await pickWarehouse(dialog, 'From', warehouseA);
  await pickWarehouse(dialog, 'To', warehouseB);
  return dialog;
}

async function openAdjust(product) {
  await cell(product, 'actions').getByRole('button', { name: 'Adjust' }).click();
  const dialog = page.getByRole('dialog');
  await pickWarehouse(dialog, 'Warehouse', warehouseA);
  return dialog;
}

// One row of the movement history, found by any text in it, and its Change and Balance columns.
function movement(text) {
  const row = page.getByRole('row', { name: text });
  return { row, change: row.getByRole('cell').nth(3), balance: row.getByRole('cell').nth(4) };
}

test('a transfer moves the stock and shows both sides in the history', async () => {
  const product = await stocked(10);
  await signIn(page, manager);
  await openStock(product);

  const dialog = await openTransfer(product);
  await dialog.getByLabel('Quantity').fill('4');
  await dialog.getByRole('button', { name: 'Transfer' }).click();

  await expect(page.getByText(`moved 4 × ${product.sku} from ${warehouseA.code} to ${warehouseB.code}`)).toBeVisible();
  expect(await stockIn(product, warehouseA)).toBe(6);
  expect(await stockIn(product, warehouseB)).toBe(4);

  await cell(product, 'actions').getByRole('button', { name: 'Movement history' }).click();
  const out = movement('Transfer out');
  await expect(out.change).toHaveText('-4');
  await expect(out.balance).toHaveText('6');
  await expect(out.row).toContainText(`to ${warehouseB.code}`);
  const into = movement('Transfer in');
  await expect(into.change).toHaveText('+4');
  await expect(into.balance).toHaveText('4');
  await expect(into.row).toContainText(`from ${warehouseA.code}`);
});

test('the form refuses too much stock and the same warehouse twice', async () => {
  const product = await stocked(10);
  await signIn(page, manager);
  await openStock(product);

  const dialog = await openTransfer(product);
  const transfer = dialog.getByRole('button', { name: 'Transfer' });

  await dialog.getByLabel('Quantity').fill('11');
  await expect(dialog.getByText('1 to 10')).toBeVisible();
  await expect(transfer).toBeDisabled();

  await dialog.getByLabel('Quantity').fill('10');
  await expect(transfer).toBeEnabled();

  await pickWarehouse(dialog, 'To', warehouseA);
  await expect(dialog.getByText('Pick a different warehouse')).toBeVisible();
  await expect(transfer).toBeDisabled();
});

test('the server refuses a transfer if someone else moved the stock first', async () => {
  const product = await stocked(10);
  await signIn(page, manager);
  await openStock(product);

  const dialog = await openTransfer(product);
  await dialog.getByLabel('Quantity').fill('5');

  // The form still shows 10 when this other transfer leaves only 2.
  await api.post('/stock/transfers', { productId: product.id, fromWarehouseId: warehouseA.id, toWarehouseId: warehouseB.id, quantity: 8 });
  const response = page.waitForResponse((res) => res.url().endsWith('/api/stock/transfers'));
  await dialog.getByRole('button', { name: 'Transfer' }).click();

  expect((await response).status()).toBe(409);
  await expect(page.getByText(/Not enough stock in .*: 2 available, 5 requested/)).toBeVisible();
  expect(await stockIn(product, warehouseA)).toBe(2);
  expect(await stockIn(product, warehouseB)).toBe(8);
});

test('an adjustment sets the counted quantity and records the reason', async () => {
  const product = await stocked(10);
  await signIn(page, manager);
  await openStock(product);

  const dialog = await openAdjust(product);
  await expect(dialog.getByText('Currently 10 in the system')).toBeVisible();
  await dialog.getByLabel('Counted quantity').fill('7');
  await expect(dialog.getByText('Removes 3 units')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Reason' }).click();
  await page.getByRole('option', { name: 'Damaged' }).click();
  await dialog.getByLabel('Note').fill('Dropped by forklift');
  await dialog.getByRole('button', { name: 'Save adjustment' }).click();

  await expect(page.getByText(`${product.sku} in ${warehouseA.code}: -3, now 7`)).toBeVisible();
  expect(await stockIn(product, warehouseA)).toBe(7);

  await cell(product, 'actions').getByRole('button', { name: 'Movement history' }).click();
  // By its note, because the stock this test started with was also added by an adjustment.
  const change = movement('Dropped by forklift');
  await expect(change.change).toHaveText('-3');
  await expect(change.balance).toHaveText('7');
  await expect(change.row).toContainText('Adjustment');
  await expect(change.row).toContainText('Damaged');
});

test('an adjustment needs a real change, and a note when the reason is Other', async () => {
  const product = await stocked(10);
  await signIn(page, manager);
  await openStock(product);

  const dialog = await openAdjust(product);
  const save = dialog.getByRole('button', { name: 'Save adjustment' });

  await dialog.getByLabel('Counted quantity').fill('10');
  await expect(dialog.getByText('Matches the system - nothing to adjust')).toBeVisible();
  await expect(save).toBeDisabled();

  await dialog.getByLabel('Counted quantity').fill('9');
  await expect(save).toBeEnabled();

  await dialog.getByRole('combobox', { name: 'Reason' }).click();
  await page.getByRole('option', { name: 'Other' }).click();
  await expect(save).toBeDisabled();

  await dialog.getByLabel('Note').fill('Found a miscount');
  await expect(save).toBeEnabled();
});

test('the server refuses an adjustment if the stock changed after it was counted', async () => {
  const product = await stocked(10);
  await signIn(page, manager);
  await openStock(product);

  const dialog = await openAdjust(product);
  await dialog.getByLabel('Counted quantity').fill('7');

  // The count was made against 10, but another change makes it 8 before saving.
  await api.post('/stock/adjustments', { productId: product.id, warehouseId: warehouseA.id, countedQuantity: 8, reason: 'lost' });
  const response = page.waitForResponse((res) => res.url().endsWith('/api/stock/adjustments'));
  await dialog.getByRole('button', { name: 'Save adjustment' }).click();

  expect((await response).status()).toBe(409);
  expect(await stockIn(product, warehouseA)).toBe(8);
});

test('low stock: the filter and highlight follow the chosen warehouse', async () => {
  const low = await stocked(3, { minStock: 5 });
  const plenty = await stocked(20, { minStock: 5 });
  await signIn(page, manager);

  // The address the Dashboard's low-stock card links to.
  await page.goto('/stock?lowStock=1');
  await page.getByRole('combobox', { name: 'Warehouse' }).click();
  await page.getByRole('option', { name: warehouseA.name }).click();

  const search = page.getByPlaceholder('Search SKU or name');
  await search.fill(low.sku);
  await expect(page.getByText(/^1 product\b/)).toBeVisible();
  await expect(cell(low, `w${warehouseA.id}`)).toHaveText('3');
  await expect(cell(low, `w${warehouseA.id}`)).toHaveClass(/low-stock/);

  await search.fill(plenty.sku);
  await expect(page.getByText(/^0 products\b/)).toBeVisible();
});

test('Staff can see the history, but not transfer or adjust', async () => {
  const product = await stocked(10);
  await signIn(page, staff);
  await openStock(product);

  const actions = cell(product, 'actions');
  await expect(actions.getByRole('button', { name: 'Movement history' })).toBeVisible();
  await expect(actions.getByLabel('Transfer')).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Adjust' })).toHaveCount(0);
});
