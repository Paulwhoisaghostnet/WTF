# Feature Inventory — WTF vs Reference Projects

**Date:** 2026-04-19
**Purpose:** Comprehensive feature list for WTF and every reference project in the workspace. Use this to pick which features to graft into WTF. The previous grafting plan (`GRAFTING_PLAN_2026-04-19.md`) remains the recommendation; this document is the raw menu.

**How to read this:**
- Section A — every feature WTF currently ships (by domain).
- Section B — every feature each reference project ships (by project).
- Section C — "overlap matrix" showing which reference projects implement features WTF also has (for comparison when deciding *how* to improve an existing WTF feature).
- Section D — features that appear **only** in reference projects (candidates to bring into WTF).

---

## SECTION A — WTF's current features

### A.1 Auth & Identity
- Local username/password login (Passport.js)
- Google OAuth sign-in
- GitHub OAuth sign-in
- Twitter/X OAuth 1.0a (link verification)
- Discord OAuth (link verification)
- Tezos wallet sign-in (Octez Connect + Beacon SDK challenge/sign)
- Role-based access: Admin, Host, Cohost, Resident Wizard, Contestant, Witness (Discord-style permission system configurable from Admin Panel)
- Session storage in Postgres (`connect-pg-simple`)
- Wallet nonce challenge with AES-256-GCM encryption
- Multiple wallet linkage per user (primary/secondary wallets)
- Admin bootstrap via `db:seed-admin` script

### A.2 Tezos wallet + contract integration
- Octez Connect as primary wallet transport, Beacon SDK fallback
- Wallet session persistence in localStorage + server-side rehydration
- Chain-ID preflight (`assertNetworkReadyForSend`) — blocks sends on wrong network
- Signed message verification (multi-strategy: canonical Michelson PACK + legacy)
- Batched operations (e.g. `update_operators` + swap in one tx)
- WTZ wrap/unwrap for XTZ↔token swaps
- SpicySwap DEX integration (token→token, XTZ→token, token→XTZ)
- FA2 marketplace contract interaction (listings, auctions, offers, cancel, settle, bid, buy, accept)
- FA2 barter contract interaction (create/accept/cancel trade)
- Operation confirmation (`op.confirmation(1)`)
- Fail-closed production contract-address resolution (`contract-config.ts`)

### A.3 On-chain ↔ off-chain sync
- Token-sync background job (4-hour interval) — pulls FA2 balances per linked wallet
- Nonce-cleanup job (1-hour interval)
- Marketplace verifier — reconciles `pending_verification` DB rows against TzKT every minute, TTL 15 min
- Wallet surveillance — three tiers:
  - Per-wallet backfill from id 0 on first link
  - Global sweep every 5 minutes (chunked TzKT calls across all wallets)
  - Safety sweep every 6 hours (per-wallet incremental pass)
- Idempotent upserts on TzKT row IDs (using `GREATEST(...)` in cursor updates)
- Synthetic WTF balance computation
- TzKT cache (5-min in-memory `Map`)
- Contract-activity tracking (write ops linked to operation hashes)

### A.4 Marketplace (in-app)
- Create listing (fixed-price)
- Create auction (timed with min bid / bid step)
- Place bid
- Settle auction
- Cancel auction
- Buy listing (pay in WTF FA2)
- Cancel listing
- Place offer on listing
- Accept offer
- Cancel offer
- Royalty recipient + bps per listing
- Pending-verification state machine (client submits → server marks pending → verifier promotes or fails)
- Marketplace contract can hold/withdraw XTZ (`default`/`admin_withdraw_xtz`)

### A.5 Barter board
- Create trade (offer token A for token B)
- Accept trade
- Cancel trade
- Same pending-verification machinery as marketplace

### A.6 Gameshow content
- Seasons (browse/list)
- Rounds (browse per season, view details)
- Challenges (list, submit response, receive grade, earn WTF rewards)
- Side Quests (bonus challenges for extra WTF)
- Studio (creator workspace)
- Studio projects
- Studio file uploads
- Studio file annotations
- Studio drive (file storage)
- Studio admin controls

### A.7 WTF TV
- Creator-facing channel system
- Video scheduling
- Video playback
- Channel browse/view

### A.8 Media library
- My Videos
- My Photos
- My Gallery (owned NFTs)
- NFT import
- File upload
- IPFS URI normalization (`ipfsContentPath`)
- MIME type resolution (`resolveArtifactMimeType`) with WebP preview deprioritization
- Centralized media cache proxy

