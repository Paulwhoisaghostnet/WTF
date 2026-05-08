# WTF Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the largest WTF platform monoliths into focused modules while keeping existing routes, imports, database behavior, and user-facing flows stable.

**Architecture:** Use a compatibility-first strangler refactor. Keep current public entrypoints such as `@shared/schema`, `/api/tv/*`, `/api/w/*`, `/tv`, `/w`, `/admin`, and the desktop shell intact while extracting pure helpers, services, hooks, and components behind those entrypoints. Every high-risk split starts with characterization tests or a no-behavior-change compile check before code is moved.

**Tech Stack:** Node 20, TypeScript, Express 5, Drizzle ORM, PostgreSQL, React 19, TanStack Query, styled-components, react95, Matter.js, node:test, Playwright.

---

## Current State Analysis

The main WTF app at `WTF combo/WTF` has several files that are acting as feature containers rather than modules:

- `server/routes/tv.ts`: 6,309 lines. It mixes channel CRUD, playlist CRUD, stream resolution, cache proxying, cache eviction, ffmpeg transcode, bumpers, schedule, telemetry, and WTF auto-refresh.
- `client/src/pages/TV.tsx`: 5,461 lines. It mixes CRT/player rendering, playback state, diagnostics, creator tools, channel editing, playlist editing, bumper upload, media library management, and schedule UI.
- `shared/schema.ts`: 4,022 lines. It contains the whole platform schema, all enums, all tables, all relations, and public insert/select schemas.
- `server/routes/w.ts`: 3,780 lines. It mixes X timeline, posting, media upload, follows, Spaces, groupchat, user DMs, admin diagnostics, stream rules, OAuth recovery logic, and link previews.
- `client/src/pages/W.tsx`: 3,569 lines. It mirrors the same W surface in one component with timeline, posting, settings, follows, DMs, admin controls, diagnostics, and Spaces.
- `client/src/pages/Admin.tsx`: 3,779 lines. It contains 14 admin tabs and their query/mutation/form state in one component.
- `client/src/components/layout/Desktop.tsx`: 2,928 lines. It mixes desktop shell, icons, Matter.js icon physics, custom cursor, screensaver, persisted appearance, and desktop pet behavior.

## File Structure

The refactor keeps stable wrapper files and introduces feature modules:

- Keep wrapper: `client/src/pages/TV.tsx`
- Create: `client/src/features/tv/types.ts`
- Create: `client/src/features/tv/api.ts`
- Create: `client/src/features/tv/hooks/useTvChannels.ts`
- Create: `client/src/features/tv/hooks/useTvPlayback.ts`
- Create: `client/src/features/tv/hooks/useTvCreatorState.ts`
- Create: `client/src/features/tv/components/TvCabinet.tsx`
- Create: `client/src/features/tv/components/TvPlayer.tsx`
- Create: `client/src/features/tv/components/TvMenuOverlay.tsx`
- Create: `client/src/features/tv/components/TvCreatorConsole.tsx`
- Create: `client/src/features/tv/components/TvMediaManager.tsx`
- Create: `client/src/features/tv/components/TvBumperManager.tsx`
- Create: `client/src/features/tv/components/TvScheduleManager.tsx`
- Keep wrapper: `server/routes/tv.ts`
- Create: `server/features/tv/types.ts`
- Create: `server/features/tv/channel-service.ts`
- Create: `server/features/tv/channel-router.ts`
- Create: `server/features/tv/playlist-service.ts`
- Create: `server/features/tv/playlist-router.ts`
- Create: `server/features/tv/stream-service.ts`
- Create: `server/features/tv/stream-router.ts`
- Create: `server/features/tv/cache-service.ts`
- Create: `server/features/tv/cache-router.ts`
- Create: `server/features/tv/transcode-service.ts`
- Create: `server/features/tv/bumper-service.ts`
- Create: `server/features/tv/bumper-router.ts`
- Create: `server/features/tv/schedule-service.ts`
- Create: `server/features/tv/schedule-router.ts`
- Create: `server/features/tv/wtf-refresh-service.ts`
- Keep wrapper: `server/routes/w.ts`
- Create: `server/features/w/timeline-service.ts`
- Create: `server/features/w/timeline-router.ts`
- Create: `server/features/w/posting-router.ts`
- Create: `server/features/w/dm-service.ts`
- Create: `server/features/w/dm-router.ts`
- Create: `server/features/w/follows-router.ts`
- Create: `server/features/w/spaces-router.ts`
- Create: `server/features/w/admin-router.ts`
- Create: `server/features/w/link-preview-service.ts`
- Keep wrapper: `client/src/pages/W.tsx`
- Create: `client/src/features/w/types.ts`
- Create: `client/src/features/w/api.ts`
- Create: `client/src/features/w/hooks/useWTimeline.ts`
- Create: `client/src/features/w/hooks/useWDms.ts`
- Create: `client/src/features/w/hooks/useWAdmin.ts`
- Create: `client/src/features/w/components/WTimelineView.tsx`
- Create: `client/src/features/w/components/WMessagesView.tsx`
- Create: `client/src/features/w/components/WSpacesView.tsx`
- Create: `client/src/features/w/components/WSettingsView.tsx`
- Keep wrapper: `client/src/pages/Admin.tsx`
- Create: `client/src/features/admin/AdminTabs.tsx`
- Create: `client/src/features/admin/hooks/useAdminData.ts`
- Create: `client/src/features/admin/tabs/UsersAdmin.tsx`
- Create: `client/src/features/admin/tabs/GameshowAdmin.tsx`
- Create: `client/src/features/admin/tabs/ContentAdmin.tsx`
- Create: `client/src/features/admin/tabs/RewardsAdmin.tsx`
- Create: `client/src/features/admin/tabs/DesktopAppsAdmin.tsx`
- Create: `client/src/features/admin/tabs/RolesAdmin.tsx`
- Create: `client/src/features/admin/tabs/WtfTvAdmin.tsx`
- Create: `client/src/features/admin/tabs/StudioAdmin.tsx`
- Keep wrapper: `client/src/components/layout/Desktop.tsx`
- Create: `client/src/features/desktop/DesktopShell.tsx`
- Create: `client/src/features/desktop/DesktopIcons.tsx`
- Create: `client/src/features/desktop/useDesktopPhysics.ts`
- Create: `client/src/features/desktop/CustomCursor.tsx`
- Create: `client/src/features/desktop/DesktopPet.tsx`
- Create: `client/src/features/desktop/Screensaver.tsx`
- Keep public barrel: `shared/schema.ts`
- Create: `shared/schema-users.ts`
- Create: `shared/schema-wallets.ts`
- Create: `shared/schema-gameshow.ts`
- Create: `shared/schema-social.ts`
- Create: `shared/schema-tv.ts`
- Create: `shared/schema-studio.ts`
- Create: `shared/schema-market.ts`
- Create: `shared/schema-discord.ts`
- Create: `shared/schema-console.ts`
- Create: `client/src/routes/page-defs.ts`
- Modify: `client/src/App.tsx`

