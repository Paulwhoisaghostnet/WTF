# Public API, MCP, and Access Routes

Last reviewed: 2026-05-09

This page is the public-facing index for the WTF Gameshow access surface:
browser routes, JSON APIs, MCP agent pairing, embeds, media playback, and
realtime access. It is safe to publish. It intentionally avoids private schema
details, staff-only payload internals, secrets, and unsupported maintenance
routes.

For production examples, replace the origin with the active deployment origin,
usually `https://wtfgameshow.app`. For local development, use
`http://localhost:3000`.

## Access Model

| Mode | How it authenticates | Intended use |
| --- | --- | --- |
| Anonymous public | No credential | Public pages, published content, public Tezos/IPFS/Objkt/TzKT-derived rows, public TV playback, embeds, health checks. |
| Browser session | `connect.sid` cookie from normal login | User account actions, profile settings, wallet-linked actions, messages, media library, Studio, personal TV controls. |
| Paired MCP agent | `Authorization: Bearer wtf_mcp_...` on `/mcp` | Agent acts for the paired user after the user creates a token in settings. |
| Role-gated session | Browser session plus permissions | Admin panel, control board, content management, TV management, app enable/disable controls. |
| Trusted creator session | Browser session with `trusted_creator` role or matching trusted creator permissions | Narrow creator lanes that bypass manual review where explicitly supported: `trusted_arcade_creator`, `trusted_console_creator`, `trusted_tv_creator`, and `trusted_market_creator`. |
| Discord bot | Server-to-server bot credentials/HMAC where configured | Dicksword proof/activity and Discord role automation. |
| WebSocket | Browser session cookie on `/ws` | Live board and Studio presence/events for signed-in users. |

## Public Data Boundary

Public data includes rows derived from public sources:

- Tezos blockchain state and operation data.
- TzKT responses.
- Objkt marketplace/token data.
- IPFS-hosted metadata and media references.
- WTF database rows that cache, normalize, summarize, or join those public
  sources, such as token metadata, market summaries, public trade-board rows,
  public listings, and public TV channel metadata.

Private data must not be exposed through anonymous APIs or public-data MCP
tools:

- Email addresses unless the user made the email public.
- OAuth access tokens, refresh tokens, Discord/X/GitHub/Google private state,
  and login/session material.
- Direct messages, notification inboxes, private Studio projects, unpublished
  media-library files, private uploads, and admin/control-board data.
- Wallet-linked account mutations unless a signed-in user session or paired MCP
  token authorizes the paired user's own account.

When in doubt, publish read-only on-chain/IPFS-derived facts and keep account
state private.

MCP bearer access is intentionally not a browser login method. `/mcp` ignores
browser-session identity, rejects cookie-only access, and does not emit
`Set-Cookie`, so a paired-agent call cannot create, rotate, replace, or clear a
user's normal site session.

MCP bearer access is also bounded by the account that created the token. Token
scopes are normalized against that WTF account role when the token is created
and again when it is used, so hand-posted scopes such as `*`, `arcade:*`, or
`arcade:admin` are not effective for non-admin users. Admin MCP tools still
require both an admin account and the matching admin scope.

## Rate Limits and CORS

| Surface | Default limit |
| --- | --- |
| Generic `/api/*` JSON routes | 200 requests per minute per key/IP, except narrow read-only playback routes. |
| `/api/auth/login`, `/api/auth/register` | 20 attempts per 15 minutes. |
| Wallet auth routes | 30 attempts per 15 minutes. |
| OAuth start routes | 15 attempts per 15 minutes. |
| `/mcp` | `MCP_AGENT_RATE_LIMIT_PER_MINUTE`, default 60 requests per minute per MCP token. |
| TV cache prefetch | 12 requests per minute. |
| Media upload | 20 requests per 15 minutes. |

Production CORS is credentialed and allow-list based. Set `PUBLIC_SITE_URL` or
`CORS_ALLOWED_ORIGINS` before boot. Non-browser integrations should prefer
server-to-server reads for public endpoints or MCP bearer-token access for
paired agent workflows.

## Browser Routes

Public browser routes render without a signed-in session:

