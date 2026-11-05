// What an Admin does to other users, and the record it leaves. Two people are signed in at once,
// because a change has to reach someone who is already logged in.
import { expect, test } from '@playwright/test';
import {
  apiAs, clearLogin, createCustomer, createProduct, createTestUser, createWarehouse, fillLogin, newSku, signIn,
} from './helpers.js';

let page;
let adminUser;
let api;

// One browser window for the Admin, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  adminUser = createTestUser('admin', `E2E Admin ${newSku()}`);
  api = await apiAs(adminUser);
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

const newStaff = () => createTestUser('staff', `E2E Staff ${newSku()}`);

// A second person, in a browser session of their own: a new context doesn't share the first
// one's saved login. Closed when the test ends.
async function signInElsewhere(browser, user) {
  const context = await browser.newContext();
  const otherPage = await context.newPage();
  await signIn(otherPage, user);
  return { otherPage, close: () => context.close() };
}

// A user's row on the Users page, found by email.
async function openUserRow(user) {
  await signIn(page, adminUser);
  await page.goto('/admin');
  return page.getByRole('row', { name: user.email });
}

async function changeRole(row, user, role) {
  await row.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(`^${role}`) }).click();
  await expect(page.getByText(`Updated ${user.name}`)).toBeVisible();
}

// Waits for the search's own response. Newest entries are already listed before it, and the
// search reloading the list would close a row the test had just expanded.
async function searchAuditLog(text) {
  const searched = page.waitForResponse((res) => res.url().includes('/api/audit-logs?') && res.url().includes('search='));
  await page.getByPlaceholder(/^Search record/).fill(text);
  await searched;
}

test('a role change reaches a user who is already logged in, without logging them out', async ({ browser }) => {
  const user = newStaff();
  const { otherPage, close } = await signInElsewhere(browser, user);
  try {
    await otherPage.goto('/suppliers');
    await expect(otherPage.getByRole('heading', { name: 'No access' })).toBeVisible();

    const row = await openUserRow(user);
    await changeRole(row, user, 'Manager');

    // The same login, on their next request: nothing to sign in to again.
    const suppliers = otherPage.waitForResponse((res) => res.url().includes('/api/suppliers'));
    await otherPage.reload();
    expect((await suppliers).status()).toBe(200);
    await expect(otherPage.getByRole('heading', { name: 'No access' })).toHaveCount(0);
    await expect(otherPage.getByRole('navigation').getByRole('link', { name: 'Suppliers' })).toBeVisible();
  } finally {
    await close();
  }
});

test('a deactivated user is logged out on their next click, and can come back when reactivated', async ({ browser }) => {
  const user = newStaff();
  const { otherPage, close } = await signInElsewhere(browser, user);
  try {
    const row = await openUserRow(user);
    const active = row.locator('input[type="checkbox"]');
    await expect(active).toBeChecked();

    await active.click();
    await expect(active).not.toBeChecked();

    // Their next request is refused, which sends them to the login page.
    await otherPage.getByRole('navigation').getByRole('link', { name: 'Customers' }).click();
    await expect(otherPage).toHaveURL(/\/login/);

    // Signing in again says why it doesn't work.
    await fillLogin(otherPage, user.email, user.password);
    await expect(otherPage.getByRole('alert')).toHaveText('This account has been deactivated');

    await active.click();
    await expect(active).toBeChecked();
    await otherPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(otherPage).toHaveURL(/\/customers$/);
  } finally {
    await close();
  }
});

test('Admins cannot change their own role or deactivate themselves', async () => {
  const row = await openUserRow(adminUser);

  await expect(row.getByText('You', { exact: true })).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
  await expect(row.locator('input[type="checkbox"]')).toBeDisabled();
});

test('a role change appears in the Audit Log with who did it and the values before and after', async () => {
  const user = newStaff();
  const row = await openUserRow(user);
  await changeRole(row, user, 'Manager');

  await page.goto('/audit-log');
  await searchAuditLog(user.email);

  const entry = page.getByRole('row', { name: user.email });
  await expect(entry).toContainText(adminUser.name);
  await expect(entry).toContainText('Updated');
  await expect(entry).toContainText('role');

  await entry.getByRole('button', { name: 'Show changes' }).click();
  const change = page.getByRole('row', { name: /^Role/ });
  await expect(change.getByRole('cell').nth(1)).toHaveText('staff');
  await expect(change.getByRole('cell').nth(3)).toHaveText('manager');
});

test('the Audit Log follows an order: filters narrow it and its link opens the order', async () => {
  const warehouse = await createWarehouse(api);
  const customer = await createCustomer(api);
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 5 });
  const { salesOrder } = await api.post('/sales-orders', {
    customerId: customer.id, warehouseId: warehouse.id, items: [{ productId: product.id, quantity: 1 }],
  });
  await api.post(`/sales-orders/${salesOrder.id}/cancel`, { reason: 'E2E wrong customer' });

  await signIn(page, adminUser);
  await page.goto('/audit-log');
  await searchAuditLog(salesOrder.orderNumber);

  // Two entries for this order: created, then cancelled.
  const links = page.getByRole('link', { name: salesOrder.orderNumber });
  await expect(links).toHaveCount(2);

  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Cancelled' }).click();
  await expect(links).toHaveCount(1);
  await expect(page.getByRole('row', { name: salesOrder.orderNumber })).toContainText('E2E wrong customer');

  await links.click();
  await expect(page).toHaveURL(new RegExp(`/sales-orders/${salesOrder.id}$`));
});
