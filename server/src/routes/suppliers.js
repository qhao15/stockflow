import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { getSupplier, listSuppliers } from '../services/suppliers.js';
import { listPurchaseOrders } from '../services/purchaseOrders.js';
import { validateContact } from '../validators/contact.js';

const router = Router();
const canView = requirePermission('suppliers.view');
const canManage = requirePermission('suppliers.manage');

router.use(apiLimiter);
router.use(requireAuth);

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const paging = (query) => ({
  offset: Math.max(0, Number.parseInt(query.offset, 10) || 0),
  limit: Math.min(500, Math.max(1, Number.parseInt(query.limit, 10) || 50)),
});

// GET /api/suppliers?offset=&limit=&sort=&dir=&search=&status= - also used by the PO
// form and filters (a large limit: there are few suppliers).
router.get('/', canView, async (req, res, next) => {
  try {
    res.json(await listSuppliers(req.query, paging(req.query)));
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id - contact details and purchasing totals.
router.get('/:id', canView, async (req, res, next) => {
  const id = parseId(req.params.id);
  try {
    const supplier = id && await getSupplier(id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ supplier });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id/purchase-orders?offset=&limit=&status= - newest first. Needs
// purchase order access too, which every role with suppliers.view has today.
router.get('/:id/purchase-orders', canView, requirePermission('purchase_orders.view'), async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Supplier not found' });
  try {
    res.json(await listPurchaseOrders({ supplierId: id, status: req.query.status }, paging(req.query)));
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers - the code (SUP-010) comes from the id.
router.post('/', canManage, async (req, res, next) => {
  const { values, error } = validateContact(req.body);
  if (error) return res.status(400).json({ message: error });
  const columns = Object.keys(values);
  try {
    const [result] = await pool.query(
      `INSERT INTO suppliers (code, ${columns.join(', ')}) VALUES (UUID_SHORT(), ${columns.map(() => '?').join(', ')})`,
      columns.map((c) => values[c])
    );
    const id = result.insertId;
    await pool.query('UPDATE suppliers SET code = ? WHERE id = ?', [`SUP-${String(id).padStart(3, '0')}`, id]);
    res.status(201).json({ supplier: await getSupplier(id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/suppliers/:id - any fields, including isActive.
router.patch('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Supplier not found' });
  const { values, error } = validateContact(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  const columns = Object.keys(values);
  if (columns.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const [result] = await pool.query(
      `UPDATE suppliers SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((c) => values[c]), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ supplier: await getSupplier(id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/suppliers/:id - only a supplier without purchase orders. One with POs is
// kept (deactivate it instead), so the purchase history stays complete.
router.delete('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Supplier not found' });
  const inUse = (name) => res.status(409).json({
    reason: 'in_use',
    message: `"${name}" has purchase orders, so it can't be deleted. Deactivate it instead to hide it from new orders.`,
  });
  let supplier;
  try {
    supplier = await getSupplier(id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    if (supplier.inUse) return inUse(supplier.name);
    await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
    res.status(204).end();
  } catch (err) {
    // A PO was created between the check and the delete; the foreign key refuses.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return inUse(supplier.name);
    next(err);
  }
});

export default router;
