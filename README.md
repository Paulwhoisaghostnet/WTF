# WTF Gameshow Platform

A survival-based challenge game platform on Tezos, featuring WTF token integration, real-time messaging, marketplace with on-chain FA2 swaps, and a retro Windows 95 UI aesthetic.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + React95 (Windows 95 UI)
- **Backend**: Express.js + Drizzle ORM + **PostgreSQL hosted on Supabase**
- **Auth**: Passport.js (local + Google OAuth)
- **Wallet**: octez.connect + Beacon SDK fallback + Taquito
- **Real-time**: WebSockets for live chat
- **Blockchain**: TzKT API + Teznames domain resolution
- **Deploy**: Netlify (serverless functions + static frontend)
- **Supabase CLI**: `supabase/` (local stack, migrations, GitHub integration path = **repository root** / `.`)

## WTF Token

- Contract: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Standard: FA2 | Symbol: WTF | Decimals: 8

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — see “Supabase & environment” below
npm run db:check  # validates DATABASE_URL + network reachability before app boot
npm run db:push   # applies Drizzle schema to Postgres
npm run dev
```

### Supabase and environment variables

Supabase uses **two different screens**:

| What you need | Where in the dashboard |
|---------------|-------------------------|
| **Publishable + secret API keys** | **Project Settings** (gear) → **Data API** (or **API**) |
| **`DATABASE_URL` (Postgres URI)** | **Connect** (top of the project home page) — not under the API screen |

The UI **does not** use the label `DATABASE_URL`. You copy a line that starts with `postgresql://` or `postgres://` from the **Connect** panel. The **API keys** page only shows REST/Auth keys, not Postgres URIs.

**Current Supabase layout (as of their docs):**

1. Open your **project** (not org-only or billing-only views).
2. Click **Connect** in the top bar (or open `https://supabase.com/dashboard/project/<YOUR_PROJECT_REF>?showConnect=true` and replace `<YOUR_PROJECT_REF>` with the subdomain from `https://<ref>.supabase.co`).
3. Pick **Direct**, **Session pooler**, or **Transaction pooler** and copy the string; use **Transaction** (port **6543**) for Netlify serverless when it fits your driver.
4. Replace `[YOUR-PASSWORD]` with your **database password**. If you never saved it: left sidebar **Database** → **Settings** (URL shape: `…/database/settings`) → **Reset database password**.

**If you still do not see Connect or any Postgres URI:** use `npm run db:print-url` (see below) with `SUPABASE_DB_PASSWORD` — the hosted URI follows a fixed pattern once you know the project ref from `SUPABASE_URL`.

**If the dashboard only shows API keys or won’t open Connect:** Supabase’s APIs and CLI **never** return your **database password** (you set it or reset it under **Database → Settings**). You can still assemble `DATABASE_URL` locally:

```bash
export SUPABASE_DB_PASSWORD='your-database-password'
# Optional: token from https://supabase.com/dashboard/account/tokens — fills region for the Transaction pooler URL.
# Or run `supabase login` first; the script may read the CLI token from ~/.supabase/access-token.
export SUPABASE_ACCESS_TOKEN='sbp_...'

npm run db:print-url
```

The script reads `SUPABASE_URL` from `.env` to get the project ref, prints a **direct** URI (`db.<ref>.supabase.co:5432`) and, with a token or `SUPABASE_REGION`, a **pooler** URI (`…pooler.supabase.com:6543`). Copy one line into `DATABASE_URL`.

**API keys** are still required for `@supabase/supabase-js` and `VITE_*` vars. **Service role** = secret key—server and Netlify only, never in the browser.

Copy **the same** variable names and values into **Netlify → Site configuration → Environment variables** for production builds and functions.

### Supabase as PostgreSQL host (schema management)

Supabase **is** the Postgres server: you point `DATABASE_URL` at their cluster. This app does **not** run its own Postgres.

| Piece | Role |
|-------|------|
| **Supabase → Database** (sidebar) | SQL Editor, backups, extensions; **connection strings** are in **Connect** at project level, not only here |
| **`npm run db:push`** | Applies [`shared/schema.ts`](shared/schema.ts) to that database via **Drizzle Kit** (creates/updates tables) |
| **[`server/db.ts`](server/db.ts)** | Connection pool with TLS + limits suited to Supabase (pooler-friendly) |
| **[`drizzle.config.ts`](drizzle.config.ts)** | Same `DATABASE_URL` + SSL for CLI migrations |

**Recommended URIs**

- **Production (Netlify Functions):** **Transaction pooler**, port **6543** (PgBouncer).
- **One-off `db:push` / Drizzle Studio:** **Session mode** or **direct** `db.<project>.supabase.co:5432` if the pooler causes issues—see [Supabase connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres).

Optional: `DATABASE_POOL_MAX` (default `10` when using Supabase host) — lower to `1`–`3` on heavy serverless if you hit connection limits.

