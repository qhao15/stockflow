<p align="center">
  <img src="client/public/logo.svg" alt="StockFlow logo" width="96" height="96" />
</p>

<h1 align="center">StockFlow</h1>

<p align="center">
  A full-stack <b>Sales &amp; Inventory Management</b> system built with React, Node.js and MySQL.
</p>

StockFlow tracks products across multiple warehouses, handles purchase orders from suppliers and sales orders to customers, and keeps every stock change traceable through a movement ledger instead of a single editable number.

> **Status:** in active development. Authentication, the app layout and the dashboard shell are done; the business modules are being built step by step (see [Roadmap](#roadmap)).

## Tech stack

| Layer    | Technology                                             |
| -------- | ------------------------------------------------------ |
| Frontend | React 18, Vite, Material UI (MUI), React Router, Axios |
| Backend  | Node.js, Express                                       |
| Database | MySQL 8 / MariaDB 10.4+ (via `mysql2`)                 |
| Auth     | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |

## Features

### Available now

- **Accounts**: register, sign in and log out. Every page except Login and Register requires an account.
- **Session handling**: the session is restored on page reload, and an expired token automatically logs the user out and returns them to the page they were on after signing in again. Signing in or out in one tab refreshes all other open tabs.
- **Roles**: Admin, Manager and Staff. The first registered account becomes Admin, later sign-ups become Staff. Accounts with any role can also be created from the command line (see [Creating accounts](#creating-accounts)).
- **App layout**: responsive sidebar that collapses to icons only (the choice is remembered), account menu with role and logout, mobile drawer.
- **Dashboard shell**: KPI cards and a live API/database status check.

### Planned

- **Role permissions**: Admin (users, warehouses, settings), Manager (approves purchase orders, views reports), Staff (creates sales orders, checks stock)
- **Products**: SKU, category, price, unit, image, minimum stock level, bulk import from Excel
- **Warehouses & stock**: stock per product per warehouse, transfers between warehouses, low-stock alerts
- **Purchase orders**: `draft → approved → received`; receiving increases stock
- **Sales orders**: creating an order decreases stock, cancelling returns it; PDF invoices
- **Customers & suppliers**: contact info and order history
- **Dashboard charts**: revenue by day/month, top-selling products, low-stock list
- **Audit log**: who changed what and when

### Stock traceability

Stock is never edited directly. Every change (purchase received, sale, cancellation, transfer, adjustment) writes a row to `stock_movements` with its reason, so the current quantity in `stock` can always be explained and audited.

## Authentication design

- Passwords are hashed with bcrypt; plain-text passwords are never stored.
- Login returns a signed JWT (default lifetime 1 day) that the client sends as `Authorization: Bearer <token>`.
- On every protected request the server re-loads the user from the database, so a deactivated account or a changed role takes effect immediately instead of when the token expires.
- Login answers "Invalid email or password" for both unknown emails and wrong passwords, so it can't be used to find out which emails have accounts.
- `requireRole(...)` middleware is ready for restricting routes per role (e.g. only Managers approve purchase orders).
- Post-login redirects only accept same-site paths, so a crafted `?redirect=` link can't send users to another website.

## Project structure

```
stockflow/
├── client/                     # React frontend (Vite)
│   ├── public/logo.svg         # Logo / favicon
│   └── src/
│       ├── api/client.js       # Axios instance, token handling, 401 interceptor
│       ├── auth/               # AuthContext, route guard, login/register layout
│       ├── components/         # Layout (sidebar + top bar), Logo
│       ├── pages/              # Login, Register, Dashboard and module pages
│       ├── navItems.js         # Sidebar / module definitions
│       └── theme.js            # MUI theme
├── server/                     # Node.js + Express API
│   ├── .env.example            # Environment variable template
│   ├── scripts/create-user.js  # Create an account with a given role from the CLI
│   └── src/
│       ├── config/db.js        # MySQL pool + auto-create database
│       ├── db/schema.js        # Table definitions, created on startup
│       ├── middleware/auth.js  # JWT verification and role checks
│       ├── routes/             # API routes (health, auth)
│       └── index.js            # App entry point
└── package.json                # Root scripts (run both apps together)
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
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

### Creating accounts

To create an account with a specific role, or update an existing account's role and password:

```bash
npm run create-user --prefix server -- <admin|manager|staff> <email> <password> ["Full Name"]

# examples
npm run create-user --prefix server -- manager manager@example.com YourPassword123 "Manager Name"
npm run create-admin --prefix server -- admin@example.com YourPassword123     # shortcut for an Admin
```

Passwords must be at least 8 characters. This is also the way to reset a forgotten password.

## API

| Method | Endpoint             | Auth | Description                                                         |
| ------ | -------------------- | ---- | ------------------------------------------------------------------- |
| GET    | `/api/health`        | –    | API status and database connection                                  |
| POST   | `/api/auth/register` | –    | Create an account and sign in (first account becomes Admin, later ones Staff) |
| POST   | `/api/auth/login`    | –    | Sign in; returns `{ token, user }`                                  |
| GET    | `/api/auth/me`       | JWT  | The current user                                                    |

Logging out is handled on the client by discarding the token.

## Roadmap

- [x] Project setup, app layout and dashboard shell
- [x] Authentication: register, login, logout (JWT + bcrypt)
- [ ] Role-based access per module (Admin / Manager / Staff)
- [ ] Database schema and seed data
- [ ] Products and categories (with Excel import)
- [ ] Warehouses, stock and transfers
- [ ] Purchase orders
- [ ] Sales orders and PDF invoices
- [ ] Customers and suppliers
- [ ] Dashboard charts and reports
- [ ] Audit log