### A.9 Community / Social
- Message Board (channels + threads, hybrid async/sync chat)
- WebSocket real-time chat
- Direct messages
- Public profiles
- Notifications
- Leaderboard (WTF holder rankings with .tez domain resolution)
- FAQ
- Links (external curated links)
- W page (timeline from X API v2 optional)
- Hoard (user-owned collection aggregation)
- Desktop apps registry

### A.10 Gallery
- Survival tokens view
- Exclusive gameshow art view

### A.11 Profile & Dashboard
- Dashboard with WTF balance, active season, quick actions
- Profile (logged-in user)
- Public profile (viewable by others)
- Tezos domain (.tez) resolution via `api.teznames.com` (30-min in-memory cache)

### A.12 Admin panel
- Users management
- Seasons management
- Rounds management
- Challenges management
- Channels management
- Roles management
- TV management
- Studio admin
- Desktop apps management

### A.13 Infrastructure & Operations
- Docker Compose stack (Postgres + app)
- Optional Caddy reverse proxy via `edge` Compose profile
- Hetzner dedicated-server deployment
- `tini` PID 1 + `gosu node` privilege drop (runs as UID 1000)
- Drizzle ORM with `db:push`/`db:generate`
- `pg_dump` backup script (with rotation)
- Optional Supabase remote backup target
- `/api/health` endpoint (currently minimal)
- GitHub Actions deploy workflow (push-to-main → SSH → `docker compose up -d --build` → health check)
- `TRUST_PROXY` support for reverse-proxied deployments
- Separate scripts for external link checking, contract testing

### A.14 Smart contracts (shipped in repo)
- SmartPy marketplace contract (`WTFMarketplaceV1_2.py`)
- SmartPy barter board contract (`WTFBarterBoardV1_2.py`)
- Per-listing royalty configuration
- Admin-withdraw-XTZ entrypoint
- `contract:test` npm script for local QA

### A.15 Security controls already in place
- Drizzle parameterized queries
- Studio access controls
- AES-256-GCM for OAuth tokens
- Path traversal hardening
- Wallet auth with nonce + signature verification
- CSRF protection (server-side)
- WebSocket authN with `crypto.timingSafeEqual`
- Upload size limits
- CI quality gates (typecheck, audit)
- Production CSP + security headers
- Session secret fail-fast in production

---

## SECTION B — Reference projects, per-project feature lists

### B.1 Bowers (building/Bowers)
Full Tezos NFT collections + marketplace dApp. Most architecturally similar to WTF.

**Auth & wallet:**
- Username/password auth (passport-local)
- Tezos wallet connection (Beacon + Octez Connect + WalletConnect transports)
- WalletConnect-ready CSP (allowlists `wss://relay.walletconnect.com/.org` + frame sources)
- Multi-wallet per user with primary wallet designation
- Network switching in-app (sidebar badge: Shadownet ↔ Mainnet)

**NFT + marketplace:**
- Deploy own FA2 collection contract ("Bower") from UI
- Import existing contract
- Mint tokens to own contract
- IPFS upload endpoint (`POST /api/ipfs/upload`)
- IPFS metadata pinning endpoint (`POST /api/ipfs/metadata`)
- Contract detail view
- Contract config view
- Contract tokens view
- List contracts by owner address
- Marketplace (browse + trade)
- Origination flows with chain-ID preflight

**Social:**
- Friends (request/accept/delete)
- Followers / Following
- User search
- User profile (public)

**Ops & testing:**
- Playwright e2e smoke suite
- `test:e2e:smoke` script
- CI job: Postgres service + curl-wait + e2e
- Netlify preview deploy gate
- Docker Compose for local Postgres (`db:up`)
- `DEPLOY.md` + `docs/DEPLOYMENT-GUIDE.md` (wallet runbook: Kukai chain-ID, Temple stale state, Beacon pitfalls)
- `check:styles` script

### B.2 Shadownet Kiln (building/shadownet kiln)
Contract test/deploy rig with serverless functions + SmartPy compilation.

**Contract workflow:**
- Michelson contract validator (parameter / storage / code shape check)
- Entrypoint parser
- Static contract audit (quality + risk findings)
- Deterministic pre-deploy simulation
- Compile SmartPy → Michelson in browser/server
- Staged workflow gate (compile → validate → audit → simulate → clearance)
- Contract origination via connected wallet
- Contract origination via server signer (Bert wallet)
- Post-deploy puppet-wallet E2E runner (Bert + Ernie)
- Dynamic entrypoint execution UI
- Guided contract creator wizard (FA2 fungible, NFT collection, marketplace presets)
- Reference-informed contract element slicing (admin controls, pause, operators, allowlists, royalties)
- Mainnet-readiness bundle export (zipped artifact)
- SmartPy scaffold generation
- Michelson test-stub generation

