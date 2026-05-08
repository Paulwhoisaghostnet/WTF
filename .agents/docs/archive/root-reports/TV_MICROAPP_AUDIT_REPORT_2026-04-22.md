# WTF TV Microapp Audit - Brutal Engineering, Design, and Consumer Review

Date: 2026-04-22  
Scope: `client/src/pages/TV.tsx`, `server/routes/tv.ts`, `server/routes/tv-embed.ts`, `server/routes/media-library.ts`, `server/lib/tv-boot-backfill.ts`, TV schema/migrations, runtime wiring, and consumer-facing flow.

## Executive Verdict

WTF TV is not a microapp. It is a full media product pretending to be one React page and one Express route. It contains a channel directory, creator studio, playlist editor, scheduler, NFT media importer, user media library bridge, bumper ad system, IPFS gateway proxy, disk cache, LRU eviction, duration probing, ffmpeg transcode worker, embed player, telemetry collector, and platform auto-programming logic.

That ambition is cool. The current implementation is also a maintainability grenade.

The good news: the team clearly fought real production pain. The app has hard-won fixes for IPFS cold starts, media duration drift, bumper pacing, cache warming, LRU limits, stable channel dial numbers, playlist deletion cascades, and creator metadata overlays. This is not lazy work.

The bad news: the system is patched together in the most dangerous possible way for a video product: giant files, duplicated playback semantics, homegrown progressive-download streaming, no real test harness, public mutation endpoints, hand-rolled buffer state machines, and upload flows that can create media rows the TV pipeline cannot actually play.

If this is meant to be a reliable consumer TV experience, it is still in prototype clothing.

## Evidence Snapshot

- `client/src/pages/TV.tsx` is 5,200 lines.
- `server/routes/tv.ts` is 4,895 lines.
- `server/routes/tv-embed.ts` is 510 lines.
- TV-related schema spans channels, videos, playlists, playlist items, bumpers, global WTF config, media library, and schedules.
- The main TV component currently has 23 `useState` calls, 13 `useRef` calls, 16 `useEffect` calls, 29 `useCallback` calls, 11 React Query queries, and 15 mutations in one component.
- The TV Express route exposes 31 router endpoints/functions in one file.
- `npm run check` passes as of this audit.
- No TV-specific `*.test.*` or `*.spec.*` files were found.
- The working tree already had modified TV files before this report was written: `client/src/pages/TV.tsx`, `server/lib/background-jobs.ts`, `server/routes/tv.ts`, plus untracked `.codex/`.

## What It Does

### Consumer Mode

The user opens `/tv`, sees a stylized CRT television inside the app's Windows-95-ish desktop shell, powers it on, picks channels, and watches a queue of videos, GIFs, and bumper clips. The client fetches `/api/tv/channels`, selects a channel, then fetches `/api/tv/channels/:channelId/stream` only while powered on. Playback is client-driven: the app walks the returned queue with `onEnded`, GIF timers, fallback caps, hidden preloaders, and local bumper/static gap coverage.

### Creator Mode

Creator Tools are embedded inside the CRT menu rather than being a separate management surface. A creator can create channels, edit channel metadata, add NFT video tokens, add media-library items, manage channel media, upload personal/community bumpers, create playlists, reorder playlist items, set active playlists, and configure a UTC 24-hour daily playlist schedule.

### Backend Mode

The server owns channel CRUD, token-to-video ingestion, playlist persistence, stream queue construction, schedule matching, bumper uploads/serving, community bumper pools, cache proxying, prefetch, telemetry logging, duration updates, WTF auto-playlist refresh, and embed HTML generation.

### Media Pipeline

The pipeline is roughly:

1. NFT token metadata or media library item becomes a `tv_channel_videos` row.
2. Active playlist rows reference those channel videos via `tv_playlist_items`.
3. `/api/tv/channels/:id/stream` picks a playlist, shuffles it in a 30-minute deterministic bucket, interleaves bumpers according to `videos_per_bumper`, and returns a queue.
4. The client uses `cacheUrl` values that hit `/api/tv/cache/media?url=...`.
5. The cache proxy normalizes IPFS gateway URLs, fetches public HTTP/IPFS media, tees cold downloads to disk, serves hot files with byte ranges, and prefers a generated 720p transcode if available.
6. Background jobs warm channel caches, evict old cache entries, and run ffmpeg transcode sweeps.

