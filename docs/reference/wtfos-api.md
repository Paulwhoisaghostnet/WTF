# wtfOS API reference

This is the source-derived inventory of the main wtfOS HTTP API: **921 unique method/path operations**, grouped into **99 route families** and declared across **126 server modules**. It documents what each endpoint is for and the gate visible at its route declaration; handler code remains authoritative for payload schemas and conditional authorization.

> Evidence: `[source]`. Probe budget: zero-call pass. Actual spend: zero network calls, zero writes, and no production data access. The inventory was extracted from the local route AST, then deduplicated by method and path.

## Public platform surface

wtfOS exposes 921 unique method/path declarations across production-reachable routers, four WebSocket transports, and a Streamable HTTP MCP server with 44 registered tools. Feature flags and runtime modes can disable or replace some declared routes.

The public developer boundary is additive: `/api/v1` aliases the established handlers behind paired bearer-token scopes, `/api/v1/openapi.json` serves OpenAPI 3.1, and `/api/v1/docs` serves the grouped human reference. The legacy `/api/*` surface remains unchanged for browser and internal callers.

MCP retains its workflow-specific tools and adds `wtf_api_request`, which gives paired agents comprehensive access to the same `/api/v1` contract subject to read/write/admin scopes, account roles, ownership checks, and app gates.

## How the API is structured

- **Public transport:** versioned HTTP under `/api/v1/*`, authenticated with `Authorization: Bearer wtf_mcp_...`. Discovery, OpenAPI, and docs are public.
- **Compatibility transport:** same-origin JSON under `/api/*`. Existing browser clients continue to use cookie sessions and `credentials: include`.
- **Protocol surfaces:** AT Protocol discovery under `/.well-known/*`, AppView XRPC aliases under `/xrpc/*`, oEmbed at `/oembed`, and Streamable HTTP MCP at `/mcp`.
- **Real time:** authenticated WebSockets use `/ws`, `/ws/wtf-live`, `/ws/dedrooms`, and `/ws/apphost`.
- **Route composition:** `server/routes.ts` mounts domain routers from `server/routes/`, `server/features/*`, and `server/challenges/routes/`. Domains own validation, persistence, and upstream integrations.
- **Responses:** JSON is standard. Successful download, media, embed, and stream routes may return binary, HTML, redirects, or byte ranges. Errors conventionally use `{ "error": string }` with an appropriate HTTP status.

## Authentication, mutation, and limits

| Concern | Contract |
| --- | --- |
| Browser auth | Session cookie established by `/api/auth/*`; protected routes declare `isAuthenticated` or a permission/admin middleware. |
| Public API auth | Paired access token in `Authorization: Bearer wtf_mcp_...`; `api:read`, `api:write`, and admin-only `api:admin` scopes layer over normal route authorization. |
| CSRF | Cookie-authenticated legacy `POST`, `PUT`, `PATCH`, and `DELETE` calls require `X-CSRF-Token`, obtained from `GET /api/auth/csrf-token`, except explicit exemptions. Bearer-authenticated `/api/v1` mutations do not use browser cookies and are CSRF-exempt. |
| MCP | `/mcp` ignores browser identity and requires a paired bearer token. `/api/mcp/tokens*` manages those tokens through the signed-in browser session. |
| App APIs | Some routes accept app-scoped credentials or tickets in addition to user/admin sessions; check the named middleware in the source before integrating. |
| Generic limit | `/api/*` defaults to 200 requests/minute per IP; authenticated `/api/v1` traffic keys that limit by one-way token hash. Streaming reads and `/api/apphost/*` are deliberately separated. |
| Narrow limits | Client logs 30/min; CLI probes 60/min; password auth 20/15 min; wallet auth 30/15 min; OAuth starts 15/15 min; apphost 6,000/min per session/IP; TV prefetch 12/min; media file reads 600/min; media imports 60/15 min; uploads 20/15 min. Domain routes may add tighter limits. |
| CORS | Production accepts configured origins and credentials; the arcade source surface has a narrowly scoped null-origin exception. |

The `Access` column is intentionally conservative: `Public/handler` means no reusable gate was visible in the route call, not that every response or operation is unconditionally public. Some handlers perform feature-flag, ownership, token, signature, or permission checks internally.

## MCP surface

The MCP transport is `GET/POST/DELETE /mcp`, authenticated exclusively with a paired bearer token and limited to 60 requests/minute by default. The browser-session routes `GET/POST /api/mcp/tokens` and `DELETE /api/mcp/tokens/:id` bootstrap pairing; versioned aliases live at `/api/v1/tokens`. The server currently registers 44 tools, including comprehensive `wtf_api_request` coverage:

| Tool | Use | Source |
| --- | --- | --- |
| `wtf_api_request` | Call any operation exposed by the versioned wtfOS Platform API at /api/v1 using the paired token. Existing route ownership, role, app-gate, and token-scope checks remain authoritative. Read calls require api:read; mutations require api:write; admin paths additionally require an admin account and api:admin. | `server/lib/wtf-mcp.ts:818` |
| `wtf_build_game_studio_bundle` | Build an SDK-compatible ZIP bundle from a Game Studio template and selected stock assets. | `server/lib/wtf-mcp.ts:2506` |
| `wtf_build_game_studio_project` | Build and validate a saved Game Studio project, recording a build snapshot and returning SDK-compatible ZIP metadata. | `server/lib/wtf-mcp.ts:2771` |
| `wtf_create_arcade_play_intent` | Create a WTF in-app market payment intent for one WTF Arcade Play ticket for the paired user. | `server/lib/wtf-mcp.ts:1868` |
| `wtf_create_game_studio_project` | Create a saved Game Studio project for the paired user from a template, optional source files, and optional stock or uploaded assets. | `server/lib/wtf-mcp.ts:2644` |
| `wtf_create_game_studio_scaffold` | Generate a starter browser-game project scaffold wired to the WTF Game SDK. | `server/lib/wtf-mcp.ts:2466` |
| `wtf_create_map_lab_document` | Create a sanitized WTF Map Lab document payload from explicit MCP-provided nodes and wires. This tool can create map objects but cannot read, use, or expose ingested AT repo/firehose data paths. | `server/lib/wtf-mcp.ts:890` |
| `wtf_create_trusted_creator_market_item` | Create an EXP-priced in-app market item in the paired user's trusted market creator lane. Requires the paired WTF user to have the trusted_market_creator permission. | `server/lib/wtf-mcp.ts:2900` |
| `wtf_get_access_manifest` | Return the standard WTF browser, JSON API, and paired MCP access map. Use this before navigating or automating WTF so agent access stays aligned with the web-browser experience. | `server/lib/wtf-mcp.ts:743` |
| `wtf_get_arcade_play_fee` | Return the current WTF Arcade play-ticket SKU, WTF price, and in-app market contract wiring. | `server/lib/wtf-mcp.ts:1802` |
| `wtf_get_arcade_play_status` | Return the paired user's WTF Arcade ticket inventory, trusted/admin bypass status, and current play-fee wiring. | `server/lib/wtf-mcp.ts:1830` |
| `wtf_get_arcade_stats` | Get aggregate WTF Arcade stats plus the current in-app market play-fee wiring. | `server/lib/wtf-mcp.ts:1769` |
| `wtf_get_capabilities` | Return paired user context, admin feature gates, MCP rate-limit hints, and available WTF agent workflows. | `server/lib/wtf-mcp.ts:698` |
| `wtf_get_console_discovery_shelves` | Get active WTF Console discovery shelves for the stock console surface. Public Arcade/source/creator games are excluded. | `server/lib/wtf-mcp.ts:2107` |
| `wtf_get_console_stats` | Get aggregate WTF Console health stats for the personal stock-console surface only. Public Arcade/source/creator games are excluded. | `server/lib/wtf-mcp.ts:2068` |
| `wtf_get_crp_nomination_credits` | Return the privacy-preserving anonymous nomination credit count for the paired user. Requires crp-nominations:read. | `server/features/crp-nominations/mcp.ts:284` |
| `wtf_get_crp_nomination_status` | Probe whether the dedicated CRP nominations AT repo is configured. Requires crp-nominations:read. | `server/features/crp-nominations/mcp.ts:171` |
| `wtf_get_desktop_appearance` | Read the paired user's WTF desktop appearance settings, including color scheme, wallpaper, cursor, physics, and desktop pet switch. | `server/lib/wtf-mcp.ts:970` |
| `wtf_get_desktop_pet` | Read the paired user's desktop hamster state and recent care status. This tool only accesses the paired user's own pet. | `server/lib/wtf-mcp.ts:1088` |
| `wtf_get_registered_inventory` | Return the standardized WTFOS app/package inventory with current pathways, provenance, witness metadata, and deployment state. Use this for agent handshakes that need the live creation and service registry. | `server/lib/wtf-mcp.ts:781` |
| `wtf_keep_desktop_pet_alive` | Care for the paired user's desktop hamster. With strategy='auto', the tool chooses the most urgent safe care actions and applies up to max_actions. | `server/lib/wtf-mcp.ts:1121` |
| `wtf_list_arcade_audit_events` | List recent WTF Arcade moderation, compatible-source check, report, and score audit events. Requires an admin WTF user and arcade:admin MCP scope. | `server/lib/wtf-mcp.ts:1909` |
| `wtf_list_arcade_games` | List active public WTF Arcade games, including compatible-source games and creator/Game Studio submissions. Console stock cartridges are excluded. | `server/lib/wtf-mcp.ts:1722` |
| `wtf_list_console_audit_events` | List recent WTF Console moderation/import/score audit events. Requires an admin WTF user and console:admin MCP scope. | `server/lib/wtf-mcp.ts:2253` |
| `wtf_list_console_games` | List WTF Console cartridges that live on every user's personal console: stock console games plus owned media when paired user scope allows it. | `server/lib/wtf-mcp.ts:2015` |
| `wtf_list_console_players` | List top public WTF Console players ranked by Console XP, score volume, plays, and first-place finishes. | `server/lib/wtf-mcp.ts:2158` |
| `wtf_list_console_recent_scores` | List recent valid public WTF Console score submissions with game, player, score, and timestamp. | `server/lib/wtf-mcp.ts:2203` |
| `wtf_list_crp_categories` | Return official Tezos Commons CRP categories for the paired user's CRP Nominations app. Requires crp-nominations:read. | `server/features/crp-nominations/mcp.ts:141` |
| `wtf_list_game_studio_assets` | List stock assets and templates available in the WTF Game Studio creator app. | `server/lib/wtf-mcp.ts:2316` |
| `wtf_list_game_studio_projects` | List saved Game Studio projects owned by the paired user, including last build and submission metadata. | `server/lib/wtf-mcp.ts:2588` |
| `wtf_list_game_studio_snippets` | List copy-ready WTF Game SDK and browser-game code snippets available in the Game Studio creator app. | `server/lib/wtf-mcp.ts:2376` |
| `wtf_list_game_studio_targets` | List the WTF Game Studio SDK target surfaces: WTF Arcade for public paid play, and WTF Console for personal owned media. | `server/lib/wtf-mcp.ts:2426` |
| `wtf_list_my_crp_nominations` | List attributed nominations for the paired user plus anonymous nomination credit count. Requires crp-nominations:read. | `server/features/crp-nominations/mcp.ts:242` |
| `wtf_list_public_tv_channels` | List active public WTF TV channels from the database. Disabled automatically when admin disables the TV sub app. | `server/lib/wtf-mcp.ts:1659` |
| `wtf_list_unlisted_trade_board_tokens` | Find public trade-board token rows that do not currently have active listing rows in WTF's public marketplace/listing caches. This is for agent research and listing planning. | `server/lib/wtf-mcp.ts:1288` |
| `wtf_prepare_single_edition_listing_workflow` | Prepare safe next steps for listing one of the paired user's trade-board tokens. This does not create a listing without a user wallet signature/op hash. | `server/lib/wtf-mcp.ts:1537` |
| `wtf_resolve_crp_nominee` | Merge Tezos wallet, .tez domain, X handle, or Bluesky handle into nominee bundles for the paired user. Requires crp-nominations:read. | `server/features/crp-nominations/mcp.ts:204` |
| `wtf_run_arcade_source_import` | Run the WTF Arcade compatible-source check job immediately. Requires an admin WTF user and arcade:admin MCP scope. | `server/lib/wtf-mcp.ts:1968` |
| `wtf_search_public_tokens` | Search public WTF token metadata and market-summary database rows derived from Objkt, TzKT, IPFS, and on-chain data. Does not return private user data. | `server/lib/wtf-mcp.ts:1180` |
| `wtf_set_desktop_appearance` | Update the paired user's WTF desktop color scheme and appearance. Use this when a user asks their agent to apply a custom color scheme or cursor. | `server/lib/wtf-mcp.ts:1003` |
| `wtf_set_trade_board_tokens` | Add or remove the paired user's owned tokens from the WTF trade board by contract/token id. This mutates only the paired user's trade-board collection. | `server/lib/wtf-mcp.ts:1427` |
| `wtf_submit_crp_nomination` | Publish a CRP nomination for the paired user. Anonymous submissions omit nominator identity from the CRP repo. Requires crp-nominations:write. Agents act on behalf of the MCP token owner, who remains liable for abuse. | `server/features/crp-nominations/mcp.ts:320` |
| `wtf_submit_game_studio_project_to_arcade` | Build a saved Game Studio project and submit it to WTF Arcade review or the paired user's trusted creator auto-publish lane. Use update_slug to submit a new version of one of the paired user's existing Arcade games. | `server/lib/wtf-mcp.ts:2826` |
| `wtf_update_game_studio_project` | Update a saved Game Studio project owned by the paired user. Only supplied fields are changed. | `server/lib/wtf-mcp.ts:2706` |

## Route-family map

| Family | Operations | Use |
| --- | ---: | --- |
| `access` | 1 | Public capability and canonical-origin discovery. |
| `admin` | 88 | Administrative control plane: users, permissions, registrations, diagnostics, storage, rewards, and platform configuration. |
| `admin-inbox` | 6 | User-to-admin support threads and replies. |
| `anchor` | 1 | Operations for the anchor domain. |
| `apphost` | 12 | Authenticated proxy for launching, streaming, controlling, and stopping host-run applications. |
| `apps` | 1 | Desktop application catalogue and launchability. |
| `arcade` | 24 | Arcade catalogue, sessions, scores, leaderboards, reports, and source imports. |
| `archive` | 2 | Operations for the archive domain. |
| `atproto` | 13 | AT Protocol account, OAuth, PDS, relay, firehose, record, and AppView operations. |
| `attendance` | 4 | Attendance check-ins and event attendance records. |
| `auth` | 23 | Cookie-session authentication, OAuth, wallet sign-in, account recovery, and CSRF bootstrap. |
| `barter` | 2 | On-chain barter listings, offers, settlements, and synchronization. |
| `board` | 23 | Message-board channels, posts, reactions, moderation, search, and inbound webhooks. |
| `browser` | 2 | Server-assisted browser/session tooling. |
| `buyback-windows` | 7 | Operations for the buyback windows domain. |
| `cache` | 1 | Operations for the cache domain. |
| `calendar` | 11 | Calendar sources, events, subscriptions, and synchronization. |
| `casino` | 21 | Casino catalogue, game sessions, balances, wagers, and leaderboards. |
| `ch-ease` | 1 | Operations for the ch ease domain. |
| `challenges` | 8 | Challenge catalogue, progress, completions, and reward automation. |
| `channels` | 4 | Operations for the channels domain. |
| `cli` | 3 | CLI route discovery and authorization checks. |
| `club-dues` | 6 | Operations for the club dues domain. |
| `cockpit` | 21 | Operational cockpit status, queues, jobs, sync, and diagnostics. |
| `collekt` | 4 | Collekt discovery and collection-facing data. |
| `comms` | 5 | Communication preferences and conversation surfaces. |
| `console` | 27 | Console game bundles, SDK assets, dependency proxying, scores, sessions, and reports. |
| `contestants` | 2 | Operations for the contestants domain. |
| `contracts` | 1 | Contract activity, indexing, and synchronization. |
| `control-board` | 5 | Control-board operational state and actions. |
| `crawler-preview` | 1 | Operations for the crawler preview domain. |
| `crp` | 8 | CRP nomination status, credits, submissions, and resolution. |
| `dedrooms` | 6 | DedRooms world sessions, commands, state, and administration. |
| `desktop` | 10 | Desktop state, shortcuts, events, sessions, and preferences. |
| `dex` | 5 | Decentralized-exchange market data and actions. |
| `diary` | 5 | Personal diary entries and related profile data. |
| `dicksword` | 11 | Dicksword game state, commands, and scoring. |
| `discord` | 3 | Operations for the discord domain. |
| `discovery` | 3 | Random and spotlight content discovery. |
| `etherlink` | 9 | Etherlink wallet linking, balances, tokens, and synchronization. |
| `factory` | 5 | Operations for the factory domain. |
| `faq` | 8 | FAQ content retrieval and management. |
| `gallery` | 1 | Gallery feeds, tokens, collections, and curation. |
| `game-studio` | 15 | Game Studio projects, builds, files, and publishing. |
| `gnocchi` | 1 | Operations for the gnocchi domain. |
| `health` | 5 | Liveness, readiness, authenticated diagnostics, metrics, and disk status. |
| `in-app-market` | 11 | In-app market catalogue, purchases, sales, pricing, and reconciliation. |
| `ipfs-pinning` | 5 | Operations for the ipfs pinning domain. |
| `lasagna` | 1 | Operations for the lasagna domain. |
| `leaderboard` | 6 | Platform leaderboards and ranking data. |
| `links` | 4 | User and platform link records. |
| `macaroni` | 19 | Macaroni drop publishing, packages, installers, previews, and guarded IPFS uploads. |
| `mail` | 8 | Mailbox, aliases, messages, attachments, and delivery administration. |
| `marketplace` | 10 | NFT marketplace listings, offers, purchases, and chain synchronization. |
| `mastodon` | 6 | Mastodon connection, timelines, identity, and posting. |
| `mcp` | 3 | MCP pairing-token management; the root `/mcp` endpoint carries Streamable HTTP MCP traffic. |
| `media` | 9 | Media library metadata, uploads, imports, files, and lifecycle management. |
| `messages` | 21 | Direct-message conversations, messages, participants, and read state. |
| `mint` | 4 | Mint portal configuration and minting workflows. |
| `mint-manager` | 2 | Operations for the mint manager domain. |
| `music` | 5 | Music catalogue, playback metadata, and library actions. |
| `notifications` | 6 | Notification feeds, preferences, and read state. |
| `objkt-operator` | 11 | Operations for the objkt operator domain. |
| `operator` | 9 | Operator-wallet configuration and transaction workflows. |
| `pasta` | 2 | Pasta suite installer and package discovery. |
| `penne` | 1 | Penne installer discovery. |
| `porcupin` | 5 | Porcupin pinning service status and operations. |
| `portfolio` | 5 | Wallet portfolio positions and valuation views. |
| `profile` | 16 | Current-user profile, social identities, settings, and public user views. |
| `protocol` | 10 | Non-REST protocol and discovery endpoints. |
| `public` | 4 | Operations for the public domain. |
| `rat` | 2 | Rat Race feeds, token candidates, voting, and results. |
| `ravioli` | 1 | Operations for the ravioli domain. |
| `reggie` | 2 | Reggie quest state, actions, and administration. |
| `reward-flags` | 2 | Operations for the reward flags domain. |
| `rewards` | 4 | Reward catalogue, claims, balances, and ledger operations. |
| `rotini` | 1 | Rotini installer discovery. |
| `rounds` | 8 | Operations for the rounds domain. |
| `seasons` | 7 | Season catalogue and active-season state. |
| `side` | 8 | Side-quest catalogue, progress, and completion. |
| `side-quest-completions` | 1 | Operations for the side quest completions domain. |
| `skywire` | 38 | Bluesky/Skywire accounts, feeds, posts, chat, moderation, and OAuth. |
| `social` | 12 | Social-automation drafts, promotion queues, approvals, and opt-in controls. |
| `spaghetti` | 1 | Spaghetti installer discovery. |
| `studio` | 37 | Studio projects, files, annotations, chat, drive, administration, and workflows. |
| `submissions` | 2 | Operations for the submissions domain. |
| `system` | 5 | Client/server system logs and operational event retrieval. |
| `telegram-digest` | 10 | Operations for the telegram digest domain. |
| `tezos` | 4 | Tezos intelligence, tokens, wallets, contracts, and indexer-backed analysis. |
| `tv` | 38 | WTF TV channels, playlists, schedules, playback, cache, telemetry, and media. |
| `tz2at` | 13 | Tezos-to-AT Protocol bridge state, outbox, publishing, PDS, and firehose data. |
| `users` | 5 | Public user profiles, activity, listings, DMs, and trade boards. |
| `w` | 43 | W social timeline, posts, reactions, follows, spaces, group chat, and DMs. |
| `wallets` | 11 | Linked Tezos wallets, balances, tokens, domains, dossiers, and synchronization. |
| `wtf-auctions` | 6 | WTF auction creation, bidding, state transitions, and settlement. |
| `wtf-live` | 34 | WTF LIVE rooms, stages, broadcasts, messages, access, invites, and show controls. |
| `wtf-recapture` | 2 | WTF Recapture personal state and leaderboard. |
| `wtf-sites` | 8 | User-site claiming, pages, assets, publishing, rollback, and administration. |
| `wtf-subdomains` | 8 | wtfos.me and wtf.tez subdomain claims, registrar workflows, configuration, and administration. |