**Ops & API:**
- Network registry (active + planned networks)
- Chain-ID mismatch blocking (`TEZOS_CHAIN_ID` env)
- `/api/kiln/capabilities`
- `/api/kiln/openapi.json`
- `/api/kiln/workflow/run`
- `/api/kiln/audit/run`
- `/api/kiln/simulate/run`
- `/api/kiln/upload` (deploy with clearance gate)
- `/api/kiln/activity/recent` (HTTP + workflow + audit tail)
- `/api/kiln/reference/contracts`
- `/api/kiln/contracts/guided/elements`
- `/api/kiln/export/bundle`
- `/api/health` — enriched with chainId, network, contract resolution, activity log path
- JSON-first CLI for humans + agents
- API token auth (`API_AUTH_TOKEN` + `VITE_API_TOKEN`)
- Mutation-route rate limiting
- Production same-origin default CORS
- `CORS_ORIGINS` allowlist with `https://*.domain` wildcards
- Zod request body validation
- Wallet balance visibility for test accounts
- Activity log persistence for audit trail
- Compiled FA2 test token generation (bronze/silver/gold/platinum/diamond)
- Shadownet smoke test suite (opt-in)

**Deployment target:**
- Netlify SPA + serverless API
- Bundled standalone Python (`vendor/kiln-python`) for SmartPy inside Netlify function
- Local Netlify emulation

### B.3 Smartpy-Test-Platform (building/smartpy-test-platform)
Tiny Python+vanilla-JS browser UI for SmartPy.

- Load SmartPy contracts from workspace directories
- In-browser source editor
- One-click compile + run
- Execution status + duration display
- Scenario folder inspection
- Micheline JSON viewer (primary contract)
- stdout/stderr capture
- `log.txt` per-scenario viewer
- Build-artifact preview (`.json`, `.tz`)
- Run history (`runs/<run-id>/` on disk)
- Interpreter auto-detection (prefers Bowers `.smartpy-env`, falls back to `python3`)
- Configurable `--sandbox-root`, `--contract-root`, `--timeout`, `--python-bin`

### B.4 Shadowdex (building/shadowdex)
Agent documentation only — **no runtime features**. Skip for grafting.

### B.5 Skllz (building/skllz)
Agent skill corpus — meta-knowledge for AI agents, not app features. Skip for grafting.

### B.6 Discord Bots (building/Discord Bots)
Python Discord bot system, primarily for community gamification.

**XP & leveling:**
- XP from messages (configurable + cooldown)
- XP from reactions on bot messages
- XP from voice-channel time (per-minute)
- XP from challenge responses (base + mod-awarded bonus)
- XP from trait idea submissions + adoption bonus
- XP from Tezos verification (one-time)
- Exponential level formula (`XP_BASE * XP_MULTIPLIER^(level-2)`)
- Level-up announcements (auto)
- Transaction history (audit log of every XP change)

**Image challenges:**
- Moderator posts image + known issues list
- User response via button (modal) or `!respond` command
- Mod review queue (auto-forward to review channel)
- Quick-award buttons (⭐ 10 / ⭐⭐ 25 / ⭐⭐⭐ 50 / Custom / None)

**Trait ideas:**
- `!suggest "Name" Description`
- Mod adopts via `!adoptrait <id>`
- Auto DM to user on adoption
- Public celebration embed
- "Trait Master" role auto-assigned after 3+ adoptions
- Trait statistics (`!traitstats`)

**Tezos verification:**
- `!verifytezos @user` / `!unverifytezos @user` (mod-gated)
- Auto role grant + XP bonus + leaderboard badge (💎)

**Music (DJ):**
- MP3 uploads via `#hey-dj` channel
- Auto-scan every 30 min
- `!library` browser
- Play/pause/skip/stop/loop
- Volume control
- Queue management (FIFO)
- Random/shuffle mode
- 24/7 voice-channel mode
- Auto-reconnect
- Playlist CRUD (per-user)
- Music caching (`music_cache/`)
- Play-count tracking

**Leaderboards:**
- `!leaderboard` / `!lb` / `!top`
- Top 10 / 25 views
- `!stats` (self + @user)
- `!rank`
- `!compare @a @b`
- Tezos-verified badge on leaderboards

**Admin:**
- Manual XP add/remove/set
- Hot-reload cogs without restart
- `!botstats`
- Transaction history viewer
- SQLite + `aiosqlite`
- Multi-cog modular architecture
- `.env`-driven configuration

