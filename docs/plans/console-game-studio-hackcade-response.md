# WTF Console + Game Studio Hackcade Response Plan

Last updated: 2026-05-07

## Sources Checked

- Live Hackcade app: <https://hacktez.com/arcade>
- Hackcade game API: <https://hacktez.com/api/v1/arcade/games>
- Hackcade repository: <https://github.com/skullzarmy/hack-tez>
- Hackcade README: <https://github.com/skullzarmy/hack-tez/blob/main/hackcade/README.md>
- Hackcade SDK skill: <https://github.com/skullzarmy/hack-tez/blob/main/src/skills/hackcade-sdk.md>
- Hackcade arcade function: <https://github.com/skullzarmy/hack-tez/blob/main/netlify/functions/arcade.mts>
- Hackcade ZIP handling: <https://github.com/skullzarmy/hack-tez/blob/main/netlify/functions/arcade-zip.mts>

## Hackcade Edges To Beat

1. Public arcade catalog, not only owned cartridges.
2. Builder-attributed active games with play counts.
3. Creator submission flow with pending review.
4. Admin approve, reject, remove, and audit trail.
5. Static HTML bundle standard with required `index.html`.
6. SDK contract: ready, player/session, score updates, game over, pause/resume events.
7. Local sandbox and mocked identity for development.
8. Server play sessions with expiration and duplicate-run prevention.
9. Leaderboards by game.
10. Recent plays feed.
11. Player stats endpoint.
12. Score-cap anti-cheat: max possible score and score-per-second.
13. Game version/update review path.
14. Cover image handling.
15. Per-game builder docs and template examples.
16. Mobile-first guidance and touch-friendly examples.
17. Admin flagging and moderation queue.
18. Small bundle constraints that keep games reviewable.
19. Automatic SDK injection/normalization during bundle processing.
20. Stable public API route family for agents, UIs, and docs.

## What Landed In This Pass

- Console domain helpers in `server/features/console/`.
- Game Studio domain helpers in `server/features/game-studio/`.
- Published console catalog API: `/api/console/games`, `/api/console/published`.
- Console SDK asset: `/api/console/sdk.js`.
- Session and score APIs: `/api/console/session`, `/api/console/scores`.
- Signed one-use score tickets bound to game, run id, player, and expiry.
- Leaderboard, recent score, champion, and player profile APIs.
- Console library champion strip that launches the winning game from the title-holder row.
- Invalid score attempt audit rows for bad signatures, replayed tickets, expired tickets, score caps, and speed caps.
- Session-bound public report button on published game cards.
- Admin report queue with review, resolve, dismiss, and reopen actions.
- Trusted Creator role and domain permissions:
  - `trusted_console_creator` auto-publishes Console games and creator-owned updates.
  - `trusted_tv_creator` now maps to the same three-channel creation cap that staff/trusted UI surfaces advertise.
  - `trusted_market_creator` can create EXP-priced in-app market items through the trusted creator item API without gaining admin powers.
- Media-library-backed game submission: `/api/console/submit`.
- Creator-owned update submissions via `/api/console/submit` with `updateSlug`; pending updates do not replace the current public runtime until approved.
- Submitted-game list: `/api/console/my-games`.
- Admin moderation action route with audit event writes.
- Server-side ZIP validator/extractor:
  - Enforces ZIP, uncompressed, file-count, and per-file caps.
  - Requires root `index.html`.
  - Blocks traversal, absolute paths, unsupported compression, encrypted entries, ZIP64, and unapproved extensions.
  - Injects `/api/console/sdk.js` into creator bundles during extraction.
  - Publishes immutable versioned bundle files under `/api/console/bundles/:slug/v:version/*`.
- Admin Console tab:
  - Lists pending, active, rejected, removed, or all games.
  - Supports approve, reject, remove, restore, moderation notes, and manual Hackcade import.
- Runtime parent bridge:
  - SDK and Hackcade compatibility shim can ask the console shell to perform authenticated session/score API calls.
  - Console shell shows ready/running/score/game-over HUD state from postMessage events.
