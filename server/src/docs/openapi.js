// The API's OpenAPI description, shown at /api/docs. One line per endpoint below;
// tests/apiDocs.test.js fails if a route exists without one, or the other way round.
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

const string = { type: 'string' };
const integer = { type: 'integer' };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const oneOf = (...values) => ({ type: 'string', enum: values });
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const list = (items) => ({ type: 'array', items });

// ---------- request bodies ----------

const contact = object({
  name: string, contactName: string, email: { type: 'string', format: 'email' }, phone: string, city: string, address: string, notes: string,
}, ['name']);
const contactEdit = { ...contact, required: undefined, properties: { ...contact.properties, isActive: boolean } };

const product = object({
  sku: { ...string, example: 'CBL-USB-C-2M' }, name: string, categoryId: integer, brand: string, unit: oneOf('pcs', 'box', 'set', 'roll', 'pack'),
  costPrice: number, salePrice: number, minStock: integer, imageUrl: string, description: string, isActive: boolean,
}, ['sku', 'name', 'categoryId', 'unit', 'salePrice']);
const productEdit = object({ ...product.properties, version: { ...integer, description: 'The version that was loaded; 409 if someone else saved first' } }, ['version']);

const category = object({ code: { ...string, example: 'CBL' }, name: string, description: string }, ['code', 'name']);
const warehouse = object({ code: { ...string, example: 'HN' }, name: string, city: string, address: string }, ['code', 'name', 'city']);
const warehouseEdit = object({ ...warehouse.properties, isActive: boolean });

const purchaseOrder = object({
  supplierId: integer, warehouseId: integer, expectedDate: { type: 'string', format: 'date' }, note: string,
  items: list(object({ productId: integer, quantity: integer, unitCost: number }, ['productId', 'quantity', 'unitCost'])),
}, ['supplierId', 'warehouseId', 'items']);
const purchaseOrderEdit = object({ ...purchaseOrder.properties, version: integer }, [...purchaseOrder.required, 'version']);

const salesOrder = object({
  customerId: integer, warehouseId: integer, discount: number, note: string,
  items: list(object({ productId: integer, quantity: integer }, ['productId', 'quantity'])),
}, ['customerId', 'warehouseId', 'items']);

const cancel = object({ reason: string }, ['reason']);
const credentials = object({ email: { type: 'string', format: 'email' }, password: { ...string, format: 'password' } }, ['email', 'password']);

// ---------- query parameters ----------