### B.7 Objkt-Advisor (Tezos analytics/Objkt-Advisor)
Objkt GraphQL creator-analytics + scoring app.

**Analytics pages:**
- Dashboard
- Creators list
- Creator details (drill-down)
- Collectors list
- Collector studio (per-collector analytics)
- Creator studio (per-creator analytics)
- Advisor view (scored recommendations)
- Analytics page (charts + aggregates)
- Exploration page
- Scans (scan history)
- Database maintenance UI

**Scoring & data:**
- 100-point, 5-category creator scoring model (liquidity, appreciation, consistency, momentum, scarcity)
- `SCORING_METHODOLOGY.md` — documented methodology
- Objkt GraphQL v3 as primary data source
- Percentile-based floor-price rankings
- Decayed metrics (time-weighted)

**Media:**
- `IpfsImage` component with multi-gateway fallback (`cf-ipfs.com`, `dweb.link`, `ipfs.io`)
- Gateway cycling on `onError`

**Ops:**
- Drizzle + SQLite
- Jest test framework
- `START.command` (macOS one-click launcher)

### B.8 Tezos-Intel (Tezos analytics/Tezos-Intel)
Postgres-backed wallet analytics.

**Pages:**
- Dashboard
- Wallet analyzer
- Holdings
- Portfolio performance
- Activity
- Marketplace
- Market (overview)
- Analytics
- Sync data

**Analytics features:**
- Per-wallet analytics (balance, tokens, activity)
- Marketplace contract classifier (Objkt/Teia/fxhash/Versum/akaSwap map → entrypoint → event-type)
- Sale vs transfer distinction (inspects `/operations/{hash}`)
- Objkt GraphQL secondary source
- TzKT primary source
- Portfolio performance over time
- Persistent `wallet_cache` table with 120s TTL (survives container restarts)

**Ops:**
- Drizzle ORM
- TypeScript workers for background sync
- Meta-images Vite plugin

### B.9 Tezos-Scout (Tezos analytics/Tezos-Scout)
Minimal Objkt ingest MVP.

- GraphQL client (`graphql-request`)
- Basic wallet browse
- Drizzle + Postgres
- Passport auth
- Radix UI + Framer Motion

**Status:** MVP stub; skip for grafting (Tezos-Intel/Guidance cover the same ground better).

### B.10 TezPulse (Tezos analytics/tezpulse)
Browser-only TzKT activity scanner.

- Auto-scan on page load
- Multi-platform scan: Objkt, Teia, fxhash, Versum, akaSwap
- Distinguishes creators (minters) vs buyers vs sellers
- Unique-wallet counts with expandable lists
- No auth / no wallet connection required
- **Ships `TZKT_API_CHEATSHEET.md`** (541 lines of TzKT endpoint + marketplace-contract documentation)
- Vanilla TzKT REST API calls (no GraphQL)
- Origination-scan for FA2 token creation
- Transaction scan by entrypoint (`collect`, `match`, `swap`, etc.)
- Token-transfer scan with marketplace-contract filter

### B.11 Wallet Constellations (Tezos analytics/wallet-constellations)
Ego-centric wallet visualization.

- Sync from TzKT for a single wallet (`--wallet` CLI arg)
- Local JSON cache (`data/cache/`)
- Module registry (`src/modules/*/module.ts` auto-loaded)
- Timeline scrubber with module-wide `progress` + filtered `slice`
- Built-in modules:
  - `network-growth` — p5.js constellation of creators/contracts/counterparties
  - `flow-orbit` — three.js orbital scene for XTZ flow
  - `activity-ledger` — human-readable tables
  - `token-journeys` — cards showing edition movement across holders
- FNV-seeded deterministic node positioning
- Request-ticket dedup (`ticketRef` in `useWalletStudio.ts`)
- Pluggable module architecture (add new views without touching existing)
- Shared analytics builders (pure types + derivation functions)
- Local Express API (port 8787) + Vite client (port 5173)

### B.12 Guidance (Tezos analytics/Guidance)
Unified Tezos intelligence (merges Objkt-Advisor + TezPulse + nft-pipeline).

**Data sources:**
- TzKT (REST)
- Objkt GraphQL (`https://data.objkt.com/v3/graphql`)
- Teia GraphQL (`https://teztok.teia.rocks/v1/graphql`)
- CoinGecko (historical + current XTZ price)
- CryptoCompare (fallback price)