## Complete endpoint inventory

Method totals: **ALL 13**, **DELETE 45**, **GET 447**, **PATCH 36**, **POST 316**, **PUT 64**. Declared-gate totals: **Admin 102**, **Internal 1**, **MCP bearer 1**, **Permission 132**, **Public/handler 215**, **Session 470**.

<details>
<summary><code>access</code> — 1 operations</summary>

Public capability and canonical-origin discovery.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/access` | Read or list access. | Public/handler | `server/routes/access.ts:29` |

</details>

<details>
<summary><code>admin</code> — 88 operations</summary>

Administrative control plane: users, permissions, registrations, diagnostics, storage, rewards, and platform configuration.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/app-registry/registrations` | Read or list admin app registry registrations. | Admin | `server/features/app-registry/admin-routes.ts:58` |
| GET | `/api/admin/app-registry/registrations/:appId` | Read or list admin app registry registrations appId. | Admin | `server/features/app-registry/admin-routes.ts:76` |
| POST | `/api/admin/app-registry/registrations/:appId/disable-key` | Create, submit, or run admin app registry registrations appId disable key. | Admin | `server/features/app-registry/admin-routes.ts:131` |
| POST | `/api/admin/app-registry/registrations/:appId/email-integration` | Create, submit, or run admin app registry registrations appId email integration. | Admin | `server/features/app-registry/admin-routes.ts:92` |
| POST | `/api/admin/app-registry/registrations/:appId/issue-key` | Create, submit, or run admin app registry registrations appId issue key. | Admin | `server/features/app-registry/admin-routes.ts:112` |
| POST | `/api/admin/app-registry/registrations/:appId/reregister` | Create, submit, or run admin app registry registrations appId reregister. | Admin | `server/features/app-registry/admin-routes.ts:191` |
| POST | `/api/admin/app-registry/registrations/:appId/revoke-key` | Create, submit, or run admin app registry registrations appId revoke key. | Admin | `server/features/app-registry/admin-routes.ts:149` |
| POST | `/api/admin/app-registry/registrations/:appId/transition` | Create, submit, or run admin app registry registrations appId transition. | Admin | `server/features/app-registry/admin-routes.ts:167` |
| POST | `/api/admin/app-registry/verify-integrity` | Create, submit, or run admin app registry verify integrity. | Admin | `server/features/app-registry/admin-routes.ts:218` |
| POST | `/api/admin/app-registry/wizard/install` | Create, submit, or run admin app registry wizard install. | Admin | `server/features/app-registry/admin-routes.ts:251` |
| POST | `/api/admin/app-registry/wizard/preview` | Create, submit, or run admin app registry wizard preview. | Admin | `server/features/app-registry/admin-routes.ts:234` |
| GET | `/api/admin/apps/desktop` | Read or list admin apps desktop. | Admin | `server/routes/desktop-apps.ts:85` |
| PUT | `/api/admin/apps/desktop/:appKey` | Replace or set admin apps desktop appKey. | Admin | `server/routes/desktop-apps.ts:183` |
| POST | `/api/admin/apps/desktop/refresh-all` | Create, submit, or run admin apps desktop refresh all. | Admin | `server/routes/desktop-apps.ts:99` |
| GET | `/api/admin/atproto/observability` | Read or list admin atproto observability. | Admin | `server/features/atproto-spine/admin-routes.ts:10` |
| GET | `/api/admin/challenge-automation/audit` | Read or list admin challenge automation audit. | Admin | `server/challenges/routes/admin.ts:308` |
| GET | `/api/admin/challenge-automation/challenges` | Read or list admin challenge automation challenges. | Admin | `server/challenges/routes/admin.ts:132` |
| POST | `/api/admin/challenge-automation/challenges` | Create, submit, or run admin challenge automation challenges. | Admin | `server/challenges/routes/admin.ts:157` |
| GET | `/api/admin/challenge-automation/challenges/:id` | Read or list admin challenge automation challenges id. | Admin | `server/challenges/routes/admin.ts:175` |
| PATCH | `/api/admin/challenge-automation/challenges/:id` | Partially update admin challenge automation challenges id. | Admin | `server/challenges/routes/admin.ts:208` |
| GET | `/api/admin/challenge-automation/challenges/:id/progress` | Read or list admin challenge automation challenges id progress. | Admin | `server/challenges/routes/admin.ts:251` |
| POST | `/api/admin/challenge-automation/challenges/:id/status` | Create, submit, or run admin challenge automation challenges id status. | Admin | `server/challenges/routes/admin.ts:228` |
| GET | `/api/admin/challenge-automation/events` | Read or list admin challenge automation events. | Admin | `server/challenges/routes/admin.ts:284` |
| GET | `/api/admin/challenge-automation/registry` | Read or list admin challenge automation registry. | Admin | `server/challenges/routes/admin.ts:109` |
| POST | `/api/admin/challenge-automation/seed-daily-loops` | Create, submit, or run admin challenge automation seed daily loops. | Admin | `server/challenges/routes/admin.ts:346` |
| POST | `/api/admin/challenge-automation/seed-examples` | Create, submit, or run admin challenge automation seed examples. | Admin | `server/challenges/routes/admin.ts:332` |
| GET | `/api/admin/club-dues` | Read or list admin club dues. | Admin | `server/routes/club-dues.ts:143` |
| POST | `/api/admin/club-dues/arrears/sweep` | Create, submit, or run admin club dues arrears sweep. | Admin | `server/routes/club-dues.ts:205` |
| POST | `/api/admin/club-dues/contracts` | Create, submit, or run admin club dues contracts. | Admin | `server/routes/club-dues.ts:155` |
| POST | `/api/admin/club-dues/contracts/:id/deploy` | Create, submit, or run admin club dues contracts id deploy. | Admin | `server/routes/club-dues.ts:176` |
| GET | `/api/admin/contract-activity` | Read or list admin contract activity. | Admin | `server/routes/contract-activity.ts:723` |
| GET | `/api/admin/diagnostics` | Read or list admin diagnostics. | Admin | `server/features/admin/media-storage-routes.ts:150` |
| POST | `/api/admin/etherlink/sync-all` | Create, submit, or run admin etherlink sync all. | Admin | `server/routes/etherlink-wallets.ts:514` |
| GET | `/api/admin/help-index` | Read or list admin help index. | Admin | `server/features/admin/help-index-routes.ts:21` |
| GET | `/api/admin/in-app-market/items` | Read or list admin in app market items. | Admin | `server/features/admin/in-app-market-routes.ts:203` |
| POST | `/api/admin/in-app-market/items` | Create, submit, or run admin in app market items. | Admin | `server/features/admin/in-app-market-routes.ts:216` |
| PATCH | `/api/admin/in-app-market/items/:id` | Partially update admin in app market items id. | Admin | `server/features/admin/in-app-market-routes.ts:281` |
| POST | `/api/admin/in-app-market/reprice` | Create, submit, or run admin in app market reprice. | Admin | `server/features/admin/in-app-market-routes.ts:404` |
| POST | `/api/admin/in-app-market/sales` | Create, submit, or run admin in app market sales. | Admin | `server/features/admin/in-app-market-routes.ts:418` |
| DELETE | `/api/admin/in-app-market/sales/:id` | Delete, revoke, or stop admin in app market sales id. | Admin | `server/features/admin/in-app-market-routes.ts:484` |
| PATCH | `/api/admin/in-app-market/sales/:id` | Partially update admin in app market sales id. | Admin | `server/features/admin/in-app-market-routes.ts:443` |
| GET | `/api/admin/media` | Read or list admin media. | Admin | `server/features/admin/media-storage-routes.ts:23` |
| DELETE | `/api/admin/media/:id` | Delete, revoke, or stop admin media id. | Admin | `server/features/admin/media-storage-routes.ts:87` |
| PUT | `/api/admin/media/:id/status` | Replace or set admin media id status. | Admin | `server/features/admin/media-storage-routes.ts:61` |
| GET | `/api/admin/permissions` | Read or list admin permissions. | Admin | `server/features/admin/permissions-routes.ts:17` |
| PUT | `/api/admin/permissions` | Replace or set admin permissions. | Admin | `server/features/admin/permissions-routes.ts:30` |
| POST | `/api/admin/permissions/reset` | Create, submit, or run admin permissions reset. | Admin | `server/features/admin/permissions-routes.ts:87` |
| GET | `/api/admin/reward-ledger` | Read or list admin reward ledger. | Admin | `server/features/admin/reward-routes.ts:8` |
| PUT | `/api/admin/reward-ledger/:id/pay` | Replace or set admin reward ledger id pay. | Admin | `server/features/admin/reward-routes.ts:50` |
| PUT | `/api/admin/reward-ledger/batch-pay` | Replace or set admin reward ledger batch pay. | Admin | `server/features/admin/reward-routes.ts:84` |
| GET | `/api/admin/role-access` | Read or list admin role access. | Admin | `server/features/admin/role-access-routes.ts:94` |
| PUT | `/api/admin/role-access` | Replace or set admin role access. | Admin | `server/features/admin/role-access-routes.ts:112` |
| POST | `/api/admin/role-access/reset` | Create, submit, or run admin role access reset. | Admin | `server/features/admin/role-access-routes.ts:153` |
| GET | `/api/admin/roles` | Read or list admin roles. | Admin | `server/features/admin/role-access-routes.ts:52` |
| POST | `/api/admin/roles` | Create, submit, or run admin roles. | Admin | `server/features/admin/role-access-routes.ts:64` |
| GET | `/api/admin/stats` | Read or list admin stats. | Admin | `server/features/admin/stats-routes.ts:22` |
| POST | `/api/admin/storage/object-usage-check` | Create, submit, or run admin storage object usage check. | Admin | `server/features/admin/media-storage-routes.ts:136` |
| GET | `/api/admin/storage/status` | Read or list admin storage status. | Admin | `server/features/admin/media-storage-routes.ts:102` |
| GET | `/api/admin/users` | Read or list admin users. | Admin | `server/features/admin/users/identity-profile-routes.ts:43` |
| DELETE | `/api/admin/users/:id` | Delete, revoke, or stop admin users id. | Admin | `server/features/admin/users/deletion-routes.ts:39` |
| PUT | `/api/admin/users/:id/curses/:curseKey` | Replace or set admin users id curses curseKey. | Admin | `server/features/admin/users/identity-profile-routes.ts:348` |
| GET | `/api/admin/users/:id/dossier` | Read or list admin users id dossier. | Admin | `server/features/admin/users/dossier-routes.ts:26` |
| GET | `/api/admin/users/:id/passport` | Read or list admin users id passport. | Admin | `server/features/admin/users/passport-routes.ts:29` |
| PUT | `/api/admin/users/:id/passport/desktop-settings` | Replace or set admin users id passport desktop settings. | Admin | `server/features/admin/users/passport-routes.ts:214` |
| PUT | `/api/admin/users/:id/profile` | Replace or set admin users id profile. | Admin | `server/features/admin/users/identity-profile-routes.ts:106` |
| POST | `/api/admin/users/:id/resync` | Create, submit, or run admin users id resync. | Admin | `server/features/admin/users/resync-routes.ts:26` |
| PUT | `/api/admin/users/:id/role` | Replace or set admin users id role. | Admin | `server/features/admin/users/identity-profile-routes.ts:243` |
| POST | `/api/admin/users/:id/roles` | Create, submit, or run admin users id roles. | Admin | `server/features/admin/users/identity-profile-routes.ts:272` |
| DELETE | `/api/admin/users/:id/roles/:role` | Delete, revoke, or stop admin users id roles role. | Admin | `server/features/admin/users/identity-profile-routes.ts:307` |
| DELETE | `/api/admin/users/:id/social/:provider` | Delete, revoke, or stop admin users id social provider. | Admin | `server/features/admin/users/identity-profile-routes.ts:185` |
| DELETE | `/api/admin/users/:id/temp-password` | Delete, revoke, or stop admin users id temp password. | Admin | `server/features/admin/users/temp-password-routes.ts:98` |
| POST | `/api/admin/users/:id/temp-password` | Create, submit, or run admin users id temp password. | Admin | `server/features/admin/users/temp-password-routes.ts:40` |
| POST | `/api/admin/users/:id/wtf-subdomains` | Create, submit, or run admin users id wtf subdomains. | Admin | `server/routes/wtf-subdomains.ts:154` |
| POST | `/api/admin/users/:id/xp` | Create, submit, or run admin users id xp. | Admin | `server/features/admin/users/xp-routes.ts:26` |
| GET | `/api/admin/w-digest-handles` | Read or list admin w digest handles. | Admin | `server/features/w/digest/routes.ts:147` |
| PUT | `/api/admin/w-digest-handles` | Replace or set admin w digest handles. | Admin | `server/features/w/digest/routes.ts:164` |
| GET | `/api/admin/wallets/:address/dossier` | Read or list admin wallets address dossier. | Admin | `server/features/admin/users/dossier-routes.ts:48` |
| POST | `/api/admin/wallets/:address/resync` | Create, submit, or run admin wallets address resync. | Admin | `server/features/admin/users/resync-routes.ts:48` |
| GET | `/api/admin/wtf-sites` | Read or list admin wtf sites. | Admin | `server/routes/wtf-sites.ts:149` |
| PATCH | `/api/admin/wtf-sites/:id/restore` | Partially update admin wtf sites id restore. | Admin | `server/routes/wtf-sites.ts:181` |
| PATCH | `/api/admin/wtf-sites/:id/suspend` | Partially update admin wtf sites id suspend. | Admin | `server/routes/wtf-sites.ts:162` |
| GET | `/api/admin/wtf-subdomains` | Read or list admin wtf subdomains. | Admin | `server/routes/wtf-subdomains.ts:57` |
| PATCH | `/api/admin/wtf-subdomains/:id/status` | Partially update admin wtf subdomains id status. | Admin | `server/routes/wtf-subdomains.ts:182` |
| GET | `/api/admin/wtf-tv` | Read or list admin wtf tv. | Admin | `server/features/admin/wtf-tv-routes.ts:16` |
| PUT | `/api/admin/wtf-tv` | Replace or set admin wtf tv. | Admin | `server/features/admin/wtf-tv-routes.ts:62` |
| POST | `/api/admin/wtf-tv/initialize` | Create, submit, or run admin wtf tv initialize. | Admin | `server/features/admin/wtf-tv-routes.ts:144` |
| POST | `/api/admin/wtf-tv/refresh` | Create, submit, or run admin wtf tv refresh. | Admin | `server/features/admin/wtf-tv-routes.ts:215` |
| GET | `/api/admin/xp/events` | Read or list admin xp events. | Admin | `server/features/admin/users/xp-routes.ts:62` |

</details>

<details>
<summary><code>admin-inbox</code> — 6 operations</summary>

User-to-admin support threads and replies.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/admin-inbox/messages` | Read or list admin inbox messages. | Admin | `server/routes/admin-inbox.ts:400` |
| POST | `/api/admin-inbox/messages` | Create, submit, or run admin inbox messages. | Session | `server/routes/admin-inbox.ts:342` |
| PATCH | `/api/admin-inbox/messages/:id/read` | Partially update admin inbox messages id read. | Admin | `server/routes/admin-inbox.ts:577` |
| POST | `/api/admin-inbox/messages/:id/replies` | Create, submit, or run admin inbox messages id replies. | Session | `server/routes/admin-inbox.ts:509` |
| PATCH | `/api/admin-inbox/messages/:id/user-read` | Partially update admin inbox messages id user read. | Session | `server/routes/admin-inbox.ts:559` |
| GET | `/api/admin-inbox/threads` | Read or list admin inbox threads. | Admin | `server/routes/admin-inbox.ts:450` |

</details>

<details>
<summary><code>anchor</code> — 1 operations</summary>

Operations for the anchor domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/anchor/downloads` | Read or list anchor downloads. | Session | `server/routes/anchor.ts:189` |

</details>

<details>
<summary><code>apphost</code> — 12 operations</summary>

Authenticated proxy for launching, streaming, controlling, and stopping host-run applications.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/apphost/apps` | Read or list apphost apps. | Session | `server/routes/apphost.ts:68` |
| GET | `/api/apphost/apps/:id` | Read or list apphost apps id. | Session | `server/routes/apphost.ts:72` |
| POST | `/api/apphost/apps/:id/input` | Create, submit, or run apphost apps id input. | Session | `server/routes/apphost.ts:98` |
| POST | `/api/apphost/apps/:id/launch` | Create, submit, or run apphost apps id launch. | Session | `server/routes/apphost.ts:88` |
| GET | `/api/apphost/apps/:id/session` | Read or list apphost apps id session. | Session | `server/routes/apphost.ts:80` |
| GET | `/api/apphost/apps/:id/snapshot` | Read or list apphost apps id snapshot. | Session | `server/routes/apphost.ts:84` |
| GET | `/api/apphost/apps/:id/status` | Read or list apphost apps id status. | Session | `server/routes/apphost.ts:76` |
| POST | `/api/apphost/apps/:id/stop` | Create, submit, or run apphost apps id stop. | Session | `server/routes/apphost.ts:94` |
| POST | `/api/apphost/apps/:id/stream/offer` | Create, submit, or run apphost apps id stream offer. | Session | `server/routes/apphost.ts:102` |
| GET | `/api/apphost/apps/:id/stream/status` | Read or list apphost apps id stream status. | Session | `server/routes/apphost.ts:106` |
| POST | `/api/apphost/apps/:id/stream/stop` | Create, submit, or run apphost apps id stream stop. | Session | `server/routes/apphost.ts:110` |
| GET | `/api/apphost/health` | Read or list apphost health. | Session | `server/routes/apphost.ts:64` |

</details>

<details>
<summary><code>apps</code> — 1 operations</summary>

Desktop application catalogue and launchability.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/apps/desktop` | Read or list apps desktop. | Public/handler | `server/routes/desktop-apps.ts:75` |

</details>

<details>
<summary><code>arcade</code> — 24 operations</summary>

