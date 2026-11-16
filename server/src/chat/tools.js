// The assistant's tools: read-only lookups over the existing services, each behind the same
// permission as the matching page. Each has a description and a JSON Schema input, so an AI
// model can be given them later as they are. Nothing here changes data.
import { pool } from '../db/pool.js';
import { hasPermission } from '../auth/permissions.js';
import { AppError } from '../services/errors.js';
import { listProducts } from '../services/products.js';
import { listStock } from '../services/stock.js';
import { listSalesOrders } from '../services/salesOrders.js';
import { listPurchaseOrders } from '../services/purchaseOrders.js';
import { listCustomers } from '../services/customers.js';
import { listSuppliers } from '../services/suppliers.js';
import { getLowStock, getSummary, getTopProducts } from '../services/reports.js';

const MAX_ROWS = 5;
const text = (description) => ({ type: 'string', description });
const input = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const can = (user, permission) => hasPermission(user.role, permission);

// A day N days ago, as YYYY-MM-DD in the app's time zone (pool.js sets it for Node too).
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const TOOLS = [
  {
    name: 'search_products',
    description: 'Find products by SKU or name, with price and total stock.',
    permission: 'products.view',
    input: input({ query: text('Part of a SKU or product name') }, ['query']),
    async run({ query }, user) {
      const { rows, total } = await listProducts({ search: query, status: 'all' }, { limit: MAX_ROWS });
      const seesCost = can(user, 'products.cost');
      return {
        total,
        products: rows.map((p) => ({
          sku: p.sku, name: p.name, salePrice: p.salePrice, stock: p.stock, isActive: p.isActive,
          ...(seesCost ? { costPrice: p.costPrice } : {}),
        })),
      };
    },
  },
  {
    name: 'stock_levels',
    description: 'How many units of a product are in each warehouse.',
    permission: 'stock.view',
    input: input({ query: text('Part of a SKU or product name') }, ['query']),
    async run({ query }) {
      const { rows, total } = await listStock({ search: query }, { limit: MAX_ROWS });
      const [warehouses] = await pool.query('SELECT id, code FROM warehouses WHERE is_active = 1 ORDER BY code');
      return {
        total,
        products: rows.map((p) => ({
          sku: p.sku,
          name: p.name,
          minStock: p.minStock,
          total: p.total,
          warehouses: warehouses.map((w) => ({ code: w.code, quantity: p.quantities[w.id] ?? 0 })),
        })),
      };
    },
  },
  {
    name: 'low_stock',
    description: 'Products at or below their minimum stock, per warehouse, furthest below first.',
    permission: 'stock.view',
    input: input(),
    async run() {
      const { rows, total } = await getLowStock({ limit: 10 });
      return { total, rows: rows.map(({ sku, name, warehouseCode, quantity, minStock }) => ({ sku, name, warehouseCode, quantity, minStock })) };
    },
  },
  {
    name: 'find_sales_order',
    description: 'Look up sales orders by order number (e.g. SO-000123) or customer name.',
    permission: 'sales_orders.view',
    input: input({ query: text('An order number or customer name') }, ['query']),
    async run({ query }) {
      const { rows, total } = await listSalesOrders({ search: query }, { limit: MAX_ROWS });
      return {
        total,
        orders: rows.map((o) => ({
          id: o.id, orderNumber: o.orderNumber, status: o.status, orderDate: o.orderDate, totalAmount: o.totalAmount,
          customer: o.customer.name, warehouse: o.warehouse.code, units: o.unitCount,
        })),
      };
    },
  },
  {
    name: 'find_purchase_order',
    description: 'Look up purchase orders by PO number (e.g. PO-000045) or supplier name.',
    permission: 'purchase_orders.view',
    input: input({ query: text('A PO number or supplier name') }, ['query']),
    async run({ query }) {
      const { rows, total } = await listPurchaseOrders({ search: query }, { limit: MAX_ROWS });
      return {
        total,
        orders: rows.map((o) => ({
          id: o.id, poNumber: o.poNumber, status: o.status, orderDate: o.orderDate, totalAmount: o.totalAmount,
          supplier: o.supplier.name, warehouse: o.warehouse.code, units: o.unitCount,
        })),
      };
    },
  },
  {
    name: 'find_customer',
    description: 'Find customers by name, code, contact, phone or email, with their order totals.',
    permission: 'customers.view',
    input: input({ query: text('Part of a name, code, phone or email') }, ['query']),
    async run({ query }) {
      const { rows, total } = await listCustomers({ search: query, status: 'all' }, { limit: MAX_ROWS });
      return {
        total,
        customers: rows.map((c) => ({
          id: c.id, code: c.code, name: c.name, city: c.city, isActive: c.isActive, orderCount: c.orderCount, revenue: c.revenue, lastOrder: c.lastOrder,
        })),
      };
    },
  },
  {
    name: 'find_supplier',
    description: 'Find suppliers by name or code, with spend and open purchase orders.',
    permission: 'suppliers.view',
    input: input({ query: text('Part of a name or code') }, ['query']),
    async run({ query }) {
      const { rows, total } = await listSuppliers({ search: query, status: 'all' }, { limit: MAX_ROWS });
      return {
        total,
        suppliers: rows.map((s) => ({
          id: s.id, code: s.code, name: s.name, city: s.city, isActive: s.isActive, receivedCount: s.receivedCount, spend: s.spend, openCount: s.openCount,
        })),
      };
    },
  },
  {
    name: 'sales_summary',
    description: "This month's figures: orders, active products, low-stock products, and revenue for roles that may see it.",
    permission: null,
    input: input(),
    run: (args, user) => getSummary({ includeRevenue: can(user, 'reports.view') }),
  },
  {
    name: 'top_products',
    description: 'Best-selling products over the last 7, 30 or 90 days, by quantity or revenue.',
    permission: 'reports.view',
    input: input({
      days: { type: 'integer', enum: [7, 30, 90], description: 'How many days back' },
      by: { type: 'string', enum: ['quantity', 'revenue'] },
    }),
    async run({ days = 30, by = 'quantity' }) {
      const report = await getTopProducts({ by, from: daysAgo([7, 30, 90].includes(days) ? days - 1 : 29), limit: MAX_ROWS });
      return { by: report.by, from: report.from, to: report.to, products: report.rows.map(({ sku, name, quantity, revenue }) => ({ sku, name, quantity, revenue })) };
    },
  },
];

// The tools this user's role may use. A model is only ever shown these.
export const toolsFor = (user) => TOOLS.filter((tool) => !tool.permission || can(user, tool.permission));

// Runs a tool by name, checking the permission again: the list above is not the protection.
export async function runTool(name, args, user) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new AppError(`Unknown tool: ${name}`, 400);
  if (tool.permission && !can(user, tool.permission)) throw new AppError('Your role does not have access to this', 403);
  return tool.run(args ?? {}, user);
}