**Analytics:**
- Network Health dashboard
- NFT Market dashboard
- Objkt Focus dashboard
- Data Ops dashboard
- Market Angles (24h, 48h, 72h, 96h, 7d, 14d, 30d, 90d, 6mo, 12mo, 36mo, all, custom start/end)
- XTZ price charts
- CEX-funded buyer flow (identify buyers funded from exchange wallets)
- Creator fund-flow / cashout posture
- Primary vs resale metrics
- Marketplace fee estimation
- Marketplace-contract discovery with confidence scoring
- FIFO-trace (`/api/analytics/fifo-trace?address=...&maxHops=3`)
- Score methodology endpoint
- Insights endpoint

**Sync & scheduling:**
- `POST /api/sync/tzkt` / `/objkt/recent` / `/objkt/comprehensive` / `/teia/recent` / `/objkt/state` / `/objkt/creator/:address`
- `POST /api/sync/coingecko` (historical + current)
- `POST /api/sync/all`
- `POST /api/sync/xtz/historical`
- `POST /api/sync/xtz/current`
- Scheduled sync (overlap-safe — `running` flag pattern)
- `sync_runs` table tracking begin/end/status per job
- Retention job with `keepDays` parameter
- `GET /api/sync/runs` (recent run history)

**Admin:**
- `/api/admin/scheduler` — status
- `/api/admin/scheduler/run-sync`
- `/api/admin/scheduler/run-retention`
- `/api/admin/retention/run`
- `/api/admin/rebuild-creators`

**Research exports:**
- `GET /api/research/objkt/recent-sales`
- `GET /api/research/xtz/cex-receipts`
- Import from other Sandbox projects (`/api/import/existing`)

**Storage:**
- SQLite (`better-sqlite3`)
- Raw tables: `raw_tzkt_transactions`, `raw_tzkt_transfers`, `raw_objkt_sales`, `market_events`, `market_state_snapshots`, `marketplace_wallet_activity`, `marketplace_contracts`
- Derived tables: `creators`, `daily_metrics`, `buyer_cex_flow`, `creator_fund_flow`, `resale_daily_metrics`, `marketplace_fee_daily`

### B.13 Web3 Simulator (Tezos analytics/web3 simulator)
Pricing + network-economics simulator. Not Tezos-specific.

- Monthly price-change rate modeling
- Volatility (stddev) simulation
- Staking-reward modeling with price-adjustment coefficient
- Transaction-fee USD drift
- Network value (market cap) charting
- APY dynamic calculation
- Configurable duration + time-step
- Recharts visualization

**Status:** Standalone Next.js simulator, not a data pipeline. Grafting would mean building a "what-if WTF price changed X%" mini-tool, probably low priority.

### B.14 NFT Pipeline (Tezos analytics/web3 simulator/nft-pipeline)
Canonical two-phase TzKT data pipeline.

- Phase 1: Sync from TzKT → SQLite (raw_transactions, raw_token_transfers, raw_balances)
- Phase 2: Derive analytics locally (buyers, creators, listings, offers, resales)
- Resumable sync (cursor-based, can interrupt)
- Incremental sync (first sync pulls window; subsequent are delta)
- Offline-capable analysis
- CSV exports: `buyers.csv`, `buyer_purchases.csv`, `creators.csv`, `creator_mints.csv`, `creator_listings.csv`, `creator_offer_accepts.csv`, `collector_resales.csv`
- `summary.json` aggregate
- `debug_entrypoints.json` entrypoint analysis
- Marketplace entrypoint discovery (`npm run discover`)
- Database status CLI (`npm run status`)
- **`paginateByCursor<T extends { id: number }>`** — canonical cursor pagination helper
- Per-marketplace entrypoint config (buy / list / acceptOffer arrays)
- Configurable time window (`windowDays`)
- 429-aware exponential backoff + ECONNRESET retry
- 100 ms min-interval request throttle
- `identity_resolver.ts` — Tezos Domains GraphQL resolver (reverse record + owned domains)

### B.15 Objkt-Owned-Editions-Sorter (Tezos analytics/objkt-owned-editions-sorter)
Chrome extension that rearranges Objkt profile pages.

- DOM scraping only (no API)
- Sort editions by owner count / activity

**Status:** Chrome-ext-only DOM work; not portable to WTF. Skip for grafting.

### B.16 Particle Studio (Particle Painting/particle-studio)
GPU-accelerated particle simulation + mint pipeline.

**Simulation:**
- WebGL2 GPU particle system
- Particle types: Sand, Dust, Sparks, Ink, more
- Movement patterns: Still, Linear, Wave, Spiral, Orbit, Vortex, Brownian, Evade, Clusters
- Boundary modes: Respawn, Bounce, Wrap, Stick, Destroy, Slow Bounce
- Forces: gravity, wind, jitter
- Multi-layer composition

