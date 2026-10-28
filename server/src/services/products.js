import { pool } from '../db/pool.js';

// Product rows with their category and stock summary: total across warehouses, and in
// how many warehouses the quantity is at or below min_stock (low stock). in_use: the
// product appears in orders, transfers or the stock ledger, so it can't be deleted.
const SELECT_PRODUCTS = `
  SELECT p.id, p.sku, p.name, p.category_id, c.name AS category_name, c.code AS category_code,
         p.brand, p.unit, p.cost_price, p.sale_price, p.min_stock, p.image_url, p.description,
         p.is_active, p.version, p.created_at, p.updated_at,
         COALESCE(s.total, 0) AS stock_total, COALESCE(s.low, 0) AS low_warehouses,
         (EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id)
           OR EXISTS (SELECT 1 FROM sales_order_items si WHERE si.product_id = p.id)
           OR EXISTS (SELECT 1 FROM purchase_order_items pi WHERE pi.product_id = p.id)
           OR EXISTS (SELECT 1 FROM stock_transfers t WHERE t.product_id = p.id)) AS in_use
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN (
    SELECT st.product_id, SUM(st.quantity) AS total, SUM(st.quantity <= pr.min_stock) AS low
    FROM stock st JOIN products pr ON pr.id = st.product_id
    GROUP BY st.product_id
  ) s ON s.product_id = p.id`;

// Sortable columns (API name -> SQL). Anything else falls back to the default order.
const SORTS = {
  sku: 'p.sku',
  name: 'p.name',
  category: 'c.name',
  brand: 'p.brand',
  unit: 'p.unit',
  costPrice: 'p.cost_price',
  salePrice: 'p.sale_price',
  minStock: 'p.min_stock',
  stock: 'stock_total',
  updatedAt: 'p.updated_at',
};

export function toProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryCode: row.category_code,
    brand: row.brand,
    unit: row.unit,
    costPrice: Number(row.cost_price),
    salePrice: Number(row.sale_price),
    minStock: row.min_stock,
    imageUrl: row.image_url,
    description: row.description,
    isActive: Boolean(row.is_active),
    version: row.version,
    stock: Number(row.stock_total),
    lowWarehouses: Number(row.low_warehouses),
    inUse: Boolean(Number(row.in_use)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// Builds the WHERE clause from list filters: search (SKU or name), categoryId, brand,
// status (active | inactive | all) and lowStock.
function buildFilters(query) {
  const where = [];
  const params = [];
  const search = String(query.search ?? '').trim();
  if (search) {
    where.push('(p.sku LIKE ? OR p.name LIKE ?)');
    params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
  }
  const categoryId = Number(query.categoryId);
  if (Number.isInteger(categoryId) && categoryId > 0) {
    where.push('p.category_id = ?');
    params.push(categoryId);
  }
  const brand = String(query.brand ?? '').trim();
  if (brand) {
    where.push('p.brand = ?');
    params.push(brand);
  }
  if (query.status === 'active') where.push('p.is_active = 1');
  else if (query.status === 'inactive') where.push('p.is_active = 0');
  if (query.lowStock === 'true' || query.lowStock === '1') where.push('s.low > 0');
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function buildOrder(query) {
  const column = SORTS[query.sort];
  const dir = query.dir === 'desc' ? 'DESC' : 'ASC';
  // id as a tie-breaker keeps paging stable when many rows share the sort value.
  return column ? `ORDER BY ${column} ${dir}, p.id ${dir}` : 'ORDER BY p.id DESC';
}

export async function listProducts(query, { offset = 0, limit = 50 } = {}) {
  const filters = buildFilters(query);
  const [rows] = await pool.query(
    `${SELECT_PRODUCTS} ${filters.sql} ${buildOrder(query)} LIMIT ? OFFSET ?`,
    [...filters.params, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (${SELECT_PRODUCTS} ${filters.sql}) t`,
    filters.params
  );
  return { rows: rows.map(toProduct), total };
}

export async function getProduct(id, conn = pool) {
  const [rows] = await conn.query(`${SELECT_PRODUCTS} WHERE p.id = ?`, [id]);
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function categoryExists(id) {
  const [rows] = await pool.query('SELECT 1 FROM categories WHERE id = ?', [id]);
  return rows.length > 0;
}
