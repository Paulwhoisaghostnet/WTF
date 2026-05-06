# WTF Domain Modular Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn WTF Gameshow from one desktop-hosted monolith with oversized subapps into a modular OS shell with domain-owned subapp packages, stable compatibility wrappers, and bounty-backed hardening passes.

**Architecture:** Use a strangler refactor: preserve public routes (`/api/*`, page URLs, `@shared/schema`) while extracting domain services, routers, hooks, and components behind those entrypoints. Each slice must either be behavior-preserving or explicitly close a matching bounty item with focused verification.

**Tech Stack:** Node 20, TypeScript, Express 5, Drizzle ORM, PostgreSQL, React 19, TanStack Query, styled-components, react95, Vite, node:test.

---

## Pre-Flight Evidence

- Read `LESSONS_LEARNED.md` on 2026-05-05 before editing.
- Read `BUG_BOUNTY_BOARD.md` on 2026-05-05 before editing.
- Created branch `codex/modular-architecture-refactor`.
- Triggered a pre-refactor database backup from the running local Postgres server container:
  - Dump: `.codex/backups/wtf-refactor-preflight-20260505T040851Z.dump`
  - Hash: `.codex/backups/wtf-refactor-preflight-20260505T040851Z.dump.sha256`
  - Note: Docker Compose is unavailable in this desktop environment, so the backup used `docker exec ... pg_dump` against `wtf-sandbox-pg-iibLNE`.

## Current Audit

Largest active monoliths by current line count:

- `client/src/components/layout/Desktop.tsx`: 448 lines after extracting the route registry, custom cursor, Sunday grass, icon definitions/physics, shared geometry, and desktop pet feature. The shell now owns surface orchestration, wallpaper, route layer, taskbar, and screensaver only.
- `client/src/features/desktop/DesktopPet.tsx`: 640 lines after extracting care/market UI, render actors, world actor styling, shared model constants/types, API DTO types, market/cart state, ant, toy, drop, world, persistence, pet locomotion, pet data gateway, cleanup tick, and tool-cursor lifecycle domains. The remaining component now mainly wires refs/state, hook composition, input/drop orchestration, and render composition.
- `server/routes/tv.ts`: 19 lines after extracting pagination, daypart policy, media URL/cache fetch helpers, cache file/storage/runtime services, cache endpoint wrappers, transcode worker, telemetry store/routes, media metadata, stream snapshot assembly, WTF auto-refresh, bumper routes, live/schedule routes, playlist routes, playback/media-file routes, channel routes, channel service helpers, and bumper upload config. The compatibility router now only registers TV domain route modules.
- `client/src/pages/TV.tsx`: 837 lines after extracting DTO/view types, pure helpers, playback telemetry helpers, the CRT static/WebAudio component, CRT chrome/styled components, the on-screen menu/creator-console switch, the CRT playback surface, React Query data hooks, mutation hooks, creator-console derived data, channel selection, session telemetry, playlist draft sync, stream prefetch, remote-control/dial logic, skip-notice UX, hidden preload tracking, MTV overlay timing, stall-indicator UX, broadcast playback-state resolution, bumper deck/gate selection, playback timer refs, queue-cursor sync, current item lifecycle, media event handlers, power/channel reset, buffer-gate behavior, queue advance/refetch controller, playback view-model derivation, and shell/chrome layout.
- `client/src/pages/Admin.tsx`: 616 lines after extracting Admin hooks, shared types, and every Admin tab into `client/src/features/admin/tabs/*`. The page now mainly wires tab state, data hooks, mutation hooks, and compatibility tab selection.
- `server/routes/w.ts`: 214 lines after extracting timeline assembly helpers, timeline route/cache wrapper, timeline shared types, link-preview route wrapper/helpers, compose/engagement actions, message routes, follows/Spaces/capabilities routes, and admin DM/stream helpers. It is now close to a compatibility route wrapper.
- `client/src/pages/W.tsx`: 660 lines after extracting W shared types, query hooks, mutation hooks, shell chrome/nav, timeline panel, messages/DM/groupchat panel, and social/settings/Spaces/admin diagnostics panel.
- `shared/schema.ts`: 90 lines after extracting core, social, ops, admin/identity, desktop, DM, wallet/cockpit, analytics, in-app market/listing market, recapture/operator contracts, liveops, session, Discord, TV, gameshow, board/chat, and Studio schema branches while keeping export-name parity through the compatibility barrel.