**Export:**
- PNG screenshot
- Animated GIF (`gif.js`)
- WebM video recording
- MP4 with audio (audio-reactive, `@ffmpeg/ffmpeg` wasm)

**Mint pipeline:**
- Canvas → IPFS (Pinata)
- TZIP-21 metadata construction
- HEN/Teia shared minter contract (`KT1Hkg5qeNhfwpKW4fXvq7HGZB9z2EnmCCA9`)
- Beacon wallet connection
- `MintModal` UI with royalty + edition inputs

**State & UI:**
- Zustand state
- Radix UI accessible components
- Keyboard shortcuts (`Space` pause, `R` reset)
- Layer management panel

**Security gap (do NOT copy):**
- `VITE_PINATA_JWT` bundled into client — must be server-side-proxied before grafting anywhere into WTF.

---

## SECTION C — Overlap matrix (what reference projects ALSO have, for comparison of HOW)

Use this when considering whether to swap WTF's existing implementation for a reference-project pattern.

| WTF feature | Also found in | Worth studying? |
|---|---|---|
| Wallet connect (Beacon/Octez) | Bowers, Kiln, Particle Studio | Bowers has a 3-transport adapter including WalletConnect — best pattern |
| Chain-ID preflight | Bowers, Kiln | Kiln has `TEZOS_CHAIN_ID` env gate + server-side mismatch block |
| FA2 token holder/transfer indexing | Tezos-Intel, Guidance, nft-pipeline, tezpulse, wallet-constellations | nft-pipeline cursor paginator is the canonical form |
| TzKT REST client | Bowers, Tezos-Intel, Guidance, nft-pipeline, tezpulse, wallet-constellations | nft-pipeline has 429 backoff + throttle; others are naive |
| Marketplace listings / auctions | Bowers, Guidance (analytics-only) | Bowers has own mint + sale flow; different contract |
| User social (follow/friends) | Bowers | Bowers has explicit friends + followers tables |
| Leaderboard | Discord Bots, Objkt-Advisor, Tezos-Intel, Guidance | Discord Bots does XP-based; Objkt-Advisor does score-based; WTF does holder-based |
| NFT gallery / owned tokens | Bowers, Tezos-Intel, wallet-constellations | wallet-constellations' `token-journeys` module is unique |
| IPFS URI normalization | Bowers, Objkt-Advisor, Tezos-Intel, tezpulse, nft-pipeline | All have variations; Objkt-Advisor's is most robust for display |
| Tezos Domains (.tez) | nft-pipeline (GraphQL), Bowers (teznames) | nft-pipeline has GraphQL — covers reverse + owned; WTF's teznames.com covers only reverse |
| Scheduled background jobs | Guidance, nft-pipeline | Guidance has `sync_runs` table + overlap guard — cleaner than WTF's flags |
| SmartPy contracts | Bowers, Kiln | Kiln has full audit + simulate + clearance workflow |
| Chat / real-time | (only WTF) | WTF ahead — no reference matches |
| Gameshow mechanics | (only WTF) | WTF ahead — no reference matches |
| Season/Round/Challenge | (only WTF, plus Discord Bots image-challenge analogue) | Discord Bots' challenge+bonus-review UX is a loose analogue |
| TV / video scheduling | (only WTF) | WTF ahead |
| Studio file uploads | Bowers (IPFS upload endpoint), Particle Studio (Pinata JWT) | Bowers' `POST /api/ipfs/upload` server-side IPFS pinning is cleaner than Particle's client JWT |
| Postgres + Drizzle | Bowers, Tezos-Intel, Tezos-Scout | All identical pattern |
| Session store in Postgres | Bowers | Same `connect-pg-simple` |
| Docker Compose | Bowers | WTF stack is more complete (app + ffmpeg + Caddy profile) |
| CI deploy | Bowers (Netlify preview), WTF (Hetzner SSH) | Bowers has Playwright e2e gate — WTF doesn't |
| `/api/health` endpoint | Kiln (enriched), WTF (minimal) | Kiln's enriched form beats WTF's |
| CSP headers | Bowers (WC-ready), WTF (base) | Bowers' allowlists unlock more wallets |
| Rate limiting | Kiln (mutation routes), WTF (declared, homegrown map) | Kiln pattern is what WTF's audit already flagged |

---

## SECTION D — Features that exist ONLY in reference projects

Organized by how much they would add to WTF if grafted.

### D.1 Clear wins for grafting