That is a lot of responsibility for files named `TV.tsx` and `tv.ts`.

## What It Does Well

### The Physical TV Concept Is Memorable

The CRT cabinet, knobs, scanlines, power flash, static canvas, pink-noise hiss, OSD, and MTV-style metadata overlay are the best parts of the product. The TV does not feel like a generic media card. It has an identity.

Specific strengths:

- The CRT wrapper and physical control panel are distinctive.
- The power state creates a ritual instead of dumping users into a bland player.
- Channel dial numbers are a strong mental model.
- Bumpers as community/programming artifacts are culturally on-theme.
- The MTV overlay gives artist/title context without needing standard controls.

This part should be protected. Do not "modernize" it into a boring video grid.

### The Server-Side Cache Work Is Serious

The cache layer is the most production-aware subsystem in the TV app. It has:

- IPFS gateway fallback.
- CID-normalized cache keys so the same content does not get duplicated across gateways.
- Persistent disk cache under `/app/cache/tv`.
- Remote file size caps.
- TTL for mutable HTTP sources.
- LRU-ish eviction against a total byte budget.
- Cold streaming that tees upstream bytes to the client and disk.
- Range support on hot files.
- Structured `[tv-cache]` telemetry.
- Proactive background warming.
- 720p H.264 transcode sweep for oversized videos.

That is battle-scarred and useful. It is also still not a real adaptive streaming pipeline.

### The Team Removed a Bad Wall-Clock Playback Model

The code repeatedly documents that the old "shared wall-clock cursor" cut off videos mid-play. The current client-driven playback model is saner for progressive media because it respects actual `ended` events and GIF timing rather than trying to derive a global broadcast position from wall time.

This was a good product call. A fake live TV clock is worse than a reliable playlist unless the system has actual live-stream infrastructure.

### The Database Cascades Are Moving In The Right Direction

The `tv_channel_videos.media_item_id` FK with `ON DELETE CASCADE` is the right idea. The migration and boot backfill explicitly target the "shell videos left behind after deleting media" bug. This is the kind of fix that belongs in the database, not in a hand-written cleanup loop.

### Channel Dial Numbers Are A Good Product Primitive

Stable dials make the product feel like a TV network instead of a list. Dial pinning for special channels and monotonically allocated dials for others is a good UX and sharing primitive. Embeds using dial/slug references build on that well.

## Critical Failures

### 1. The Main TV Component Is A God Object

`client/src/pages/TV.tsx` starts the `TV()` component at line 1395 and then piles the whole app into it: channel selection, stream query, media readiness, power state, playlist drafts, bumper uploads, media deletion dialogs, schedule forms, preloaders, telemetry, 15 mutations, and every CRT menu screen.

This is not "cohesive." It is fused.

The state surface alone is enough to make regression fixes risky. At lines 1399-1475 the component declares power, screen view, selected channel IDs, queue index, loading flags, volume, channel drafts, playlist drafts, token filters, bumper form state, media add/delete state, active bumper state, media readiness/error state, refs, and form drafts. Then it wires 11 queries between lines 1484-1590. Then it implements an entire playback state machine from roughly 1805 onward.

The result is predictable:

- Any change to playback can destabilize menus.
- Any menu mutation can invalidate stream state in subtle ways.
- The "source of truth" is spread between React state, refs, React Query caches, DOM video state, browser buffer state, server queue state, and timers.
- The component is not unit-testable in any practical sense.

What should happen:

- Split viewer playback into `TvPlayerShell`, `useTvStreamQueue`, `useTvPlaybackMachine`, `useBumperRotation`, `TvChrome`, and `TvTelemetry`.
- Split creator tooling out of the CRT into separate route-level or panel-level components: `ChannelManager`, `PlaylistEditor`, `BumperManager`, `ScheduleEditor`, `MediaPicker`.
- Keep the CRT menu as a navigation/control surface, not as the entire studio UI.

### 2. The Backend Route Is A Second God Object

`server/routes/tv.ts` imports everything: DB, pool, crypto, filesystem, streams, child process, multer, permissions, schema, media utils, network safety, media probe. It owns routing, cache, transcoding, scheduler-callable functions, upload handling, playlist logic, schedule logic, WTF auto-refresh, and diagnostics.