Bounty-backed refactor targets:

- `WTF-BB-029`: `/api/w/timeline` loads every Twitter-linked account before bounding the timeline surface.
- `WTF-BB-025` / `WTF-BB-026`: route-level Tezos/profile fetches are not consistently behind shared upstream helpers.
- `WTF-BB-041` / `WTF-BB-042` / `WTF-BB-043`: TV config/backfill/refresh logic needs single-owner services instead of boot-time/router-local mutation.
- `WTF-BB-102`: TV server router and client page should be split into feature-owned modules so TV agents can work in parallel by concern.
- `WTF-BB-103`: W server router and client page should be split into feature-owned social domains so W agents can work in parallel by concern.
- `WTF-BB-104`: Admin server route and client page should be split into feature-owned ops domains so Admin agents can work in parallel by tab/API concern.
- `WTF-BB-058` / `WTF-BB-060` / `WTF-BB-061` / `WTF-BB-062`: cache maps should be bounded domain primitives, not ad hoc globals.
- `WTF-BB-098`: desktop cursor, icons, physics, Sunday grass, and pet actors should be owned by desktop feature modules instead of the OS shell.
- `WTF-BB-099`: desktop pet feature should be split into care tray, market, toys/drops, and shared-world simulation modules.

## Target Repo Shape

Keep compatibility wrappers:

- `server/routes/w.ts`, `server/routes/tv.ts`, `server/routes/admin.ts`
- `client/src/pages/W.tsx`, `client/src/pages/TV.tsx`, `client/src/pages/Admin.tsx`
- `client/src/components/layout/Desktop.tsx`
- `shared/schema.ts`

Add domain modules behind them:

- `server/features/w/*`: timeline service/router, link previews, posting, DMs, Spaces, admin stream rules.
- `client/src/features/w/*`: W API client, hooks, timeline view, messages view, spaces view, admin tools.
- `server/features/tv/*`: channel, stream, cache, transcode, bumper, playlist, schedule, telemetry, auto-refresh.
- `client/src/features/tv/*`: TV player, creator console, media manager, bumper manager, playlist editor, overlay.
- `client/src/features/desktop/*`: desktop shell, icon layout, physics, cursor actor, pet actor, toy actors, Sunday grass.
- `client/src/routes/page-defs.ts`: OS route registry and window route matching.
- `shared/schema-*`: domain schema files re-exported by `shared/schema.ts` only after the smaller route/page splits are stable.

## Task 1: Extract Client OS Route Registry

**Files:**
- Create: `client/src/routes/page-defs.ts`
- Modify: `client/src/App.tsx`

- [x] Move lazy page imports, `PageDef`, `PAGE_DEFS`, `FULLSCREEN_ROUTES`, `matchPage`, and `isWindowedRoute` out of `App.tsx`.
- [x] Keep `App.tsx` responsible only for providers, fullscreen overlays, URL sync, and rendering matched windows.
- [x] Verify with `npm run check`.

## Task 2: Close `WTF-BB-029` With A W Timeline Service

**Files:**
- Create: `server/features/w/timeline.ts`
- Modify: `server/routes/w.ts`
- Modify: `server/lib/timeline-db.ts`
- Modify: `server/lib/timeline-worker.ts`
- Modify: `BUG_BOUNTY_BOARD.md`

- [x] Claim `WTF-BB-029` before route edits.
- [x] Move timeline payload/account types and DB-cache assembly into `server/features/w/timeline.ts`.
- [x] Replace route-local “load all accounts, dedupe, slice” with a bounded SQL reader that orders and limits before materializing the account list.
- [x] Reuse the bounded account reader in the timeline search worker so HTTP and background ingest share membership rules.
- [x] Keep the optional legacy fan-out behind `USE_LEGACY_TIMELINE_FANOUT` and only iterate bounded accounts.
- [x] Verify with `npm run check`.
- [x] Update `WTF-BB-029` with verification notes.