Arcade catalogue, sessions, scores, leaderboards, reports, and source imports.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/arcade/admin/audit` | Read or list arcade admin audit. | Session | `server/routes/arcade.ts:431` |
| GET | `/api/arcade/admin/games` | Read or list arcade admin games. | Session | `server/routes/arcade.ts:348` |
| POST | `/api/arcade/admin/games/:slug/:action` | Create, submit, or run arcade admin games slug action. | Session | `server/routes/arcade.ts:316` |
| POST | `/api/arcade/admin/games/:slug/credit-rule` | Create, submit, or run arcade admin games slug credit rule. | Session | `server/routes/arcade.ts:292` |
| GET | `/api/arcade/admin/reports` | Read or list arcade admin reports. | Session | `server/routes/arcade.ts:380` |
| POST | `/api/arcade/admin/reports/:id/:action` | Create, submit, or run arcade admin reports id action. | Session | `server/routes/arcade.ts:398` |
| POST | `/api/arcade/admin/source-import` | Create, submit, or run arcade admin source import. | Session | `server/routes/arcade.ts:367` |
| GET | `/api/arcade/champions` | Read or list arcade champions. | Public/handler | `server/routes/arcade.ts:201` |
| GET | `/api/arcade/discovery` | Read or list arcade discovery. | Public/handler | `server/routes/arcade.ts:99` |
| GET | `/api/arcade/games` | Read or list arcade games. | Public/handler | `server/routes/arcade.ts:83` |
| GET | `/api/arcade/games/:slug` | Read or list arcade games slug. | Public/handler | `server/routes/arcade.ts:123` |
| POST | `/api/arcade/games/:slug/report` | Create, submit, or run arcade games slug report. | Session | `server/routes/arcade.ts:239` |
| GET | `/api/arcade/leaderboard/:slug` | Read or list arcade leaderboard slug. | Public/handler | `server/routes/arcade.ts:174` |
| GET | `/api/arcade/my-games` | Read or list arcade my games. | Session | `server/routes/arcade.ts:259` |
| GET | `/api/arcade/play-fee` | Read or list arcade play fee. | Public/handler | `server/routes/arcade.ts:111` |
| POST | `/api/arcade/play-intents` | Create, submit, or run arcade play intents. | Session | `server/routes/arcade.ts:137` |
| GET | `/api/arcade/play-status` | Read or list arcade play status. | Session | `server/routes/arcade.ts:115` |
| GET | `/api/arcade/player/:username` | Read or list arcade player username. | Public/handler | `server/routes/arcade.ts:225` |
| GET | `/api/arcade/players/top` | Read or list arcade players top. | Public/handler | `server/routes/arcade.ts:213` |
| GET | `/api/arcade/recent` | Read or list arcade recent. | Public/handler | `server/routes/arcade.ts:189` |
| POST | `/api/arcade/scores` | Create, submit, or run arcade scores. | Session | `server/routes/arcade.ts:166` |
| POST | `/api/arcade/session` | Create, submit, or run arcade session. | Session | `server/routes/arcade.ts:152` |
| GET | `/api/arcade/stats` | Read or list arcade stats. | Public/handler | `server/routes/arcade.ts:91` |
| POST | `/api/arcade/submit` | Create, submit, or run arcade submit. | Session | `server/routes/arcade.ts:267` |

</details>

<details>
<summary><code>archive</code> — 2 operations</summary>

Operations for the archive domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/archive/token` | Read or list archive token. | Session | `server/routes/token-archive.ts:39` |
| POST | `/api/archive/token` | Create, submit, or run archive token. | Session | `server/routes/token-archive.ts:68` |

</details>

<details>
<summary><code>atproto</code> — 13 operations</summary>

AT Protocol account, OAuth, PDS, relay, firehose, record, and AppView operations.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/atproto/appview/record` | Read or list atproto appview record. | Public/handler | `server/features/atproto-spine/appview/router.ts:70` |
| GET | `/api/atproto/appview/records` | Read or list atproto appview records. | Public/handler | `server/features/atproto-spine/appview/router.ts:69` |
| POST | `/api/atproto/handle/claim` | Create, submit, or run atproto handle claim. | Session | `server/routes/atproto.ts:1344` |
| GET | `/api/atproto/handle/claims` | Read or list atproto handle claims. | Session | `server/routes/atproto.ts:1448` |
| POST | `/api/atproto/handle/verify` | Create, submit, or run atproto handle verify. | Session | `server/routes/atproto.ts:1452` |
| GET | `/api/atproto/me` | Read or list atproto me. | Session | `server/routes/atproto.ts:712` |
| GET | `/api/atproto/oauth/callback` | Read or list atproto oauth callback. | Session | `server/routes/atproto.ts:1087` |
| GET | `/api/atproto/oauth/start` | Read or list atproto oauth start. | Session | `server/routes/atproto.ts:915` |
| GET | `/api/atproto/permissions/options` | Read or list atproto permissions options. | Session | `server/routes/atproto.ts:734` |
| POST | `/api/atproto/register` | Create, submit, or run atproto register. | Session | `server/routes/atproto.ts:819` |
| POST | `/api/atproto/register/phone-verification` | Create, submit, or run atproto register phone verification. | Session | `server/routes/atproto.ts:762` |
| GET | `/api/atproto/registration/options` | Read or list atproto registration options. | Session | `server/routes/atproto.ts:747` |
| POST | `/api/atproto/unlink` | Create, submit, or run atproto unlink. | Session | `server/routes/atproto.ts:1325` |

</details>

<details>
<summary><code>attendance</code> — 4 operations</summary>

Attendance check-ins and event attendance records.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/attendance/event/:id` | Read or list attendance event id. | Permission | `server/routes/attendance.ts:198` |
| POST | `/api/attendance/in-app` | Create, submit, or run attendance in app. | Session | `server/routes/attendance.ts:142` |
| GET | `/api/attendance/mine` | Read or list attendance mine. | Session | `server/routes/attendance.ts:186` |
| POST | `/api/attendance/voice-state` | Create, submit, or run attendance voice state. | Public/handler | `server/routes/attendance.ts:99` |

</details>

<details>
<summary><code>auth</code> — 23 operations</summary>

Cookie-session authentication, OAuth, wallet sign-in, account recovery, and CSRF bootstrap.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/change-password` | Create, submit, or run auth change password. | Session | `server/auth/routes.ts:919` |
| GET | `/api/auth/csrf-token` | Read or list auth csrf token. | Public/handler | `server/auth/routes.ts:60` |
| GET | `/api/auth/discord` | Read or list auth discord. | Session | `server/auth/routes.ts:1537`<br>`server/auth/routes.ts:1547` |
| GET | `/api/auth/discord/callback` | Read or list auth discord callback. | Public/handler | `server/auth/routes.ts:1542`<br>`server/auth/routes.ts:1550` |
| GET | `/api/auth/github` | Read or list auth github. | Public/handler | `server/auth/routes.ts:1222` |
| GET | `/api/auth/github/callback` | Read or list auth github callback. | Public/handler | `server/auth/routes.ts:1226` |
| GET | `/api/auth/gm-welcome/assets/:filename` | Read or list auth gm welcome assets filename. | Session | `server/auth/routes.ts:885` |
| POST | `/api/auth/gm-welcome/complete` | Create, submit, or run auth gm welcome complete. | Session | `server/auth/routes.ts:845` |
| POST | `/api/auth/login` | Create, submit, or run auth login. | Public/handler | `server/auth/routes.ts:755` |
| POST | `/api/auth/logout` | Create, submit, or run auth logout. | Public/handler | `server/auth/routes.ts:790` |
| POST | `/api/auth/register` | Create, submit, or run auth register. | Public/handler | `server/auth/routes.ts:693` |
| GET | `/api/auth/social/config` | Read or list auth social config. | Public/handler | `server/auth/routes.ts:471` |
| GET | `/api/auth/twitter` | Read or list auth twitter. | Session | `server/auth/routes.ts:1233`<br>`server/auth/routes.ts:1243` |
| GET | `/api/auth/twitter-oauth2` | Read or list auth twitter oauth2. | Session | `server/auth/routes.ts:1251` |
| GET | `/api/auth/twitter-oauth2/callback` | Read or list auth twitter oauth2 callback. | Session | `server/auth/routes.ts:1309` |
| GET | `/api/auth/twitter-oauth2/diagnostics` | Read or list auth twitter oauth2 diagnostics. | Session | `server/auth/routes.ts:496` |
| GET | `/api/auth/twitter-oauth2/diagnostics/self-test` | Read or list auth twitter oauth2 diagnostics self test. | Session | `server/auth/routes.ts:613` |
| GET | `/api/auth/twitter/callback` | Read or list auth twitter callback. | Public/handler | `server/auth/routes.ts:1238`<br>`server/auth/routes.ts:1246` |
| GET | `/api/auth/user` | Read or list auth user. | Session | `server/auth/routes.ts:807` |
| POST | `/api/auth/wallet/challenge` | Create, submit, or run auth wallet challenge. | Public/handler | `server/auth/routes.ts:1033` |
| POST | `/api/auth/wallet/register` | Create, submit, or run auth wallet register. | Public/handler | `server/auth/routes.ts:1128` |
| POST | `/api/auth/wallet/verify` | Create, submit, or run auth wallet verify. | Public/handler | `server/auth/routes.ts:1052` |
| POST | `/api/auth/welcome/complete` | Create, submit, or run auth welcome complete. | Session | `server/auth/routes.ts:812` |

</details>

<details>
<summary><code>barter</code> — 2 operations</summary>

On-chain barter listings, offers, settlements, and synchronization.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/barter/onchain` | Read or list barter onchain. | Public/handler | `server/routes/barter.ts:451` |
| GET | `/api/barter/trade-board` | Read or list barter trade board. | Public/handler | `server/routes/barter.ts:477` |

</details>

<details>
<summary><code>board</code> — 23 operations</summary>

Message-board channels, posts, reactions, moderation, search, and inbound webhooks.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/board/categories` | Read or list board categories. | Public/handler | `server/routes/board.ts:112` |
| POST | `/api/board/categories` | Create, submit, or run board categories. | Permission | `server/routes/board.ts:124` |
| DELETE | `/api/board/categories/:id` | Delete, revoke, or stop board categories id. | Permission | `server/routes/board.ts:172` |
| PUT | `/api/board/categories/:id` | Replace or set board categories id. | Permission | `server/routes/board.ts:143` |
| GET | `/api/board/channels` | Read or list board channels. | Public/handler | `server/routes/board.ts:194` |
| POST | `/api/board/channels` | Create, submit, or run board channels. | Permission | `server/routes/board.ts:261` |
| DELETE | `/api/board/channels/:id` | Delete, revoke, or stop board channels id. | Permission | `server/routes/board.ts:387` |
| PUT | `/api/board/channels/:id` | Replace or set board channels id. | Session | `server/routes/board.ts:321` |
| GET | `/api/board/channels/:id/messages` | Read or list board channels id messages. | Public/handler | `server/routes/board.ts:405` |
| POST | `/api/board/channels/:id/messages` | Create, submit, or run board channels id messages. | Session | `server/routes/board.ts:510` |
| GET | `/api/board/channels/:id/permissions` | Read or list board channels id permissions. | Session | `server/routes/board.ts:997` |
| POST | `/api/board/channels/:id/permissions` | Create, submit, or run board channels id permissions. | Session | `server/routes/board.ts:1036` |
| GET | `/api/board/channels/:id/pins` | Read or list board channels id pins. | Public/handler | `server/routes/board.ts:849` |
| GET | `/api/board/channels/:id/webhooks` | Read or list board channels id webhooks. | Session | `server/routes/board.ts:1161` |
| POST | `/api/board/channels/:id/webhooks` | Create, submit, or run board channels id webhooks. | Session | `server/routes/board.ts:1197` |
| DELETE | `/api/board/messages/:id` | Delete, revoke, or stop board messages id. | Session | `server/routes/board.ts:759` |
| PUT | `/api/board/messages/:id` | Replace or set board messages id. | Session | `server/routes/board.ts:693` |
| PUT | `/api/board/messages/:id/pin` | Replace or set board messages id pin. | Session | `server/routes/board.ts:801` |
| POST | `/api/board/messages/:id/reactions` | Create, submit, or run board messages id reactions. | Session | `server/routes/board.ts:882` |
| DELETE | `/api/board/permissions/:id` | Delete, revoke, or stop board permissions id. | Session | `server/routes/board.ts:1128` |
| PUT | `/api/board/permissions/:id` | Replace or set board permissions id. | Session | `server/routes/board.ts:1087` |
| POST | `/api/board/webhook/:token` | Create, submit, or run board webhook token. | Public/handler | `server/routes/board.ts:1263` |
| DELETE | `/api/board/webhooks/:id` | Delete, revoke, or stop board webhooks id. | Session | `server/routes/board.ts:1233` |

</details>

<details>
<summary><code>browser</code> — 2 operations</summary>

Server-assisted browser/session tooling.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/browser/allowlist` | Read or list browser allowlist. | Session | `server/routes/browser.ts:10` |
| GET | `/api/browser/resolve` | Read or list browser resolve. | Session | `server/routes/browser.ts:14` |

</details>

<details>
<summary><code>buyback-windows</code> — 7 operations</summary>

Operations for the buyback windows domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/buyback-windows` | Read or list buyback windows. | Permission | `server/routes/buyback-windows.ts:155` |
| POST | `/api/buyback-windows` | Create, submit, or run buyback windows. | Permission | `server/routes/buyback-windows.ts:104` |
| POST | `/api/buyback-windows/:id/allowlist` | Create, submit, or run buyback windows id allowlist. | Permission | `server/routes/buyback-windows.ts:173` |
| GET | `/api/buyback-windows/:id/eligibility` | Read or list buyback windows id eligibility. | Session | `server/routes/buyback-windows.ts:442` |
| POST | `/api/buyback-windows/:id/swap-intent` | Create, submit, or run buyback windows id swap intent. | Session | `server/routes/buyback-windows.ts:519` |
| POST | `/api/buyback-windows/:id/transition` | Create, submit, or run buyback windows id transition. | Permission | `server/routes/buyback-windows.ts:299` |
| GET | `/api/buyback-windows/active` | Read or list buyback windows active. | Public/handler | `server/routes/buyback-windows.ts:410` |

</details>

<details>
<summary><code>cache</code> — 1 operations</summary>

Operations for the cache domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/cache/media` | Read or list cache media. | Public/handler | `server/features/tv/cache-routes.ts:43` |

</details>

<details>
<summary><code>calendar</code> — 11 operations</summary>

Calendar sources, events, subscriptions, and synchronization.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/calendar/events` | Read or list calendar events. | Public/handler | `server/routes/calendar.ts:496` |
| POST | `/api/calendar/events` | Create, submit, or run calendar events. | Permission | `server/routes/calendar.ts:578` |
| PATCH | `/api/calendar/events/:id` | Partially update calendar events id. | Permission | `server/routes/calendar.ts:625` |
| GET | `/api/calendar/feed.ics` | Read or list calendar feed.ics. | Public/handler | `server/routes/calendar.ts:711` |
| PUT | `/api/calendar/participations` | Replace or set calendar participations. | Session | `server/routes/calendar.ts:161` |
| GET | `/api/calendar/participations/mine` | Read or list calendar participations mine. | Session | `server/routes/calendar.ts:134` |
| POST | `/api/calendar/sync` | Create, submit, or run calendar sync. | Permission | `server/routes/calendar.ts:675` |
| POST | `/api/calendar/tickets` | Create, submit, or run calendar tickets. | Session | `server/routes/calendar.ts:66` |
| POST | `/api/calendar/tickets/:id/decide` | Create, submit, or run calendar tickets id decide. | Permission | `server/routes/calendar.ts:357` |
| GET | `/api/calendar/tickets/mine` | Read or list calendar tickets mine. | Session | `server/routes/calendar.ts:102` |
| GET | `/api/calendar/tickets/queue` | Read or list calendar tickets queue. | Permission | `server/routes/calendar.ts:297` |

</details>

<details>
<summary><code>casino</code> — 21 operations</summary>

Casino catalogue, game sessions, balances, wagers, and leaderboards.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/casino/entry` | Create, submit, or run casino entry. | Session | `server/routes/casino.ts:339` |
| GET | `/api/casino/games` | Read or list casino games. | Session | `server/routes/casino.ts:170` |
| POST | `/api/casino/guinea-pig-raceway/bet` | Create, submit, or run casino guinea pig raceway bet. | Session | `server/routes/casino.ts:491` |
| POST | `/api/casino/guinea-pig-raceway/effect` | Create, submit, or run casino guinea pig raceway effect. | Session | `server/routes/casino.ts:511` |
| GET | `/api/casino/guinea-pig-raceway/state` | Read or list casino guinea pig raceway state. | Session | `server/routes/casino.ts:481` |
| POST | `/api/casino/membership-intents` | Create, submit, or run casino membership intents. | Session | `server/routes/casino.ts:300` |
| POST | `/api/casino/membership-verify` | Create, submit, or run casino membership verify. | Session | `server/routes/casino.ts:320` |
| GET | `/api/casino/practice-games` | Read or list casino practice games. | Session | `server/routes/casino.ts:184` |
| POST | `/api/casino/practice-games` | Create, submit, or run casino practice games. | Session | `server/routes/casino.ts:207` |
| POST | `/api/casino/practice-games/:id/review` | Create, submit, or run casino practice games id review. | Session | `server/routes/casino.ts:233` |
| POST | `/api/casino/practice-games/:slug/play` | Create, submit, or run casino practice games slug play. | Session | `server/routes/casino.ts:269` |
| POST | `/api/casino/rug-pull/delay` | Create, submit, or run casino rug pull delay. | Session | `server/routes/casino.ts:435` |
| POST | `/api/casino/rug-pull/join` | Create, submit, or run casino rug pull join. | Session | `server/routes/casino.ts:424` |
| POST | `/api/casino/rug-pull/press` | Create, submit, or run casino rug pull press. | Session | `server/routes/casino.ts:446` |
| GET | `/api/casino/rug-pull/state` | Read or list casino rug pull state. | Session | `server/routes/casino.ts:414` |
| POST | `/api/casino/rug-pull/vote` | Create, submit, or run casino rug pull vote. | Session | `server/routes/casino.ts:468` |
| POST | `/api/casino/rug-pull/witness` | Create, submit, or run casino rug pull witness. | Session | `server/routes/casino.ts:457` |
| GET | `/api/casino/status` | Read or list casino status. | Session | `server/routes/casino.ts:162` |
| POST | `/api/casino/wtf-button/press` | Create, submit, or run casino wtf button press. | Session | `server/routes/casino.ts:392` |
| POST | `/api/casino/wtf-button/quote` | Create, submit, or run casino wtf button quote. | Session | `server/routes/casino.ts:372` |
| GET | `/api/casino/wtf-button/state` | Read or list casino wtf button state. | Session | `server/routes/casino.ts:362` |

</details>

<details>
<summary><code>ch-ease</code> — 1 operations</summary>

Operations for the ch ease domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/ch-ease/installers` | Read or list ch ease installers. | Session | `server/routes/ch-ease-installers.ts:55` |

</details>

<details>
<summary><code>challenges</code> — 8 operations</summary>

Challenge catalogue, progress, completions, and reward automation.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/challenge-automation/daily-loops` | Read or list challenge automation daily loops. | Session | `server/challenges/routes/public.ts:78` |
| POST | `/api/challenge-automation/daily-loops/:id/claim` | Create, submit, or run challenge automation daily loops id claim. | Session | `server/challenges/routes/public.ts:193` |
| GET | `/api/challenges` | Read or list challenges. | Public/handler | `server/routes/challenges.ts:126` |
| POST | `/api/challenges` | Create, submit, or run challenges. | Permission | `server/routes/challenges.ts:193` |
| GET | `/api/challenges/:id` | Read or list challenges id. | Public/handler | `server/routes/challenges.ts:148` |
| PUT | `/api/challenges/:id` | Replace or set challenges id. | Permission | `server/routes/challenges.ts:235` |
| POST | `/api/challenges/:id/submit` | Create, submit, or run challenges id submit. | Session | `server/routes/challenges.ts:307` |
| PUT | `/api/challenges/reward-flags/:id/claim` | Replace or set challenges reward flags id claim. | Session | `server/routes/challenges.ts:631` |

</details>

<details>
<summary><code>channels</code> — 4 operations</summary>

Operations for the channels domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/channels` | Read or list channels. | Session | `server/routes/messages.ts:1632` |
| POST | `/api/channels` | Create, submit, or run channels. | Permission | `server/routes/messages.ts:1649` |
| GET | `/api/channels/:id/messages` | Read or list channels id messages. | Session | `server/routes/messages.ts:1679` |
| POST | `/api/channels/:id/messages` | Create, submit, or run channels id messages. | Session | `server/routes/messages.ts:1734` |

</details>

<details>
<summary><code>cli</code> — 3 operations</summary>

CLI route discovery and authorization checks.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/cli/can-open` | Read or list cli can open. | Public/handler | `server/routes/cli-access.ts:13` |
| GET | `/api/cli/routes` | Read or list cli routes. | Public/handler | `server/routes/cli-access.ts:30` |
| GET | `/api/cli/session` | Read or list cli session. | Session | `server/routes/cli-access.ts:41` |

</details>

<details>
<summary><code>club-dues</code> — 6 operations</summary>

