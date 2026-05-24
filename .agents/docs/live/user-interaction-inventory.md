# WTF Platform User Interaction Inventory

Last reviewed: 2026-05-13

This inventory is the interaction contract for WTF end-to-end coverage,
EXP/reward triggers, activity monitoring, abuse review, and cheat detection. It
lists every current user-facing, staff-facing, bot-facing, and paired-agent
interaction surface found in the app route map, server route registration,
schemas, public-access docs, and feature modules.

Use this as the seed for:

- E2E test suites by issue of concern, domain, and sub-domain.
- Canonical event names for the EXP/reward/challenge/side-quest/arcade systems.
- Monitoring hooks for 100% interaction observability, warnings, alarms,
  punishments, and manual review queues.

## Source Basis

- Browser route map: `client/src/routes/page-defs.ts`.
- Server route registration: `server/routes.ts`.
- Public/API/MCP contract: `docs/public-access.md`.
- Reward and monitoring schemas: `shared/schema-admin.ts`,
  `shared/schema-gameshow.ts`, `shared/schema-liveops.ts`,
  `shared/schema-console.ts`, `shared/schema-desktop.ts`,
  `shared/schema-market.ts`, `shared/schema-wallet.ts`,
  `shared/schema-casino.ts`, `shared/schema-club-dues.ts`, and
  `shared/schema-game-studio.ts`, and `shared/schema-telegram.ts`.
- Challenge automation foundation: `shared/schema-challenge-automation.ts`,
  `server/challenges`, and `client/src/features/admin/challenges`.
- WTF OS admin surface coverage: `client/src/features/admin-os/admin-surface-registry.ts`
  and the native `AppWindow` admin panel.
- Inventory-driven E2E coverage: `tests/e2e/inventory`, `tests/playwright/inventory`,
  and `npm run test:e2e:inventory:coverage`.
- Comms mesh schemas: `shared/schema-comms.ts` and `shared/schema-mail.ts`.
- Current feature routes/modules under `server/routes`, `server/features`,
  `client/src/pages`, and `client/src/features`.

## E2E Coverage Contract

The inventory is executable through the modular E2E scheme:

- Subdomain ownership tests parse this file and create one Playwright coverage
  test for each inventory row and every canonical handle it owns.
- Route surface tests cover every concrete `PAGE_DEFS` route through
  `tests/e2e/inventory/route-fixtures.mjs`.
- Domain interoperability tests live in
  `tests/e2e/inventory/domain-workflows.mjs` and cover cross-subdomain
  workflows such as gameshow rewards, social-to-XP automation, commerce,
  media-to-Arcade publishing, TV programming, and admin operations.
- System integration tests verify strict-admin visibility, native app admin
  tooling, central challenge automation access, and normalized event-shape
  coverage for every handle in this inventory.
- Feature-depth accounting lives in
  `tests/e2e/inventory/coverage-layers.mjs` and
  `tests/playwright/inventory/feature-depth.spec.mjs`. It intentionally
  separates complete E2E skeleton coverage from full feature-behavior coverage.
- Actor-backed live orchestration lives in `tests/e2e/puppets`,
  `playwright.live.config.mjs`, and
  `tests/playwright/live/puppet-orchestration.spec.mjs`. It seeds 12 local
  puppet users with strong ignored credentials and platform-keyring-backed
  wallets, then password-logs them in, verifies wallet challenges, route-smokes
  the registered route fixtures, and runs domain workflows against a real local
  server/database. External OAuth providers remain intentionally excluded from
  this live harness.

When a feature adds or changes a route, interaction, API handle, admin surface,
reward trigger, challenge trigger, side quest verifier, bot/agent tool,
telemetry event, or normalized `SystemEvent`, the same change must update this
inventory and the appropriate fixture under `tests/e2e/inventory/`. The coverage
gate is `npm run test:e2e:inventory:coverage`; UI/interaction changes should
also run `npm run test:e2e:inventory`. Changes that touch auth, wallet binding,
roles, rewards, admin controls, durable persistence, or cross-domain workflows
should also update or run `npm run test:e2e:live:puppets` when practical.

Do not claim full feature behavior coverage from the skeleton alone. A feature
counts as behavior-covered only when a domain-owned test asserts both the
user-visible result and the durable side effect, such as a saved record, emitted
event, reward grant, permission change, wallet preflight, queue mutation, or
chain-backed verification.

## Access Legend

| Access | Meaning |
| --- | --- |
| Public | No signed-in session required. |
| Session | Signed-in browser session required. |
| Owner/creator | Signed-in user must own the wallet, media item, channel, project, grant, listing, or record. |
| Trusted creator | Signed-in user has a trusted creator role or one of `trusted_arcade_creator`, `trusted_console_creator`, `trusted_tv_creator`, or `trusted_market_creator`. |
| Admin | Strict `admin` role only. Admin screens and native OS admin panels should not be visible to host/cohost unless a separate non-admin staff screen is explicitly created. |
| Staff | Admin, host, cohost, resident wizard, or a role with the required permission. |
| Bot | Discord bot, webhook, HMAC, or server-to-server credential. |
| Agent | Paired MCP token acting only for the approved user. |
| System | Worker, scheduled import, indexer, telemetry sink, or health monitor. |

## Route Surface Matrix

| Domain | Routes and entry points |
| --- | --- |
| Public entry | `/`, `/login`, `/register`, `/leaderboard`, `/gallery`, `/gallery/token/:contract/:tokenId`, `/token/:contract/:tokenId`, `/links`, `/faq`, `/user/:username`, `/messageboard`, `/wtf-recapture`, `/calendar`, `/arcade`, `/dues`, `/discord/terms`, `/discord/privacy`, `/discord/linked-roles`, `/embed/tv/:ref`, `/oembed`. |
| Gameshow | `/dashboard`, `/rounds`, `/rounds/:id`, `/challenges`, `/side-quests`, `/mint-portal`, `/calendar`, `/wtf-recapture`, `/control-board`. |
| Social | `/messages`, `/messages/dms/:id`, `/mail`, `/digest`, `/wim`, `/aim`, `/dear-diary`, `/messageboard`, `/w`, `/w/post/:id`, `/w/chat`, `/w/groupchat/:id`, `/chat`, `/chat/:id`, `/dicksword`, `/i-hate-telegram`, `/profile`, `/wtf-subdomains`, `/user/:username`. |
| Desktop OS | Desktop shell, Start Menu, taskbar, desktop icons, command palette, `/mission-control`, `/command-palette`, `/file-manager`, `/settings`, `/browser`, `/browser-boundaries`, `/terminal`, `/theme-builder`, `/notification-center`, `/desktop-settings`, desktop pet tray, desktop artifact layer, screen saver, custom cursor, MCP pairing. |
| Wallet/portfolio | `/dashboard`, `/hoard`, `/my-gallery`, `/collekt`, `/tezos-intel`, `/wtf-subdomains`, `/swap`, `/marketplace`, `/trade-boards`, `/dues`, `/operator-wallet`, `/contract-factory`. |
| Media/creation | `/music`, `/my-videos`, `/my-photos`, `/my-music`, `/tezamp`, `/tezamp/winamp-bootloader`, `/apps/porcupin-setup`, `/apps/porcupin-dashboard`, `/studio`, `/studio/:id`, `/game-studio`, `/tools/particle-painter`, `/tools/industrializer`, `/tools/pauls-particles-v1`, `/tools/nikshumika-paint`, `/tools/kandinsky-composer`, `/tools/pixel-patterns`, `/tools/penrose-backgrounds`, `/creation-tools/pixel-patterns`, `/creation-tools/backgrounds`. |
| TV | `/tv`, `/embed/tv/:ref`, `/oembed`, public TV channel/current/stream/media/cache routes, session creator channel routes, staff canonical TV config routes. |
| Commerce | `/wtfiam`, `/marketplace`, `/trade-boards`, `/hoard`, `/swap`, `/wtf-recapture`, `/dues`, `/operator-wallet`, `/contract-factory`. |
| Arcade/console | `/arcade`, `/console`, `/game-studio`, public Arcade/Console catalogs, SDK, score/session routes, Game Studio project/build/submit routes, staff Arcade moderation/audit routes. |
| Casino | `/casino`, `/casino/wtf-button`, `/casino/rug-pull`, `/casino/guinea-pig-raceway`, WTF Casino desktop icon, Start Menu Stuffs category, casino in-app-market category, Casino membership contract, membership verification APIs, table registry, mocked WTF Button jackpot tables, mocked Rug Pull pressure table, mocked Guinea Pig Raceway 3D race table, and future wager-session routes. |
| Admin/ops | Strict-admin `/admin`, `/control-board`, `/backup-manager`, `/contract-factory`, `/operator-wallet`, `/dev/ux-lab`, OS Admin surface registry, native window admin/settings panels, health endpoints, system logs, desktop app gates, permissions, reward ledger, challenge automation, user management, Studio storage, media storage, backup restore proof. |
| Agents/automation | `/mcp`, `/api/access`, `/api/mcp/tokens`, Discord bot routes, Telegram digest bot routes, attendance bot routes, board webhooks, client logs, scheduled Arcade source import, wallet/indexing workers. |