## Task 3: Extract W Link Preview Service

**Files:**
- Create: `server/features/w/link-preview.ts`
- Modify: `server/routes/w.ts`

- [x] Move Objkt parsing, SSRF-safe preview URL normalization, HTML meta extraction, limited response reads, bounded preview caching, and timeline link enrichment into the feature module.
- [x] Keep the public route behavior unchanged.
- [x] Verify with `npm run check`.

## Task 4: Split TV Server Router By Runtime Concern

**Files:**
- Create: `server/features/tv/cache.ts`
- Create: `server/features/tv/stream.ts`
- Create: `server/features/tv/channel.ts`
- Create: `server/features/tv/playlists.ts`
- Create: `server/features/tv/bumpers.ts`
- Create: `server/features/tv/schedule.ts`
- Create: `server/features/tv/media-urls.ts`
- Create: `server/features/tv/channel-service.ts`
- Create: `server/features/tv/cache-files.ts`
- Create: `server/features/tv/cache-storage.ts`
- Create: `server/features/tv/transcode.ts`
- Create: `server/features/tv/telemetry.ts`
- Create: `server/features/tv/media-metadata.ts`
- Create: `server/features/tv/cache-runtime.ts`
- Create: `server/features/tv/stream-snapshot.ts`
- Create: `server/features/tv/wtf-refresh.ts`
- Create: `server/features/tv/bumper-routes.ts`
- Create: `server/features/tv/live-routes.ts`
- Create: `server/features/tv/cache-routes.ts`
- Create: `server/features/tv/telemetry-routes.ts`
- Create: `server/features/tv/playlist-routes.ts`
- Create: `server/features/tv/playback-routes.ts`
- Create: `server/features/tv/channel-routes.ts`
- Modify: `server/routes/tv.ts`

- [ ] Extract pure helpers and service functions first; keep `server/routes/tv.ts` as the mounted compatibility router.
- [x] Extract pure pagination helpers into `server/features/tv/pagination.ts`.
- [x] Extract daypart programming constants/types/helpers into `server/features/tv/daypart.ts`.
- [x] Extract media URL normalization, IPFS gateway fallback, redirect guard, and same-origin cache URL helpers into `server/features/tv/media-urls.ts`.
- [x] Extract channel staff/editability/view gates, slug allocation, dial allocation, row locking, and duplicate-video lookup helpers into `server/features/tv/channel-service.ts`.
- [x] Extract cache/transcode config constants, cache-key/path helpers, cache metadata types, and cache telemetry helpers into `server/features/tv/cache-files.ts`.
- [x] Extract cache storage, object-store mirror queue, LRU eviction, boot cache-key migration, and cache stats into `server/features/tv/cache-storage.ts`.
- [x] Extract TV transcode sweep/ffmpeg worker and scheduler tuning into `server/features/tv/transcode.ts`.
- [x] Extract TV telemetry store/rate-limit/blacklist helpers into `server/features/tv/telemetry.ts`.
- [x] Extract token media metadata hydration/playable-asset helpers into `server/features/tv/media-metadata.ts`.
- [x] Extract bumper upload policy/config/middleware/helpers into `server/features/tv/bumper-upload.ts`.
- [x] Extract cache fetch/proxy runtime, duration probing, prefetch, and cache warmer into `server/features/tv/cache-runtime.ts`.
- [x] Extract stream snapshot queue assembly, seeded shuffle, snapshot revision/cache-key logic, and stream prefetch hooks into `server/features/tv/stream-snapshot.ts`.
- [x] Extract WTF auto-refresh playlist replacement, source-scope resolution, and advisory refresh lock into `server/features/tv/wtf-refresh.ts`.
- [x] Extract bumper listing/upload/pool/update/delete/media routes behind `registerTvBumperRoutes`.
- [x] Extract live-state `/now`, schedule CRUD, and slug-current routes behind `registerTvLiveStateRoutes`.
- [x] Extract cache media/stats/prefetch endpoint wrappers behind `registerTvCacheRoutes`.
- [x] Extract playback health aggregate/item-end and playback event routes behind `registerTvTelemetryRoutes`.
- [x] Extract playlist creation/update/replacement and playlist-item duration routes behind `registerTvPlaylistRoutes`.
- [x] Extract media-file playback and stream response routes behind `registerTvPlaybackRoutes`.
- [x] Extract channel list/detail/CRUD, playable-token intake, and channel-video management routes behind `registerTvChannelRoutes`.
- [ ] Do not change public route paths or auth gates.
- [ ] After each extraction, run the focused TV tests already present under `server/lib/tv-*.test.ts`.

