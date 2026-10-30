import { pool } from '../db/pool.js';
import { AppError } from './errors.js';
import { changeStock } from './stockLedger.js';
import { cents, escapeLike, fromCents, pad } from './format.js';

// Buying from suppliers: draft -> approved -> received, or cancelled before receiving.
// Every status change is one guarded UPDATE (... WHERE status = <expected>), so two
// people clicking at the same moment can't both succeed: the second sees 0 rows changed.

export const PO_STATUSES = ['draft', 'approved', 'received', 'cancelled'];

const SELECT_ORDERS = `
  SELECT po.id, po.po_number, po.status, po.order_date, po.expected_date, po.total_amount, po.note,
         po.supplier_id, s.name AS supplier_name, po.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
         po.created_by, cu.name AS created_by_name,
         po.approved_by, au.name AS approved_by_name, po.approved_at,
         po.received_by, ru.name AS received_by_name, po.received_at,
         po.cancelled_by, xu.name AS cancelled_by_name, po.cancelled_at, po.cancel_reason,
         po.version, po.updated_at,
         (SELECT COUNT(*) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) AS item_count,
         (SELECT COALESCE(SUM(i.quantity), 0) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) AS unit_count
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  JOIN warehouses w ON w.id = po.warehouse_id
  JOIN users cu ON cu.id = po.created_by
  LEFT JOIN users au ON au.id = po.approved_by
  LEFT JOIN users ru ON ru.id = po.received_by
  LEFT JOIN users xu ON xu.id = po.cancelled_by`;

const person = (id, name, at) => (id ? { id, name, at } : null);

function toOrder(row) {
  return {
    id: row.id,
    poNumber: row.po_number,
    status: row.status,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    totalAmount: Number(row.total_amount),
    note: row.note,
    supplier: { id: row.supplier_id, name: row.supplier_name },
    warehouse: { id: row.warehouse_id, code: row.warehouse_code, name: row.warehouse_name },
    itemCount: Number(row.item_count),
    unitCount: Number(row.unit_count),
    createdBy: person(row.created_by, row.created_by_name, row.order_date),
    approvedBy: person(row.approved_by, row.approved_by_name, row.approved_at),
    receivedBy: person(row.received_by, row.received_by_name, row.received_at),
    cancelledBy: person(row.cancelled_by, row.cancelled_by_name, row.cancelled_at),
    cancelReason: row.cancel_reason,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

const SORTS = {
  poNumber: 'po.id',
  orderDate: 'po.order_date',
  expectedDate: 'po.expected_date',
  supplier: 's.name',
  warehouse: 'w.code',
  status: 'po.status',
  totalAmount: 'po.total_amount',
};

// Filters: status, supplierId, warehouseId, from / to (order date, YYYY-MM-DD) and
// search (PO number or supplier name).
export async function listPurchaseOrders(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (PO_STATUSES.includes(query.status)) {
    where.push('po.status = ?');
    params.push(query.status);
  }
  for (const [key, column] of [['supplierId', 'po.supplier_id'], ['warehouseId', 'po.warehouse_id']]) {
    const id = Number(query[key]);
    if (Number.isInteger(id) && id > 0) {
      where.push(`${column} = ?`);
      params.push(id);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from ?? '')) {
    where.push('po.order_date >= ?');
    params.push(query.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to ?? '')) {
    where.push('po.order_date < ? + INTERVAL 1 DAY');
    params.push(query.to);
  }
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('(po.po_number LIKE ? OR s.name LIKE ?)');
    params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
  const order = SORTS[query.sort] ? `ORDER BY ${SORTS[query.sort]} ${dir}, po.id ${dir}` : 'ORDER BY po.id DESC';

  const [rows] = await pool.query(`${SELECT_ORDERS} ${whereSql} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
     JOIN warehouses w ON w.id = po.warehouse_id ${whereSql}`,
    params
  );
  return { rows: rows.map(toOrder), total };
}

// One PO with its lines; null if it doesn't exist.
export async function getPurchaseOrder(id, conn = pool) {
  const [[row]] = await conn.query(`${SELECT_ORDERS} WHERE po.id = ?`, [id]);
  if (!row) return null;
  const [items] = await conn.query(
    `SELECT i.id, i.product_id, p.sku, p.name, p.unit, i.quantity, i.unit_cost, i.line_total
     FROM purchase_order_items i JOIN products p ON p.id = i.product_id
     WHERE i.purchase_order_id = ? ORDER BY i.id`,
    [id]
  );
  return {
    ...toOrder(row),
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      sku: i.sku,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      unitCost: Number(i.unit_cost),
      lineTotal: Number(i.line_total),
    })),
  };
}

// The supplier and warehouse must be active, and every product must exist and be active.
async function checkReferences(conn, { supplierId, warehouseId, items }) {
  const [[supplier]] = await conn.query('SELECT name, is_active FROM suppliers WHERE id = ?', [supplierId]);
  if (!supplier) throw new AppError('Supplier not found', 400);
  if (!supplier.is_active) throw new AppError(`${supplier.name} is inactive`, 400);

  const [[warehouse]] = await conn.query('SELECT name, is_active FROM warehouses WHERE id = ?', [warehouseId]);
  if (!warehouse) throw new AppError('Warehouse not found', 400);
  if (!warehouse.is_active) throw new AppError(`${warehouse.name} is inactive and can't receive goods`, 400);

  const [products] = await conn.query('SELECT id, sku, is_active FROM products WHERE id IN (?)', [items.map((i) => i.productId)]);
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const [i, item] of items.entries()) {
    const product = byId.get(item.productId);
    if (!product) throw new AppError(`Line ${i + 1}: product not found`, 400);
    if (!product.is_active) throw new AppError(`Line ${i + 1}: ${product.sku} is inactive`, 400);
  }
}

