# Division 04 TV Menu Screens Refactor Plan

Leader scope: wrapper integration in `client/src/features/tv/TVMenuScreens.tsx` plus this division documentation.

Worker scope: new modules under `client/src/features/tv/menu/*`. Workers must not edit unrelated TV hooks, `client/src/pages/TV.tsx`, server routes, query hooks, mutation hooks, or shared TV route contracts unless the leader expands the scope.

## Pre-Flight

- Read `LESSONS_LEARNED.md` on 2026-05-05.
- Read `BUG_BOUNTY_BOARD.md` on 2026-05-05.
- Matching bounty: `WTF-BB-102`.
- Claim state: nested `TVMenuScreens.tsx` split is owned by Division 04 while the broader TV modularity item remains in progress.

## Current Wrapper Contract

- Entry point: `TVMenuScreens(props: TVMenuScreensProps)`.
- Caller: `client/src/pages/TV.tsx` builds one `menuScreenProps` object and passes it through `TVPlaybackSurface`.
- State contract: the wrapper receives state and setters only; it must not create React Query calls, mutation hooks, or new cross-screen state.
- Screen router: a `switch (screenView)` over the `ScreenView` union from `client/src/features/tv/types.ts`.
- Styling contract: menu modules use the existing CRT menu primitives from `client/src/features/tv/TVChrome.ts`.
- Query/mutation contract: query-like and mutation-like objects are passed in from `useTVDataQueries` and `useTVMutations`; payload shapes must stay unchanged.

## Screen Map

| ScreenView | Current responsibility | Contract edges |
| --- | --- | --- |
| `menu` | Root overlay, close button, links to channels/settings/creator, current channel/item display. | `setScreenView("tv" | "channels" | "settings" | "creator")`, preserve objkt external link. |
| `channels` | Public channel list and dial selector. | Dial fallback to list index, `setSelectedChannelId`, `setStreamTick`, then `setScreenView("tv")`. |
| `settings` | Volume slider and current channel label. | `volume`, `setVolume`, `dialDisplay`, no query work. |
| `creator` | Creator index: owned channels, create channel, selected-channel workflow links. | Role/channel limit, draft hydration before `channel-edit`, refresh-sources mutation. |
| `playlists` | Playlist selector, rename, activate, create playlist. | `setSelectedPlaylistEditorId`, `renamePlaylistMutation`, `setPlaylistActiveMutation`, `createPlaylistMutation`. |
| `playlist-order` | Draft reorder/duration editor and save action. | Preserve array splice behavior, duration clamp to >= 1, save payload `{ playlistId, items }`. |
| `channel-videos` | Channel media list and remove action. | `removeVideoMutation` payload `{ channelId, videoId }`. |
| `add-tokens` | Token search/sort/pagination, preview cache fallback, add-token action. | Keep `TOKENS_PER_PAGE`, `buildTvCacheUrl` fallback to direct URI, add payload `{ channelId, token }`. |
| `bumpers` | Personal/community bumper lists, share/pull/delete, upload form, community library. | Keep 80 MB max, 30 s max, still image/GIF duration rules, category caps, mutation payloads. |
| `my-media` | Media library, add-to-channel picker, channel attachment manager, delete confirmation. | Preserve usage queries, detach semantics, delete invalidations for `["tv", "stream", selectedChannelId]` and `["tv", "channel", selectedOwnChannelId]`. |
| `media-form` | Compatibility screen that redirects users back to the central media library. | Keep text and `setScreenView("my-media")` behavior. |
| `channel-edit` | Channel metadata, public toggle, slug, bumper cadence, save action. | Preserve `videosPerBumper` clamp [0, 20] and update payload keys. |
| `schedule` | UTC 24-hour visual schedule, slot list, add/delete form. | Preserve UTC math, end-after-start alert, 15-minute options, schedule mutation payloads. |

## Split Plan

Keep `TVMenuScreensProps` in the wrapper during the first extraction wave. Each worker should export a screen component with a narrow prop type, but the leader integrates by passing the existing props through without changing the caller contract.

Target wrapper shape:

```tsx
export function TVMenuScreens(props: TVMenuScreensProps) {
  switch (props.screenView) {
    case "menu":
      return <TvRootMenuScreen {...pickRootMenuProps(props)} />;
    case "channels":
      return <TvChannelsMenuScreen {...pickChannelsProps(props)} />;
    // ...
    default:
      return null;
  }
}
```

Do not add the prop picker helpers until at least two worker modules exist; early integration can pass explicit props inline to keep drift obvious. Once all screens are extracted, collapse repeated back-button wiring into a shared menu helper if it reduces wrapper noise without changing behavior.

## Scheduler Slot

D04-Scheduler owns queue state, active slots, blocker tracking, and completion summaries. It should not implement screen modules. Maintain active cap as one scheduler plus up to ten worker/verifier slots at a time.

## Worker Queue