## Concern: Entry, Authentication, and Account Identity

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Public entry | Public | View landing/login/register; open public leaderboards, gallery, links, FAQ, public profiles, message board, Arcade, TV embeds, calendar, Discord legal pages. | `public.route.viewed`, `public.link.opened` |
| Local auth | Public/session | Register; log in; land on the desktop instead of auto-opening Dashboard; run the welcome event after verified credentials; show the one-time WTF OS welcome message for unwelcomed accounts; route welcome actions to Profile or a preloaded Dear Diary entry; show the UTC-day GM NFT welcome for accounts without today's GM flag; log out; fetch current user; change or set password; handle failed or expired sessions. | `auth.register.succeeded`, `auth.register.failed`, `auth.login.succeeded`, `auth.login.failed`, `auth.welcome.event`, `auth.welcome.completed`, `auth.gm_welcome.event`, `auth.gm_welcome.completed`, `auth.logout`, `auth.password.changed` |
| Social auth | Public/session callback | Start and complete Google, GitHub, X/Twitter, and Discord OAuth; view provider config; run X OAuth diagnostics/self-test. | `auth.oauth.started`, `auth.oauth.completed`, `auth.oauth.failed`, `auth.oauth.diagnostics.viewed` |
| Wallet auth | Public/session | Request wallet challenge; verify wallet signature; create wallet-backed account; sign in through wallet proof. | `auth.wallet.challenge.created`, `auth.wallet.verify.succeeded`, `auth.wallet.verify.failed`, `auth.wallet.registered` |
| Profile identity | Session | Edit display name/bio/account fields; toggle email/social visibility; link/unlink verified X and Discord identities; view XP profile data. | `profile.updated`, `profile.social.linked`, `profile.social.unlinked`, `profile.public_visibility.updated` |
| Profile picture | Session/owner | Browse owned-token PFP candidates; search/page candidates; edit token-backed PFP on canvas; upload image media as the profile/game avatar; save or remove PFP. | `profile.pfp.candidate_viewed`, `profile.pfp.edited`, `profile.pfp.saved`, `profile.avatar_media.saved`, `profile.pfp.removed` |
| Public profile | Public/session | View public profile, public XP activity, trade board, listings, and public about/social fields; start DM lookup when signed in. | `profile.public.viewed`, `profile.dm_lookup.opened` |
| Notifications | Session | View preferences; update toggles; list/filter inbox; open notification target; mark one/all read. | `notification.preference.updated`, `notification.viewed`, `notification.read`, `notification.read_all` |

## Concern: Desktop OS, Navigation, and Personal Environment

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Window shell | Public/session by route | Open windows from routes/icons/registry-driven Start Menu sections; persist and restore local window sessions; focus/cycle existing windows; use full-screen auth overlays; contain crashed apps inside their own window; close/minimize/focus windows; show desktop and restore the previous visible working set from the taskbar or keyboard. | `desktop.window.opened`, `desktop.window.focused`, `desktop.window.closed`, `desktop.window.minimized`, `desktop.window.restored`, `desktop.show_desktop.toggled`, `desktop.start_menu.opened` |
| Mission Control | Session | View user-first status for current account, active wallet, claimable rewards, open challenges, unread notifications, failed jobs, system health, chain/RPC state, and next work; jump to the owning app without entering admin surfaces. | `mission_control.viewed`, `mission_control.action_opened`, `wallet.balance.viewed`, `challenge.viewed`, `notification.viewed`, `cockpit.sync.status_viewed` |
| Command palette | Session/public route gates | Open `/command-palette`; search live route registry and sacred workflow aliases; open apps, rounds, rewards, wallet activity, media libraries, IPFS/archive preparation, project bundles, Studio projects, system checks, local-service status, recovery reports, backup/restore proof, and admin routes only when the signed-in role can access them. | `command_palette.opened`, `command_palette.executed`, `desktop.window.opened` |
| File Manager | Session | Open `/file-manager` as the WTF dwelling map for Desktop, Projects, Media, Documents, Downloads, Vault, Apps, Chain, Archives, and Shared; view existing media/project counts and jump to each owning app without host filesystem access. | `file_manager.viewed`, `file_manager.opened`, `desktop.window.opened` |
| System Settings | Session/admin route gates | Open `/settings` as the central OS settings hub; jump to account, appearance, notifications, files, wallet, W, recovery, and admin-only settings without bypassing each owner app's permission, CSRF, wallet, or admin gates. | `system_settings.viewed`, `system_settings.opened`, `desktop.window.opened` |
| Browser Boundaries | Session | Open `/browser-boundaries`; inspect the standard access manifest, public/session/role route split, public API count, MCP bearer-token boundary, CSRF write boundary, CSP frame boundary, and explicit browser modes for normal browsing, wallet-safe mode, local development, media capture, archive/save-to-project, and admin surfaces without exposing private payloads or secrets. | `browser_boundaries.viewed`, `browser_boundaries.action_opened`, `desktop.window.opened` |
| Terminal | Session | Open `/terminal`; run allowlisted WTF OS commands for health, jobs, access manifest, routes, MCP status, Recovery Mode, Settings, Wallet, and Mission Control without executing arbitrary server shell commands. | `terminal.viewed`, `terminal.command_executed`, `desktop.window.opened` |
| Notification Center | Session | Open `/notification-center` or legacy `/notifications` as a first-class OS surface; view all/unread changes, adjust notification preferences, open supported linked targets, and mark one/all notifications read without entering direct-message threads first. | `notification_center.viewed`, `notification_center.filter_changed`, `notification_center.notification_opened`, `notification_center.mark_read`, `notification_center.mark_all_read`, `notification_center.preferences_saved`, `notification.viewed`, `notification.opened`, `notification.read`, `notification.read_all`, `notification.preference.updated` |
| Recovery Mode | Session | View user-safe incident state for health, media cache, wallet sessions, chain network overrides, and saved shell layout; disconnect local Tezos/Etherlink wallet sessions; reset local chain network overrides; clear saved window session; refresh filesystem probes; export a local recovery report; open emergency Terminal; route operator-only permissions reset, app rollback, driver quarantine, and restore-proof work to admin-gated surfaces. | `recovery_mode.viewed`, `recovery_mode.wallets_disconnected`, `recovery_mode.network_reset`, `recovery_mode.window_session_cleared`, `recovery_mode.filesystem_checked`, `recovery_mode.report_exported`, `recovery_mode.action_opened` |
| Desktop icons, shortcuts, and Start Menu app gates | Session/public gates | Open enabled app icons and registry-derived Start Menu entries organized as Apps, domain categories, account/system items, and Browse; use right-click or Shift-click Windows 95 context menus; drag enabled Start Menu items to the desktop to create route shortcuts; open/move/delete shortcuts; move/reposition native icons; reset layout; respect admin app gates across launch surfaces. | `desktop.icon.opened`, `desktop.icon.moved`, `desktop.icon_layout.reset`, `desktop.context_menu.opened`, `desktop.shortcut.created`, `desktop.shortcut.opened`, `desktop.shortcut.moved`, `desktop.shortcut.deleted` |
| Native app admin affordance | Admin | Open the native `ADM` panel inside each registered WTF OS app window; inspect domain/subdomain, adjust native settings, open central admin tabs, and review challenge automation handles for that app. | `admin.os_surface.viewed`, `admin.os_surface.setting_opened`, `admin.app_gate.updated` |
| Theme Builder | Session | Open `/theme-builder` or legacy `/desktop-settings`; choose color scheme; edit window/desktop/title/text/highlight/button colors; set/clear/upload wallpaper; set token wallpaper; choose cursor style; enable physics and gravity mode; manage desktop pet visibility and MCP pairing without leaving the user OS. | `desktop.settings.viewed`, `desktop.appearance.updated`, `desktop.wallpaper.uploaded`, `desktop.wallpaper.token_set`, `desktop.physics.updated` |
| Desktop pet | Session/agent | Enable pet; adopt/generate/revive; rename/customize; view state/events; feed, water, play, pet, clean, scoop, poop, medicine, nap, revive. Each care action can award once-daily XP. | `desktop.pet.generated`, `desktop.pet.customized`, `desktop.pet.action`, `desktop.pet.death`, `xp.awarded` |
| Desktop ambient world | Session | Post heartbeat; submit pet escape; submit toy escape; place food/water/pillow/mess/remains; observe anonymous neighboring pets/toys without topology disclosure. | `desktop.world.heartbeat`, `desktop.world.pet_escape`, `desktop.world.toy_escape`, `desktop.drop.placed`, `desktop.drop.cleaned` |
| Desktop artifacts/items | Session/owner | Render inventory-backed artifacts; use cursor tool tray, scale tool, portal gun, jukebox/Tezamp, fan, lights, sticky note, mop, vacuum, train kit, paper shredder, catapult, ant farm, and other granted artifacts. | `desktop.artifact.spawned`, `desktop.artifact.used`, `desktop.tool.selected`, `desktop.item.effect_triggered` |
| Screen saver/cursor | Session | Trigger/exit screen saver; use custom animated cursors; hide system cursor during custom cursor/care tool use. | `desktop.screensaver.started`, `desktop.screensaver.exited`, `desktop.cursor.updated` |
| MCP pairing | Session | View MCP endpoint; create named token whose scopes are capped to the signed-in user's role; copy raw token once; list active prefixes/scopes/last-use; revoke token. | `mcp.token.created`, `mcp.token.revoked`, `mcp.token.listed` |

