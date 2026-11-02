import { pool } from '../db/pool.js';
import { AppError } from './errors.js';
import { cents, fromCents } from './format.js';
import { lowStockCount } from './stock.js';

// Figures for the dashboard. Cancelled orders are left out of everything. Revenue is the
// order total after discount; gross profit is that minus the unit cost copied onto each
// line at the time of sale. Days and months follow the server's clock.

const MAX_DAYS = 400;
const MAX_MONTHS = 60;

const pad2 = (n) => String(n).padStart(2, '0');
const toDay = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const money = (value) => Number(fromCents(value));

// A real calendar date as YYYY-MM-DD, or null.
function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

// from / to from the query, or the defaults. Throws a 400 for anything invalid.
function dateRange(query, defaultFrom) {
  const today = toDay(new Date());
  const from = query.from ? parseDay(query.from) : defaultFrom;
  const to = query.to ? parseDay(query.to) : today;
  if (!from || !to) throw new AppError('from and to must be valid dates (YYYY-MM-DD)', 400);
  if (from > to) throw new AppError('from must not be after to', 400);
  return { from, to };
}

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDay(date);
};

// The first day of the month, n months ago.
const monthStart = (months) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  return toDay(date);
};

// Every period in the range, so days or months without sales still appear (as 0).
function periodsBetween(group, from, to) {
  const periods = [];
  const end = new Date(`${to}T00:00:00Z`);
  const cursor = new Date(`${from}T00:00:00Z`);
  if (group === 'month') {
    cursor.setUTCDate(1);
    while (cursor <= end) {
      periods.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return periods;
  }
  while (cursor <= end) {
    periods.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return periods;
}

// The KPI cards. Revenue is only included when includeRevenue is true (Manager and Admin).
// It's compared with the same days of last month, because a month in progress is never a
// fair match for a whole one.
export async function getSummary({ includeRevenue }) {
  const [[orders]] = await pool.query(
    `SELECT
       COALESCE(SUM(order_date >= DATE_FORMAT(NOW(), '%Y-%m-01')), 0) AS orders_this_month,
       COALESCE(SUM(order_date < DATE_FORMAT(NOW(), '%Y-%m-01')), 0) AS orders_last_month,
       COALESCE(SUM(CASE WHEN order_date >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN total_amount ELSE 0 END), 0) AS revenue_this_month,
       COALESCE(SUM(CASE WHEN order_date < DATE_FORMAT(NOW(), '%Y-%m-01') THEN total_amount ELSE 0 END), 0) AS revenue_last_month,
       COALESCE(SUM(CASE WHEN order_date < DATE_FORMAT(NOW(), '%Y-%m-01') AND order_date <= NOW() - INTERVAL 1 MONTH
                         THEN total_amount ELSE 0 END), 0) AS revenue_last_month_to_date
     FROM sales_orders
     WHERE status = 'completed' AND order_date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01')`
  );
  const [[products]] = await pool.query(
    `SELECT COUNT(*) AS active, COALESCE(SUM(${lowStockCount('p')} > 0), 0) AS low_stock
     FROM products p WHERE p.is_active = 1`
  );
  const summary = {
    ordersThisMonth: Number(orders.orders_this_month),
    ordersLastMonth: Number(orders.orders_last_month),
    activeProducts: Number(products.active),
    lowStockProducts: Number(products.low_stock),
  };
  if (includeRevenue) {
    summary.revenueThisMonth = Number(orders.revenue_this_month);
    summary.revenueLastMonth = Number(orders.revenue_last_month);
    summary.revenueLastMonthToDate = Number(orders.revenue_last_month_to_date);
  }
  return summary;
}

// Revenue, gross profit and order count per day or month. The two queries are separate
// because joining the lines to the orders would count each order total once per line.
export async function getRevenue(query) {
  const group = query.group === 'month' ? 'month' : 'day';
  const range = dateRange(query, group === 'month' ? monthStart(11) : daysAgo(29));
  const periods = periodsBetween(group, range.from, range.to);
  const max = group === 'month' ? MAX_MONTHS : MAX_DAYS;
  if (periods.length > max) {
    throw new AppError(`That range is too long: at most ${max} ${group === 'month' ? 'months' : 'days'}`, 400);
  }

  const format = group === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const params = [format, range.from, range.to];
  const [orders] = await pool.query(
    `SELECT DATE_FORMAT(order_date, ?) AS period, COUNT(*) AS order_count, SUM(total_amount) AS revenue
     FROM sales_orders
     WHERE status = 'completed' AND order_date >= ? AND order_date < ? + INTERVAL 1 DAY
     GROUP BY period`,
    params
  );
  const [costs] = await pool.query(
    `SELECT DATE_FORMAT(o.order_date, ?) AS period, SUM(i.quantity * i.unit_cost) AS cost
     FROM sales_orders o JOIN sales_order_items i ON i.sales_order_id = o.id
     WHERE o.status = 'completed' AND o.order_date >= ? AND o.order_date < ? + INTERVAL 1 DAY
     GROUP BY period`,
    params
  );
  const orderBy = new Map(orders.map((r) => [r.period, r]));
  const costBy = new Map(costs.map((r) => [r.period, r.cost]));

  // Added up in cents, so the totals match the rows exactly.
  const totals = { revenue: 0, profit: 0, orders: 0 };
  const rows = periods.map((period) => {
    const revenue = cents(orderBy.get(period)?.revenue ?? 0);
    const profit = revenue - cents(costBy.get(period) ?? 0);
    const orderCount = Number(orderBy.get(period)?.order_count ?? 0);
    totals.revenue += revenue;
    totals.profit += profit;
    totals.orders += orderCount;
    return { period, revenue: money(revenue), profit: money(profit), orders: orderCount };
  });
  return {
    group,
    from: range.from,
    to: range.to,
    rows,
    totals: { revenue: money(totals.revenue), profit: money(totals.profit), orders: totals.orders },
  };
}

// Best sellers for a period, by quantity or revenue. Revenue here is the line totals before
// any order discount, because a discount applies to a whole order rather than one product.
export async function getTopProducts(query) {
  const by = query.by === 'revenue' ? 'revenue' : 'quantity';
  const { from, to } = dateRange(query, daysAgo(29));
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  const [rows] = await pool.query(
    `SELECT p.id, p.sku, p.name, SUM(i.quantity) AS quantity, SUM(i.line_total) AS revenue
     FROM sales_orders o
     JOIN sales_order_items i ON i.sales_order_id = o.id
     JOIN products p ON p.id = i.product_id
     WHERE o.status = 'completed' AND o.order_date >= ? AND o.order_date < ? + INTERVAL 1 DAY
     GROUP BY p.id
     ORDER BY ${by === 'revenue' ? 'revenue' : 'quantity'} DESC, p.id ASC
     LIMIT ?`,
    [from, to, limit]
  );
  return {
    by,
    from,
    to,
    rows: rows.map((r) => ({
      id: r.id, sku: r.sku, name: r.name, quantity: Number(r.quantity), revenue: Number(r.revenue),
    })),
  };
}

// Active products at or below their minimum, one row per active warehouse, furthest below
// first. Same rule as the Products and Stock pages: no stock row counts as 0.
export async function getLowStock(query) {
  const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  const from = `
    FROM products p
    JOIN warehouses w ON w.is_active = 1
    LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = w.id
    WHERE p.is_active = 1 AND COALESCE(s.quantity, 0) <= p.min_stock`;
  const [rows] = await pool.query(
    `SELECT p.id, p.sku, p.name, p.min_stock, w.id AS warehouse_id, w.code AS warehouse_code, COALESCE(s.quantity, 0) AS quantity
     ${from}
     ORDER BY p.min_stock - COALESCE(s.quantity, 0) DESC, p.id, w.id
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`);
  return {
    total,
    rows: rows.map((r) => ({
      productId: r.id,
      sku: r.sku,
      name: r.name,
      warehouseId: r.warehouse_id,
      warehouseCode: r.warehouse_code,
      quantity: r.quantity,
      minStock: r.min_stock,
    })),
  };
}