Operations for the club dues domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/club-dues/contracts` | Read or list club dues contracts. | Public/handler | `server/routes/club-dues.ts:63` |
| GET | `/api/club-dues/contracts/:slug` | Read or list club dues contracts slug. | Public/handler | `server/routes/club-dues.ts:71` |
| POST | `/api/club-dues/contracts/:slug/payment-intents` | Create, submit, or run club dues contracts slug payment intents. | Session | `server/routes/club-dues.ts:103` |
| GET | `/api/club-dues/my` | Read or list club dues my. | Session | `server/routes/club-dues.ts:95` |
| POST | `/api/club-dues/payment-verify` | Create, submit, or run club dues payment verify. | Session | `server/routes/club-dues.ts:131` |
| POST | `/api/club-dues/templates/compile` | Create, submit, or run club dues templates compile. | Public/handler | `server/routes/club-dues.ts:81` |

</details>

<details>
<summary><code>cockpit</code> — 21 operations</summary>

Operational cockpit status, queues, jobs, sync, and diagnostics.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/cockpit/activity` | Read or list cockpit activity. | Session | `server/routes/cockpit.ts:328` |
| GET | `/api/cockpit/audit` | Read or list cockpit audit. | Permission | `server/routes/cockpit.ts:538` |
| POST | `/api/cockpit/backfill/reseed` | Create, submit, or run cockpit backfill reseed. | Permission | `server/routes/cockpit.ts:492` |
| GET | `/api/cockpit/backfill/status` | Read or list cockpit backfill status. | Public/handler | `server/routes/cockpit.ts:472` |
| GET | `/api/cockpit/backup/restore-proof` | Read or list cockpit backup restore proof. | Permission | `server/routes/cockpit.ts:582` |
| POST | `/api/cockpit/backup/run` | Create, submit, or run cockpit backup run. | Permission | `server/routes/cockpit.ts:563` |
| GET | `/api/cockpit/collections` | Read or list cockpit collections. | Session | `server/routes/cockpit.ts:651` |
| POST | `/api/cockpit/collections` | Create, submit, or run cockpit collections. | Session | `server/routes/cockpit.ts:792` |
| GET | `/api/cockpit/collections/:id` | Read or list cockpit collections id. | Session | `server/routes/cockpit.ts:704` |
| POST | `/api/cockpit/collections/:id/items` | Create, submit, or run cockpit collections id items. | Session | `server/routes/cockpit.ts:845` |
| DELETE | `/api/cockpit/collections/:id/items/:contract/:tokenId` | Delete, revoke, or stop cockpit collections id items contract tokenId. | Session | `server/routes/cockpit.ts:914` |
| POST | `/api/cockpit/collections/trade-board/rebuild` | Create, submit, or run cockpit collections trade board rebuild. | Session | `server/routes/cockpit.ts:773` |
| GET | `/api/cockpit/holdings` | Read or list cockpit holdings. | Session | `server/routes/cockpit.ts:156` |
| GET | `/api/cockpit/ipfs-gateways` | Read or list cockpit ipfs gateways. | Session | `server/routes/cockpit.ts:141` |
| GET | `/api/cockpit/media-service` | Read or list cockpit media service. | Session | `server/routes/cockpit.ts:104` |
| GET | `/api/cockpit/overview` | Read or list cockpit overview. | Session | `server/routes/cockpit.ts:274` |
| GET | `/api/cockpit/project-bundles` | Read or list cockpit project bundles. | Session | `server/routes/cockpit.ts:100` |
| POST | `/api/cockpit/sync/:wallet` | Create, submit, or run cockpit sync wallet. | Session | `server/routes/cockpit.ts:418` |
| POST | `/api/cockpit/sync/run/:jobName` | Create, submit, or run cockpit sync run jobName. | Permission | `server/routes/cockpit.ts:511` |
| GET | `/api/cockpit/sync/runs/:jobName` | Read or list cockpit sync runs jobName. | Permission | `server/routes/cockpit.ts:393` |
| GET | `/api/cockpit/sync/status` | Read or list cockpit sync status. | Session | `server/routes/cockpit.ts:370` |

</details>

<details>
<summary><code>collekt</code> — 4 operations</summary>

Collekt discovery and collection-facing data.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/collekt/duplicates` | Read or list collekt duplicates. | Public/handler | `server/routes/collekt.ts:16` |
| POST | `/api/collekt/events` | Create, submit, or run collekt events. | Session | `server/routes/collekt.ts:39` |
| GET | `/api/collekt/session` | Read or list collekt session. | Session | `server/routes/collekt.ts:64` |
| GET | `/api/collekt/tokens` | Read or list collekt tokens. | Session | `server/routes/collekt.ts:80` |

</details>

<details>
<summary><code>comms</code> — 5 operations</summary>

Communication preferences and conversation surfaces.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/comms/items` | Read or list comms items. | Session | `server/routes/comms.ts:46` |
| POST | `/api/comms/items/:id/read` | Create, submit, or run comms items id read. | Session | `server/routes/comms.ts:163` |
| GET | `/api/comms/route-target` | Read or list comms route target. | Session | `server/routes/comms.ts:178` |
| GET | `/api/comms/sources` | Read or list comms sources. | Session | `server/routes/comms.ts:36` |
| GET | `/api/comms/unread-count` | Read or list comms unread count. | Session | `server/routes/comms.ts:68` |

</details>

<details>
<summary><code>console</code> — 27 operations</summary>

Console game bundles, SDK assets, dependency proxying, scores, sessions, and reports.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/console/admin/audit` | Read or list console admin audit. | Session | `server/routes/console.ts:335` |
| GET | `/api/console/admin/games` | Read or list console admin games. | Session | `server/routes/console.ts:309` |
| POST | `/api/console/admin/games/:slug/:action` | Create, submit, or run console admin games slug action. | Session | `server/routes/console.ts:297` |
| GET | `/api/console/admin/reports` | Read or list console admin reports. | Session | `server/routes/console.ts:322` |
| POST | `/api/console/admin/reports/:id/:action` | Create, submit, or run console admin reports id action. | Session | `server/routes/console.ts:356` |
| POST | `/api/console/admin/source-arcade/import` | Create, submit, or run console admin source arcade import. | Session | `server/routes/console.ts:381` |
| GET | `/api/console/cartridges` | Read or list console cartridges. | Session | `server/routes/console.ts:94` |
| GET | `/api/console/champions` | Read or list console champions. | Public/handler | `server/routes/console.ts:204` |
| GET | `/api/console/demo-cartridges` | Read or list console demo cartridges. | Public/handler | `server/routes/console.ts:90` |
| GET | `/api/console/dependency` | Read or list console dependency. | Public/handler | `server/routes/console.ts:80` |
| GET | `/api/console/discovery` | Read or list console discovery. | Public/handler | `server/routes/console.ts:119` |
| GET | `/api/console/games` | Read or list console games. | Session | `server/routes/console.ts:102` |
| GET | `/api/console/games/:slug` | Read or list console games slug. | Session | `server/routes/console.ts:160` |
| GET | `/api/console/games/:slug/dependencies` | Read or list console games slug dependencies. | Public/handler | `server/routes/console.ts:139` |
| POST | `/api/console/games/:slug/dependencies/cache` | Create, submit, or run console games slug dependencies cache. | Session | `server/routes/console.ts:147` |
| POST | `/api/console/games/:slug/report` | Create, submit, or run console games slug report. | Session | `server/routes/console.ts:242` |
| GET | `/api/console/leaderboard/:slug` | Read or list console leaderboard slug. | Public/handler | `server/routes/console.ts:177` |
| GET | `/api/console/my-games` | Read or list console my games. | Session | `server/routes/console.ts:282` |
| GET | `/api/console/player/:username` | Read or list console player username. | Public/handler | `server/routes/console.ts:228` |
| GET | `/api/console/players/top` | Read or list console players top. | Public/handler | `server/routes/console.ts:216` |
| GET | `/api/console/published` | Read or list console published. | Public/handler | `server/routes/console.ts:131` |
| GET | `/api/console/recent` | Read or list console recent. | Public/handler | `server/routes/console.ts:192` |
| POST | `/api/console/scores` | Create, submit, or run console scores. | Session | `server/routes/console.ts:274` |
| GET | `/api/console/sdk.js` | Read or list console sdk.js. | Public/handler | `server/routes/console.ts:72` |
| POST | `/api/console/session` | Create, submit, or run console session. | Session | `server/routes/console.ts:262` |
| GET | `/api/console/stats` | Read or list console stats. | Public/handler | `server/routes/console.ts:111` |
| POST | `/api/console/submit` | Create, submit, or run console submit. | Session | `server/routes/console.ts:290` |

</details>

<details>
<summary><code>contestants</code> — 2 operations</summary>

Operations for the contestants domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/contestants/:id/eliminate` | Create, submit, or run contestants id eliminate. | Permission | `server/routes/control-board.ts:497` |
| POST | `/api/contestants/:id/promote-from-reserve` | Create, submit, or run contestants id promote from reserve. | Permission | `server/routes/control-board.ts:591` |

</details>

<details>
<summary><code>contracts</code> — 1 operations</summary>

Contract activity, indexing, and synchronization.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/contract-activity` | Create, submit, or run contract activity. | Session | `server/routes/contract-activity.ts:530` |

</details>

<details>
<summary><code>control-board</code> — 5 operations</summary>

Control-board operational state and actions.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/control-board/feed` | Read or list control board feed. | Permission | `server/routes/control-board.ts:240` |
| POST | `/api/control-board/season3/scaffold` | Create, submit, or run control board season3 scaffold. | Permission | `server/routes/control-board.ts:800` |
| GET | `/api/control-board/season3/status` | Read or list control board season3 status. | Permission | `server/routes/control-board.ts:773` |
| POST | `/api/control-board/test-gameshow/seed` | Create, submit, or run control board test gameshow seed. | Permission | `server/routes/control-board.ts:743` |
| GET | `/api/control-board/test-gameshow/status` | Read or list control board test gameshow status. | Permission | `server/routes/control-board.ts:718` |

</details>

<details>
<summary><code>crawler-preview</code> — 1 operations</summary>

Operations for the crawler preview domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/crawler-preview/status` | Read or list crawler preview status. | Public/handler | `server/routes/crawler-embeds.ts:773` |

</details>

<details>
<summary><code>crp</code> — 8 operations</summary>

CRP nomination status, credits, submissions, and resolution.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/crp-nominations/categories` | Read or list crp nominations categories. | Public/handler | `server/features/crp-nominations/routes.ts:58` |
| GET | `/api/crp-nominations/credits` | Read or list crp nominations credits. | Session | `server/features/crp-nominations/routes.ts:104` |
| GET | `/api/crp-nominations/mine` | Read or list crp nominations mine. | Session | `server/features/crp-nominations/routes.ts:94` |
| POST | `/api/crp-nominations/resolve` | Create, submit, or run crp nominations resolve. | Session | `server/features/crp-nominations/routes.ts:76` |
| GET | `/api/crp-nominations/share` | Read or list crp nominations share. | Session | `server/features/crp-nominations/routes.ts:149` |
| GET | `/api/crp-nominations/status` | Read or list crp nominations status. | Public/handler | `server/features/crp-nominations/routes.ts:62` |
| POST | `/api/crp-nominations/submit` | Create, submit, or run crp nominations submit. | Session | `server/features/crp-nominations/routes.ts:110` |
| POST | `/api/crp-nominations/viewed` | Create, submit, or run crp nominations viewed. | Session | `server/features/crp-nominations/routes.ts:66` |

</details>

<details>
<summary><code>dedrooms</code> — 6 operations</summary>

DedRooms world sessions, commands, state, and administration.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| PATCH | `/api/dedrooms/admin/campaign` | Partially update dedrooms admin campaign. | Session | `server/routes/dedrooms.ts:132` |
| GET | `/api/dedrooms/admin/content` | Read or list dedrooms admin content. | Session | `server/routes/dedrooms.ts:112` |
| POST | `/api/dedrooms/admin/content` | Create, submit, or run dedrooms admin content. | Session | `server/routes/dedrooms.ts:120` |
| POST | `/api/dedrooms/command` | Create, submit, or run dedrooms command. | Session | `server/routes/dedrooms.ts:84` |
| GET | `/api/dedrooms/history` | Read or list dedrooms history. | Session | `server/routes/dedrooms.ts:72` |
| GET | `/api/dedrooms/state` | Read or list dedrooms state. | Session | `server/routes/dedrooms.ts:64` |

</details>

<details>
<summary><code>desktop</code> — 10 operations</summary>

Desktop state, shortcuts, events, sessions, and preferences.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/desktop/events` | Create, submit, or run desktop events. | Session | `server/routes/desktop.ts:346` |
| GET | `/api/desktop/pet` | Read or list desktop pet. | Session | `server/routes/desktop.ts:441` |
| PATCH | `/api/desktop/pet` | Partially update desktop pet. | Session | `server/routes/desktop.ts:482` |
| POST | `/api/desktop/pet/actions` | Create, submit, or run desktop pet actions. | Session | `server/routes/desktop.ts:555` |
| GET | `/api/desktop/pet/events` | Read or list desktop pet events. | Session | `server/routes/desktop.ts:464` |
| GET | `/api/desktop/settings` | Read or list desktop settings. | Session | `server/routes/desktop.ts:306` |
| PUT | `/api/desktop/settings` | Replace or set desktop settings. | Session | `server/routes/desktop.ts:417` |
| POST | `/api/desktop/world/escape` | Create, submit, or run desktop world escape. | Session | `server/routes/desktop.ts:326` |
| POST | `/api/desktop/world/heartbeat` | Create, submit, or run desktop world heartbeat. | Session | `server/routes/desktop.ts:316` |
| POST | `/api/desktop/world/toy-escape` | Create, submit, or run desktop world toy escape. | Session | `server/routes/desktop.ts:336` |

</details>

<details>
<summary><code>dex</code> — 5 operations</summary>

Decentralized-exchange market data and actions.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/dex/counterparts/:tag` | Read or list dex counterparts tag. | Public/handler | `server/routes/dex.ts:191` |
| GET | `/api/dex/health` | Read or list dex health. | Public/handler | `server/routes/dex.ts:236` |
| GET | `/api/dex/pools` | Read or list dex pools. | Public/handler | `server/routes/dex.ts:173` |
| GET | `/api/dex/pools/:pairId/metrics` | Read or list dex pools pairId metrics. | Public/handler | `server/routes/dex.ts:258` |
| GET | `/api/dex/tokens` | Read or list dex tokens. | Public/handler | `server/routes/dex.ts:154` |

</details>

<details>
<summary><code>diary</code> — 5 operations</summary>

Personal diary entries and related profile data.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/diary/entries` | Read or list diary entries. | Session | `server/routes/diary.ts:124` |
| POST | `/api/diary/entries` | Create, submit, or run diary entries. | Session | `server/routes/diary.ts:200` |
| DELETE | `/api/diary/entries/:id` | Delete, revoke, or stop diary entries id. | Session | `server/routes/diary.ts:269` |
| PATCH | `/api/diary/entries/:id` | Partially update diary entries id. | Session | `server/routes/diary.ts:232` |
| GET | `/api/diary/index` | Read or list diary index. | Session | `server/routes/diary.ts:159` |

</details>

<details>
<summary><code>dicksword</code> — 11 operations</summary>

Dicksword game state, commands, and scoring.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/dicksword/admin/avatar-conflicts` | Create, submit, or run dicksword admin avatar conflicts. | Permission | `server/routes/dicksword.ts:332` |
| POST | `/api/dicksword/admin/avatar-layers` | Create, submit, or run dicksword admin avatar layers. | Permission | `server/routes/dicksword.ts:305` |
| POST | `/api/dicksword/admin/role-mappings` | Create, submit, or run dicksword admin role mappings. | Permission | `server/routes/dicksword.ts:357` |
| PUT | `/api/dicksword/avatar/selection` | Replace or set dicksword avatar selection. | Session | `server/routes/dicksword.ts:254` |
| POST | `/api/dicksword/bot/activity` | Create, submit, or run dicksword bot activity. | Public/handler | `server/routes/dicksword.ts:477` |
| GET | `/api/dicksword/bot/profile/:discordUserId` | Read or list dicksword bot profile discordUserId. | Public/handler | `server/routes/dicksword.ts:557` |
| POST | `/api/dicksword/bot/proof` | Create, submit, or run dicksword bot proof. | Public/handler | `server/routes/dicksword.ts:384` |
| GET | `/api/dicksword/bot/role-sync` | Read or list dicksword bot role sync. | Public/handler | `server/routes/dicksword.ts:537` |
| POST | `/api/dicksword/claims` | Create, submit, or run dicksword claims. | Session | `server/routes/dicksword.ts:220` |
| GET | `/api/dicksword/config` | Read or list dicksword config. | Public/handler | `server/routes/dicksword.ts:129` |
| GET | `/api/dicksword/me` | Read or list dicksword me. | Session | `server/routes/dicksword.ts:143` |

</details>

<details>
<summary><code>discord</code> — 3 operations</summary>

Operations for the discord domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| PATCH | `/api/discord/mirrors/:eventId` | Partially update discord mirrors eventId. | Public/handler | `server/routes/attendance.ts:270` |
| GET | `/api/discord/mirrors/upcoming` | Read or list discord mirrors upcoming. | Public/handler | `server/routes/attendance.ts:233` |
| POST | `/api/discord/role-sync/pull` | Create, submit, or run discord role sync pull. | Public/handler | `server/routes/attendance.ts:301` |

</details>

<details>
<summary><code>discovery</code> — 3 operations</summary>

Random and spotlight content discovery.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/discovery/random-artist` | Read or list discovery random artist. | Public/handler | `server/features/discovery/routes.ts:18` |
| GET | `/api/discovery/random-nft` | Read or list discovery random nft. | Public/handler | `server/features/discovery/routes.ts:39` |
| GET | `/api/discovery/spotlight` | Read or list discovery spotlight. | Public/handler | `server/features/discovery/routes.ts:60` |

</details>

<details>
<summary><code>etherlink</code> — 9 operations</summary>

Etherlink wallet linking, balances, tokens, and synchronization.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/etherlink/assets` | Read or list etherlink assets. | Session | `server/routes/etherlink-wallets.ts:399` |
| GET | `/api/etherlink/networks` | Read or list etherlink networks. | Public/handler | `server/routes/etherlink-wallets.ts:74` |
| GET | `/api/etherlink/wallets` | Read or list etherlink wallets. | Session | `server/routes/etherlink-wallets.ts:81` |
| POST | `/api/etherlink/wallets` | Create, submit, or run etherlink wallets. | Session | `server/routes/etherlink-wallets.ts:161` |
| DELETE | `/api/etherlink/wallets/:id` | Delete, revoke, or stop etherlink wallets id. | Session | `server/routes/etherlink-wallets.ts:307` |
| PUT | `/api/etherlink/wallets/:id/primary` | Replace or set etherlink wallets id primary. | Session | `server/routes/etherlink-wallets.ts:279` |
| POST | `/api/etherlink/wallets/:id/sync` | Create, submit, or run etherlink wallets id sync. | Session | `server/routes/etherlink-wallets.ts:354` |
| POST | `/api/etherlink/wallets/challenge` | Create, submit, or run etherlink wallets challenge. | Session | `server/routes/etherlink-wallets.ts:140` |
| POST | `/api/etherlink/wallets/sync` | Create, submit, or run etherlink wallets sync. | Session | `server/routes/etherlink-wallets.ts:372` |

</details>

<details>
<summary><code>factory</code> — 5 operations</summary>

Operations for the factory domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/factory/compile` | Create, submit, or run factory compile. | Permission | `server/routes/collection-factory.ts:186` |
| GET | `/api/factory/contracts` | Read or list factory contracts. | Session | `server/routes/collection-factory.ts:131` |
| POST | `/api/factory/contracts/:id/retire` | Create, submit, or run factory contracts id retire. | Permission | `server/routes/collection-factory.ts:374` |
| POST | `/api/factory/deploy` | Create, submit, or run factory deploy. | Permission | `server/routes/collection-factory.ts:239` |
| GET | `/api/factory/templates` | Read or list factory templates. | Session | `server/routes/collection-factory.ts:99` |

</details>

<details>
<summary><code>faq</code> — 8 operations</summary>

FAQ content retrieval and management.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/faq` | Read or list faq. | Public/handler | `server/routes/faq.ts:89` |
| POST | `/api/faq` | Create, submit, or run faq. | Permission | `server/routes/faq.ts:104` |
| DELETE | `/api/faq/:id` | Delete, revoke, or stop faq id. | Permission | `server/routes/faq.ts:167` |
| PUT | `/api/faq/:id` | Replace or set faq id. | Permission | `server/routes/faq.ts:129` |
| GET | `/api/faq/promos` | Read or list faq promos. | Public/handler | `server/routes/faq.ts:43` |
| GET | `/api/faq/promos/:slug/:asset` | Read or list faq promos slug asset. | Public/handler | `server/routes/faq.ts:47` |
| GET | `/api/faq/tutorials` | Read or list faq tutorials. | Public/handler | `server/routes/faq.ts:39` |
| GET | `/api/faq/tutorials/:slug/:asset` | Read or list faq tutorials slug asset. | Public/handler | `server/routes/faq.ts:68` |