## Concern: Wallets, Tokens, Portfolio, and On-Chain State

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Tezos wallets | Session | List linked wallets; request challenge; link connected/manual address; unlink; set primary; sync profile tokens; sync one wallet; fetch wallet WTF balance/tokens/profile dossier. | `wallet.challenge.created`, `wallet.linked`, `wallet.unlinked`, `wallet.primary_set`, `wallet.sync_requested`, `wallet.balance.viewed` |
| Wallet signer preflight | Session/wallet | Rehydrate/request active account; attach wallet provider to Taquito; validate chain id; reject mismatched account before writes. | `wallet.provider.preflight.succeeded`, `wallet.provider.preflight.failed`, `wallet.account_mismatch.blocked` |
| Etherlink wallets | Session/staff | View supported networks; request challenge; link EVM/Etherlink wallet; set primary; unlink; sync one wallet; sync all; list Etherlink assets. | `etherlink.wallet.linked`, `etherlink.wallet.unlinked`, `etherlink.wallet.primary_set`, `etherlink.wallet.sync_requested`, `etherlink.assets.viewed` |
| Dashboard/cockpit | Session | View passport, active season, WTF/XP summary, holdings, activity, collections, sync/backfill state, P&L, positions, realized sales, and rollups. | `dashboard.viewed`, `cockpit.holdings.viewed`, `cockpit.activity.viewed`, `cockpit.collection.viewed`, `cockpit.sync.run_requested` |
| Wallet event ingestion | System | Ingest token transfers, token mint/burn, XTZ transfers, contract calls, delegations, originations; track cursors, sync runs, and indexing queue. | `wallet_event.ingested`, `wallet_sync.started`, `wallet_sync.completed`, `wallet_sync.failed`, `indexing_queue.enqueued` |
| Tezos Intel | Session | View sources/import commands; load creator score; compare creators; load market pulse over a selected window. | `tezos_intel.sources.viewed`, `tezos_intel.creator.viewed`, `tezos_intel.compare.viewed`, `tezos_intel.market_pulse.viewed` |
| WTF Domains | Session/staff | View own wtf.tez grants; view registrar config/status/storage; prepare commit/register operations; view domain chat config; staff grant label to user; staff update grant status/op hash/notes. | `wtf_domain.grants.viewed`, `wtf_domain.registration.prepared`, `wtf_domain.chat_config.viewed`, `wtf_domain.granted`, `wtf_domain.status_updated` |
| Token archive | Session/owner | Request archive data; queue owned-token artifact preservation; view archive status. | `token_archive.requested`, `token_archive.status_viewed` |
| Contract activity | Session/staff | Submit contract activity evidence; browse/filter contract activity log by status/search. | `contract_activity.submitted`, `contract_activity.viewed`, `contract_activity.status_updated` |

## Concern: Gameshow Participation, Progression, and Rewards

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Seasons | Public/session/staff | List seasons; view details; staff create/update/delete/status-manage seasons. | `season.viewed`, `season.created`, `season.updated`, `season.deleted` |
| Rounds | Public/session/staff | List rounds; view round detail; inspect attached challenges/status/dates/rules; staff create/update/delete/attach/status-manage rounds. | `round.viewed`, `round.created`, `round.updated`, `round.deleted` |
| Challenges | Public/session/staff | List/filter/view one-time bigger missions; inspect reward/subdomain/mint data; submit text/link/evidence; view own submission; staff create/update/grade pass/fail/bonus, set reward flags, mark reward paid. Challenges may span several side quests or show events rather than a single recurring task. | `challenge.viewed`, `challenge.submitted`, `challenge.graded`, `challenge.reward_flag.created`, `challenge.reward_claimed`, `challenge.reward_marked_paid` |
| Challenge rewards | System/staff | Award submission XP; award grade XP; insert reward-ledger row; grant wtf.tez subdomain; claim reward flag. | `xp.awarded`, `reward.ledger.created`, `wtf_domain.granted`, `challenge.reward_claimed` |
| Side quests | Public/session/staff | List/view daily and special side quests; auto-track daily side quest progress per signed-in user through normalized OS events; reset daily quest readiness at 00:00 UTC; show ready-to-claim, claimed, and player-completion counts without marking other users complete. Staff create/update special quests and approve/reject manual completions. | `side_quest.viewed`, `side_quest.progress_verified`, `side_quest.completion_submitted`, `side_quest.auto_verified`, `side_quest.approved`, `side_quest.rejected` |
| Side quest rewards | Session/system/staff | Award quest XP and insert reward ledger rows only after the signed-in user claims verified side quest rewards; show the reward account; let earned WTF be used in WTFIAM or cashed out; keep EXP as an in-app-only score. | `xp.awarded`, `reward.ledger.created`, `reward.account.viewed`, `side_quest.reward_claimed`, `side_quest.reward_distributed` |
| Auto-verification | Session/system | Current route implementation verifies: `manual`, `profile_avatar`, `profile_bio`, `wallet_connected`, `social_twitter`, `social_discord`, `post_message`, `holds_positive_balance`, `holds_art_nft`, `has_mint_event`, `listed_on_trade_board`, `wtf_swapped_in_buyback`, `wtf_paid_to_operator_at_least`. Schema also declares future/latent handles: `x_space_attendance`, `x_hashtag_post`, `console_hiscore`, `mint_with_tag`, `mint_in_curation`, `discord_voice_presence`. | `side_quest.auto_verify.checked`, `side_quest.auto_verify.failed`, `side_quest.auto_verify.schema_gap` |
| Challenge automation | Staff/system | Admin builds event/predicate rules from registered trigger handles, combines ALL/ANY conditions, attaches reward actions, activates/pauses/archives definitions, inspects per-user progress, recent events, action logs, and audit logs. Canonical daily side quests are automation definitions with daily completion keys, user claim gating, and per-day global completion counts. Live ingestion currently covers messageboard posts/channel posts/reactions, XP awards, wallet links/relinks, desktop pet interactions, and generic `app.interaction.tracked`; Tezos ownership predicates verify against linked wallet holdings/TzKT. | `messageboard.post.created`, `messageboard.channel.post.created`, `messageboard.reaction.added`, `messageboard.reaction.removed`, `xp.awarded`, `wtf.awarded`, `user.wallet.connected`, `desktop.pet.interacted`, `app.interaction.tracked`, `nft.ownership.verified`, `token.contract.owned`, `token.id.owned`, `gameshow.challenge.completed`, `challenge_automation.reward_claim_required` |
| Mint portal | Session | View mint-bound challenges; copy submission tags; open mint links; check recent mints; auto-create submissions from indexed mints; view token/op hash data. | `mint_portal.viewed`, `mint_submission.created`, `mint_submission.matched` |
| Leaderboards | Public | View WTF holder leaderboard; view earned-WTF reward leaderboard with total earned/current owed/paid/market-spent columns; view EXP earned/spent leaderboard; view other in-app rewards such as wtf.tez subdomains; view recent WTF transfers with Tezos enrichment. | `leaderboard.viewed`, `leaderboard.rewards_wtf.viewed`, `leaderboard.rewards_exp.viewed`, `leaderboard.rewards_other.viewed`, `leaderboard.xp.viewed`, `leaderboard.transfers.viewed` |
| WTF Recapture | Public/session/staff | View recapture leaderboard, buyback windows, auctions, own recapture events; submit buyback swap intent; bid in auctions; staff manage windows and operator flows. | `recapture.viewed`, `buyback.intent_submitted`, `wtf_auction.bid_submitted`, `buyback.window_updated` |
| Calendar/events | Public/session/staff/bot | Browse events/feed; submit ticket; view own tickets; staff review/publish/cancel/manual-create/sync events; bot mirrors Discord events. | `calendar.viewed`, `calendar.ticket_submitted`, `calendar.ticket_reviewed`, `calendar.event_published`, `calendar.event_cancelled`, `discord.event_mirrored` |
| Attendance | Session/bot/staff | Claim in-app attendance; ingest Discord voice/stage state; view own rollup; staff view event attendance trail. | `attendance.claimed`, `attendance.voice_state_ingested`, `attendance.heartbeat`, `attendance.viewed` |
| Reward ledger/operator | Session/staff | Users view reward account balances, spend earned WTF in WTFIAM, request cashout once available earned WTF is at least 20 WTF, and only send WTF cashouts to their primary linked Tezos wallet. Staff view/filter/select rewards; mark paid; batch pay with op hash; preview/run/reconcile operator wallet disbursements. EXP is never wallet-disbursed. | `reward.account.viewed`, `reward.cashout_requested`, `reward.cashout_paid`, `reward.market_spent`, `reward.ledger.viewed`, `reward.marked_paid`, `operator.disbursement.previewed`, `operator.disbursement.run`, `operator.disbursement.reconciled` |

