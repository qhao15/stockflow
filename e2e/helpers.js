// Shared steps for the browser tests. Everything they create is named E2E or e2e-, which is how
// cleanup.mjs finds it afterwards.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, request } from '@playwright/test';

// Short, because warehouse and category codes can be at most 10 characters.
const unique = () => randomBytes(3).toString('hex').toUpperCase();

// New on every run, so no working password is ever stored in the repository.
export const newPassword = () => randomBytes(16).toString('hex');

// A unique address, so tests never share an account.
export const newEmail = (label) => `e2e-${label}-${unique().toLowerCase()}@test.invalid`;

// Creates an account directly in the database in server/.env.
export function createTestUser(role, name = 'E2E Tester') {
  const user = { email: newEmail(role), password: newPassword(), name, role };
  execSync(`npm run create-user --prefix server -- ${role} ${user.email} ${user.password} "${name}"`);
  return user;
}

// Removes the saved login, for a test file whose tests share one window.
export async function clearLogin(page) {
  // A plain image on the same site: this stops the app first, so a request it still had running
  // can't come back as "logged out" and send the page to the login screen during the next test.
  await page.goto('/logo.svg');
  await page.evaluate(() => localStorage.clear());
}

// Fills in the login form on the page already open.
export async function fillLogin(page, email, password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// The Dashboard greets the user by name, e.g. "Good morning, E2E Tester".
export async function expectGreeting(page, name) {
  await expect(page.getByRole('heading', { name: `, ${name}` })).toBeVisible();
}

// Opens the login page and signs in, ending on the Dashboard.
export async function signIn(page, user) {
  await page.goto('/login');
  await fillLogin(page, user.email, user.password);
  await expectGreeting(page, user.name);
}

// AG Grid splits one row across several containers (pinned left, middle, pinned right), and marks
// each part with the row's id. So a cell is found by its row id and its column id.
export const gridCell = (page, product, column) => page.locator(`[row-id="${product.id}"] [col-id="${column}"]`);

// Calls the API as a user, without a browser window. Tests use this to prepare their data and
// to check the result, so only the feature being tested goes through the screens.
export async function apiAs(user) {
  const context = await request.newContext({ baseURL: 'http://localhost:5174' }); // see playwright.config.js
  const send = async (method, path, data, token) => {
    const response = await context[method](`/api${path}`, {
      data,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok()) throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const { token } = await send('post', '/auth/login', { email: user.email, password: user.password });
  return {
    get: (path) => send('get', path, undefined, token),
    post: (path, data) => send('post', path, data, token),
    dispose: () => context.dispose(),
  };
}

export async function createWarehouse(api) {
  const id = unique();
  const { warehouse } = await api.post('/warehouses', { code: `E2E${id}`, name: `E2E Warehouse ${id}`, city: 'Test' });
  return warehouse;
}

export async function createCustomer(api) {
  const { customer } = await api.post('/customers', { name: `E2E Customer ${unique()}` });
  return customer;
}

export async function createSupplier(api) {
  const { supplier } = await api.post('/suppliers', { name: `E2E Supplier ${unique()}` });
  return supplier;
}

export const newSku = () => `E2E-${unique()}`;

export async function createCategory(api) {
  const id = unique();
  const { category } = await api.post('/categories', { code: `E2E${id}`, name: `E2E Category ${id}` });
  return category;
}

// A new product. With a warehouse and quantity, that much stock is added through the ledger.
export async function createProduct(api, { warehouseId, quantity = 0, salePrice = 25, minStock = 0 } = {}) {
  const sku = newSku();
  const category = await createCategory(api);
  const { product } = await api.post('/products', {
    sku, name: `E2E Product ${sku}`, categoryId: category.id, unit: 'pcs', costPrice: 10, salePrice, minStock,
  });
  if (quantity) {
    await api.post('/stock/adjustments', { productId: product.id, warehouseId, countedQuantity: quantity, reason: 'found' });
  }
  return product;
}

export async function stockOf(api, productId, warehouseId) {
  const { rows } = await api.get(`/stock?ids=${productId}`);
  return rows[0].quantities[warehouseId] ?? 0;
}
