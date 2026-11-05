// The Dashboard: figures that follow real sales, the charts' controls, and its links. Other data
// may exist in the database, so these compare with what the API says or with their own large
// orders, not with fixed totals.
import { expect, test } from '@playwright/test';
import { apiAs, clearLogin, createCustomer, createProduct, createTestUser, createWarehouse, signIn } from './helpers.js';

let page;
let api;
let admin;
let manager;
let warehouse;
let customer;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  manager = createTestUser('manager');
  admin = createTestUser('admin');
  api = await apiAs(admin);
  warehouse = await createWarehouse(api);
  customer = await createCustomer(api);
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const sell = (product, quantity) => api.post('/sales-orders', {
  customerId: customer.id, warehouseId: warehouse.id, items: [{ productId: product.id, quantity }],
});

// A card on the Dashboard, found by the exact text it contains.
const card = (text) => page.locator('.MuiCard-root').filter({ has: page.getByText(text, { exact: true }) });

const reportResponse = (name, part = '') => page.waitForResponse((res) => res.url().includes(`/api/reports/${name}`) && res.url().includes(part));

test('the KPI cards go up after a sale', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 10, salePrice: 25 });
  const before = await api.get('/reports/summary');

  await sell(product, 4); // $100
  await signIn(page, manager);

  await expect(card('Revenue (this month)')).toContainText(money.format(before.revenueThisMonth + 100));
  await expect(card('Sales orders (this month)')).toContainText((before.ordersThisMonth + 1).toLocaleString('en-US'));
});

test('the KPI cards open their pages', async () => {
  await signIn(page, manager);

  await page.getByRole('link', { name: /^Active products/ }).click();
  await expect(page).toHaveURL(/\/products$/);

  await page.goBack();
  await page.getByRole('link', { name: /^Sales orders \(this month\)/ }).click();
  await expect(page).toHaveURL(/\/sales-orders$/);
});

test('the revenue chart switches between days and months, and chart and table', async () => {
  const days = reportResponse('revenue', 'group=day');
  await signIn(page, manager);
  await days;

  const chart = card('Revenue and gross profit');
  await expect(chart.locator('.recharts-line')).toHaveCount(2); // revenue and gross profit

  // The same numbers as a table: a header and one row for each of the last 30 days.
  await chart.getByRole('button', { name: 'Table' }).click();
  await expect(chart.locator('.recharts-line')).toHaveCount(0);
  await expect(chart.getByRole('row')).toHaveCount(31);

  // Months: the last 12, with the totals and last row matching the report.
  const monthsResponse = reportResponse('revenue', 'group=month');
  await chart.getByRole('button', { name: 'Month', exact: true }).click();
  const months = await (await monthsResponse).json();

  await expect(chart.getByRole('columnheader', { name: 'Month' })).toBeVisible();
  await expect(chart.getByRole('row')).toHaveCount(13);
  await expect(chart).toContainText(money.format(months.totals.revenue));
  const lastMonth = months.rows.at(-1);
  await expect(chart.getByRole('row').last()).toContainText(money.format(lastMonth.revenue));
  await expect(chart.getByRole('row').last()).toContainText(money.format(lastMonth.profit));
});

test('the revenue chart follows a date range, and says when it is impossible', async () => {
  const first = reportResponse('revenue', 'group=day');
  await signIn(page, manager);
  const { to } = await (await first).json();

  const dayNear = (offset) => {
    const date = new Date(`${to}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  const chart = card('Revenue and gross profit');
  await chart.getByRole('button', { name: 'Table' }).click();
  await chart.getByLabel('From').fill(dayNear(-2));
  await expect(chart.getByRole('row')).toHaveCount(4); // a header and 3 days

  await chart.getByLabel('From').fill(dayNear(1));
  await expect(chart.getByRole('alert')).toBeVisible();
});

test('top products rank by quantity or revenue, over a chosen period', async () => {
  // Far more than a real product sells, so it's in the top 8 whatever else is there.
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 100000, salePrice: 25 });
  await sell(product, 100000);
  await signIn(page, manager);

  const top = card('Top products');
  await expect(top.getByText(product.name)).toBeVisible();
  // First, because a repeat of this test (--repeat-each) sells the same amount again.
  await expect(top.getByText('100,000').first()).toBeVisible();

  await top.getByRole('button', { name: 'Revenue' }).click();
  await expect(top.getByText('$2.5M').first()).toBeVisible();
  await expect(top.getByText('Before order discounts')).toBeVisible();

  // Sold today, so it's in the shortest period too.
  const week = reportResponse('top-products', 'from=');
  await top.getByRole('combobox', { name: 'Period' }).click();
  await page.getByRole('option', { name: '7 days' }).click();
  expect((await week).status()).toBe(200);
  await expect(top.getByText(product.name)).toBeVisible();
});

test('the low-stock table lists a short product, and View all opens the filtered stock page', async () => {
  // A very high minimum, so it sorts to the top of the table, even above this test's own product
  // from an earlier repeat (--repeat-each).
  const minStock = 900000 + test.info().repeatEachIndex * 10000;
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 7, minStock });
  await signIn(page, manager);

  const lowStock = card('Low stock');
  // Furthest below its minimum comes first, right after the header row.
  const firstRow = lowStock.getByRole('row').nth(1);
  await expect(firstRow).toContainText(product.sku);
  await expect(firstRow).toContainText(minStock.toLocaleString('en-US'));

  await lowStock.getByRole('link', { name: 'View all' }).click();
  await expect(page).toHaveURL(/\/stock\?lowStock=1$/);
  await expect(page.getByLabel('Low stock only')).toBeChecked();
});

test('Admins see the API and database status', async () => {
  await signIn(page, admin);

  const status = card('System status');
  await expect(status.getByText('API: online')).toBeVisible();
  await expect(status.getByText(/^Database: .+ \(v.+\)$/)).toBeVisible();
});

test('the greeting follows the time of day', async ({ browser }) => {
  // Its own context, because a faked clock can't be taken back off a window.
  const context = await browser.newContext();
  const clockPage = await context.newPage();
  try {
    await signIn(clockPage, manager);
    for (const [hour, greeting] of [[9, 'Good morning'], [13, 'Good afternoon'], [18, 'Good evening'], [22, 'Good night'], [3, 'Good night']]) {
      await clockPage.clock.setFixedTime(new Date(2026, 0, 15, hour));
      await clockPage.reload();
      await expect(clockPage.getByRole('heading', { name: `${greeting}, ${manager.name}` }), `${hour}:00`).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