## Concern: Community, Social, Messaging, and Discord

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Message board | Public/session/staff/webhook | List categories/channels; read channel messages/pins; post where allowed; react where channel permissions allow; edit/delete own; staff moderate, pin/unpin, manage categories/channels/permissions/webhooks. | `board.channel.viewed`, `board.message.created`, `messageboard.post.created`, `messageboard.channel.post.created`, `messageboard.reaction.added`, `messageboard.reaction.removed`, `board.message.edited`, `board.message.deleted`, `board.message.pinned`, `board.webhook_received`, `xp.awarded` |
| Legacy threads/channels | Public/session | Read/create legacy threads/replies where supported; receive deprecation headers toward board surface. | `legacy_thread.viewed`, `legacy_thread.created`, `legacy_thread.replied` |
| Direct messages | Session | Search users; create/list/read DMs and Studio room conversations; send messages; mark read; receive Studio-specific notifications. | `dm.conversation.created`, `dm.message.sent`, `dm.message.read`, `xp.awarded` |
| Comms kernel | Session/system | Index normalized cards from Mail, DMs, Board, W, Telegram, and future read-only external adapters; isolate read states per user; resolve each item back to its owning WTFOS route or approved external link without becoming the canonical write backend. | `comms.item.indexed`, `comms.item.read`, `comms.route.opened` |
| WTF Mail | Session/system/webhook | Provision an eligible user's `username@mail.wtfgameshow.app` mailbox; list official external mail; read message details; send through the configured provider from the owned mailbox; ingest inbound and delivery webhooks; persist delivery failures. | `mail.message.received`, `mail.message.sent`, `mail.delivery.failed`, `comms.item.indexed` |
| Digest | Session | View the unified timeline of normalized cards; filter by source; mark items read; open source-owned routes or approved external targets while keeping origin labels visible. | `digest.viewed`, `digest.source_filtered`, `comms.item.read`, `comms.route.opened` |
| WIM | Session | Open a buddy-list view over existing DM conversations; read DM-backed chat logs; send through the existing DM route without creating a parallel message backend. Legacy `/aim` routes into this same app. | `wim.chat.opened`, `wim.message.sent`, `dm.message.sent` |
| Controlled browser | Session | Open approved WTF/social/Tezos/market links in the lightweight link chamber; block arbitrary domains and route them to the user's external browser instead of proxying random web usage. | `browser.link.opened`, `browser.navigation.blocked`, `comms.route.opened` |
| Dear Diary | Session/owner | Create, edit, delete, classify, tag, date, search, sort, cross-reference, and index private diary entries; open a preloaded welcome-rebellion entry from onboarding. | `diary.index.viewed`, `diary.entry.created`, `diary.entry.updated`, `diary.entry.deleted` |
| Notifications | Session | View Notification Center tab; toggle settings; filter all/unread; open linked item; mark one/all read. | `notification.viewed`, `notification.opened`, `notification.read`, `notification.read_all`, `notification.preference.updated` |
| W timeline | Session/staff | View filtered-stream-backed cached/live timeline; refresh; use rich URL and direct-media preview cards inside timeline content; use the media-only cache tab reconstructed from timeline rows; reply, like, repost, and quote with user OAuth timeline-action scopes; open post detail; view diagnostics/source/staleness; staff manage packed stream rules and the admin manifest of extra timeline handles. | `w.timeline.viewed`, `w.media_cache.viewed`, `w.reply.created`, `w.like.created`, `w.repost.created`, `w.quote.created`, `w.link_preview.requested`, `w.admin.stream_rule.updated`, `w.admin.stream_manifest.updated` |
| Skywire AT Protocol bridge | Session/system | Open the native Skywire app; hand off new-account creation to the official Bluesky signup flow; connect an existing Bluesky/AT Protocol account through popup-capable OAuth that returns to Skywire and refreshes the open app; store DID/handle/profile/PDS and encrypted OAuth/credential material server-side only; default connected users into a Bluesky-style home timeline backed by `app.bsky.feed.getTimeline`; read normalized Bluesky feed cards with authors, timestamps, embeds, metrics, viewer state, source links, and cursor pagination; search actors, inspect author feeds, and follow actors; distinguish AT-compliant handles from Tezos aliases; bridge the user's preferred Tezos domain identity into handle claims; claim or verify WTF-hosted/DNS/HTTPS handles; serve public `/.well-known/atproto-did`; read WTF/Tezos/search/notification feeds; compose, like, repost, reply, receive notifications, and claim existing posts for challenge automation; publish WTF-native Skywire Signal records into the user's AT repo for portable quest/drop/proof/broadcast state beyond Bluesky's app surface; use Bluesky compose intent fallback without auto-posting. | `atproto.external_signup.opened`, `atproto.account.linked`, `atproto.account.unlinked`, `atproto.profile.updated`, `atproto.actor.searched`, `atproto.actor.followed`, `atproto.handle.claimed`, `atproto.handle.verified`, `atproto.signal.published`, `atproto.post.created`, `atproto.post.claimed`, `atproto.post.replied`, `atproto.post.liked`, `atproto.post.reposted`, `atproto.notification.received` |
| W groupchat | Session/staff | View only the configured official Gameshow groupchat read mirror from the shared DB cache; render message URLs as rich preview cards from cached/fetched preview metadata; route reads can trigger one throttled platform refresh for the designated conversation; staff manage official groupchat IDs and XAA-backed groupchat wakeups. Personal X DM inboxes, ad hoc user DM threads, and groupchat sends are not active W surfaces. | `w.groupchat.viewed`, `w.admin.groupchat.updated`, `w.xaa.groupchat_wakeup.received` |
| W social/settings | Session/staff | View follows summary; list/follow accounts; inspect X Spaces; embed X Space URL; view capabilities; inspect stream status, stream budget, onboarding status, and groupchat diagnostics. | `w.follow.created`, `w.spaces.viewed`, `w.space.embedded`, `w.capabilities.viewed`, `w.diagnostics.viewed`, `w.budget.viewed`, `w.onboarding.status_viewed` |
| Dicksword/Discord | Public/session/bot/staff | View config/commands; view signed-in Discord identity/activity/avatar; create claim; bot proves claim; select avatar layers; staff manage avatar layers/conflicts/role mappings; bot ingests activity, serves role sync/profile. | `discord.claim.created`, `discord.claim.proven`, `discord.avatar.selected`, `discord.activity.ingested`, `discord.role_sync.pulled`, `xp.awarded` |
| I Hate Telegram | Session/bot/staff | Read approved Telegram digest sources; filter messages and FART NOISES alerts; save wallet tracks for FART readiness; signed Telegram bridge ingests updates; staff curates sources and queues WTF announcements for approved Telegram lanes. | `telegram.digest.message_ingested`, `telegram.announcement.queued`, `telegram.fart.mirrored`, `fart_noises.track.requested`, `notification.viewed` |
| WebSocket realtime | Session | Receive board and Studio live events; send Studio presence/cursor messages over authenticated realtime channel. | `websocket.connected`, `websocket.message.sent`, `studio.presence.updated`, `board.realtime.received` |

## Concern: Media, Creation, Gallery, and Preservation

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Public gallery | Public | Browse public gallery; open token detail paths; inspect metadata and media preview. | `gallery.viewed`, `gallery.token.viewed` |
| My Gallery | Session | Browse owned linked-wallet tokens; search/filter/sort; open token detail; import playable media to My Videos/Photos/Games/Music; preserve artifact. | `my_gallery.viewed`, `token.detail.viewed`, `media.token_imported`, `token_archive.requested` |
| Media library | Session/owner | List media by category; view metadata; import token media with provenance; upload files; stream own file; edit credits/title; inspect usage; delete with cascade awareness. | `media.listed`, `media.viewed`, `media.imported`, `media.uploaded`, `media.file_served`, `media.updated`, `media.usage_viewed`, `media.deleted` |
| My Videos/Photos/Music | Session/owner | Browse libraries; import owned tokens; upload files; edit upload-only credits; play audio/video; add/detach video to TV channel; toggle bumper assignment; delete. | `media.video.played`, `media.audio.played`, `media.tv_added`, `media.tv_detached`, `media.bumper_toggled` |
| Tezamp | Session | Open music player; play local/library audio and jukebox item audio; open Winamp Bootloader. | `tezamp.opened`, `tezamp.track_played`, `tezamp.bootloader.opened` |
| colleKT bridge | Session | View bridge session; use WTF profile wallets as source; launch standalone colleKT; inspect detected wallets/tokens. | `collekt.session.viewed`, `collekt.tokens.viewed`, `collekt.launch_requested` |
| Creation tools | Session | Open PArticle Painter, INDUSTR1ALIZER, Paul's Particles V1.0, Nikshumika Paint, and Kandinsky Composer through vendored iframe/static bundles. | `creation_tool.opened`, `creation_tool.asset_loaded`, `creation_tool.exported` |
| Game Studio templates/assets | Public/session | Fetch templates, targets, stock assets, vetted CC0 imported asset packs, snippets, raw stock asset files, and scaffold source files. | `game_studio.template.viewed`, `game_studio.asset.viewed`, `game_studio.asset_pack.checked`, `game_studio.snippet.viewed`, `game_studio.scaffold.created` |
| Game Studio projects | Session/creator/agent | Create/update/load/list projects; save source files, selected stock assets, local assets; enforce local-asset MIME/size/base64 limits; list builds; build server ZIP; submit/update Arcade game. | `game_studio.project.created`, `game_studio.project.updated`, `game_studio.build.started`, `game_studio.build.succeeded`, `game_studio.build.failed`, `game_studio.submitted_to_arcade` |
| Studio workspace | Session/permission | Create/list/open projects; connect/disconnect Google Drive; refresh usage; upload files/folders; preview/open original/rename/delete review files; create/resolve/reopen/delete annotations; mark up images with Paint 95 brush/highlighter strokes; comment; chat; pin/unpin; invite members; presence. | `studio.project.created`, `studio.project.opened`, `studio.file.uploaded`, `studio.file.renamed`, `studio.file.deleted`, `studio.annotation.created`, `studio.annotation.resolved`, `studio.chat.sent`, `studio.member.invited` |
| Studio storage/admin | Staff/session | Configure platform/user Drive; connect/disconnect admin drive; refresh quota/usage; set root folder; inspect backend/dependent projects. | `studio.storage.config_viewed`, `studio.drive.connected`, `studio.drive.disconnected`, `studio.drive.quota_refreshed`, `studio.root_folder.set` |

