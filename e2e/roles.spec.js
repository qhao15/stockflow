// What each role can see and open. Hiding a menu isn't enough, so these also go straight to
// the address and call the API, the way someone trying to get around the menu would.
import { expect, test } from '@playwright/test';
import { clearLogin, createTestUser, signIn } from './helpers.js';

const MANAGER_MENU = ['Dashboard', 'Products', 'Warehouses & Stock', 'Purchase Orders', 'Sales Orders', 'Customers', 'Suppliers'];

const ROLES = {
  staff: {
    menu: ['Dashboard', 'Products', 'Warehouses & Stock', 'Sales Orders', 'Customers'],
    blockedPages: ['/purchase-orders', '/purchase-orders/new', '/suppliers', '/audit-log', '/admin'],
  },
  manager: {
    menu: MANAGER_MENU,
    blockedPages: ['/audit-log', '/admin'],
  },
  admin: {
    menu: [...MANAGER_MENU, 'Audit Log', 'Users & Settings'],
    blockedPages: [],
  },
};

let page;
const users = {};

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  for (const role of Object.keys(ROLES)) users[role] = createTestUser(role);
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

// Runs once for each role, so the same checks become three tests.
for (const [role, { menu, blockedPages }] of Object.entries(ROLES)) {
  test(`${role}: the sidebar shows exactly the allowed modules`, async () => {
    await signIn(page, users[role]);
    await expect(page.getByRole('navigation').getByRole('link')).toHaveText(menu);
  });

  if (blockedPages.length) {
    test(`${role}: going straight to a blocked address shows No access`, async () => {
      await signIn(page, users[role]);
      for (const path of blockedPages) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: 'No access' }), path).toBeVisible();
      }
    });
  }
}

test('staff: the Dashboard shows counts but no revenue or profit', async () => {
  await signIn(page, users.staff);

  await expect(page.getByText('Active products')).toBeVisible();
  await expect(page.getByText('Low-stock products')).toBeVisible();
  await expect(page.getByText('Revenue (this month)')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Revenue and gross profit' })).toHaveCount(0);
  await expect(page.getByText('System status')).toHaveCount(0);
});

test('staff: the server sends no revenue, and refuses the restricted APIs', async () => {
  await signIn(page, users.staff);

  // Calls the API directly with the Staff user's own login.
  const token = await page.evaluate(() => localStorage.getItem('stockflow.token'));
  const get = (path) => page.request.get(path, { headers: { Authorization: `Bearer ${token}` } });

  // The numbers must not reach the browser at all, not just stay hidden on the page.
  const summary = await (await get('/api/reports/summary')).json();
  expect(typeof summary.activeProducts).toBe('number');
  expect(Object.keys(summary).filter((key) => /revenue|profit/i.test(key))).toEqual([]);

  for (const path of ['/api/reports/revenue', '/api/reports/top-products', '/api/suppliers', '/api/purchase-orders', '/api/audit-logs', '/api/users']) {
    expect((await get(path)).status(), path).toBe(403);
  }
});

test('manager: sees revenue and suppliers, but no system status', async () => {
  await signIn(page, users.manager);

  await expect(page.getByText('Revenue (this month)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revenue and gross profit' })).toBeVisible();
  await expect(page.getByText('System status')).toHaveCount(0);

  const suppliers = page.waitForResponse((res) => res.url().includes('/api/suppliers'));
  await page.goto('/suppliers');
  expect((await suppliers).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'No access' })).toHaveCount(0);
});

test('admin: sees system status and can open the Audit Log and Users pages', async () => {
  await signIn(page, users.admin);

  await expect(page.getByText('Revenue (this month)')).toBeVisible();
  await expect(page.getByText('System status')).toBeVisible();

  const auditLogs = page.waitForResponse((res) => res.url().includes('/api/audit-logs'));
  await page.goto('/audit-log');
  expect((await auditLogs).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'No access' })).toHaveCount(0);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Users & Settings', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Users' })).toBeVisible();
});
