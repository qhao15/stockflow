// The assistant in a real browser: the robot button and its small window, streamed answers with
// links to pages, saved chats, and the same limits as the screens. The test API has no AI key
// (playwright.config.js), so the basic assistant answers (basicAssistant.js).
import { expect, test } from '@playwright/test';
import { apiAs, clearLogin, createProduct, createTestUser, createWarehouse, signIn } from './helpers.js';

let page;
let api;
let manager;
let staff;
let warehouse;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  manager = createTestUser('manager');
  staff = createTestUser('staff');
  api = await apiAs(createTestUser('admin'));
  warehouse = await createWarehouse(api);
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out (which also forgets the saved chats).
test.beforeEach(() => clearLogin(page));

const panel = () => page.getByRole('dialog', { name: 'Assistant' });
const savedChats = () => panel().getByRole('list', { name: 'Saved chats' }).getByRole('listitem');

// Opens the assistant if needed, asks, and waits for the answer to finish streaming.
async function ask(question) {
  if (!(await panel().isVisible())) await page.getByRole('button', { name: 'Open assistant' }).click();
  await panel().getByLabel('Ask a question').fill(question);
  await panel().getByRole('button', { name: 'Send' }).click();
  await expect(panel().getByLabel('Ask a question')).toBeEnabled(); // the answer has finished
}

test('an answer links to its page; a click outside closes the window and still works', async () => {
  const product = await createProduct(api, { warehouseId: warehouse.id, quantity: 12 });
  await signIn(page, manager);

  await ask(`How many ${product.sku} are in stock?`);
  await expect(panel()).toContainText(`${warehouse.code} 12`);
  // The header says which assistant is on. Without AI there is no "AI was busy" note.
  await expect(panel().getByText('Basic', { exact: true })).toBeVisible();
  await expect(panel()).not.toContainText('the AI was busy');

  await panel().getByRole('link', { name: product.sku }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/products' && url.searchParams.get('search') === product.sku);

  // A link inside the window keeps it open. A click outside closes it, and still does its job.
  await expect(panel()).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Customers' }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(panel()).toBeHidden();

  // The robot button opens it again, with the chat still there, and closes it.
  await page.getByRole('button', { name: 'Open assistant' }).click();
  await expect(panel()).toContainText(`${warehouse.code} 12`);
  await page.getByRole('button', { name: 'Close assistant' }).click();
  await expect(panel()).toBeHidden();
});

test('several chats are saved, can be switched between and deleted, and survive a reload', async () => {
  await signIn(page, manager);

  await ask('Which products are low on stock?');
  await panel().getByRole('button', { name: 'New chat' }).click();
  await expect(panel()).not.toContainText('Furthest below first');
  await ask('Summary of this month');

  await panel().getByRole('button', { name: 'Show chats' }).click();
  await expect(savedChats()).toHaveText(['Summary of this month', 'Which products are low on stock?']); // newest first

  await savedChats().filter({ hasText: 'low on stock' }).click();
  await expect(panel()).toContainText('Furthest below first');

  // Kept in the browser, so they are still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Open assistant' }).click();
  await panel().getByRole('button', { name: 'Show chats' }).click();
  await expect(savedChats()).toHaveCount(2);

  const summary = savedChats().filter({ hasText: 'Summary of this month' });
  await summary.hover();
  await panel().getByRole('button', { name: 'Delete chat Summary of this month' }).click();
  await expect(savedChats()).toHaveText(['Which products are low on stock?']);
});

test('Staff are refused what their role can not see', async () => {
  await signIn(page, staff);

  await ask('What are the top products by revenue?');
  await expect(panel()).toContainText("Your role doesn't have access to that");
});

test('the window can be made taller or shorter, is remembered, and resets on a double-click', async () => {
  await signIn(page, staff);
  await page.getByRole('button', { name: 'Open assistant' }).click();
  const bar = panel().getByRole('separator', { name: 'Resize the assistant' });
  const height = async () => Math.round((await panel().boundingBox()).height);
  const start = await height(); // an empty chat: the smallest size

  // Drag the bar 150 px up.
  const box = await bar.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 150, { steps: 5 });
  await page.mouse.up();
  expect(await height()).toBe(start + 150);

  // Kept after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Open assistant' }).click();
  expect(await height()).toBe(start + 150);

  // The arrow keys work too, 40 px a press.
  await bar.focus();
  await page.keyboard.press('ArrowDown');
  expect(await height()).toBe(start + 110);

  // Never taller than the screen: it stops 128 px short of the window's height.
  await bar.focus();
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowUp');
  expect(await height()).toBe(page.viewportSize().height - 128);

  // A double-click goes back to sizing by the chat.
  await bar.dblclick();
  expect(await height()).toBe(start);
});