## Guardrails

- Do not rename public API routes in this plan.
- Do not change database table names, column names, enum names, index names, or migration history.
- Keep `@shared/schema` as the public import path during the whole plan.
- Preserve route wrappers so existing imports such as `import tvRoutes from "./routes/tv"` continue to work.
- Keep each commit behavior-preserving unless the task explicitly adds a characterization test.
- Run `npm run check` after every task that moves TypeScript.
- Run targeted `node:test` files after each extracted helper/service.
- Run targeted Playwright smoke tests only after client UI splits.

## Task 1: Baseline And Safety Checks

**Files:**
- Read: `package.json`
- Read: `server/routes/tv.ts`
- Read: `client/src/pages/TV.tsx`
- Read: `server/routes/w.ts`
- Read: `client/src/pages/W.tsx`
- Read: `client/src/pages/Admin.tsx`
- Read: `client/src/components/layout/Desktop.tsx`

- [ ] **Step 1: Confirm worktree state**

Run:

```bash
git status --short
```

Expected: note any existing user changes. Do not revert unrelated dirty files.

- [ ] **Step 2: Confirm current TypeScript baseline**

Run:

```bash
npm run check
```

Expected: PASS, or record the exact pre-existing TypeScript errors in the commit message before starting refactors.

- [ ] **Step 3: Run focused existing tests for areas that will move**

Run:

```bash
npx tsx --test \
  shared/desktop.test.ts \
  client/src/lib/tv-playback.test.ts \
  server/lib/tv-broadcast.test.ts \
  server/lib/tv-policy.test.ts \
  server/lib/tv-telemetry.test.ts \
  server/lib/x-dm-cache.test.ts
```

Expected: PASS. If a test is already failing, capture the failing test name and keep the first refactor commit out of that area.

- [ ] **Step 4: Commit no code**

No commit is needed for this task unless a baseline note file is created.

## Task 2: Extract Page Registry From App

**Files:**
- Create: `client/src/routes/page-defs.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Move lazy page imports and `PAGE_DEFS`**

Create `client/src/routes/page-defs.ts` with the lazy imports, `PageDef`, `PAGE_DEFS`, `FULLSCREEN_ROUTES`, `patternToRegex`, `matchPage`, and `isWindowedRoute` currently defined in `client/src/App.tsx`.

Keep these exports:

```ts
export interface PageDef {
  pattern: string;
  component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  mapProps?: (params: Record<string, string>) => Record<string, any>;
  auth: boolean;
  roles?: UserRole[];
  title?: string;
  group?: "gameshow" | "social" | "market" | "media" | "admin" | "public";
  startMenu?: boolean;
  desktopIcon?: boolean;
}

export const PAGE_DEFS: PageDef[] = [/* moved existing entries */];
export const FULLSCREEN_ROUTES = new Set(["/", "/login", "/register"]);
export function matchPage(path: string) { /* moved existing implementation */ }
export function isWindowedRoute(path: string): boolean { return matchPage(path) !== null; }
```

- [ ] **Step 2: Update `client/src/App.tsx` imports**

Replace the local definitions with:

```ts
import {
  FULLSCREEN_ROUTES,
  PAGE_DEFS,
  isWindowedRoute,
  matchPage,
} from "./routes/page-defs";
```

Remove now-unused lazy imports and `UserRole` from `client/src/App.tsx`.

- [ ] **Step 3: Verify**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add client/src/App.tsx client/src/routes/page-defs.ts
git commit -m "refactor: extract client page registry"
```

## Task 3: Split Shared Schema Behind Compatibility Barrel