| Route | Purpose |
| --- | --- |
| `/` | Public landing/login entry surface. |
| `/login`, `/register` | Account auth screens. |
| `/leaderboard` | WTF holder and XP leaderboards. |
| `/gallery` | Public gallery surface. |
| `/links` | Curated public links. |
| `/faq` | Public FAQ. |
| `/user/:username` | Public profile view. |
| `/messageboard` | Public board/thread surface where channel rules allow viewing. |
| `/wtf-recapture` | Public WTF Recapture game surface. |
| `/arcade` | WTF Arcade public catalog, paid play entry, leaderboards, and community games. |
| `/discord/terms`, `/discord/privacy`, `/discord/linked-roles` | Discord app public policy and linked-role pages. |
| `/embed/tv/:ref` | Public WTF TV iframe player by dial, slug, or id. |
| `/oembed` | Public oEmbed metadata for TV embeds. |

Signed-in user routes include `/dashboard`, `/rounds`, `/challenges`,
`/side-quests`, `/messages`, `/marketplace`, `/trade-boards`, `/w`, `/tv`,
`/dicksword`, `/i-hate-telegram`, `/console`, `/swap`, `/profile`, `/desktop-settings`, `/hoard`,
`/my-videos`, `/my-photos`, `/studio`, `/game-studio`, `/my-gallery`, and
creation tools.

Staff routes include `/admin` and `/control-board`; they require the appropriate
role/permission.

## Public JSON API

All JSON API routes are under `/api/*` unless noted. Session-only routes use the
normal browser cookie. Role-gated routes also require the relevant permission.