</details>

<details>
<summary><code>gallery</code> — 1 operations</summary>

Gallery feeds, tokens, collections, and curation.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/gallery/mine` | Read or list gallery mine. | Session | `server/routes/gallery.ts:87` |

</details>

<details>
<summary><code>game-studio</code> — 15 operations</summary>

Game Studio projects, builds, files, and publishing.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/game-studio/assets` | Read or list game studio assets. | Public/handler | `server/routes/game-studio.ts:62` |
| GET | `/api/game-studio/assets/:id/raw` | Read or list game studio assets id raw. | Public/handler | `server/routes/game-studio.ts:223` |
| GET | `/api/game-studio/projects` | Read or list game studio projects. | Session | `server/routes/game-studio.ts:102` |
| POST | `/api/game-studio/projects` | Create, submit, or run game studio projects. | Session | `server/routes/game-studio.ts:110` |
| GET | `/api/game-studio/projects/:id` | Read or list game studio projects id. | Session | `server/routes/game-studio.ts:127` |
| PATCH | `/api/game-studio/projects/:id` | Partially update game studio projects id. | Session | `server/routes/game-studio.ts:139` |
| POST | `/api/game-studio/projects/:id/build` | Create, submit, or run game studio projects id build. | Session | `server/routes/game-studio.ts:175` |
| GET | `/api/game-studio/projects/:id/builds` | Read or list game studio projects id builds. | Session | `server/routes/game-studio.ts:159` |
| POST | `/api/game-studio/projects/:id/submit` | Create, submit, or run game studio projects id submit. | Session | `server/routes/game-studio.ts:185` |
| POST | `/api/game-studio/scaffold` | Create, submit, or run game studio scaffold. | Public/handler | `server/routes/game-studio.ts:98` |
| GET | `/api/game-studio/snippets` | Read or list game studio snippets. | Public/handler | `server/routes/game-studio.ts:77` |
| GET | `/api/game-studio/targets` | Read or list game studio targets. | Public/handler | `server/routes/game-studio.ts:58` |
| GET | `/api/game-studio/templates` | Read or list game studio templates. | Public/handler | `server/routes/game-studio.ts:54` |
| GET | `/api/game-studio/templates/:id/scaffold` | Read or list game studio templates id scaffold. | Public/handler | `server/routes/game-studio.ts:92` |
| GET | `/api/game-studio/upload-target` | Read or list game studio upload target. | Public/handler | `server/routes/game-studio.ts:208` |

</details>

<details>
<summary><code>gnocchi</code> — 1 operations</summary>

Operations for the gnocchi domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/gnocchi/installers` | Read or list gnocchi installers. | Session | `server/routes/gnocchi-installers.ts:55` |

</details>

<details>
<summary><code>health</code> — 5 operations</summary>

Liveness, readiness, authenticated diagnostics, metrics, and disk status.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | Read or list health. | Public/handler | `server/routes.ts:232` |
| GET | `/api/health/diagnostics` | Read or list health diagnostics. | Session | `server/routes.ts:253` |
| GET | `/api/health/disk` | Read or list health disk. | Session | `server/routes.ts:303` |
| GET | `/api/health/ready` | Read or list health ready. | Public/handler | `server/routes.ts:238` |
| GET | `/api/metrics` | Read or list metrics. | Public/handler | `server/routes.ts:271` |

</details>

<details>
<summary><code>in-app-market</code> — 11 operations</summary>

In-app market catalogue, purchases, sales, pricing, and reconciliation.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/in-app-market` | Read or list in app market. | Session | `server/routes/in-app-market.ts:604` |
| POST | `/api/in-app-market/checkout-exp` | Create, submit, or run in app market checkout exp. | Session | `server/routes/in-app-market.ts:872` |
| POST | `/api/in-app-market/checkout-reward-wtf` | Create, submit, or run in app market checkout reward wtf. | Session | `server/routes/in-app-market.ts:1081` |
| POST | `/api/in-app-market/creator-items` | Create, submit, or run in app market creator items. | Session | `server/routes/in-app-market.ts:553` |
| GET | `/api/in-app-market/creator-items/mine` | Read or list in app market creator items mine. | Session | `server/routes/in-app-market.ts:587` |
| POST | `/api/in-app-market/intents` | Create, submit, or run in app market intents. | Session | `server/routes/in-app-market.ts:733` |
| POST | `/api/in-app-market/sync` | Create, submit, or run in app market sync. | Session | `server/routes/in-app-market.ts:1627` |
| POST | `/api/in-app-market/tips` | Create, submit, or run in app market tips. | Session | `server/routes/in-app-market.ts:1278` |
| POST | `/api/in-app-market/tips/redeem` | Create, submit, or run in app market tips redeem. | Session | `server/routes/in-app-market.ts:1445` |
| POST | `/api/in-app-market/use` | Create, submit, or run in app market use. | Session | `server/routes/in-app-market.ts:1665` |
| POST | `/api/in-app-market/verify` | Create, submit, or run in app market verify. | Session | `server/routes/in-app-market.ts:1637` |

</details>

<details>
<summary><code>ipfs-pinning</code> — 5 operations</summary>

Operations for the ipfs pinning domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/ipfs-pinning/jobs/:id/retry` | Create, submit, or run ipfs pinning jobs id retry. | Permission | `server/routes/ipfs-pinning.ts:115` |
| GET | `/api/ipfs-pinning/overview` | Read or list ipfs pinning overview. | Session | `server/routes/ipfs-pinning.ts:75` |
| POST | `/api/ipfs-pinning/pasta-protocol/publish` | Create, submit, or run ipfs pinning pasta protocol publish. | Permission | `server/routes/ipfs-pinning.ts:102` |
| POST | `/api/ipfs-pinning/policies` | Create, submit, or run ipfs pinning policies. | Permission | `server/routes/ipfs-pinning.ts:84` |
| POST | `/api/ipfs-pinning/upload` | Create, submit, or run ipfs pinning upload. | Permission | `server/routes/ipfs-pinning.ts:132` |

</details>

<details>
<summary><code>lasagna</code> — 1 operations</summary>

Operations for the lasagna domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/lasagna/installers` | Read or list lasagna installers. | Session | `server/routes/lasagna-installers.ts:55` |

</details>

<details>
<summary><code>leaderboard</code> — 6 operations</summary>

Platform leaderboards and ranking data.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/leaderboard` | Read or list leaderboard. | Public/handler | `server/routes/leaderboard.ts:269` |
| GET | `/api/leaderboard/rewards/exp` | Read or list leaderboard rewards exp. | Public/handler | `server/routes/leaderboard.ts:186` |
| GET | `/api/leaderboard/rewards/other` | Read or list leaderboard rewards other. | Public/handler | `server/routes/leaderboard.ts:232` |
| GET | `/api/leaderboard/rewards/wtf` | Read or list leaderboard rewards wtf. | Public/handler | `server/routes/leaderboard.ts:139` |
| GET | `/api/leaderboard/transfers` | Read or list leaderboard transfers. | Public/handler | `server/routes/leaderboard.ts:348` |
| GET | `/api/leaderboard/xp` | Read or list leaderboard xp. | Public/handler | `server/routes/leaderboard.ts:93` |

</details>

<details>
<summary><code>links</code> — 4 operations</summary>

User and platform link records.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/links` | Read or list links. | Public/handler | `server/routes/links.ts:48` |
| POST | `/api/links` | Create, submit, or run links. | Permission | `server/routes/links.ts:60` |
| DELETE | `/api/links/:id` | Delete, revoke, or stop links id. | Permission | `server/routes/links.ts:127` |
| PUT | `/api/links/:id` | Replace or set links id. | Permission | `server/routes/links.ts:87` |

</details>

<details>
<summary><code>macaroni</code> — 19 operations</summary>

Macaroni drop publishing, packages, installers, previews, and guarded IPFS uploads.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/macaroni/installers` | Read or list macaroni installers. | Session | `server/routes/macaroni.ts:671` |
| POST | `/api/macaroni/ipfs/pin` | Create, submit, or run macaroni ipfs pin. | Permission | `server/routes/macaroni.ts:607` |
| POST | `/api/macaroni/ipfs/upload` | Create, submit, or run macaroni ipfs upload. | Public/handler | `server/routes/macaroni.ts:574` |
| POST | `/api/macaroni/ipfs/upload-ticket` | Create, submit, or run macaroni ipfs upload ticket. | Permission | `server/routes/macaroni.ts:540` |
| POST | `/api/macaroni/media-preview` | Create, submit, or run macaroni media preview. | Session | `server/routes/macaroni.ts:636` |
| GET | `/api/macaroni/packages` | Read or list macaroni packages. | Permission | `server/routes/macaroni-packages.ts:282` |
| POST | `/api/macaroni/packages` | Create, submit, or run macaroni packages. | Permission | `server/routes/macaroni-packages.ts:305` |
| GET | `/api/macaroni/packages/:packageId` | Read or list macaroni packages packageId. | Permission | `server/routes/macaroni-packages.ts:398` |
| PATCH | `/api/macaroni/packages/:packageId/config` | Partially update macaroni packages packageId config. | Permission | `server/routes/macaroni-packages.ts:345` |
| GET | `/api/macaroni/packages/:packageId/export.csv` | Read or list macaroni packages packageId export.csv. | Permission | `server/routes/macaroni-packages.ts:742` |
| POST | `/api/macaroni/packages/:packageId/finalize` | Create, submit, or run macaroni packages packageId finalize. | Permission | `server/routes/macaroni-packages.ts:638` |
| POST | `/api/macaroni/packages/:packageId/items` | Create, submit, or run macaroni packages packageId items. | Permission | `server/routes/macaroni-packages.ts:420` |
| PATCH | `/api/macaroni/packages/:packageId/items/:itemId` | Partially update macaroni packages packageId items itemId. | Permission | `server/routes/macaroni-packages.ts:541` |
| GET | `/api/macaroni/packages/:packageId/source` | Read or list macaroni packages packageId source. | Permission | `server/routes/macaroni-packages.ts:773` |
| POST | `/api/macaroni/publish` | Create, submit, or run macaroni publish. | Permission | `server/routes/macaroni.ts:763` |
| POST | `/api/macaroni/reveal-automation` | Create, submit, or run macaroni reveal automation. | Public/handler | `server/routes/macaroni.ts:717` |
| POST | `/api/macaroni/reveal-automation/challenge` | Create, submit, or run macaroni reveal automation challenge. | Public/handler | `server/routes/macaroni.ts:703` |
| GET | `/api/macaroni/reveal-operator` | Read or list macaroni reveal operator. | Public/handler | `server/routes/macaroni.ts:691` |
| POST | `/api/macaroni/reveal-request` | Create, submit, or run macaroni reveal request. | Public/handler | `server/routes/macaroni.ts:751` |

</details>

<details>
<summary><code>mail</code> — 8 operations</summary>

Mailbox, aliases, messages, attachments, and delivery administration.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/mail/bot/provision` | Create, submit, or run mail bot provision. | Public/handler | `server/routes/mail.ts:180` |
| GET | `/api/mail/eligibility` | Read or list mail eligibility. | Session | `server/routes/mail.ts:134` |
| GET | `/api/mail/messages` | Read or list mail messages. | Session | `server/routes/mail.ts:219` |
| GET | `/api/mail/messages/:id` | Read or list mail messages id. | Session | `server/routes/mail.ts:233` |
| POST | `/api/mail/provision` | Create, submit, or run mail provision. | Session | `server/routes/mail.ts:149` |
| POST | `/api/mail/send` | Create, submit, or run mail send. | Session | `server/routes/mail.ts:249` |
| GET | `/api/mail/status` | Read or list mail status. | Session | `server/routes/mail.ts:209` |
| POST | `/api/mail/webhooks/resend` | Create, submit, or run mail webhooks resend. | Public/handler | `server/routes/mail.ts:271` |

</details>

<details>
<summary><code>marketplace</code> — 10 operations</summary>

NFT marketplace listings, offers, purchases, and chain synchronization.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/marketplace` | Read or list marketplace. | Public/handler | `server/routes/marketplace.ts:874` |
| POST | `/api/marketplace` | Create, submit, or run marketplace. | Session | `server/routes/marketplace.ts:1105` |
| GET | `/api/marketplace/:id` | Read or list marketplace id. | Public/handler | `server/routes/marketplace.ts:1056` |
| PUT | `/api/marketplace/:id` | Replace or set marketplace id. | Session | `server/routes/marketplace.ts:1290` |
| POST | `/api/marketplace/:id/bid` | Create, submit, or run marketplace id bid. | Session | `server/routes/marketplace.ts:1351` |
| POST | `/api/marketplace/:id/cancel` | Create, submit, or run marketplace id cancel. | Session | `server/routes/marketplace.ts:1462` |
| GET | `/api/marketplace/external/mine` | Read or list marketplace external mine. | Session | `server/routes/marketplace.ts:965` |
| GET | `/api/marketplace/mine` | Read or list marketplace mine. | Session | `server/routes/marketplace.ts:934` |
| GET | `/api/marketplace/onchain` | Read or list marketplace onchain. | Public/handler | `server/routes/marketplace.ts:540` |
| GET | `/api/marketplace/trade-board` | Read or list marketplace trade board. | Public/handler | `server/routes/marketplace.ts:674` |

</details>

<details>
<summary><code>mastodon</code> — 6 operations</summary>

Mastodon connection, timelines, identity, and posting.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/mastodon/account` | Read or list mastodon account. | Session | `server/routes/mastodon.ts:41` |
| DELETE | `/api/mastodon/link` | Delete, revoke, or stop mastodon link. | Session | `server/routes/mastodon.ts:121` |
| POST | `/api/mastodon/link` | Create, submit, or run mastodon link. | Session | `server/routes/mastodon.ts:62` |
| GET | `/api/mastodon/preferences` | Read or list mastodon preferences. | Session | `server/routes/mastodon.ts:158` |
| PUT | `/api/mastodon/preferences` | Replace or set mastodon preferences. | Session | `server/routes/mastodon.ts:172` |
| GET | `/api/mastodon/timeline` | Read or list mastodon timeline. | Session | `server/routes/mastodon.ts:133` |

</details>

<details>
<summary><code>mcp</code> — 3 operations</summary>

MCP pairing-token management; the root `/mcp` endpoint carries Streamable HTTP MCP traffic.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/mcp/tokens` | Read or list mcp tokens. | Session | `server/routes/mcp.ts:171` |
| POST | `/api/mcp/tokens` | Create, submit, or run mcp tokens. | Session | `server/routes/mcp.ts:198` |
| DELETE | `/api/mcp/tokens/:id` | Delete, revoke, or stop mcp tokens id. | Session | `server/routes/mcp.ts:247` |

</details>

<details>
<summary><code>media</code> — 9 operations</summary>

Media library metadata, uploads, imports, files, and lifecycle management.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| DELETE | `/api/media/:id` | Delete, revoke, or stop media id. | Session | `server/routes/media-library.ts:1053` |
| GET | `/api/media/:id` | Read or list media id. | Session | `server/routes/media-library.ts:304` |
| PUT | `/api/media/:id` | Replace or set media id. | Session | `server/routes/media-library.ts:872` |
| POST | `/api/media/:id/drive-backup` | Create, submit, or run media id drive backup. | Session | `server/routes/media-library.ts:743` |
| GET | `/api/media/:id/file` | Read or list media id file. | Session | `server/routes/media-library.ts:833` |
| GET | `/api/media/:id/usage` | Read or list media id usage. | Session | `server/routes/media-library.ts:961` |
| POST | `/api/media/import-token` | Create, submit, or run media import token. | Session | `server/routes/media-library.ts:361` |
| GET | `/api/media/mine` | Read or list media mine. | Session | `server/routes/media-library.ts:234` |
| POST | `/api/media/upload` | Create, submit, or run media upload. | Session | `server/routes/media-library.ts:510` |

</details>

<details>
<summary><code>messages</code> — 21 operations</summary>

Direct-message conversations, messages, participants, and read state.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| DELETE | `/api/messages/:id` | Delete, revoke, or stop messages id. | Session | `server/routes/messages.ts:1838` |
| PUT | `/api/messages/:id` | Replace or set messages id. | Session | `server/routes/messages.ts:1803` |
| PUT | `/api/messages/:id/pin` | Replace or set messages id pin. | Permission | `server/routes/messages.ts:1864` |
| GET | `/api/messages/dm-reports` | Read or list messages dm reports. | Permission | `server/routes/messages.ts:1037` |
| POST | `/api/messages/dm-reports/:id/review` | Create, submit, or run messages dm reports id review. | Permission | `server/routes/messages.ts:1104` |
| GET | `/api/messages/dms` | Read or list messages dms. | Session | `server/routes/messages.ts:283` |
| POST | `/api/messages/dms` | Create, submit, or run messages dms. | Session | `server/routes/messages.ts:428` |
| POST | `/api/messages/dms/:conversationId/messages/:messageId/report` | Create, submit, or run messages dms conversationId messages messageId report. | Session | `server/routes/messages.ts:959` |
| GET | `/api/messages/dms/:id/messages` | Read or list messages dms id messages. | Session | `server/routes/messages.ts:536` |
| POST | `/api/messages/dms/:id/messages` | Create, submit, or run messages dms id messages. | Session | `server/routes/messages.ts:603` |
| PUT | `/api/messages/dms/:id/messages/:messageId/pin` | Replace or set messages dms id messages messageId pin. | Session | `server/routes/messages.ts:795` |
| GET | `/api/messages/dms/:id/pins` | Read or list messages dms id pins. | Session | `server/routes/messages.ts:872` |
| PUT | `/api/messages/dms/:id/read` | Replace or set messages dms id read. | Session | `server/routes/messages.ts:923` |
| GET | `/api/messages/threads` | Read or list messages threads. | Public/handler | `server/routes/messages.ts:1174` |
| POST | `/api/messages/threads` | Create, submit, or run messages threads. | Permission | `server/routes/messages.ts:1240` |
| DELETE | `/api/messages/threads/:id` | Delete, revoke, or stop messages threads id. | Permission | `server/routes/messages.ts:1590` |
| GET | `/api/messages/threads/:id` | Read or list messages threads id. | Public/handler | `server/routes/messages.ts:1306` |
| PUT | `/api/messages/threads/:id` | Replace or set messages threads id. | Permission | `server/routes/messages.ts:1491` |
| POST | `/api/messages/threads/:id/replies` | Create, submit, or run messages threads id replies. | Session | `server/routes/messages.ts:1381` |
| DELETE | `/api/messages/threads/:threadId/replies/:replyId` | Delete, revoke, or stop messages threads threadId replies replyId. | Session | `server/routes/messages.ts:1451` |
| GET | `/api/messages/users` | Read or list messages users. | Session | `server/routes/messages.ts:177` |

</details>

<details>
<summary><code>mint</code> — 4 operations</summary>

Mint portal configuration and minting workflows.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/mint-portal/challenges` | Read or list mint portal challenges. | Session | `server/routes/mint-portal.ts:32` |
| GET | `/api/mint-portal/contracts` | Read or list mint portal contracts. | Session | `server/routes/mint-portal.ts:137` |
| POST | `/api/mint-portal/match` | Create, submit, or run mint portal match. | Session | `server/routes/mint-portal.ts:260` |
| POST | `/api/mint-portal/record-mint` | Create, submit, or run mint portal record mint. | Session | `server/routes/mint-portal.ts:184` |

</details>

<details>
<summary><code>mint-manager</code> — 2 operations</summary>