**Files:**
- Modify: `shared/schema.ts`
- Create: `shared/schema-users.ts`
- Create: `shared/schema-wallets.ts`
- Create: `shared/schema-gameshow.ts`
- Create: `shared/schema-social.ts`
- Create: `shared/schema-tv.ts`
- Create: `shared/schema-studio.ts`
- Create: `shared/schema-market.ts`
- Create: `shared/schema-discord.ts`
- Create: `shared/schema-console.ts`

- [ ] **Step 1: Extract enums and user identity tables**

Move `userRoleEnum`, `users`, `usersRelations`, `insertUserSchema`, `selectUserSchema`, `systemEventLogs`, `userWallets`, `walletAuthNonces`, and wallet sync/event tables into `shared/schema-users.ts` and `shared/schema-wallets.ts`.

Keep `shared/schema.ts` re-exporting the moved symbols:

```ts
export * from "./schema-users";
export * from "./schema-wallets";
```

- [ ] **Step 2: Extract TV tables**

Move the TV table block from `tvChannels` through `tvScheduleEntries` into `shared/schema-tv.ts`.

Keep all exported names unchanged:

```ts
export const tvChannels = pgTable(/* existing definition */);
export const tvChannelVideos = pgTable(/* existing definition */);
export const tvPlaylists = pgTable(/* existing definition */);
export const tvPlaylistItems = pgTable(/* existing definition */);
export const tvBumpers = pgTable(/* existing definition */);
export const tvWtfChannelConfig = pgTable(/* existing definition */);
export const userMediaLibrary = pgTable(/* existing definition */);
export const tvScheduleEntries = pgTable(/* existing definition */);
```

- [ ] **Step 3: Extract remaining domains in batches**

Move the remaining table blocks into these files:

```txt
shared/schema-gameshow.ts: seasons, rounds, challenges, side quests, rewards, buyback, auctions, recapture, calendar, attendance
shared/schema-social.ts: dm conversations, board, channel messages, notifications, W/X persistence
shared/schema-studio.ts: studio projects, folders, files, annotations, storage
shared/schema-market.ts: marketplace, listings, sales, acquisition lots, collections
shared/schema-discord.ts: discord identity, activity, role mappings, avatar layers
shared/schema-console.ts: console games, play tickets, scores
```

- [ ] **Step 4: Keep `shared/schema.ts` as the public barrel**

At the end of the split, `shared/schema.ts` should contain only imports needed for shared helper exports and these re-exports:

```ts
export * from "./schema-users";
export * from "./schema-wallets";
export * from "./schema-gameshow";
export * from "./schema-social";
export * from "./schema-tv";
export * from "./schema-studio";
export * from "./schema-market";
export * from "./schema-discord";
export * from "./schema-console";
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run check
```

Expected: PASS with no import-path changes required outside `shared/schema*.ts`.

- [ ] **Step 6: Commit**

Run:

```bash
git add shared/schema.ts shared/schema-*.ts
git commit -m "refactor: split shared schema by domain"
```

## Task 4: Split TV Server Route Into Feature Routers

**Files:**
- Modify: `server/routes/tv.ts`
- Create: `server/features/tv/types.ts`
- Create: `server/features/tv/channel-service.ts`
- Create: `server/features/tv/channel-router.ts`
- Create: `server/features/tv/playlist-service.ts`
- Create: `server/features/tv/playlist-router.ts`
- Create: `server/features/tv/stream-service.ts`
- Create: `server/features/tv/stream-router.ts`
- Create: `server/features/tv/cache-service.ts`
- Create: `server/features/tv/cache-router.ts`
- Create: `server/features/tv/transcode-service.ts`
- Create: `server/features/tv/bumper-service.ts`
- Create: `server/features/tv/bumper-router.ts`
- Create: `server/features/tv/schedule-service.ts`
- Create: `server/features/tv/schedule-router.ts`
- Create: `server/features/tv/wtf-refresh-service.ts`

- [ ] **Step 1: Extract shared TV server types and constants**

Move `AuthUser`, TV limits, cache tuning, transcode tuning, and small pure helpers such as `parseBoundedQueryInt`, `paginationMeta`, `slugify`, and `canViewChannel` into `server/features/tv/types.ts` or the service that owns them.

Keep exported helper names stable where other modules already import them:

```ts
export function parseBoundedQueryInt(/* existing signature */) { /* existing body */ }
export function paginationMeta(/* existing signature */) { /* existing body */ }
export function canViewChannel(/* existing signature */) { /* existing body */ }
```

- [ ] **Step 2: Extract channel routes**

Move these routes into `server/features/tv/channel-router.ts`:

```txt
GET    /api/tv/channels
GET    /api/tv/channels/:channelId
POST   /api/tv/channels
PUT    /api/tv/channels/:channelId
DELETE /api/tv/channels/:channelId
GET    /api/tv/me/playable-tokens
POST   /api/tv/channels/:channelId/videos
POST   /api/tv/channels/:channelId/refresh-sources
PUT    /api/tv/channels/:channelId/videos/:videoId
DELETE /api/tv/channels/:channelId/videos/:videoId
```

Export:

```ts
export function createTvChannelRouter(): Router {
  const router = Router();
  /* moved channel routes */
  return router;
}
```

- [ ] **Step 3: Extract playlist routes**

Move these routes into `server/features/tv/playlist-router.ts`:

```txt
POST /api/tv/channels/:channelId/playlists
PUT  /api/tv/playlists/:playlistId
PUT  /api/tv/playlists/:playlistId/items
PATCH /api/tv/playlists/:playlistId/items/:itemId
```