## Task 5: Split Desktop OS Actors

**Files:**
- Create: `client/src/features/desktop/DesktopShell.tsx`
- Create: `client/src/features/desktop/DesktopIcons.tsx`
- Create: `client/src/features/desktop/useDesktopPhysics.ts`
- Create: `client/src/features/desktop/CustomCursor.tsx`
- Create: `client/src/features/desktop/DesktopPet.tsx`
- Create: `client/src/features/desktop/DesktopPetActors.tsx`
- Create: `client/src/features/desktop/DesktopPetCareTray.tsx`
- Create: `client/src/features/desktop/DesktopPetModel.ts`
- Create: `client/src/features/desktop/DesktopPetSimulation.ts`
- Create: `client/src/features/desktop/persistence/*`
- Create: `client/src/features/desktop/DesktopPetTypes.ts`
- Create: `client/src/features/desktop/DesktopPetWorldActors.tsx`
- Create: `client/src/features/desktop/SundayGrass.tsx`
- Create: `client/src/features/desktop/useDesktopPetMarket.ts`
- Create: `client/src/features/desktop/geometry.ts`
- Modify: `client/src/components/layout/Desktop.tsx`

- [x] Extract Sunday grass persistence, projection, positioning, and rendering into `client/src/features/desktop/SundayGrass.tsx`.
- [x] Extract desktop floating-position and seeded-placement helpers into `client/src/features/desktop/geometry.ts`.
- [x] Extract custom cursor glyphs, impact effects, and pointer tracking into `client/src/features/desktop/CustomCursor.tsx`.
- [x] Extract desktop icon glyphs, definitions, drag component, and icon geometry into `client/src/features/desktop/DesktopIcons.tsx`.
- [x] Extract Matter.js desktop icon physics into `client/src/features/desktop/useDesktopPhysics.ts`.
- [x] Extract desktop pet, care tray, toy, market, drop, ant, and shared-world behavior into `client/src/features/desktop/DesktopPet.tsx`.
- [x] Extract desktop pet care/market tray into `client/src/features/desktop/DesktopPetCareTray.tsx`.
- [x] Extract desktop pet tool cursor, toy actor, and drop actor render components into `client/src/features/desktop/DesktopPetActors.tsx`.
- [x] Extract desktop pet constants, actor model types, and shared geometry helpers into `client/src/features/desktop/DesktopPetModel.ts`.
- [x] Extract desktop pet localStorage keying, restore, and save behavior into `client/src/features/desktop/persistence/*`.
- [x] Extract desktop pet API DTO and market item types into `client/src/features/desktop/DesktopPetTypes.ts`.
- [x] Extract desktop pet target selection, edge math, ant route helpers, and world visitor spawn helpers into `client/src/features/desktop/DesktopPetSimulation.ts`.
- [x] Extract desktop pet in-app market query, cart, EXP/WTF checkout, wallet purchase, and consumable-use state into `client/src/features/desktop/useDesktopPetMarket.ts`.
- [x] Extract desktop pet stage styled actors into `client/src/features/desktop/DesktopPetWorldActors.tsx`.
- [x] Extract ant model constants/types, pheromone actors, ant route/pathfinding helpers, desktop/world ant spawn helpers, pheromone aging, and the ant RAF loop into `client/src/features/desktop/ants/*`.
- [x] Extract toy model constants/types, ball actor rendering, toy storage normalization, world-ball spawn helpers, toy escape edge rules, toy actions/API orchestration, and the toy RAF physics/spill/escape loop into `client/src/features/desktop/toys/*`.
- [x] Extract drop model constants/types, normalization, placement, movement, trash, scoop, pillow, skeleton remains, and ant-cleanup side effects into `client/src/features/desktop/drops/*`.
- [x] Extract desktop-world heartbeat, visitor intake, pet escape API, world edge helpers, and visiting-pet animation into `client/src/features/desktop/world/*`.
- [x] Extract pet locomotion, scent-following, escape scheduling/triggers, defensive swats, sickness exposure, floor/pillow sleep, and digestion/poop timing into `client/src/features/desktop/pet/*`.
- [x] Keep persisted settings keys and desktop world API calls unchanged for extracted slices.
- [x] Verify extracted desktop slices with `npm run check` and `npm run build`.
- [x] Continue splitting `client/src/features/desktop/DesktopPet.tsx` into drop simulation, pet movement, and shared-world heartbeat/escape hooks without changing persisted settings keys or desktop world API calls.
- [ ] Run a browser smoke test for desktop icon opening and pet/toy rendering after the next stateful actor split.

