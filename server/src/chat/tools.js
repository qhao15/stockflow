// The assistant's tools: read-only lookups over the existing services, each behind the same
// permission as the matching page. Each has a description and a JSON Schema input, so an AI
// model can be given them later as they are. Nothing here changes data.
import { pool } from '../db/pool.js';
import { hasPermission } from '../auth/permissions.js';
import { AppError } from '../services/errors.js';
import { listProducts } from '../services/products.js';
import { listMovements, listStock } from '../services/stock.js';
import { getSalesOrder, listSalesOrders } from '../services/salesOrders.js';
import { listPurchaseOrders } from '../services/purchaseOrders.js';
import { listCustomers } from '../services/customers.js';
import { listSuppliers } from '../services/suppliers.js';
import { getLowStock, getRevenue, getSummary, getTopProducts } from '../services/reports.js';

const MAX_ROWS = 5;
const text = (description) => ({ type: 'string', description });
const input = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
// A tool's permission is one name or a list, all of which the role needs.
const can = (user, permission) => [permission].flat().every((p) => hasPermission(user.role, p));
// Checked by the report itself (a 400 the model is told about): providers accept few schema keywords.
const DAY = { type: 'string' };
const MOVEMENT_ROWS = 10;
const DAY_ROWS = 31; // a longer daily report gives totals only

// The one record a search means: an exact code match, or the only match. Otherwise null, and
// the caller lists the matches so the model can ask which one.
const pick = (rows, code, query) => rows.find((r) => r[code].toLowerCase() === query.trim().toLowerCase()) ?? (rows.length === 1 ? rows[0] : null);

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
    name: 'stock_movements',
    description: "A product's latest stock movements, newest first: sales, purchase receipts, transfers, adjustments and cancellations, each with the order or transfer behind it. Explains why stock changed.",
    permission: 'stock.view',
    input: input({ query: text('A SKU, or part of a product name') }, ['query']),
    async run({ query }) {
      const { rows } = await listStock({ search: query }, { limit: MAX_ROWS });
      const product = pick(rows, 'sku', query);
      if (!product) {
        return rows.length
          ? { message: 'Several products match: ask which one, or use its SKU', matches: rows.map(({ sku, name }) => ({ sku, name })) }
          : { message: 'No product matches' };
      }
      const { rows: movements, total } = await listMovements({ productId: product.id }, { limit: MOVEMENT_ROWS });
      return {
        product: { sku: product.sku, name: product.name, total: product.total },
        totalMovements: total,
        movements: movements.map((m) => ({
          date: m.createdAt,
          warehouse: m.warehouseCode,
          type: m.type,
          change: m.change,
          balanceAfter: m.balanceAfter,
          ...(m.referenceNumber ? { reference: { type: m.referenceType, number: m.referenceNumber, id: m.referenceId } } : {}),
          ...(m.otherWarehouseCode ? { otherWarehouse: m.otherWarehouseCode } : {}),
          ...(m.note ? { note: m.note } : {}),
          by: m.userName,
        })),
      };
    },
  },
  {
    name: 'customer_orders',
    description: "One customer's latest sales orders, newest first, with the lines of the most recent one: what they bought last.",
    permission: ['customers.view', 'sales_orders.view'],
    input: input({ query: text('A customer code, or part of a name') }, ['query']),
    async run({ query }) {
      const { rows } = await listCustomers({ search: query, status: 'all' }, { limit: MAX_ROWS });
      const customer = pick(rows, 'code', query);
      if (!customer) {
        return rows.length
          ? { message: 'Several customers match: ask which one, or use the code', matches: rows.map(({ code, name, city }) => ({ code, name, city })) }
          : { message: 'No customer matches' };
      }
      const { rows: orders, total } = await listSalesOrders({ customerId: customer.id }, { limit: MAX_ROWS });
      const latest = orders.length ? await getSalesOrder(orders[0].id) : null;
      return {
        customer: { id: customer.id, code: customer.code, name: customer.name, orderCount: customer.orderCount, revenue: customer.revenue },
        totalOrders: total,
        orders: orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, orderDate: o.orderDate, totalAmount: o.totalAmount })),
        ...(latest ? { latestOrderLines: latest.items.map(({ sku, name, quantity, unitPrice, lineTotal }) => ({ sku, name, quantity, unitPrice, lineTotal })) } : {}),
      };
    },
  },
  {
    name: 'revenue_report',
    description: 'Revenue, gross profit and number of orders for any date range (completed orders only), with totals, and per day or per month. Use it for questions like "revenue last month" or "profit in October".',
    permission: 'reports.view',
    input: input({
      from: { ...DAY, description: 'First day, YYYY-MM-DD' },
      to: { ...DAY, description: 'Last day, YYYY-MM-DD' },
      group: { type: 'string', enum: ['day', 'month'], description: 'Per day (at most 400 days) or per month (at most 60 months)' },
    }, ['from', 'to']),
    async run({ from, to, group = 'day' }) {
      const report = await getRevenue({ from, to, group });
      const rows = group === 'day' && report.rows.length > DAY_ROWS ? undefined : report.rows;
      return {
        from: report.from,
        to: report.to,
        group: report.group,
        totals: report.totals,
        ...(rows ? { rows } : { note: `More than ${DAY_ROWS} days: totals only. Ask per month for a breakdown.` }),
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
