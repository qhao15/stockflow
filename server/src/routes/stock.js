import { Router } from 'express';
import { withTransaction } from '../db/pool.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { listMovements, listStock } from '../services/stock.js';
import { ADJUSTMENT_REASONS, StockError, adjustStock, transferStock } from '../services/stockLedger.js';
import { validateAdjustment, validateTransfer } from '../validators/stock.js';
import { apiLimiter } from '../auth/rateLimit.js';

const router = Router();
const canView = requirePermission('stock.view');

router.use(apiLimiter);
router.use(requireAuth);

const paging = (query) => ({
  offset: Math.max(0, Number.parseInt(query.offset, 10) || 0),
  limit: Math.min(500, Math.max(1, Number.parseInt(query.limit, 10) || 50)),
});

// Business-rule failures (not enough stock, inactive warehouse...) carry their own status.
function sendStockError(res, err, next) {
  if (err instanceof StockError) return res.status(err.status).json({ message: err.message, ...err.details });
  next(err);
}

// GET /api/stock?offset=&limit=&sort=&dir=&search=&categoryId=&status=&warehouseId=&lowStock=
router.get('/', canView, async (req, res, next) => {
  try {
    res.json(await listStock(req.query, paging(req.query)));
  } catch (err) {
    next(err);
  }
});

// GET /api/stock/adjustment-reasons
router.get('/adjustment-reasons', canView, (req, res) => {
  res.json({ reasons: Object.entries(ADJUSTMENT_REASONS).map(([value, label]) => ({ value, label })) });
});

// GET /api/stock/movements?productId=&warehouseId=&offset=&limit= - newest first.
router.get('/movements', canView, async (req, res, next) => {
  try {
    res.json(await listMovements(req.query, paging(req.query)));
  } catch (err) {
    next(err);
  }
});

// POST /api/stock/transfers { productId, fromWarehouseId, toWarehouseId, quantity, note }
router.post('/transfers', requirePermission('stock.transfer'), async (req, res, next) => {
  const { values, error } = validateTransfer(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const transfer = await withTransaction((conn) => transferStock(conn, { ...values, userId: req.user.id }));
    res.status(201).json({ transfer });
  } catch (err) {
    sendStockError(res, err, next);
  }
});

// POST /api/stock/adjustments { productId, warehouseId, countedQuantity, expectedQuantity, reason, note }
router.post('/adjustments', requirePermission('stock.adjust'), async (req, res, next) => {
  const { values, error } = validateAdjustment(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const adjustment = await withTransaction((conn) => adjustStock(conn, { ...values, userId: req.user.id }));
    res.status(201).json({ adjustment });
  } catch (err) {
    sendStockError(res, err, next);
  }
});

export default router;