Quick diagnostic (recommended before debugging auth):

```bash
npm run db:check
```

`db:check` prints host family (IPv4/IPv6), attempts a real query, and reports actionable hints for common failures (timeout, wrong DB name, missing schema, wrong pooler credentials).

Link the Supabase CLI to the same project (optional, for `supabase db pull`, branches, etc.):

```bash
npm run supabase:link
# paste project ref when prompted (from your Supabase URL / dashboard)
```

### Supabase CLI (`supabase init` is already run)

The repo includes [`supabase/config.toml`](supabase/config.toml). For **Supabase → GitHub integration**, set the working directory to the folder that **contains** `supabase/` — i.e. **`.`** (this repo root), not `supabase` itself.

| Command | Purpose |
|--------|---------|
| `npm run supabase:start` | Local Supabase (Docker required) |
| `npm run supabase:stop` | Stop local stack |
| `npm run supabase:status` | Show local URLs and keys |
| `npm run supabase:link` | Link CLI to your hosted project |
| `npm run supabase:db:reset` | Reapply migrations + seed locally |

**Schema note:** The app’s tables are defined in Drizzle ([`shared/schema.ts`](shared/schema.ts)) and applied with `npm run db:push`. Use `supabase/migrations/` for Supabase-specific SQL (e.g. RLS policies, extensions) if you add them; avoid duplicating the whole Drizzle schema in two places unless you intentionally migrate to SQL-first workflows.

### Supabase JS (`@supabase/supabase-js`)

This is a **Vite + Express** app, not Next.js. Supabase’s template may show `NEXT_PUBLIC_SUPABASE_*` and `utils/supabase/server.ts` — here:

| Dashboard / Next.js | This project |
|---------------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` (same value) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| Server Components + cookies | Express: [`server/supabase.ts`](server/supabase.ts) (`getSupabaseServiceClient` / `getSupabaseAnonClient`) |
| Browser | [`client/src/lib/supabase/browser.ts`](client/src/lib/supabase/browser.ts) (`getSupabaseBrowserClient`) |

Set **`VITE_*`** in Netlify for production builds (Vite inlines them at build time). Keep **`SUPABASE_SERVICE_ROLE_KEY`** server-only (never `VITE_`).

## User Roles

| Role | Description |
|------|-------------|
| **Host** | Full admin control over the gameshow |
| **Cohost** | Admin-level access for managing rounds and challenges |
| **Contestant** | Active participant in rounds and challenges |
| **Witness** | Read-only observer access |

## Features

- **Dashboard**: WTF balance, active season, quick actions
- **Seasons & Rounds**: Browse seasons, view round details and challenges
- **Challenges**: Submit responses, receive grades, earn WTF rewards
- **Message Board**: Hybrid async/sync chat with channels and threads
- **Marketplace**: List tokens for auction or buy-now, pay with WTF
- **Leaderboard**: WTF holder rankings with .tez domain resolution
- **Gallery**: Survival tokens and exclusive gameshow art
- **Side Quests**: Bonus challenges for extra WTF earnings
- **Admin Panel**: Manage users, seasons, rounds, challenges, channels

## Smart Contracts

The marketplace contract is in `contracts/WTFMarketplace.py` (SmartPy).
Compile with SmartPy CLI before deploying to Tezos.

## Deployment

Configured for Netlify deployment:

```bash
npm run build:netlify
```

**API routing:** Requests to `/api/*` are proxied so that, after `serverless-http` strips `/.netlify/functions/api`, the path Express sees is `/api/...` (matching `server/auth/routes.ts`, etc.). If auth or other API calls 404 in production, confirm `netlify.toml` still has `to = "/.netlify/functions/api/api/:splat"` for the `/api/*` rule.

**Bootstrap admin (host) user** — from a machine that can reach Postgres (use the **transaction pooler** `DATABASE_URL` if direct times out):

```bash
ADMIN_PASSWORD='your-temporary-password' npm run db:seed-admin
```

Creates or updates user `admin` (override with `ADMIN_USERNAME`) with role **host**. Change the password in the app after login.

**Netlify environment variables** (mirror your local `.env`):

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | PostgreSQL URI from Supabase (Transaction pooler for serverless) |
| `SESSION_SECRET` | Yes | Long random string, e.g. `openssl rand -hex 32` |
| `NODE_ENV` | Yes | `production` |
| `SUPABASE_URL` | Optional | `https://<ref>.supabase.co` — for reference or future Supabase client |
| `SUPABASE_ANON_KEY` | Optional | Only if you add Supabase client on the frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only; never expose to the client |
| `PUBLIC_SITE_URL` | Recommended | Your Netlify URL, e.g. `https://your-app.netlify.app` |
| `TEZOS_NETWORK`, `TEZOS_RPC_URL` | Optional | Defaults work for mainnet |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth; set authorized redirect URIs in Google Cloud |
