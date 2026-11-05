// What happens when things go wrong: the server is down, one report fails, a save fails, or
// another tab logs out. page.route answers the browser's requests with a fake failure, so these
// don't need the real server to break. Also the menu at phone size.
import { expect, test } from '@playwright/test';
import { apiAs, clearLogin, createProduct, createTestUser, expectGreeting, newSku, signIn } from './helpers.js';

let context;
let page;
let manager;

const API = '**/api/**';

// One browser window for all the tests in this file, closed when the file is done. Made from a
// context, because only a context can open the second tab the logout test needs.
test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  manager = createTestUser('manager');
});

test.afterAll(async () => {
  await context.close();
});

// The window is shared, so each test starts logged out and with no fake failures left.
test.beforeEach(async () => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearLogin(page);
});

const savedToken = () => page.evaluate(() => localStorage.getItem('stockflow.token'));

test('with the server down, the app keeps the login and can try again', async () => {
  await signIn(page, manager);
  const token = await savedToken();

  // Every API request fails, as if the server had stopped.
  await page.route(API, (route) => route.abort());
  await page.reload();

  // It retries for about 20 seconds first, so this wait is longer than usual.
  await expect(page.getByRole('alert')).toContainText('Cannot reach the server', { timeout: 45_000 });
  await expect(page).not.toHaveURL(/\/login/);
  expect(await savedToken()).toBe(token);

  // The server is back.
  await page.unroute(API);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expectGreeting(page, manager.name);
});

test('a restart is survived without any message, because the app retries by itself', async () => {
  await signIn(page, manager);

  // An empty 500 is what the dev proxy answers while the API restarts.
  let attempts = 0;
  await page.route('**/api/auth/me', (route) => {
    attempts += 1;
    return route.fulfill({ status: 500, body: '' });
  });
  await page.reload();

  // After a few failed tries, the server is back.
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(3);
  await page.unroute('**/api/auth/me');

  await expectGreeting(page, manager.name);
  await expect(page).not.toHaveURL(/\/login/);
});

test('a 401 logs out, and the login page remembers where the user was', async () => {
  await signIn(page, manager);
  await page.goto('/customers');
  await expect(page.getByRole('button', { name: 'New customer' })).toBeVisible();

  // The login is really no longer valid, which the app finds out on its next request.
  await page.route(API, (route) => route.fulfill({ status: 401, json: { message: 'Session expired, please log in again' } }));
  await page.getByRole('navigation').getByRole('link', { name: 'Suppliers' }).click();

  await expect(page).toHaveURL(/\/login\?redirect=%2Fsuppliers/);
  await expect.poll(savedToken).toBeNull();
});

test('one failed report does not take down the rest of the Dashboard', async () => {
  await page.route('**/api/reports/revenue*', (route) => route.fulfill({ status: 500, json: { message: 'The revenue report failed' } }));
  await signIn(page, manager);

  const card = (text) => page.locator('.MuiCard-root').filter({ has: page.getByText(text, { exact: true }) });
  await expect(card('Revenue and gross profit').getByRole('alert')).toHaveText('The revenue report failed');

  // Everything else still loads.
  await expect(card('Active products')).toContainText(/\d/);
  await expect(card('Top products').locator('.MuiSkeleton-root')).toHaveCount(0);
  await expect(card('Low stock').locator('.MuiSkeleton-root')).toHaveCount(0);
});

test('a slow reply for the old list does not overwrite the count after a search', async () => {
  const api = await apiAs(createTestUser('admin'));
  const product = await createProduct(api);
  await api.dispose();
  await signIn(page, manager);

  // The unfiltered list answers late, after the search has already answered.
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  await page.route(/\/api\/products\?/, async (route) => {
    if (!route.request().url().includes('search=')) await released;
    return route.fallback();
  });
  await page.goto('/products');
  await page.getByPlaceholder('Search SKU or name').fill(product.sku);
  await expect(page.getByText(/^1 product\b/)).toBeVisible();

  const oldReply = page.waitForResponse((res) => res.url().includes('/api/products?') && !res.url().includes('search='));
  release();
  await oldReply;
  // Give the old reply time to be handled, then check the count didn't change.
  await page.waitForTimeout(500);
  await expect(page.getByText(/^1 product\b/)).toBeVisible();
});

test('a failed save shows the error and keeps what was typed', async () => {
  const name = `E2E Kept ${newSku()}`;
  await signIn(page, manager);
  await page.goto('/customers');

  await page.getByRole('button', { name: 'New customer' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Company or customer name').fill(name);

  // Only saving fails: the list and other requests keep working.
  await page.route('**/api/customers', (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()));
  await dialog.getByRole('button', { name: 'Add customer' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Cannot reach the server');
  await expect(dialog.getByLabel('Company or customer name')).toHaveValue(name);

  // Trying again works, without typing it again.
  await page.unroute('**/api/customers');
  await dialog.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});

test('logging out in one tab logs out the other tab too', async () => {
  await signIn(page, manager);
  const secondTab = await context.newPage();
  try {
    await secondTab.goto('/customers');
    await expect(secondTab.getByRole('button', { name: 'New customer' })).toBeVisible();

    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(secondTab).toHaveURL(/\/login/);
  } finally {
    await secondTab.close();
  }
});

test('at phone size the sidebar becomes a menu, and the page fits the screen', async ({ browser }) => {
  // Its own context, for the phone-sized screen.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phonePage = await phone.newPage();
  try {
    await signIn(phonePage, manager);
    // Exact, because the Dashboard's Customers card is a link with a longer name. Not inside
    // "navigation": an open phone menu is drawn outside it, on top of the page.
    const menu = phonePage.getByRole('link', { name: 'Customers', exact: true });
    await expect(menu).toBeHidden();

    // Nothing wider than the screen, which would make the page scroll sideways. Measured once the
    // charts and tables have loaded, because they're the widest things on the page.
    await phonePage.waitForLoadState('networkidle');
    await expect(phonePage.locator('.recharts-line')).toHaveCount(2);
    const [pageWidth, screenWidth] = await phonePage.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(pageWidth).toBeLessThanOrEqual(screenWidth);

    await phonePage.getByRole('button', { name: 'Open menu' }).click();
    await menu.click();

    await expect(phonePage).toHaveURL(/\/customers$/);
    await expect(menu).toBeHidden(); // choosing a page closes the menu
  } finally {
    await phone.close();
  }
});
