import { pool } from '../db/pool.js';
import { AppError } from './errors.js';
import { StockError, changeStock } from './stockLedger.js';
import { cents, escapeLike, fromCents, pad } from './format.js';

// Selling to customers. An order is completed as soon as it's created: its stock is
// deducted in the same transaction. Cancelling returns the stock. Prices and costs are
// copied onto the lines, so later price changes never rewrite old invoices.

export const SO_STATUSES = ['completed', 'cancelled'];

const SELECT_ORDERS = `
  SELECT so.id, so.order_number, so.status, so.order_date, so.subtotal, so.discount, so.total_amount, so.note,
         so.customer_id, c.code AS customer_code, c.name AS customer_name, c.contact_name AS customer_contact,
         c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address, c.city AS customer_city,
         so.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
         so.created_by, cu.name AS created_by_name,
         so.cancelled_by, xu.name AS cancelled_by_name, so.cancelled_at, so.cancel_reason,
         (SELECT COUNT(*) FROM sales_order_items i WHERE i.sales_order_id = so.id) AS item_count,
         (SELECT COALESCE(SUM(i.quantity), 0) FROM sales_order_items i WHERE i.sales_order_id = so.id) AS unit_count
  FROM sales_orders so
  JOIN customers c ON c.id = so.customer_id
  JOIN warehouses w ON w.id = so.warehouse_id
  JOIN users cu ON cu.id = so.created_by
  LEFT JOIN users xu ON xu.id = so.cancelled_by`;

const person = (id, name, at) => (id ? { id, name, at } : null);

function toOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    orderDate: row.order_date,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    totalAmount: Number(row.total_amount),
    note: row.note,
    customer: {
      id: row.customer_id,
      code: row.customer_code,
      name: row.customer_name,
      contactName: row.customer_contact,
      email: row.customer_email,
      phone: row.customer_phone,
      address: row.customer_address,
      city: row.customer_city,
    },
    warehouse: { id: row.warehouse_id, code: row.warehouse_code, name: row.warehouse_name },
    itemCount: Number(row.item_count),
    unitCount: Number(row.unit_count),
    createdBy: person(row.created_by, row.created_by_name, row.order_date),
    cancelledBy: person(row.cancelled_by, row.cancelled_by_name, row.cancelled_at),
    cancelReason: row.cancel_reason,
  };
}

const SORTS = {
  orderNumber: 'so.id',
  orderDate: 'so.order_date',
  customer: 'c.name',
  warehouse: 'w.code',
  status: 'so.status',
  totalAmount: 'so.total_amount',
};

// Filters: status, customerId, warehouseId, from / to (order date, YYYY-MM-DD) and
// search (order number or customer name).
export async function listSalesOrders(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (SO_STATUSES.includes(query.status)) {
    where.push('so.status = ?');
    params.push(query.status);
  }
  for (const [key, column] of [['customerId', 'so.customer_id'], ['warehouseId', 'so.warehouse_id']]) {
    const id = Number(query[key]);
    if (Number.isInteger(id) && id > 0) {
      where.push(`${column} = ?`);
      params.push(id);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from ?? '')) {
    where.push('so.order_date >= ?');
    params.push(query.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to ?? '')) {
    where.push('so.order_date < ? + INTERVAL 1 DAY');
    params.push(query.to);
  }
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('(so.order_number LIKE ? OR c.name LIKE ?)');
    params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
  const order = SORTS[query.sort] ? `ORDER BY ${SORTS[query.sort]} ${dir}, so.id ${dir}` : 'ORDER BY so.id DESC';

  const [rows] = await pool.query(`${SELECT_ORDERS} ${whereSql} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sales_orders so JOIN customers c ON c.id = so.customer_id ${whereSql}`,
    params
  );
  return { rows: rows.map(toOrder), total };
}

// One order with its lines; null if it doesn't exist.
export async function getSalesOrder(id, conn = pool) {
  const [[row]] = await conn.query(`${SELECT_ORDERS} WHERE so.id = ?`, [id]);
  if (!row) return null;
  const [items] = await conn.query(
    `SELECT i.id, i.product_id, p.sku, p.name, p.unit, i.quantity, i.unit_price, i.line_total
     FROM sales_order_items i JOIN products p ON p.id = i.product_id
     WHERE i.sales_order_id = ? ORDER BY i.id`,
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
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
  };
}

// The warehouse row is share-locked, so it can't be deactivated while this runs.
async function loadWarehouse(conn, warehouseId) {
  const [[warehouse]] = await conn.query('SELECT id, name, is_active FROM warehouses WHERE id = ? LOCK IN SHARE MODE', [warehouseId]);
  if (!warehouse) throw new AppError('Warehouse not found', 400);
  return warehouse;
}

