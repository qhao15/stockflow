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

const app = express();
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

// Hosted behind a proxy: req.ip must be the visitor's address, for rate limits and the audit log.
app.set('trust proxy', 1);

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

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// The built client, on the same address as the API. Any other path is a client-side route.
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(`${clientDist}/index.html`));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

export default app;
