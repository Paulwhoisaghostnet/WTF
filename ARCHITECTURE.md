# WTF Gameshow — Architecture Map

> Generated 2026-04-15. Living reference for the full WTF ecosystem: data model, API surface, client routes, blockchain integration, deployment, and inter-system pipelines.

---

## 1. Platform Overview

WTF Gameshow is a **Windows 95-themed, Tezos-integrated community platform** built with:

- **Frontend**: React 19 + [react95](https://github.com/react95-org/React95) UI library + styled-components + wouter routing
- **Backend**: Express 5 (Node 20) + Drizzle ORM + PostgreSQL (Supabase-hosted)
- **Blockchain**: Tezos mainnet via Taquito + Beacon/Octez Connect wallets
- **Deployment**: Netlify (static + serverless functions) with scheduled token-sync worker

The app simulates a desktop OS where each feature opens as a draggable "window" from a Start Menu. Users connect Tezos wallets, participate in gameshow rounds/challenges, trade NFTs, chat on message boards, watch community TV channels, and earn WTF tokens.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER (Client)                       │
│  React 19 + react95 + styled-components + wouter            │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ Auth Context  │  │ Wallet Context│  │ Window Manager   │  │
│  │ (session)     │  │ (Tezos)       │  │ (desktop state)  │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │            │
│  ┌──────┴──────────────────┴────────────────────┴─────────┐ │
│  │              Desktop Shell (Win95 UX)                   │ │
│  │  StartMenu → AppWindows → Pages (lazy-loaded)          │ │
│  │  Taskbar → Window buttons, clock, wallet tray          │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│           ┌───────────────┼───────────────┐                  │
│           │ REST API      │ WebSocket     │ Taquito (RPC)    │
│           │ /api/*        │ /ws           │ → Tezos node     │
└───────────┼───────────────┼───────────────┼──────────────────┘
            │               │               │
┌───────────┼───────────────┼───────────────┼──────────────────┐
│           ▼               ▼               │    SERVER        │
│  ┌─────────────┐  ┌──────────────┐        │                  │
│  │  Express 5   │  │  WebSocket   │        │                  │
│  │  (app.ts)    │  │  (ws)        │        │                  │
│  │  ┌────────┐  │  │  Chat +      │        │                  │
│  │  │Passport│  │  │  typing      │        │                  │
│  │  │Sessions│  │  └──────────────┘        │                  │
│  │  └────────┘  │                          │                  │
│  │  Routes:     │                          │                  │
│  │  auth, tv,   │         ┌────────────────┘                  │
│  │  marketplace,│         │                                   │
│  │  wallets,    │         ▼                                   │
│  │  board, ...  │  ┌─────────────┐  ┌──────────────────────┐ │
│  └──────┬───────┘  │ TzKT API   │  │ Tezos Blockchain     │ │
│         │          │ (indexer)   │  │ (mainnet / ghostnet) │ │
│         │          └─────────────┘  └──────────────────────┘ │
│         ▼                                                     │
│  ┌──────────────┐                                             │
│  │ PostgreSQL   │  (Supabase-hosted)                          │
│  │ (Drizzle ORM)│                                             │
│  └──────────────┘                                             │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                    NETLIFY DEPLOYMENT                          │
│  Static: dist/public (Vite build)                             │
│  Functions: dist/functions/api.cjs (serverless-http wrapper)  │
│  Scheduled: token-sync (cron every 4h)                        │
│  Redirects: /api/* → /.netlify/functions/api/api/:splat       │
│             /* → /index.html (SPA fallback)                   │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Client Architecture

### 3.1 Entry Point & Providers

```
main.tsx  (polyfills: global, Buffer, process for Taquito/Beacon)
  └── App.tsx
        ├── QueryClientProvider  (TanStack React Query)
        ├── ThemeProvider        (styled-components + react95 "original" theme)
        ├── GlobalStyles         (react95 styleReset + Win95 scrollbars + teal desktop)
        ├── AuthProvider         (session auth + wallet login)
        │     └── WalletProvider (Tezos wallet connect/disconnect)
        │           └── WindowManagerProvider (desktop window state)
        │                 ├── URLSync (address bar ↔ window manager)
        │                 └── Desktop
        │                       ├── WindowRenderer → lazy pages → AppWindow
        │                       └── Taskbar → StartMenu
        └── Fullscreen overlays: Landing, Login, Register
```

### 3.2 Layout System

| Component | Role |
|-----------|------|
| **Desktop** | Full-viewport `#008080` shell, "W T F" watermark, draggable desktop icons (Recycle Bin, HOARD, W, WTF TV). Fetches `/api/apps/desktop` for icon visibility toggles. |
| **Taskbar** | `react95` `AppBar`: "Stuffs" button toggles StartMenu, one button per open window (focus/minimize/restore), system tray (wallet WiFi icon + popup, user panel, clock). |
| **StartMenu** | Grouped menu items: Dashboard, Gameshow (seasons/rounds/challenges/side quests), Social (messages/inbox/board/W), Market (marketplace/trade boards/swap), My Files (My Videos/My Photos), Profile, Admin (role-gated), public Browse (links/FAQ/gallery/leaderboard). |
| **AppWindow** | Wraps each page in a `react95` `Window` with drag, resize, minimize/maximize/close. Reads `WindowPathContext` for window key. Mobile: full viewport, no resize. |

### 3.3 Pages & Routes

Routes are defined in `PAGE_DEFS` array in `App.tsx`. Auth guards check `useAuth()` and optional role requirements.

| Route | Page | Auth | Description |
|-------|------|------|-------------|
| `/` | Landing | No | Marketing splash with login/register buttons |
| `/login` | Login | No | Username/password + optional Google OAuth |
| `/register` | Register | No | Registration form + wallet-register flow |
| `/dashboard` | Dashboard | Yes | Home hub: stats, passport, WTF balance, quick actions |
| `/rounds` | Rounds | Yes | Season rounds listing |
| `/rounds/:id` | RoundDetail | Yes | Round details + challenge list |
| `/challenges` | Challenges | Yes | Challenge list with submit/grade UX |
| `/side-quests` | SideQuests | Yes | Side quests with completion tracking |
| `/messages` | Messages | Yes | DM inbox: threads, compose, notifications |
| `/messageboard` | MessageBoard | Yes | Public board: threads, attachments, moderation |
| `/marketplace` | Marketplace | Yes | On-chain marketplace: listings, auctions, offers, barter, trade board |
| `/trade-boards` | TradeBoards | Yes | Thin wrapper → `Marketplace` (tab 2) |
| `/tv` | TV | Yes | WTF TV: CRT simulation, channels, playlists, creator tools |
| `/swap` | Swap | Yes | DEX swap UI (SpicySwap/3Route) |
| `/leaderboard` | Leaderboard | No | Rankings + on-chain transfer ledger |
| `/gallery` | Gallery | No | Static survival token gallery |
| `/links` | Links | No | Curated link list |
| `/faq` | Faq | No | FAQ accordion |
| `/profile` | Profile | Yes | Account editor: social, wallet, owned tokens, PFP |
| `/user/:username` | PublicProfile | No | Public profile + DM composer |
| `/admin` | Admin | Yes (admin roles) | Seasons, users, permissions, TV settings |
| `/hoard` | Hoard | Yes | Token summary + canvas mini-game |
| `/my-videos` | MyVideos | Yes | Video media library: import tokens, upload files |
| `/my-photos` | MyPhotos | Yes | Image media library: import tokens, upload files |
| `/w` | W | Yes | X/Twitter-style feed (linked accounts) |

### 3.4 State Management

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Server state | TanStack React Query | All API data (30s staleTime, retry 1) |
| Auth | AuthContext | `useQuery(["auth","user"])`, login/register/walletLogin mutations |
| Wallet | WalletContext | Tezos address, connect/disconnect, link-to-server, sync |
| Windows | WindowManagerContext | Open pages, z-order, focus, min/max, positions, titles |

### 3.5 Client Utilities (`client/src/lib/`)

| Module | Purpose |
|--------|---------|
| `api.ts` | Thin fetch wrapper: `get/post/put/delete`, credentials: include |
| `query-client.ts` | Shared QueryClient defaults |
| `auth-context.tsx` | Session + wallet auth providers |
| `wallet-context.tsx` | Tezos wallet connection + server wallet linking |
| `window-context.tsx` | Desktop window manager state |
| `media-resolve.ts` | IPFS normalization, `resolveTokenThumbnail`, `cacheProxyUrl`, MIME from `@shared/token-media` |
| `hamster-emoji.ts` | Custom hamster emoticons/stickers/reactions for messaging |
| `tezos/index.ts` | Re-exports wallet, token, marketplace, barter, dex |
| `tezos/wallet.ts` | Octez Connect → Beacon fallback → Taquito toolkit wiring |
| `tezos/marketplace.ts` | Marketplace contract calls (listings, auctions, offers) |
| `tezos/barter.ts` | Barter contract calls (create/accept/cancel trades) |
| `tezos/token.ts` | WTF FA2 transfers + balance |
| `tezos/dex.ts` | SpicySwap router: swap execution with WTZ wrap/unwrap |
| `tezos/activity-ledger.ts` | Client-side telemetry of contract interactions → `/api/contract-activity` |

---

## 4. Server Architecture

### 4.1 Middleware Pipeline (`server/app.ts`)

```
Request
  → trust proxy (production)
  → helmet (CSP)
  → cors (credential origins from env)
  → body parsers (10MB JSON limit)
  → rate limit: /api/* (200 req/min)
  → rate limit: /api/auth/login, /register (20 per 15 min)
  → express-session (connect-pg-simple store)
  → passport.session()
  → routes (registerRoutes)
  → error handler (CORS 403, DB classify, generic 500)
```

### 4.2 Authentication System (`server/auth/`)

| File | Role |
|------|------|
| `passport.ts` | Session setup (Postgres store), Passport local strategy (scrypt), social strategies (Google, GitHub, Twitter, Discord), `isAuthenticated`, `requirePermission()` |
| `routes.ts` | `/api/auth/*` endpoints: register, login, logout, wallet challenge/verify/register, OAuth flows |
| `storage.ts` | Drizzle-backed user CRUD, wallet nonces, social link helpers |
| `wallet-verify.ts` | Tezos ed25519 challenge/verify (bs58check + blakejs) |
| `oauth-crypto.ts` | AES-256-GCM token encryption for Twitter OAuth secrets |

**Auth flows:**
- **Username/password**: Passport local → scrypt verify → session
- **Wallet login**: challenge nonce → client signs with Tezos wallet → server verifies ed25519 → session
- **OAuth**: Google/GitHub for login; Twitter/Discord for linking to existing session

### 4.3 API Endpoints by Domain

#### Auth (`auth/routes.ts`)
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/auth/user` — current session user
- `POST /api/auth/wallet/challenge`, `/verify`, `/register` — wallet login flow
- `GET /api/auth/google`, `/callback`; `GET /api/auth/github`, `/callback`
- `GET /api/auth/twitter`, `/callback`; `GET /api/auth/discord`, `/callback`

#### Gameshow (`seasons.ts`, `challenges.ts`, `side-quests.ts`)
- `GET/POST /api/seasons`, `GET/PUT/DELETE /api/seasons/:id`
- `GET/POST /api/rounds`, `GET/PUT/DELETE /api/rounds/:id`
- `GET/POST /api/challenges`, `GET/PUT /api/challenges/:id`
- `POST /api/challenges/:id/submit`, `PUT /api/submissions/:id/grade`, `PUT .../reward`
- `GET/POST /api/side-quests`, `GET/PUT /api/side-quests/:id`
- `POST /api/side-quests/:id/complete`, `PUT /api/side-quest-completions/:id/approve`

#### Social (`messages.ts`, `board.ts`, `w.ts`, `notifications.ts`)
- DMs: `GET/POST /api/messages/dms`, threads, read status
- Board: categories, channels (threads), replies, reactions, permissions, webhooks
- W feed: `GET /api/w/timeline`, reply/like/repost/quote
- Notifications: `GET /api/notifications`, preferences, mark-read

#### Market (`marketplace.ts`, `barter.ts`, `dex.ts`)
- `GET /api/marketplace/onchain` — live TzKT storage snapshot
- `GET /api/marketplace`, `/mine`, `/:id` — DB listings
- `POST /api/marketplace` — create listing/auction
- Bids, buys, cancels, settlements
- `GET /api/barter/onchain`, `/trade-board`
- DEX: `/api/dex/tokens`, `/pools`, `/counterparts`, `/health`

#### Wallets & Tokens (`wallets.ts`)
- `GET/POST/DELETE /api/wallets` — link/unlink wallets
- `POST /api/wallets/challenge`, `POST /api/wallets` — wallet verification
- `GET /api/profile/tokens` — owned token index (supports `createdByMe`, `onTradeBoard`, search, pagination up to 500)
- `POST /api/profile/tokens/sync` — trigger TzKT re-sync
- `POST /api/profile/tokens/trade-board` — toggle tokens on trade board

#### TV Microapp (`tv.ts`)
- Channels: CRUD, stream endpoint, slug lookup
- Videos: add from tokens or manual source
- Playlists: create, reorder items, set active
- Schedule: CRUD time-slot entries
- Bumpers: upload/list/delete, community pool
- Cache proxy: `GET /api/tv/cache/media`, `GET /api/cache/media`
- WTF TV auto-channel: config, initialize, refresh

#### Media Library (`media-library.ts`)
- `GET /api/media/mine` — user's centralized media items
- `POST /api/media/import-token` — import from owned Tezos token
- `POST /api/media/upload` — direct file upload (base64, max 25MB)
- `GET /api/media/:id/file` — serve uploaded file data
- `PUT/DELETE /api/media/:id` — update/remove

#### Admin (`admin.ts`)
- User management, role assignment, XP awards
- Stats dashboard, reward ledger, batch pay
- Role permissions CRUD
- WTF TV channel config (auto-playlist settings)
- Desktop app visibility toggles

#### Profile (`profile.ts`)
- Account/social editing, PFP management
- Public user profiles, trade boards, activity

#### Other
- `GET /api/health` — service health check
- `POST /api/contract-activity` — client-side blockchain telemetry
- `GET/PUT /api/apps/desktop` — desktop icon toggles
- `GET /api/links`, `GET /api/faq` — content endpoints

### 4.4 WebSocket (`server/websocket.ts`)

- Path: `/ws` on the HTTP server
- Auth: parses `connect.sid` cookie → validates session from Postgres → loads user
- Messages: `join_channel`, `leave_channel`, `chat_message`, `typing`
- Enforces board-channel permissions + slow mode
- Only runs in long-lived Node process (not Netlify Functions)

### 4.5 Server Utilities (`server/lib/`)

| Module | Purpose |
|--------|---------|
| `permissions.ts` | Effective permissions per role (DB overrides + defaults), 30s cache |
| `roles.ts` | Role normalization and rank comparison |
| `board-channel-permissions.ts` | Per-channel ACLs (view, post, slow mode) |
| `network-safety.ts` | SSRF protection for user-supplied URLs |
| `media-utils.ts` | MIME detection, IPFS normalization, playable/image asset extraction |
| `desktop-apps.ts` | Desktop app config from DB |
| `xp.ts` | XP award transactions |
| `notifications.ts` | Notification creation and preference management |
| `notify-hosts.ts` | System DMs to admin-capable roles |

---

## 5. Database Schema (Drizzle ORM + PostgreSQL)

### 5.1 Core Tables

```
users
  ├── user_wallets (1:N)
  ├── user_owned_tokens (1:N, synced from TzKT)
  ├── wallet_auth_nonces (for wallet login)
  ├── sessions (connect-pg-simple)
  ├── role_permissions (per-role overrides)
  └── user_notification_preferences
```

### 5.2 Gameshow Tables

```
seasons (1:N rounds)
  └── rounds (1:N challenges)
       └── challenges (1:N submissions)
            ├── challenge_submissions
            └── challenge_reward_flags (claimable/claimed)
```

### 5.3 Social Tables

```
dm_conversations
  ├── dm_conversation_participants
  └── dm_messages

board_categories (1:N threads)
  └── board_threads (channels)
       ├── board_thread_replies (1:N)
       │    └── board_reactions
       ├── board_channel_permissions
       └── board_webhooks

channels (legacy gameshow chat)
  └── messages
```

### 5.4 Market Tables

```
marketplace_listings
  └── marketplace_bids (1:N)

side_quests
  └── side_quest_completions
```

### 5.5 TV & Media Tables

```
tv_channels (1:N per user)
  ├── tv_channel_videos
  ├── tv_playlists
  │    └── tv_playlist_items (M:N videos)
  ├── tv_schedule_entries → user_media_library
  └── tv_wtf_channel_config (auto-playlist settings)

tv_bumpers (per user, binary data)

user_media_library (centralized: token imports + uploads)
```

### 5.6 Other Tables

```
xp_events, reward_ledger, contract_activity_logs,
user_notifications, links, faq_items, desktop_app_settings
```

### 5.7 Role Hierarchy

```
admin > host > cohost > resident_wizard > contestant > witness
```

Permissions follow a Discord-style model: default grants per role + DB overrides in `role_permissions`. ~40+ permission keys across categories: dashboard, game, social, market, moderation, admin.

---

## 6. Blockchain Integration

### 6.1 On-Chain Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| WTF Token (FA2) | `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD` | Gameshow fungible token |
| Marketplace V1.2 | `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj` (env-configurable) | Listings, auctions, offers with WTF settlement |
| Barter Board V1.2 | `KT1WupvcfcSsfp78JPCc6NwKdkdineGfGNdm` (env-configurable) | FA2 ↔ FA2 escrow trades |
| SpicySwap Router | `KT1PwoZxyv4XkPEGnTqWYvjA1UYiPTgAGyqL` | DEX swap routing |
| WTZ Wrap/FA2 | `KT1Pyd1r9F4nMaHy8pPZxPSq6VCn9hVbVrf4` / `KT1PnUZCp3u2KzWr93pn4DD7HAJnm3rWVrgn` | XTZ ↔ WTZ wrapping for DEX |

### 6.2 Wallet Connection Flow

```
User clicks "Connect Wallet"
  → WalletContext.connect()
    → Try Octez Connect SDK (preferred)
    → Fallback to BeaconWallet
    → Sync BeaconWallet active account from Octez
    → Wire into Taquito TezosToolkit
    → POST /api/wallets (link wallet to account)
    → POST /api/profile/tokens/sync (initial sync)
```

### 6.3 Token Sync Pipeline

```
TzKT API (tokens/balances?account={address}&token.standard=fa2)
  → Parse metadata, thumbnails, creator addresses
  → Upsert into user_owned_tokens (Drizzle)
  → Delete stale rows (tokens no longer held)
  → Synthetic WTF balance row from token-specific query

Triggers:
  - On wallet link
  - Manual refresh (POST /api/profile/tokens/sync)
  - Scheduled (Netlify cron: token-sync every 4 hours)
```

### 6.4 On-Chain ↔ Off-Chain Data Flow

```
WRITES (browser → chain):
  Client → Taquito → Tezos RPC → on-chain operation
  Client → /api/contract-activity (telemetry)

READS (chain → server → client):
  Server → TzKT API → contract storage / bigmaps → enriched with Postgres user data
  Server → user_owned_tokens (cached from TzKT sync)
  Client → /api/marketplace/onchain, /api/barter/onchain, /api/profile/tokens
```

### 6.5 Smart Contract Source

| File | Version |
|------|---------|
| `contracts/WTFMarketplace.py` | V1 (legacy) |
| `contracts/WTFMarketplaceV1_2.py` | V1.2 (active) — owner-scoped indexes, stricter rules, offer refunds, royalty policy |
| `contracts/WTFBarterBoard.py` | V1 (legacy) |
| `contracts/WTFBarterBoardV1_2.py` | V1.2 (active) — hardened barter with package/choice modes |

Test scenario outputs live in root folders (`create_auction_rejects_*`, `listing_buy_clears_*`, etc.) — SmartPy compilation artifacts, not runtime code.

---

## 7. Media & IPFS Pipeline

### 7.1 MIME Type Resolution

Token metadata can contain misleading MIME types from CDN previews (e.g., Objkt serves WebP thumbnails). The resolution chain in `shared/token-media.ts`:

1. Match `formats[]` entry whose URI matches `artifactUri` → use that row's MIME
2. Root `mimeType` / `mime_type` field on metadata
3. If multiple formats and one is WebP + others are not → deprioritize WebP
4. First format entry
5. Extension guess on `artifactUri` only (never `displayUri` / thumbnails)

### 7.2 Media Cache Proxy

```
Client requests /api/cache/media?url={ipfs-gateway-url}
  → Server fetches from IPFS (multiple gateway fallbacks)
  → Streams to local disk cache (configurable dir, max age, max bytes)
  → Serves cached file with correct Content-Type
```

### 7.3 Centralized Media Library

```
User-owned tokens (synced from chain)
  ↓ (import via /api/media/import-token)
user_media_library table
  ↑ (upload via /api/media/upload, max 25MB base64)
Direct file uploads

Media items are then available to:
  - TV microapp (playlists, schedule)
  - Message board (future)
  - Any feature needing user media
```

---

## 8. Deployment Architecture

### 8.1 Netlify Configuration

```toml
[build]
  command = "npm run build:netlify"
  publish = "dist/public"          # Vite static output
  functions = "dist/functions"      # esbuild serverless bundle

[functions]
  node_bundler = "esbuild"
  external_modules = ["pg-native", "connect-pg-simple", ...]

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/api/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 8.2 Build Pipeline

```
npm run build:netlify
  → vite build                          → dist/public/ (SPA)
  → esbuild netlify/functions/api.ts    → dist/functions/api.cjs (Express via serverless-http)
```

### 8.3 Scheduled Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `token-sync` | Every 4 hours | Sync all linked wallets' FA2 holdings from TzKT, update `user_owned_tokens`, cleanup expired auth nonces |

### 8.4 Environment Variables

**Public (safe for client/repo):** `PUBLIC_SITE_URL`, `CORS_ALLOWED_ORIGINS`, `TEZOS_NETWORK`, `TEZOS_RPC_URL`, contract addresses, Supabase URL/anon key, OAuth client IDs, TV cache settings, W feed settings.

**Secret (host-only):** `DATABASE_URL`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, OAuth client secrets, `X_BEARER_TOKEN`, `TWITTER_TOKEN_ENCRYPTION_KEY`.

---

## 9. Key Pipelines

### 9.1 User Registration → First Experience

```
Register (username/password or wallet)
  → Session created
  → Dashboard loads (stats, WTF balance)
  → Connect wallet prompt
    → Wallet linked → tokens synced → owned tokens appear in profile
  → Start Menu available: explore rounds, marketplace, TV, etc.
```

### 9.2 Token → Media Library → TV Channel

```
User syncs wallet → tokens appear in user_owned_tokens
  → My Videos page → "Import from Tokens" tab
    → Filter by video MIME (artifact-aware, not CDN preview)
    → Import → creates user_media_library row (sourceType: "ipfs")
  → TV → Creator Tools → Add From Tokens (or pick from library)
    → Add to channel videos → arrange in playlist
    → Playlist loops 24/7 with bumper transitions
    → Schedule overrides for specific time slots
```

### 9.3 Marketplace Trade Flow

```
Seller:
  1. Connect wallet → sync tokens
  2. Select token → Create listing (buy-now or auction)
  3. Client: update_operators (FA2) + create_listing (marketplace contract)
  4. Activity logged to contract_activity_logs

Buyer:
  1. Browse /api/marketplace/onchain (TzKT snapshot)
  2. Buy / bid / place offer
  3. Client: approve WTF + call marketplace entrypoint
  4. Settlement: marketplace contract transfers token + WTF

Server:
  - Periodically reads TzKT for fresh marketplace state
  - Enriches with user profiles from Postgres
```

### 9.4 Message Board Flow

```
Board categories → threads (channels)
  → replies (with attachments, reactions)
  → WebSocket for real-time chat (join_channel, chat_message, typing)
  → Permissions: per-channel ACLs + role-based + slow mode
  → Webhooks for external integration
```

---

## 10. Scripts & Tools

| Script | Purpose |
|--------|---------|
| `scripts/seed-admin.ts` | Create/update admin user |
| `scripts/check-db-connection.mjs` | Validate DATABASE_URL connectivity |
| `scripts/resolve-database-url.mjs` | Build Supabase pooler URL from project ref |
| `scripts/check-external-links.mjs` | Audit `target="_blank"` links for safe `rel` |
| `scripts/test-marketplace-contract.sh` | Run SmartPy tests + compile V1.2 contracts |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `npm run check` | TypeScript type check (`tsc --noEmit`) |

---

## 11. File Tree Summary

```
WTF/
├── client/src/
│   ├── main.tsx                 # Entry + polyfills
│   ├── App.tsx                  # Routes, providers, window renderer
│   ├── global-styles.ts         # Win95 global CSS
│   ├── components/
│   │   ├── layout/              # Desktop, Taskbar, StartMenu, AppWindow
│   │   ├── TokenCard.tsx        # Shared token display + detail modal
│   │   ├── OwnedTokensGallery.tsx  # Paginated token gallery
│   │   ├── BarterBoard.tsx      # Barter trade UI
│   │   ├── WalletButton.tsx     # Connect/disconnect button
│   │   └── UserLink.tsx         # Profile link component
│   ├── pages/                   # All route pages (25+)
│   └── lib/
│       ├── api.ts               # HTTP client
│       ├── auth-context.tsx     # Auth state
│       ├── wallet-context.tsx   # Wallet state
│       ├── window-context.tsx   # Window manager
│       ├── media-resolve.ts     # IPFS/media helpers
│       ├── hamster-emoji.ts     # Custom emoticons
│       └── tezos/               # Blockchain integration
├── server/
│   ├── index.ts                 # HTTP + WebSocket server
│   ├── app.ts                   # Express middleware stack
│   ├── routes.ts                # Route registration
│   ├── db.ts                    # Database connection
│   ├── websocket.ts             # WebSocket handler
│   ├── auth/                    # Authentication (Passport, sessions, OAuth, wallet)
│   ├── routes/                  # All API route files (20+)
│   ├── lib/                     # Server utilities
│   ├── tzkt.ts                  # TzKT indexer client
│   ├── tzprofiles.ts            # Tezos profile resolution
│   └── teznames.ts              # Tezos domain resolution
├── shared/
│   ├── schema.ts                # Drizzle ORM schema (35+ tables)
│   ├── types.ts                 # Shared types, constants, WTF token, roles, permissions
│   └── token-media.ts           # Artifact MIME resolution
├── contracts/
│   ├── WTFMarketplaceV1_2.py    # SmartPy marketplace contract
│   └── WTFBarterBoardV1_2.py    # SmartPy barter contract
├── netlify/
│   ├── functions/api.ts         # Serverless Express wrapper
│   └── functions/token-sync.ts  # Scheduled token sync worker
├── scripts/                     # Build/seed/test utilities
├── netlify.toml                 # Deployment config
├── drizzle.config.ts            # DB migration config
├── vite.config.ts               # Client build config
└── package.json                 # Dependencies + scripts
```