This is not a route module. It is a service layer, media worker, queue builder, proxy, upload controller, and admin subsystem smashed together.

Suggested module split:

- `tv/routes/channels.ts`
- `tv/routes/playlists.ts`
- `tv/routes/bumpers.ts`
- `tv/routes/stream.ts`
- `tv/routes/cache.ts`
- `tv/services/channel-service.ts`
- `tv/services/queue-builder.ts`
- `tv/services/schedule-resolver.ts`
- `tv/services/media-cache.ts`
- `tv/services/transcode-worker.ts`
- `tv/services/wtf-auto-channel.ts`
- `tv/services/telemetry.ts`

That split is not aesthetic. It is necessary if this ever needs reliable iteration.

### 3. Private Channels Leak Through Direct Public Endpoints

The channel list hides non-public channels unless `mine=1`, but several direct channel endpoints only require `isActive`, not `isPublic` or ownership.

Concrete examples:

- `/api/tv/channels/:channelId/stream` filters by channel id and `isActive`, but not `isPublic`, at lines 3494-3512.
- `/api/tv/channels/:channelId/now` filters by channel id and `isActive`, but not `isPublic`, at lines 4429-4445.
- `/api/tv/channels/:channelId/schedule` filters by channel id and `isActive`, but not `isPublic`, at lines 4603-4609.

If a channel is private but active, a user who guesses or learns the numeric id can hit stream/now/schedule. That is broken semantics. `isPublic` should mean "not externally watchable unless owner/staff."

Fix:

- Introduce a single `canViewChannel(channel, req.user)` helper.
- Apply it to stream, now, schedule, slug current, embed metadata, and channel detail.
- Decide if unauthenticated viewing is allowed. If yes, public-only. If no, authenticated public-only plus owner/staff private access.

### 4. Public Duration Mutation Is Unacceptable

`PATCH /api/tv/playlist-items/:itemId/duration` is unauthenticated at line 3466. Any caller can update any playlist item duration by id. The client uses it opportunistically when loaded metadata disagrees with stored duration, but that does not justify a public write endpoint.

This endpoint affects playback timing and persisted playlist metadata. It is a mutation. It needs authorization.

Fix:

- Require authentication.
- Load the playlist item, join playlist/channel, and permit only owner/staff.
- If anonymous duration telemetry is desired, write it to a proposal/observations table and let a background worker reconcile it.
- Better: duration probing should be server-owned via ffprobe after media cache, not client-owned.

### 5. Uploaded Media Can Be Added To TV But Not Played By The TV Cache

The media upload route writes user-uploaded files as `sourceUrl: disk://filename` with no `playbackUrl` at lines 221-228 in `server/routes/media-library.ts`.

When that media-library item is added to a TV channel, `server/routes/tv.ts` uses:

- `rawUri = libItem.playbackUrl || libItem.sourceUrl`
- `normalized = normalizeMediaUri(rawUri) || rawUri`
- `sourceUri = normalized`

See lines 2878-2883.

For uploads, that becomes `disk://...`. The stream endpoint later emits `cacheUrl = /api/tv/cache/media?url=disk%3A%2F%2F...` at lines 3730-3731. The cache endpoint rejects it because `normalizeMediaUri()` only accepts public HTTP(S), at lines 3822-3828.

Translation: the UI can show uploaded videos in My Videos, and the creator can add them to TV, but the TV playback path cannot serve them through its own cache proxy. That is exactly the kind of pipeline mismatch users experience as "I added my video and the TV is broken."

Fix:

- For uploaded media, set `playbackUrl` to `/api/media/:id/file` or a signed CDN/object-storage URL.
- Teach the TV queue builder to produce direct same-origin media URLs for upload-backed items.
- Do not send internal `disk://` pseudo-URLs to browser-visible stream payloads.
- Long-term: stop storing upload playback as pseudo-protocol strings and model storage location separately from public playback URL.

### 6. There Are Two Different IPFS Normalizers With Different Gateway Behavior

`server/routes/tv.ts` uses a multi-gateway IPFS normalization and cache safety path. `server/lib/media-utils.ts` hardcodes `DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/"` at line 68 and normalizes token imports to that gateway at lines 70-77.

The comments in `tv.ts` explicitly say `ipfs.io` was slow and is intentionally last in the TV gateway list. The media library still defaults to it.