## Task 6: Split TV And W Client Pages Into Feature Views

**Files:**
- Create: `client/src/features/tv/*`
- Create: `client/src/features/w/*`
- Modify: `client/src/pages/TV.tsx`
- Modify: `client/src/pages/W.tsx`

- [x] Extract API calls and React Query hooks before extracting UI panels.
- [x] Extract TV DTO/view types into `client/src/features/tv/types.ts`.
- [x] Extract pure TV helpers into `client/src/features/tv/utils.ts`.
- [x] Extract playback telemetry helpers into `client/src/features/tv/telemetry.ts`.
- [x] Extract CRT static/WebAudio component into `client/src/features/tv/TVStatic.tsx`.
- [x] Extract CRT chrome/styled components into `client/src/features/tv/TVChrome.ts`.
- [x] Extract on-screen menu, creator tools, playlist, bumper, media, channel edit, and schedule panes into `client/src/features/tv/TVMenuScreens.tsx`.
- [x] Extract CRT playback surface/media render tree into `client/src/features/tv/TVPlaybackSurface.tsx`.
- [x] Extract TV data queries into `client/src/features/tv/useTVDataQueries.ts`.
- [x] Extract TV mutation invalidation/workflow hooks into `client/src/features/tv/useTVMutations.ts`.
- [x] Extract creator-console derived data into `client/src/features/tv/useTVCreatorDerivedData.ts`.
- [x] Extract channel selection into `client/src/features/tv/useTVChannelSelection.ts`.
- [x] Extract session telemetry into `client/src/features/tv/useTVSessionTelemetry.ts`.
- [x] Extract playlist draft sync into `client/src/features/tv/useTVPlaylistDraftSync.ts`.
- [x] Extract stream prefetch into `client/src/features/tv/useTVStreamPrefetch.ts`.
- [x] Extract remote-control/dial logic into `client/src/features/tv/useTVRemoteControls.ts`.
- [x] Extract skip-notice UX into `client/src/features/tv/useTVSkipNotice.ts`.
- [x] Extract hidden preload tracking into `client/src/features/tv/useTVPreloadTracker.ts`.
- [x] Extract MTV overlay timing into `client/src/features/tv/useTVMtvOverlayVisibility.ts`.
- [x] Extract stall-indicator UX into `client/src/features/tv/useTVStallIndicator.ts`.
- [x] Extract broadcast playback-state resolution and preload-window derivation into `client/src/features/tv/useTVBroadcastPlaybackState.ts`.
- [x] Extract bumper deck/gate selection into `client/src/features/tv/useTVBumperDeck.ts`.
- [x] Extract playback safety/load/cover timer refs into `client/src/features/tv/useTVPlaybackTimers.ts`.
- [x] Extract server-queue cursor resync into `client/src/features/tv/useTVQueueCursorSync.ts`.
- [x] Extract current item lifecycle into `client/src/features/tv/useTVCurrentItemLifecycle.ts`.
- [x] Extract media event handlers into `client/src/features/tv/useTVMediaEventHandlers.ts`.
- [x] Extract power/channel reset lifecycle into `client/src/features/tv/useTVPowerSignalReset.ts`.
- [x] Extract buffer-gate and bumper-transition behavior into `client/src/features/tv/useTVBufferGate.ts`.
- [x] Extract queue advance/refetch controller into `client/src/features/tv/useTVQueueAdvanceController.ts`.
- [x] Extract TV playback view model / derived render flags into `client/src/features/tv/useTVPlaybackViewModel.ts`.
- [x] Extract TV shell/chrome layout into `client/src/features/tv/TVShellLayout.tsx`.
- [x] Extract W shared types into `client/src/features/w/types.ts`.
- [x] Extract W data queries into `client/src/features/w/useWDataQueries.ts`.
- [x] Extract W mutation hooks into `client/src/features/w/useWMutations.ts`.
- [x] Extract W timeline panel into `client/src/features/w/timeline/WTimelinePanel.tsx`.
- [x] Extract W messages/DM/groupchat panels into `client/src/features/w/messages/WMessagesPanel.tsx`.
- [x] Extract W social/settings/Spaces/admin diagnostics panel into `client/src/features/w/social/WSocialPanel.tsx`.
- [x] Extract W shell chrome/nav into `client/src/features/w/WShell.tsx`.
- [ ] Keep wrapper pages exporting `TV` and `W`.
- [ ] Verify with `npm run check` and browser smoke tests for `/tv` and `/w`.

