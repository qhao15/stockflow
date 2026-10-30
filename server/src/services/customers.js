import { pool } from '../db/pool.js';
import { escapeLike } from './format.js';

// Customers with their sales figures. Revenue counts completed orders only; cancelled
// orders still show in the history but don't count. in_use: has any order (even a
// cancelled one), so it can't be deleted - invoices must stay complete.
const SELECT_CUSTOMERS = `
  SELECT c.id, c.code, c.name, c.contact_name, c.email, c.phone, c.city, c.address, c.notes, c.is_active,
         c.created_at, c.updated_at,
         COALESCE(s.order_count, 0) AS order_count, COALESCE(s.revenue, 0) AS revenue, s.last_order,
         s.customer_id IS NOT NULL AS in_use
  FROM customers c
  LEFT JOIN (
    SELECT customer_id, SUM(status = 'completed') AS order_count,
           SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END) AS revenue,
           MAX(order_date) AS last_order
    FROM sales_orders GROUP BY customer_id
  ) s ON s.customer_id = c.id`;

export function toCustomer(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    address: row.address,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    orderCount: Number(row.order_count),
    revenue: Number(row.revenue),
    lastOrder: row.last_order,
    inUse: Boolean(Number(row.in_use)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SORTS = {
  code: 'c.id',
  name: 'c.name',
  city: 'c.city',
  orderCount: 'order_count',
  revenue: 'revenue',
  lastOrder: 's.last_order',
};

// Filters: search (code, name, contact, phone, email), city, status (active | inactive).
export async function listCustomers(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('(c.code LIKE ? OR c.name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
    params.push(...Array(5).fill(`%${escapeLike(search)}%`));
  }
  const city = String(query.city ?? '').trim();
  if (city) {
    where.push('c.city = ?');
    params.push(city);
  }
  if (query.status === 'active') where.push('c.is_active = 1');
  else if (query.status === 'inactive') where.push('c.is_active = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const order = SORTS[query.sort] ? `ORDER BY ${SORTS[query.sort]} ${dir}, c.id ${dir}` : 'ORDER BY c.name ASC, c.id ASC';

  const [rows] = await pool.query(`${SELECT_CUSTOMERS} ${whereSql} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM customers c ${whereSql}`, params);
  return { rows: rows.map(toCustomer), total };
}

// One customer with totals for the detail page: completed orders, revenue, average order,
// first and last order, and how many orders were cancelled.
export async function getCustomer(id, conn = pool) {
  const [[row]] = await conn.query(`${SELECT_CUSTOMERS} WHERE c.id = ?`, [id]);
  if (!row) return null;
  const [[stats]] = await conn.query(
    `SELECT MIN(order_date) AS first_order, SUM(status = 'cancelled') AS cancelled_count
     FROM sales_orders WHERE customer_id = ?`,
    [id]
  );
  const customer = toCustomer(row);
  return {
    ...customer,
    stats: {
      orderCount: customer.orderCount,
      cancelledCount: Number(stats.cancelled_count ?? 0),
      revenue: customer.revenue,
      averageOrder: customer.orderCount ? Math.round((customer.revenue / customer.orderCount) * 100) / 100 : 0,
      firstOrder: stats.first_order,
      lastOrder: customer.lastOrder,
    },
  };
}

export async function listCities() {
  const [rows] = await pool.query('SELECT DISTINCT city FROM customers WHERE city IS NOT NULL ORDER BY city');
  return rows.map((r) => r.city);
}