## Concern: WTF TV, Playback, Channels, and Embeds

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| TV viewer | Public/session | List public channels; resolve by dial/slug/id; switch channel; watch deterministic stream; view current item/schedule/settings; adjust volume/menu; receive skip/error notice. | `tv.channel.listed`, `tv.channel.viewed`, `tv.channel.switched`, `tv.current_item.viewed`, `tv.stream.started` |
| TV playback/telemetry | Public/session/system | Fetch stream/current/media/cache; send playback events and item-end telemetry; track skipped/stalled/error/ended sessions; view aggregate telemetry if authorized. | `tv.playback.event`, `tv.item.started`, `tv.item.ended`, `tv.item.skipped`, `tv.item.error`, `tv.telemetry.aggregate_viewed` |
| TV embeds | Public | Resolve embed metadata; render iframe player; fetch oEmbed; play channel-scoped media and bumpers. | `tv.embed.resolved`, `tv.embed.rendered`, `tv.oembed.requested`, `tv.embed.media_served` |
| Creator channels | Session/owner | List own channels; create/edit/delete; select channel; set title/description/logo/banner/slug/public flag/videos-per-bumper; refresh sources. | `tv.channel.created`, `tv.channel.updated`, `tv.channel.deleted`, `tv.channel.sources_refreshed` |
| TV playlists | Session/owner | Create/rename/set active playlist; open editor; add/remove/reorder videos; set duration; save items. | `tv.playlist.created`, `tv.playlist.updated`, `tv.playlist.activated`, `tv.playlist.items_updated` |
| TV token/media sources | Session/owner | Search playable tokens; add/remove token/media to/from channel; manage usage before delete; delete media item. | `tv.media.added`, `tv.media.removed`, `tv.playable_tokens.searched`, `media.usage_viewed` |
| TV bumpers | Public/session/owner | View personal/community bumper pools; upload bumper; set category; toggle media as bumper; patch/delete bumper; serve bumper media. | `tv.bumper.uploaded`, `tv.bumper.updated`, `tv.bumper.toggled`, `tv.bumper.deleted`, `tv.bumper.media_served` |
| TV schedule | Public/session/owner | View schedule/current item; create playlist schedule entry; delete schedule entry. | `tv.schedule.viewed`, `tv.schedule.created`, `tv.schedule.deleted` |
| TV cache | Public/session/staff | Fetch cache media; view cache stats; prefetch media; handle cache hit/miss/error and budget alerts. | `tv.cache.media_requested`, `tv.cache.hit`, `tv.cache.miss`, `tv.cache.error`, `tv.cache.prefetch_requested`, `tv.cache.stats_viewed` |
| WTF TV admin | Staff | Configure canonical source mode; select users/wallets; set tokens per wallet, durations, playlist size, refresh interval, bumper mode; initialize/refresh canonical channel. | `tv.admin.config_updated`, `tv.admin.channel_initialized`, `tv.admin.sources_refreshed`, `tv.admin.bumpers_selected` |

## Concern: Market, Exchange, Inventory, and Commerce

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| WTF In-App Marketplace | Session/trusted creator/staff | Browse categories; view EXP balance, items, inventory, recent purchases, active sale pricing, and whole-WTF cart totals; create cart intents in WTF or EXP; checkout EXP; verify WTF op hash; sync purchases; use consumables; create EXP-priced trusted creator items. | `wtfiam.viewed`, `wtfiam.cart_intent.created`, `wtfiam.exp_checkout.completed`, `wtfiam.purchase.verified`, `wtfiam.inventory.synced`, `wtfiam.item.used`, `wtfiam.creator_item.created`, `wtfiam.sale_applied`, `xp.spent` |
| In-app inventory use | Session/owner/API | Consume food/medicine through `/api/in-app-market/use`; load Arcade credits onto a Play Pass Card via mainnet WTF market verification; consume Arcade credits on paid Arcade sessions; enforce pet-ball cap and stock limits. | `inventory.item.consumed`, `inventory.item.granted`, `inventory.stock_reserved`, `inventory.cap_blocked`, `arcade.play_credit.consumed` |
| In-app market admin | Staff | View catalog; create catalog items; update stock, active state, visibility, pricing, metadata, rarity tier, price score, and category placement; lock item price or score anchors; rebalance suggested prices; create/update/delete category or SKU sales. | `wtfiam.admin.item_viewed`, `wtfiam.admin.item_created`, `wtfiam.admin.item_updated`, `wtfiam.admin.price_rebalanced`, `wtfiam.admin.sale_updated` |
| On-chain marketplace | Public/session/owner | View snapshot/listings/detail/mine/external mine/activity; create buy-now listing or auction; buy/cancel listing; place/accept/reject/cancel offers; cancel external listing. | `marketplace.viewed`, `marketplace.listing_created`, `marketplace.listing_bought`, `marketplace.listing_cancelled`, `marketplace.offer_created`, `marketplace.offer_accepted`, `marketplace.offer_rejected`, `marketplace.offer_cancelled` |
| Auctions | Public/session/owner | Browse active auctions; create auction; bid; cancel own auction; settle; inspect detail/bids. | `auction.created`, `auction.bid_submitted`, `auction.cancelled`, `auction.settled` |
| Trade boards/barter | Public/session/owner/agent | View public trade-board cache; search/switch modes; add/remove owned tokens; place/accept/reject/cancel offers; view barter on-chain snapshot. | `trade_board.viewed`, `trade_board.token_added`, `trade_board.token_removed`, `trade_board.offer_created`, `trade_board.offer_accepted`, `trade_board.offer_rejected`, `trade_board.offer_cancelled` |
| Hoard | Session/owner | Browse linked-wallet token hoard; search/filter/sync; select tokens for trade-board/listing workflows with ownership checks. | `hoard.viewed`, `hoard.token_selected`, `hoard.sync_requested` |
| Swap/DEX | Public/session/wallet | View token list/pools/counterparts/health/metrics; choose from/to token; set amount/slippage; flip direction; execute token-to-token, tez-to-token, or token-to-tez swap; view op status/hash. | `dex.tokens.viewed`, `dex.pool.viewed`, `swap.quote_viewed`, `swap.slippage_updated`, `swap.submitted`, `swap.confirmed`, `swap.failed` |
| Buyback/recapture | Public/session/staff | View active buyback window; submit swap intent/op hash; staff create/fund/open/close/pause/resume/sweep buyback windows. | `buyback.window.viewed`, `buyback.intent_submitted`, `buyback.window_created`, `buyback.window_opened`, `buyback.window_closed`, `buyback.window_swept` |
| Contract factory | Staff | Choose template/network; edit storage JSON; compile; deploy; view deployed contracts; retire live contract. | `contract_factory.compiled`, `contract_factory.deployed`, `contract_factory.contract_retired` |
| Operator wallet | Staff | View signer status/balances; refresh balances; view unpaid rewards; preview/run/reconcile disbursement; run buyback actions; view recent runs. | `operator.status_viewed`, `operator.balance_refreshed`, `operator.disbursement.previewed`, `operator.disbursement.run`, `operator.run.reconciled` |

## Concern: Club Dues, Memberships, and Subscription Access

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Dues public surface | Public/session | Open `/dues`, `dues.wtfgameshow.app`, or the Start Menu On Chain listing; the WTF OS desktop item is registered but default-off through the admin app gate; browse live dues contracts; inspect network, treasury, membership symbol, monthly dues, utility units, and live contract address. | `club_dues.viewed`, `desktop.icon.opened`, `api.public.read` |
| Contract customization | Public/session/admin | Fill top-level template data for club name, slug, description, network, treasury, admin, monthly dues, month length, utility-unit rate, grace window, arrears warning window, metadata URI, and manager wallet id; compile the SmartPy template through Kiln before any origination. | `club_dues.contract.customized`, `club_dues.contract.compiled`, `contract_factory.compiled` |
| External wallet deployment | Public/session/wallet | Compile the club dues template and originate it from the connected user's wallet on the configured test network before production mainnet use. | `club_dues.external_wallet.deployed`, `wallet.provider.preflight.succeeded`, `contract_activity.submitted` |
| Manager wallet deployment | Admin | Save a contract draft; deploy the compiled template through the `club-dues-manager` platform wallet; record deployment run, op hash, originated KT1 address, signer status, and compile artifact. | `club_dues.contract.deployed`, `operator.run.reconciled`, `contract_activity.submitted` |
| Member payment and renewal | Session/wallet | Create a payment intent; send exact XTZ dues through legacy `pay_dues` or tiered `pay_membership`; verify TzKT operation against linked wallet, live contract, amount, periods/months, tier, action, and payment ref; refresh paid-through timestamp and utility units in the WTF ledger. | `club_dues.payment.intent_created`, `club_dues.payment.verified`, `club_dues.member.renew_existing`, `wallet.operation.verify_failed` |
| On-chain membership record | System/contract | SmartPy contract issues tiered non-transferable membership receipt tokens, lets members renew old art, replace with current drop art, or pay the preserve fee to keep the old token as a collectible while minting the current drop, extends paid-through, accumulates utility units, forwards dues to treasury, and emits dues/member/drop events. | `club_dues.member.token_issued`, `club_dues.member.token_refreshed`, `club_dues.member.token_replaced`, `club_dues.member.token_preserved`, `club_dues.drop.updated`, `club_dues.tier.updated`, `club_dues.utility_units.issued` |
| Arrears and warnings | Admin/system/session | Sweep expired ledgers past grace period; mark members in arrears, optionally mark the contract naughty list through the manager wallet, and send WTFIG inbox warnings. | `club_dues.member.arrears_warned`, `club_dues.member.naughty_listed`, `notification.viewed` |