// Writes the lines and returns the order total. Replaces any existing lines.
async function writeItems(conn, orderId, items) {
  await conn.query('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [orderId]);
  let total = 0;
  const rows = items.map((item) => {
    const line = item.quantity * cents(item.unitCost);
    total += line;
    return [orderId, item.productId, item.quantity, item.unitCost, fromCents(line)];
  });
  await conn.query(
    'INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost, line_total) VALUES ?',
    [rows]
  );
  return fromCents(total);
}

const STATUS_PHRASES = {
  draft: 'is still a draft',
  approved: 'is already approved',
  received: 'has already been received',
  cancelled: 'was cancelled',
};

// Explains why a guarded UPDATE changed nothing: missing, wrong status, or edited by
// someone else. action is the past tense of what was tried ('approved', 'edited'...).
async function guardFailed(conn, id, action, { version } = {}) {
  const order = await getPurchaseOrder(id, conn);
  if (!order) return new AppError('Purchase order not found', 404);
  if (version !== undefined && order.status === 'draft' && order.version !== version) {
    return new AppError(`${order.poNumber} was changed by someone else. Review the latest version and try again.`, 409, {
      reason: 'version_conflict', purchaseOrder: order,
    });
  }
  const state = `${order.poNumber} ${STATUS_PHRASES[order.status]}`;
  return new AppError(order.status === action ? state : `${state}, so it can't be ${action}`, 409, {
    reason: 'wrong_status', purchaseOrder: order,
  });
}

export async function createPurchaseOrder(conn, values, userId) {
  await checkReferences(conn, values);
  // The number comes from the id, so insert with a unique placeholder first.
  const [result] = await conn.query(
    `INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, order_date, expected_date, note, created_by)
     VALUES (UUID_SHORT(), ?, ?, 'draft', NOW(), ?, ?, ?)`,
    [values.supplierId, values.warehouseId, values.expectedDate, values.note, userId]
  );
  const id = result.insertId;
  const total = await writeItems(conn, id, values.items);
  await conn.query('UPDATE purchase_orders SET po_number = ?, total_amount = ? WHERE id = ?', [`PO-${pad(id)}`, total, id]);
  return getPurchaseOrder(id, conn);
}

// Only drafts can be edited, and only from the version that was loaded.
export async function updatePurchaseOrder(conn, id, values, version) {
  await checkReferences(conn, values);
  const [result] = await conn.query(
    `UPDATE purchase_orders SET supplier_id = ?, warehouse_id = ?, expected_date = ?, note = ?, version = version + 1
     WHERE id = ? AND status = 'draft' AND version = ?`,
    [values.supplierId, values.warehouseId, values.expectedDate, values.note, id, version]
  );
  if (result.affectedRows === 0) throw await guardFailed(conn, id, 'edited', { version });
  const total = await writeItems(conn, id, values.items);
  await conn.query('UPDATE purchase_orders SET total_amount = ? WHERE id = ?', [total, id]);
  return getPurchaseOrder(id, conn);
}

export async function approvePurchaseOrder(conn, id, userId) {
  const [result] = await conn.query(
    `UPDATE purchase_orders SET status = 'approved', approved_by = ?, approved_at = NOW(), version = version + 1
     WHERE id = ? AND status = 'draft'`,
    [userId, id]
  );
  if (result.affectedRows === 0) throw await guardFailed(conn, id, 'approved');
  return getPurchaseOrder(id, conn);
}

// Adds every line to the destination warehouse's stock, in one transaction with the
// status change. The guarded UPDATE runs first: a second receive of the same PO (another
// tab, a double click) changes 0 rows and stops before touching stock.
export async function receivePurchaseOrder(conn, id, userId) {
  const [result] = await conn.query(
    `UPDATE purchase_orders SET status = 'received', received_by = ?, received_at = NOW(), version = version + 1
     WHERE id = ? AND status = 'approved'`,
    [userId, id]
  );
  if (result.affectedRows === 0) throw await guardFailed(conn, id, 'received');

  const [[order]] = await conn.query(
    `SELECT po.po_number, po.warehouse_id, w.name AS warehouse_name, w.is_active
     FROM purchase_orders po JOIN warehouses w ON w.id = po.warehouse_id
     WHERE po.id = ? LOCK IN SHARE MODE`,
    [id]
  );
  if (!order.is_active) throw new AppError(`${order.warehouse_name} is inactive and can't receive goods`, 409);

  // Lock stock rows in product order, the same order every receipt uses, so two receipts
  // with overlapping products wait for each other instead of deadlocking.
  const [items] = await conn.query(
    'SELECT product_id, quantity FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY product_id',
    [id]
  );
  for (const item of items) {
    await changeStock(conn, {
      productId: item.product_id,
      warehouseId: order.warehouse_id,
      change: item.quantity,
      type: 'purchase_receipt',
      referenceType: 'purchase_order',
      referenceId: id,
      userId,
    });
  }
  return getPurchaseOrder(id, conn);
}

// Drafts and approved POs can be cancelled; received ones can't (their stock is in).
export async function cancelPurchaseOrder(conn, id, reason, userId) {
  const [result] = await conn.query(
    `UPDATE purchase_orders SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?,
       version = version + 1
     WHERE id = ? AND status IN ('draft', 'approved')`,
    [userId, reason, id]
  );
  if (result.affectedRows === 0) throw await guardFailed(conn, id, 'cancelled');
  return getPurchaseOrder(id, conn);
}