That is pipeline drift. One subsystem learned the lesson; another subsystem ignored it.

Fix:

- Use one shared IPFS/media URL normalization module.
- Keep the canonical stored source as `ipfs://CID/path` where possible.
- Resolve gateway URLs only at serving/proxy time.
- Apply the same SSRF/allowlist behavior everywhere user-controlled media enters the system.

### 7. The Playback Engine Is Hand-Rolled Browser Media Infrastructure

Lines 1805-2435 are a custom playback engine: bumper transitions, hidden preloaders, buffer gates, browser buffered range checks, hard item caps, load caps, stall indicators, fallback direct source toggles, and telemetry.

Some of it is clever. Too much of it is custom infrastructure for problems that media players, HLS/DASH clients, and streaming platforms already solve.

Current approach:

- Progressive-download MP4/WebM/GIF.
- A homemade queue state machine.
- Browser-level hidden `video` preloaders.
- Server-side opportunistic cache/transcode.
- No adaptive bitrate manifest.
- No segment-level retries.
- No ABR.
- No tested media player state abstraction.

Battle-tested alternatives:

- HLS/DASH packaging plus `hls.js`, Shaka Player, or Video.js for playback state.
- Cloudflare Stream, Mux, Livepeer, or self-hosted FFmpeg/Shaka Packager if the team wants real video infrastructure.
- Use an actual player event model and manifest-based buffering instead of inventing a queue/buffer gate around raw files.

This app currently reimplements part of a media player badly because it is trying to hide cold IPFS and oversized masters with bumpers. That is a product hack, not a foundation.

### 8. The "Live" TV Metaphor Is Fake In Conflicting Ways

The code says channels are no longer time-synced across viewers. Every client owns its own cursor. That is fine. But the product still uses broadcast concepts: dial numbers, schedule labels, UTC 24-hour programming, bumper cadence, "live" schedule UI, embeds, and "now" endpoints.

The result is semantically muddy:

- Two viewers on the same channel may see different content depending on when they powered on.
- Schedule selects which playlist is active, but not which item is currently airing.
- `/stream` returns a full queue starting at item 0.
- `/now` returns a smaller queue starting at item 0.
- `/embed` polls `/stream` but has its own simpler playback logic.
- The UI says "LIVE" in schedule context, but the playlist itself is not live-synchronized.

This is not necessarily wrong. It just needs to be named honestly:

- If it is "TV-style personal playlist mode," say that.
- If it is "global broadcast mode," build a real authoritative clock/event stream.
- Do not half-promise live TV and deliver per-client playlists.

### 9. The Embed Player Is A Separate, Dumber Player

`server/routes/tv-embed.ts` generates an inline HTML player that fetches `/stream`, walks the queue, uses muted autoplay, has a small error skip path, and a basic 15-minute poll.

This means there are two playback implementations:

- Full app: complex buffer gate, static, bumper pool query, fallback logic, telemetry.
- Embed: simpler queue walker with its own timers and player behavior.

They will drift. They already do. The embed player does not replicate the full TV's buffer gate, preload logic, static fallback, MTV overlay, or telemetry depth. It also resets cursor on queue fetches in ways the app carefully avoids.

Fix:

- Share a player package/state machine between app and embed.
- Or make embed intentionally "viewer-lite" and document exactly which behavior differs.
- Stop inlining a second media player as a giant HTML string if the embed matters.

### 10. `refreshWtfPlaylist()` Deletes First, Then Rebuilds

The WTF auto-playlist refresh deletes all channel videos at line 4341, then returns early if no playable tokens are found at lines 4343-4347.

That means a bad metadata day, bad filter, sync issue, or data outage can wipe the current WTF TV channel content and leave it empty.

Fix:

- Build the replacement set first.
- If replacement count is zero, do not delete current programming unless an explicit "clear channel" flag is provided.
- Use a transaction.
- Ideally maintain playlist versions and atomically activate a new version.

### 11. Random SQL Ordering Does Not Scale

WTF auto-refresh uses `ORDER BY RANDOM()` at lines 4301-4322. Bumper pool uses `ORDER BY RANDOM()` too. This is fine for tiny tables. It is a trap as holdings/media volume grows.

Fix:

- Use deterministic seeded sampling, reservoir sampling, random offset windows, or precomputed candidate pools.
- For creator fairness, make selection policy auditable instead of "whatever Postgres random gave us this time."

