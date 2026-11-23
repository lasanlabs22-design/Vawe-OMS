# Vawe OMS

Order management for Vawe Interio: orders from design to delivery, vendors and their payments, finance, inventory and sales reports. Two addresses:

| Address | Who | What |
| --- | --- | --- |
| `app.vaweinterio.in` | Vawe admins and staff | Sign-in and the dashboard: Sales, Vendors, Orders, Finance, Inventory |
| `ops.vaweinterio.in` | Admins only | Add people, set each person's access, reset passwords, activity log |

Each person, admin or staff, gets **none**, **view** or **edit** on Sales, Vendors, Orders and Finance, set in ops. Admins also get two admin-only settings:
- **Inventory:** view or edit. Edit lets them change stock.
- **Catalogue & prices:** none, view or edit. Covers the order-form options, the price lists and vendor rates.

Everyone can view Inventory. Staff can never change stock or prices. Every admin can use the ops console to manage people.

Defaults chosen for questions still open with the client are listed in [docs/DECISIONS.md](docs/DECISIONS.md).

## Stack

| Part | Tech |
| --- | --- |
| `apps/web` | Next.js 16 (App Router), React 19, Tailwind CSS 4. Forwards `/api/*` to the API, so the browser only talks to one origin |
| `apps/api` | Hono on Node 20+. All business rules and permission checks live here |
| `packages/db` | Drizzle ORM, Postgres (Railway). Without `DATABASE_URL`, local dev uses an embedded Postgres (PGlite) in `.data/` |
| `packages/shared` | Types, validation, the pricing engine and access rules shared by web and API |

## Run locally

Needs Node 20+ and pnpm 9.

```bash
pnpm install
pnpm admin --email you@vaweinterio.in --name "Your Name"   # first admin; prints a temporary password
pnpm dev                                                   # API on :4000, web on :3000
```

Open <http://localhost:3000/login> (dashboard) or <http://localhost:3000/ops/login> (ops). You'll be asked to replace the temporary password.

Locally one address serves both the dashboard and ops. Optional files: `apps/api/.env` and `apps/web/.env.local` (see the `.env.example` next to each).

### Sample data (local only)

With `pnpm dev` running:

```bash
pnpm --filter @vawe/api demo --email you@vaweinterio.in --password "your password"
```

Adds fictional "Demo …" vendors, about 90 orders over four months, payments, expenses and stock movements, so every chart has something in it. Refuses anything but a localhost API.

### Import the client's vendors and rates

From the DWG workbook (`Vendor Details` sheet). Reads the file at run time, so client data never enters this repository.

```bash
pnpm --filter @vawe/api import:workbook --file "C:\path\Vawe - DWG File.xlsm" --dry-run   # preview
pnpm --filter @vawe/api import:workbook --file "C:\path\Vawe - DWG File.xlsm"             # import
```

With `DATABASE_URL` in `apps/api/.env` it imports into that database. With the embedded database, stop `pnpm dev` first (only one process can open it). Also sets the default price list from the most common rates.

## Checks

```bash
pnpm typecheck                          # all packages
pnpm --filter @vawe/shared test         # pricing engine and GSTIN check
pnpm build                              # production builds of API and web
```

## Deploy on Railway

One Railway project, three services: **Postgres**, **api** and **web**. Connect the GitHub repo to both app services and leave each one's root directory at the repo root (it's a pnpm workspace).

| Service | Config file (Settings → Config-as-code) | Variables |
| --- | --- | --- |
| api | `apps/api/railway.json` | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PORT=4000`, `NODE_ENV=production`, `APP_ORIGIN=https://app.vaweinterio.in`, `OPS_ORIGIN=https://ops.vaweinterio.in` |
| web | `apps/web/railway.json` | `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000`, `APP_HOST=app.vaweinterio.in`, `OPS_HOST=ops.vaweinterio.in`, `NODE_ENV=production` |

- The **api** service needs no public domain: the web service reaches it on Railway's private network.
- Give the **web** service both custom domains, `app.vaweinterio.in` and `ops.vaweinterio.in`, and add the CNAME records Railway shows at the DNS provider.
- The API migrates the database itself on start-up, then fills in the catalogue, stock list and walk-in vendor if they're missing.
- Create the first admin from your machine with the **public** Postgres URL: put `DATABASE_URL=<DATABASE_PUBLIC_URL>` in `apps/api/.env`, then `pnpm admin --email … --name "…"`. Remove it from `.env` afterwards.
- Optional, once the client has keys: `GST_PROVIDER=cashfree`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV=sandbox|production` on the api service turn on GSTIN company-detail lookup. Until then GSTINs are still checked offline (format, check digit, state).

## Security

- **Passwords:** bcrypt cost 12. At least 10 characters with a letter and a number. 5 wrong attempts lock the account for 15 minutes, and there's a per-IP limit on sign-in attempts. A wrong email takes as long to reject as a wrong password.
- **Sessions:** stored on the server. The cookie holds a random token and the database keeps only its SHA-256, so deactivating someone, resetting their password or changing your own password signs out their other sessions immediately.
  - Dashboard sessions last 7 days and ops sessions 8 hours, each with its own `__Host-` cookie.
  - Ops sign-in only accepts admins.
- **Temporary passwords:** passwords set by an admin must be replaced at first sign-in.
- **Permissions are enforced by the API on every request.** The web app only hides what you can't use.
- **Requests from other sites are refused:** any change to data must carry the origin of `app.` or `ops.vaweinterio.in`.
- **Web pages** send a strict Content-Security-Policy, HSTS, `nosniff` and anti-framing headers.
- **Activity log:** sign-ins, failed attempts, and changes to people and access are recorded and shown in ops.

## Project layout

```text
apps/
  api/            Hono API: src/routes (auth, ops, catalogue, vendors, orders, finance, inventory, sales),
                  src/lib (sessions, ledger, pricing glue), scripts (admin, demo data, workbook import)
  web/            Next.js: app/(auth) sign-in, app/(dashboard) modules, app/ops console,
                  app/(print) DWG & job card, components (charts, forms, shell)
packages/
  db/             Drizzle schema, migrations (drizzle/), connection, reference-data seed
  shared/         Domain lists, validation schemas, pricing engine (+ tests), GSTIN check, access rules
docs/             DECISIONS.md: defaults chosen for questions still open with the client
```

Changing the schema: edit `packages/db/src/schema*.ts`, run `pnpm db:generate`, and commit the new file in `packages/db/drizzle/`.
