# Public API, MCP, and Access Routes

Last reviewed: 2026-05-05

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
| `/discord/terms`, `/discord/privacy`, `/discord/linked-roles` | Discord app public policy and linked-role pages. |
| `/embed/tv/:ref` | Public WTF TV iframe player by dial, slug, or id. |
| `/oembed` | Public oEmbed metadata for TV embeds. |

Signed-in user routes include `/dashboard`, `/rounds`, `/challenges`,
`/side-quests`, `/messages`, `/marketplace`, `/trade-boards`, `/w`, `/tv`,
`/dicksword`, `/console`, `/swap`, `/profile`, `/desktop-settings`, `/hoard`,
`/my-videos`, `/my-photos`, `/studio`, `/my-gallery`, and creation tools.

Staff routes include `/admin` and `/control-board`; they require the appropriate
role/permission.

## Public JSON API

All JSON API routes are under `/api/*` unless noted. Session-only routes use the
normal browser cookie. Role-gated routes also require the relevant permission.

### Health, Config, and Public Content

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/health` | Public | Service health, uptime, commit ref, environment, timestamp. |
| `GET /api/health/disk` | Public/ops-facing | TV cache disk utilization. Safe for external monitors. |
| `GET /api/apps/desktop` | Public | Current admin feature gates for desktop sub-apps. |
| `GET /api/links` | Public | Curated links. Writes require `manage_content`. |
| `GET /api/faq` | Public | FAQ items. Writes require `manage_content`. |
| `GET /api/console/demo-cartridges` | Public | Demo console cartridges. |
| `POST /api/system/logs/client` | Public write | Client diagnostic logging, rate-limit bypassed but payload-limited. |

### Auth and Account Entry

| Route | Access | Notes |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Create local account. Rate limited. |
| `POST /api/auth/login` | Public | Create browser session. Rate limited. |
| `POST /api/auth/logout` | Session | End browser session. |
| `GET /api/auth/user` | Session | Current signed-in user. |
| `POST /api/auth/change-password` | Session | Change or set local password. |
| `GET /api/auth/social/config` | Public | Which social providers are configured. |
| `GET /api/auth/:provider` and callbacks | Session/public callback mix | Google, GitHub, Twitter/X, and Discord OAuth flows. |
| `POST /api/auth/wallet/challenge` | Public | Create wallet login nonce. Rate limited. |
| `POST /api/auth/wallet/verify` | Public | Verify wallet signature and sign in existing user. |
| `POST /api/auth/wallet/register` | Public | Create account from wallet proof. |

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

### Market, Token, and DEX Data

| Route | Access | Notes |
| --- | --- | --- |
| `GET /api/marketplace/onchain` | Public | Marketplace contract snapshot from TzKT. |
| `GET /api/marketplace/trade-board` | Public | Trade-board listing cache. |
| `GET /api/marketplace` | Public | Active WTF marketplace listings. |
| `GET /api/marketplace/:id` | Public | Listing detail. |
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

MCP tools return either Markdown or JSON via `response_format`. Agent builders
should request JSON for automation and Markdown for human-readable summaries.

### Admin Feature Gates

Admins manage desktop sub-app availability through:

- `GET /api/admin/apps/desktop`
- `PUT /api/admin/apps/desktop/:appKey`

The public gate snapshot is available at `GET /api/apps/desktop`. MCP
capabilities include the same gate map. Gate-aware MCP tools fail closed when
their owning sub-app is disabled, so disabling `gallery`, `hoard`, or `tv`
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
