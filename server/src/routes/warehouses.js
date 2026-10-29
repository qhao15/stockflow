import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { validateWarehouse } from '../validators/stock.js';

const router = Router();
const canManage = requirePermission('warehouses.manage');

router.use(requireAuth);

// units: total stock held. in_use: has stock history or orders, so it can't be deleted.
const SELECT_WAREHOUSES = `
  SELECT w.id, w.code, w.name, w.city, w.address, w.is_active, w.created_at,
         COALESCE(s.units, 0) AS units, COALESCE(s.products, 0) AS products,
         (EXISTS (SELECT 1 FROM stock_movements m WHERE m.warehouse_id = w.id)
           OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.warehouse_id = w.id)
           OR EXISTS (SELECT 1 FROM sales_orders so WHERE so.warehouse_id = w.id)) AS in_use
  FROM warehouses w
  LEFT JOIN (
    SELECT warehouse_id, SUM(quantity) AS units, SUM(quantity > 0) AS products FROM stock GROUP BY warehouse_id
  ) s ON s.warehouse_id = w.id`;

const toWarehouse = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  city: row.city,
  address: row.address,
  isActive: Boolean(row.is_active),
  units: Number(row.units),
  products: Number(row.products),
  inUse: Boolean(Number(row.in_use)),
  createdAt: row.created_at,
});

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function findWarehouse(id, conn = pool) {
  const [rows] = await conn.query(`${SELECT_WAREHOUSES} WHERE w.id = ?`, [id]);
  return rows[0] ? toWarehouse(rows[0]) : null;
}

const duplicate = (res) => res.status(409).json({ message: 'Another warehouse already uses this code' });

// GET /api/warehouses - everyone who can see stock needs the list (grid columns, dialogs).
router.get('/', requirePermission('stock.view'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${SELECT_WAREHOUSES} ORDER BY w.is_active DESC, w.code`);
    res.json({ warehouses: rows.map(toWarehouse) });
  } catch (err) {
    next(err);
  }
});

// POST /api/warehouses
router.post('/', canManage, async (req, res, next) => {
  const { values, error } = validateWarehouse(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const [result] = await pool.query('INSERT INTO warehouses (code, name, city, address, is_active) VALUES (?, ?, ?, ?, ?)', [
      values.code, values.name, values.city, values.address, values.is_active ?? 1,
    ]);
    res.status(201).json({ warehouse: await findWarehouse(result.insertId) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
});

// PATCH /api/warehouses/:id - a warehouse can only be deactivated once it's empty, so no
// stock ends up somewhere that can't be sold or transferred from.
router.patch('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Warehouse not found' });
  const { values, error } = validateWarehouse(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  const fields = Object.keys(values);
  if (fields.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const result = await withTransaction(async (conn) => {
      // Locking the row makes transfers into it (which share-lock it) wait for this.
      const [[row]] = await conn.query('SELECT id, name FROM warehouses WHERE id = ? FOR UPDATE', [id]);
      if (!row) return { status: 404, body: { message: 'Warehouse not found' } };
      if (values.is_active === 0) {
        const [[{ units }]] = await conn.query('SELECT COALESCE(SUM(quantity), 0) AS units FROM stock WHERE warehouse_id = ?', [id]);
        if (Number(units) > 0) {
          return {
            status: 409,
            body: { message: `${row.name} still holds ${Number(units).toLocaleString('en-US')} units. Transfer them out before deactivating it.` },
          };
        }
      }
      await conn.query(`UPDATE warehouses SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
        ...fields.map((f) => values[f]), id,
      ]);
      return { status: 200, body: { warehouse: await findWarehouse(id, conn) } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
});

// DELETE /api/warehouses/:id - only a warehouse that was never used.
router.delete('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Warehouse not found' });
  const inUse = (name) => res.status(409).json({
    reason: 'in_use',
    message: `"${name}" has stock or order history, so it can't be deleted. Deactivate it instead.`,
  });
  let warehouse;
  try {
    warehouse = await findWarehouse(id);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    if (warehouse.inUse || warehouse.units > 0) return inUse(warehouse.name);
    // Empty stock rows (quantity 0, no history) can go with it.
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM stock WHERE warehouse_id = ? AND quantity = 0', [id]);
      await conn.query('DELETE FROM warehouses WHERE id = ?', [id]);
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return inUse(warehouse.name);
    next(err);
  }
});

export default router;
