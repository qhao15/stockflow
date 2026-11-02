import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { apiLimiter } from '../auth/rateLimit.js';
import { sendAppError } from '../services/errors.js';
import { getLowStock, getRevenue, getSummary, getTopProducts } from '../services/reports.js';

const router = Router();
const canSeeRevenue = requirePermission('reports.view');

router.use(apiLimiter);
router.use(requireAuth);

// GET /api/reports/summary - every role sees the counts; revenue only with reports.view.
router.get('/summary', async (req, res, next) => {
  try {
    res.json(await getSummary({ includeRevenue: req.user.permissions.includes('reports.view') }));
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/revenue?group=day|month&from=&to=
router.get('/revenue', canSeeRevenue, async (req, res, next) => {
  try {
    res.json(await getRevenue(req.query));
  } catch (err) {
    sendAppError(res, err, next);
  }
});

// GET /api/reports/top-products?by=quantity|revenue&from=&to=&limit=
router.get('/top-products', canSeeRevenue, async (req, res, next) => {
  try {
    res.json(await getTopProducts(req.query));
  } catch (err) {
    sendAppError(res, err, next);
  }
});

// GET /api/reports/low-stock?offset=&limit=
router.get('/low-stock', requirePermission('stock.view'), async (req, res, next) => {
  try {
    res.json(await getLowStock(req.query));
  } catch (err) {
    next(err);
  }
});

export default router;