| Worker | Target files | Scope |
| --- | --- | --- |
| D04-W01 | `client/src/features/tv/menu/MenuRootScreen.tsx`, `client/src/features/tv/menu/SettingsScreen.tsx`, optional shared menu helper | Done 2026-05-05: root menu and settings delegated from the wrapper; `npm run check -- --pretty false` passed. |
| D04-W02 | `client/src/features/tv/menu/CreatorToolsScreen.tsx` | Done 2026-05-05: creator index and selected-channel workflow links delegated from the wrapper; `npm run check -- --pretty false` passed. |
| D04-W03 | `client/src/features/tv/menu/ChannelsScreen.tsx`, `client/src/features/tv/menu/ChannelEditScreen.tsx`, `client/src/features/tv/menu/ChannelVideosScreen.tsx` | Done 2026-05-05: public channel selector, channel edit, and channel videos delegated from the wrapper. |
| D04-W04 | `client/src/features/tv/menu/PlaylistsScreen.tsx`, `client/src/features/tv/menu/PlaylistOrderScreen.tsx` | Done 2026-05-05: playlist select/rename/activate/create and playlist draft ordering delegated from the wrapper. |
| D04-W05 | `client/src/features/tv/menu/MyMediaScreen.tsx` | Done 2026-05-05: media library add/manage/delete confirmation and query invalidations delegated from the wrapper. |
| D04-W06 | `client/src/features/tv/menu/BumpersScreen.tsx` | Done 2026-05-05: bumper lists, upload validation, share/pull/delete, community library delegated from the wrapper. |
| D04-W07 | `client/src/features/tv/menu/ScheduleScreen.tsx` | Done 2026-05-05: UTC schedule visualization, slot CRUD, time formatting helpers delegated from the wrapper. |
| D04-W08 | `client/src/features/tv/menu/MenuStatusScreen.tsx` only if an existing status/cache screen appears | No new `ScreenView` values in this pass. Otherwise help verifier coverage. |
| D04-W09 | `client/src/features/tv/menu/AddTokensScreen.tsx`, `client/src/features/tv/menu/MediaFormScreen.tsx` | Done 2026-05-05: token import/search/pagination and media-form compatibility screen delegated from the wrapper. |
| D04-W10 | `client/src/features/tv/menu/actions.ts` only after screen modules exist | Shared pure action helpers for draft reorder, duration clamps, schedule minute parsing, upload duration probing. |
| D04-W11 | no broad writes; optional `client/src/features/tv/menu/index.ts` review notes | Responsive/type verifier, stale import cleanup, wrapper line-count audit. |

## Integration Rules

- Preserve `ScreenView` values exactly unless a separate leader-approved pass updates all callers and remote-control logic.
- Preserve all mutation payload shapes and option callbacks.
- Preserve query invalidation keys exactly.
- Do not move React Query hook calls into menu components.
- Do not duplicate implementations in both wrapper and extracted modules after integration.
- Keep TV upload/playback routes opaque; menu components should consume URLs and query data already provided by TV hooks.
- After every worker integration, run `npm run check -- --pretty false` if practical, then `git diff --check` before handoff.

## Verification Targets

- Type gate: `npm run check -- --pretty false`.
- Whitespace gate: `git diff --check -- client/src/features/tv/TVMenuScreens.tsx client/src/features/tv/menu docs/superpowers/plans BUG_BOUNTY_BOARD.md LESSONS_LEARNED.md`.
- Browser smoke after full integration: `/tv` root menu, channel change, volume slider, creator index, token pagination, bumper upload validation, media delete cancel/confirm, schedule add validation.

## Progress Notes

- 2026-05-05: Extracted `MenuRootScreen.tsx` and `SettingsScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "menu"` and `screenView === "settings"` while preserving `setScreenView`, current-channel/current-item display, volume slider behavior, and the existing back-button callback. Verification: `npm run check -- --pretty false` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `ChannelsScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "channels"` while preserving dial-number fallback, selected-channel highlighting, `setSelectedChannelId`, `setStreamTick`, and the return-to-TV behavior. `TVMenuScreens.tsx` is now 1,800 lines. Verification: `npm run check -- --pretty false` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `CreatorToolsScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "creator"` while preserving the channel-create gate, selected-channel draft hydration, refresh-sources mutation guard, and all creator workflow navigation targets. `TVMenuScreens.tsx` is now 1,686 lines. Verification: `npm run check -- --pretty false` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `PlaylistsScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "playlists"` while preserving playlist selection, rename/save, active playlist mutation, create-playlist gating, and the edit-contents navigation target. `TVMenuScreens.tsx` is now 1,594 lines. Verification: `npm run check -- --pretty false` and the scoped `git diff --check` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `ChannelVideosScreen.tsx` and `MediaFormScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "channel-videos"` and `screenView === "media-form"` while preserving channel media removal payloads and the compatibility redirect back to `my-media`. `TVMenuScreens.tsx` is now 1,557 lines. Verification: `npm run check -- --pretty false` and the scoped `git diff --check` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `ChannelEditScreen.tsx` and `PlaylistOrderScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "channel-edit"` and `screenView === "playlist-order"` while preserving channel update payload construction, bumper cadence clamp [0, 20], playlist draft reorder/remove/add behavior, duration clamp, and save-playlist payload shape. `TVMenuScreens.tsx` is now 1,304 lines. Verification: `npm run check -- --pretty false` and the scoped `git diff --check` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `AddTokensScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates `screenView === "add-tokens"` while preserving playable-token search/sort pagination resets, page navigation, cache-preview fallback to direct URI, selected-channel add payloads, and empty/error query states. `TVMenuScreens.tsx` is now 1,173 lines. Verification: `npm run check -- --pretty false` and the scoped `git diff --check` passed; IDE diagnostics reported no linter errors for the touched TV menu files.
- 2026-05-05: Extracted `BumpersScreen.tsx`, `ScheduleScreen.tsx`, and `MyMediaScreen.tsx` from `TVMenuScreens.tsx`. The wrapper now delegates the remaining large branches while preserving bumper category caps and upload duration validation, UTC schedule slot rendering/add/delete payloads, media add/manage/delete flows, and TV stream/channel invalidations after media deletion. `TVMenuScreens.tsx` is now a 466-line compatibility switch. Verification: `npm run check -- --pretty false`, scoped `git diff --check`, and IDE diagnostics passed for the touched TV menu files.
