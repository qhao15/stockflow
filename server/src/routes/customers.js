import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { getCustomer, listCities, listCustomers } from '../services/customers.js';
import { listSalesOrders } from '../services/salesOrders.js';
import { validateContact } from '../validators/contact.js';

const router = Router();
const canView = requirePermission('customers.view');
const canManage = requirePermission('customers.manage');

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

// GET /api/customers?offset=&limit=&sort=&dir=&search=&city=&status= - also used by the
// customer picker (status=active, small limit).
router.get('/', canView, async (req, res, next) => {
  try {
    res.json(await listCustomers(req.query, paging(req.query)));
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/cities - for the city filter.
router.get('/cities', canView, async (req, res, next) => {
  try {
    res.json({ cities: await listCities() });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id - contact details and sales totals.
router.get('/:id', canView, async (req, res, next) => {
  const id = parseId(req.params.id);
  try {
    const customer = id && await getCustomer(id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/orders?offset=&limit=&status= - order history, newest first.
router.get('/:id/orders', canView, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Customer not found' });
  try {
    res.json(await listSalesOrders({ customerId: id, status: req.query.status }, paging(req.query)));
  } catch (err) {
    next(err);
  }
});

// POST /api/customers - the code (CUS-00042) comes from the id.
router.post('/', canManage, async (req, res, next) => {
  const { values, error } = validateContact(req.body);
  if (error) return res.status(400).json({ message: error });
  const columns = Object.keys(values);
  try {
    const [result] = await pool.query(
      `INSERT INTO customers (code, ${columns.join(', ')}) VALUES (UUID_SHORT(), ${columns.map(() => '?').join(', ')})`,
      columns.map((c) => values[c])
    );
    const id = result.insertId;
    await pool.query('UPDATE customers SET code = ? WHERE id = ?', [`CUS-${String(id).padStart(5, '0')}`, id]);
    res.status(201).json({ customer: await getCustomer(id) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/customers/:id - any fields, including isActive.
router.patch('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Customer not found' });
  const { values, error } = validateContact(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  const columns = Object.keys(values);
  if (columns.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const [result] = await pool.query(
      `UPDATE customers SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((c) => values[c]), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Customer not found' });
    res.json({ customer: await getCustomer(id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id - only a customer without orders. One with orders is kept
// (deactivate it instead), so its invoices and history stay complete.
router.delete('/:id', canManage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Customer not found' });
  const inUse = (name) => res.status(409).json({
    reason: 'in_use',
    message: `"${name}" has orders, so it can't be deleted. Deactivate it instead to hide it from new orders.`,
  });
  let customer;
  try {
    customer = await getCustomer(id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (customer.inUse) return inUse(customer.name);
    await pool.query('DELETE FROM customers WHERE id = ?', [id]);
    res.status(204).end();
  } catch (err) {
    // An order was created between the check and the delete; the foreign key refuses.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return inUse(customer.name);
    next(err);
  }
});

export default router;