### 12. Rate Limiting Treats Video Infrastructure Like Normal JSON API

The app applies a global in-memory `/api/` rate limit of 200 requests per minute at `server/app.ts` lines 205-211. TV media goes through `/api/tv/cache/media`, and video players can generate multiple range requests, preloads, retries, cache misses, and bumper/media fetches.

A media streaming endpoint should not share the same naive rate bucket as JSON buttons. This can cause false 429s during perfectly normal playback, especially with hidden preloaders and multiple windows/devices behind one IP.

Fix:

- Move media endpoints out from under generic API rate limiting, or create route-specific streaming limits.
- Exempt byte-range media delivery from JSON API throttles.
- Use a real distributed limiter in production if there are multiple processes.

### 13. Bumper Upload Validation Trusts Client Metadata Too Much

The bumper upload route accepts multer MIME type and a client-provided `durationMs`, then writes the file to disk. It does not probe actual duration or container type before accepting the row.

The caps are nice, but this is still weak:

- A mislabeled file can enter the media pool.
- A user can lie about duration.
- A malformed media file can poison community bumpers.
- There is no moderation/approval state for community bumpers.

Fix:

- Probe with ffprobe before insert.
- Verify MIME/container magic, not just `file.mimetype`.
- Store status: `pending`, `approved`, `blocked`.
- Require staff review or automated checks for community bumpers.
- Generate thumbnails/previews.

### 14. The Boot Backfill Contains A Hardcoded Admin Password

`server/lib/tv-boot-backfill.ts` has `ADMIN_DEFAULT_PASSWORD` hardcoded at line 8. This is a serious operational/security smell even if intended as a one-time bootstrap convenience.

Fix:

- Remove the literal.
- Require `BOOTSTRAP_ADMIN_PASSWORD` env var for first boot, then refuse startup if absent and no admin exists.
- Force password rotation or create a one-time invite/reset token instead.
- Log only that an admin was created, never the password.

### 15. The Schedule Model Is Half Migrated

The schema still contains both recurring daily fields (`startMinuteOfDay`, `endMinuteOfDay`) and absolute timestamp fields (`startsAt`, `endsAt`). `/stream` uses daily minute windows. `/now` and slug-current still contain absolute schedule code that joins `user_media_library` through `mediaItemId`.

This is old architecture fossilized in the same file. The UI is now "24H SCHEDULE (UTC)" playlist slots; old "media item scheduled by timestamps" logic still exists in public endpoints.

Fix:

- Decide one schedule model.
- Delete or migrate unused absolute schedule fields.
- Make `/now`, `/stream`, slug-current, and embed share the same schedule resolver.
- Add tests around midnight UTC and overlap boundaries.

### 16. Consumer Error States Are Vague

The TV experience hides too much behind static. Static is atmospheric, but it also masks failure. If a media item is blocked, unsupported, private, oversized, rate-limited, missing from disk, or rejected by cache normalization, the viewer gets vibes instead of clarity.

Better consumer behavior:

- Show "This item failed. Skipping..." for repeated item failures.
- Show channel health: "3 items unavailable."
- Let creators see broken media diagnostics in Creator Tools.
- Distinguish no playlist, private channel, missing file, unsupported media, and buffering.

### 17. Creator UX Is Too Dense For A CRT Menu

The consumer TV chrome is strong. The creator UI is cramped and awkward because it lives inside the same CRT screen. Editing channel metadata, managing media, uploading bumpers, deleting media with cascade previews, and configuring 24-hour schedules are not TV-remote interactions.

This is charming for a demo and punishing for real creators.

Design fix:

- Keep the CRT menu for viewer controls: channel, volume, captions, quality, fullscreen, info.
- Move Creator Studio to a larger window or panel launched from the TV.
- Use the CRT as preview, not as the whole authoring environment.
- Give playlist editing real drag/drop, thumbnails, durations, validation, and unsaved-change state.

### 18. Accessibility Is Mostly Absent

The app uses custom buttons/knobs, hidden media elements, animated static, low-contrast retro styling, and no clear keyboard navigation model. A TV aesthetic can be accessible, but this currently assumes mouse/touch and sighted users.

Missing:

- Keyboard operability for channel/power/menu controls.
- Focus states that are obvious inside the CRT.
- Captions/subtitles model.
- Reduced motion mode for flicker/static.
- Clear ARIA labeling for knobs and TV state.
- Error messages that screen readers can announce.

