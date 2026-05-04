# WTF Gameshow Platform

A survival-based challenge game platform on Tezos, featuring WTF token integration, real-time messaging, marketplace with on-chain FA2 swaps, and a retro Windows 95 UI aesthetic.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + React95 (Windows 95 UI)
- **Backend**: Express.js + Drizzle ORM + PostgreSQL (local Docker)
- **Auth**: Passport.js (local + Google + GitHub + Twitter/X + Discord + Tezos wallet)
- **Wallet**: octez.connect + Beacon SDK fallback + Taquito
- **Real-time**: WebSockets for live chat
- **Blockchain**: TzKT API + Teznames domain resolution
- **Deploy**: Docker Compose on Hetzner dedicated server (Caddy + Node + Postgres)
- **Backups**: `pg_dump` with rotation; optional Supabase remote backup target

## WTF Token

- Contract: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Standard: FA2 | Symbol: WTF | Decimals: 8

## Setup (Local Development)

```bash
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL and SESSION_SECRET at minimum
npm run db:push   # applies Drizzle schema to Postgres
npm run dev
```

### With Docker (mirrors production)

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and SESSION_SECRET
docker compose up -d --build
# App at http://localhost:3000, Postgres at localhost:5432
```

### Environment Variables

Use a single `.env` (gitignored) for every variable the app reads. Copy `.env.example` for the full key list, then replace placeholders with real values on each machine.

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | PostgreSQL URI (auto-set by Docker Compose) |
| `POSTGRES_PASSWORD` | Yes (Docker) | Password for the Docker Postgres container |
| `SESSION_SECRET` | Yes | `openssl rand -hex 32` |
| `PUBLIC_SITE_URL` | Recommended | `https://wtfgameshow.com` in production |
| `SITE_DOMAIN` | Production | Domain for Caddy TLS (e.g. `wtfgameshow.com`) |
| `GOOGLE_CLIENT_ID` / `SECRET` | Optional | Google OAuth |
| `GITHUB_CLIENT_ID` / `SECRET` | Optional | GitHub OAuth |
| `TWITTER_CONSUMER_KEY` / `SECRET` | Optional | Twitter/X OAuth 1.0a link verification |
| `DISCORD_CLIENT_ID` / `SECRET` | Optional | Discord link verification |
| `X_BEARER_TOKEN` | Optional | Enables W timeline pull from X API v2 |
| `KILN_API_URL` | Optional | Override Kiln API endpoint; production defaults to `http://host.docker.internal:3001` |
| `KILN_API_TOKEN` | Optional | Must match Kiln's `API_AUTH_TOKEN` when protected routes are enabled |
| `KILN_TIMEOUT_MS` | Optional | Kiln request timeout; defaults to `120000` |
| `TRUST_PROXY` | Recommended | Set `1` behind Caddy or other reverse proxies |

## Deployment (Hetzner)

Default Compose stack is **three containers** (Postgres + app + Caddy). The app listens on **127.0.0.1:3000** and Caddy terminates public TLS for the app plus host-native services such as Kiln.

| Container | Role |
|-----------|------|
| **postgres** | PostgreSQL 16 with persistent volume |
| **app** | Node.js 20 + ffmpeg/ffprobe, API + static frontend on `:3000` (loopback) |
| **caddy** | Public TLS/proxy for `wtfgameshow.app`, `new.wtfgameshow.app`, and `kiln.wtfgameshow.app` |

### Deploy workflow

Pushing to `main` triggers `.github/workflows/deploy.yml`:
1. SSH into Hetzner server
2. Build the app image and run `docker compose up -d --remove-orphans`
3. Health check against `/api/health`

### Manual deployment

```bash
ssh user@your-server
cd /opt/platform/repos/wtf-app
git pull --ff-only origin main
bash scripts/server-deploy.sh
```

### Database management

