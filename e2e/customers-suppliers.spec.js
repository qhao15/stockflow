// Customers and suppliers. They share a form and the same delete rules, so those tests run once
// for each. What really differs, their totals and how they're used in orders, has its own tests.
import { expect, test } from '@playwright/test';
import {
  apiAs, clearLogin, createCustomer, createProduct, createSupplier, createTestUser, createWarehouse, newSku, signIn,
} from './helpers.js';

let page;
let api;
let manager;
let staff;
let warehouse;
let product;

// One browser window for all the tests in this file, closed when the file is done.
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  manager = createTestUser('manager');
  staff = createTestUser('staff');
  api = await apiAs(createTestUser('admin'));
  warehouse = await createWarehouse(api);
  product = await createProduct(api, { warehouseId: warehouse.id, quantity: 100, salePrice: 25 }); // cost price is 10
});

test.afterAll(async () => {
  await page.close();
  await api?.dispose();
});

// The window is shared, so each test starts logged out.
test.beforeEach(() => clearLogin(page));

const sell = async (customer, quantity) => (await api.post('/sales-orders', {
  customerId: customer.id, warehouseId: warehouse.id, items: [{ productId: product.id, quantity }],
})).salesOrder;

const orderFrom = async (supplier, quantity) => (await api.post('/purchase-orders', {
  supplierId: supplier.id, warehouseId: warehouse.id, items: [{ productId: product.id, quantity, unitCost: 10 }],
})).purchaseOrder;

// What differs between the two.
const KINDS = [
  {
    kind: 'customer',
    listPath: '/customers',
    apiPath: '/customers',
    nameLabel: 'Company or customer name',
    code: /^CUS-\d{5,}$/,
    create: createCustomer,
    addOrder: (customer) => sell(customer, 1),
  },
  {
    kind: 'supplier',
    listPath: '/suppliers',
    apiPath: '/suppliers',
    nameLabel: 'Supplier name',
    code: /^SUP-\d{3,}$/,
    create: createSupplier,
    addOrder: (supplier) => orderFrom(supplier, 1),
  },
];