Operations for the mint manager domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/mint-manager/receipt` | Create, submit, or run mint manager receipt. | Session | `server/routes/mint-manager.ts:122` |
| GET | `/api/mint-manager/receipts/:mediaItemId` | Read or list mint manager receipts mediaItemId. | Session | `server/routes/mint-manager.ts:98` |

</details>

<details>
<summary><code>music</code> — 5 operations</summary>

Music catalogue, playback metadata, and library actions.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/music/now-playing` | Read or list music now playing. | Session | `server/routes/music.ts:88` |
| PUT | `/api/music/now-playing` | Replace or set music now playing. | Session | `server/routes/music.ts:97` |
| GET | `/api/music/playlists` | Read or list music playlists. | Session | `server/routes/music.ts:30` |
| POST | `/api/music/playlists` | Create, submit, or run music playlists. | Session | `server/routes/music.ts:39` |
| POST | `/api/music/playlists/:id/tracks` | Create, submit, or run music playlists id tracks. | Session | `server/routes/music.ts:66` |

</details>

<details>
<summary><code>notifications</code> — 6 operations</summary>

Notification feeds, preferences, and read state.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/notifications` | Read or list notifications. | Session | `server/routes/notifications.ts:115` |
| PUT | `/api/notifications/:id/opened` | Replace or set notifications id opened. | Session | `server/routes/notifications.ts:246` |
| PUT | `/api/notifications/:id/read` | Replace or set notifications id read. | Session | `server/routes/notifications.ts:207` |
| GET | `/api/notifications/preferences` | Read or list notifications preferences. | Session | `server/routes/notifications.ts:70` |
| PUT | `/api/notifications/preferences` | Replace or set notifications preferences. | Session | `server/routes/notifications.ts:83` |
| PUT | `/api/notifications/read-all` | Replace or set notifications read all. | Session | `server/routes/notifications.ts:183` |

</details>

<details>
<summary><code>objkt-operator</code> — 11 operations</summary>

Operations for the objkt operator domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/objkt-operator/access` | Read or list objkt operator access. | Session | `server/routes/objkt-operator.ts:32` |
| PATCH | `/api/objkt-operator/creators/:address` | Partially update objkt operator creators address. | Public/handler | `server/routes/objkt-operator.ts:229` |
| GET | `/api/objkt-operator/creators/:address/portfolio` | Read or list objkt operator creators address portfolio. | Public/handler | `server/routes/objkt-operator.ts:213` |
| POST | `/api/objkt-operator/discover` | Create, submit, or run objkt operator discover. | Public/handler | `server/routes/objkt-operator.ts:184` |
| PATCH | `/api/objkt-operator/queue` | Partially update objkt operator queue. | Public/handler | `server/routes/objkt-operator.ts:330` |
| POST | `/api/objkt-operator/queue` | Create, submit, or run objkt operator queue. | Public/handler | `server/routes/objkt-operator.ts:284` |
| POST | `/api/objkt-operator/scan` | Create, submit, or run objkt operator scan. | Public/handler | `server/routes/objkt-operator.ts:258` |
| PATCH | `/api/objkt-operator/session` | Partially update objkt operator session. | Public/handler | `server/routes/objkt-operator.ts:172` |
| PATCH | `/api/objkt-operator/settings` | Partially update objkt operator settings. | Public/handler | `server/routes/objkt-operator.ts:128` |
| GET | `/api/objkt-operator/state` | Read or list objkt operator state. | Public/handler | `server/routes/objkt-operator.ts:119` |
| PATCH | `/api/objkt-operator/wallet` | Partially update objkt operator wallet. | Public/handler | `server/routes/objkt-operator.ts:150` |

</details>

<details>
<summary><code>operator</code> — 9 operations</summary>

Operator-wallet configuration and transaction workflows.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/operator-wallet/balances/refresh` | Create, submit, or run operator wallet balances refresh. | Permission | `server/routes/operator-wallet.ts:182` |
| POST | `/api/operator-wallet/buyback/:action` | Create, submit, or run operator wallet buyback action. | Permission | `server/routes/operator-wallet.ts:539` |
| POST | `/api/operator-wallet/disburse/preview` | Create, submit, or run operator wallet disburse preview. | Permission | `server/routes/operator-wallet.ts:334` |
| POST | `/api/operator-wallet/disburse/run` | Create, submit, or run operator wallet disburse run. | Permission | `server/routes/operator-wallet.ts:378` |
| GET | `/api/operator-wallet/ledger/unpaid` | Read or list operator wallet ledger unpaid. | Permission | `server/routes/operator-wallet.ts:828` |
| GET | `/api/operator-wallet/runs` | Read or list operator wallet runs. | Permission | `server/routes/operator-wallet.ts:719` |
| POST | `/api/operator-wallet/runs/:id/reconcile` | Create, submit, or run operator wallet runs id reconcile. | Permission | `server/routes/operator-wallet.ts:745` |
| GET | `/api/operator-wallet/signer/health` | Read or list operator wallet signer health. | Permission | `server/routes/operator-wallet.ts:164` |
| GET | `/api/operator-wallet/summary` | Read or list operator wallet summary. | Permission | `server/routes/operator-wallet.ts:115` |

</details>

<details>
<summary><code>pasta</code> — 2 operations</summary>

Pasta suite installer and package discovery.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/pasta/installers` | Read or list pasta installers. | Session | `server/routes/pasta-installers.ts:291` |
| GET | `/api/pasta/installers/catalog` | Read or list pasta installers catalog. | Session | `server/routes/pasta-installers.ts:298` |

</details>

<details>
<summary><code>penne</code> — 1 operations</summary>

Penne installer discovery.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/penne/installers` | Read or list penne installers. | Session | `server/routes/penne-installers.ts:55` |

</details>

<details>
<summary><code>porcupin</code> — 5 operations</summary>

Porcupin pinning service status and operations.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/porcupin/connect` | Create, submit, or run porcupin connect. | Session | `server/routes/porcupin.ts:101` |
| DELETE | `/api/porcupin/connection` | Delete, revoke, or stop porcupin connection. | Session | `server/routes/porcupin.ts:172` |
| GET | `/api/porcupin/connection` | Read or list porcupin connection. | Session | `server/routes/porcupin.ts:80` |
| GET | `/api/porcupin/premium-eligibility` | Read or list porcupin premium eligibility. | Session | `server/routes/porcupin.ts:239` |
| GET | `/api/porcupin/status` | Read or list porcupin status. | Session | `server/routes/porcupin.ts:185` |

</details>

<details>
<summary><code>portfolio</code> — 5 operations</summary>

Wallet portfolio positions and valuation views.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/portfolio/activity/acquisitions` | Read or list portfolio activity acquisitions. | Session | `server/routes/portfolio.ts:97` |
| GET | `/api/portfolio/activity/sales` | Read or list portfolio activity sales. | Session | `server/routes/portfolio.ts:113` |
| GET | `/api/portfolio/summary` | Read or list portfolio summary. | Session | `server/routes/portfolio.ts:46` |
| GET | `/api/portfolio/summary/:address` | Read or list portfolio summary address. | Session | `server/routes/portfolio.ts:57` |
| GET | `/api/portfolio/tokens/:contract/:tokenId/market` | Read or list portfolio tokens contract tokenId market. | Public/handler | `server/routes/portfolio.ts:129` |

</details>

<details>
<summary><code>profile</code> — 16 operations</summary>

Current-user profile, social identities, settings, and public user views.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/profile/account` | Read or list profile account. | Session | `server/routes/profile.ts:184` |
| PUT | `/api/profile/account` | Replace or set profile account. | Session | `server/routes/profile.ts:209` |
| PUT | `/api/profile/avatar-media` | Replace or set profile avatar media. | Session | `server/routes/profile.ts:506` |
| GET | `/api/profile/avatar-media/:id/file` | Read or list profile avatar media id file. | Public/handler | `server/routes/profile.ts:595` |
| GET | `/api/profile/dossier` | Read or list profile dossier. | Session | `server/routes/wallets.ts:1194` |
| DELETE | `/api/profile/pfp` | Delete, revoke, or stop profile pfp. | Session | `server/routes/profile.ts:477` |
| PUT | `/api/profile/pfp` | Replace or set profile pfp. | Session | `server/routes/profile.ts:422` |
| GET | `/api/profile/pfp-candidates` | Read or list profile pfp candidates. | Session | `server/routes/profile.ts:634` |
| GET | `/api/profile/social` | Read or list profile social. | Session | `server/routes/profile.ts:138` |
| PUT | `/api/profile/social` | Replace or set profile social. | Session | `server/routes/profile.ts:253` |
| DELETE | `/api/profile/social/:provider` | Delete, revoke, or stop profile social provider. | Session | `server/routes/profile.ts:356` |
| GET | `/api/profile/tokens` | Read or list profile tokens. | Session | `server/routes/wallets.ts:635` |
| POST | `/api/profile/tokens/sync` | Create, submit, or run profile tokens sync. | Session | `server/routes/wallets.ts:915` |
| POST | `/api/profile/tokens/trade-board` | Create, submit, or run profile tokens trade board. | Session | `server/routes/wallets.ts:832` |
| GET | `/api/profile/wallet-graph` | Read or list profile wallet graph. | Session | `server/routes/wallets.ts:443` |
| GET | `/api/profile/xp` | Read or list profile xp. | Session | `server/routes/profile.ts:730` |

</details>

<details>
<summary><code>protocol</code> — 10 operations</summary>

Non-REST protocol and discovery endpoints.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/.well-known/atproto-did` | Read or list .well known atproto did. | Public/handler | `server/routes/atproto.ts:1497` |
| GET | `/.well-known/oauth-client-metadata.json` | Read or list .well known oauth client metadata.json. | Public/handler | `server/routes/atproto.ts:707` |
| GET | `/^\/api\/arcade\/source\/(.+)$/` | Read or list ^\ api\ arcade\ source\ (.+)$. | Public/handler | `server/routes/arcade.ts:81` |
| GET | `/^\/api\/console\/bundles\/(.+)$/` | Read or list ^\ api\ console\ bundles\ (.+)$. | Public/handler | `server/routes/console.ts:82` |
| GET | `/^\/api\/console\/source-arcade\/(.+)$/` | Read or list ^\ api\ console\ source arcade\ (.+)$. | Public/handler | `server/routes/console.ts:84` |
| GET | `/internal/tls/allow` | Read or list internal tls allow. | Internal | `server/routes/wtf-sites.ts:49` |
| ALL | `/mcp` | Handle the supported methods for mcp. | MCP bearer | `server/routes/mcp.ts:282` |
| GET | `/oembed` | Read or list oembed. | Public/handler | `server/routes/tv-embed.ts:185` |
| GET | `/xrpc/app.wtfos.appview.getRecord` | Read or list xrpc app.wtfos.appview.getRecord. | Public/handler | `server/features/atproto-spine/appview/router.ts:73` |
| GET | `/xrpc/app.wtfos.appview.getRecords` | Read or list xrpc app.wtfos.appview.getRecords. | Public/handler | `server/features/atproto-spine/appview/router.ts:72` |

</details>

<details>
<summary><code>public</code> — 4 operations</summary>

Operations for the public domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/public` | Read or list public. | Public/handler | `server/routes.ts:215` |
| GET | `/api/public/capabilities` | Read or list public capabilities. | Public/handler | `server/routes.ts:215` |
| GET | `/api/public/docs` | Read or list public docs. | Public/handler | `server/routes.ts:225` |
| GET | `/api/public/openapi.json` | Read or list public openapi.json. | Public/handler | `server/routes.ts:220` |

</details>

<details>
<summary><code>rat</code> — 2 operations</summary>

Rat Race feeds, token candidates, voting, and results.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/rat-race/events` | Create, submit, or run rat race events. | Session | `server/routes/rat-race.ts:60` |
| GET | `/api/rat-race/hot-tokens` | Read or list rat race hot tokens. | Session | `server/routes/rat-race.ts:40` |

</details>

<details>
<summary><code>ravioli</code> — 1 operations</summary>

Operations for the ravioli domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/ravioli/installers` | Read or list ravioli installers. | Session | `server/routes/ravioli-installers.ts:55` |

</details>

<details>
<summary><code>reggie</code> — 2 operations</summary>

Reggie quest state, actions, and administration.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/reggie/messages` | Create, submit, or run reggie messages. | Session | `server/challenges/routes/reggie.ts:300` |
| GET | `/api/reggie/quest` | Read or list reggie quest. | Session | `server/challenges/routes/reggie.ts:207` |

</details>

<details>
<summary><code>reward-flags</code> — 2 operations</summary>

Operations for the reward flags domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/reward-flags/challenges` | Read or list reward flags challenges. | Session | `server/routes/challenges.ts:599` |
| PUT | `/api/reward-flags/challenges/:id/claim` | Replace or set reward flags challenges id claim. | Session | `server/routes/challenges.ts:631` |

</details>

<details>
<summary><code>rewards</code> — 4 operations</summary>

Reward catalogue, claims, balances, and ledger operations.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/rewards/account` | Read or list rewards account. | Session | `server/routes/rewards.ts:239` |
| POST | `/api/rewards/cashout` | Create, submit, or run rewards cashout. | Session | `server/routes/rewards.ts:412` |
| GET | `/api/rewards/cashouts` | Read or list rewards cashouts. | Session | `server/routes/rewards.ts:267` |
| POST | `/api/rewards/cashouts/:id/confirm` | Create, submit, or run rewards cashouts id confirm. | Session | `server/routes/rewards.ts:278` |

</details>

<details>
<summary><code>rotini</code> — 1 operations</summary>

Rotini installer discovery.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/rotini/installers` | Read or list rotini installers. | Session | `server/routes/rotini-installers.ts:55` |

</details>

<details>
<summary><code>rounds</code> — 8 operations</summary>

Operations for the rounds domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/rounds` | Read or list rounds. | Public/handler | `server/routes/seasons.ts:290` |
| POST | `/api/rounds` | Create, submit, or run rounds. | Permission | `server/routes/seasons.ts:335` |
| DELETE | `/api/rounds/:id` | Delete, revoke, or stop rounds id. | Permission | `server/routes/seasons.ts:435` |
| GET | `/api/rounds/:id` | Read or list rounds id. | Public/handler | `server/routes/seasons.ts:317` |
| PUT | `/api/rounds/:id` | Replace or set rounds id. | Permission | `server/routes/seasons.ts:375` |
| POST | `/api/rounds/:id/advance` | Create, submit, or run rounds id advance. | Permission | `server/routes/control-board.ts:637` |
| PUT | `/api/rounds/:id/elimination-rule` | Replace or set rounds id elimination rule. | Permission | `server/routes/control-board.ts:350` |
| POST | `/api/rounds/:id/run-rule` | Create, submit, or run rounds id run rule. | Permission | `server/routes/control-board.ts:402` |

</details>

<details>
<summary><code>seasons</code> — 7 operations</summary>

Season catalogue and active-season state.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/seasons` | Read or list seasons. | Public/handler | `server/routes/seasons.ts:174` |
| POST | `/api/seasons` | Create, submit, or run seasons. | Permission | `server/routes/seasons.ts:206` |
| DELETE | `/api/seasons/:id` | Delete, revoke, or stop seasons id. | Permission | `server/routes/seasons.ts:275` |
| GET | `/api/seasons/:id` | Read or list seasons id. | Public/handler | `server/routes/seasons.ts:186` |
| PUT | `/api/seasons/:id` | Replace or set seasons id. | Permission | `server/routes/seasons.ts:236` |
| POST | `/api/seasons/:id/ante/attest` | Create, submit, or run seasons id ante attest. | Session | `server/routes/wtf-recapture.ts:106` |
| GET | `/api/seasons/:id/contestants` | Read or list seasons id contestants. | Permission | `server/routes/control-board.ts:313` |

</details>

<details>
<summary><code>side</code> — 8 operations</summary>

Side-quest catalogue, progress, and completion.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/side-quests` | Read or list side quests. | Public/handler | `server/routes/side-quests.ts:416` |
| POST | `/api/side-quests` | Create, submit, or run side quests. | Permission | `server/routes/side-quests.ts:523` |
| GET | `/api/side-quests/:id` | Read or list side quests id. | Session | `server/routes/side-quests.ts:457` |
| PUT | `/api/side-quests/:id` | Replace or set side quests id. | Permission | `server/routes/side-quests.ts:560` |
| POST | `/api/side-quests/:id/complete` | Create, submit, or run side quests id complete. | Session | `server/routes/side-quests.ts:619` |
| POST | `/api/side-quests/:id/entry-fee/:feeId/confirm` | Create, submit, or run side quests id entry fee feeId confirm. | Permission | `server/routes/wtf-recapture.ts:288` |
| POST | `/api/side-quests/:id/entry-fee/attest` | Create, submit, or run side quests id entry fee attest. | Session | `server/routes/wtf-recapture.ts:195` |
| GET | `/api/side-quests/my/completions` | Read or list side quests my completions. | Session | `server/routes/side-quests.ts:504` |

</details>

<details>
<summary><code>side-quest-completions</code> — 1 operations</summary>

Operations for the side quest completions domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| PUT | `/api/side-quest-completions/:id/approve` | Replace or set side quest completions id approve. | Permission | `server/routes/side-quests.ts:726` |

</details>

<details>
<summary><code>skywire</code> — 38 operations</summary>

Bluesky/Skywire accounts, feeds, posts, chat, moderation, and OAuth.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/skywire/actor/:actor/feed` | Read or list skywire actor actor feed. | Session | `server/routes/skywire.ts:2357` |
| GET | `/api/skywire/actors/follows` | Read or list skywire actors follows. | Session | `server/routes/skywire.ts:2241` |
| GET | `/api/skywire/actors/recommended` | Read or list skywire actors recommended. | Session | `server/routes/skywire.ts:2201` |
| GET | `/api/skywire/actors/search` | Read or list skywire actors search. | Session | `server/routes/skywire.ts:2329` |
| GET | `/api/skywire/actors/suggestions` | Read or list skywire actors suggestions. | Session | `server/routes/skywire.ts:2260` |
| GET | `/api/skywire/chat-media/:mediaId/file` | Read or list skywire chat media mediaId file. | Public/handler | `server/routes/skywire.ts:1567` |
| GET | `/api/skywire/chats` | Read or list skywire chats. | Session | `server/routes/skywire.ts:1603` |
| GET | `/api/skywire/chats/:convoId/messages` | Read or list skywire chats convoId messages. | Session | `server/routes/skywire.ts:1650` |
| POST | `/api/skywire/chats/:convoId/messages` | Create, submit, or run skywire chats convoId messages. | Session | `server/routes/skywire.ts:1684` |
| POST | `/api/skywire/chats/resolve` | Create, submit, or run skywire chats resolve. | Session | `server/routes/skywire.ts:1622` |
| POST | `/api/skywire/chats/send` | Create, submit, or run skywire chats send. | Session | `server/routes/skywire.ts:1723` |
| POST | `/api/skywire/events` | Create, submit, or run skywire events. | Session | `server/routes/skywire.ts:1801` |
| GET | `/api/skywire/feed` | Read or list skywire feed. | Session | `server/routes/skywire.ts:2037` |
| POST | `/api/skywire/follow` | Create, submit, or run skywire follow. | Session | `server/routes/skywire.ts:2385` |
| POST | `/api/skywire/like` | Create, submit, or run skywire like. | Session | `server/routes/skywire.ts:2606` |
| DELETE | `/api/skywire/live-status` | Delete, revoke, or stop skywire live status. | Session | `server/routes/skywire.ts:1894` |
| GET | `/api/skywire/live-status` | Read or list skywire live status. | Session | `server/routes/skywire.ts:1815` |
| POST | `/api/skywire/live-status` | Create, submit, or run skywire live status. | Session | `server/routes/skywire.ts:1843` |
| GET | `/api/skywire/notifications` | Read or list skywire notifications. | Session | `server/routes/skywire.ts:2711` |
| GET | `/api/skywire/pipelines` | Read or list skywire pipelines. | Session | `server/routes/skywire.ts:1460` |
| POST | `/api/skywire/pipelines/dispatch` | Create, submit, or run skywire pipelines dispatch. | Public/handler | `server/routes/skywire.ts:1504` |
| POST | `/api/skywire/pipelines/dispatch-batch` | Create, submit, or run skywire pipelines dispatch batch. | Public/handler | `server/routes/skywire.ts:1534` |
| GET | `/api/skywire/pipelines/history` | Read or list skywire pipelines history. | Session | `server/routes/skywire.ts:1469` |
| POST | `/api/skywire/post` | Create, submit, or run skywire post. | Session | `server/routes/skywire.ts:2475` |
| POST | `/api/skywire/post/claim` | Create, submit, or run skywire post claim. | Session | `server/routes/skywire.ts:2532` |
| GET | `/api/skywire/post/thread` | Read or list skywire post thread. | Session | `server/routes/skywire.ts:2442` |
| POST | `/api/skywire/profile` | Create, submit, or run skywire profile. | Session | `server/routes/skywire.ts:2408` |
| GET | `/api/skywire/profile/:actor` | Read or list skywire profile actor. | Public/handler | `server/routes/skywire.ts:2322` |
| POST | `/api/skywire/quote` | Create, submit, or run skywire quote. | Session | `server/routes/skywire.ts:2680` |
| POST | `/api/skywire/reply` | Create, submit, or run skywire reply. | Session | `server/routes/skywire.ts:2648` |
| POST | `/api/skywire/repost` | Create, submit, or run skywire repost. | Session | `server/routes/skywire.ts:2627` |
| GET | `/api/skywire/share-intent` | Read or list skywire share intent. | Public/handler | `server/routes/skywire.ts:1417` |
| GET | `/api/skywire/signals` | Read or list skywire signals. | Session | `server/routes/skywire.ts:2722` |
| POST | `/api/skywire/signals` | Create, submit, or run skywire signals. | Session | `server/routes/skywire.ts:2739` |
| GET | `/api/skywire/status` | Read or list skywire status. | Session | `server/routes/skywire.ts:1421` |
| GET | `/api/skywire/tezos-vault` | Read or list skywire tezos vault. | Session | `server/routes/skywire.ts:1925` |
| GET | `/api/skywire/token-link` | Read or list skywire token link. | Session | `server/routes/skywire.ts:1779` |
| GET | `/api/skywire/trending-topics` | Read or list skywire trending topics. | Public/handler | `server/routes/skywire.ts:1433` |

