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

> **Status:** in active development. Authentication, role-based access, the database schema with demo data, and the products module are done; stock, orders and reports are being built step by step (see [Roadmap](#roadmap)).

## Tech stack

| Layer    | Technology                                             |
| -------- | ------------------------------------------------------ |
| Frontend | React 18, Vite, Material UI (MUI), AG Grid Community, React Router, Axios |
| Backend  | Node.js, Express, ExcelJS (Excel import/export), Multer (file uploads) |
| Database | MySQL 8 / MariaDB 10.4+ (via `mysql2`)                 |
| Auth     | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |

## Features

### Available now

- **Accounts**: register, sign in and log out. Every page except Login and Register requires an account.
- **Session handling**: the session is restored on page reload, and an expired token automatically logs the user out and returns them to the page they were on after signing in again. Signing in or out in one tab refreshes all other open tabs.
- **Roles**: Admin, Manager and Staff. The first registered account becomes Admin, later sign-ups become Staff. Accounts with any role can also be created from the command line (see [Creating accounts](#creating-accounts)).
- **Role-based access**: each module and action requires a permission (see [Roles and permissions](#roles-and-permissions)). The API refuses requests without it, and the sidebar, dashboard and routes only show what the user's role allows.
- **User management** (Admin): list users, change roles, deactivate and reactivate accounts. Changes take effect on the user's next request.
- **Account settings** (every user, from the avatar menu): change your own name, email and password. Changing the password requires the current one and signs out all other devices.
- **App layout**: responsive sidebar that collapses to icons only (the choice is remembered), account menu with role and logout, mobile drawer.
- **Dashboard shell**: KPI cards and a live API/database status check.
- **Database schema and demo data**: all core tables, plus a seed script that simulates a year of business for a fictional electronics and computer accessories distributor (see [Demo data](#demo-data)).
- **Products and categories** (see [Products module](#products-module)):
  - Product list in AG Grid. Paging, sorting, search and filters (category, status, low stock) all run on the server.
  - Inline editing of prices and minimum stock, with optimistic locking.
  - Add/edit dialog.
  - Column show/hide, order and width saved per user on the server.
  - Excel export (respects the current filters) and all-or-nothing Excel import.
  - Category management.

### Planned

- **Warehouses & stock**: stock per product per warehouse, transfers between warehouses, low-stock alerts
- **Purchase orders**: `draft → approved → received`; receiving increases stock
- **Sales orders**: creating an order decreases stock, cancelling returns it; PDF invoices
- **Customers & suppliers**: contact info and order history
- **Dashboard charts**: revenue by day/month, top-selling products, low-stock list
- **Audit log**: who changed what and when

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
| Buying | `suppliers`, `purchase_orders`, `purchase_order_items` | Status `draft → approved → received` (or `cancelled`), with who approved/received and when |
| Selling | `customers`, `sales_orders`, `sales_order_items` | Status `completed` or `cancelled`; prices are copied onto items so later price changes don't rewrite old invoices |
| Audit | `audit_logs` | Who did what to which record, with old and new values as JSON |

Design rules:

- **`stock` always equals the sum of its movements.** The quantity and its movement row are written in the same transaction. The seed script verifies this after every run.
- **Database constraints are the last line of defence.** Even if application code has a bug, `CHECK` constraints stop negative stock and zero-quantity order lines.
- **Money uses `DECIMAL`, never floats.**
- **Indexes:** the schema starts with only primary, unique and foreign-key indexes. Reporting indexes are added in the performance step and measured before and after on the large seed.

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

The seed replaces all business data but keeps user accounts. It creates (or resets) these demo accounts, all with the password `demo1234`:

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

## Roles and permissions

Routes check **permissions**, not role names. The mapping from role to permissions lives in one file, [`server/src/auth/permissions.js`](server/src/auth/permissions.js), so changing what a role can do is a one-line change. `/api/auth/me` returns the user's permission list, and the client uses it only to decide what to show. Every API request is checked again on the server, so hiding a button is never the only protection.

| Module            | Staff                  | Manager                              | Admin |
| ----------------- | ---------------------- | ------------------------------------ | ----- |
| Products          | view                   | view, manage                         | all   |
| Stock             | view                   | view, transfer, adjust               | all   |
| Purchase orders   | –                      | view, create, approve, receive       | all   |
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
- Post-login redirects only accept same-site paths, so a crafted `?redirect=` link can't send users to another website.

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
│       ├── components/         # Layout (sidebar + top bar), Logo
│       ├── lib/                # api.js (Axios, token, 401 handling), agGrid.js, flash.js
│       ├── pages/              # Login, Register, Dashboard, Account, Users
│       │   └── products/       # Product grid, product/import dialogs, categories tab
│       ├── navItems.js         # Sidebar / module definitions
│       └── theme.js            # MUI theme
├── server/                     # Node.js + Express API
│   ├── .env.example            # Environment variable template
│   ├── scripts/
│   │   ├── create-user.js      # Create an account with a given role from the CLI
│   │   ├── seed.js             # Simulate a year of business as demo data
│   │   └── seed-data.js        # Product catalog, suppliers, warehouses, demo accounts
│   └── src/
│       ├── auth/               # permissions.js (role -> permission matrix), middleware.js (JWT + permission checks)
│       ├── db/                 # pool.js (MySQL pool + auto-create database), schema.js (tables, created on startup)
│       ├── routes/             # API routes (health, auth, users, account, categories, products)
│       ├── services/           # Product queries, Excel template/export/import parsing
│       ├── validators/         # common.js (email/password), product.js (shared by the API and the import)
│       └── index.js            # App entry point
├── ERD.md                      # Entity Relationship Diagram
├── SECURITY.md                 # How to report a vulnerability
└── package.json                # Root scripts (run both apps together)
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
| `JWT_SECRET`     | *(required)*            | Secret used to sign login tokens; the server won't start without it |
| `JWT_EXPIRES_IN` | `1d`                    | How long a login lasts (e.g. `8h`, `7d`)             |

The database and its tables are created automatically the first time the server starts, so no manual SQL is needed.

### 3. Run

```bash
npm run dev
```

This starts both apps:

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
| GET    | `/api/health`        | –    | API status and database connection                                  |
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

Missing or expired token → `401`; valid token without the permission → `403`.

Logging out is handled on the client by discarding the token.

## Development workflow

- **Planning:** each roadmap item is a [GitHub issue](https://github.com/qhao15/stockflow/issues) with a task checklist, grouped into milestones and tracked on the [project board](https://github.com/users/qhao15/projects/1).
- **Branches and pull requests:** `main` is protected. Work happens on a branch (e.g. `feature/sales-orders`) and is merged through a pull request; `Closes #N` in the PR closes the issue and moves its card to Done.
- **CI ([GitHub Actions](.github/workflows/ci.yml)):** every push and pull request runs two checks, and both must pass before merging:
  - **Client build:** installs the client with `npm ci` and builds it.
  - **Server checks:** syntax-checks every server file, then starts the API against a fresh MySQL 8 database and checks that `/api/health` reports it connected, which also proves the schema can be created from scratch.
- **Dependencies:** [Dependabot](.github/dependabot.yml) opens monthly PRs with minor and patch updates, grouped so packages that must match (React, MUI, AG Grid, Vite) move together. Major versions are upgraded by hand on a branch, with testing. Security fixes arrive as soon as a vulnerability is published.
- **Security:** CodeQL scans the code on every push, and secret scanning with push protection blocks commits that contain credentials. See [SECURITY.md](SECURITY.md) to report a vulnerability.
- **Releases:** each finished milestone is tagged as a [release](https://github.com/qhao15/stockflow/releases) using semantic versioning (`v0.1.0`, `v0.2.0`, …), with notes on what it includes.

## Roadmap

Progress is tracked on the [project board](https://github.com/users/qhao15/projects/1). Each item links to its issue, which has the full task list.

**[v0.1 Foundation](https://github.com/qhao15/stockflow/milestone/1)**

- [x] Project setup, app layout and dashboard shell ([#1](https://github.com/qhao15/stockflow/issues/1))
- [x] Authentication: register, login, logout with JWT + bcrypt ([#2](https://github.com/qhao15/stockflow/issues/2))
- [x] Role-based access per module: Admin / Manager / Staff ([#3](https://github.com/qhao15/stockflow/issues/3))
- [x] Database schema and seed data ([#4](https://github.com/qhao15/stockflow/issues/4))
- [x] Products and categories, with Excel import ([#5](https://github.com/qhao15/stockflow/issues/5))

**[v0.2 Stock & orders](https://github.com/qhao15/stockflow/milestone/2)**

- [ ] Warehouses, stock and transfers ([#6](https://github.com/qhao15/stockflow/issues/6))
- [ ] Purchase orders ([#7](https://github.com/qhao15/stockflow/issues/7))
- [ ] Sales orders and PDF invoices ([#8](https://github.com/qhao15/stockflow/issues/8))
- [ ] Customers and suppliers ([#9](https://github.com/qhao15/stockflow/issues/9))

**[v0.3 Reports & audit](https://github.com/qhao15/stockflow/milestone/3)**

- [ ] Dashboard charts and reports ([#10](https://github.com/qhao15/stockflow/issues/10))
- [ ] Audit log ([#11](https://github.com/qhao15/stockflow/issues/11))