- [ ] **Step 4: Extract cache and transcode services**

Move cache functions from `ensureCacheDir` through `warmAllActiveChannels` into `server/features/tv/cache-service.ts`.

Move transcode functions from `ffmpegTranscodeVideo` through `runTvTranscodeSweep` into `server/features/tv/transcode-service.ts`.

Keep these exports because background jobs or scripts may use them:

```ts
export async function migrateTvCacheKeys() { /* existing body */ }
export async function runTvCacheEviction() { /* existing body */ }
export async function readTvCacheStats() { /* existing body */ }
export async function warmChannelCache(channelId: number) { /* existing body */ }
export async function warmAllActiveChannels() { /* existing body */ }
export async function runTvTranscodeSweep() { /* existing body */ }
export const TV_CACHE_WARM_TUNING = { /* existing value */ };
export const TV_TRANSCODE_TUNING = { /* existing value */ };
```

- [ ] **Step 5: Extract stream, bumper, schedule, and WTF refresh routes**

Move these route groups:

```txt
stream-router.ts: /api/tv/channels/:channelId/stream, /api/tv/channels/:channelId/now, /api/tv/channels/by-slug/:slug/current
cache-router.ts: /api/tv/cache/media, /api/cache/media, /api/tv/cache/stats, /api/tv/cache/prefetch, /api/tv/playback/events, /api/tv/telemetry/*
bumper-router.ts: /api/tv/bumpers, /api/tv/bumpers/pool, /api/tv/bumpers/community, /api/tv/bumpers/:bumperId, /api/tv/bumpers/:bumperId/media
schedule-router.ts: /api/tv/channels/:channelId/schedule
wtf-refresh-service.ts: refreshWtfPlaylist, withTvWtfRefreshLock, maybeAutoRefreshWtfChannel
```

- [ ] **Step 6: Recompose the wrapper route**

Replace `server/routes/tv.ts` with:

```ts
import { Router } from "express";
import { createTvBumperRouter } from "../features/tv/bumper-router";
import { createTvCacheRouter } from "../features/tv/cache-router";
import { createTvChannelRouter } from "../features/tv/channel-router";
import { createTvPlaylistRouter } from "../features/tv/playlist-router";
import { createTvScheduleRouter } from "../features/tv/schedule-router";
import { createTvStreamRouter } from "../features/tv/stream-router";

const router = Router();

router.use(createTvChannelRouter());
router.use(createTvPlaylistRouter());
router.use(createTvStreamRouter());
router.use(createTvCacheRouter());
router.use(createTvBumperRouter());
router.use(createTvScheduleRouter());

export {
  migrateTvCacheKeys,
  readTvCacheStats,
  runTvCacheEviction,
  warmAllActiveChannels,
  warmChannelCache,
  TV_CACHE_WARM_TUNING,
} from "../features/tv/cache-service";
export {
  runTvTranscodeSweep,
  TV_TRANSCODE_TUNING,
} from "../features/tv/transcode-service";
export { refreshWtfPlaylist } from "../features/tv/wtf-refresh-service";

export default router;
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run check
npx tsx --test server/lib/tv-broadcast.test.ts server/lib/tv-policy.test.ts server/lib/tv-telemetry.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add server/routes/tv.ts server/features/tv
git commit -m "refactor: split tv server feature modules"
```

## Task 5: Split TV Client Page Into Components And Hooks

**Files:**
- Modify: `client/src/pages/TV.tsx`
- Create: `client/src/features/tv/types.ts`
- Create: `client/src/features/tv/api.ts`
- Create: `client/src/features/tv/hooks/useTvChannels.ts`
- Create: `client/src/features/tv/hooks/useTvPlayback.ts`
- Create: `client/src/features/tv/hooks/useTvCreatorState.ts`
- Create: `client/src/features/tv/components/TvCabinet.tsx`
- Create: `client/src/features/tv/components/TvPlayer.tsx`
- Create: `client/src/features/tv/components/TvMenuOverlay.tsx`
- Create: `client/src/features/tv/components/TvCreatorConsole.tsx`
- Create: `client/src/features/tv/components/TvMediaManager.tsx`
- Create: `client/src/features/tv/components/TvBumperManager.tsx`
- Create: `client/src/features/tv/components/TvScheduleManager.tsx`

- [ ] **Step 1: Extract types and API functions**

Move TV types such as `TVChannel`, `TVVideo`, `TVPlaylist`, `StreamQueueItem`, `StreamPayload`, `TVBumper`, `TVMediaItem`, and `TVScheduleEntry` into `client/src/features/tv/types.ts`.

Create `client/src/features/tv/api.ts`:

```ts
import { api } from "@/lib/api";
import type { ChannelDetailResponse, StreamPayload, TVChannel } from "./types";

export const tvApi = {
  listChannels: () => api.get<TVChannel[]>("/api/tv/channels"),
  listMyChannels: () => api.get<TVChannel[]>("/api/tv/channels?mine=1"),
  getStream: (channelId: number) =>
    api.get<StreamPayload>(`/api/tv/channels/${channelId}/stream`),
  getChannelDetail: (channelId: number) =>
    api.get<ChannelDetailResponse>(`/api/tv/channels/${channelId}`),
};
```

- [ ] **Step 2: Extract playback hook**

Move playback state from `TV()` into `client/src/features/tv/hooks/useTvPlayback.ts`.

The hook should own:

