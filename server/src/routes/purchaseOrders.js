import { Router } from 'express';
import { withTransaction } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { sendAppError } from '../services/errors.js';
import {
  approvePurchaseOrder, cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders,
  receivePurchaseOrder, updatePurchaseOrder,
} from '../services/purchaseOrders.js';
import { validatePurchaseOrder } from '../validators/purchaseOrder.js';
import { validateCancel } from '../validators/common.js';
import { audit, auditContext } from '../services/audit.js';

const router = Router();

router.use(apiLimiter);
router.use(requireAuth);

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// What the audit log shows for a PO: the header fields and its lines as one line of text.
const summary = (po) => ({
  supplier: po.supplier.name,
  warehouse: po.warehouse.code,
  expectedDate: po.expectedDate,
  note: po.note,
  total: po.totalAmount,
  lines: po.items.map((i) => `${i.sku} × ${i.quantity} @ ${i.unitCost}`).join('; '),
});

const logPo = (conn, req, po, entry) => audit(conn, auditContext(req), {
  entity: 'purchase_order', entityId: po.id, label: po.poNumber, ...entry,
});

// Runs a status change or edit in a transaction and answers with the updated PO.
const run = (status, action) => async (req, res, next) => {
  const id = parseId(req.params.id);
  if (req.params.id !== undefined && !id) return res.status(404).json({ message: 'Purchase order not found' });
  try {
    const purchaseOrder = await withTransaction((conn) => action(conn, id, req));
    if (purchaseOrder.error) return res.status(400).json({ message: purchaseOrder.error });
    res.status(status).json({ purchaseOrder });
  } catch (err) {
    sendAppError(res, err, next);
  }
};

// GET /api/purchase-orders?offset=&limit=&sort=&dir=&status=&supplierId=&warehouseId=&from=&to=&search=
router.get('/', requirePermission('purchase_orders.view'), async (req, res, next) => {
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  try {
    res.json(await listPurchaseOrders(req.query, { offset, limit }));
  } catch (err) {
    next(err);
  }
});

// GET /api/purchase-orders/:id - with its lines.
router.get('/:id', requirePermission('purchase_orders.view'), async (req, res, next) => {
  const id = parseId(req.params.id);
  try {
    const purchaseOrder = id && await getPurchaseOrder(id);
    if (!purchaseOrder) return res.status(404).json({ message: 'Purchase order not found' });
    res.json({ purchaseOrder });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchase-orders { supplierId, warehouseId, expectedDate, note, items: [{ productId, quantity, unitCost }] }
router.post('/', requirePermission('purchase_orders.create'), run(201, (conn, id, req) => {
  const { values, error } = validatePurchaseOrder(req.body);
  if (error) return { error };
  return createPurchaseOrder(conn, values, req.user.id).then(async (po) => {
    await logPo(conn, req, po, { action: 'create', after: summary(po) });
    return po;
  });
}));

// PUT /api/purchase-orders/:id - replace a draft (same body as POST plus the loaded version).
router.put('/:id', requirePermission('purchase_orders.create'), run(200, async (conn, id, req) => {
  const { values, error } = validatePurchaseOrder(req.body);
  if (error) return { error };
  const version = Number(req.body.version);
  if (!Number.isInteger(version)) return { error: 'version is required' };
  const before = await getPurchaseOrder(id, conn);
  const po = await updatePurchaseOrder(conn, id, values, version);
  await logPo(conn, req, po, { action: 'update', before: summary(before), after: summary(po) });
  return po;
}));

router.post('/:id/approve', requirePermission('purchase_orders.approve'), run(200, async (conn, id, req) => {
  const po = await approvePurchaseOrder(conn, id, req.user.id);
  await logPo(conn, req, po, { action: 'approve', changes: { status: ['draft', 'approved'] } });
  return po;
}));

router.post('/:id/receive', requirePermission('purchase_orders.receive'), run(200, async (conn, id, req) => {
  const po = await receivePurchaseOrder(conn, id, req.user.id);
  await logPo(conn, req, po, {
    action: 'receive', changes: { status: ['approved', 'received'], warehouse: po.warehouse.code, unitsReceived: po.unitCount },
  });
  return po;
}));

// POST /api/purchase-orders/:id/cancel { reason }
router.post('/:id/cancel', requirePermission('purchase_orders.cancel'), run(200, async (conn, id, req) => {
  const { values, error } = validateCancel(req.body);
  if (error) return { error };
  const before = await getPurchaseOrder(id, conn);
  const po = await cancelPurchaseOrder(conn, id, values.reason, req.user.id);
  await logPo(conn, req, po, { action: 'cancel', changes: { status: [before.status, 'cancelled'], reason: values.reason } });
  return po;
}));

export default router;