```bash
# Apply schema changes
npm run db:push

# Backup database
npm run backup:db
# Or inside Docker:
docker compose exec app bash /app/scripts/backup-db.sh

# Bootstrap admin user
ADMIN_PASSWORD='your-temporary-password' npm run db:seed-admin
```

### Background Jobs

In production, the Node process runs these on intervals (no external scheduler needed):

| Job | Interval | Purpose |
|-----|----------|---------|
| Token sync | 4 hours | Syncs owned FA2 tokens from TzKT for all linked wallets |
| Nonce cleanup | 1 hour | Removes expired wallet auth nonces |

## User Roles

| Role | Description |
|------|-------------|
| **Admin** | Full control over the platform (all permissions) |
| **Host** | Full admin control over the gameshow (all permissions) |
| **Cohost** | Admin-level access for managing rounds and challenges |
| **Resident Wizard** | Elevated community member |
| **Contestant** | Active participant in rounds and challenges |
| **Witness** | Read-only observer access |

Roles and permissions are configurable through the Admin Panel, following a Discord-style permission system.

## Features

- **Dashboard**: WTF balance, active season, quick actions
- **Seasons & Rounds**: Browse seasons, view round details and challenges
- **Challenges**: Submit responses, receive grades, earn WTF rewards
- **Message Board**: Hybrid async/sync chat with channels and threads
- **Marketplace**: List tokens for auction or buy-now, pay with WTF
- **Barter Board**: Direct peer-to-peer token swaps
- **Leaderboard**: WTF holder rankings with .tez domain resolution
- **Gallery**: Survival tokens and exclusive gameshow art
- **Side Quests**: Bonus challenges for extra WTF earnings
- **WTF TV**: Creator-facing channel system with video scheduling and playback
- **My Videos / My Photos**: Centralized media library with NFT import and file upload
- **Admin Panel**: Users, seasons, rounds, challenges, channels, roles, TV management

## Smart Contracts

The marketplace contract is in `contracts/WTFMarketplaceV1_2.py` (SmartPy).
The barter board contract is in `contracts/WTFBarterBoardV1_2.py` (SmartPy).
The WTF -> XTZ exchange package is in `contracts/wtf-xtz-exchange/` (SmartPy).
Compile with SmartPy CLI before deploying to Tezos.

### Marketplace contract flow

- Listing and buy settlement are on-chain using FA2 transfers.
- Buyers pay in WTF FA2.
- No listing fee is charged by the marketplace contract.
- Royalty split is supported via per-listing `royalty_recipient` + `royalty_bps`.
- Contract can hold XTZ (`default`) and admin can withdraw XTZ (`admin_withdraw_xtz`).

### Compile and deploy

```bash
npm run contract:test   # local QA
npm run contract:test:wtf-xtz
pip install smartpy-tezos
smartpy compile contracts/WTFMarketplaceV1_2.py build/contracts
smartpy compile contracts/WTFBarterBoardV1_2.py build/contracts
```

### WTF -> XTZ exchange flow

- Listing creators call `create_listing(rate_numerator_mutez, rate_denominator_wtf_units)` and attach XTZ escrow.
- Takers first approve the exchange as FA2 operator for WTF token id `0` through the WTF contract `update_operators`.
- Takers call `swap(listing_id, wtf_amount)` with WTF base units. The contract floors `wtf_amount * rate_numerator_mutez / rate_denominator_wtf_units`.
- WTF moves from taker to listing creator through FA2 `transfer`; XTZ moves from listing escrow to taker.
- Listing creators can call `cancel_listing(listing_id)` to reclaim exactly the remaining escrow.
- UIs read `listings[listing_id].remaining_escrow_mutez` directly from storage to show live available XTZ.

Mainnet WTF configuration:

- FA2: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Token ID: `0`
- Metadata decimals: `8`; UI converts human WTF to FA2 base units.

Shadownet/mainnet notes are in `docs/wtf-xtz-exchange/`. Mainnet artifact generation is blocked until Shadownet E2E passes.
