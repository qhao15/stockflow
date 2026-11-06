<p align="center">
  <img src="client/public/logo.svg" alt="StockFlow logo" width="96" height="96" />
</p>

<h1 align="center">StockFlow</h1>

<p align="center">
  A full-stack <b>Sales &amp; Inventory Management</b> system built with React, Node.js and MySQL.
</p>

<p align="center">
  <a href="https://github.com/qhao15/stockflow/actions/workflows/ci.yml"><img src="https://github.com/qhao15/stockflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

StockFlow tracks products across multiple warehouses, handles purchase orders from suppliers and sales orders to customers, and keeps every stock change traceable through a movement ledger instead of a single editable number.

**Live demo: [stockflow-ap0c.onrender.com](https://stockflow-ap0c.onrender.com)**. It runs on free hosting, so the first visit after a quiet spell can take about a minute while the server wakes up. Sign-up is closed, so use the [demo logins](#demo-logins).

> **Status:** in active development, version **0.4.0**. Authentication, role-based access, the database schema with demo data, products, warehouses with stock and transfers, purchase orders, sales orders with PDF invoices, customers and suppliers, the audit log, dashboard charts and reports, browser tests that run in CI, and a live deployment are done (see [Roadmap](#roadmap)).

## Tech stack

| Layer    | Technology                                             |
| -------- | ------------------------------------------------------ |
| Frontend | React 18, Vite, Material UI (MUI), AG Grid Community, Recharts, React Router, Axios |
| Backend  | Node.js, Express, ExcelJS (Excel import/export), PDFKit (PDF invoices), Multer (file uploads), express-rate-limit |
| Database | MySQL 8 / MariaDB 10.4+ (via `mysql2`)                 |
| Auth     | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |
| Testing  | Node.js test runner (API and services), Playwright (browser) |

## Features

### Available now

- **Accounts**: register, sign in and log out. Every page except Login and Register requires an account.
- **Session handling**: the session is restored on page reload, and an expired token automatically logs the user out and returns them to the page they were on after signing in again. If the server can't be reached, for example while it restarts, the app keeps the login and tries again instead of logging out. Signing in or out in one tab refreshes all other open tabs.
- **Roles**: Admin, Manager and Staff. The first registered account becomes Admin, later sign-ups become Staff, and `ALLOW_REGISTRATION=false` closes sign-up. Accounts with any role can also be created from the command line (see [Creating accounts](#creating-accounts)).
- **Role-based access**: each module and action requires a permission (see [Roles and permissions](#roles-and-permissions)). The API refuses requests without it, and the sidebar, dashboard and routes only show what the user's role allows.
- **User management** (Admin): list users, change roles, deactivate and reactivate accounts. Changes take effect on the user's next request.
- **Account settings** (every user, from the avatar menu): change your own name, email and password. Changing the password requires the current one and signs out all other devices.
- **App layout**: responsive sidebar that collapses to icons only (the choice is remembered), account menu with role and logout (asks to confirm first), mobile drawer.
- **Dashboard** (see [Reports and performance](#reports-and-performance)):
  - KPI cards with real figures: revenue against the same days of last month (Managers and Admins), orders, active products and low-stock products.
  - Revenue and gross profit chart with a day/month toggle, date range and a table view; top products by quantity or revenue; low-stock table.
  - Staff see the counts and low stock, but no revenue or profit. Admins also get a system status card with the API and database state.
- **Database schema and demo data**: all core tables, plus a seed script that simulates a year of business for a fictional electronics and computer accessories distributor (see [Demo data](#demo-data)).
- **Products and categories** (see [Products module](#products-module)):
  - Product list in AG Grid. Paging, sorting, search and filters (category, status, low stock) all run on the server.
  - Inline editing of prices and minimum stock, with optimistic locking.
  - Add/edit dialog.
  - Column show/hide, order and width saved per user on the server.
  - Excel export (respects the current filters) and all-or-nothing Excel import.
  - Category management.
- **Warehouses and stock** (see [Stock module](#stock-module)):
  - Stock grid with one column per warehouse; quantities at or below the product's minimum are highlighted.
  - Movement history per product, showing the order or transfer behind every change.
  - Transfers between warehouses and stock adjustments (stock take, damaged, lost, found) for Managers and Admins.
  - Warehouse management for Admins: add, edit, deactivate (only when empty), delete (only when never used).
- **Purchase orders** (Managers and Admins, see [Purchase orders module](#purchase-orders-module)):
  - List with status chips and filters (status, supplier, warehouse, date range, PO number or supplier search).
  - Draft form with a product search box, quantities, unit costs and live line totals.
  - Detail page with a history timeline and Edit / Approve / Receive / Cancel buttons shown by status and permission.
  - Receiving adds every line to the warehouse's stock in one transaction.
- **Sales orders and PDF invoices** (see [Sales orders module](#sales-orders-module)):
  - List with status chips and filters (status, warehouse, date range, order number or customer search).
  - New-order form with customer and product search, an optional discount and live totals. Available stock shows in the product search and on every line: for the chosen warehouse, or per warehouse until one is picked.
  - Detail page with a Download invoice button (everyone) and Cancel (Managers and Admins), which returns the stock.
- **Customers** (Staff, Managers and Admins):
  - List with search (name, code, contact, phone, email), city and status filters, and orders, revenue and last order per customer, sortable to find the best customers.
  - Detail page with contact details, totals (orders, revenue, average order, last order) and the order history.
  - Add and edit, deactivate a customer with orders (delete only one without), and "+ New customer" right inside the sales order form.
- **Audit log** (Admin, see [Audit log module](#audit-log-module)):
  - Every change in the app, with who made it, when, from which IP, and the values before and after.
  - Audit Log page with filters (record, type, action, user, dates) and rows that expand to a before → after table.
  - A History section on purchase order, sales order, customer and supplier pages, and a History button per product.
- **Suppliers** (Managers and Admins):
  - List with received POs, spend, open POs and last PO per supplier.
  - Detail page with contact details, totals (spend, average PO, open POs and their value) and the purchase order history, plus "New purchase order" with the supplier already picked.
  - Same add, edit, deactivate and delete rules as customers.

### Coming soon

- **Updating**: more updates are being planned.

### Stock traceability

Stock is never edited directly. Every change (purchase received, sale, cancellation, transfer, adjustment) writes a row to `stock_movements` with its reason, so the current quantity in `stock` can always be explained and audited.

## Database

The tables are defined in [`server/src/db/schema.js`](server/src/db/schema.js) and created automatically on startup. See the **[Entity Relationship Diagram](ERD.md)** for all tables, columns and relationships.

| Area | Tables | Notes |
| ---- | ------ | ----- |
| Accounts | `users`, `user_preferences` | Role is a column; what each role may do is defined in code (see [Roles and permissions](#roles-and-permissions)). Preferences hold per-user UI settings as JSON |
| Catalog | `categories`, `products` | SKU is unique; `min_stock` drives low-stock alerts; `version` for optimistic locking on edits |
| Warehouses | `warehouses`, `stock` | `stock` has one row per product per warehouse, with `CHECK (quantity >= 0)` and a `version` column |
| Stock ledger | `stock_movements`, `stock_transfers` | Signed `quantity_change`, `balance_after`, type, and a reference to the order or transfer that caused it |
| Buying | `suppliers`, `purchase_orders`, `purchase_order_items` | Status `draft → approved → received` (or `cancelled`), with who approved/received/cancelled and when; `version` for draft edits. Supplier codes (`SUP-001`) are generated; a supplier with POs can't be deleted |
| Selling | `customers`, `sales_orders`, `sales_order_items` | Status `completed` or `cancelled`; the unit price and unit cost are copied onto items, so later price changes don't rewrite old invoices and profit can be reported. Customer codes (`CUS-00001`) are generated; a customer with orders can't be deleted |
| Audit | `audit_logs` | Who did what to which record, with old and new values as JSON |

Design rules:

- **`stock` always equals the sum of its movements.** The quantity and its movement row are written in the same transaction. The seed script verifies this after every run.
- **Database constraints are the last line of defence.** Even if application code has a bug, `CHECK` constraints stop negative stock and zero-quantity order lines.
- **Money uses `DECIMAL`, never floats.**
- **Indexes:** beyond primary, unique and foreign-key indexes, one reporting index is added, `sales_orders(status, order_date)`, chosen by measuring on the large seed (see [Reports and performance](#reports-and-performance)).

## Demo data

The seed script fills the database by **simulating a year of business** day by day rather than inserting random rows:

- Opening stock in 3 warehouses (Hanoi, Ho Chi Minh City, Da Nang).
- Daily sales orders: busier on weekdays and at the end of the year, growing over time, with popular items (cables, mice) selling far more than expensive ones.
- About 3% of orders are cancelled, which returns their stock.
- When stock drops below its minimum, it's either transferred from another warehouse or reordered from the supplier. Purchase orders are approved 1–4 days later and received a few days after that, so the newest ones are still waiting as drafts or approved orders.

Every stock change in the simulation writes a movement, so the ledger is consistent from the start. The random generator is seeded, so the same options always produce the same data.

```bash
npm run seed --prefix server                      # 190 products, 10,000 sales orders
npm run seed --prefix server -- --force           # replace existing data
npm run seed --prefix server -- --products 50000 --orders 100000 --force   # large data set for performance testing
```

The seed replaces all business data but keeps user accounts. It creates (or resets) these demo accounts, all with the password `demo1234`. That password is public, so on a non-local database the seed refuses to run unless `SEED_PASSWORD` sets a different one:

| Name         | Email                    | Role    |
| ------------ | ------------------------ | ------- |
| Admin        | `admin@stockflow.demo`   | Admin   |
| Nguyen Van A | `manager@stockflow.demo` | Manager |
| Bui Van B    | `staff@stockflow.demo`   | Staff   |
| Do Van C     | `staff2@stockflow.demo`  | Staff   |

Product brands are real; suppliers, customers and people are fictional. SKUs follow `CATEGORY-BRAND-MODEL-VARIANT`, for example `LAP-DELL-XPS13-16-512` or `CMP-ASUS-RTX4090-ROG`.

## Products module

- **Server-side grid.** The product list uses AG Grid's infinite row model. The grid asks the API for one page at a time with the current sort and filters, so the browser never loads the whole catalog. Sort columns are checked against a whitelist on the server, and search text is escaped for `LIKE`.
- **Inline editing with optimistic locking.**
  - Double-clicking a price or min stock opens a number editor.
  - Each save sends the product's `version`, and the update runs as `UPDATE ... WHERE id = ? AND version = ?`.
  - If someone else saved in between, 0 rows change. The API returns `409` with the current product, and the grid shows the latest values instead of silently overwriting them.
- **Same rules everywhere.** The form, inline edits and the Excel import share one validator, `server/src/validators/product.js`, so a row that imports is exactly a row the form would accept.
- **All-or-nothing import.**
  - The whole file is validated first, including SKUs repeated within the file.
  - If any row is wrong, nothing is saved and the user gets a list of problems by row and column.
  - Otherwise every row is written in one transaction: an existing SKU updates that product, a new SKU creates one.
  - Column order doesn't matter, and an exported file can be edited and imported again.
- **Per-user columns.** Hidden columns, order and width are saved in `user_preferences`, so they follow the user to any browser.
- **Code splitting.** The Products page, which includes AG Grid, loads only when someone opens it, which keeps the main bundle small.

## Stock module

- **One function changes stock.** `changeStock(conn, {...})` in [`server/src/services/stockLedger.js`](server/src/services/stockLedger.js) locks the stock row, refuses to go below 0, updates the quantity and writes the `stock_movements` row, all in the caller's transaction. Transfers and adjustments use it now; receiving purchase orders and selling will use it too.
- **Row locks against double-spending.** A transfer locks both stock rows with `SELECT ... FOR UPDATE` before checking the quantity. Two people moving the last 5 units at the same moment are handled one after the other: the first succeeds, the second gets `409 Not enough stock`.
- **No deadlocks between opposite transfers.** Rows are always locked in the same order (lowest warehouse id first), so Hanoi → HCM and HCM → Hanoi at the same time wait for each other instead of deadlocking. If MySQL still reports a deadlock, the whole transaction is retried.
- **All or nothing.** The `transfer_out`, the `transfer_in` and the transfer record are written in one transaction; if anything fails half-way, nothing is kept.
- **Adjustments don't overwrite changes.** The dialog sends the quantity the user saw (`expectedQuantity`). If stock changed while they were counting, for example because of a sale, the adjustment is refused instead of silently undoing it.
- **Low stock** means at or below the product's `min_stock` in an active warehouse (a warehouse without a stock row counts as 0). The Products and Stock pages share the same rule.
- **Warehouses.** A warehouse can only be deactivated when it is empty, and inactive warehouses can't receive stock. Deactivating locks the warehouse row, and transfers share-lock it, so the two can't overlap.
- **Tests.** [`server/tests/stock.test.js`](server/tests/stock.test.js) runs against a real database (`npm test --prefix server`): two concurrent transfers of the last units, 20 transfers in opposite directions at once, a failure half-way, stock never below 0, and a stale adjustment. After each test it checks that every stock row equals the sum of its movements.

## Purchase orders module

- **Guarded status changes.** Each step is a single `UPDATE ... WHERE id = ? AND status = '<expected>'`. If it changes 0 rows, someone else got there first, and the API explains why (`409`: already approved, already received, cancelled).
- **Receiving can't add stock twice.** The `approved → received` update runs first, inside the same transaction as the stock changes. A second click or another tab waits for the row lock, then finds the PO already received and stops before touching stock.
- **All or nothing.** Every line goes through the shared `changeStock(...)`, writing a `purchase_receipt` movement linked to the PO. An error on any line rolls back the whole receipt, including the status change, so the PO stays approved and can be received again.
- **No deadlocks between receipts.** Lines are locked in product order, so two receipts with overlapping products wait for each other instead of deadlocking.
- **Draft edits use optimistic locking**, like products: saving sends the loaded `version`, and an outdated save gets `409` instead of overwriting someone else's changes. Saving replaces all lines and recalculates the total.
- **Exact money.** Line totals and the order total are calculated in cents, and unit costs are validated as text, so `3 × 0.29` is exactly `0.87`.
- **Tests** ([`server/tests/purchaseOrders.test.js`](server/tests/purchaseOrders.test.js)): two receives of the same PO at the same moment (stock added once), an error on line 2 (line 1 rolled back too), the status rules, an outdated draft edit, and exact totals.
- **Not included yet:** partial deliveries (receiving 30 of 50 now and the rest later) and updating the product's cost price from the last purchase.

## Sales orders module

- **No overselling.** Creating an order deducts its stock in the same transaction, through the shared `changeStock(...)`, which locks each stock row with `SELECT ... FOR UPDATE` before checking it. If two people sell the last unit at the same moment, one succeeds and the other gets `409` with "Only N × SKU left in <warehouse>" (or "out of stock").
- **All or nothing.** If any line is short, nothing is deducted and no order is saved.
- **Consistent lock order.** Lines are deducted in product-id order, the same order receipts and other orders use, so orders with overlapping products wait for each other instead of deadlocking.
- **Prices come from the server.** The client sends only products and quantities. The unit price (current sale price) and unit cost are copied onto each line, so later price changes never rewrite old invoices, and profit reports can use the cost at the time of sale. An optional order discount can't exceed the subtotal.
- **Cancelling returns the stock once.** A guarded `UPDATE ... WHERE status = 'completed'` runs first; a second cancel (another tab, a double click) finds it already cancelled and stops. Returned stock is written as `sale_cancel` movements linked to the order.
- **PDF invoices** are generated on the server with PDFKit (`GET /api/sales-orders/:id/invoice.pdf`): seller header, bill-to and ship-from, lines with SKUs, subtotal, discount, total, page numbers, and a CANCELLED stamp on cancelled orders. Noto Sans is embedded so Vietnamese names print correctly. The seller details can be set with the `COMPANY_*` variables.
- **Tests** ([`server/tests/salesOrders.test.js`](server/tests/salesOrders.test.js)): two orders for the last unit at the same moment, an order with one short line, exact totals and prices copied onto lines, a double cancel, and invoice generation. Each checks that stock still equals the sum of its movements.

## Customers and suppliers module

- **Generated codes.** A new customer gets `CUS-00042` and a new supplier `SUP-010` from its id, so nobody has to invent codes.
- **Figures that add up.** A customer's orders and revenue count completed orders only. A supplier's spend counts received POs only, and open POs (draft or approved) are shown separately with their value. Cancelled orders still appear in the history (struck through) and as a separate count. The list's figures come from one grouped subquery, so sorting everyone by revenue or spend stays a single query.
- **History is never broken.** A customer or supplier with any order, even a cancelled one, can't be deleted (`409`), only deactivated: they disappear from the order forms but stay on old orders and invoices, and a new order for them is refused.
- **Quick add while selling.** The customer search in the sales order form has "+ New customer"; the new customer is selected straight away. Staff can do this, because they take the orders.
- **Shared validation** for customers and suppliers ([`server/src/validators/contact.js`](server/src/validators/contact.js)): name required, email optional but valid and stored lowercase, phone digits with `+ - ( )` and spaces.

## Audit log module

- **Same transaction as the change.** `audit(conn, ctx, {...})` in [`server/src/services/audit.js`](server/src/services/audit.js) writes on the connection of the change it records. A change that rolls back (an error half-way, an outdated edit, an order for stock that isn't there) leaves no audit row; a committed change always has one. Routes that used to write with a single query now run in a transaction for this.
- **Only what changed.** Updates store `{ "salePrice": [15.5, 18] }` for the changed fields only, worked out from the record before and after. A new record is `[null, value]`, a deleted one `[value, null]`. Bookkeeping fields (`version`, `updatedAt`, totals) are left out, and an edit that changes nothing writes nothing.
- **Never a secret.** Fields named like password, hash, token or secret are dropped whatever the caller passes; a password change is logged only as "password changed".
- **What is logged:** products (create, edit, delete, Excel import as one row with the SKUs), categories, warehouses, stock transfers and adjustments, purchase orders (create, edit, approve, receive, cancel), sales orders (create, cancel), customers, suppliers, user roles and active status, and changes to your own account.
- **Readable later.** Each row keeps the record's label at the time (SKU, PO number, name), so the log still makes sense after a record is renamed or deleted.
- **Admin only**, both the Audit Log page and the History sections. The demo data is loaded directly by the seed, so the log starts empty and fills as the app is used.
- **Tests** ([`server/tests/audit.test.js`](server/tests/audit.test.js)): one row per committed change with only the changed fields; no row for a rolled-back change, an outdated edit or an oversold order; no password or hash ever stored; orders, stock moves and role changes logged with their details; filters; non-admins get `403`.

## Reports and performance

- **What counts.** Cancelled orders are left out of every figure. Revenue is the order total after discount; gross profit subtracts the unit cost copied onto each line at the time of sale, so later price changes don't rewrite past profit. Totals are added up in cents.
- **No gaps.** Days or months without sales appear as 0, so the chart's time axis stays true.
- **A fair comparison.** This month's revenue is compared with the same days of last month, because a month in progress is never a fair match for a whole one.
- **Permissions on the server.** `/api/reports/summary` leaves the revenue fields out for roles without `reports.view`, and the revenue reports answer `403`. Hiding the chart is not the protection.

### Measuring the index

Measured with [`server/scripts/measure-reports.js`](server/scripts/measure-reports.js) on a separate database with 99,999 orders, 225,803 order lines and 50,000 products, on MariaDB 10.4. Each figure is the median of 3 runs, with the index dropped and then added back on the same data.

**The buffer pool was XAMPP's default 16 MB against a 134 MB database**, so many reads go to disk. Timings varied noticeably between rounds, so treat these as rough, not as a benchmark of what a properly configured server would do.

| Report | Without index | With `(status, order_date)` |
| ------ | ------------- | ---------------------------- |
| Revenue per day, 30 days | 356 ms | 89 ms |
| Top products, 30 days | 6,008 ms | 2,359 ms |
| Top products, 90 days | 2,620 ms | 1,126 ms |
| Revenue per month, 1 year | 2,024 ms | 2,257 ms |
| Top products, 1 year | 7,827 ms | 16,892 ms |
| Summary (KPI cards) | 1,144 ms | 971 ms |
| Low stock | 1,632 ms | 1,672 ms |

`EXPLAIN` shows the change directly: a 30-day report went from `type=ALL` over about 99,000 orders to `type=range` over about 9,300.

What this shows:

- **Short ranges benefit,** which is what the dashboard asks for: it offers 7, 30 and 90 days for top products and defaults to 30 days for revenue.
- **The index is not a free win.** A full year covers nearly all orders, so a date filter can't skip much, and top products over a year was no better (one round measured 28 s without the index and 3.7 s with it, another 7.8 s and 16.9 s, so the cache dominates). The dashboard doesn't offer that range for top products.
- **Summary and low stock are unaffected,** as expected: they don't filter orders by date. The time goes on checking 50,000 products against their stock.

To repeat it:

```bash
DB_NAME=stockflow_perf npm run seed --prefix server -- --products 50000 --orders 100000 --force
DB_NAME=stockflow_perf npm run measure-reports --prefix server
```

## Roles and permissions

Routes check **permissions**, not role names. The mapping from role to permissions lives in one file, [`server/src/auth/permissions.js`](server/src/auth/permissions.js), so changing what a role can do is a one-line change. `/api/auth/me` returns the user's permission list, and the client uses it only to decide what to show. Every API request is checked again on the server, so hiding a button is never the only protection.

| Module            | Staff                  | Manager                              | Admin |
| ----------------- | ---------------------- | ------------------------------------ | ----- |
| Products          | view, without cost or margin | view with cost and margin, manage | all   |
| Stock             | view                   | view, transfer, adjust               | all   |
| Purchase orders   | –                      | view, create, approve, receive, cancel | all   |
| Sales orders      | view, create           | view, create, cancel                 | all   |
| Customers         | view, manage           | view, manage                         | all   |
| Suppliers         | –                      | view, manage                         | all   |
| Reports / revenue | –                      | view                                 | all   |
| Audit log, users, warehouses, settings | – | –                                  | all   |

Admins can't demote or deactivate themselves, so the system always keeps at least one active admin.

## Authentication design

- Passwords are hashed with bcrypt; plain-text passwords are never stored.
- Login returns a signed JWT (default lifetime 1 day) that the client sends as `Authorization: Bearer <token>`.
- On every protected request the server re-loads the user from the database, so a deactivated account or a changed role takes effect immediately instead of when the token expires.
- Login answers "Invalid email or password" for both unknown emails and wrong passwords, so it can't be used to find out which emails have accounts.
- `requirePermission('purchase_orders.approve')` middleware protects routes. It reads the role from the freshly loaded user, not from the token.
- Changing or resetting a password records `password_changed_at`. Tokens issued before that moment are refused, so a stolen or forgotten session stops working, while the tab that made the change gets a fresh token.
- The public health check says only whether the API and database are up. Database name, version and error text aren't exposed: details need Admin, and errors go to the server log.
- The password-change time and the token's issue time are compared by the database, so a password reset run from a computer in another time zone than the server can't sign out every new login.
- Sign-up can be closed with `ALLOW_REGISTRATION=false`; accounts then come from `npm run create-user`. The live demo has it closed.
- Post-login redirects only accept same-site paths, so a crafted `?redirect=` link can't send users to another website.
- **Rate limiting** ([`server/src/auth/rateLimit.js`](server/src/auth/rateLimit.js)): 10 failed login or register attempts per IP in 15 minutes, which slows down password guessing (successful logins don't count), and 300 requests per minute for the rest of the API. Over the limit the API answers `429` with a message the client shows.

## Project structure

```
stockflow/
├── .github/
│   ├── workflows/ci.yml        # GitHub Actions: client build + server checks against MySQL
│   └── dependabot.yml          # Monthly minor/patch dependency update PRs
├── client/                     # React frontend (Vite)
│   ├── public/logo.svg         # Logo / favicon
│   └── src/
│       ├── auth/               # AuthContext, login and permission guards, login/register layout
│       ├── components/         # Layout, Logo, pickers, ContactDialog, DetailParts, AuditHistory / AuditChanges
│       ├── lib/                # api.js (Axios, token, 401 handling), agGrid.js, flash.js, format.js
│       ├── pages/              # Login, Register, Dashboard, Account, Users
│       │   ├── admin/          # Users & Settings page, warehouses tab
│       │   ├── auditLog/       # Audit Log page with filters and before/after rows
│       │   ├── customers/      # Customer list and detail page with totals and order history
│       │   ├── dashboard/      # Revenue and top-products charts, low-stock table
│       │   ├── suppliers/      # Supplier list and detail page with spend, open POs and PO history
│       │   ├── products/       # Product grid, product/import dialogs, categories tab
│       │   ├── purchaseOrders/ # PO list, draft form, detail page with status actions
│       │   ├── salesOrders/    # Order list, new-order form with available stock, detail with invoice download
│       │   └── stock/          # Stock grid, movement history, transfer/adjust dialogs
│       ├── navItems.js         # Sidebar / module definitions
│       └── theme.js            # MUI theme
├── server/                     # Node.js + Express API
│   ├── .env.example            # Environment variable template
│   ├── assets/fonts/           # Noto Sans (SIL Open Font License) for PDF invoices
│   ├── scripts/
│   │   ├── create-user.js      # Create an account with a given role from the CLI
│   │   ├── seed.js             # Simulate a year of business as demo data
│   │   ├── seed-data.js        # Product catalog, suppliers, warehouses, demo accounts
│   │   └── measure-reports.js  # Times the reports and prints EXPLAIN, for the large seed
│   ├── src/
│   │   ├── auth/               # permissions.js (role -> permission matrix), middleware.js (JWT + permission checks)
│   │   ├── db/                 # pool.js (MySQL pool + auto-create database), schema.js (tables, created on startup)
│   │   ├── routes/             # API routes (health, auth, users, account, categories, products, warehouses, stock, suppliers, customers, purchase and sales orders, audit logs, reports)
│   │   ├── services/           # Product, stock and order logic, stock ledger (changeStock, transfers, adjustments), audit log, reports, Excel, PDF invoices
│   │   ├── validators/         # common.js (email/password, cancel reason), product.js (shared by the API and the import), stock.js, orders, contact.js
│   │   ├── app.js              # Express app: middleware and routes (tests start their own copy)
│   │   └── index.js            # Entry point: checks .env, prepares the database, starts the server
│   └── tests/                  # API and service tests against MySQL, incl. concurrency (npm test)
├── e2e/                        # Playwright browser tests (npm run test:e2e)
├── ERD.md                      # Entity Relationship Diagram
├── SECURITY.md                 # How to report a vulnerability
├── scripts/wait-for-api.js     # Lets `npm run dev` start the frontend once the API is up
├── playwright.config.js        # Playwright settings: site address, browser, starting the app
└── package.json                # Root scripts (run both apps together, browser tests)
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (required by React Router 7)
- MySQL 8 or MariaDB 10.4+ running locally (e.g. MySQL Community Server or XAMPP)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/stockflow.git
cd stockflow
npm run install:all
```

### 2. Configure the server

Copy the environment template:

```bash
cp server/.env.example server/.env        # macOS / Linux / Git Bash
copy server\.env.example server\.env      # Windows Command Prompt
```

Then open `server/.env`, set your MySQL credentials and replace `JWT_SECRET` with a long random string. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variable         | Default                 | Description                                          |
| ---------------- | ----------------------- | ---------------------------------------------------- |
| `PORT`           | `5000`                  | API port                                             |
| `DB_HOST`        | `localhost`             | MySQL host                                           |
| `DB_PORT`        | `3306`                  | MySQL port                                           |
| `DB_USER`        | `root`                  | MySQL user                                           |
| `DB_PASSWORD`    | *(empty)*               | MySQL password                                       |
| `DB_NAME`        | `sales_inventory`       | Database name (created automatically)                |
| `CLIENT_URL`     | `http://localhost:5173` | Allowed CORS origin                                  |
| `TIME_ZONE`      | `+07:00`                | The business's time zone, as a whole-hour offset: what "today" and "this month" mean in reports, invoice dates, and how times are stored. Applied to Node and to every database session, so it doesn't depend on the computer or server |
| `TRUST_PROXY`    | `1`                     | How many proxies sit in front of the server when hosted, so rate limits and the audit log see each visitor's address; `GET /api/health/ip` shows the result |
| `JWT_SECRET`     | *(required)*            | Secret used to sign login tokens; the server won't start without it |
| `JWT_EXPIRES_IN` | `1d`                    | How long a login lasts (e.g. `8h`, `7d`)             |
| `ALLOW_REGISTRATION` | `true`                | `false` closes sign-up, for a public site; accounts then come from `npm run create-user` |
| `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_PHONE`, `COMPANY_EMAIL`, `COMPANY_TAX_ID` | fictional | Seller details printed on PDF invoices |

The database and its tables are created automatically the first time the server starts, so no manual SQL is needed.

### 3. Run

```bash
npm run dev
```

This starts both apps (the frontend waits until the API accepts connections):

- Frontend: http://localhost:5173
- API: http://localhost:5000

Open the frontend and you'll land on the **Login** page. Choose **Create one** to register; on a fresh database the first account becomes **Admin**.

To fill the app with data and get a demo account for each role, run the seed (see [Demo data](#demo-data)):

```bash
npm run seed --prefix server
```

### Creating accounts

To create an account with a specific role, or update an existing account's role and password:

```bash
npm run create-user --prefix server -- <admin|manager|staff> <email> <password> ["Full Name"]

# examples
npm run create-user --prefix server -- manager manager@example.com YourPassword123 "Manager Name"
npm run create-admin --prefix server -- admin@example.com YourPassword123     # shortcut for an Admin
```

Passwords must be at least 8 characters. This is also the way to reset a forgotten password; resetting it signs that account out everywhere.

## API

| Method | Endpoint             | Auth | Description                                                         |
| ------ | -------------------- | ---- | ------------------------------------------------------------------- |
| GET    | `/api/health`        | –    | Whether the API and database are up (`503` if the database isn't); no names, versions or error text |
| GET    | `/api/health/details` | `settings.manage` | Database name and version, for the Admin's status card |
| GET    | `/api/health/ip`     | –    | The address the server sees for you, and the proxy chain, for setting `TRUST_PROXY` |
| GET    | `/api/auth/options`  | –    | Whether sign-up is open |
| POST   | `/api/auth/register` | –    | Create an account and sign in (first account becomes Admin, later ones Staff) |
| POST   | `/api/auth/login`    | –    | Sign in; returns `{ token, user }`                                  |
| GET    | `/api/auth/me`       | JWT  | The current user, including their `permissions`                    |
| GET    | `/api/users`         | `users.manage` | List all users                                            |
| PATCH  | `/api/users/:id`     | `users.manage` | Change `role` and/or `isActive`                           |
| PATCH  | `/api/account`       | JWT  | Change own `name` and `email`                                       |
| PUT    | `/api/account/password` | JWT | Change own password (`currentPassword`, `newPassword`); returns a new token |
| GET/PUT | `/api/account/preferences/:key` | JWT | Read / save a UI setting for the current user (e.g. grid columns) |
| GET    | `/api/categories`    | `products.view` | Categories with their product counts                     |
| POST   | `/api/categories`    | `products.manage` | Create a category (`code`, `name`, `description`)      |
| PATCH  | `/api/categories/:id` | `products.manage` | Edit a category                                       |
| DELETE | `/api/categories/:id` | `products.manage` | Delete a category that has no products                |
| GET    | `/api/products`      | `products.view` | List with `offset`, `limit`, `sort`, `dir`, `search`, `categoryId`, `brand`, `status`, `lowStock`; returns `{ rows, total }` |
| GET    | `/api/products/options` | `products.view` | Categories, units and brands for filters and forms    |
| GET    | `/api/products/:id`  | `products.view` | One product, with total stock                            |
| POST   | `/api/products`      | `products.manage` | Create a product                                       |
| PATCH  | `/api/products/:id`  | `products.manage` | Edit any fields; requires the `version` that was loaded (`409` if someone else saved first) |
| DELETE | `/api/products/:id`  | `products.manage` | Delete a product that was never used; one with sales, purchase or stock history returns `409` (set it inactive instead) |
| GET    | `/api/products/export` | `products.view` | Excel file of the products matching the same filters as the list |
| GET    | `/api/products/import-template` | `products.manage` | Excel template with instructions and the category list |
| POST   | `/api/products/import` | `products.manage` | Upload `.xlsx` (field `file`); all rows validated first, all or nothing |
| GET    | `/api/warehouses`    | `stock.view` | Warehouses with units and number of products held |
| POST   | `/api/warehouses`    | `warehouses.manage` | Create a warehouse (`code`, `name`, `city`, `address`) |
| PATCH  | `/api/warehouses/:id` | `warehouses.manage` | Edit, or set `isActive`; deactivating a warehouse that still holds stock returns `409` |
| DELETE | `/api/warehouses/:id` | `warehouses.manage` | Delete a warehouse that was never used; one with history returns `409` |
| GET    | `/api/stock`         | `stock.view` | Products with their quantity per warehouse: `offset`, `limit`, `sort` (incl. `w<warehouseId>`), `dir`, `search`, `categoryId`, `ids`, `warehouseId`, `lowStock` |
| GET    | `/api/stock/movements` | `stock.view` | The ledger for `productId` and/or `warehouseId`, newest first, with the order or transfer number |
| GET    | `/api/stock/adjustment-reasons` | `stock.view` | Reasons for adjustments |
| POST   | `/api/stock/transfers` | `stock.transfer` | Move `quantity` of `productId` from `fromWarehouseId` to `toWarehouseId`; `409` if there isn't enough stock |
| POST   | `/api/stock/adjustments` | `stock.adjust` | Set `productId` in `warehouseId` to `countedQuantity` with a `reason`; `409` if stock no longer equals `expectedQuantity` |
| GET    | `/api/suppliers`     | `suppliers.view` | List with received POs, spend, open POs and last PO: `offset`, `limit`, `sort`, `dir`, `search`, `status` |
| GET    | `/api/suppliers/:id` | `suppliers.view` | Contact details and totals (received, spend, average, open POs and value, cancelled, first and last PO) |
| GET    | `/api/suppliers/:id/purchase-orders` | `suppliers.view` + `purchase_orders.view` | Purchase order history, newest first: `offset`, `limit`, `status` |
| POST   | `/api/suppliers`     | `suppliers.manage` | Create (same fields as customers); the code is generated |
| PATCH  | `/api/suppliers/:id` | `suppliers.manage` | Edit any fields, or set `isActive` |
| DELETE | `/api/suppliers/:id` | `suppliers.manage` | Delete a supplier without purchase orders; one with POs returns `409` (deactivate instead) |
| GET    | `/api/customers`     | `customers.view` | List with orders, revenue and last order: `offset`, `limit`, `sort`, `dir`, `search` (code, name, contact, phone, email), `city`, `status` |
| GET    | `/api/customers/cities` | `customers.view` | Cities for the filter |
| GET    | `/api/customers/:id` | `customers.view` | Contact details and totals (orders, cancelled, revenue, average order, first and last order) |
| GET    | `/api/customers/:id/orders` | `customers.view` | Order history, newest first: `offset`, `limit`, `status` |
| POST   | `/api/customers`     | `customers.manage` | Create (`name`, `contactName`, `email`, `phone`, `city`, `address`, `notes`); the code is generated |
| PATCH  | `/api/customers/:id` | `customers.manage` | Edit any fields, or set `isActive` |
| DELETE | `/api/customers/:id` | `customers.manage` | Delete a customer without orders; one with orders returns `409` (deactivate instead) |
| GET    | `/api/purchase-orders` | `purchase_orders.view` | List with `offset`, `limit`, `sort`, `dir`, `status`, `supplierId`, `warehouseId`, `from`, `to`, `search` |
| GET    | `/api/purchase-orders/:id` | `purchase_orders.view` | One PO with its lines and who created / approved / received / cancelled it |
| POST   | `/api/purchase-orders` | `purchase_orders.create` | Create a draft: `supplierId`, `warehouseId`, `expectedDate`, `note`, `items: [{ productId, quantity, unitCost }]` |
| PUT    | `/api/purchase-orders/:id` | `purchase_orders.create` | Replace a draft (same body plus `version`; `409` if someone else saved first or it's no longer a draft) |
| POST   | `/api/purchase-orders/:id/approve` | `purchase_orders.approve` | Draft → approved |
| POST   | `/api/purchase-orders/:id/receive` | `purchase_orders.receive` | Approved → received; adds every line to the warehouse's stock in one transaction |
| POST   | `/api/purchase-orders/:id/cancel` | `purchase_orders.cancel` | Draft or approved → cancelled, with a required `reason` |
| GET    | `/api/sales-orders`  | `sales_orders.view` | List with `offset`, `limit`, `sort`, `dir`, `status`, `customerId`, `warehouseId`, `from`, `to`, `search` |
| GET    | `/api/sales-orders/:id` | `sales_orders.view` | One order with its lines |
| GET    | `/api/sales-orders/:id/invoice.pdf` | `sales_orders.view` | The PDF invoice |
| POST   | `/api/sales-orders`  | `sales_orders.create` | Create and complete an order: `customerId`, `warehouseId`, `discount`, `note`, `items: [{ productId, quantity }]`; deducts stock, `409` if any line is short |
| POST   | `/api/sales-orders/:id/cancel` | `sales_orders.cancel` | Cancel with a required `reason`; returns the stock |
| GET    | `/api/audit-logs`    | `audit_log.view` | Newest first: `offset`, `limit`, `userId`, `entity`, `entityId` (one record's history), `action`, `from`, `to`, `search` (record label) |
| GET    | `/api/audit-logs/options` | `audit_log.view` | Record types, actions and users for the filters |
| GET    | `/api/reports/summary` | JWT | KPI figures; revenue fields only with `reports.view` |
| GET    | `/api/reports/revenue` | `reports.view` | Revenue, gross profit and orders per period: `group` (`day` or `month`), `from`, `to` |
| GET    | `/api/reports/top-products` | `reports.view` | Best sellers: `by` (`quantity` or `revenue`), `from`, `to`, `limit` |
| GET    | `/api/reports/low-stock` | `stock.view` | Products at or below their minimum, per warehouse: `offset`, `limit` |

Missing or expired token → `401`; valid token without the permission → `403`.

Logging out is handled on the client by discarding the token.

## Tests

```bash
npm test --prefix server
```

The tests run against the database in `server/.env`. Each file creates its own temporary users, products, warehouses and so on, with unique codes, and deletes them afterwards, so existing data is left alone. HTTP tests start the API on a free port, so they don't clash with a running dev server.

| File | What it proves |
| ---- | -------------- |
| `auth.test.js` | Sign-ups become Staff; passwords are bcrypt-hashed; login doesn't reveal which emails exist; missing, invalid, expired and forged tokens get `401`; the role comes from the database, not the token; deactivating or changing a role works on the next request; a password change signs out other sessions |
| `rateLimit.test.js` | Successful logins never count; the 11th failed attempt gets `429` |
| `permissions.test.js` | Each role has exactly the permissions in the table above, and every route answers `403` exactly when it should; admins can't demote themselves |
| `customers.test.js` | Generated codes; validation; search; totals leave out cancelled orders; a customer with orders can only be deactivated |
| `audit.test.js` | One audit row per committed change, with only the changed fields; none for a rolled-back change; no password or hash ever stored; orders, stock moves and role changes logged with details; filters; Admin only |
| `reports.test.js` | Revenue and profit per day and month with exact cents; cancelled orders left out; empty days as 0; top products; low stock; Staff never get revenue |
| `suppliers.test.js` | Spend counts received POs, open POs are separate, cancelled count for neither; delete vs deactivate; a new PO for an inactive supplier is refused; Staff get `403` |
| `health.test.js` | The public check reveals only up or down; a database failure's error text never reaches a response; name and version are Admin only |
| `account.test.js` | Profile changes keep emails unique and can't change the role; preferences are per user |
| `products.test.js` | Validation; optimistic locking (`409` instead of overwriting); `%` and `_` in search are literal and unknown sort columns are ignored; delete rules; all-or-nothing Excel import; export → edit → import |
| `stock.test.js` | Concurrent transfers of the last units; opposite transfers without deadlock; rollback half-way; no negative stock; stale adjustments refused |
| `purchaseOrders.test.js` | Receiving twice at once adds stock once; an error on any line rolls back the receipt; status rules; stale draft edits refused |
| `salesOrders.test.js` | The last unit can't be sold twice; a short line deducts nothing; prices copied onto lines; a double cancel returns stock once; invoice PDF |

### Browser tests

[Playwright](https://playwright.dev) tests in [`e2e/`](e2e/) use the real site in a browser, so they also cover the React pages. They start their own copy of the API and the client on separate ports, so they can run next to `npm run dev`, and use the database in `server/.env`, so MySQL must be running. Run them against a local database only, because they create temporary accounts and data in it (named `E2E`, deleted before and after each run). The 71 tests run one file at a time, each file in its own browser window, which closes when the file is done. Their API raises the request limit (`API_RATE_LIMIT`), because a whole test run comes from one address; the normal limit is unchanged.

```bash
npx playwright install chromium   # once, downloads the browser
npm run test:e2e                  # no visible browser
npm run test:e2e:headed           # watch the browser, slowed down by 2 seconds per action
npm run test:e2e:ui               # step through the test in Playwright's window
```

| File | What it proves |
| ---- | -------------- |
| `admin.spec.js` | With two people signed in: a role change reaches a logged-in user without logging them out; a deactivated user is logged out on their next click and can return when reactivated; Admins can't change their own role or deactivate themselves; a role change appears in the Audit Log with who did it and the values before and after; the log's filters narrow an order's entries and its link opens the order |
| `auth.spec.js` | Sign in and log out; a wrong password shows an error; a protected page asks for login and then returns to that page; the session survives a reload; a new account registers as Staff; with sign-up closed, the pages stop offering it. |
| `customers-suppliers.spec.js` | For both: add through the form with a generated code, find it in the list, edit it; with no orders it can be deleted, with orders only deactivated. Customer revenue leaves out cancelled orders; supplier spend counts only received orders, with approved ones as open; Staff can add a customer from inside the sales order form, with the typed name filled in; a new purchase order from a supplier page has that supplier picked |
| `dashboard.spec.js` | KPI cards go up after a sale and open their pages; the revenue chart switches between days and months and between chart and table, with numbers matching the report; a date range filters it, and an impossible one shows an error; top products rank by quantity or revenue over a chosen period; the low-stock table lists a short product and View all opens the filtered stock page; Admins see the API and database status; the greeting follows the time of day |
| `products.spec.js` | Add a product through the form; form errors show and it stays open; search finds only the match; a price edited in the grid saves and the margin follows; **two tabs: the second save is refused, loads the latest version and overwrites nothing**; export follows the search, and an edited file imports back; a file with one bad row imports nothing; Managers see cost and margin, while Staff see neither on the screen or in the export, and can't change anything |
| `purchase-orders.spec.js` | Draft, approve and receive through the screens, with stock going up only on receipt; a draft can be edited; cancelling needs a reason and changes no stock; if someone else approved it first, the page refuses and shows the latest status; an approved order can't be opened for editing |
| `resilience.spec.js` | With faked failures: with the server down the app keeps the login and can try again; it survives a restart by retrying; a 401 logs out and remembers the page; one failed report leaves the rest of the Dashboard working; a slow reply for an old list can't overwrite the count after a search; a failed save keeps what was typed. Also: logging out in one tab logs out the other, and at phone size the sidebar becomes a menu and the page fits the screen |
| `roles.spec.js` | Each role's sidebar shows exactly its modules; going straight to a blocked address shows No access; Staff see no revenue or profit, the server doesn't send them, and restricted APIs answer `403`; Managers see revenue and suppliers; Admins see system status, the Audit Log and Users |
| `sales-orders.spec.js` | Creating an order lowers stock and shows the right total; the form refuses more than is available; the server refuses an order if someone else sold the stock first; cancelling needs a reason and returns the stock; Staff can download the invoice PDF but not cancel |
| `stock.spec.js` | A transfer moves the stock and shows both sides in the movement history; the form refuses too much stock and the same warehouse twice; the server refuses a transfer or adjustment if the stock changed meanwhile; an adjustment records its reason; the low-stock filter and highlight follow the chosen warehouse; Staff can see the history but not transfer or adjust |

## Deployment

### Demo logins

Sign in at [stockflow-ap0c.onrender.com](https://stockflow-ap0c.onrender.com) with either account:

| Role | Email | Password | What you can try |
| ---- | ----- | -------- | ---------------- |
| Manager | `manager@stockflow.demo` | `pass1234` | Everything except users, warehouses and the audit log: revenue and profit charts, purchase orders from draft to received, sales orders and their cancellation, stock transfers and adjustments, editing products in the grid |
| Staff | `staff@stockflow.demo` | `pass1234` | The everyday view: products and stock, new sales orders with PDF invoices, and customers, but no revenue, profit, cost prices or purchasing |

Signing in with each one shows how the [roles](#roles-and-permissions) change what the app offers. It's shared demo data, so feel free to change things: it's reset from time to time.

### Hosting

The [live demo](https://stockflow-ap0c.onrender.com) runs on free plans: the app on [Render](https://render.com) and the database on [Aiven for MySQL](https://aiven.io). The API serves the built client too, so one address serves both and no CORS setup is needed.

| Render setting | Value |
| -------------- | ----- |
| Build Command | `cd client && npm ci --include=dev && npm run build && cd ../server && npm ci` |
| Start Command | `cd server && npm start` |
| Health Check Path | `/api/health` |

Environment variables on Render (see [Configure the server](#2-configure-the-server) for the full list):

| Variable | Value |
| -------- | ----- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | The Aiven database |
| `DB_SSL_CA` | Aiven's CA certificate, the whole PEM text, for an encrypted connection |
| `JWT_SECRET` | A new long random string, not the local one |
| `ALLOW_REGISTRATION` | `false`, so nobody can sign up |
| `TRUST_PROXY` | `3`: each request passes the visitor, Cloudflare, then Render's network. `GET /api/health/ip` shows the address the server sees |
| `NODE_VERSION` | `24` |
| `CLIENT_URL` | The site's address |

`TIME_ZONE` is left at its default, `+07:00`.

The demo data is loaded from a developer's computer, with the hosted database's settings set only for that one command (in Git Bash, the brackets keep them from staying in the terminal, so local tests can't reach the hosted database):

```bash
(
  export DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=...
  export DB_SSL_CA="$(cat path/to/aiven-ca.pem)"
  export SEED_PASSWORD=...        # required: the public demo1234 is refused on a hosted database
  npm run seed --prefix server
  npm run create-admin --prefix server -- admin@stockflow.demo <private-password>   # the Admin gets its own password
)
```

Every merge to `main` deploys again. On the free plans, Render sleeps after 15 minutes without visitors and takes about a minute to wake, and Aiven may power off an inactive database (it can be turned back on).

Problems found while deploying, and fixed:

- **Time zones.** Development ran in UTC+7 and the hosting in UTC, so a password reset looked 7 hours in the future (every Admin login was signed straight out), report days split at 7 am, and invoices could show the previous day. `TIME_ZONE` now sets one zone for Node and every database session.
- **Visitor addresses.** Behind Cloudflare and Render's network, every request seemed to come from one internal address, so all visitors would have shared one login rate limit. `TRUST_PROXY=3` takes the visitor's own address, and a forged `X-Forwarded-For` header is still ignored.
- **A route without a rate limit.** CodeQL flagged the route that serves the client's pages, which reads a file on every request. It now uses the same limit as the API.

## Development workflow

- **Planning:** each roadmap item is a [GitHub issue](https://github.com/qhao15/stockflow/issues) with a task checklist, grouped into milestones and tracked on the [project board](https://github.com/users/qhao15/projects/1).
- **Branches and pull requests:** `main` is protected. Work happens on a branch (e.g. `feature/sales-orders`) and is merged through a pull request; `Closes #N` in the PR closes the issue and moves its card to Done.
- **CI ([GitHub Actions](.github/workflows/ci.yml)):** every push and pull request runs three checks, and all must pass before merging:
  - **Client build:** installs the client with `npm ci` and builds it.
  - **Server checks:** syntax-checks every server file, runs all the [tests](#tests) (including concurrent transfers, receipts and sales of the last unit) against MySQL, then starts the API against a fresh MySQL 8 database and checks that `/api/health` reports it connected, which also proves the schema can be created from scratch.
  - **Browser tests:** runs all the [browser tests](#browser-tests) in Chromium against a fresh MySQL 8 database, and keeps a trace of any test that fails.
- **Dependencies:** [Dependabot](.github/dependabot.yml) opens monthly PRs with minor and patch updates, grouped so packages that must match (React, MUI, AG Grid, Vite) move together. Major versions are upgraded by hand on a branch, with testing. Security fixes arrive as soon as a vulnerability is published.
- **Security:** CodeQL scans the code on every push, and secret scanning with push protection blocks commits that contain credentials. See [SECURITY.md](SECURITY.md) to report a vulnerability.
- **Releases:** each finished milestone is tagged as a [release](https://github.com/qhao15/stockflow/releases) using semantic versioning (`v0.1.0`, `v0.2.0`, …), with notes on what it includes.

## Roadmap

Progress is tracked on the [project board](https://github.com/users/qhao15/projects/1). Each item links to its issue, which has the full task list.

**[v0.1 Foundation](https://github.com/qhao15/stockflow/milestone/1)** · released as [v0.1.0](https://github.com/qhao15/stockflow/releases/tag/v0.1.0)

- [x] Project setup, app layout and dashboard shell ([#1](https://github.com/qhao15/stockflow/issues/1))
- [x] Authentication: register, login, logout with JWT + bcrypt ([#2](https://github.com/qhao15/stockflow/issues/2))
- [x] Role-based access per module: Admin / Manager / Staff ([#3](https://github.com/qhao15/stockflow/issues/3))
- [x] Database schema and seed data ([#4](https://github.com/qhao15/stockflow/issues/4))
- [x] Products and categories, with Excel import ([#5](https://github.com/qhao15/stockflow/issues/5))

**[v0.2 Stock & orders](https://github.com/qhao15/stockflow/milestone/2)** · released as [v0.2.0](https://github.com/qhao15/stockflow/releases/tag/v0.2.0)

- [x] Warehouses, stock and transfers ([#6](https://github.com/qhao15/stockflow/issues/6))
- [x] Purchase orders ([#7](https://github.com/qhao15/stockflow/issues/7))
- [x] Sales orders and PDF invoices ([#8](https://github.com/qhao15/stockflow/issues/8))
- [x] Customers and suppliers ([#9](https://github.com/qhao15/stockflow/issues/9))

**[v0.3 Reports & audit](https://github.com/qhao15/stockflow/milestone/3)** · released as [v0.3.0](https://github.com/qhao15/stockflow/releases/tag/v0.3.0)

- [x] Dashboard charts and reports ([#10](https://github.com/qhao15/stockflow/issues/10))
- [x] Audit log ([#11](https://github.com/qhao15/stockflow/issues/11))

**[v0.4 Testing & deployment](https://github.com/qhao15/stockflow/milestone/4)** · released as [v0.4.0](https://github.com/qhao15/stockflow/releases/tag/v0.4.0)

- [x] Playwright browser tests, and fixes for the bugs they found ([#43](https://github.com/qhao15/stockflow/pull/43))
- [x] Browser tests in CI, and the server prepared for hosting ([#44](https://github.com/qhao15/stockflow/pull/44))
- [x] Live deployment: one time zone for all dates, logins after a password reset, real visitor addresses ([#45](https://github.com/qhao15/stockflow/pull/45))

**[v0.5 Updates](https://github.com/qhao15/stockflow/milestone/5)** · coming soon

- [ ] Updating ([#39](https://github.com/qhao15/stockflow/issues/39))