const query = (name, schema, description) => ({ name, in: 'query', schema, ...(description ? { description } : {}) });
const paging = [query('offset', integer), query('limit', integer)];
const sorting = [query('sort', string), query('dir', oneOf('asc', 'desc'))];
const search = query('search', string);
const active = query('status', oneOf('active', 'inactive', 'all'));
const dates = [query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' })];
const orderHistory = (...statuses) => [...paging, query('status', oneOf(...statuses))];

const productFilters = [
  ...paging, ...sorting, search, query('categoryId', integer), query('brand', string), active, query('lowStock', boolean),
];
const productExportFilters = productFilters.filter((p) => !['offset', 'limit'].includes(p.name));
const PO_STATUSES = ['draft', 'approved', 'received', 'cancelled'];
const SO_STATUSES = ['completed', 'cancelled'];

// ---------- endpoints ----------

// [method, path, tag, summary, options]. auth: omitted for public, true for any login, or a permission.
// ok: the success status. errors: other statuses it can answer, beyond 401 and 403.
const ENDPOINTS = [
  ['get', '/health', 'Health', 'Whether the API and database are up', { errors: { 503: 'The database is not reachable' } }],
  ['get', '/health/details', 'Health', 'Database name and version', { auth: 'settings.manage' }],
  ['get', '/health/ip', 'Health', 'The address the server sees for you, and the proxy chain'],

  ['get', '/auth/options', 'Auth', 'Whether sign-up is open'],
  ['post', '/auth/register', 'Auth', 'Create an account and sign in', {
    body: object({ name: string, ...credentials.properties }, ['name', 'email', 'password']), ok: 201, okSchema: 'Session',
    errors: { 400: 'Invalid input', 403: 'Sign-up is closed', 409: 'Email already used', 429: 'Too many failed attempts' },
  }],
  ['post', '/auth/login', 'Auth', 'Sign in', {
    body: credentials, okSchema: 'Session', errors: { 401: 'Invalid email or password', 403: 'Account deactivated', 429: 'Too many failed attempts' },
  }],
  ['get', '/auth/me', 'Auth', 'The current user and their permissions', { auth: true, okSchema: 'CurrentUser' }],

  ['get', '/users', 'Users', 'List all users', { auth: 'users.manage' }],
  ['patch', '/users/:id', 'Users', 'Change a role or deactivate an account', {
    auth: 'users.manage', body: object({ role: oneOf('admin', 'manager', 'staff'), isActive: boolean }), errors: { 400: 'Invalid change', 404: 'Not found' },
  }],

  ['patch', '/account', 'Account', 'Change your own name and email', {
    auth: true, body: object({ name: string, email: string }, ['name', 'email']), errors: { 400: 'Invalid input', 409: 'Email already used' },
  }],
  ['put', '/account/password', 'Account', 'Change your own password; returns a new token', {
    auth: true, body: object({ currentPassword: string, newPassword: string }, ['currentPassword', 'newPassword']), errors: { 400: 'Invalid or wrong password' },
  }],
  ['get', '/account/preferences/:key', 'Account', 'Read a saved UI setting', { auth: true }],
  ['put', '/account/preferences/:key', 'Account', 'Save a UI setting', { auth: true, body: object({ value: {} }), ok: 204 }],

  ['get', '/categories', 'Categories', 'Categories with their product counts', { auth: 'products.view' }],
  ['post', '/categories', 'Categories', 'Create a category', { auth: 'products.manage', body: category, ok: 201, errors: { 400: 'Invalid input', 409: 'Code or name already used' } }],
  ['patch', '/categories/:id', 'Categories', 'Edit a category', { auth: 'products.manage', body: object(category.properties), errors: { 400: 'Invalid input', 404: 'Not found', 409: 'Code or name already used' } }],
  ['delete', '/categories/:id', 'Categories', 'Delete a category that has no products', { auth: 'products.manage', ok: 204, errors: { 404: 'Not found', 409: 'The category has products' } }],

  ['get', '/products', 'Products', 'List products; cost prices only with products.cost', { auth: 'products.view', query: productFilters, okSchema: 'Page' }],
  ['get', '/products/options', 'Products', 'Categories, units and brands for filters and forms', { auth: 'products.view' }],
  ['get', '/products/export', 'Products', 'Excel file of the products matching the filters', { auth: 'products.view', query: productExportFilters, file: 'xlsx' }],
  ['get', '/products/import-template', 'Products', 'Excel template for importing', { auth: 'products.manage', file: 'xlsx' }],
  ['post', '/products/import', 'Products', 'Import an Excel file, all rows or none', { auth: 'products.manage', upload: true, errors: { 400: 'The file has problems; nothing was imported' } }],
  ['get', '/products/:id', 'Products', 'One product, with total stock', { auth: 'products.view', errors: { 404: 'Not found' } }],
  ['post', '/products', 'Products', 'Create a product', { auth: 'products.manage', body: product, ok: 201, errors: { 400: 'Invalid input', 409: 'SKU already used' } }],
  ['patch', '/products/:id', 'Products', 'Edit a product', { auth: 'products.manage', body: productEdit, errors: { 400: 'Invalid input', 404: 'Not found', 409: 'Someone else saved first' } }],
  ['delete', '/products/:id', 'Products', 'Delete a product that was never used', { auth: 'products.manage', errors: { 404: 'Not found', 409: 'The product has history' } }],

  ['get', '/warehouses', 'Warehouses', 'Warehouses with units and products held', { auth: 'stock.view' }],
  ['post', '/warehouses', 'Warehouses', 'Create a warehouse', { auth: 'warehouses.manage', body: warehouse, ok: 201, errors: { 400: 'Invalid input', 409: 'Code already used' } }],
  ['patch', '/warehouses/:id', 'Warehouses', 'Edit or deactivate a warehouse', { auth: 'warehouses.manage', body: warehouseEdit, errors: { 400: 'Invalid input', 404: 'Not found', 409: 'The warehouse still holds stock' } }],
  ['delete', '/warehouses/:id', 'Warehouses', 'Delete a warehouse that was never used', { auth: 'warehouses.manage', ok: 204, errors: { 404: 'Not found', 409: 'The warehouse has history' } }],

  ['get', '/stock', 'Stock', 'Products with their quantity per warehouse', {
    auth: 'stock.view', okSchema: 'Page',
    query: [...paging, ...sorting, search, query('categoryId', integer), query('ids', string, 'Comma-separated product ids'), query('warehouseId', integer), query('lowStock', boolean)],
  }],
  ['get', '/stock/adjustment-reasons', 'Stock', 'Reasons for adjustments', { auth: 'stock.view' }],
  ['get', '/stock/movements', 'Stock', 'The stock ledger, newest first', { auth: 'stock.view', query: [...paging, query('productId', integer), query('warehouseId', integer)], okSchema: 'Page' }],
  ['post', '/stock/transfers', 'Stock', 'Move stock between two warehouses', {
    auth: 'stock.transfer', ok: 201, errors: { 400: 'Invalid input', 409: 'Not enough stock' },
    body: object({ productId: integer, fromWarehouseId: integer, toWarehouseId: integer, quantity: integer, note: string }, ['productId', 'fromWarehouseId', 'toWarehouseId', 'quantity']),
  }],
  ['post', '/stock/adjustments', 'Stock', 'Set a counted quantity, with a reason', {
    auth: 'stock.adjust', ok: 201, errors: { 400: 'Invalid input', 409: 'Stock no longer equals expectedQuantity' },
    body: object({
      productId: integer, warehouseId: integer, countedQuantity: integer, expectedQuantity: integer, reason: oneOf('stock_take', 'damaged', 'lost', 'found', 'other'), note: string,
    }, ['productId', 'warehouseId', 'countedQuantity', 'reason']),
  }],

  ['get', '/suppliers', 'Suppliers', 'List suppliers with their totals', { auth: 'suppliers.view', query: [...paging, ...sorting, search, active], okSchema: 'Page' }],
  ['get', '/suppliers/:id', 'Suppliers', 'One supplier with its totals', { auth: 'suppliers.view', errors: { 404: 'Not found' } }],
  ['get', '/suppliers/:id/purchase-orders', 'Suppliers', 'Purchase order history', { auth: 'suppliers.view', query: orderHistory(...PO_STATUSES), okSchema: 'Page', errors: { 404: 'Not found' } }],
  ['post', '/suppliers', 'Suppliers', 'Create a supplier; the code is generated', { auth: 'suppliers.manage', body: contact, ok: 201, errors: { 400: 'Invalid input' } }],
  ['patch', '/suppliers/:id', 'Suppliers', 'Edit or deactivate a supplier', { auth: 'suppliers.manage', body: contactEdit, errors: { 400: 'Invalid input', 404: 'Not found' } }],
  ['delete', '/suppliers/:id', 'Suppliers', 'Delete a supplier without purchase orders', { auth: 'suppliers.manage', ok: 204, errors: { 404: 'Not found', 409: 'The supplier has purchase orders' } }],

  ['get', '/customers', 'Customers', 'List customers with their totals', { auth: 'customers.view', query: [...paging, ...sorting, search, query('city', string), active], okSchema: 'Page' }],
  ['get', '/customers/cities', 'Customers', 'Cities for the filter', { auth: 'customers.view' }],
  ['get', '/customers/:id', 'Customers', 'One customer with its totals', { auth: 'customers.view', errors: { 404: 'Not found' } }],
  ['get', '/customers/:id/orders', 'Customers', 'Order history', { auth: 'customers.view', query: orderHistory(...SO_STATUSES), okSchema: 'Page', errors: { 404: 'Not found' } }],
  ['post', '/customers', 'Customers', 'Create a customer; the code is generated', { auth: 'customers.manage', body: contact, ok: 201, errors: { 400: 'Invalid input' } }],
  ['patch', '/customers/:id', 'Customers', 'Edit or deactivate a customer', { auth: 'customers.manage', body: contactEdit, errors: { 400: 'Invalid input', 404: 'Not found' } }],
  ['delete', '/customers/:id', 'Customers', 'Delete a customer without orders', { auth: 'customers.manage', ok: 204, errors: { 404: 'Not found', 409: 'The customer has orders' } }],

  ['get', '/purchase-orders', 'Purchase orders', 'List purchase orders', {
    auth: 'purchase_orders.view', okSchema: 'Page',
    query: [...paging, ...sorting, search, query('status', oneOf(...PO_STATUSES)), query('supplierId', integer), query('warehouseId', integer), ...dates],
  }],
  ['get', '/purchase-orders/:id', 'Purchase orders', 'One purchase order with its lines', { auth: 'purchase_orders.view', errors: { 404: 'Not found' } }],
  ['post', '/purchase-orders', 'Purchase orders', 'Create a draft', { auth: 'purchase_orders.create', body: purchaseOrder, ok: 201, errors: { 400: 'Invalid input' } }],
  ['put', '/purchase-orders/:id', 'Purchase orders', 'Replace a draft', { auth: 'purchase_orders.create', body: purchaseOrderEdit, errors: { 400: 'Invalid input', 404: 'Not found', 409: 'Changed by someone else, or no longer a draft' } }],
  ['post', '/purchase-orders/:id/approve', 'Purchase orders', 'Draft to approved', { auth: 'purchase_orders.approve', errors: { 404: 'Not found', 409: 'Not a draft any more' } }],
  ['post', '/purchase-orders/:id/receive', 'Purchase orders', 'Approved to received; adds the stock', { auth: 'purchase_orders.receive', errors: { 404: 'Not found', 409: 'Not approved, or the warehouse is inactive' } }],
  ['post', '/purchase-orders/:id/cancel', 'Purchase orders', 'Cancel a draft or approved order', { auth: 'purchase_orders.cancel', body: cancel, errors: { 400: 'A reason is required', 404: 'Not found', 409: 'Already received or cancelled' } }],

  ['get', '/sales-orders', 'Sales orders', 'List sales orders', {
    auth: 'sales_orders.view', okSchema: 'Page',
    query: [...paging, ...sorting, search, query('status', oneOf(...SO_STATUSES)), query('customerId', integer), query('warehouseId', integer), ...dates],
  }],
  ['get', '/sales-orders/:id', 'Sales orders', 'One order with its lines', { auth: 'sales_orders.view', errors: { 404: 'Not found' } }],
  ['get', '/sales-orders/:id/invoice.pdf', 'Sales orders', 'The PDF invoice', { auth: 'sales_orders.view', file: 'pdf', errors: { 404: 'Not found' } }],
  ['post', '/sales-orders', 'Sales orders', 'Create and complete an order; deducts stock', { auth: 'sales_orders.create', body: salesOrder, ok: 201, errors: { 400: 'Invalid input', 409: 'A line is short of stock' } }],
  ['post', '/sales-orders/:id/cancel', 'Sales orders', 'Cancel an order; returns the stock', { auth: 'sales_orders.cancel', body: cancel, errors: { 400: 'A reason is required', 404: 'Not found', 409: 'Already cancelled' } }],

  ['get', '/audit-logs', 'Audit log', 'Every change, newest first', {
    auth: 'audit_log.view', okSchema: 'Page',
    query: [...paging, search, query('userId', integer), query('entity', string), query('entityId', integer), query('action', string), ...dates],
  }],
  ['get', '/audit-logs/options', 'Audit log', 'Record types, actions and users for the filters', { auth: 'audit_log.view' }],

  ['get', '/reports/summary', 'Reports', 'KPI figures; revenue only with reports.view', { auth: true }],
  ['get', '/reports/revenue', 'Reports', 'Revenue, gross profit and orders per period', { auth: 'reports.view', query: [query('group', oneOf('day', 'month')), ...dates], errors: { 400: 'Invalid dates' } }],
  ['get', '/reports/top-products', 'Reports', 'Best sellers', { auth: 'reports.view', query: [query('by', oneOf('quantity', 'revenue')), ...dates, query('limit', integer)], errors: { 400: 'Invalid dates' } }],
  ['get', '/reports/low-stock', 'Reports', 'Products at or below their minimum, per warehouse', { auth: 'stock.view', query: paging, okSchema: 'Page' }],
];

// ---------- building the document ----------

const json = (schema) => ({ 'application/json': { schema } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const FILE_TYPES = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };

function operation(path, tag, summary, { auth, body, upload, query: queryParams = [], ok = 200, okSchema, file, errors = {} } = {}) {
  const pathParams = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: name === 'id' ? integer : string }));
  const responses = {
    [ok]: {
      description: ok === 204 ? 'Done, with no content' : 'Success',
      ...(file ? { content: { [FILE_TYPES[file]]: { schema: { type: 'string', format: 'binary' } } } } : {}),
      ...(okSchema ? { content: json(ref(okSchema)) } : {}),
    },
  };
  const statuses = { ...(auth ? { 401: 'Not logged in, or the session expired' } : {}), ...(typeof auth === 'string' ? { 403: 'Your role lacks this permission' } : {}), ...errors };
  for (const [status, description] of Object.entries(statuses)) responses[status] = { description, content: json(ref('Error')) };

  return {
    tags: [tag],
    summary,
    ...(typeof auth === 'string' ? { description: `Requires the \`${auth}\` permission.` } : {}),
    ...(auth ? { security: [{ bearerAuth: [] }] } : {}),
    ...(pathParams.length || queryParams.length ? { parameters: [...pathParams, ...queryParams] } : {}),
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    ...(upload ? { requestBody: { required: true, content: { 'multipart/form-data': { schema: object({ file: { type: 'string', format: 'binary' } }, ['file']) } } } } : {}),
    responses,
  };
}

const paths = {};
for (const [method, path, tag, summary, options] of ENDPOINTS) {
  const key = path.replace(/:(\w+)/g, '{$1}');
  paths[key] = { ...paths[key], [method]: operation(path, tag, summary, options) };
}

const user = object({
  id: integer, name: string, email: string, role: oneOf('admin', 'manager', 'staff'), permissions: list(string),
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'StockFlow API',
    version,
    description: 'Sales and inventory API. To try a protected endpoint: call `POST /auth/login`, copy the `token`, click **Authorize** and paste it.\n\nEvery request is limited to 300 a minute per address, and answers `429` above that.',
  },
  servers: [{ url: '/api' }],
  tags: [...new Set(ENDPOINTS.map(([, , tag]) => tag))].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: object({ message: string }, ['message']),
      User: user,
      Session: object({ token: string, user: ref('User') }, ['token', 'user']),
      CurrentUser: object({ user: ref('User') }, ['user']),
      Page: object({ rows: list({ type: 'object' }), total: integer }, ['rows', 'total']),
    },
  },
};