</details>

<details>
<summary><code>social</code> — 12 operations</summary>

Social-automation drafts, promotion queues, approvals, and opt-in controls.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/social-automation/opt-in/:userId` | Read or list social automation opt in userId. | Admin | `server/features/social-automation/routes.ts:162` |
| PUT | `/api/social-automation/opt-in/:userId` | Replace or set social automation opt in userId. | Public/handler | `server/features/social-automation/routes.ts:182` |
| POST | `/api/social-automation/promoter/enable` | Create, submit, or run social automation promoter enable. | Admin | `server/features/social-automation/routes.ts:70` |
| GET | `/api/social-automation/promoter/status` | Read or list social automation promoter status. | Admin | `server/features/social-automation/routes.ts:88` |
| GET | `/api/social-automation/promoter/tweets` | Read or list social automation promoter tweets. | Admin | `server/features/social-automation/routes.ts:92` |
| POST | `/api/social-automation/promoter/tweets/:idx/approve` | Create, submit, or run social automation promoter tweets idx approve. | Admin | `server/features/social-automation/routes.ts:96` |
| POST | `/api/social-automation/promoter/tweets/:idx/dismiss` | Create, submit, or run social automation promoter tweets idx dismiss. | Admin | `server/features/social-automation/routes.ts:104` |
| POST | `/api/social-automation/promoter/tweets/:idx/mark-posted` | Create, submit, or run social automation promoter tweets idx mark posted. | Admin | `server/features/social-automation/routes.ts:111` |
| GET | `/api/social-automation/weekly` | Read or list social automation weekly. | Admin | `server/features/social-automation/routes.ts:141` |
| POST | `/api/social-automation/weekly/:id/approve` | Create, submit, or run social automation weekly id approve. | Admin | `server/features/social-automation/routes.ts:145` |
| POST | `/api/social-automation/weekly/:id/mark-posted` | Create, submit, or run social automation weekly id mark posted. | Admin | `server/features/social-automation/routes.ts:153` |
| POST | `/api/social-automation/weekly/generate` | Create, submit, or run social automation weekly generate. | Admin | `server/features/social-automation/routes.ts:120` |

</details>

<details>
<summary><code>spaghetti</code> — 1 operations</summary>

Spaghetti installer discovery.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/spaghetti/installers` | Read or list spaghetti installers. | Session | `server/routes/spaghetti-installers.ts:55` |

</details>

<details>
<summary><code>studio</code> — 37 operations</summary>

Studio projects, files, annotations, chat, drive, administration, and workflows.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/studio/admin/drive/callback` | Read or list studio admin drive callback. | Permission | `server/routes/studio-admin.ts:107` |
| POST | `/api/studio/admin/drive/disconnect` | Create, submit, or run studio admin drive disconnect. | Permission | `server/routes/studio-admin.ts:166` |
| POST | `/api/studio/admin/drive/refresh-quota` | Create, submit, or run studio admin drive refresh quota. | Permission | `server/routes/studio-admin.ts:186` |
| POST | `/api/studio/admin/drive/root-folder` | Create, submit, or run studio admin drive root folder. | Permission | `server/routes/studio-admin.ts:237` |
| POST | `/api/studio/admin/drive/start` | Create, submit, or run studio admin drive start. | Permission | `server/routes/studio-admin.ts:71` |
| GET | `/api/studio/admin/drive/status` | Read or list studio admin drive status. | Permission | `server/routes/studio-admin.ts:48` |
| DELETE | `/api/studio/annotation-comments/:id` | Delete, revoke, or stop studio annotation comments id. | Permission | `server/routes/studio-annotations.ts:544` |
| DELETE | `/api/studio/annotations/:id` | Delete, revoke, or stop studio annotations id. | Permission | `server/routes/studio-annotations.ts:405` |
| PATCH | `/api/studio/annotations/:id` | Partially update studio annotations id. | Permission | `server/routes/studio-annotations.ts:288` |
| POST | `/api/studio/annotations/:id/comments` | Create, submit, or run studio annotations id comments. | Permission | `server/routes/studio-annotations.ts:467` |
| GET | `/api/studio/drive/callback` | Read or list studio drive callback. | Session | `server/routes/studio-drive.ts:152` |
| POST | `/api/studio/drive/disconnect` | Create, submit, or run studio drive disconnect. | Session | `server/routes/studio-drive.ts:209` |
| POST | `/api/studio/drive/refresh-quota` | Create, submit, or run studio drive refresh quota. | Session | `server/routes/studio-drive.ts:230` |
| POST | `/api/studio/drive/start` | Create, submit, or run studio drive start. | Session | `server/routes/studio-drive.ts:106` |
| GET | `/api/studio/drive/status` | Read or list studio drive status. | Session | `server/routes/studio-drive.ts:48` |
| DELETE | `/api/studio/files/:id` | Delete, revoke, or stop studio files id. | Permission | `server/routes/studio-files.ts:570` |
| PATCH | `/api/studio/files/:id` | Partially update studio files id. | Permission | `server/routes/studio-files.ts:463` |
| GET | `/api/studio/files/:id/annotations` | Read or list studio files id annotations. | Permission | `server/routes/studio-annotations.ts:104` |
| POST | `/api/studio/files/:id/annotations` | Create, submit, or run studio files id annotations. | Permission | `server/routes/studio-annotations.ts:201` |
| GET | `/api/studio/files/:id/preview` | Read or list studio files id preview. | Permission | `server/routes/studio-files.ts:439` |
| GET | `/api/studio/files/:id/raw` | Read or list studio files id raw. | Permission | `server/routes/studio-files.ts:428` |
| GET | `/api/studio/files/:id/thumbnail` | Read or list studio files id thumbnail. | Permission | `server/routes/studio-files.ts:450` |
| DELETE | `/api/studio/folders/:id` | Delete, revoke, or stop studio folders id. | Permission | `server/routes/studio.ts:1403` |
| PATCH | `/api/studio/folders/:id` | Partially update studio folders id. | Permission | `server/routes/studio.ts:1306` |
| GET | `/api/studio/projects` | Read or list studio projects. | Permission | `server/routes/studio.ts:312` |
| POST | `/api/studio/projects` | Create, submit, or run studio projects. | Permission | `server/routes/studio.ts:440` |
| DELETE | `/api/studio/projects/:id` | Delete, revoke, or stop studio projects id. | Permission | `server/routes/studio.ts:911` |
| GET | `/api/studio/projects/:id` | Read or list studio projects id. | Permission | `server/routes/studio.ts:636` |
| PATCH | `/api/studio/projects/:id` | Partially update studio projects id. | Permission | `server/routes/studio.ts:823` |
| POST | `/api/studio/projects/:id/files` | Create, submit, or run studio projects id files. | Permission | `server/routes/studio-files.ts:154` |
| POST | `/api/studio/projects/:id/folders` | Create, submit, or run studio projects id folders. | Permission | `server/routes/studio.ts:1231` |
| POST | `/api/studio/projects/:id/members` | Create, submit, or run studio projects id members. | Permission | `server/routes/studio.ts:949` |
| DELETE | `/api/studio/projects/:id/members/:userId` | Delete, revoke, or stop studio projects id members userId. | Permission | `server/routes/studio.ts:1151` |
| PATCH | `/api/studio/projects/:id/members/:userId` | Partially update studio projects id members userId. | Permission | `server/routes/studio.ts:1065` |
| PATCH | `/api/studio/projects/:id/workflow` | Partially update studio projects id workflow. | Permission | `server/routes/studio.ts:768` |
| GET | `/api/studio/user-state` | Read or list studio user state. | Permission | `server/routes/studio.ts:1459` |
| PATCH | `/api/studio/user-state` | Partially update studio user state. | Permission | `server/routes/studio.ts:1490` |

</details>

<details>
<summary><code>submissions</code> — 2 operations</summary>

Operations for the submissions domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| PUT | `/api/submissions/:id/grade` | Replace or set submissions id grade. | Permission | `server/routes/challenges.ts:373` |
| PUT | `/api/submissions/:id/reward` | Replace or set submissions id reward. | Permission | `server/routes/challenges.ts:539` |

</details>

<details>
<summary><code>system</code> — 5 operations</summary>

Client/server system logs and operational event retrieval.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| POST | `/api/system/bug-reports` | Create, submit, or run system bug reports. | Session | `server/routes/bug-reports.ts:153` |
| GET | `/api/system/logs` | Read or list system logs. | Permission | `server/routes/system-logs.ts:59` |
| POST | `/api/system/logs/client` | Create, submit, or run system logs client. | Public/handler | `server/routes/system-logs.ts:38` |
| GET | `/api/system/logs/request/:requestId` | Read or list system logs request requestId. | Permission | `server/routes/system-logs.ts:139` |
| GET | `/api/system/logs/summary` | Read or list system logs summary. | Permission | `server/routes/system-logs.ts:107` |

</details>

<details>
<summary><code>telegram-digest</code> — 10 operations</summary>

Operations for the telegram digest domain.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/telegram-digest/admin/announcements` | Read or list telegram digest admin announcements. | Permission | `server/routes/telegram-digest.ts:211` |
| POST | `/api/telegram-digest/admin/announcements` | Create, submit, or run telegram digest admin announcements. | Permission | `server/routes/telegram-digest.ts:225` |
| POST | `/api/telegram-digest/admin/sources` | Create, submit, or run telegram digest admin sources. | Permission | `server/routes/telegram-digest.ts:160` |
| DELETE | `/api/telegram-digest/admin/sources/:id` | Delete, revoke, or stop telegram digest admin sources id. | Permission | `server/routes/telegram-digest.ts:249` |
| POST | `/api/telegram-digest/bot/update` | Create, submit, or run telegram digest bot update. | Public/handler | `server/routes/telegram-digest.ts:115` |
| GET | `/api/telegram-digest/config` | Read or list telegram digest config. | Public/handler | `server/routes/telegram-digest.ts:71` |
| GET | `/api/telegram-digest/me/farts` | Read or list telegram digest me farts. | Session | `server/routes/telegram-digest.ts:127` |
| POST | `/api/telegram-digest/me/farts` | Create, submit, or run telegram digest me farts. | Session | `server/routes/telegram-digest.ts:138` |
| GET | `/api/telegram-digest/messages` | Read or list telegram digest messages. | Public/handler | `server/routes/telegram-digest.ts:99` |
| GET | `/api/telegram-digest/sources` | Read or list telegram digest sources. | Public/handler | `server/routes/telegram-digest.ts:89` |

</details>

<details>
<summary><code>tezos</code> — 4 operations</summary>

Tezos intelligence, tokens, wallets, contracts, and indexer-backed analysis.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/tezos-intel/compare` | Read or list tezos intel compare. | Public/handler | `server/features/tezos-intel/routes.ts:37` |
| GET | `/api/tezos-intel/creator/:address` | Read or list tezos intel creator address. | Public/handler | `server/features/tezos-intel/routes.ts:28` |
| GET | `/api/tezos-intel/market-pulse` | Read or list tezos intel market pulse. | Public/handler | `server/features/tezos-intel/routes.ts:50` |
| GET | `/api/tezos-intel/sources` | Read or list tezos intel sources. | Public/handler | `server/features/tezos-intel/routes.ts:21` |

</details>

<details>
<summary><code>tv</code> — 38 operations</summary>

WTF TV channels, playlists, schedules, playback, cache, telemetry, and media.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/tv/bumpers` | Read or list tv bumpers. | Session | `server/features/tv/bumper-routes.ts:41` |
| POST | `/api/tv/bumpers` | Create, submit, or run tv bumpers. | Session | `server/features/tv/bumper-routes.ts:65` |
| DELETE | `/api/tv/bumpers/:bumperId` | Delete, revoke, or stop tv bumpers bumperId. | Session | `server/features/tv/bumper-routes.ts:425` |
| PATCH | `/api/tv/bumpers/:bumperId` | Partially update tv bumpers bumperId. | Session | `server/features/tv/bumper-routes.ts:316` |
| GET | `/api/tv/bumpers/:bumperId/media` | Read or list tv bumpers bumperId media. | Public/handler | `server/features/tv/bumper-routes.ts:465` |
| GET | `/api/tv/bumpers/community` | Read or list tv bumpers community. | Public/handler | `server/features/tv/bumper-routes.ts:250` |
| GET | `/api/tv/bumpers/pool` | Read or list tv bumpers pool. | Public/handler | `server/features/tv/bumper-routes.ts:175` |
| GET | `/api/tv/cache/media` | Read or list tv cache media. | Public/handler | `server/features/tv/cache-routes.ts:42` |
| POST | `/api/tv/cache/prefetch` | Create, submit, or run tv cache prefetch. | Session | `server/features/tv/cache-routes.ts:63` |
| GET | `/api/tv/cache/stats` | Read or list tv cache stats. | Session | `server/features/tv/cache-routes.ts:45` |
| GET | `/api/tv/channels` | Read or list tv channels. | Public/handler | `server/features/tv/channel-routes.ts:76` |
| POST | `/api/tv/channels` | Create, submit, or run tv channels. | Session | `server/features/tv/channel-routes.ts:278` |
| DELETE | `/api/tv/channels/:channelId` | Delete, revoke, or stop tv channels channelId. | Session | `server/features/tv/channel-routes.ts:432` |
| GET | `/api/tv/channels/:channelId` | Read or list tv channels channelId. | Session | `server/features/tv/channel-routes.ts:158` |
| PUT | `/api/tv/channels/:channelId` | Replace or set tv channels channelId. | Session | `server/features/tv/channel-routes.ts:365` |
| GET | `/api/tv/channels/:channelId/embed` | Read or list tv channels channelId embed. | Public/handler | `server/routes/tv-embed.ts:155` |
| DELETE | `/api/tv/channels/:channelId/media/:mediaItemId` | Delete, revoke, or stop tv channels channelId media mediaItemId. | Session | `server/features/tv/channel-routes.ts:1150` |
| GET | `/api/tv/channels/:channelId/media/:mediaItemId/file` | Read or list tv channels channelId media mediaItemId file. | Public/handler | `server/features/tv/playback-routes.ts:32` |
| GET | `/api/tv/channels/:channelId/now` | Read or list tv channels channelId now. | Public/handler | `server/features/tv/live-routes.ts:32` |
| POST | `/api/tv/channels/:channelId/playlists` | Create, submit, or run tv channels channelId playlists. | Session | `server/features/tv/playlist-routes.ts:26` |
| POST | `/api/tv/channels/:channelId/refresh-sources` | Create, submit, or run tv channels channelId refresh sources. | Session | `server/features/tv/channel-routes.ts:969` |
| GET | `/api/tv/channels/:channelId/schedule` | Read or list tv channels channelId schedule. | Public/handler | `server/features/tv/live-routes.ts:290` |
| POST | `/api/tv/channels/:channelId/schedule` | Create, submit, or run tv channels channelId schedule. | Session | `server/features/tv/live-routes.ts:349` |
| DELETE | `/api/tv/channels/:channelId/schedule/:entryId` | Delete, revoke, or stop tv channels channelId schedule entryId. | Session | `server/features/tv/live-routes.ts:430` |
| GET | `/api/tv/channels/:channelId/stream` | Read or list tv channels channelId stream. | Public/handler | `server/features/tv/playback-routes.ts:118` |
| POST | `/api/tv/channels/:channelId/videos` | Create, submit, or run tv channels channelId videos. | Session | `server/features/tv/channel-routes.ts:605` |
| DELETE | `/api/tv/channels/:channelId/videos/:videoId` | Delete, revoke, or stop tv channels channelId videos videoId. | Session | `server/features/tv/channel-routes.ts:1122` |
| PUT | `/api/tv/channels/:channelId/videos/:videoId` | Replace or set tv channels channelId videos videoId. | Session | `server/features/tv/channel-routes.ts:1070` |
| GET | `/api/tv/channels/by-dial/:dial` | Read or list tv channels by dial dial. | Public/handler | `server/routes/tv-embed.ts:136` |
| GET | `/api/tv/channels/by-slug/:slug/current` | Read or list tv channels by slug slug current. | Public/handler | `server/features/tv/live-routes.ts:457` |
| GET | `/api/tv/me/playable-tokens` | Read or list tv me playable tokens. | Session | `server/features/tv/channel-routes.ts:453` |
| PUT | `/api/tv/media/:mediaItemId/bumper` | Replace or set tv media mediaItemId bumper. | Session | `server/features/tv/bumper-routes.ts:287` |
| POST | `/api/tv/playback/events` | Create, submit, or run tv playback events. | Public/handler | `server/features/tv/telemetry-routes.ts:60` |
| PATCH | `/api/tv/playlist-items/:itemId/duration` | Partially update tv playlist items itemId duration. | Session | `server/features/tv/playlist-routes.ts:239` |
| PUT | `/api/tv/playlists/:playlistId` | Replace or set tv playlists playlistId. | Session | `server/features/tv/playlist-routes.ts:78` |
| PUT | `/api/tv/playlists/:playlistId/items` | Replace or set tv playlists playlistId items. | Session | `server/features/tv/playlist-routes.ts:139` |
| GET | `/api/tv/telemetry/aggregate` | Read or list tv telemetry aggregate. | Session | `server/features/tv/telemetry-routes.ts:47` |
| POST | `/api/tv/telemetry/item-end` | Create, submit, or run tv telemetry item end. | Public/handler | `server/features/tv/telemetry-routes.ts:14` |

</details>

<details>
<summary><code>tz2at</code> — 13 operations</summary>

