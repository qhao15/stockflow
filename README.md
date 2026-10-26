# StockFlow

A full-stack **Sales & Inventory Management** system built with React, Node.js and MySQL.

StockFlow tracks products across multiple warehouses, handles purchase orders from suppliers and sales orders to customers, and keeps every stock change traceable through a movement ledger instead of a single editable number.

> **Status:** in active development. The app shell, dashboard and API/database connection are done; the business modules are being built step by step (see [Roadmap](#roadmap)).

## Tech stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Frontend | React 18, Vite, Material UI (MUI), React Router, Axios |
| Backend  | Node.js, Express                             |
| Database | MySQL 8 / MariaDB 10.4+ (via `mysql2`)       |

## Planned features

- **Roles**: Admin (users, warehouses, settings), Manager (approves purchase orders, views reports), Staff (creates sales orders, checks stock)
- **Products**: SKU, category, price, unit, image, minimum stock level, bulk import from Excel
- **Warehouses & stock**: stock per product per warehouse, transfers between warehouses, low-stock alerts
- **Purchase orders**: `draft → approved → received`; receiving increases stock
- **Sales orders**: creating an order decreases stock, cancelling returns it; PDF invoices
- **Customers & suppliers**: contact info and order history
- **Dashboard**: revenue by day/month, top-selling products, low-stock list
- **Audit log**: who changed what and when

### Stock traceability

Stock is never edited directly. Every change (purchase received, sale, cancellation, transfer, adjustment) writes a row to `stock_movements` with its reason, so the current quantity in `stock` can always be explained and audited.

## Project structure

```
stockflow/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── api/            # Axios instance
│       ├── components/     # Layout (sidebar + top bar)
│       ├── pages/          # Dashboard and module pages
│       └── navItems.js     # Sidebar / module definitions
├── server/                 # Node.js + Express API
│   ├── .env.example        # Environment variable template
│   └── src/
│       ├── config/db.js    # MySQL pool + auto-create database
│       ├── routes/         # API routes
│       └── index.js        # App entry point
└── package.json            # Root scripts (run both apps together)
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- MySQL 8 or MariaDB 10.4+ running locally (e.g. MySQL Community Server or XAMPP)

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure the database

Copy the environment template and set your MySQL credentials:

```bash
cp server/.env.example server/.env
```

| Variable      | Default                 | Description                         |
| ------------- | ----------------------- | ----------------------------------- |
| `PORT`        | `5000`                  | API port                            |
| `DB_HOST`     | `localhost`             | MySQL host                          |
| `DB_PORT`     | `3306`                  | MySQL port                          |
| `DB_USER`     | `root`                  | MySQL user                          |
| `DB_PASSWORD` | *(empty)*               | MySQL password                      |
| `DB_NAME`     | `sales_inventory`       | Database name (created automatically) |
| `CLIENT_URL`  | `http://localhost:5173` | Allowed CORS origin                 |

The database is created automatically the first time the server starts.

### 3. Run

```bash
npm run dev
```

This starts both apps:

- Frontend: http://localhost:5173
- API: http://localhost:5000

The dashboard's **System status** card shows whether the API and database are connected.

## API

| Method | Endpoint      | Description                          |
| ------ | ------------- | ------------------------------------ |
| GET    | `/api/health` | API status and database connection   |

## Roadmap

- [x] Project setup, app layout and dashboard shell
- [ ] Database schema and seed data
- [ ] Authentication and role-based access (Admin / Manager / Staff)
- [ ] Products and categories (with Excel import)
- [ ] Warehouses, stock and transfers
- [ ] Purchase orders
- [ ] Sales orders and PDF invoices
- [ ] Customers and suppliers
- [ ] Dashboard charts and reports
- [ ] Audit log