```txt
powerOn
showPowerFlash
selectedChannelId
streamTick
clientQueueIdx
loadingSignal
transitioning
volume
activeBumper
bumperReady
bumperError
currentMediaReady
currentMediaError
currentMediaUseDirect
skipNotice
videoRef
bumperVideoRef
reportItemEnd
flushTvLog
```

Export:

```ts
export function useTvPlayback(params: {
  selectedChannelId: number | null;
  powerOn: boolean;
}) {
  /* moved existing playback behavior */
}
```

- [ ] **Step 3: Extract creator state hook**

Move creator drafts and mutation state into `client/src/features/tv/hooks/useTvCreatorState.ts`.

The hook should own:

```txt
selectedOwnChannelId
channelTitleDraft
playlistNameDraft
playlistDraft
playableSearch
playableSort
tokenPage
bumperTitleDraft
bumperCategoryDraft
mediaAddTargetId
mediaDeleteTargetId
mediaFormDraft
channelEditDraft
scheduleFormDraft
```

- [ ] **Step 4: Extract components**

Move styled components and JSX blocks into:

```txt
TvCabinet.tsx: cabinet, controls, knobs, speaker grill, screen frame
TvPlayer.tsx: video/gif/offline/static rendering
TvMenuOverlay.tsx: screenView switch and menu navigation
TvCreatorConsole.tsx: channel selection and creator commands
TvMediaManager.tsx: media list, add-media form, delete confirmation
TvBumperManager.tsx: bumper upload, pool, delete, community list
TvScheduleManager.tsx: schedule list and schedule form
```

- [ ] **Step 5: Keep page wrapper small**

After extraction, `client/src/pages/TV.tsx` should only compose hooks and components:

```tsx
export function TV() {
  const { user } = useAuth();
  const channels = useTvChannels({ user });
  const creator = useTvCreatorState({ user });
  const playback = useTvPlayback({
    selectedChannelId: channels.selectedChannelId,
    powerOn: channels.powerOn,
  });

  return (
    <TvCabinet
      user={user}
      channels={channels}
      creator={creator}
      playback={playback}
    />
  );
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run check
npx tsx --test client/src/lib/tv-playback.test.ts
```

Expected: PASS.

- [ ] **Step 7: Browser smoke**

Run the app and open `/tv`. Confirm these flows still render: power on, channel menu, creator menu, my media, bumpers, schedule.

- [ ] **Step 8: Commit**

Run:

```bash
git add client/src/pages/TV.tsx client/src/features/tv
git commit -m "refactor: split tv client modules"
```

## Task 6: Split W Server And Client

**Files:**
- Modify: `server/routes/w.ts`
- Create: `server/features/w/timeline-service.ts`
- Create: `server/features/w/timeline-router.ts`
- Create: `server/features/w/posting-router.ts`
- Create: `server/features/w/dm-service.ts`
- Create: `server/features/w/dm-router.ts`
- Create: `server/features/w/follows-router.ts`
- Create: `server/features/w/spaces-router.ts`
- Create: `server/features/w/admin-router.ts`
- Create: `server/features/w/link-preview-service.ts`
- Modify: `client/src/pages/W.tsx`
- Create: `client/src/features/w/types.ts`
- Create: `client/src/features/w/api.ts`
- Create: `client/src/features/w/hooks/useWTimeline.ts`
- Create: `client/src/features/w/hooks/useWDms.ts`
- Create: `client/src/features/w/hooks/useWAdmin.ts`
- Create: `client/src/features/w/components/WTimelineView.tsx`
- Create: `client/src/features/w/components/WMessagesView.tsx`
- Create: `client/src/features/w/components/WSpacesView.tsx`
- Create: `client/src/features/w/components/WSettingsView.tsx`

- [ ] **Step 1: Extract W link preview service first**

Move pure link preview helpers from `server/routes/w.ts` into `server/features/w/link-preview-service.ts`:

```txt
normalizeIpfsUri
parseObjktTokenRef
fetchObjktPreviewFromTzkt
normalizePreviewTarget
shouldAttemptHtmlPreview
findMetaContent
findCanonicalLink
findTitle
readResponseTextLimited
fetchLinkPreview
enrichTimelineWithLinkPreviews
```

Keep a route in `server/features/w/timeline-router.ts` or `posting-router.ts` for:

```txt
POST /api/w/link-preview
```

- [ ] **Step 2: Extract W DM service and router**

Move DM helpers and these endpoints into `server/features/w/dm-router.ts`:

```txt
GET  /api/w/dm-diagnostics
GET  /api/w/groupchat
PUT  /api/w/admin/groupchat
GET  /api/w/admin/dm-conversations
POST /api/w/groupchat/messages
GET  /api/w/user-dms
GET  /api/w/user-dms/:conversationId/messages
POST /api/w/user-dms/:conversationId/messages
POST /api/w/user-dms/direct
POST /api/w/direct-messages
```

- [ ] **Step 3: Extract timeline, posting, follows, spaces, and admin routers**

Move route groups:

```txt
timeline-router.ts: GET /api/w/timeline
posting-router.ts: POST /api/w/post, POST /api/w/media, POST /api/w/reply, POST /api/w/like, POST /api/w/repost, POST /api/w/quote
follows-router.ts: GET /api/w/follows/summary, GET /api/w/follows, POST /api/w/follows
spaces-router.ts: GET /api/w/spaces
admin-router.ts: GET /api/w/capabilities, GET/PUT /api/w/admin/stream-rules, GET /api/w/admin/stream-status
```