### 19. Observability Is Logs, Not Product Analytics

Telemetry posts to `/api/tv/playback/events`, sanitizes fields, and logs JSON to process logs. That is useful during debugging but weak as product/media observability.

Missing:

- Structured table or event sink for playback sessions.
- Aggregate buffer ratio, startup time, failure rate, skip rate, item health.
- Per-channel health dashboard.
- Cache hit ratio by channel/item.
- Transcode queue visibility.
- Alerting when a channel goes dark.

Right now the system knows things only if someone reads logs.

## What It Should Do Better

### It Should Pick A Real Media Strategy

The current pipeline is "progressive files plus a heroic proxy." That can work for small prototypes. It is inferior to battle-tested video delivery for anything consumer-facing.

Recommended target:

- Store canonical originals in object storage.
- Generate HLS or DASH renditions with a bitrate ladder.
- Serve manifests and segments from CDN/object storage.
- Use `hls.js`, Shaka Player, or Video.js instead of raw `<video>` orchestration.
- Keep IPFS as an origin/import source, not as the viewer-facing delivery layer.
- Keep the custom CRT chrome around a real player core.

If budget/ops are the constraint, use managed video:

- Cloudflare Stream handles upload, encode, storage, and delivery with H.264 adaptive bitrate streaming.
- Mux Video provides API-first video ingest, encoding, ABR/HLS playback, webhooks, and playback analytics.

If self-hosting:

- FFmpeg or Shaka Packager can generate HLS/DASH outputs.
- Store segments in R2/S3.
- Serve through Caddy/CDN.
- Use hls.js/Shaka/Video.js in the browser.

### It Should Treat Uploads As First-Class Media, Not Base64 JSON

`/api/media/upload` expects base64 in JSON and the app globally limits JSON bodies to 10 MB. The route also checks a 25 MB file cap, which means the theoretical route cap and actual app parser cap disagree. This is a classic "works until a user uploads a real video" problem.

Recommended:

- Use multipart upload for small files.
- Use tus/resumable uploads for real video.
- Upload directly to object storage with signed URLs when possible.
- Run post-upload probe/transcode jobs.
- Track processing state and reject adding media to channels until ready.

### It Should Have A Single Channel Authorization Contract

Every public route should go through one shared resolver:

- Resolve channel by id/slug/dial.
- Load owner.
- Determine visibility.
- Return normalized public metadata or reject.

Right now every route hand-rolls a slightly different version.

### It Should Have A Test Harness Before More Feature Work

Minimum tests needed:

- Unit tests for `normalizeMediaUri`, IPFS path extraction, cache key normalization, and private/local host blocking.
- Unit tests for stream queue construction: schedules, bumper cadence, empty playlist, bumper-only channels, GIF/video kinds.
- Auth tests for stream/now/schedule private channel access.
- Mutation auth test for duration update.
- Integration test for uploaded media item added to TV returning playable `/api/media/:id/file` or equivalent.
- Browser test for "power on -> first video starts -> next item advances -> no blank screen."
- Regression test for "long video is not cut off by bumper cadence."

No more playback rewrites without tests. This code already has the scars of multiple rewrites.

## Consumer Perspective

The user-facing concept is strong and weird in a good way. It feels like a social-art TV station, not a bland gallery. That is rare.

But a consumer will not care about any of the cleverness if:

- The first video takes 20 seconds to start.
- Static hides what is actually broken.
- Volume/autoplay behaves inconsistently.
- Mobile controls are cramped.
- Uploaded videos silently fail.
- "Live" does not mean live.
- A private channel can be watched by id.
- The menu feels like programming a VCR through a soda straw.

The emotional promise is "turn on a strange community TV channel and it just plays." The current architecture is still "pray the queue/cache/proxy/state machine all agree."

## High Design Perspective

### Keep

- CRT cabinet.
- Channel dial model.
- Power-on ritual.
- Static/no signal states.
- MTV-style metadata overlay.
- Community bumpers as culture layer.
- "WTF TV" as a network, not just a tab.

### Rework

