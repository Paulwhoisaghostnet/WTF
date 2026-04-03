# WTF Gameshow Platform

A survival-based challenge game platform on Tezos, featuring WTF token integration, real-time messaging, marketplace with on-chain FA2 swaps, and a retro Windows 95 UI aesthetic.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + React95 (Windows 95 UI)
- **Backend**: Express.js + Drizzle ORM + PostgreSQL
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
npm run db:push   # applies Drizzle schema to Postgres
npm run dev
```

### Supabase and environment variables

This app talks to Postgres with **Drizzle** using `DATABASE_URL`. That must be the **PostgreSQL URI** from Supabase (starts with `postgresql://`), not the project URL (`https://xxx.supabase.co`).

1. Open [Supabase](https://supabase.com) → your project → **Project Settings → Database**.
2. Under **Connection string**, choose **URI**, mode **Transaction pooler** (port **6543**) for Netlify serverless.
3. Paste the full string into `DATABASE_URL` in `.env`. It includes the database password.

**API keys** (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) live under **Project Settings → API**. This codebase uses direct SQL via `DATABASE_URL` for reads/writes; you do **not** need the anon key for Drizzle to work. Add them if you later use the Supabase JS client or Edge functions. Keep **service_role** secret and only in server/Netlify env, never in the browser.

Copy **the same** variable names and values into **Netlify → Site configuration → Environment variables** for production builds and functions.

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