## Concern: WTF Casino, Membership, and Wagered Games

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Casino shell and entry gate | Session | View WTF Casino under Start Menu Gaming; show it visible but inactive when the current user lacks an active membership card; open `/casino` only when the app launcher is active; view app-pass status, membership status, configured contract, and fail-closed entry state; enter only when both the marketplace app pass and active membership card are present. | `casino.access.viewed`, `casino.entry.granted`, `casino.entry.rejected` |
| Casino app pass | Session/owner | Browse the Casino in-app-market category, purchase or sync the `casino-app-pass` item, and use it only as an app-access entitlement rather than a wager ticket. | `wtfiam.viewed`, `wtfiam.cart_intent.created`, `wtfiam.purchase.verified`, `wtfiam.inventory.synced` |
| Casino membership card | Session/wallet | Create a server intent, send exactly 1 XTZ through `purchase_membership` on the Casino membership contract, verify the operation hash against linked wallets, treasury forwarding, fee, contract address, and intent ref, then grant a 30-day membership. | `casino.membership.intent_created`, `casino.membership.verified`, `wallet.provider.preflight.succeeded`, `wallet.operation.verify_failed` |
| Casino table registry and wagers | Session/system | List installed table stubs; keep wagering disabled until each game has a domain-owned wager-session contract, house-take policy, settlement verifier, replay guard, and durable audit log; expose hashed audit summaries for mocked table actions without leaking raw wallet identifiers. | `casino.games.viewed`, `casino.wager_session.rejected`, `casino.entry.rejected`, `casino.audit.event_recorded` |
| WTF Does This Button Do?!!? | Session/wallet/system | Open `/casino/wtf-button`; view Red, Green, and Blue jackpot table states, mocked XTZ balance, wallet-specific press quote, WTF fee, pot contribution, expected time extension, leader panel, presser leaderboard, Rug Clash entrants, timeline, and strict/flexible price protection; submit mocked quote/press actions only through deterministic service interfaces until Tezos escrow/randomness contracts replace the mock adapter. | `wtf_button.lobby.viewed`, `wtf_button.table.viewed`, `wtf_button.quote.created`, `wtf_button.press.succeeded`, `wtf_button.press.rejected`, `wtf_button.price_protection.rejected`, `wtf_button.danger_zone.entered`, `wtf_button.rug_clash.started`, `wtf_button.rug_clash.entered`, `wtf_button.rug_clash.resolved`, `wtf_button.round.settled`, `wtf_button.round.refunded`, `wtf_button.audit.event_recorded`, `wtf_button.simulation.run` |
| Rug Pull: The Game | Session/wallet/system | Open `/casino/rug-pull`; view the active mocked round, current pot, next-round seed, pressure multiplier, button lock, Panic Mode countdown, witness vote state, player share table, and settlement feed; submit mocked join, delay, press, witness, and witness-vote actions through deterministic service interfaces until the dedicated Tezos contract and verifier replace the mock adapter. | `rug_pull.rules.viewed`, `rug_pull.round.join_intent_created`, `rug_pull.button.delay_intent_created`, `rug_pull.button.press_intent_created`, `rug_pull.witness.join_intent_created`, `rug_pull.witness.vote_cast`, `rug_pull.round.settled`, `rug_pull.audit.event_recorded`, `rug_pull.wager.rejected` |
| Guinea Pig Raceway | Session/wallet/system | Open `/casino/guinea-pig-raceway`; view the mocked live race card, 3D GLB racer scene, racer stats, five-track catalog data, conditions, global variables, lockout schedule, live race phase, paid effect caps, result replay metadata, tote board, ticket ledger, official-result audit hash, and replay camera angles; submit mocked bet/effect actions only through deterministic service interfaces until the raceway contract, randomness beacon, replay archive, and settlement verifier replace the mock adapter. | `guinea_pig_raceway.rules.viewed`, `guinea_pig_raceway.race_card.viewed`, `guinea_pig_raceway.tote.viewed`, `guinea_pig_raceway.ticket.accepted`, `guinea_pig_raceway.ticket.refunded`, `guinea_pig_raceway.official_result.recorded`, `guinea_pig_raceway.bet_intent_created`, `guinea_pig_raceway.bet_locked`, `guinea_pig_raceway.bet_rejected`, `guinea_pig_raceway.intro.started`, `guinea_pig_raceway.race.started`, `guinea_pig_raceway.effect_intent_created`, `guinea_pig_raceway.effect_rejected`, `guinea_pig_raceway.race.settled`, `guinea_pig_raceway.replay.viewed`, `guinea_pig_raceway.audit.event_recorded`, `guinea_pig_raceway.wager.rejected` |

## Concern: WTF Arcade, WTF Console, and Game Studio SDK

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| WTF Arcade catalog | Public | Browse public paid-play games, compatible-source imports, approved creator submissions, discovery shelves, stats, play fee, game detail, leaderboards, recent scores, champions, top players, player profile, source proxy assets. | `arcade.catalog.viewed`, `arcade.discovery.viewed`, `arcade.stats.viewed`, `arcade.play_fee.viewed`, `arcade.game.viewed`, `arcade.leaderboard.viewed`, `arcade.source_asset.served` |
| WTF Arcade play | Session | View Play Pass Card and loaded credit status/bypass; create WTF payment intent; create signed play session after card+credit/bypass; fail closed with a Windows-style card/credit error for paid games; boot sandboxed compatible-source games with SDK storage fallbacks; submit one-use signed score; receive XP for valid score events. | `arcade.play_status.viewed`, `arcade.play_intent.created`, `arcade.play_credit.consumed`, `arcade.session.rejected`, `arcade.session.created`, `arcade.score.submitted`, `arcade.score.accepted`, `arcade.score.rejected`, `xp.awarded` |
| WTF Arcade reports | Session/staff | Report active Arcade game; block duplicate open report per user/game/category; staff list reports; review/resolve/dismiss/reopen; priority includes report counts and invalid score signals. | `arcade.report.created`, `arcade.report.reviewed`, `arcade.report.resolved`, `arcade.report.dismissed`, `arcade.report.reopened` |
| WTF Arcade creator submissions | Session/creator/trusted creator/staff | Submit ZIP media/game bundle; update own game; trusted creators auto-publish; staff list moderation queue; approve/reject/remove/restore; preserve version/provenance/score caps. | `arcade.game.submitted`, `arcade.game.update_submitted`, `arcade.game.auto_published`, `arcade.game.approved`, `arcade.game.rejected`, `arcade.game.removed`, `arcade.game.restored`, `xp.awarded` |
| WTF Arcade source import/admin | Staff/system | Run compatible-source ingest/check; scheduled worker records imported/skipped/updated rows and audit health even when no games changed; set non-user-submitted Arcade game credit price/free-play rule. | `arcade.source_import.started`, `arcade.source_import.completed`, `arcade.source_import.failed`, `arcade.credit_rule.updated`, `arcade.audit.created` |
| WTF Console catalog | Public/session | Browse stock Console titles, demo cartridges, installed games, owned wallet/media cartridges, SDK, bundles, dependencies, game detail, stock leaderboards, recent scores, champions, players, player profile. | `console.catalog.viewed`, `console.game.viewed`, `console.sdk.served`, `console.bundle.served`, `console.dependency.audit` |
| WTF Console play | Session | Create signed stock-game play session; submit one-use score; reject expired/used/missing/tampered tickets and impossible scores; award XP for first play, score submit, personal best, champion. | `console.session.created`, `console.score.submitted`, `console.score.accepted`, `console.score.rejected`, `xp.awarded` |
| WTF Console reports/admin | Session/staff | Report stock Console game only; Console public creator submission/moderation routes now return compatibility/gone responses pointing to Arcade; staff view Console audit events and cache dependencies. | `console.report.created`, `console.audit.viewed`, `console.compatibility_route.hit`, `console.dependency.cache_requested` |
| Game Studio SDK | Public/session/agent | Generate scaffold from templates; use SDK hooks `ready`, `startSession`, `getPlayer`, `getAvatarAsset`, `getAvatarSpriteSheet`, `updateScore`, `gameOver`, `pause`; build SDK-compatible ZIP; submit project to Arcade. | `game_sdk.ready`, `game_sdk.session_started`, `game_sdk.player_loaded`, `game_sdk.avatar_loaded`, `game_sdk.score_updated`, `game_sdk.game_over`, `game_sdk.paused` |

## Concern: Administration, Governance, and Operations

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Admin overview | Admin | View counts for users, seasons, rounds, challenges, side quests, listings, threads, links, FAQ, storage, and platform status. | `admin.dashboard.viewed` |
| WTF OS admin surfaces | Admin | View every registered sub-app/tool/desktop item by domain and subdomain; open the app, open related central admin routes/tabs, adjust app gate visibility, and inspect native settings and automation handles. | `admin.os_surface.viewed`, `admin.os_surface.app_opened`, `admin.os_surface.admin_route_opened`, `admin.app_gate.updated` |
| User admin | Admin | Search users; change role; award XP; edit identity profile; clear socials; delete user; view dossier; set/clear temp password; resync wallet/token/profile data. | `admin.user.viewed`, `admin.user.role_updated`, `admin.user.xp_awarded`, `admin.user.identity_updated`, `admin.user.deleted`, `admin.user.resynced` |
| Gameshow admin | Admin | Manage seasons, rounds, challenges, submissions, reward flags, side quests, completions, calendar, eliminations, drafting, control-board actions, and programmable gameshow automation rules. | `admin.season.updated`, `admin.round.updated`, `admin.challenge.updated`, `admin.side_quest.updated`, `control_board.action_applied`, `admin.challenge_automation.updated` |
| Challenge automation admin | Admin | Create/edit challenge automation definitions; choose triggers/predicates/actions; preview readable rule; seed example challenges; activate/pause/archive; inspect progress/events/audit. | `admin.challenge_automation.created`, `admin.challenge_automation.updated`, `admin.challenge_automation.status_updated`, `challenge_automation.audit.viewed` |
| Board/content admin | Admin | Moderate board; manage categories/channels/pins/permission overwrites/webhooks; manage links and FAQ. | `admin.board.updated`, `admin.content.link_updated`, `admin.content.faq_updated` |
| Roles/permissions/app gates | Admin | View/toggle role permissions; reset permission set; view/update desktop and Start Menu app gates plus gate-aligned MCP feature access. | `admin.permissions.updated`, `admin.permissions.reset`, `admin.app_gate.updated` |
| Rewards/admin XP | Admin | Filter XP events; award XP manually; filter reward ledger; mark single/batch paid. | `admin.xp.awarded`, `admin.xp_log.viewed`, `admin.reward.updated` |
| Media/storage/admin | Admin | Inspect media storage usage; protect/delete storage keys; configure Studio Drive/root; refresh storage status. | `admin.media_storage.viewed`, `admin.media_storage.updated`, `admin.studio_storage.updated` |
| Backup Manager | Admin | Open `/backup-manager`; inspect latest backup run, backup artifact, targets, checksums, restore drill status, row-count/media-manifest requirements, and whether the system may truthfully claim backup safety. | `backup_manager.viewed`, `backup_manager.opened` |
| System logs/health | Public/admin/system | Fetch API health/disk health; ingest bounded client logs; admin query logs, summaries, and events by source/type/severity/status/user. | `system.health.checked`, `system.disk_health.checked`, `system.client_log.ingested`, `system.log.viewed`, `system.error.recorded` |
| UX Lab | Admin | Open `/dev/ux-lab` portfolio/collection workspace and quick links for design/UX testing. | `ux_lab.opened`, `ux_lab.collection_workspace.used` |