### Health, Config, and Public Content

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/health` | Public | Kernel readiness snapshot: DB reachability, chain/indexer config, contract config, package/commit version, scheduler audit visibility, uptime, and timestamp. Returns HTTP 503 when readiness fails. |
| `GET /api/health/disk` | Public/ops-facing | TV cache disk utilization. Safe for external monitors. |
| `GET /api/access` | Public | Read-only standard access manifest covering browser routes, public JSON APIs, MCP endpoint/scopes, app-gate state, and the separation between browser cookies and paired-agent bearer tokens. |
| `GET /api/apps/desktop` | Public | Current admin feature gates for desktop sub-apps. |
| `GET /api/links` | Public | Curated links. Writes require `manage_content`. |
| `GET /api/faq` | Public | FAQ items. Writes require `manage_content`. |
| `GET /api/arcade/games` | Public | WTF Arcade public catalog: compatible-source games plus approved creator submissions; excludes Console stock titles. |
| `GET /api/arcade/stats` | Public | WTF Arcade catalog, score, player, compatible-source, and play-fee summary. |
| `GET /api/arcade/discovery` | Public | WTF Arcade discovery shelves. |
| `GET /api/arcade/play-fee` | Public | Current WTF Arcade play-ticket pricing from the in-app market configuration. |
| `GET /api/arcade/games/:slug` | Public | WTF Arcade game detail with payment metadata and leaderboard when enabled. |
| `GET /api/arcade/leaderboard/:slug` | Public | WTF Arcade leaderboard for an active public game. |
| `GET /api/arcade/recent` | Public | Recent valid WTF Arcade score submissions. |
| `GET /api/arcade/champions` | Public | Current WTF Arcade title holders from valid score stats. |
| `GET /api/arcade/player/:username` | Public | Cross-game WTF Arcade player profile and best-score summary. |
| `GET /api/arcade/source/*` | Public asset proxy | Same-origin proxy for WTF Arcade compatible-source bundles and covers; catalog rows preserve upstream source URL, builder, platform, and open-source license attribution. |
| `GET /api/console/demo-cartridges` | Public | Stock Console cartridges installed for every user: Commander Keen, Adrift, and stock WTF Console games. |
| `GET /api/console/games` | Public/session-shaped | WTF Console catalog: stock Console titles plus the signed-in user's owned wallet/media cartridges when a session is present. |
| `GET /api/console/published` | Public | Active stock WTF Console games. |
| `GET /api/console/leaderboard/:slug` | Public | Console leaderboard for a stock Console game. |
| `GET /api/console/recent` | Public | Recent valid Console score submissions for stock Console games. |
| `GET /api/console/champions` | Public | Current stock Console title holders from valid score stats. |
| `GET /api/console/player/:username` | Public | Cross-game Console player profile and best-score summary for stock Console games. |
| `GET /api/console/sdk.js` | Public asset | Browser SDK used by WTF Arcade, WTF Console, and Game Studio SDK bundles. |
| `GET /api/console/bundles/*` | Public asset | Versioned, server-validated creator bundles extracted from ZIP submissions. |
| `GET /api/game-studio/templates` | Public | Creator templates wired to the WTF Game SDK. |
| `GET /api/game-studio/targets` | Public | Publish/build targets for WTF Arcade and personal Console media. |
| `GET /api/game-studio/assets` | Public | Stock asset catalog. |
| `GET /api/game-studio/snippets` | Public | Reusable SDK code snippets for creators. |
| `GET /api/game-studio/assets/:id/raw` | Public asset | Generated stock asset placeholder payload. |
| `GET /api/game-studio/templates/:id/scaffold` | Public | Starter source files for a selected template. |
| `POST /api/system/logs/client` | Public write | Client diagnostic logging with endpoint-specific rate limits and bounded payload metadata. |

### Auth and Account Entry

| Route | Access | Notes |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Create local account. Rate limited. |
| `POST /api/auth/login` | Public | Create browser session. Rate limited. |
| `POST /api/auth/logout` | Session | End browser session. |
| `GET /api/auth/csrf-token` | Session/browser | Issue the session-bound CSRF token used by cookie-authenticated mutating API requests. |
| `GET /api/auth/user` | Session | Current signed-in user. |
| `POST /api/auth/change-password` | Session | Change or set local password. |
| `GET /api/auth/social/config` | Public | Which social providers are configured. |
| `GET /api/auth/:provider` and callbacks | Session/public callback mix | Google, GitHub, Twitter/X, and Discord OAuth flows. |
| `POST /api/auth/wallet/challenge` | Public | Create wallet login nonce. Rate limited. |
| `POST /api/auth/wallet/verify` | Public | Verify wallet signature and sign in existing user. |
| `POST /api/auth/wallet/register` | Public | Create account from wallet proof. |

### WTF Arcade, Console, and Game Studio SDK

| Route | Access | Notes |
| --- | --- | --- |
| `POST /api/arcade/play-intents` | Session | Creates an in-app market WTF payment intent for a WTF Arcade play ticket. Trusted creators/admins can receive an auditable bypass where configured. |
| `GET /api/arcade/play-status` | Session | Returns the signed-in user's Arcade ticket count, trusted/admin bypass status, and current payment wiring. |
| `POST /api/arcade/session` | Session | Creates an expiring signed WTF Arcade play ticket after payment or trusted bypass validation. |
| `POST /api/arcade/scores` | Session | Submits a score against a signed one-use WTF Arcade play ticket and configured score caps. |
| `POST /api/arcade/games/:slug/report` | Session | Opens an accountable moderation report for an active WTF Arcade game. Stock Console games are not accepted on this surface. |
| `GET /api/arcade/my-games` | Session | Games submitted by the signed-in creator to WTF Arcade. |
| `POST /api/arcade/submit` | Session | Validates/extracts a ready ZIP game asset from `user_media_library` and submits it to WTF Arcade moderation or trusted creator auto-publish. |
| `POST /api/arcade/submit` with `updateSlug` | Session | Submits a new version for a creator-owned WTF Arcade game; trusted Arcade/Game creators auto-promote, otherwise the current public version stays live until admin approval. |
| `GET /api/arcade/admin/games` | Staff | WTF Arcade moderation queue for pending, active, rejected, removed, or all games. |
| `POST /api/arcade/admin/games/:slug/:action` | Staff | Approve, reject, remove, or restore a submitted WTF Arcade game. |
| `POST /api/arcade/admin/source-import` | Staff | Runs the WTF Arcade compatible-source check worker on demand. Production also runs it every 12 hours, preserves source URL, builder, platform, and open-source license attribution metadata, and records a health audit even when nothing changed. |
| `GET /api/arcade/admin/reports` | Staff | WTF Arcade report queue for open, reviewing, resolved, dismissed, or all reports. |
| `POST /api/arcade/admin/reports/:id/:action` | Staff | Review, resolve, dismiss, or reopen a WTF Arcade game report. |
| `GET /api/arcade/admin/audit` | Staff | WTF Arcade audit trail for moderation, submissions, compatible-source checks, and trusted creator publish actions. |
| `GET /api/console/cartridges` | Session | Signed-in user's wallet/media game cartridges. |
| `POST /api/console/session` | Session | Creates an expiring signed play ticket for a stock Console game. |
| `POST /api/console/scores` | Session | Submits a score against a signed one-use Console play ticket and configured score caps. |
| `POST /api/console/games/:slug/report` | Session | Opens an accountable moderation report for a stock Console game only. |
| `GET /api/console/my-games` | Session | Compatibility response; public creator submissions live in WTF Arcade. |
| `POST /api/console/submit` | Session | Gone. Public game submissions belong to `/api/arcade/submit`. |
| `GET /api/console/admin/audit` | Staff | Console-surface audit trail for stock Console games. |
| `GET/POST /api/console/admin/games*` | Staff | Compatibility response; public game moderation belongs to WTF Arcade. |
| `GET/POST /api/console/admin/reports*` | Staff | Compatibility response; public game reports belong to WTF Arcade. |
| `GET /api/game-studio/upload-target` | Public | Describes media upload and WTF Arcade submit wiring for creators. |
| `POST /api/game-studio/scaffold` | Public | Generates starter source files for a template id. |
| `GET /api/game-studio/projects` | Session | Lists the signed-in creator's saved Game Studio projects. |
| `POST /api/game-studio/projects` | Session | Creates a saved Game Studio project from a template, source files, stock assets, and uploaded local assets. Local assets are type-checked and capped before draft save. |
| `GET /api/game-studio/projects/:id` | Session | Loads a saved project owned by the signed-in creator. |
| `PATCH /api/game-studio/projects/:id` | Session | Saves project title, template, source files, and asset selections. Uploaded local assets are type-checked and capped before draft save. |
| `GET /api/game-studio/projects/:id/builds` | Session | Lists versioned build records with size, checksum, manifest, and source snapshot for the signed-in creator's project. |
| `POST /api/game-studio/projects/:id/build` | Session | Builds an SDK-compatible ZIP bundle server-side, validates it against game bundle rules, stores a checksum/source snapshot, and returns upload-ready file data. |
| `POST /api/game-studio/projects/:id/submit` | Session | Builds a saved project server-side and submits it directly to WTF Arcade review or trusted creator auto-publish, preserving build checksum/source snapshot metadata. |

### Profiles, Leaderboards, and Trade Boards

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/leaderboard` | Public | WTF holder leaderboard with Tezos names/profile enrichment. |
| `GET /api/leaderboard/xp` | Public | App XP leaderboard. |
| `GET /api/leaderboard/transfers` | Public | Recent WTF token transfers from TzKT. |
| `GET /api/users/:username` | Public shaped response | Returns public profile fields; email/social handles only when public or owner/admin. |
| `GET /api/users/:username/trade-board` | Public | Public trade-board tokens for a user's linked wallets. |
| `GET /api/users/:username/listings` | Public | Active marketplace listings for a user. |
| `GET /api/users/:username/activity` | Public | Recent public XP activity. |
| `GET /api/users/:username/dm` | Session | Private direct-message lookup with that user. |

### Message Board

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/board/categories` | Public | Board category index. |
| `GET /api/board/channels` | Public visibility-gated | Returns channels viewable by anonymous/public role and signed-in role when present. |
| `GET /api/board/channels/:id/messages` | Public visibility-gated | Channel messages if channel rules allow viewing. |
| `GET /api/board/channels/:id/pins` | Public visibility-gated | Pinned channel messages. |
| `POST/PUT/DELETE /api/board/*` | Session/role-gated | Posting, moderation, channel management, and webhooks require auth/permissions or configured webhook token. |
| `GET /api/messages/threads*` | Public/deprecated | Legacy thread API. Responses carry deprecation headers and successor link to `/api/board/channels`. |
| `/api/messages/dms*` | Session | Direct messages. Never public. |

### I Hate Telegram

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/telegram-digest/config` | Public | Bridge readiness flags; no credentials are returned. |
| `GET /api/telegram-digest/sources` | Public | Approved, public-visible Telegram digest sources. |
| `GET /api/telegram-digest/messages` | Public | Public-visible digest messages and FART NOISES alerts from approved sources. |
| `POST /api/telegram-digest/bot/update` | Bot | Signed Telegram bridge ingest using the WTF HMAC or configured Telegram secret token. |
| `/api/telegram-digest/me/farts*` | Session | User-owned FART NOISES wallet tracking readiness. |
| `/api/telegram-digest/admin/*` | Staff | Source curation and WTF announcement queue. |

### Market, Token, and DEX Data

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/marketplace/onchain` | Public | Marketplace contract snapshot from TzKT. |
| `GET /api/marketplace/trade-board` | Public | Trade-board listing cache. |
| `GET /api/marketplace` | Public | Active WTF marketplace listings. |
| `GET /api/marketplace/:id` | Public | Listing detail. |
| `POST /api/in-app-market/creator-items` | Trusted creator session | Creates an EXP-priced in-app market item for a user with `trusted_market_creator`; items are active immediately and carry creator provenance in metadata. |
| `GET /api/barter/onchain` | Public | Barter board contract snapshot from TzKT. |
| `GET /api/barter/trade-board` | Public | Barter/trade-board rows. |
| `GET /api/dex/tokens` | Public | Active SpicySwap token list. |
| `GET /api/dex/pools` | Public | Active SpicySwap pools. |
| `GET /api/dex/counterparts/:tag` | Public | Ranked swap counterparts for a token tag. |
| `GET /api/dex/health` | Public | SpicySwap upstream health summary. |
| `GET /api/dex/pools/:pairId/metrics` | Public | Daily pool metrics. |
| `GET /api/wtf-auctions` and `GET /api/wtf-auctions/:id` | Public | Auction index and detail. Auction writes require auth/contract verification. |
| `GET /api/buyback-windows/active` | Public | Active buyback window. Other buyback routes are role/session-gated. |

Marketplace and barter writes are authenticated and contract-aware. Agents can
prepare listing workflows, but on-chain listings still require a user wallet
signature and a verifiable operation hash.

### Calendar

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/calendar/events` | Public visibility-gated | Published events in a date window. Authenticated users may see role-visible events. |
| `GET /api/calendar/feed.ics` | Public visibility-gated | iCal feed for published events allowed for the viewer role. |
| `POST /api/calendar/tickets` | Session, contestant+ | Submit event requests. |
| `GET /api/calendar/tickets/mine` | Session | User's own tickets. |
| Review, manual event, and sync routes | `manage_gameshow` | Cohost/host/admin workflow. |

### WTF TV, Embeds, and Playback

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/tv/channels` | Public by default | Lists active public channels. `mine=1` requires session and returns owned channels. |
| `GET /api/tv/channels/by-dial/:dial` | Public | Resolve public channel by dial. |
| `GET /api/tv/channels/:channelId/embed` | Public | Embed metadata for public channel. |
| `GET /api/tv/channels/:channelId/stream` | Public | Deterministic playback queue for public channel. |
| `GET /api/tv/channels/:channelId/media/:mediaItemId/file` | Public playback | Channel-scoped media file access. |
| `GET /api/tv/cache/media` and `GET /api/cache/media` | Public playback proxy | Cache/media proxy for safe playback. |
| `POST /api/tv/playback/events` | Public write | Anonymous playback telemetry. |
| `POST /api/tv/telemetry/item-end` | Public write | Rate-limited item-end telemetry. |
| `GET /api/tv/bumpers/pool` | Public | Public bumper pool. |
| `GET /api/tv/bumpers/community` | Public | Public community bumper list. |
| `GET /api/tv/bumpers/:bumperId/media` | Public playback | Bumper media. |
| `GET /api/tv/channels/:channelId/now` | Public | Current channel item. |
| `GET /api/tv/channels/:channelId/schedule` | Public | Channel schedule. |
| `GET /api/tv/channels/by-slug/:slug/current` | Public | Current channel item by slug. |
| `GET /embed/tv/:ref` | Public HTML | Iframe player. |
| `GET /oembed` | Public JSON | oEmbed response for rich previews. |

TV channel management, uploads/imports, playlist writes, cache prefetch, cache
stats, private media files, and telemetry aggregates require a signed-in user
and often ownership or staff permissions.

### Dicksword

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/dicksword/config` | Public | Guild id, invite URL, OAuth availability, claim TTL, avatar asset path, command list. |
| `/api/dicksword/me`, claims, avatar selection | Session | Signed-in user Discord identity and avatar workflows. |
| Bot proof/activity/role-sync routes | Bot credentials/HMAC or staff session | Server-to-server Discord automation. |

### Not Public

These route families are intentionally session-only, owner-only, staff-only, or
bot-only unless a specific public route is listed above:

- `/api/admin/*`, `/api/control-board/*`, role and permission management.
- `/api/profile/*`, `/api/notifications/*`, `/api/w/*`.
- `/api/media/*` library routes, except public TV playback/cache proxies.
- `/api/studio*`, `/api/cockpit/*`, `/api/portfolio/*`.
- Full TV channel management and media upload/import workflows.

## MCP Agent Access

MCP is for user-approved agents that act on behalf of a signed-in WTF user. The
user must pair the agent first; anonymous MCP access is rejected.

### Pairing Flow

1. Sign in to WTF.
2. Open settings/desktop settings and find the Agent Pairing section.
3. Create a new MCP token with a recognizable name.
4. Copy the token immediately. WTF stores only a hash and cannot show the raw
   token again.
5. Configure the MCP client for the Streamable HTTP endpoint:

```json
{
  "mcpServers": {
    "wtf": {
      "url": "https://wtfgameshow.app/mcp",
      "headers": {
        "Authorization": "Bearer wtf_mcp_REPLACE_ME"
      }
    }
  }
}
```

### Token Management API

These endpoints require a normal browser session:

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/mcp/tokens` | Session | Lists token records, prefixes, scopes, last-used/revoked timestamps, and public endpoint. Raw tokens are never returned. |
| `POST /api/mcp/tokens` | Session | Creates a token. The raw token is returned once. Default cap is `MCP_MAX_ACTIVE_TOKENS_PER_USER`, default 20. |
| `DELETE /api/mcp/tokens/:id` | Session | Revokes one paired-agent token for the signed-in user. |

### MCP Transport

| Route | Access | Notes |
| --- | --- | --- |
| `GET/POST/DELETE /mcp` | MCP bearer token | Streamable HTTP MCP endpoint. Other methods return 405. Missing/invalid bearer tokens return 401. |

The endpoint defaults to the request origin plus `/mcp`; deployments can set
`MCP_PUBLIC_ENDPOINT` when the public endpoint differs from the incoming host.

### MCP Scopes and Tools

Default token scopes:

- `desktop:read`
- `desktop:write`
- `pet:read`
- `pet:write`
- `public-data:read`
- `arcade:read`
- `arcade:write`
- `console:read`
- `console:write`
- `game-studio:read`
- `game-studio:write`
- `market:write`
- `trade-board:write`

Current tools:

| Tool | Access type | Feature gate | What it does |
| --- | --- | --- | --- |
| `wtf_get_capabilities` | Read | All gates reported | Returns paired user context, token metadata, admin feature gates, rate-limit hints, and available workflows. |
| `wtf_get_desktop_appearance` | Read paired user | User token | Reads desktop color scheme, wallpaper, cursor, physics, and pet switch. |
| `wtf_set_desktop_appearance` | Mutate paired user | User token | Updates the paired user's appearance and custom colors. |
| `wtf_get_desktop_pet` | Read paired user | User token | Reads the paired user's pet state and care status. |
| `wtf_keep_desktop_pet_alive` | Mutate paired user | User token | Applies safe pet care actions for the paired user's pet. |
| `wtf_search_public_tokens` | Public data read | `gallery` | Searches public token metadata and market summaries derived from Objkt, TzKT, IPFS, and chain data. |
| `wtf_list_unlisted_trade_board_tokens` | Public data read | `hoard` | Finds public trade-board tokens without active WTF listing rows. |
| `wtf_set_trade_board_tokens` | Mutate paired user | `hoard` | Adds/removes tokens from the paired user's trade-board collection after ownership checks. |
| `wtf_prepare_single_edition_listing_workflow` | Read/planning | `hoard` | Prepares wallet-signature steps for a one-edition listing. Does not list on-chain by itself. |
| `wtf_list_public_tv_channels` | Public data read | `tv` | Lists active public TV channels. |
| `wtf_list_arcade_games` | Public data read | `arcade` | Lists active WTF Arcade games, including compatible-source and creator-submitted titles. |
| `wtf_get_arcade_stats` | Public data read | `arcade` | Reads public Arcade counts, play totals, compatible-source freshness, and play-fee config. |
| `wtf_get_arcade_play_fee` | Public data read | `arcade` | Reads the current Arcade play-ticket SKU, WTF price, and contract wiring. |
| `wtf_get_arcade_play_status` | Paired user read | `arcade` | Reads the paired user's Arcade ticket count, trusted/admin bypass status, and play readiness. Requires `arcade:read`. |
| `wtf_create_arcade_play_intent` | Mutate paired user | `arcade` | Creates an in-app market WTF payment intent for one Arcade play ticket. Requires `arcade:write` and `market:write`. |
| `wtf_list_arcade_audit_events` | Staff read | `arcade` | Lists Arcade audit events for staff tokens. Requires `arcade:admin` and a staff user. |
| `wtf_run_arcade_source_import` | Staff mutation | `arcade` | Runs the Arcade compatible-source check worker immediately. Requires `arcade:admin` and a staff user. |
| `wtf_list_console_games` | Paired user read | `console` | Lists the paired user's WTF Console personal library: stock cartridges plus owned media. Requires `console:read`. |
| `wtf_get_console_stats` | Public data read | `console` | Reads stock Console game, player, and score totals. |
| `wtf_get_console_discovery_shelves` | Public data read | `console` | Reads stock Console discovery shelves. |
| `wtf_list_console_players` | Public data read | `console` | Lists Console player summaries for stock games. |
| `wtf_list_console_recent_scores` | Public data read | `console` | Lists recent valid Console scores for stock games. |
| `wtf_list_console_audit_events` | Staff read | `console` | Lists Console audit events for staff tokens. Requires `console:admin` and a staff user. |
| `wtf_list_game_studio_assets` | Public data read | `game-studio` | Lists Game Studio templates and stock assets. |
| `wtf_list_game_studio_snippets` | Public data read | `game-studio` | Lists reusable WTF Game SDK snippets for creator workflows. |
| `wtf_list_game_studio_targets` | Public data read | `game-studio` | Lists Arcade publish and Console owned-media build targets. |
| `wtf_create_game_studio_scaffold` | Read/planning | `game-studio` | Generates starter source files wired to the WTF Game SDK. |
| `wtf_build_game_studio_bundle` | Build artifact | `game-studio` | Builds an SDK-compatible ZIP from a template and selected stock assets; can include base64 file data on request. |
| `wtf_list_game_studio_projects` | Paired user read | `game-studio` | Lists saved projects owned by the paired user. Requires `game-studio:read`. |
| `wtf_create_game_studio_project` | Mutate paired user | `game-studio` | Creates a saved Game Studio project. Requires `game-studio:write`. |
| `wtf_update_game_studio_project` | Mutate paired user | `game-studio` | Updates a saved Game Studio project owned by the paired user. Requires `game-studio:write`. |
| `wtf_build_game_studio_project` | Build artifact | `game-studio` | Builds and records a saved project build snapshot. Requires `game-studio:write`. |
| `wtf_submit_game_studio_project_to_arcade` | Mutate paired user | `game-studio`, `arcade` | Builds a saved project and submits or updates a WTF Arcade game. Requires `game-studio:write` and `arcade:write`. |
| `wtf_create_trusted_creator_market_item` | Mutate paired user | `wtfiam` | Creates an EXP-priced in-app market item for paired users with `trusted_market_creator`. Requires `market:write`. |

MCP tools return either Markdown or JSON via `response_format`. Agent builders
should request JSON for automation and Markdown for human-readable summaries.

### Admin Feature Gates

Admins manage desktop sub-app availability through:

- `GET /api/admin/apps/desktop`
- `PUT /api/admin/apps/desktop/:appKey`

The public gate snapshot is available at `GET /api/apps/desktop`. MCP
capabilities include the same gate map. Gate-aware MCP tools fail closed when
their owning sub-app is disabled, so disabling `gallery`, `hoard`, `tv`,
`console`, or `game-studio`
also disables the matching agent workflows.

### Agent Safety Rules

- Agents act only for the paired user attached to the bearer token.
- Public-data tools may explore Tezos/TzKT/Objkt/IPFS-derived rows.
- Account mutations must stay scoped to the paired user's own settings, pet,
  trade board, or other explicitly scoped tool.
- On-chain marketplace actions require a user wallet signature and operation
  hash verification; MCP can prepare workflows but cannot silently sign for a
  user.
- Revoking a token immediately prevents further MCP use with that token.

## WebSocket

| Route | Access | Notes |
| --- | --- | --- |
| `wss://<origin>/ws` | Session cookie | Live board and Studio messages/presence. Unauthenticated sockets receive an error and close with policy violation. |

The WebSocket server validates the signed `connect.sid` cookie against the
session table. Agents should use MCP or JSON APIs rather than trying to attach
to browser-only realtime sessions.

## Change Policy

When adding, removing, or changing public behavior:

1. Update this document in the same change.
2. Keep public/private data boundaries explicit.
3. Add or update MCP tool docs when agent capabilities change.
4. Keep admin feature gates and MCP feature gates aligned.
5. Prefer additive route changes; mark deprecated routes with headers and a
   successor route before removing them.
