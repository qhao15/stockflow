// The Express app: middleware and routes. index.js starts it; tests start their own
// copy on a free port.
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import accountRouter from './routes/account.js';
import categoriesRouter from './routes/categories.js';
import productsRouter from './routes/products.js';
import warehousesRouter from './routes/warehouses.js';
import stockRouter from './routes/stock.js';
import suppliersRouter from './routes/suppliers.js';
import purchaseOrdersRouter from './routes/purchaseOrders.js';
import customersRouter from './routes/customers.js';
import salesOrdersRouter from './routes/salesOrders.js';
import auditLogsRouter from './routes/auditLogs.js';
import reportsRouter from './routes/reports.js';
import { apiLimiter } from './auth/rateLimit.js';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi.js';

const app = express();
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

// Hosted behind proxies: req.ip must be the visitor's address, for rate limits and the audit log.
// TRUST_PROXY is how many proxies sit in front of the app; /api/health/ip shows what it gives.
// Too high would let a visitor pick their own address with a forged X-Forwarded-For header.
const trustProxy = Number(process.env.TRUST_PROXY ?? 1);
app.set('trust proxy', Number.isInteger(trustProxy) && trustProxy >= 0 ? trustProxy : 1);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/account', accountRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/warehouses', warehousesRouter);
app.use('/api/stock', stockRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/sales-orders', salesOrdersRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/reports', reportsRouter);

// The API documentation: /api/docs to read and try it, /api/openapi.json for tools.
app.get('/api/openapi.json', apiLimiter, (req, res) => res.json(openApiSpec));
app.use('/api/docs', apiLimiter, swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'StockFlow API' }));

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// The built client, on the same address as the API. Any other path is a client-side route.
app.use(express.static(clientDist));
app.get('*', apiLimiter, (req, res) => res.sendFile(`${clientDist}/index.html`));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

export default app;