1. **WalletConnect transport** (Bowers) — unlocks Kukai desktop, Atomex, mobile wallets beyond Temple.
2. **Multi-gateway IPFS fallback on `<img>` error** (Objkt-Advisor `IpfsImage.tsx`) — cycles `cf-ipfs.com`, `dweb.link`, `ipfs.io`.
3. **TzKT 429-aware backoff client with 100ms floor** (nft-pipeline) — hardens every TzKT call site.
4. **Cursor-based pagination helper** (nft-pipeline `paginateByCursor`) — replaces offset paging.
5. **Known-marketplace contract map + sale classification** (Tezos-Intel, tezpulse) — Objkt/Teia/fxhash/Versum/akaSwap.
6. **Tezos Domains GraphQL resolver with reverse + owned** (nft-pipeline) — WTF only has reverse.
7. **Persistent TzKT response cache (Postgres)** (Tezos-Intel `wallet_cache` pattern) — survives restarts.
8. **Enriched `/api/health`** (Kiln — chainId, network, contract resolution, activity path).
9. **Scheduler overlap guard + `sync_runs` audit table** (Guidance).
10. **Playwright e2e harness + CI gate** (Bowers).
11. **Wallet-quirk runbook** (Bowers `DEPLOYMENT-GUIDE.md`).
12. **`TZKT_API_CHEATSHEET.md`** (TezPulse — already-written reference doc).
13. **Server-side chain-ID guard on ingest** (Kiln) — defense in depth alongside client preflight.
14. **Request-ticket dedup for client queries** (wallet-constellations `ticketRef`).

### D.2 Feature-level grafts (adds user-visible capabilities WTF doesn't currently have)