- Game Studio APIs for templates, stock assets, scaffold generation, upload target, generated asset payloads, saved projects, and server-side ZIP builds.
- Direct Game Studio submit API: `/api/game-studio/projects/:id/submit` builds the saved project, stores the build snapshot, and sends the validated ZIP into Console moderation/trusted auto-publish without a manual media upload hop.
- Game Studio app at `/game-studio`.
- Durable creator projects in `game_studio_projects`.
- Editable creator source files in the Game Studio file tree/editor.
- Versioned project build records in `game_studio_project_builds` with ZIP checksum, manifest, and source snapshot.
- Server packager that creates Console-compatible ZIPs from template source, stock assets, and uploaded local assets, then validates the ZIP through the Console bundle contract.
- Console creator XP liveops events for submissions, updates, approvals, and trusted auto-publishes, with duplicate checks and daily caps.
- Trusted creator in-app market API: `/api/in-app-market/creator-items`.
- Desktop app gate for `game-studio`.
- Twice-daily Hackcade import worker:
  - Pulls live Hackcade games from `https://hacktez.com/api/v1/arcade/games`.
  - Imports them as active `hackcade-*` console games.
  - Preserves Hackcade/hack.tez attribution, source URL, builder identity, and MIT license metadata in public catalog rows, version metadata, and audit payloads.
  - Serves bundles through `/api/console/hackcade/*` so browser frame rules do not block play.
  - Replaces Hackcade's SDK file with a WTF compatibility module that opens WTF console sessions and submits scores to our leaderboard.
  - Writes console audit/version rows for inserts and updates.
- MCP tools:
  - `wtf_list_console_games`
  - `wtf_list_game_studio_assets`
  - `wtf_create_game_studio_scaffold`
  - `wtf_build_game_studio_bundle`
  - `wtf_list_game_studio_projects`
  - `wtf_create_game_studio_project`
  - `wtf_update_game_studio_project`
  - `wtf_build_game_studio_project`
  - `wtf_submit_game_studio_project_to_console`
  - `wtf_create_trusted_creator_market_item`
- Schema foundation:
  - Extended `console_games`.
  - Added `console_game_versions`, `console_player_stats`, `console_audit_events`.
  - Added `console_game_reports`.
  - Added `game_studio_projects`.
  - Added `game_studio_project_builds`.

## Console Plan: Make WTF The Clear Winner

### Console.Catalog

- Merge installed demos, published community games, and owned media cartridges into one catalog.
- Add game detail pages with builder profile, versions, score caps, changelog, and source provenance.
- Use `GET /api/console/player/:username` for cross-game stats.
- Use `GET /api/console/champions` for current title holders.

### Console.Runtime

- Keep static bundle runtime isolated in sandboxed iframes.
- Parent postMessage bridge is now the credential-bearing path for published games; broaden it with pause/resume/reset commands and richer error telemetry.
- Add iframe lifecycle controls: start, pause, resume, reset, eject, visibility.
- Signed server tickets now bind score-bearing published runs to the issuing game/player/session.

### Console.Submission

- Extend the landed ZIP bundle validator:
  - Max ZIP size.
  - Max uncompressed size.
  - Max file count.
  - Per-file size cap.
  - Required root `index.html`.
  - Extension allowlist.
  - No absolute paths or traversal.
- Add update submissions as new `console_game_versions`.
- Trusted Console creators can bypass manual review; other updates stay pending while the currently active version remains public.
- Add optional server-side object-storage mirroring for extracted bundle files.
- Keep all imported token/media provenance from `user_media_library`.

### Console.Moderation

- Add admin queue UI for pending games and updates.
- Add reject reasons, resubmit, remove, and restore.
- Add flag endpoint for community reports.
- Add audit visibility by game and actor.

### Console.Liveops

