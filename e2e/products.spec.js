// The product list in AG Grid: adding, searching, editing in the grid, editing at the same time
// as someone else, and Excel export and import.
import { expect, test } from '@playwright/test';
import ExcelJS from '../server/node_modules/exceljs/excel.js';
import { apiAs, clearLogin, createCategory, createProduct, createTestUser, gridCell, newSku, signIn } from './helpers.js';

let context;
let page;
let api;
let manager;
let staff;

// One browser window for all the tests in this file, closed when the file is done. Made from a
// context, because only a context can open the second tab the two-tabs test needs.
test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  manager = createTestUser('manager');
  staff = createTestUser('staff');
  api = await apiAs(createTestUser('admin'));
});

test.afterAll(async () => {
  await context.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

const cell = (product, column, onPage = page) => gridCell(onPage, product, column);

// Opens the product list searched down to one SKU.
async function openGrid(sku, onPage = page) {
  await onPage.goto(`/products?search=${sku}`);
  await expect(onPage.getByText(/^1 product\b/)).toBeVisible();
}

// Double-click to edit, as the page says, type the new price and press Enter.
async function editPrice(product, value, onPage = page) {
  await cell(product, 'salePrice', onPage).dblclick();
  await cell(product, 'salePrice', onPage).getByRole('spinbutton').fill(value);
  const saved = onPage.waitForResponse((res) => res.url().endsWith(`/api/products/${product.id}`));
  await onPage.keyboard.press('Enter');
  return saved;
}

const savedProduct = async (product) => (await api.get(`/products/${product.id}`)).product;

test('adding a product through the form', async () => {
  const category = await createCategory(api);
  const sku = newSku();
  await signIn(page, manager);
  await page.goto('/products');

  await page.getByRole('button', { name: 'Add product' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('SKU').fill(sku);
  await dialog.getByLabel('Name').fill(`E2E Headset ${sku}`);
  await dialog.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: category.name }).click();
  await dialog.getByLabel('Sale price').fill('49.5');
  await dialog.getByRole('button', { name: 'Add product' }).click();

  await expect(page.getByText(`${sku} added`)).toBeVisible();
  await expect(dialog).toBeHidden();

  await page.getByPlaceholder('Search SKU or name').fill(sku);
  await expect(page.getByText(/^1 product\b/)).toBeVisible();
  await expect(page.locator('.ag-row', { hasText: `E2E Headset ${sku}` })).toBeVisible();
});

test('the form shows what is wrong and stays open', async () => {
  await signIn(page, manager);
  await page.goto('/products');

  await page.getByRole('button', { name: 'Add product' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add product' }).click();

  await expect(dialog.getByText('Name is required')).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('search shows only the matching product', async () => {
  const wanted = await createProduct(api);
  const other = await createProduct(api);
  await signIn(page, manager);
  await page.goto('/products');

  await page.getByPlaceholder('Search SKU or name').fill(wanted.sku);

  await expect(page.getByText(/^1 product\b/)).toBeVisible();
  await expect(cell(wanted, 'sku')).toHaveText(wanted.sku);
  await expect(cell(other, 'sku')).toHaveCount(0);
});

test('a price can be edited in the grid, and the margin follows', async () => {
  const product = await createProduct(api, { salePrice: 25 }); // cost price is 10
  await signIn(page, manager);
  await openGrid(product.sku);
  await expect(cell(product, 'margin')).toHaveText('60.0%');

  const response = await editPrice(product, '40');

  expect(response.status()).toBe(200);
  await expect(cell(product, 'salePrice')).toHaveText('$40.00');
  await expect(cell(product, 'margin')).toHaveText('75.0%');
  expect((await savedProduct(product)).salePrice).toBe(40);
});

test('two tabs: the second save is refused and nothing is overwritten', async () => {
  const product = await createProduct(api, { salePrice: 25 });
  await signIn(page, manager);

  // A second tab in the same browser, already logged in.
  const secondTab = await context.newPage();
  try {
    await openGrid(product.sku);
    await openGrid(product.sku, secondTab);

    // The first tab saves a new price. The second tab doesn't know yet.
    await editPrice(product, '30');
    await expect(cell(product, 'salePrice')).toHaveText('$30.00');

    await cell(product, 'actions', secondTab).getByRole('button', { name: 'Edit' }).click();
    const dialog = secondTab.getByRole('dialog');
    await dialog.getByLabel('Name').fill(`E2E Renamed ${product.sku}`);
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    // Refused, and the form now shows the first tab's price. The name wasn't saved.
    await expect(dialog.getByRole('alert')).toContainText('Someone else changed this product');
    await expect(dialog.getByLabel('Sale price')).toHaveValue('30');
    expect((await savedProduct(product)).name).toBe(product.name);

    // Saving again works, and keeps both changes.
    await dialog.getByLabel('Name').fill(`E2E Renamed ${product.sku}`);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    const saved = await savedProduct(product);
    expect(saved.name).toBe(`E2E Renamed ${product.sku}`);
    expect(saved.salePrice).toBe(30);
  } finally {
    await secondTab.close();
  }
});

// Downloads the grid's Excel file, and reads it.
async function exportExcel() {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await (await download).path());
  return workbook;
}

// Saves the workbook as a file and picks it in the import dialog.
async function chooseForImport(workbook) {
  const path = test.info().outputPath('import.xlsx');
  await workbook.xlsx.writeFile(path);
  await page.getByRole('button', { name: 'Import' }).click();
  // The real file box is hidden behind the "Choose file" button.
  await page.locator('input[type="file"]').setInputFiles(path);
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
}

const SALE_PRICE_COLUMN = 7;

test('export follows the search, and an edited file imports back', async () => {
  const product = await createProduct(api, { salePrice: 25 });
  await signIn(page, manager);
  await openGrid(product.sku);

  const workbook = await exportExcel();
  const sheet = workbook.getWorksheet('Products');
  expect(sheet.getCell('A1').value).toBe('SKU');
  expect(sheet.rowCount).toBe(2); // the header and the one product searched for
  expect(sheet.getCell('A2').value).toBe(product.sku);

  sheet.getCell(2, SALE_PRICE_COLUMN).value = 77;
  await chooseForImport(workbook);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText('Imported 1 product(s): 0 created, 1 updated.');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(cell(product, 'salePrice')).toHaveText('$77.00');
  expect((await savedProduct(product)).salePrice).toBe(77);
});

test('a file with one bad row imports nothing', async () => {
  const product = await createProduct(api, { salePrice: 25 });
  await signIn(page, manager);
  await openGrid(product.sku);

  const workbook = await exportExcel();
  const sheet = workbook.getWorksheet('Products');
  sheet.getCell(2, SALE_PRICE_COLUMN).value = 77; // a good change...
  sheet.getCell('A3').value = newSku(); // ...and a new row with no name, category or price
  await chooseForImport(workbook);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'Name', exact: true })).toBeVisible();
  expect((await savedProduct(product)).salePrice).toBe(25);
});

test('Staff can search and export, but not change anything', async () => {
  const product = await createProduct(api);
  await signIn(page, staff);
  await openGrid(product.sku);

  await expect(cell(product, 'sku')).toHaveText(product.sku);
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0);
  await expect(cell(product, 'actions')).toHaveCount(0);

  // Double-clicking a price doesn't open an editor.
  await cell(product, 'salePrice').dblclick();
  await expect(cell(product, 'salePrice').getByRole('spinbutton')).toHaveCount(0);
});