15. **Creator scoring (5-category, 100-point)** (Objkt-Advisor) — scored leaderboard/gallery discovery.
16. **Per-wallet portfolio performance over time** (Tezos-Intel `portfolio-performance.tsx`) — holdings value tracking.
17. **Wallet activity graph with d3-force / p5.js** (wallet-constellations `network-growth`) — relationship visualization.
18. **Timeline scrubber + per-time-slice filtering** (wallet-constellations) — temporal exploration of activity.
19. **FIFO trace** (Guidance `/api/analytics/fifo-trace`) — trace XTZ flow through a wallet up to N hops.
20. **CEX-funded buyer flow detection** (Guidance) — flag users whose wallets were funded from exchanges.
21. **Creator fund-flow / cashout posture** (Guidance) — show whether creators cash out or hold.
22. **Primary vs resale metrics** (Guidance, nft-pipeline) — distinguish first-sale from secondary market.
23. **Marketplace fee estimation** (Guidance) — compute fees from observed on-chain data.
24. **Marketplace-contract discovery with confidence score** (Guidance) — detect new marketplaces automatically.
25. **XTZ price charts (CoinGecko + CryptoCompare fallback)** (Guidance) — price context for marketplace.
26. **Market-angles time-window API** (Guidance — 24h…all-time, custom start/end) — flexible analytics windows.
27. **CSV exports for analytics** (nft-pipeline — buyers.csv, creators.csv, etc.) — data export for power users.
28. **Research exports endpoint** (Guidance `/api/research/*`) — structured data download.
29. **Mint-from-app pipeline** (Bowers, Particle Studio) — let users mint NFTs from within WTF (bumpers, submissions).
30. **Deploy-own-FA2-contract wizard** (Bowers — "Bower" creation) — let creators deploy collection contracts.
31. **Browser SmartPy test UI** (Smartpy-Test-Platform) — admin tool for compiling/testing contracts.
32. **Staged contract-deploy workflow** (Kiln: compile → validate → audit → simulate → clearance) — gate production contract changes.
33. **Bundled "mainnet readiness" zip export** (Kiln) — packaged deploy artifact.
34. **Guided contract creator wizard** (Kiln — FA2 / NFT / marketplace presets).
35. **Reference-informed contract element slicing** (Kiln — admin, pause, operators, allowlists, royalties).
36. **Static contract-audit findings** (Kiln — quality + risk analyzer over Michelson).
37. **Pre-deploy simulation** (Kiln — deterministic execution preview).
38. **Puppet-wallet post-deploy E2E runner** (Kiln `Bert + Ernie`) — integration tests against deployed contract.
39. **Friends + request/accept** (Bowers) — friend graph beyond simple follows.
40. **User search** (Bowers `/api/users/search`) — WTF has none.
41. **Compare-two-users stats view** (Discord Bots `!compare`) — side-by-side user comparison on profile pages.
42. **Scheduled auto-challenges** (Discord Bots roadmap) — auto-post challenge at intervals.
43. **Streak bonuses for daily activity** (Discord Bots roadmap).
44. **Achievement/badge system** (Discord Bots roadmap) — badges on profiles.
45. **XP-redemption economy** (Discord Bots roadmap).
46. **Tezos verification with leaderboard badge** (Discord Bots `💎`) — visual holder indicator.
47. **Voice channel XP** (Discord Bots) — only relevant if WTF ever adds voice features.
48. **Music library + playlists + 24/7 mode** (Discord Bots DJ) — could feed WTF TV as ambient audio channel.
49. **Browser-based particle simulator / visual-effects sandbox** (Particle Studio) — creator tool for TV bumpers / gallery art.
50. **GPU particle export to PNG/GIF/WebM/MP4-with-audio** (Particle Studio) — export pipeline.
51. **Audio-reactive MP4 export** (Particle Studio) — sound-to-visual artifact generation.
52. **Network growth over time module** (wallet-constellations) — shows wallet's expanding social circle.
53. **Flow-orbit three.js XTZ flow viz** (wallet-constellations `flow-orbit`) — inbound/outbound XTZ as orbital motion.
54. **Activity ledger human-readable tables** (wallet-constellations).
55. **Token-journeys card view** (wallet-constellations — edition dispersal across holders).
56. **Pluggable-module registry pattern** (wallet-constellations — modules auto-loaded).
57. **FNV-seeded deterministic positioning** (wallet-constellations) — stable graph layouts across reloads.
58. **Auto-scan on page load** (TezPulse) — default-on data fetch.
59. **Origination scan for FA2 creation** (TezPulse) — detect new collections.
60. **Multi-platform activity scan with de-dup** (TezPulse) — single query across 5 marketplaces.
61. **Teia GraphQL secondary source** (Guidance) — Teia/HEN-specific data.
62. **CoinGecko + CryptoCompare XTZ price** (Guidance) — resilient price feed.
63. **Import from other local projects** (Guidance `/api/import/existing`) — cross-project data consolidation.
64. **Retention policy with `keepDays`** (Guidance) — automatic old-data purging.
65. **Rebuild-creators admin endpoint** (Guidance) — data-integrity tool.
66. **Pricing/volatility simulator** (Web3 Simulator) — "what if WTF price changed X%" analysis.
67. **Staking reward modeling** (Web3 Simulator) — not relevant unless WTF adds staking.
68. **JSON-first CLI for machines + agents** (Kiln) — CLI mirror of API (useful for agent integration).
69. **API token auth with build-time inlining** (Kiln `VITE_API_TOKEN`) — CI-friendly auth.
70. **OpenAPI-style endpoint map** (Kiln `/api/kiln/openapi.json`) — machine-discoverable API.
71. **Activity log file tail endpoint** (Kiln `/api/kiln/activity/recent`) — remote log viewer without SSH.
72. **`check:styles` script** (Bowers) — style-system linter.
73. **IPFS server-side pinning endpoint** (Bowers `POST /api/ipfs/metadata` + `/api/ipfs/upload`) — server holds Pinata JWT, client uploads through relay.
74. **Image challenge system with mod-review bonus** (Discord Bots) — mirror of WTF's Challenges but with button-based UX.
75. **Trait idea submission system** (Discord Bots) — community-sourced feature ideas with adoption credit.
76. **"Trait Master" auto-role after N adoptions** (Discord Bots) — automatic role progression.

### D.3 Meta/agent-infra features (not user-facing, but tool-builder relevant)

77. **Agent bootstrap directory with 10 profile files** (Kiln `agents/`) — AI-agent integration.
78. **Mainnet-readiness bundle export** (Kiln) — structured artifact for human-review hand-off.
79. **Scenario runs stored on disk** (Smartpy-Test-Platform `runs/<run-id>/`) — reproducible test results.
80. **Ref-corpus for guided contract assembly** (Kiln `src/lib/reference-contracts.ts` + `reference/`).

---

## How to use this list

**Fastest flow:** scroll Section D and jot down any item number (`D.1/2`, `D.2/42`, etc.) that sounds useful. Tell me which ones, and I'll pull them into a new, focused graft plan that supersedes or augments `GRAFTING_PLAN_2026-04-19.md`.

**Alternative flow:** scan Section C to see where WTF already has a feature — if you want to compare implementations, point at the WTF feature name, and I'll line up the reference equivalents.

**If you're picking broadly:** the 14 items in D.1 are the high-leverage, low-risk picks (those match the Tier 1–3 items in the grafting plan, with a couple of extras like D.1/14 request-ticket dedup). Anything D.2 and below is feature-expansion territory — more speculative, bigger surface area.