Tezos-to-AT Protocol bridge state, outbox, publishing, PDS, and firehose data.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/tz2at/activity` | Read or list tz2at activity. | Session | `server/routes/tz2at.ts:882` |
| GET | `/api/tz2at/ecosystem/analytics` | Read or list tz2at ecosystem analytics. | Session | `server/routes/tz2at.ts:963` |
| GET | `/api/tz2at/firehose/events` | Read or list tz2at firehose events. | Session | `server/routes/tz2at.ts:960` |
| GET | `/api/tz2at/firehose/search` | Read or list tz2at firehose search. | Session | `server/routes/tz2at.ts:961` |
| GET | `/api/tz2at/firehose/status` | Read or list tz2at firehose status. | Session | `server/routes/tz2at.ts:902` |
| POST | `/api/tz2at/import/tzbsky` | Create, submit, or run tz2at import tzbsky. | Session | `server/routes/tz2at.ts:691` |
| POST | `/api/tz2at/outbox/flush` | Create, submit, or run tz2at outbox flush. | Session | `server/routes/tz2at.ts:546` |
| GET | `/api/tz2at/outbox/status` | Read or list tz2at outbox status. | Session | `server/routes/tz2at.ts:535` |
| GET | `/api/tz2at/pds-offering` | Read or list tz2at pds offering. | Session | `server/routes/tz2at.ts:502` |
| POST | `/api/tz2at/pds-offering/request` | Create, submit, or run tz2at pds offering request. | Session | `server/routes/tz2at.ts:558` |
| GET | `/api/tz2at/pds/status` | Read or list tz2at pds status. | Session | `server/routes/tz2at.ts:523` |
| POST | `/api/tz2at/publish/wallet-link` | Create, submit, or run tz2at publish wallet link. | Session | `server/routes/tz2at.ts:781` |
| GET | `/api/tz2at/status` | Read or list tz2at status. | Session | `server/routes/tz2at.ts:498` |

</details>

<details>
<summary><code>users</code> — 5 operations</summary>

Public user profiles, activity, listings, DMs, and trade boards.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/users/:username` | Read or list users username. | Public/handler | `server/routes/profile.ts:761` |
| GET | `/api/users/:username/activity` | Read or list users username activity. | Public/handler | `server/routes/profile.ts:1003` |
| GET | `/api/users/:username/dm` | Read or list users username dm. | Session | `server/routes/profile.ts:1032` |
| GET | `/api/users/:username/listings` | Read or list users username listings. | Public/handler | `server/routes/profile.ts:960` |
| GET | `/api/users/:username/trade-board` | Read or list users username trade board. | Public/handler | `server/routes/profile.ts:854` |

</details>

<details>
<summary><code>w</code> — 43 operations</summary>

W social timeline, posts, reactions, follows, spaces, group chat, and DMs.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/w/admin/digest-handles` | Read or list w admin digest handles. | Session | `server/features/w/digest/routes.ts:79` |
| PUT | `/api/w/admin/digest-handles` | Replace or set w admin digest handles. | Session | `server/features/w/digest/routes.ts:96` |
| DELETE | `/api/w/admin/digest-handles/:handle` | Delete, revoke, or stop w admin digest handles handle. | Session | `server/features/w/digest/routes.ts:129` |
| GET | `/api/w/admin/dm-conversations` | Read or list w admin dm conversations. | Session | `server/features/w/message-routes.ts:1331` |
| ALL | `/api/w/admin/groupchat` | Handle the supported methods for w admin groupchat. | Session | `server/features/w/digest/routes.ts:65` |
| PUT | `/api/w/admin/groupchat` | Replace or set w admin groupchat. | Session | `server/features/w/message-routes.ts:1363` |
| ALL | `/api/w/admin/stream-rules` | Handle the supported methods for w admin stream rules. | Session | `server/features/w/digest/routes.ts:62` |
| GET | `/api/w/admin/stream-rules` | Read or list w admin stream rules. | Session | `server/features/w/message-routes.ts:1433` |
| PUT | `/api/w/admin/stream-rules` | Replace or set w admin stream rules. | Session | `server/features/w/message-routes.ts:1483` |
| GET | `/api/w/admin/stream-status` | Read or list w admin stream status. | Session | `server/features/w/message-routes.ts:1574` |
| GET | `/api/w/capabilities` | Read or list w capabilities. | Session | `server/features/w/digest/routes.ts:26`<br>`server/features/w/social-routes.ts:164` |
| ALL | `/api/w/direct-messages` | Handle the supported methods for w direct messages. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/direct-messages` | Create, submit, or run w direct messages. | Session | `server/features/w/message-routes.ts:1614` |
| GET | `/api/w/dm-diagnostics` | Read or list w dm diagnostics. | Session | `server/features/w/message-routes.ts:1128` |
| GET | `/api/w/follows` | Read or list w follows. | Session | `server/features/w/social-routes.ts:139` |
| POST | `/api/w/follows` | Create, submit, or run w follows. | Session | `server/features/w/social-routes.ts:151` |
| GET | `/api/w/follows/summary` | Read or list w follows summary. | Session | `server/features/w/social-routes.ts:133` |
| ALL | `/api/w/groupchat` | Handle the supported methods for w groupchat. | Session | `server/features/w/digest/routes.ts:57` |
| GET | `/api/w/groupchat` | Read or list w groupchat. | Session | `server/features/w/message-routes.ts:1328` |
| POST | `/api/w/groupchat/messages` | Create, submit, or run w groupchat messages. | Session | `server/features/w/message-routes.ts:1592` |
| ALL | `/api/w/groupchats` | Handle the supported methods for w groupchats. | Session | `server/features/w/digest/routes.ts:57` |
| GET | `/api/w/groupchats` | Read or list w groupchats. | Session | `server/features/w/message-routes.ts:1329` |
| ALL | `/api/w/like` | Handle the supported methods for w like. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/like` | Create, submit, or run w like. | Session | `server/features/w/action-routes.ts:347` |
| POST | `/api/w/link-preview` | Create, submit, or run w link preview. | Session | `server/features/w/link-preview-routes.ts:10` |
| ALL | `/api/w/media` | Handle the supported methods for w media. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/media` | Create, submit, or run w media. | Session | `server/features/w/action-routes.ts:235` |
| ALL | `/api/w/post` | Handle the supported methods for w post. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/post` | Create, submit, or run w post. | Session | `server/features/w/action-routes.ts:181` |
| ALL | `/api/w/quote` | Handle the supported methods for w quote. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/quote` | Create, submit, or run w quote. | Session | `server/features/w/action-routes.ts:421` |
| ALL | `/api/w/reply` | Handle the supported methods for w reply. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/reply` | Create, submit, or run w reply. | Session | `server/features/w/action-routes.ts:289` |
| ALL | `/api/w/repost` | Handle the supported methods for w repost. | Session | `server/features/w/digest/routes.ts:57` |
| POST | `/api/w/repost` | Create, submit, or run w repost. | Session | `server/features/w/action-routes.ts:384` |
| GET | `/api/w/spaces` | Read or list w spaces. | Session | `server/features/w/social-routes.ts:157` |
| GET | `/api/w/tezos-identities` | Read or list w tezos identities. | Session | `server/features/w/tezos-identity-routes.ts:22` |
| GET | `/api/w/timeline` | Read or list w timeline. | Session | `server/features/w/digest/routes.ts:69`<br>`server/features/w/timeline-routes.ts:83` |
| ALL | `/api/w/user-dms` | Handle the supported methods for w user dms. | Session | `server/features/w/digest/routes.ts:57` |
| GET | `/api/w/user-dms` | Read or list w user dms. | Session | `server/features/w/message-routes.ts:1598` |
| GET | `/api/w/user-dms/:conversationId/messages` | Read or list w user dms conversationId messages. | Session | `server/features/w/message-routes.ts:1602` |
| POST | `/api/w/user-dms/:conversationId/messages` | Create, submit, or run w user dms conversationId messages. | Session | `server/features/w/message-routes.ts:1606` |
| POST | `/api/w/user-dms/direct` | Create, submit, or run w user dms direct. | Session | `server/features/w/message-routes.ts:1610` |

</details>

<details>
<summary><code>wallets</code> — 11 operations</summary>

Linked Tezos wallets, balances, tokens, domains, dossiers, and synchronization.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/wallets` | Read or list wallets. | Session | `server/routes/wallets.ts:50` |
| POST | `/api/wallets` | Create, submit, or run wallets. | Session | `server/routes/wallets.ts:164` |
| GET | `/api/wallets/:address/balance` | Read or list wallets address balance. | Public/handler | `server/routes/wallets.ts:949` |
| GET | `/api/wallets/:address/dossier` | Read or list wallets address dossier. | Session | `server/routes/wallets.ts:1167` |
| POST | `/api/wallets/:address/resync` | Create, submit, or run wallets address resync. | Session | `server/routes/wallets.ts:1214` |
| POST | `/api/wallets/:address/sync` | Create, submit, or run wallets address sync. | Session | `server/routes/wallets.ts:1110` |
| GET | `/api/wallets/:address/tokens` | Read or list wallets address tokens. | Session | `server/routes/wallets.ts:958` |
| DELETE | `/api/wallets/:id` | Delete, revoke, or stop wallets id. | Session | `server/routes/wallets.ts:309` |
| PUT | `/api/wallets/:id/primary` | Replace or set wallets id primary. | Session | `server/routes/wallets.ts:351` |
| PUT | `/api/wallets/:id/tezos-domain` | Replace or set wallets id tezos domain. | Session | `server/routes/wallets.ts:381` |
| POST | `/api/wallets/challenge` | Create, submit, or run wallets challenge. | Session | `server/routes/wallets.ts:138` |

</details>

<details>
<summary><code>wtf-auctions</code> — 6 operations</summary>

WTF auction creation, bidding, state transitions, and settlement.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/wtf-auctions` | Read or list wtf auctions. | Public/handler | `server/routes/wtf-auctions.ts:266` |
| POST | `/api/wtf-auctions` | Create, submit, or run wtf auctions. | Permission | `server/routes/wtf-auctions.ts:82` |
| GET | `/api/wtf-auctions/:id` | Read or list wtf auctions id. | Public/handler | `server/routes/wtf-auctions.ts:280` |
| POST | `/api/wtf-auctions/:id/bids` | Create, submit, or run wtf auctions id bids. | Session | `server/routes/wtf-auctions.ts:314` |
| POST | `/api/wtf-auctions/:id/settle` | Create, submit, or run wtf auctions id settle. | Permission | `server/routes/wtf-auctions.ts:185` |
| POST | `/api/wtf-auctions/:id/transition` | Create, submit, or run wtf auctions id transition. | Permission | `server/routes/wtf-auctions.ts:132` |

</details>

<details>
<summary><code>wtf-live</code> — 34 operations</summary>

WTF LIVE rooms, stages, broadcasts, messages, access, invites, and show controls.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/wtf-live/public/rooms/:roomId` | Read or list wtf live public rooms roomId. | Public/handler | `server/routes/wtf-live.ts:449` |
| GET | `/api/wtf-live/public/rooms/:roomId/messages` | Read or list wtf live public rooms roomId messages. | Public/handler | `server/routes/wtf-live.ts:482` |
| GET | `/api/wtf-live/rooms` | Read or list wtf live rooms. | Public/handler | `server/routes/wtf-live.ts:674` |
| POST | `/api/wtf-live/rooms` | Create, submit, or run wtf live rooms. | Public/handler | `server/routes/wtf-live.ts:740` |
| DELETE | `/api/wtf-live/rooms/:roomId` | Delete, revoke, or stop wtf live rooms roomId. | Public/handler | `server/routes/wtf-live.ts:835` |
| PATCH | `/api/wtf-live/rooms/:roomId` | Partially update wtf live rooms roomId. | Public/handler | `server/routes/wtf-live.ts:815` |
| GET | `/api/wtf-live/rooms/:roomId/access` | Read or list wtf live rooms roomId access. | Public/handler | `server/routes/wtf-live.ts:787` |
| PATCH | `/api/wtf-live/rooms/:roomId/access` | Partially update wtf live rooms roomId access. | Public/handler | `server/routes/wtf-live.ts:799` |
| POST | `/api/wtf-live/rooms/:roomId/events` | Create, submit, or run wtf live rooms roomId events. | Public/handler | `server/routes/wtf-live.ts:646` |
| POST | `/api/wtf-live/rooms/:roomId/invites` | Create, submit, or run wtf live rooms roomId invites. | Public/handler | `server/routes/wtf-live.ts:627` |
| GET | `/api/wtf-live/rooms/:roomId/join` | Read or list wtf live rooms roomId join. | Public/handler | `server/routes/wtf-live.ts:705` |
| GET | `/api/wtf-live/rooms/:roomId/messages` | Read or list wtf live rooms roomId messages. | Public/handler | `server/routes/wtf-live.ts:851` |
| POST | `/api/wtf-live/rooms/:roomId/messages` | Create, submit, or run wtf live rooms roomId messages. | Public/handler | `server/routes/wtf-live.ts:892` |
| PATCH | `/api/wtf-live/rooms/:roomId/roles` | Partially update wtf live rooms roomId roles. | Public/handler | `server/routes/wtf-live.ts:610` |
| GET | `/api/wtf-live/rooms/:roomId/settings` | Read or list wtf live rooms roomId settings. | Public/handler | `server/routes/wtf-live.ts:564` |
| PATCH | `/api/wtf-live/rooms/:roomId/settings` | Partially update wtf live rooms roomId settings. | Public/handler | `server/routes/wtf-live.ts:574` |
| GET | `/api/wtf-live/rooms/:roomId/show-kit` | Read or list wtf live rooms roomId show kit. | Public/handler | `server/routes/wtf-live.ts:601` |
| GET | `/api/wtf-live/rooms/mine` | Read or list wtf live rooms mine. | Public/handler | `server/routes/wtf-live.ts:684` |
| GET | `/api/wtf-live/rooms/private` | Read or list wtf live rooms private. | Public/handler | `server/routes/wtf-live.ts:694` |
| GET | `/api/wtf-live/show-kits` | Read or list wtf live show kits. | Public/handler | `server/routes/wtf-live.ts:540` |
| POST | `/api/wtf-live/show-kits` | Create, submit, or run wtf live show kits. | Public/handler | `server/routes/wtf-live.ts:546` |
| GET | `/api/wtf-live/soundboard` | Read or list wtf live soundboard. | Public/handler | `server/routes/wtf-live.ts:512` |
| PUT | `/api/wtf-live/soundboard` | Replace or set wtf live soundboard. | Public/handler | `server/routes/wtf-live.ts:518` |
| GET | `/api/wtf-live/stages` | Read or list wtf live stages. | Public/handler | `server/routes/wtf-live.ts:967` |
| POST | `/api/wtf-live/stages` | Create, submit, or run wtf live stages. | Public/handler | `server/routes/wtf-live.ts:988` |
| DELETE | `/api/wtf-live/stages/:stageId` | Delete, revoke, or stop wtf live stages stageId. | Public/handler | `server/routes/wtf-live.ts:1068` |
| PATCH | `/api/wtf-live/stages/:stageId` | Partially update wtf live stages stageId. | Public/handler | `server/routes/wtf-live.ts:1048` |
| GET | `/api/wtf-live/stages/:stageId/access` | Read or list wtf live stages stageId access. | Public/handler | `server/routes/wtf-live.ts:1015` |
| PATCH | `/api/wtf-live/stages/:stageId/access` | Partially update wtf live stages stageId access. | Public/handler | `server/routes/wtf-live.ts:1027` |
| GET | `/api/wtf-live/stages/:stageId/broadcasts` | Read or list wtf live stages stageId broadcasts. | Public/handler | `server/routes/wtf-live.ts:1084` |
| POST | `/api/wtf-live/stages/:stageId/broadcasts` | Create, submit, or run wtf live stages stageId broadcasts. | Public/handler | `server/routes/wtf-live.ts:1131` |
| GET | `/api/wtf-live/stages/mine` | Read or list wtf live stages mine. | Public/handler | `server/routes/wtf-live.ts:978` |
| GET | `/api/wtf-live/status` | Read or list wtf live status. | Session | `server/routes/wtf-live.ts:435` |
| GET | `/api/wtf-live/users` | Read or list wtf live users. | Public/handler | `server/routes/wtf-live.ts:528` |

</details>

<details>
<summary><code>wtf-recapture</code> — 2 operations</summary>

WTF Recapture personal state and leaderboard.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/wtf-recapture/leaderboard` | Read or list wtf recapture leaderboard. | Public/handler | `server/routes/wtf-recapture.ts:34` |
| GET | `/api/wtf-recapture/mine` | Read or list wtf recapture mine. | Session | `server/routes/wtf-recapture.ts:82` |

</details>

<details>
<summary><code>wtf-sites</code> — 8 operations</summary>

User-site claiming, pages, assets, publishing, rollback, and administration.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| PUT | `/api/wtf-sites/assets` | Replace or set wtf sites assets. | Session | `server/routes/wtf-sites.ts:118` |
| POST | `/api/wtf-sites/claim` | Create, submit, or run wtf sites claim. | Session | `server/routes/wtf-sites.ts:63` |
| GET | `/api/wtf-sites/my` | Read or list wtf sites my. | Session | `server/routes/wtf-sites.ts:53` |
| POST | `/api/wtf-sites/pages` | Create, submit, or run wtf sites pages. | Session | `server/routes/wtf-sites.ts:91` |
| DELETE | `/api/wtf-sites/pages/:slug` | Delete, revoke, or stop wtf sites pages slug. | Session | `server/routes/wtf-sites.ts:109` |
| PUT | `/api/wtf-sites/pages/:slug` | Replace or set wtf sites pages slug. | Session | `server/routes/wtf-sites.ts:72` |
| POST | `/api/wtf-sites/publish` | Create, submit, or run wtf sites publish. | Session | `server/routes/wtf-sites.ts:129` |
| POST | `/api/wtf-sites/rollback` | Create, submit, or run wtf sites rollback. | Session | `server/routes/wtf-sites.ts:138` |

</details>

<details>
<summary><code>wtf-subdomains</code> — 8 operations</summary>

wtfos.me and wtf.tez subdomain claims, registrar workflows, configuration, and administration.

| Method | Path | Use | Access | Source |
| --- | --- | --- | --- | --- |
| GET | `/api/wtf-subdomains/chat/config` | Read or list wtf subdomains chat config. | Session | `server/routes/wtf-subdomains.ts:150` |
| GET | `/api/wtf-subdomains/hack-tez/config` | Read or list wtf subdomains hack tez config. | Session | `server/routes/wtf-subdomains.ts:137` |
| GET | `/api/wtf-subdomains/my` | Read or list wtf subdomains my. | Session | `server/routes/wtf-subdomains.ts:39` |
| GET | `/api/wtf-subdomains/pins/summary` | Read or list wtf subdomains pins summary. | Session | `server/routes/wtf-subdomains.ts:48` |
| POST | `/api/wtf-subdomains/registrar/commit` | Create, submit, or run wtf subdomains registrar commit. | Session | `server/routes/wtf-subdomains.ts:100` |
| GET | `/api/wtf-subdomains/registrar/config` | Read or list wtf subdomains registrar config. | Session | `server/routes/wtf-subdomains.ts:70` |
| POST | `/api/wtf-subdomains/registrar/prepare` | Create, submit, or run wtf subdomains registrar prepare. | Session | `server/routes/wtf-subdomains.ts:82` |
| GET | `/api/wtf-subdomains/registrar/status/:address` | Read or list wtf subdomains registrar status address. | Session | `server/routes/wtf-subdomains.ts:119` |

</details>

## Other first-party API surfaces

### Apphost daemon (private)

The browser-facing `/api/apphost/*` family above proxies a separate daemon over a Unix socket or host loopback. Its raw `/health` and `/apps*` endpoints must stay private to the host. See `apphost/docs/API.md` for request and response contracts; browser integrations should use the authenticated wtfOS proxy instead.

### Collekt Next.js sub-application

These endpoints belong to the separately deployed `apps/collekt` application, not the main Express process:

| Method | Path | Use | Source |
| --- | --- | --- | --- |
| GET | `/api/collection` | Read or list collection. | `apps/collekt/app/api/collection/route.ts:20` |
| GET | `/api/curation` | Read or list curation. | `apps/collekt/app/api/curation/route.ts:20` |
| GET | `/api/user` | Read or list user. | `apps/collekt/app/api/user/route.ts:26` |

## Integration pattern

```ts
const response = await fetch('https://wtfos.app/api/v1/me', {
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.WTFOS_ACCESS_TOKEN}`
  },
});
if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
const result = await response.json();
```

External integrations should use `/api/v1` and the OpenAPI contract. Existing in-browser code should keep using `client/src/lib/api.ts`; it supplies cookies, request IDs, CSRF tokens, one CSRF retry, and normalized legacy API errors. Server-side code in the same process should import domain services directly instead of making loopback HTTP calls.

## Maintenance

Regenerate after route changes:

```bash
node scripts/generate-wtfos-api-reference.mjs
```

The generator deliberately inventories declarations without calling the live service. A live probe is unnecessary for route completeness and would not prove conditional handler behavior. For exact query/body/response schemas, follow the source reference on the relevant row and its focused tests.