## Task 7: Split Admin Console Into Server Route And Client Tab Domains

**Files:**
- Create: `server/features/admin/*`
- Create: `client/src/features/admin/*`
- Modify: `server/routes/admin.ts`
- Modify: `client/src/pages/Admin.tsx`

- [x] Extract Admin shared client types into `client/src/features/admin/types.ts`.
- [x] Extract Admin React Query data hooks into `client/src/features/admin/useAdminDataQueries.ts`.
- [x] Extract Admin mutation hooks into `client/src/features/admin/useAdminMutations.ts`.
- [x] Extract Admin Users tab into `client/src/features/admin/tabs/UsersAdminTab.tsx`.
- [x] Extract Admin Seasons tab into `client/src/features/admin/tabs/SeasonsAdminTab.tsx`.
- [x] Extract Admin Rounds tab into `client/src/features/admin/tabs/RoundsAdminTab.tsx`.
- [x] Extract Admin Challenges tab into `client/src/features/admin/tabs/ChallengesAdminTab.tsx`.
- [x] Extract Admin Side Quests tab into `client/src/features/admin/tabs/SideQuestsAdminTab.tsx`.
- [x] Extract Admin Board tab into `client/src/features/admin/tabs/BoardAdminTab.tsx`.
- [x] Extract Admin permissions routes into `server/features/admin/permissions-routes.ts`.
- [x] Extract Admin WTF TV routes into `server/features/admin/wtf-tv-routes.ts`.
- [x] Extract Admin media storage routes into `server/features/admin/media-storage-routes.ts`.
- [x] Extract Admin reward routes into `server/features/admin/reward-routes.ts`.
- [x] Extract Admin user routes into `server/features/admin/user-routes.ts`.
- [x] Extract Admin stats routes into `server/features/admin/stats-routes.ts`.
- [x] Continue tab extraction breadth-first: Content, XP Log, Rewards, Desktop Apps, Contract Ledger, Roles, WTF TV, Studio, WTF Tez.
- [x] Split Admin user routes into focused subdomain registrars under `server/features/admin/users/*` and keep `server/features/admin/user-routes.ts` as a compatibility wrapper.
- [ ] Audit Admin tab visual behavior in browser after the structural extraction.

## Task 8: Split W Server Route Groups

**Files:**
- Create: `server/features/w/*`
- Modify: `server/routes/w.ts`