## Concern: Public Data, Embeds, APIs, Agents, and Automation

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| Public JSON APIs | Public | Read health, disk/cache, app gates, links, FAQ, Arcade/Console/Game Studio public data, leaderboards, profiles, trade boards, marketplace snapshots, DEX data, calendar, TV, embeds, gallery/token data, crawler previews. | `api.public.read`, `public_data.viewed` |
| Public bounded writes | Public/bot | Submit client logs; TV playback/item-end telemetry; configured board webhook; bot attendance/Discord routes with HMAC. | `system.client_log.ingested`, `tv.telemetry.ingested`, `board.webhook_received`, `bot.webhook.received` |
| MCP transport | Agent | Connect to `/mcp`; call tools with bearer token; receive rate-limit, standard access manifest, and feature-gate data; fail closed on revoked token/gate/role-mismatched scope; ignore any browser session cookie without emitting `Set-Cookie`. | `mcp.connected`, `mcp.tool.called`, `mcp.tool.succeeded`, `mcp.tool.failed`, `mcp.rate_limit.hit`, `mcp.browser_session_ignored` |
| MCP desktop/pet | Agent | Read/update appearance; read pet; apply safe pet care auto/specific actions for paired user. | `mcp.desktop.read`, `mcp.desktop.updated`, `mcp.pet.read`, `mcp.pet.action_applied` |
| MCP public data | Agent | Search public tokens; list unlisted trade-board tokens; list TV channels; list Arcade games/stats/fee/status/audit; list Console stats/discovery/players/recent/audit; list Game Studio templates/assets/snippets/targets. | `mcp.public_data.read`, `mcp.arcade.read`, `mcp.console.read`, `mcp.game_studio.read` |
| MCP paired mutations | Agent | Set paired user's trade-board tokens; create Arcade play intent; create/update/build/submit Game Studio projects; create trusted creator market item where permitted. | `mcp.trade_board.updated`, `mcp.arcade.intent_created`, `mcp.game_studio.project_mutated`, `mcp.market.creator_item_created` |
| External automation | Bot/system | Discord proof/activity/role sync/profile; attendance mirror; Arcade source import; wallet/indexing sync; health monitors. | `bot.discord.proof_received`, `bot.discord.activity_received`, `bot.attendance.received`, `worker.arcade_source_import.run`, `worker.wallet_sync.run` |

## Existing EXP and Reward Triggers

| Trigger | Current reason/source | Amount behavior | Dedupe/guard |
| --- | --- | --- | --- |
| Challenge submission | `challenge_submission` | +5 XP on first challenge submission. | One submission per user/challenge blocks duplicates. |
| Challenge grade pass/bonus | `challenge_grade_reward` | Challenge `rewardXp` on pass/bonus. | Only when `xpAwarded === 0`; reward flag upserted. |
| Side quest approval/auto-approval | `side_quest_reward` | Side quest `rewardXp`. | Completion uniqueness; reward ledger guarded by user + side quest. |
| Canonical daily side quest claim | `daily_loop:*`, `Side quest: *` | Daily automation awards configured XP and WTF after the user claims a verified current-UTC-day completion. | Completion key is per user and UTC day; reward action logs and reward ledger source ids make claim retries idempotent. |
| DM message | `dm_message_sent` | +1 XP. | No explicit daily cap in route. |
| Legacy thread created | `thread_created` | +2 XP. | Legacy route behavior. |
| Legacy thread reply | `thread_reply` | +1 XP. | Legacy route behavior. |
| Board message | `board_message_sent` | +1 XP. | Slow-mode/permission checks; no XP daily cap in route. |
| Channel message legacy route | `channel_message_sent` | +1 XP. | Legacy route behavior. |
| Desktop pet care | `desktop_pet_care` | +4 XP per care action when eligible. | Once per action per day; stored in `desktop_pet_events` with `xpEventId`. |
| Discord activity | `discord_${kind}_${action}` | Bot-supplied `xpAmount`, 0-1000. | Requires linked user, positive amount, and unique `externalRef`. |
| Console/Arcade creator submission | `console_game_submission` | +15 XP. | Duplicate guarded by user/reason/source/event/game/version; daily cap 3. |
| Console/Arcade creator update | `console_game_update` | +5 XP. | Duplicate guarded by version; daily cap 5. |
| Console/Arcade publish | `console_game_publish` | +25 XP. | Duplicate guarded by version; daily cap 3. |
| Console/Arcade publish update | `console_game_update_publish` | +10 XP. | Duplicate guarded by version; daily cap 5. |
| Console/Arcade first play | `console_game_first_play` | +5 XP. | Dedupe per game/user; daily cap 20. |
| Console/Arcade score submit | `console_score_submit` | +1 XP. | Dedupe per run/score key; daily cap 25. |
| Console/Arcade personal best | `console_personal_best` | +3 XP. | Dedupe per run/score key; daily cap 15. |
| Console/Arcade champion | `console_game_champion` | +8 XP. | Dedupe per run/score/rank; daily cap 5. |
| In-app EXP checkout | `in_app_market_purchase` | Negative XP equal to EXP subtotal. | Requires pending EXP intent, stock reserve, cap checks, sufficient balance. |
| Staff manual award | Admin XP route | Staff-specified amount/reason. | Staff permission; XP event records awardedBy. |
| CRP nomination watcher | `side_quest_reward` | Side quest `rewardXp` per watcher logic. | External reference/nominator reward counts. |

## Canonical Monitoring Event Envelope

All domain handles above should emit or be mappable into a common event envelope.
When a table already exists, use it. When no table exists, instrument the route,
client interaction, SDK bridge, or worker boundary.

| Field | Meaning |
| --- | --- |
| `eventId` | Stable unique id for the monitoring event. |
| `handle` | Canonical handle such as `arcade.score.rejected`. |
| `source` | Browser, server route, MCP tool, SDK, bot, worker, system monitor. |
| `surface` | WTF product surface: desktop, gameshow, W, TV, Arcade, Console, Game Studio, market, wallet, admin, MCP. |
| `actorUserId` / `actorRole` | Signed-in or paired user and role when known. |
| `sessionId` / `mcpTokenPrefix` | Browser session or paired-agent token prefix when applicable. |
| `method` / `path` / `statusCode` / `durationMs` | HTTP or tool execution context. |
| `targetType` / `targetId` | Game, score, challenge, media, channel, listing, wallet, grant, project, etc. |
| `walletAddress` / `opHash` / `chainId` | On-chain context when applicable. |
| `score` / `runId` / `ticketDigest` | Game score and anti-cheat context. |
| `amountExp` / `amountWtfUnits` / `sku` | Reward, purchase, inventory, and commerce context. |
| `result` / `reason` | Success, failure, rejection, moderation status, validation reason. |
| `ipHash` / `userAgentHash` | Privacy-preserving abuse correlation. |
| `metadata` | Bounded JSON for domain-specific context. |
| `createdAt` | Server-side timestamp. |

Existing storage anchors include `system_event_logs`, `xp_events`,
`reward_ledger`, `challenge_system_events`,
`challenge_automation_definitions`, `challenge_automation_progress`,
`challenge_automation_completions`, `challenge_automation_action_logs`,
`challenge_automation_audit_logs`, `desktop_pet_events`, `wallet_events`, `sync_runs`,
`indexing_queue`, `contract_activity_logs`, `attendance_events`,
`discord_activity_events`, `console_play_tickets`, `console_scores`,
`console_player_stats`, `console_audit_events`, `console_game_reports`,
`game_studio_project_builds`, `in_app_market_payment_intents`,
`in_app_market_purchases`, `user_notifications`, TV telemetry/cache stores, and
Studio/board/DM/media domain tables.

## Cheat Detection, Warnings, Alarms, and Punishment Anchors

