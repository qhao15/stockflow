import { Router } from 'express';
import { withTransaction } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { sendAppError } from '../services/errors.js';
import { cancelSalesOrder, createSalesOrder, getSalesOrder, listSalesOrders } from '../services/salesOrders.js';
import { buildInvoicePdf } from '../services/invoicePdf.js';
import { validateSalesOrder } from '../validators/salesOrder.js';
import { validateCancel } from '../validators/common.js';

const router = Router();
const canView = requirePermission('sales_orders.view');

router.use(apiLimiter);
router.use(requireAuth);

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET /api/sales-orders?offset=&limit=&sort=&dir=&status=&customerId=&warehouseId=&from=&to=&search=
router.get('/', canView, async (req, res, next) => {
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  try {
    res.json(await listSalesOrders(req.query, { offset, limit }));
  } catch (err) {
    next(err);
  }
});

// GET /api/sales-orders/:id - with its lines.
router.get('/:id', canView, async (req, res, next) => {
  const id = parseId(req.params.id);
  try {
    const salesOrder = id && await getSalesOrder(id);
    if (!salesOrder) return res.status(404).json({ message: 'Sales order not found' });
    res.json({ salesOrder });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales-orders/:id/invoice.pdf
router.get('/:id/invoice.pdf', canView, async (req, res, next) => {
  const id = parseId(req.params.id);
  try {
    const salesOrder = id && await getSalesOrder(id);
    if (!salesOrder) return res.status(404).json({ message: 'Sales order not found' });
    const pdf = await buildInvoicePdf(salesOrder);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${salesOrder.orderNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// POST /api/sales-orders { customerId, warehouseId, discount, note, items: [{ productId, quantity }] }
// Deducts the stock in the same transaction; 409 names the product that is short.
router.post('/', requirePermission('sales_orders.create'), async (req, res, next) => {
  const { values, error } = validateSalesOrder(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const salesOrder = await withTransaction((conn) => createSalesOrder(conn, values, req.user.id));
    res.status(201).json({ salesOrder });
  } catch (err) {
    sendAppError(res, err, next);
  }
});

// POST /api/sales-orders/:id/cancel { reason } - returns the stock.
router.post('/:id/cancel', requirePermission('sales_orders.cancel'), async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Sales order not found' });
  const { values, error } = validateCancel(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const salesOrder = await withTransaction((conn) => cancelSalesOrder(conn, id, values.reason, req.user.id));
    res.json({ salesOrder });
  } catch (err) {
    sendAppError(res, err, next);
  }
});

export default router;
