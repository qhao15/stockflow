import { pool } from '../db/pool.js';

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// Low stock: at or below the product's min_stock in an active warehouse. A warehouse
// without a stock row counts as 0. Shared with the products list so both pages agree.
// `warehouseSql` optionally narrows it to one warehouse.
export const lowStockCount = (productAlias, warehouseSql = '') => `(
  SELECT COUNT(*) FROM warehouses lw
  LEFT JOIN stock ls ON ls.warehouse_id = lw.id AND ls.product_id = ${productAlias}.id
  WHERE lw.is_active = 1 ${warehouseSql} AND COALESCE(ls.quantity, 0) <= ${productAlias}.min_stock)`;

const SORTS = {
  sku: 'p.sku',
  name: 'p.name',
  category: 'c.name',
  minStock: 'p.min_stock',
  total: 'total',
};

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET /api/stock: one row per product with its quantity in every warehouse.
// Filters: search (SKU or name), categoryId, status, lowStock (optionally in warehouseId).
// Sort: a SORTS key, or w<warehouseId> to sort by the quantity in one warehouse.
export async function listStock(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('(p.sku LIKE ? OR p.name LIKE ?)');
    params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
  }
  const categoryId = parseId(query.categoryId);
  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(categoryId);
  }
  if (query.status === 'active') where.push('p.is_active = 1');
  else if (query.status === 'inactive') where.push('p.is_active = 0');

  const warehouseId = parseId(query.warehouseId);
  const lowSql = lowStockCount('p', warehouseId ? 'AND lw.id = ?' : '');
  if (query.lowStock === 'true' || query.lowStock === '1') {
    where.push(`${lowSql} > 0`);
    if (warehouseId) params.push(warehouseId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  const orderParams = [];
  let order = 'ORDER BY p.sku ASC';
  const byWarehouse = /^w(\d+)$/.exec(String(query.sort ?? ''));
  if (byWarehouse) {
    order = `ORDER BY COALESCE((SELECT quantity FROM stock os WHERE os.product_id = p.id AND os.warehouse_id = ?), 0) ${dir}, p.id ${dir}`;
    orderParams.push(Number(byWarehouse[1]));
  } else if (SORTS[query.sort]) {
    order = `ORDER BY ${SORTS[query.sort]} ${dir}, p.id ${dir}`;
  }

  const from = `
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN (SELECT product_id, SUM(quantity) AS total FROM stock GROUP BY product_id) t ON t.product_id = p.id
    ${whereSql}`;

  const [rows] = await pool.query(
    `SELECT p.id, p.sku, p.name, p.unit, p.min_stock, p.is_active, c.name AS category_name,
            COALESCE(t.total, 0) AS total, ${lowStockCount('p')} AS low_count
     ${from} ${order} LIMIT ? OFFSET ?`,
    [...params, ...orderParams, limit, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);

  // Quantities for just this page, as { warehouseId: quantity }.
  const quantities = {};
  if (rows.length) {
    const [stockRows] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock WHERE product_id IN (?)',
      [rows.map((r) => r.id)]
    );
    for (const s of stockRows) (quantities[s.product_id] ??= {})[s.warehouse_id] = s.quantity;
  }

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      categoryName: r.category_name,
      minStock: r.min_stock,
      isActive: Boolean(r.is_active),
      total: Number(r.total),
      lowCount: Number(r.low_count),
      quantities: quantities[r.id] ?? {},
    })),
  };
}

// GET /api/stock/movements: the ledger, newest first, with the order or transfer number
// that caused each movement and, for transfers, the warehouse on the other side.
export async function listMovements(query, { offset = 0, limit = 50 } = {}) {
  const where = [];
  const params = [];
  const productId = parseId(query.productId);
  if (productId) {
    where.push('m.product_id = ?');
    params.push(productId);
  }
  const warehouseId = parseId(query.warehouseId);
  if (warehouseId) {
    where.push('m.warehouse_id = ?');
    params.push(warehouseId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT m.id, m.product_id, p.sku, p.name AS product_name, m.warehouse_id, w.code AS warehouse_code,
            m.type, m.quantity_change, m.balance_after, m.reference_type, m.reference_id, m.note,
            m.created_at, u.name AS user_name,
            COALESCE(po.po_number, so.order_number, tr.transfer_number) AS reference_number,
            ow.code AS other_warehouse_code
     FROM stock_movements m
     JOIN products p ON p.id = m.product_id
     JOIN warehouses w ON w.id = m.warehouse_id
     JOIN users u ON u.id = m.user_id
     LEFT JOIN purchase_orders po ON m.reference_type = 'purchase_order' AND po.id = m.reference_id
     LEFT JOIN sales_orders so ON m.reference_type = 'sales_order' AND so.id = m.reference_id
     LEFT JOIN stock_transfers tr ON m.reference_type = 'stock_transfer' AND tr.id = m.reference_id
     LEFT JOIN warehouses ow ON ow.id = IF(m.type = 'transfer_out', tr.to_warehouse_id, tr.from_warehouse_id)
     ${whereSql}
     ORDER BY m.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM stock_movements m ${whereSql}`, params);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      warehouseId: r.warehouse_id,
      warehouseCode: r.warehouse_code,
      type: r.type,
      change: r.quantity_change,
      balanceAfter: r.balance_after,
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      referenceNumber: r.reference_number,
      otherWarehouseCode: r.other_warehouse_code,
      note: r.note,
      userName: r.user_name,
      createdAt: r.created_at,
    })),
  };
}
