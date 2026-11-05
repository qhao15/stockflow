// Signing in, signing out and registering, in a real browser.
import { expect, test } from '@playwright/test';
import { clearLogin, createTestUser, expectGreeting, fillLogin, newEmail, newPassword } from './helpers.js';

let page;
let user;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  user = createTestUser('staff');
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

test('sign in opens the Dashboard, and logging out returns to the login page', async () => {
  await page.goto('/login');
  await fillLogin(page, user.email, user.password);
  await expectGreeting(page, user.name);

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  // Logged out for real: the Dashboard now sends the user back to the login page.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('a wrong password shows an error and stays on the login page', async () => {
  await page.goto('/login');
  await fillLogin(page, user.email, 'not-the-password');

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page).toHaveURL(/\/login/);
});

test('a protected page asks for login, then returns to that page', async () => {
  await page.goto('/customers');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcustomers/);

  await fillLogin(page, user.email, user.password);
  await expect(page).toHaveURL(/\/customers$/);
});

test('the session survives a page reload', async () => {
  await page.goto('/login');
  await fillLogin(page, user.email, user.password);
  await expectGreeting(page, user.name);

  await page.reload();
  await expectGreeting(page, user.name);
});

test('with sign-up closed, the pages stop offering it', async () => {
  // The server's refusal is tested in server/tests/auth.test.js. This fakes only its answer.
  await page.route('**/api/auth/options', (route) => route.fulfill({ json: { registrationOpen: false } }));
  try {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create one' })).toHaveCount(0);

    await page.goto('/register');
    await expect(page.getByText('Sign-up is closed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
  } finally {
    await page.unroute('**/api/auth/options');
  }
});

test('a new account can register and becomes Staff', async () => {
  const email = newEmail('register');
  const password = newPassword();

  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Newcomer');
  await page.getByLabel('Email').fill(email);
  // Regular expressions, because "Password" alone also matches "Confirm password".
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel(/^Confirm password/).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectGreeting(page, 'E2E Newcomer');

  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByText('staff', { exact: true })).toBeVisible();
});