- Creator tools should leave the CRT and become a real studio.
- TV should get true fullscreen/theater mode.
- Channel browsing should have richer identity: logo, owner, current item, health, count, share/embed.
- Schedules should be visually meaningful, not tiny hour blocks in a terminal-green menu.
- The app needs "now playing" share cards and channel landing pages.
- Remote-control metaphor should be for viewing only.

### Kill

- Editing dense forms inside the CRT.
- Base64 uploads for video.
- Public duration mutation.
- Direct `disk://` leakage.
- Duplicate player implementations.
- Old schedule endpoint fossils.
- Hardcoded bootstrap password.

## Prioritized Fix Plan

### P0 - Stop The Bleeding

- Add auth/ownership checks to `PATCH /api/tv/playlist-items/:itemId/duration`.
- Enforce `isPublic`/owner/staff checks on `/stream`, `/now`, and `/schedule`.
- Fix uploaded media playback by resolving upload-backed media to `/api/media/:id/file` or a proper signed CDN URL.
- Remove hardcoded admin password from boot backfill.
- Add route-specific media rate-limit behavior so video range requests are not treated like JSON spam.

### P1 - Stabilize The Pipeline

- Extract queue building into a pure service with tests.
- Extract schedule resolution into one service used by stream/now/embed/slug-current.
- Extract cache/transcode logic out of `tv.ts`.
- Unify IPFS normalization across media library and TV.
- Replace client duration writes with server-owned duration probing.
- Add ffprobe validation for bumper uploads.

### P2 - Productize The Viewer

- Wrap playback in a battle-tested player core.
- Introduce HLS/DASH output or managed video pipeline.
- Keep CRT shell as brand chrome.
- Add channel health and creator diagnostics.
- Add fullscreen/theater and mobile-first controls.
- Add clear error and retry states.

### P3 - Productize The Creator Experience

- Move creator tools into a studio interface.
- Add drag/drop playlist editor with thumbnails.
- Add upload processing statuses.
- Add bumper moderation.
- Add schedule calendar/timeline UX with local timezone display plus UTC clarity.
- Add channel analytics.

## Suggested Libraries / Pipelines To Consider

Use these as directionally better, battle-tested options. Do not cargo-cult them blindly; choose based on hosting, budget, and how much video infrastructure the team wants to own.

- `hls.js`: Browser HLS playback via Media Source Extensions. Good if self-hosting HLS manifests/segments.
- Shaka Player: Open-source adaptive media player for DASH/HLS, stronger for advanced adaptive-streaming needs.
- Video.js: Mature, open-source HTML5 player ecosystem with React options and plugin surface.
- Plyr: Lightweight accessible UI wrapper if the app needs simpler custom player controls, though it does not replace HLS/DASH packaging by itself.
- Cloudflare Stream: Managed upload, encode, store, and deliver pipeline with adaptive bitrate; attractive if the app is already Cloudflare-friendly.
- Mux Video: Managed developer-first video API with ABR/HLS and analytics.
- tus/Uppy: Resumable upload protocol/client path for real video uploads instead of base64 JSON.
- Shaka Packager or FFmpeg HLS packaging: Self-hosted path for generating manifests/segments into object storage/CDN.

## Source Notes For External Recommendations

- hls.js official repository: https://github.com/video-dev/hls.js/
- Shaka Player official repository: https://github.com/shaka-project/shaka-player
- Video.js official site: https://videojs.org/
- Plyr official site: https://plyr.io/
- Cloudflare Stream docs: https://developers.cloudflare.com/stream/
- Mux Video API: https://www.mux.com/video-streaming-api
- tus resumable upload protocol: https://tus.io/protocols/resumable-upload
- Cloudflare Stream tus upload docs: https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/

## Final Raw Assessment

WTF TV has soul. It also has too much unreviewed responsibility packed into too few files. The design concept deserves a stronger engineering spine.

Right now, the app is compensating for missing media infrastructure with atmosphere. Static, bumpers, buffer gates, logs, and transcodes are being used to paper over the fact that the system does not have a proper video delivery model. Some of those patches are genuinely smart. But smart patches are still patches.

The next phase should not be "add more TV features." The next phase should be "turn this into a real media subsystem." Split the god files, secure the endpoints, fix upload playback, unify media normalization, test the queue builder, and decide whether WTF TV is a per-user playlist experience or a real synchronized broadcast network.

Until then, the CRT is beautiful, the concept is sticky, and the architecture is one serious production incident away from making everyone afraid to touch it.