- Add campaigns: featured games, weekly challenge, game jam, bounty tags.
- Console creator XP now covers submissions, updates, admin approvals, and trusted auto-publish events; next add first play, top score, and weekly champion rewards.
- Add analytics: funnel from studio template to submitted game to approved game to first score.
- Keep the `console-hackcade-import` scheduler job at a 12-hour cadence by default; use `HACKCADE_IMPORT_INTERVAL_MS` or `HACKCADE_IMPORT_DISABLED=1` for operations overrides.

### Console.Security

- Keep sensitive state server-side.
- Use one-use play tickets for scoring.
- Record invalid score attempts through `console_audit_events` and invalid `console_scores` rows where a numeric score exists.
- Add score-cap defaults per template.
- Add server-side bundle validation before any public serving.
- Add CSP path policy for creator bundles that differs from trusted installed demos.

## Game Studio Plan

### Studio.Authoring

- Keep `/game-studio` separate from general Studio because it has a different job: game SDK creation, preview, packaging, and console submission.
- Project save/load now persists creator drafts in `game_studio_projects`.
- File tree and code editor are now in place for source files; next add visual scene settings and asset inspector details.
- Add template variables: title, slug, controls, score cap, orientation, canvas size.

### Studio.Assets

- Expand stock assets into versioned packs:
  - Sprites.
  - Tilesets.
  - Backgrounds.
  - UI/HUD.
  - Audio loops.
  - Sound effects.
  - Fonts.
  - Shaders.
- Store uploaded local assets in saved project JSON for the current lightweight authoring loop; publish bundles still flow through existing media-library storage.
- Add asset licensing metadata and source provenance.
- Add pack export into generated bundles.

### Studio.Preview

- Maintain fast local preview with mocked `WTFConsole`.
- Add real authenticated preview mode using `/api/console/session` against private draft games.
- Add mobile viewport toggles.
- Add input simulator for keyboard, pointer, and touch.

### Studio.Packaging

- Use `POST /api/game-studio/projects/:id/build` to produce a ZIP from selected template, user files, and assets.
- Run bundle validator before upload.
- Store every server build with checksum, manifest, and source snapshot before publish handoff.
- Submit saved projects directly through `POST /api/game-studio/projects/:id/submit`, which calls Console's bundle submission domain and preserves project/build metadata.
- Let creators resubmit updates as new `console_game_versions`.

### Studio.MCP

- Keep scaffold generation available to paired agents.
- Use `wtf_build_game_studio_bundle` for MCP-driven package creation from templates and stock assets.
- Authenticated write tools now exist for project create/update/build/submit.
- Require `game-studio:write` for project mutation/build tools and both `game-studio:write` plus `console:write` for Console submission.
- Trusted market creator MCP uses `market:write` and the `wtfiam` gate.

## Domain Boundaries

```text
server/features/console/
  catalog      published games, demos, owned cartridges, submissions
  scoring      sessions, scores, leaderboards, stats
  sdk          browser SDK payload
  moderation   admin decisions and audit events
  liveops      creator XP awards with duplicate/daily-cap controls

server/features/game-studio/
  catalog      templates and stock assets
  projects     saved creator drafts
  packaging    ZIP creation and Console bundle validation alignment

server/features/in-app-market/
  creator-items trusted creator item submission and serialization

client/src/pages/Console.tsx
  shell        browsing and runtime surface

client/src/pages/GameStudio.tsx
  creator      template selection, assets, preview, upload, submit

shared/schema-liveops.ts
  console_games, console_play_tickets, console_scores

shared/schema-console.ts
  console_game_versions, console_player_stats, console_audit_events

shared/schema-game-studio.ts
  game_studio_projects, game_studio_project_builds
```

## Next Implementation Passes

1. Add player profile detail UI in the Console shell.
2. Move large uploaded Game Studio assets from project JSON into media/object storage while keeping packaging server-side.
3. Add visual scene settings, mobile preview toggles, and richer asset inspector controls on top of the landed source editor/build history.
4. Add creator/player campaign loops for first play, top score, weekly champion, and game-jam participation.
5. Add report analytics and auto-priority signals from repeated reports, invalid-score bursts, and creator resubmissions.
6. Add a creator-facing in-app market studio UI on top of the trusted creator item API.
