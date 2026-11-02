import { pool } from '../db/pool.js';
import { escapeLike } from './format.js';

// The audit log: who changed what, when, with the old and new values of the fields that
// changed. audit() must be called with the same connection (transaction) as the change,
// so a change that rolls back leaves no audit row and a committed one always has one.

export const AUDIT_ENTITIES = [
  'product', 'category', 'warehouse', 'stock', 'stock_transfer', 'purchase_order', 'sales_order',
  'customer', 'supplier', 'user',
];
export const AUDIT_ACTIONS = [
  'create', 'update', 'delete', 'import', 'adjust', 'transfer', 'approve', 'receive', 'cancel', 'password_change',
];

// Never stored, whatever the caller passes.
const SECRET = /password|hash|token|secret/i;

// Derived or bookkeeping fields: they change as a side effect and would only add noise.
const IGNORED = new Set([
  'id', 'code', 'createdAt', 'updatedAt', 'version', 'inUse', 'stock', 'lowWarehouses', 'permissions',
  'orderCount', 'revenue', 'lastOrder', 'receivedCount', 'spend', 'openCount', 'openValue', 'stats',
  'units', 'products', 'itemCount', 'unitCount', 'productCount', 'categoryId', 'categoryCode',
]);

const comparable = (value) => (value === undefined || value === '' ? null : value);
const isPlain = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

// { field: [old, new] } for every field whose value differs. Either side may be null
// (created / deleted record). Only plain values are compared; nested objects are skipped.
export function diff(before, after) {
  const changes = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (IGNORED.has(key) || SECRET.test(key)) continue;
    const oldValue = comparable(before?.[key]);
    const newValue = comparable(after?.[key]);
    if (!isPlain(oldValue) || !isPlain(newValue)) continue;
    if (oldValue !== newValue) changes[key] = [oldValue, newValue];
  }
  return changes;
}

const clean = (changes) => Object.fromEntries(Object.entries(changes ?? {}).filter(([key]) => !SECRET.test(key)));

// Who is acting, from the request: the logged-in user and their IP address.
export const auditContext = (req) => ({ userId: req.user?.id ?? null, ip: req.ip ?? null });

// Writes one audit row on `conn`. Pass before/after records (the changed fields are
// worked out), or `changes` directly for actions like a transfer. An update that changed
// nothing writes nothing. Returns true if a row was written.
export async function audit(conn, ctx, { action, entity, entityId = null, label = null, before, after, changes }) {
  const values = changes ? clean(changes) : diff(before, after);
  if (action === 'update' && Object.keys(values).length === 0) return false;
  await conn.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, entity_label, changes, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [ctx.userId, action, entity, entityId, label ? String(label).slice(0, 150) : null,
      Object.keys(values).length ? JSON.stringify(values) : null, ctx.ip ? String(ctx.ip).slice(0, 45) : null]
  );
  return true;
}

// GET /api/audit-logs. Filters: userId, entity, entityId, action, from / to (YYYY-MM-DD),
// search (the record's label, e.g. a SKU or PO number). Newest first.
export async function listAuditLogs(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  const id = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  if (id(query.userId)) {
    where.push('a.user_id = ?');
    params.push(id(query.userId));
  }
  if (AUDIT_ENTITIES.includes(query.entity)) {
    where.push('a.entity_type = ?');
    params.push(query.entity);
    if (id(query.entityId)) {
      where.push('a.entity_id = ?');
      params.push(id(query.entityId));
    }
  }
  if (AUDIT_ACTIONS.includes(query.action)) {
    where.push('a.action = ?');
    params.push(query.action);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from ?? '')) {
    where.push('a.created_at >= ?');
    params.push(query.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to ?? '')) {
    where.push('a.created_at < ? + INTERVAL 1 DAY');
    params.push(query.to);
  }
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('a.entity_label LIKE ?');
    params.push(`%${escapeLike(search)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT a.id, a.user_id, u.name AS user_name, u.email AS user_email, a.action, a.entity_type, a.entity_id,
            a.entity_label, a.changes, a.ip_address, a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      user: r.user_id ? { id: r.user_id, name: r.user_name, email: r.user_email } : null,
      action: r.action,
      entity: r.entity_type,
      entityId: r.entity_id,
      label: r.entity_label,
      // MariaDB returns JSON columns as text, MySQL as parsed objects.
      changes: typeof r.changes === 'string' ? JSON.parse(r.changes) : r.changes,
      ip: r.ip_address,
      createdAt: r.created_at,
    })),
  };
}
