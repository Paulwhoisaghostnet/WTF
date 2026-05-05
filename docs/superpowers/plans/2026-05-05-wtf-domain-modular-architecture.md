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
- `client/src/features/desktop/DesktopPet.tsx`: 740 lines after extracting care/market UI, render actors, world actor styling, shared model constants/types, API DTO types, market/cart state, ant, toy, drop, world, persistence, and pet locomotion domains. The remaining component now mainly wires query/mutation entrypoints, refs/state, hook composition, and render composition.
- `server/routes/tv.ts`: 6,454 lines after extracting pagination helpers, daypart programming policy, and bumper upload config/middleware/helpers. TV channel CRUD, playback stream, cache proxy, object storage, transcoding, telemetry, playlists, schedules, and WTF auto-refresh still share one router.
- `client/src/pages/TV.tsx`: 5,358 lines after extracting DTO/view types, pure helpers, playback telemetry helpers, and the CRT static/WebAudio component. CRT player, broadcast cursor, creator console, playlist tools, bumper tools, media tools, overlays, and diagnostics still share one page component.
- `client/src/pages/Admin.tsx`: 4,055 lines. Many unrelated ops panels share one component.
- `server/routes/w.ts`: 3,230 lines after extracting timeline assembly and link previews. OAuth diagnostics, posts, follows, Spaces, DMs, groupchat, stream rules, and media upload still share one route file.
- `client/src/pages/W.tsx`: 3,569 lines. Timeline, composer, Spaces, DMs, diagnostics, and admin stream controls share one page.

Bounty-backed refactor targets:

- `WTF-BB-029`: `/api/w/timeline` loads every Twitter-linked account before bounding the timeline surface.
- `WTF-BB-025` / `WTF-BB-026`: route-level Tezos/profile fetches are not consistently behind shared upstream helpers.
- `WTF-BB-041` / `WTF-BB-042` / `WTF-BB-043`: TV config/backfill/refresh logic needs single-owner services instead of boot-time/router-local mutation.
- `WTF-BB-102`: TV server router and client page should be split into feature-owned modules so TV agents can work in parallel by concern.
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
- Modify: `server/routes/tv.ts`

- [ ] Extract pure helpers and service functions first; keep `server/routes/tv.ts` as the mounted compatibility router.
- [x] Extract pure pagination helpers into `server/features/tv/pagination.ts`.
- [x] Extract daypart programming constants/types/helpers into `server/features/tv/daypart.ts`.
- [x] Extract bumper upload policy/config/middleware/helpers into `server/features/tv/bumper-upload.ts`.
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

- [ ] Extract API calls and React Query hooks before extracting UI panels.
- [x] Extract TV DTO/view types into `client/src/features/tv/types.ts`.
- [x] Extract pure TV helpers into `client/src/features/tv/utils.ts`.
- [x] Extract playback telemetry helpers into `client/src/features/tv/telemetry.ts`.
- [x] Extract CRT static/WebAudio component into `client/src/features/tv/TVStatic.tsx`.
- [ ] Keep wrapper pages exporting `TV` and `W`.
- [ ] Verify with `npm run check` and browser smoke tests for `/tv` and `/w`.

## Task 7: Split Shared Schema Last

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

- [ ] Only begin once route/page imports are already domain-shaped.
- [ ] Keep `shared/schema.ts` as the compatibility barrel.
- [ ] Do not rename tables, enums, relations, indexes, or migration files.
- [ ] Verify with `npm run check` and a production build.

## Completion Rules

- Every debugging/fix pass must append a new `LESSONS_LEARNED.md` entry.
- Every bounty slice must update `BUG_BOUNTY_BOARD.md` from `Claimed` to `Fixed` or `Verified` with evidence.
- No completion claim without fresh verification output from the current branch.