- [ ] **Step 4: Recompose `server/routes/w.ts`**

Use this shape:

```ts
import { Router } from "express";
import { createWAdminRouter } from "../features/w/admin-router";
import { createWDmRouter } from "../features/w/dm-router";
import { createWFollowsRouter } from "../features/w/follows-router";
import { createWPostingRouter } from "../features/w/posting-router";
import { createWSpacesRouter } from "../features/w/spaces-router";
import { createWTimelineRouter } from "../features/w/timeline-router";

const router = Router();
router.use(createWPostingRouter());
router.use(createWFollowsRouter());
router.use(createWSpacesRouter());
router.use(createWAdminRouter());
router.use(createWDmRouter());
router.use(createWTimelineRouter());

export { X_API_BASE_URL, xRequestAsUser } from "../features/w/posting-router";
export default router;
```

- [ ] **Step 5: Extract W client types, API, and hooks**

Move W response types into `client/src/features/w/types.ts`.

Create `client/src/features/w/api.ts` with methods for timeline, capabilities, follows, DMs, Spaces, posting, and admin diagnostics.

Move query/mutation blocks into:

```txt
useWTimeline.ts: timeline query, reply mutation, engage mutation, post mutation, media upload mutation
useWDms.ts: groupchat query, user DM list, selected conversation, message mutations
useWAdmin.ts: capabilities, OAuth diagnostics, stream rules, DM diagnostics, admin conversations
```

- [ ] **Step 6: Extract W view components**

Move JSX into:

```txt
WTimelineView.tsx: timeline feed, post composer, reply/quote controls
WMessagesView.tsx: groupchat, user DMs, platform DM composer
WSpacesView.tsx: Spaces lookup and embedded player
WSettingsView.tsx: OAuth tier, diagnostics, follows, admin stream controls
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run check
npx tsx --test server/lib/x-dm-cache.test.ts
npx playwright test tests/playwright/w.spec.mjs
```