| Concern | Signals to monitor | Suggested handles |
| --- | --- | --- |
| Auth abuse | Login/register failure bursts, wallet proof failures, OAuth callback errors, session reuse anomalies. | `auth.login.failed`, `auth.register.failed`, `auth.wallet.verify.failed`, `system.rate_limit.hit` |
| Wallet mismatch | Cached wallet address without provider, wrong active wallet, chain mismatch, invalid op hash, duplicate op hash, manual attestation mismatch. | `wallet.provider.preflight.failed`, `wallet.account_mismatch.blocked`, `wallet.operation.verify_failed`, `contract_activity.failure` |
| Arcade/Console score abuse | Missing/invalid/tampered/expired ticket, used ticket replay, score too large, score over speed cap, invalid score rows, report category `score-abuse`. | `arcade.score.rejected`, `console.score.rejected`, `console.audit.score_rejected`, `arcade.report.created` |
| Arcade ticket abuse | Play session without ticket, repeated payment-intent creation, ticket inventory mismatch, trusted bypass overuse. | `arcade.play_intent.created`, `arcade.play_ticket.consumed`, `arcade.session.rejected`, `inventory.cap_blocked` |
| Creator-game abuse | Unsafe/stolen/spam reports, repeated rejected bundles, unsupported files, source import failures, trusted auto-publish anomalies. | `arcade.report.created`, `arcade.game.rejected`, `game_studio.build.failed`, `arcade.source_import.failed` |
| EXP/reward abuse | Duplicate XP attempts, daily cap hits, reward ledger duplicate guard, negative XP spend anomalies, manual staff award spikes. | `xp.awarded`, `xp.award_skipped`, `reward.ledger.created`, `admin.xp.awarded`, `xp.spent` |
| Challenge automation abuse | Duplicate normalized events, repeated completion keys, failed reward action retries, suspicious event bursts across multiple challenge definitions, ownership predicate mismatch. | `challenge_automation.event_deduped`, `challenge_automation.completion_deduped`, `challenge_automation.action.failed`, `app.interaction.tracked`, `nft.ownership.verified` |
| Side quest abuse | Duplicate completions, auto-verify failure, schema/route auto-verify drift, manual proof spam, entry-fee missing/attested only. | `side_quest.completion_submitted`, `side_quest.auto_verify.failed`, `side_quest.auto_verify.schema_gap`, `side_quest.approved` |
| Attendance abuse | Duplicate `externalRef`, suspicious heartbeat cadence, join/leave spam, unmatched Discord user, impossible overlapping presence. | `attendance.voice_state_ingested`, `attendance.heartbeat`, `discord.activity.ingested` |
| Social spam | Board message bursts, W timeline action bursts, slow-mode hits, webhook abuse, mail send bursts, delivery complaint spikes, browser blocked-navigation probes, media attachment spam, repeated deleted/moderated posts. | `board.message.created`, `messageboard.reaction.added`, `messageboard.reaction.removed`, `w.reply.created`, `w.like.created`, `w.repost.created`, `w.quote.created`, `mail.delivery.failed`, `browser.navigation.blocked`, `board.webhook_received`, `system.rate_limit.hit` |
| Media abuse | Unsupported MIME, extension mismatch, upload cap failure, object-storage limit, repeated private file access failure, destructive delete spikes. | `media.uploaded`, `media.upload_failed`, `media.file_served`, `media.deleted`, `system.validation.failed` |
| TV telemetry abuse | Item-end spam, cache prefetch spam, cache budget warnings, playback error spikes by channel/media/session. | `tv.telemetry.ingested`, `tv.cache.prefetch_requested`, `tv.cache.error`, `system.disk_health.checked` |
| Marketplace abuse | Wash-like self-dealing, wrong-wallet signer, stale listing op hash, duplicate purchase ref, insufficient EXP, stock race, pet-ball cap attempts. | `marketplace.listing_created`, `marketplace.offer_created`, `wallet.account_mismatch.blocked`, `wtfiam.exp_checkout.failed`, `inventory.cap_blocked` |
| Club dues abuse | Duplicate payment refs, wrong-wallet dues sends, wrong contract, bad amount/month count, expired intent, fake op hash, manager-wallet origination outside deployment window, and ignored arrears warnings. | `club_dues.payment.intent_created`, `club_dues.payment.verified`, `wallet.operation.verify_failed`, `club_dues.contract.deployed`, `club_dues.member.arrears_warned` |
| Casino abuse | Missing Casino app pass, expired/replayed membership intents, wrong-wallet membership sends, bad fee amounts, treasury-forward mismatch, entry attempts while wager sessions are disabled, WTF Button stale quotes, price-protection bypass attempts, duplicate Rug Clash entries, leader-exclusivity bypass attempts, mocked-balance drift, Rug Pull button-lock abuse, Rug Pull witness-vote manipulation, Raceway late bets, invalid exotic tickets, Raceway effect spam, replay tampering, and future house-take settlement drift. | `casino.entry.rejected`, `casino.membership.intent_created`, `casino.membership.verified`, `wallet.account_mismatch.blocked`, `wallet.operation.verify_failed`, `casino.wager_session.rejected`, `casino.audit.event_recorded`, `wtf_button.press.rejected`, `wtf_button.price_protection.rejected`, `wtf_button.rug_clash.entered`, `wtf_button.audit.event_recorded`, `rug_pull.audit.event_recorded`, `rug_pull.wager.rejected`, `guinea_pig_raceway.bet_rejected`, `guinea_pig_raceway.ticket.refunded`, `guinea_pig_raceway.effect_rejected`, `guinea_pig_raceway.audit.event_recorded`, `guinea_pig_raceway.wager.rejected` |
| MCP abuse | Tool-call bursts, scope denied, feature gate denied, revoked-token use, staff-only tool attempts by non-staff token, forged wildcard/admin scopes, browser-session cookie presented alongside a different paired token. | `mcp.tool.called`, `mcp.tool.failed`, `mcp.rate_limit.hit`, `mcp.authz.denied`, `mcp.browser_session_ignored` |
| Admin misuse | Role/permission changes, user deletion, temp password creation, reward paid marks, app gate changes, operator runs, source imports. | `admin.user.deleted`, `admin.permissions.updated`, `admin.reward.updated`, `operator.disbursement.run`, `arcade.source_import.started` |

## Concern: Skullzarmy / FAFOlab Integrations (skllzrmy)

| Domain | Access | Possible interactions | Primary handles |
| --- | --- | --- | --- |
| TezosBeats Music | Session + wallet | Open `/music`; play NFT/library audio; manage playlists; taskbar mini-player; `/tezamp` redirect. | `music.opened`, `music.first_play`, `music.track_played`, `music.playlist_create` |
| Mastodon (Tusk) | Session | Link instance token; view home timeline in W Feed; set feed preferences. | `mastodon.link`, `mastodon.timeline`, `mastodon.preferences.updated` |
| Porcupin | Session + wallet (premium) | Run setup wizard; connect remote node; view dashboard; check premium pinning eligibility. | `porcupin.setup`, `porcupin.connect`, `porcupin.dashboard`, `porcupin.premium.check` |
| MindWalk | Session + credits | Launch arcade game; BYOK AI; credit deduction; creator payout to skllzrmy. | `arcade.mindwalk.launch`, `arcade.mindwalk.journey_complete` |
| PixelPatterns / PenRose | Session | Open creation tools; export PNG backgrounds. | `creation.pixelpatterns.opened`, `creation.penrose.opened` |
| Discovery engine | Public/session | Random artist/NFT API; Dashboard spotlight card; Discord `/wtf-stats`. | `discovery.random_artist`, `discovery.random_nft`, `discovery.spotlight` |
| Social auto-promote | Admin + opt-in | Review marketplace sale promo tweets; weekly thread drafts. | `social.auto_promote`, `social.weekly_thread` |
| FA2 templates | Admin | Contract Factory FA2 wizard; deploy fixed/mintable/pausable templates. | `contract.fa2.wizard`, `contract.fa2.deploy` |
| Generative art mint | Session | Mint Portal generative editor; p5 template; ZIP export. | `mint.generative.edit`, `mint.generative.export` |

## Current Coverage Gaps To Track

| Gap | Impact | Tracking |
| --- | --- | --- |
| Side-quest schema declares `x_space_attendance`, `x_hashtag_post`, `console_hiscore`, `mint_with_tag`, `mint_in_curation`, and `discord_voice_presence`, but the route whitelist and `runAutoVerify` implementation currently only cover the smaller subset listed above. The new challenge automation engine gives admins registry-backed event/predicate/reward rules, but these specific side-quest enum values still need side-quest adapters or archival before they count as live auto-verifiers. | E2E and reward-trigger suites must either mark these as latent side-quest handles or add route support before treating them as live side-quest auto-verification. | `WTF-BB-127` |
| Some routes perform manual op-hash attestations instead of app-initiated wallet sends. | Monitoring must distinguish verified wallet-backed sends from manual claims until those flows are upgraded. | `WTF-BB-124`, `WTF-BB-126` |
| Public client logs and TV telemetry are intentionally bounded public writes. | Abuse monitoring should watch rates, payload shape, and source distribution even though these are not session-authenticated. | `WTF-BB-056`, TV telemetry rows |
| WTF Casino now has app access, membership-card scaffolding, mocked WTF Button, mocked Rug Pull, and mocked Guinea Pig Raceway modules, but real wagered games remain intentionally fail-closed. | Do not mark Casino wagering live until compliance gates, wallet-backed wager settlement, house accounting, anti-replay controls, WTF Button escrow/randomness contract tests, Rug Pull contract/panic settlement tests, Raceway randomness/replay/effect tests, and game-specific behavior tests exist. | `WTF-BB-138` |
| This inventory is Markdown, not yet a machine-readable manifest. | E2E and rewards integration will be easier if converted into JSON/YAML with domain, route, handle, access, rewardable, and cheat-signal fields. | Follow-up implementation artifact |