// Creates a completed order and deducts its stock, all in the caller's transaction.
// If any line is short, nothing is saved and the error names the product.
export async function createSalesOrder(conn, { customerId, warehouseId, discount, note, items }, userId) {
  const [[customer]] = await conn.query('SELECT name, is_active FROM customers WHERE id = ?', [customerId]);
  if (!customer) throw new AppError('Customer not found', 400);
  if (!customer.is_active) throw new AppError(`${customer.name} is inactive`, 400);
  const warehouse = await loadWarehouse(conn, warehouseId);
  if (!warehouse.is_active) throw new AppError(`${warehouse.name} is inactive`, 400);

  const [products] = await conn.query(
    'SELECT id, sku, sale_price, cost_price, is_active FROM products WHERE id IN (?)',
    [items.map((i) => i.productId)]
  );
  const byId = new Map(products.map((p) => [p.id, p]));
  let subtotal = 0;
  const lines = items.map((item, i) => {
    const product = byId.get(item.productId);
    if (!product) throw new AppError(`Line ${i + 1}: product not found`, 400);
    if (!product.is_active) throw new AppError(`Line ${i + 1}: ${product.sku} is inactive and can't be sold`, 400);
    const lineTotal = item.quantity * cents(product.sale_price);
    subtotal += lineTotal;
    return { ...item, product, lineTotal };
  });
  if (cents(discount) > subtotal) {
    throw new AppError(`The discount (${fromCents(cents(discount))}) can't be more than the subtotal (${fromCents(subtotal)})`, 400);
  }

  // The number comes from the id, so insert with a unique placeholder first.
  const [result] = await conn.query(
    `INSERT INTO sales_orders (order_number, customer_id, warehouse_id, status, order_date, subtotal, discount, total_amount, note, created_by)
     VALUES (UUID_SHORT(), ?, ?, 'completed', NOW(), ?, ?, ?, ?, ?)`,
    [customerId, warehouseId, fromCents(subtotal), fromCents(cents(discount)), fromCents(subtotal - cents(discount)), note, userId]
  );
  const id = result.insertId;
  await conn.query('UPDATE sales_orders SET order_number = ? WHERE id = ?', [`SO-${pad(id)}`, id]);
  await conn.query(
    'INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, unit_cost, line_total) VALUES ?',
    [lines.map((l) => [id, l.productId, l.quantity, l.product.sale_price, l.product.cost_price, fromCents(l.lineTotal)])]
  );

  // Deduct in product order, the order every stock change uses, so two orders with
  // overlapping products wait for each other instead of deadlocking.
  for (const line of [...lines].sort((a, b) => a.productId - b.productId)) {
    try {
      await changeStock(conn, {
        productId: line.productId,
        warehouseId,
        change: -line.quantity,
        type: 'sale',
        referenceType: 'sales_order',
        referenceId: id,
        userId,
      });
    } catch (err) {
      if (!(err instanceof StockError) || err.details.reason !== 'insufficient_stock') throw err;
      const { available } = err.details;
      throw new AppError(
        available === 0
          ? `${line.product.sku} is out of stock in ${warehouse.name}`
          : `Only ${available} × ${line.product.sku} left in ${warehouse.name} (${line.quantity} ordered)`,
        409,
        { reason: 'insufficient_stock', productId: line.productId, available }
      );
    }
  }
  return getSalesOrder(id, conn);
}

// Returns the stock of a completed order. The guarded UPDATE runs first, so cancelling
// twice (two tabs, a double click) returns the stock only once.
export async function cancelSalesOrder(conn, id, reason, userId) {
  const [result] = await conn.query(
    `UPDATE sales_orders SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?
     WHERE id = ? AND status = 'completed'`,
    [userId, reason, id]
  );
  if (result.affectedRows === 0) {
    const order = await getSalesOrder(id, conn);
    if (!order) throw new AppError('Sales order not found', 404);
    throw new AppError(`${order.orderNumber} was already cancelled`, 409, { reason: 'wrong_status', salesOrder: order });
  }

  const [[order]] = await conn.query('SELECT warehouse_id FROM sales_orders WHERE id = ?', [id]);
  const warehouse = await loadWarehouse(conn, order.warehouse_id);
  if (!warehouse.is_active) {
    throw new AppError(`${warehouse.name} is inactive. Reactivate it before cancelling, so the stock has somewhere to go.`, 409);
  }

  const [items] = await conn.query(
    'SELECT product_id, quantity FROM sales_order_items WHERE sales_order_id = ? ORDER BY product_id',
    [id]
  );
  for (const item of items) {
    await changeStock(conn, {
      productId: item.product_id,
      warehouseId: order.warehouse_id,
      change: item.quantity,
      type: 'sale_cancel',
      referenceType: 'sales_order',
      referenceId: id,
      note: reason.slice(0, 255),
      userId,
    });
  }
  return getSalesOrder(id, conn);
}