// Runs once for each kind, so these are two tests each.
for (const { kind, listPath, apiPath, nameLabel, code, create, addOrder } of KINDS) {
  test(`${kind}: add through the form, find it in the list, then edit it`, async () => {
    const name = `E2E New ${kind} ${newSku()}`;
    await signIn(page, manager);
    await page.goto(listPath);

    // Adding gets a generated code, and opens the new detail page.
    await page.getByRole('button', { name: `New ${kind}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(nameLabel).fill(name);
    await dialog.getByLabel('Phone').fill('+84 24 3999 0000');
    await dialog.getByLabel('City').fill('Hanoi');
    await dialog.getByRole('button', { name: `Add ${kind}` }).click();

    await expect(page).toHaveURL(new RegExp(`${listPath}/\\d+$`));
    const detailUrl = page.url();
    await expect(page.getByText(`${name} added`)).toBeVisible();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('link', { name: '+84 24 3999 0000' })).toBeVisible();
    const generated = await page.getByText(code).textContent();

    // The list finds it, and its code links back to the same page.
    await page.goto(listPath);
    await page.getByPlaceholder(/^Search/).fill(name);
    await page.getByRole('link', { name: generated }).click();
    await expect(page).toHaveURL(detailUrl);

    // Editing keeps the code.
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog.getByRole('heading', { name: `Edit ${generated}` })).toBeVisible();
    await dialog.getByLabel('Phone').fill('+84 28 3822 1234');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText(`${name} saved`)).toBeVisible();
    await expect(page.getByRole('link', { name: '+84 28 3822 1234' })).toBeVisible();
    await expect(page.getByText(code)).toHaveText(generated);
  });

  test(`${kind}: with no orders it can be deleted, with orders only deactivated`, async () => {
    const unused = await create(api);
    const used = await create(api);
    await addOrder(used);
    await signIn(page, manager);

    // Deleting asks first, then goes back to the list.
    await page.goto(`${listPath}/${unused.id}`);
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(new RegExp(`${listPath}$`));
    await expect(api.get(`${apiPath}/${unused.id}`)).rejects.toThrow('404');

    // With an order, Delete is switched off.
    await page.goto(`${listPath}/${used.id}`);
    await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled();

    // Deactivating can be undone.
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText(`${used.name} deactivated`)).toBeVisible();
    await expect(page.getByText(`This ${kind} is inactive`)).toBeVisible();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText(`${used.name} activated`)).toBeVisible();
    await expect(page.getByText(`This ${kind} is inactive`)).toHaveCount(0);
  });
}

// A totals card on a detail page. Exact, because "Orders" would also match "Order history".
const stat = (label) => page.locator('.MuiCard-root').filter({ has: page.getByText(label, { exact: true }) });

test('customer totals leave out cancelled orders', async () => {
  const customer = await createCustomer(api);
  await sell(customer, 2); // $50
  const cancelled = await sell(customer, 4); // $100
  await api.post(`/sales-orders/${cancelled.id}/cancel`, { reason: 'E2E test' });
  await signIn(page, manager);

  await page.goto(`/customers/${customer.id}`);

  await expect(stat('Orders')).toContainText('1');
  await expect(stat('Orders')).toContainText('+ 1 cancelled');
  await expect(stat('Revenue')).toContainText('$50.00');
  await expect(stat('Average order')).toContainText('$50.00');

  // The history still lists both, with the cancelled one's status.
  await expect(page.getByRole('row', { name: cancelled.orderNumber })).toContainText('Cancelled');
  await expect(page.getByText('Showing 2 of 2')).toBeVisible();
});

test('supplier spend counts only received orders; approved ones are open', async () => {
  const supplier = await createSupplier(api);
  const received = await orderFrom(supplier, 2); // $20
  await api.post(`/purchase-orders/${received.id}/approve`);
  await api.post(`/purchase-orders/${received.id}/receive`);
  const open = await orderFrom(supplier, 3); // $30
  await api.post(`/purchase-orders/${open.id}/approve`);
  const cancelled = await orderFrom(supplier, 5); // $50
  await api.post(`/purchase-orders/${cancelled.id}/cancel`, { reason: 'E2E test' });
  await signIn(page, manager);

  await page.goto(`/suppliers/${supplier.id}`);

  await expect(stat('Received POs')).toContainText('1');
  await expect(stat('Received POs')).toContainText('+ 1 cancelled');
  await expect(stat('Spend')).toContainText('$20.00');
  await expect(stat('Open POs')).toContainText('1');
  await expect(stat('Open POs')).toContainText('$30.00 on order');
  await expect(page.getByText('Showing 3 of 3')).toBeVisible();
});

test('Staff can add a customer from inside the sales order form', async () => {
  const name = `E2E Walk-in ${newSku()}`;
  await signIn(page, staff);
  await page.goto('/sales-orders/new');

  // The new-customer option offers what was typed, and the form starts with that name.
  const picker = page.getByRole('combobox', { name: 'Customer' });
  await picker.fill(name);
  await page.getByRole('option', { name: `New customer "${name}"` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Company or customer name')).toHaveValue(name);
  await dialog.getByRole('button', { name: 'Add customer' }).click();

  // Back on the order, with the new customer picked. The order itself isn't submitted.
  await expect(dialog).toBeHidden();
  await expect(picker).toHaveValue(name);
  await expect(page).toHaveURL(/\/sales-orders\/new$/);
});

test('a new purchase order from a supplier page has that supplier picked', async () => {
  const supplier = await createSupplier(api);
  await signIn(page, manager);
  await page.goto(`/suppliers/${supplier.id}`);

  await page.getByRole('link', { name: 'New purchase order' }).click();

  await expect(page).toHaveURL(/\/purchase-orders\/new$/);
  await expect(page.getByRole('combobox', { name: 'Supplier' })).toHaveText(supplier.name);
});