- [x] Extract W timeline account/payload helpers into `server/features/w/timeline.ts`.
- [x] Extract W link-preview normalization/fetching/enrichment into `server/features/w/link-preview.ts`.
- [x] Extract W compose and engagement action routes into `server/features/w/action-routes.ts`.
- [x] Extract W message, groupchat, DM diagnostics, admin DM selection, and stream-rule admin routes into `server/features/w/message-routes.ts`.
- [x] Extract W follows, Spaces, and capabilities routes into `server/features/w/social-routes.ts`.
- [x] Extract `/api/w/timeline` registration/cache wrapper into `server/features/w/timeline-routes.ts`.
- [x] Extract W timeline/link-preview shared payload types into `server/features/w/timeline-types.ts`.
- [x] Extract `/api/w/link-preview` registration wrapper into `server/features/w/link-preview-routes.ts`.

## Task 9: Split Shared Schema Last

**Files:**
- Modify: `shared/schema.ts`
- Create: `shared/schema-users.ts`
- Create: `shared/schema-wallets.ts`
- Create: `shared/schema-gameshow.ts`
- Create: `shared/schema-social.ts`
- Create: `shared/schema-tv.ts`
- Create: `shared/schema-studio.ts`
- Create: `shared/schema-market.ts`
- Create: `shared/schema-desktop.ts`

- [x] Begin with low-risk core/social/ops branches once route/page imports became domain-shaped.
- [x] Extract `shared/schema-core.ts`, `shared/schema-social.ts`, and `shared/schema-ops.ts` while keeping `shared/schema.ts` export-name parity.
- [x] Extract `shared/schema-desktop.ts` and `shared/schema-market.ts` while keeping `shared/schema.ts` export-name parity.
- [x] Extract `shared/schema-discord.ts` while keeping `shared/schema.ts` export-name parity.
- [x] Extract `shared/schema-tv.ts` while keeping `shared/schema.ts` export-name parity.
- [x] Extract `shared/schema-admin.ts` while keeping `shared/schema.ts` export-name parity.
- [x] Create candidate `shared/schema-studio.ts`, `shared/schema-gameshow.ts`, and `shared/schema-board.ts` modules for sequential barrel integration.
- [x] Integrate `shared/schema-gameshow.ts` through the compatibility barrel after removing the old gameshow table/enum owners from `shared/schema.ts`.
- [x] Integrate `shared/schema-board.ts` through the compatibility barrel after retargeting chat channel season references to `shared/schema-gameshow.ts`.
- [x] Integrate marketplace listing/bid tables into `shared/schema-market.ts` so the market schema domain owns both in-app and trade-board marketplace tables.
- [x] Extract `shared/schema-dm.ts` as the lower DM branch needed by Studio.
- [x] Integrate `shared/schema-studio.ts` through the compatibility barrel after retargeting Studio conversation references to `shared/schema-dm.ts`.
- [x] Move desktop pet event history into `shared/schema-desktop.ts`.
- [x] Extract `shared/schema-wallet.ts` for wallet surveillance, cockpit sync, token metadata, collections, and wallet holdings.
- [x] Extract `shared/schema-analytics.ts` for XTZ quotes, token mint/sale/listing/P&L tables, and analytics relations.
- [x] Extract `shared/schema-recapture.ts` for operator actions, buyback/auction recapture, operator wallet, and collection contract factory tables.
- [x] Extract `shared/schema-liveops.ts` for calendar tickets, attendance, Discord activity rewards, CRP nominations, and console scores.
- [x] Extract `shared/schema-session.ts` for connect-pg-simple session storage.
- [x] Keep `shared/schema.ts` as the compatibility barrel.
- [x] Do not rename tables, enums, relations, indexes, or migration files.
- [x] Verify current schema split with duplicate-owner scan, barrel-import scan, `npm run check -- --pretty false`, and `git diff --check`.
- [ ] Verify with `npm run check` and a production build.

## Completion Rules

- Every debugging/fix pass must append a new `LESSONS_LEARNED.md` entry.
- Every bounty slice must update `BUG_BOUNTY_BOARD.md` from `Claimed` to `Fixed` or `Verified` with evidence.
- No completion claim without fresh verification output from the current branch.
