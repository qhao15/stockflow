import { pool } from '../db/pool.js';
import { escapeLike } from './format.js';

// Suppliers with their purchasing figures. Spend counts received POs only; open POs
// (draft or approved) are counted separately, cancelled ones not at all. in_use: has any
// PO (even a cancelled one), so it can't be deleted - the history must stay complete.
const SELECT_SUPPLIERS = `
  SELECT s.id, s.code, s.name, s.contact_name, s.email, s.phone, s.city, s.address, s.notes, s.is_active,
         s.created_at, s.updated_at,
         COALESCE(p.received_count, 0) AS received_count, COALESCE(p.spend, 0) AS spend,
         COALESCE(p.open_count, 0) AS open_count, COALESCE(p.open_value, 0) AS open_value,
         p.last_order, p.supplier_id IS NOT NULL AS in_use
  FROM suppliers s
  LEFT JOIN (
    SELECT supplier_id,
           SUM(status = 'received') AS received_count,
           SUM(CASE WHEN status = 'received' THEN total_amount ELSE 0 END) AS spend,
           SUM(status IN ('draft', 'approved')) AS open_count,
           SUM(CASE WHEN status IN ('draft', 'approved') THEN total_amount ELSE 0 END) AS open_value,
           MAX(order_date) AS last_order
    FROM purchase_orders GROUP BY supplier_id
  ) p ON p.supplier_id = s.id`;

export function toSupplier(row) {
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
    receivedCount: Number(row.received_count),
    spend: Number(row.spend),
    openCount: Number(row.open_count),
    openValue: Number(row.open_value),
    lastOrder: row.last_order,
    inUse: Boolean(Number(row.in_use)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SORTS = {
  code: 's.id',
  name: 's.name',
  city: 's.city',
  receivedCount: 'received_count',
  spend: 'spend',
  openCount: 'open_count',
  lastOrder: 'p.last_order',
};

// Filters: search (code, name, contact, phone, email), status (active | inactive).
export async function listSuppliers(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('(s.code LIKE ? OR s.name LIKE ? OR s.contact_name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)');
    params.push(...Array(5).fill(`%${escapeLike(search)}%`));
  }
  if (query.status === 'active') where.push('s.is_active = 1');
  else if (query.status === 'inactive') where.push('s.is_active = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const order = SORTS[query.sort] ? `ORDER BY ${SORTS[query.sort]} ${dir}, s.id ${dir}` : 'ORDER BY s.name ASC, s.id ASC';

  const [rows] = await pool.query(`${SELECT_SUPPLIERS} ${whereSql} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM suppliers s ${whereSql}`, params);
  return { rows: rows.map(toSupplier), total };
}

// One supplier with totals for the detail page.
export async function getSupplier(id, conn = pool) {
  const [[row]] = await conn.query(`${SELECT_SUPPLIERS} WHERE s.id = ?`, [id]);
  if (!row) return null;
  const [[stats]] = await conn.query(
    `SELECT MIN(order_date) AS first_order, SUM(status = 'cancelled') AS cancelled_count
     FROM purchase_orders WHERE supplier_id = ?`,
    [id]
  );
  const supplier = toSupplier(row);
  return {
    ...supplier,
    stats: {
      receivedCount: supplier.receivedCount,
      spend: supplier.spend,
      averageOrder: supplier.receivedCount ? Math.round((supplier.spend / supplier.receivedCount) * 100) / 100 : 0,
      openCount: supplier.openCount,
      openValue: supplier.openValue,
      cancelledCount: Number(stats.cancelled_count ?? 0),
      firstOrder: stats.first_order,
      lastOrder: supplier.lastOrder,
    },
  };
}