Expected: TypeScript and W Playwright tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add server/routes/w.ts server/features/w client/src/pages/W.tsx client/src/features/w
git commit -m "refactor: split w feature modules"
```

## Task 7: Split Admin Page By Tabs

**Files:**
- Modify: `client/src/pages/Admin.tsx`
- Create: `client/src/features/admin/AdminTabs.tsx`
- Create: `client/src/features/admin/hooks/useAdminData.ts`
- Create: `client/src/features/admin/tabs/UsersAdmin.tsx`
- Create: `client/src/features/admin/tabs/GameshowAdmin.tsx`
- Create: `client/src/features/admin/tabs/ContentAdmin.tsx`
- Create: `client/src/features/admin/tabs/RewardsAdmin.tsx`
- Create: `client/src/features/admin/tabs/DesktopAppsAdmin.tsx`
- Create: `client/src/features/admin/tabs/RolesAdmin.tsx`
- Create: `client/src/features/admin/tabs/WtfTvAdmin.tsx`
- Create: `client/src/features/admin/tabs/StudioAdmin.tsx`

- [ ] **Step 1: Extract shared admin data hook**

Move shared queries and mutations into `client/src/features/admin/hooks/useAdminData.ts`.

Export:

```ts
export function useAdminData(activeTab: number) {
  return {
    stats,
    allUsers,
    allSeasons,
    allRounds,
    allChallenges,
    allSideQuests,
    boardThreads,
    allLinks,
    allFaq,
    xpLog,
    rewardLedger,
    desktopApps,
    contractActivityLog,
    rolePerms,
    wtfTvData,
    studioDrive,
    mutations,
  };
}
```

- [ ] **Step 2: Extract tab chrome**

Create `client/src/features/admin/AdminTabs.tsx` with the existing `Tabs` and `Tab` list:

```tsx
export function AdminTabs({
  activeTab,
  onChange,
}: {
  activeTab: number;
  onChange: (value: number) => void;
}) {
  return (
    <Tabs value={activeTab} onChange={onChange}>
      <Tab value={0}>Users</Tab>
      <Tab value={1}>Seasons</Tab>
      <Tab value={2}>Rounds</Tab>
      <Tab value={3}>Challenges</Tab>
      <Tab value={4}>Side Quests</Tab>
      <Tab value={5}>Board</Tab>
      <Tab value={6}>Content</Tab>
      <Tab value={7}>XP Log</Tab>
      <Tab value={8}>Rewards</Tab>
      <Tab value={9}>Desktop Apps</Tab>
      <Tab value={10}>Contract Ledger</Tab>
      <Tab value={11}>Roles</Tab>
      <Tab value={12}>WTF TV</Tab>
      <Tab value={13}>Studio</Tab>
    </Tabs>
  );
}
```

- [ ] **Step 3: Extract tab bodies**

Move tab bodies exactly:

```txt
UsersAdmin.tsx: activeTab 0 user table, XP award, identity edit, social clear, temp password, dossier panels
GameshowAdmin.tsx: activeTab 1 through 4 seasons, rounds, challenges, side quests, submissions, completions
ContentAdmin.tsx: activeTab 5 and 6 board, links, FAQ
RewardsAdmin.tsx: activeTab 7, 8, and 10 XP log, reward ledger, contract ledger
DesktopAppsAdmin.tsx: activeTab 9 desktop app toggles
RolesAdmin.tsx: activeTab 11 role permissions
WtfTvAdmin.tsx: activeTab 12 WTF TV config and refresh controls
StudioAdmin.tsx: activeTab 13 Google Drive status and controls
```

- [ ] **Step 4: Keep `Admin()` as composition only**

After extraction, `client/src/pages/Admin.tsx` should keep:

```tsx
export function Admin() {
  const [activeTab, setActiveTab] = useState(0);
  const data = useAdminData(activeTab);

  return (
    <Window>
      <WindowHeader>Admin Panel</WindowHeader>
      <WindowContent>
        <AdminTabs activeTab={activeTab} onChange={setActiveTab} />
        <TabBody>
          {activeTab === 0 && <UsersAdmin data={data} />}
          {(activeTab >= 1 && activeTab <= 4) && <GameshowAdmin activeTab={activeTab} data={data} />}
          {(activeTab === 5 || activeTab === 6) && <ContentAdmin activeTab={activeTab} data={data} />}
          {(activeTab === 7 || activeTab === 8 || activeTab === 10) && <RewardsAdmin activeTab={activeTab} data={data} />}
          {activeTab === 9 && <DesktopAppsAdmin data={data} />}
          {activeTab === 11 && <RolesAdmin data={data} />}
          {activeTab === 12 && <WtfTvAdmin data={data} />}
          {activeTab === 13 && <StudioAdmin data={data} />}
        </TabBody>
      </WindowContent>
    </Window>
  );
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add client/src/pages/Admin.tsx client/src/features/admin
git commit -m "refactor: split admin tabs"
```

## Task 8: Split Desktop Shell, Icons, Physics, Cursor, Pet, And Screensaver

**Files:**
- Modify: `client/src/components/layout/Desktop.tsx`
- Create: `client/src/features/desktop/DesktopShell.tsx`
- Create: `client/src/features/desktop/DesktopIcons.tsx`
- Create: `client/src/features/desktop/useDesktopPhysics.ts`
- Create: `client/src/features/desktop/CustomCursor.tsx`
- Create: `client/src/features/desktop/DesktopPet.tsx`
- Create: `client/src/features/desktop/Screensaver.tsx`

- [ ] **Step 1: Extract custom cursor**

Move cursor styled components, `CursorGlyph`, `CustomCursorState`, impact marks, arrow shot marks, and `CustomCursor` into `client/src/features/desktop/CustomCursor.tsx`.

Export:

```ts
export function CustomCursor({
  style,
}: {
  style: DesktopAppearance["cursorStyle"];
}) {
  /* moved existing behavior */
}
```

- [ ] **Step 2: Extract desktop icons**

Move icon styled components, `DesktopIconDef`, `DraggableIcon`, and `clampIconPosition` into `client/src/features/desktop/DesktopIcons.tsx`.

Export:

```ts
export const ICON_W = 68;
export const ICON_H = 66;
export function clampIconPosition(position: { x: number; y: number }, bounds: { width: number; height: number }) {
  /* moved existing body */
}
export function DesktopIcons(/* existing props */) {
  /* renders visible icons */
}
```

- [ ] **Step 3: Extract Matter.js physics**

Move `physicsRef` setup and `Matter.Engine` loop into `client/src/features/desktop/useDesktopPhysics.ts`.

Export:

```ts
export function useDesktopPhysics(params: {
  enabled: boolean;
  gravityMode: DesktopAppearance["desktopGravityMode"];
  surfaceSize: { width: number; height: number };
  visibleIcons: DesktopIconDef[];
  positionsRef: React.MutableRefObject<DesktopIconLayout>;
  saveIconLayoutRef: React.MutableRefObject<(layout: DesktopIconLayout) => void>;
  setIconPositions: React.Dispatch<React.SetStateAction<DesktopIconLayout>>;
}) {
  /* moved Matter.js loop and drag helpers */
}
```

- [ ] **Step 4: Extract desktop pet**

Move pet constants, drop components, care tray, local storage helpers, and `DesktopPet` into `client/src/features/desktop/DesktopPet.tsx`.

Keep `DesktopPet` props:

```ts
export function DesktopPet({
  enabled,
  bounds,
  userId,
}: {
  enabled: boolean;
  bounds: { width: number; height: number };
  userId: number | null;
}) {
  /* moved existing behavior */
}
```

- [ ] **Step 5: Extract screensaver and shell**

Move `ScreenSaver`, `SaverLogo`, and hot-corner close behavior into `Screensaver.tsx`.

Move `DesktopContainer`, `ContentArea`, `DesktopSurface`, `WallpaperCenter`, and `WtfLogo` into `DesktopShell.tsx`.

- [ ] **Step 6: Keep layout wrapper small**

`client/src/components/layout/Desktop.tsx` should compose:

```tsx
export function Desktop({ children }: { children: ReactNode }) {
  const desktop = useDesktopState();

  return (
    <DesktopShell desktop={desktop}>
      <DesktopIcons desktop={desktop} />
      <RouteLayer>{children}</RouteLayer>
      <DesktopPet enabled={desktop.petEnabled} bounds={desktop.surfaceSize} userId={desktop.userId} />
      <Taskbar />
      <Screensaver active={desktop.screensaverActive} onDismiss={desktop.dismissScreensaver} />
      <CustomCursor style={desktop.appearance.cursorStyle} />
    </DesktopShell>
  );
}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run check
npx tsx --test shared/desktop.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add client/src/components/layout/Desktop.tsx client/src/features/desktop
git commit -m "refactor: split desktop shell modules"
```

## Task 9: Add Architecture Docs And Ownership Boundaries

**Files:**
- Modify: `ARCHITECTURE.md`
- Create: `docs/modularization-boundaries.md`

- [ ] **Step 1: Add boundary document**

Create `docs/modularization-boundaries.md`:

```md
# Modularization Boundaries

## Stable Entrypoints

- `@shared/schema` remains the public schema import.
- `/api/tv/*` remains the TV API surface.
- `/api/w/*` remains the W API surface.
- `/tv`, `/w`, `/admin`, and the desktop shell routes remain unchanged.

## Feature Ownership

- `client/src/features/tv` owns TV player, creator tools, media management, bumpers, and schedule UI.
- `server/features/tv` owns TV channels, playlists, stream resolution, cache, transcode, bumpers, schedule, and WTF auto-refresh.
- `client/src/features/w` owns W timeline, messages, Spaces, settings, diagnostics, and admin controls.
- `server/features/w` owns X API orchestration, W cache, posting, DMs, follows, Spaces, diagnostics, stream rules, and link previews.
- `client/src/features/admin` owns admin tab UI and admin-only query/mutation state.
- `client/src/features/desktop` owns desktop shell behavior, desktop icons, physics, cursor, screensaver, and pet UI.
- `shared/schema-*.ts` owns Drizzle table definitions by domain while `shared/schema.ts` remains the public barrel.

## Rules For Future Work

- New TV code goes under `features/tv`, not directly into `pages/TV.tsx` or `routes/tv.ts`.
- New W code goes under `features/w`, not directly into `pages/W.tsx` or `routes/w.ts`.
- New admin tab code gets its own component under `features/admin/tabs`.
- New desktop shell behavior gets a hook or component under `features/desktop`.
- New schema tables go into the domain schema file and are re-exported from `shared/schema.ts`.
```

- [ ] **Step 2: Link from architecture map**

Add this sentence near the top of `ARCHITECTURE.md`:

```md
Feature ownership and post-refactor module boundaries are tracked in `docs/modularization-boundaries.md`.
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add ARCHITECTURE.md docs/modularization-boundaries.md
git commit -m "docs: document modularization boundaries"
```

## Task 10: Final Verification

**Files:**
- Read: all files changed by Tasks 2 through 9

- [ ] **Step 1: Confirm largest files are reduced**

Run:

```bash
rg --files -0 -g '*.ts' -g '*.tsx' -g '!node_modules/**' -g '!dist/**' -g '!build/**' \
  | xargs -0 wc -l \
  | sort -nr \
  | head -30
```

Expected: the top source files are no longer dominated by `server/routes/tv.ts`, `client/src/pages/TV.tsx`, `server/routes/w.ts`, `client/src/pages/W.tsx`, `client/src/pages/Admin.tsx`, and `client/src/components/layout/Desktop.tsx`.

- [ ] **Step 2: Run full TypeScript check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Run focused unit tests**

Run:

```bash
npx tsx --test \
  shared/desktop.test.ts \
  client/src/lib/tv-playback.test.ts \
  server/lib/tv-broadcast.test.ts \
  server/lib/tv-policy.test.ts \
  server/lib/tv-telemetry.test.ts \
  server/lib/x-dm-cache.test.ts \
  server/lib/in-memory-rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run browser smoke tests**

Run:

```bash
npx playwright test tests/playwright/w.spec.mjs
```

Expected: PASS.

- [ ] **Step 5: Manual smoke checklist**

Open the app locally and verify:

```txt
/tv: power on, switch channel, open menu, open creator tools, open bumpers, open schedule
/w: timeline, messages tab, Spaces tab, settings tab, admin controls hidden or shown by role
/admin: each tab renders and mutation buttons are still wired
desktop: icons drag, icons open windows, cursor style applies, screensaver opens and dismisses, pet renders when enabled
```

- [ ] **Step 6: Final commit**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: only intended modularization commits are present, with no unrelated user changes staged.

## Execution Order

Implement in this order:

1. Task 1: Baseline And Safety Checks
2. Task 2: Extract Page Registry From App
3. Task 3: Split Shared Schema Behind Compatibility Barrel
4. Task 4: Split TV Server Route Into Feature Routers
5. Task 5: Split TV Client Page Into Components And Hooks
6. Task 6: Split W Server And Client
7. Task 7: Split Admin Page By Tabs
8. Task 8: Split Desktop Shell, Icons, Physics, Cursor, Pet, And Screensaver
9. Task 9: Add Architecture Docs And Ownership Boundaries
10. Task 10: Final Verification

## Risk Notes

- Schema extraction is the highest compile-risk step because Drizzle relations reference tables across domains. Keep `shared/schema.ts` as a barrel and move one domain at a time.
- TV server extraction is the highest behavior-risk step because cache, transcode, stream resolution, and scheduled playback are tightly coupled. Extract cache and transcode services before moving route handlers.
- TV client extraction is the highest UI-risk step because playback state and creator state share the same `screenView`. Move API/types first, hooks second, components last.
- W extraction is high external-service risk because X API rate limits can hide regressions. Prefer DB/cache-backed tests and existing Playwright rate-limit tests over live X calls.
- Desktop extraction is animation-risk rather than data-risk. Preserve pointer event order and Matter.js body synchronization before styling cleanup.
