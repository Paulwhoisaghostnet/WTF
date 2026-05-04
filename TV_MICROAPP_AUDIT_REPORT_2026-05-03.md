# WTF TV Microapp Audit - Post-Refactor Reality Check

Date: 2026-05-03
Previous audit reviewed: `TV_MICROAPP_AUDIT_REPORT_2026-04-22.md`
Scope: `client/src/pages/TV.tsx`, `client/src/pages/TV2.tsx`, `client/src/App.tsx`, `server/routes/tv.ts`, `server/routes/tv-embed.ts`, `server/routes/media-library.ts`, `server/app.ts`, `server/routes.ts`, `server/lib/background-jobs.ts`, `server/lib/tv-boot-backfill.ts`, `server/lib/media-utils.ts`, `server/lib/storage/cache-manager.ts`, TV schema.

## Executive Verdict

The server refactor fixed several of the nastiest April findings. Credit where it is due: some real damage got repaired.

The problem is that the refactor did not actually turn WTF TV into a cleanly designed subsystem. It turned it into a slightly safer, still oversized, still duplicated, still half-modular media product with better comments.

This is still not a microapp.

It is a channel directory, a pseudo-broadcast engine, a creator studio, a playlist scheduler, a private media library, a bumper marketplace, a cache/proxy, a background warming/transcode system, a platform auto-channel, and two separate giant React clients pretending to be one feature.

The blunt version:

- The refactor fixed some P0 bugs.
- It did not reduce the blast radius.
- It introduced a new category of problem: false confidence.
- The architecture now looks more intentional while still leaking private data, duplicating UX, and mixing incompatible media pipelines.

The code reads like a system that learned from pain, but only in patches. The product still behaves like a haunted house of good intentions.

## What Changed Since The April Audit

### Real fixes

These are actual improvements, not cosmetic ones:

1. Private channel visibility is now enforced on the public programming endpoints.
   `canViewChannel(...)` was added in `server/routes/tv.ts:789-805`, and the gate is used in:
   - `/api/tv/channels/:channelId/stream` at `server/routes/tv.ts:3924-3931`
   - `/api/tv/channels/:channelId/now` at `server/routes/tv.ts:5058-5063`
   - `/api/tv/channels/:channelId/schedule` at `server/routes/tv.ts:5232-5239`
   - `/api/tv/channels/by-slug/:slug/current` later in the file

2. Playlist item duration mutation is no longer public.
   `PATCH /api/tv/playlist-items/:itemId/duration` now requires auth and owner/staff authorization at `server/routes/tv.ts:3839-3891`.

3. Upload-backed media no longer dies on `disk://...`.
   The upload pipeline now stamps `playbackUrl = /api/media/:id/file` in `server/routes/media-library.ts:316-407`, and the TV ingest path now uses same-origin URLs for upload-backed items at `server/routes/tv.ts:3227-3249`.

4. The hard-coded admin password is gone.
   `server/lib/tv-boot-backfill.ts:8-23` now uses `WTF_ADMIN_INITIAL_PASSWORD` or generates a one-time random password.

5. WTF auto-refresh no longer nukes the playlist before proving it has replacement content.
   `refreshWtfPlaylist()` now keeps the existing playlist when no playable tokens are found and swaps atomically inside a transaction at `server/routes/tv.ts:4805-4987`.

6. The generic `/api/*` limiter no longer strangles video playback paths.
   `server/app.ts:48-75` exempts TV/media-heavy paths from the 200 req/min limiter.

### Things that are still true

1. `client/src/pages/TV.tsx` is still a god object.
   It is still 5,200 lines, still starts the main component at `client/src/pages/TV.tsx:1395`, and still carries 23 `useState`, 13 `useRef`, 16 `useEffect`, 29 `useCallback`, 11 queries, and 15 mutations in one page.

2. `server/routes/tv.ts` is still a god object.
   It is now 5,530 lines, which is worse, not better.

3. The system still has almost no meaningful TV test coverage.
   The only TV-specific test file found is `server/lib/tv-wtf-config.test.ts`, a tiny config-priority unit test. There are still no stream-building tests, no visibility tests, no bumper tests, no upload-to-TV integration tests, and no end-to-end playback tests.

4. The player is still a hand-rolled progressive-download engine rather than a battle-tested streaming/player stack.

5. The schedule model is still split between recurring playlist slots and absolute media windows.

### New or newly obvious problems

1. The private-channel leak moved.
   Public stream/now/schedule got fixed, but the authenticated channel-detail endpoint still leaks private channel internals to any logged-in user who can guess a channel id.

2. Upload-backed media playback is now functional but publicly exposed.
   The new `/api/media/:id/file` route is unauthenticated and cacheable.

3. `POST /api/tv/cache/prefetch` is anonymous, rate-limit-exempt, and can instruct the server to fetch arbitrary public URLs allowed by the normalizer.

4. Personal bumpers leak through the public bumper pool when `channelId` is supplied, even if that channel should not be viewable.

5. Channel 03 (`WTF TV`) is being overwritten into a platform-wide mixed feed even though it belongs to `paulwhoisaghost`.

6. The IPFS normalizer drift is not actually gone; it just moved into ingestion.

7. There is now a second giant TV client, `TV2.tsx`, hidden behind `/tv2`, carrying duplicated logic and partially improved UX that production users do not get.

## Evidence Snapshot

- `client/src/pages/TV.tsx`: 5,200 lines
- `client/src/pages/TV2.tsx`: 5,904 lines
- `server/routes/tv.ts`: 5,530 lines
- `server/routes/tv-embed.ts`: 510 lines
- `server/routes/media-library.ts`: 679 lines
- `server/lib/background-jobs.ts`: 204 lines
- `server/lib/storage/cache-manager.ts`: 134 lines
- `TV.tsx` state surface:
  - 23 `useState`
  - 13 `useRef`
  - 16 `useEffect`
  - 29 `useCallback`
  - 11 `useQuery`
  - 15 `useMutation`
- `TV2.tsx` state surface:
  - 26 `useState`
  - 13 `useRef`
  - 20 `useEffect`
  - 31 `useCallback`
  - 11 `useQuery`
  - 15 `useMutation`
- TV-specific tests found: 1
  - `server/lib/tv-wtf-config.test.ts`

## What The TV Microapp Actually Is

From a software engineering level, the TV microapp is a blended subsystem made of:

- A public channel directory
- A private creator control surface
- A media library bridge
- A playlist builder
- A recurring schedule system
- A separate absolute-time schedule system
- A cache/proxy for remote media
- A transcode sweeper
- A cache warmer
- A bumper upload and serving system
- A telemetry ring
- A platform-controlled auto-refreshing WTF TV channel
- A public embed surface
- Two different frontends riding the same backend

From a design level, it is trying to be:

- A CRT television toy
- An MTV-style broadcast object
- A social media channel browser
- A creator studio
- A fake linear-TV experience

From a consumer perspective, it feels like:

- A stylish retro TV wrapper around a playlist player
- With some genuinely cool atmosphere
- And a backend that has seen enough pain to add lots of operational fixes
- But not enough design restraint to pick one mental model and execute it cleanly

## What It Does Well Now

### The visual identity still carries the whole product

The CRT frame, scanlines, static, station vibe, dial metaphor, and MTV metadata overlay still give this app a personality that most video products would kill for. It does not feel generic.

That matters. The TV fantasy is the only reason the whole thing earns more patience than a normal playlist player would.

### The cache/transcode path is more serious than it was

Even though it is still all embedded in `server/routes/tv.ts`, there is real operational thinking here:

- cache normalization
- range serving
- disk persistence
- warmers
- transcode sweep
- budget enforcement
- health stats
- object-storage-aware upload handling

This is not toy code. It is just not isolated enough.

### The refactor shows some honesty

One good sign: the code explicitly references the April audit and fixes it in place rather than pretending the previous problems never existed.

Examples:

- upload-backed playback bug acknowledged in `server/routes/media-library.ts:316-321`
- IPFS normalizer drift acknowledged in `server/routes/tv.ts` import comments
- duration mutation auth problem acknowledged in `server/routes/tv.ts:3839-3845`
- hard-coded admin secret acknowledged in `server/lib/tv-boot-backfill.ts:9-16`

That is a healthy trait. The team is at least willing to name its own failures.

### TV2 proves there are better product instincts in the room

`TV2.tsx` adds things the primary `/tv` route still lacks:

- reduced-motion support
- explicit skip notices
- session-scoped telemetry
- station ID overlays
- better on-screen feedback

That means the team understands the consumer problems. They just have not merged the improvements into the real product.

## Where The Refactor Still Fails

## P0 Findings

### 1. Authenticated users can still read private channel internals

File: `server/routes/tv.ts:2798-2858`

This is the nastiest current issue.

The route `GET /api/tv/channels/:channelId`:

- requires authentication
- does not call `canViewChannel(...)`
- does not require ownership
- loads `videos`, `playlists`, and `playlistItems`
- returns everything

So the private-channel leak was not actually fixed. It was relocated from the public feed endpoints to the authenticated detail endpoint.

That means any logged-in user who guesses a private channel id can get:

- channel metadata
- channel videos
- playlist definitions
- playlist item ordering

This is worse than a cosmetic privacy bug. This is creator inventory leakage.

The endpoint is clearly intended for the creator UI, but the server never enforces that intent.

What it should do:

- Require `ownerUserId === req.user.id` or staff for full detail
- Or apply `canViewChannel` and return a viewer-safe public detail shape
- Do not mix creator detail and viewer detail in one endpoint

### 2. Uploaded media files are now publicly fetchable by id

File: `server/routes/media-library.ts:427-504`

The refactor made upload-backed media playable by creating `/api/media/:id/file`.

That fixed one bug and created another.

This route:

- is unauthenticated
- returns the file for any upload-backed media row
- marks it `Cache-Control: public, max-age=3600`
- does not verify owner/channel visibility/status

So private uploaded media is not private anymore. If an id is known or guessed, the raw asset is public.

This is the kind of bug you get when you treat "make the video playable" as a transport problem and not an access-control problem.

What it should do:

- If the asset is only in a private library, require auth and ownership
- If it is attached to a public channel, serve through a signed or policy-aware public playback path
- If object storage is used, issue signed URLs or a gated proxy, not a naked numeric-id file endpoint

### 3. The public bumper pool leaks personal bumper media

Files:
- `server/routes/tv.ts:4622-4673`
- `server/routes/tv.ts:4757+`

`GET /api/tv/bumpers/pool?channelId=...` accepts any numeric channel id, looks up `ownerUserId`, and then returns:

- every community bumper
- plus every bumper owned by that channel owner

There is no visibility check on the channel before using its owner id.

So if I know a private channel id, I can ask for that owner's bumper pool and get their personal bumpers surfaced as public media URLs.

This is a privacy leak and a model violation:

- "personal" bumpers are not actually personal
- they are effectively public if you know the channel id

It gets worse because bumper media itself is publicly served, so once ids are discovered, the assets are directly fetchable.

What it should do:

- Apply `canViewChannel(...)` before using `channelId`
- Distinguish community vs personal access rules at serve time
- Treat personal bumpers as owner/private-channel scoped media, not as openly addressable public files

### 4. Anonymous cache prefetch is an unthrottled bandwidth-abuse endpoint

Files:
- `server/routes/tv.ts:4459-4486`
- `server/app.ts:48-75`

`POST /api/tv/cache/prefetch`:

- is unauthenticated
- accepts up to 10 URLs per request
- will queue remote fetches through the server cache machinery
- sits under `/api/tv/cache/`
- therefore bypasses the generic `/api/*` rate limiter

Yes, `normalizePublicHttpUrl(...)` blocks local/private hosts, so this is not classic internal-SSRF.

It is still a public fetch-and-cache primitive with relaxed throttling.

In plain English: anonymous users can spend your bandwidth and cache budget on demand.

This is not battle-tested pipeline behavior. This is an attractive nuisance.

What it should do:

- Require auth, or at least require a signed request from the real TV UI
- Apply a dedicated limiter to prefetch
- Restrict prefetch to URLs already present in a stream payload or channel inventory
- Log and meter prefetch volume separately

## P1 Findings

### 5. The server refactor did not actually modularize the TV backend

Files:
- `server/routes/tv.ts`
- `server/lib/background-jobs.ts:18-24`
- `server/routes.ts:1-2`
- `server/index.ts` imports the TV route exports too

This is the core architectural disappointment.

The backend got helper files, but the system still treats `server/routes/tv.ts` as:

- an Express router
- a cache service
- a transcode service
- a telemetry service
- a background-jobs service
- a health service
- a WTF auto-channel service

Evidence:

- `server/lib/background-jobs.ts` imports `runTvCacheEviction`, `runTvTranscodeSweep`, `warmAllActiveChannels`, and tuning constants from `../routes/tv`
- `server/routes.ts` imports `readTvCacheStats` from `./routes/tv`
- `server/index.ts` imports `readTvCacheStats` and `migrateTvCacheKeys` from `./routes/tv`

That is not separation. That is shared dependence on the same god file.

If this file breaks, your HTTP routes, boot path, background jobs, and health path all break together.

The refactor improved local organization without reducing systemic coupling.

### 6. The frontend is now duplicated, not simplified

Files:
- `client/src/App.tsx:161-167`
- `client/src/pages/TV.tsx`
- `client/src/pages/TV2.tsx:1-10`

There are now two giant TV frontends:

- `/tv` using `TV.tsx`
- hidden `/tv2` using `TV2.tsx`

`TV2` is explicitly described as a private scratch clone forked from `TV.tsx` on 2026-04-22.

That means:

- duplicated state machines
- duplicated query wiring
- duplicated mutations
- duplicated playback logic
- duplicated future fixes
- guaranteed drift

This is the opposite of a hardening refactor.

It is understandable as a prototype move. It is not acceptable as a stable architecture.

The especially annoying part is that TV2 contains several better UX decisions, but those improvements are trapped in the hidden clone instead of being merged back into production.

### 7. The IPFS pipeline is still split-brain

Files:
- `server/lib/media-utils.ts:68-95`
- `server/routes/media-library.ts:210-219`
- `server/routes/tv.ts` TV-specific normalizer and gateway preference

The code comments imply the IPFS normalizer drift was fixed.

It was only partially fixed.

What still happens:

- TV route logic prefers the TV gateway order
- shared `normalizeIpfsUri(...)` still defaults to `https://ipfs.io/ipfs/`
- media-library token import writes `playbackUrl: normalizeIpfsUri(asset.sourceUri)` with no TV gateway override

So the same token can take different paths depending on how it entered the system:

- add token directly to channel -> TV-preferred gateway behavior
- import token into media library first, then add to channel -> `ipfs.io`-pinned playback URL

That is a classic patchwork-pipeline smell.

The product now has multiple ingestion paths for the same asset type, and they do not converge on one canonical representation.

What it should do:

- Store canonical `ipfs://...` in the database
- Resolve gateway choice only at serve/proxy time
- Never persist a gateway-specific playback URL as the source of truth unless the product has explicitly chosen that provider

### 8. Channel 03 (`WTF TV`) is being treated like a second platform aggregate channel

Files:
- `server/lib/tv-boot-backfill.ts:35-40`
- `server/lib/tv-boot-backfill.ts:317-386`
- `server/lib/tv-boot-backfill.ts:436-506`
- `server/routes/tv.ts:4805-4958`

This is a product-model failure hiding inside infrastructure code.

The boot path explicitly defines:

- dial 69 as the admin-owned `WTF Platform` channel
- dial 3 as `WTF TV`
- `paulwhoisaghost` as the canonical owner fallback for `WTF TV`

That fallback is wired in `server/lib/tv-boot-backfill.ts:436-506`, where dial 3 is pinned to `paulwhoisaghost`'s canonical `WTF TV` channel when the config does not explicitly point somewhere else.

At the same time:

- dial 69 is populated as the true platform "everything" channel by syncing ready media from across users into the admin-owned platform channel at `server/lib/tv-boot-backfill.ts:317-386`
- `refreshWtfPlaylist()` then fully replaces the configured WTF channel's videos and playlist with a platform-wide mixed feed selected from `wallet_holdings`, defaulting to `sourceMode = "all_users"`, at `server/routes/tv.ts:4805-4958`

So channel 03 is not being treated like a real user-owned channel.

It is being treated like a second aggregate platform feed that happens to sit under `paulwhoisaghost`'s ownership and branding.

That is exactly the wrong semantic outcome.

There is already a dedicated admin-owned platform channel on dial 69. Dial 03 should not be overwritten in the same broad "mix the platform together" spirit. It should remain `paulwhoisaghost`'s channel, with:

- only that user's media
- plus community bumpers

Instead, the current implementation collapses two different concepts into one:

- a platform-wide mixed `WTF` feed
- `paulwhoisaghost`'s actual `WTF TV` channel identity

The result is ownership confusion at the product level:

- the app says dial 69 is the platform channel
- the code also effectively turns dial 3 into another platform-curated mixed channel
- the user-facing brand implies dial 3 belongs to `paulwhoisaghost`, but the programming logic treats it like shared platform inventory

That is not just messy. It is dishonest.

What should happen instead:

- Keep dial 69 as the admin-owned "everything" / platform mix channel
- Make dial 3 a true owner-scoped channel for `paulwhoisaghost`
- If the product needs a curated `WTF TV` aggregate feed, create a separate admin-owned channel for that purpose rather than hijacking a user-owned one
- Stop using a user-owned fallback channel as the target of platform-wide auto-refresh unless the product explicitly intends to erase ownership semantics

### 9. Upload-backed playback now works, but through an inferior serving pipeline

File: `server/routes/media-library.ts:427-504`

The new file endpoint simply:

- sets `Content-Type`
- sets `Content-Length`
- sets public cache headers
- pipes the full file

What it does not do:

- range requests
- seek-aware streaming
- signed access
- adaptive bitrate
- any formal separation between private library storage and public playback distribution

So yes, uploads now play.

But they are now second-class citizens compared to the cache/proxy path:

- remote media gets range support through the TV cache path
- uploads go through a simpler direct file path

This means different playback behavior for different source types, which is exactly the kind of inconsistency consumers interpret as "TV is flaky."

### 10. The schedule model is still schizophrenic

Files:
- `shared/schema.ts:2258-2276`
- `server/routes/tv.ts:3935+`
- `server/routes/tv.ts:5065+`
- `server/routes/tv.ts:5212+`
- `server/routes/tv.ts:5370+`

`tv_schedule_entries` still contains both:

- recurring minute-of-day playlist slots
- absolute `startsAt` / `endsAt` media windows

That means the product is still running two schedule systems in one table:

- `/stream` resolves recurring playlist-based channel programming
- `/schedule` exposes recurring playlist slots
- `/now` and `/by-slug/:slug/current` still inspect absolute media windows via `mediaItemId`, `startsAt`, `endsAt`

This is not elegant flexibility. It is unresolved design debt.

It guarantees drift in behavior, UI, and edge cases because "schedule" does not mean one thing.

### 11. Bumper uploads still trust client-supplied duration

File: `server/routes/tv.ts:4513-4603`

Bumper upload still takes `durationMs` from the request body and stores it if it is within a max bound.

There is no authoritative media probe before persistence.

That means:

- bad durations can cut bumpers early
- exaggerated durations can hold transitions too long
- invalid timing can pollute every channel that uses the asset

The system already probes durations elsewhere. There is no good reason for bumpers to remain on the honor system.

### 12. WTF auto-refresh still runs on viewer reads

File: `server/routes/tv.ts:3933`, also `5117` and `5456`

`maybeAutoRefreshWtfChannel(...)` is still triggered from read endpoints.

That means a viewer request can trigger:

- config reads
- playlist regeneration
- DB writes
- cache warming

Even with the advisory lock, this is still control-plane work hanging off user traffic.

That is expedient, not clean.

Battle-tested systems separate:

- viewer reads
- programming refresh
- background population

This one still lets them trip over each other.

### 13. The health endpoint has a dead critical state

File: `server/routes.ts:59-69`

This is a small bug but an embarrassing one.

The disk-health status logic is:

- `warn` when `usage >= 0.9`
- `crit` when `usage >= 1.0`
- `ok` otherwise

Because the `warn` check comes first, `crit` is unreachable.

So once the TV cache truly overruns budget, the health endpoint still says `warn`.

That is exactly the kind of "ops polish" bug that makes dashboards look reassuring while the system is actually on fire.

### 14. Random SQL is still being used in hot paths

File: `server/routes/tv.ts:4660`, also inside `refreshWtfPlaylist()`

`ORDER BY RANDOM()` is still used for bumper pool selection and WTF token sampling.

This is tolerable at small scale and sloppy at medium scale.

It is one of those classic "works fine until it suddenly doesn't" choices.

On a social/media product that wants to grow, random-at-query-time is not a serious long-term strategy.

### 15. Embed is still a separate, dumber player

File: `server/routes/tv-embed.ts`

The embed surface is still a stripped polling player:

- fetch queue
- play sequentially
- refetch at end
- no shared player abstraction with `/tv`
- separate failure behavior

It is understandable for speed, but it means WTF TV has multiple playback semantics depending on where it is consumed.

That is one more place bugs can drift.

## Design Audit

### What still works

- The CRT shell still rules.
- The dial metaphor is still strong.
- The MTV flavor still makes the product memorable.
- Bumpers still feel culturally right for the concept.

### What still fails

The design vision is better than the interaction design.

The product still wants to be two things at once:

- a playful retro TV object
- a dense creator workstation

The viewer shell is atmospheric.
The creator experience is claustrophobic.

Putting channel management, playlist editing, schedule editing, bumper management, and media-library operations inside the CRT menu still feels like forcing a back office into a prop.

The TV fantasy works best when it is a viewer.
It gets weaker every time the user has to do spreadsheet work inside the television.

### The hidden clone is a product critique in code form

`TV2.tsx` is basically the team admitting:

- the production route needed better accessibility
- the production route needed better feedback
- the production route needed better broadcast chrome
- the production route needed more resilient skip handling

But instead of evolving the real product, those improvements were parked in a hidden alternate universe.

That is not iteration. That is branch-shaped denial.

## Consumer Perspective Audit

### What a normal viewer will like

- It looks cool immediately.
- It feels like an object, not a media feed.
- Channel surfing is fun.
- The bumpers and station vibe make it feel curated.

### What a normal viewer will hate

- The product still behaves like a playlist app pretending to be live TV.
- Source-dependent playback behavior is invisible and confusing.
- Error handling on the production route is still more atmospheric than informative.
- A lot of effort went into backend tricks instead of making the visible product simpler and clearer.

### What a creator will hate

- Their private data is still not consistently private.
- Their creator workflow is stuffed inside the same CRT shell as playback.
- Their uploads now work, but through a visibly different pipeline.
- There are too many ways to add media, and those ways do not produce equivalent outcomes.

## Overall Software Engineering Judgment

The server refactor deserves partial credit.

It did fix:

- several real security flaws
- one nasty upload-to-TV pipeline mismatch
- one hard-coded secret
- one dangerous playlist refresh behavior

But the deeper diagnosis remains:

- responsibilities are still not separated cleanly
- the main route file is larger than before
- the frontend was duplicated instead of decomposed
- the media model still has multiple conflicting truths
- access control is still not centralized enough to trust

This is a better defended prototype, not a mature subsystem.

## What It Should Do Better

### Immediate

1. Lock down creator-only data paths.
   Fix `/api/tv/channels/:channelId`, `/api/media/:id/file`, bumper pool visibility, and personal bumper serving rules.

2. Kill anonymous server-side fetch triggers.
   `POST /api/tv/cache/prefetch` needs auth or signed caller proof plus a hard per-user limiter.

3. Unify media access policy.
   Private library media, public channel playback media, and internal cache paths should not all be expressed as loosely related URLs with ad-hoc meaning.

4. Stop trusting client timing.
   Probe bumper duration server-side.

### Next

1. Pick one TV frontend.
   Either merge TV2 into TV or kill TV2. Keeping both is cowardice disguised as optionality.

2. Split backend services for real.
   Move cache, transcode, visibility, playlist resolution, schedule resolution, and WTF auto-refresh out of the route file.

3. Collapse the schedule model.
   Decide whether WTF TV supports:
   - recurring playlist programming
   - absolute scheduled one-off media windows
   - or both, but in clearly different tables and APIs

4. Turn the creator experience into a separate studio surface.
   Keep the CRT for watching. Do not make it do office work.

## Battle-Tested Pipeline Suggestions

If this team wants to stop inventing so much video infrastructure by hand, there are two sane paths.

### Path A: Stay self-managed, but use better primitives

- Use HLS packaging for on-demand playback instead of relying entirely on progressive MP4/GIF queue items.
- Use a real player layer such as [hls.js](https://github.com/video-dev/hls.js), [Shaka Player](https://github.com/shaka-project/shaka-player), or [Video.js](https://videojs.com/).
- Use [Uppy](https://uppy.io/docs/uppy/) with [tus](https://tus.io/protocols/resumable-upload) for resumable uploads instead of one-shot multipart plus ad-hoc staging.
- Keep ffprobe/ffmpeg as authoritative metadata/probe tools for every upload type, including bumpers.

Why:

- you get better buffering and recovery behavior
- you stop branching playback logic by source type
- you stop making upload reliability a bespoke invention

### Path B: Buy the boring parts

- Use [Mux Video](https://www.mux.com/docs/guides/video) if the goal is developer-friendly ingest, playback, and analytics with less operational overhead.
- Use [Cloudflare Stream](https://developers.cloudflare.com/stream/) if the goal is upload/store/encode/deliver with less self-hosted video plumbing.

Why:

- you remove a huge amount of custom cache/transcode/delivery work
- you stop making every viewer request responsible for infrastructure gymnastics
- you can spend your design energy on the TV identity, not on babysitting media plumbing

## Final Verdict

The April audit is no longer fully current.

Some of its harshest findings have been fixed, and those fixes are real.

But the refreshed verdict is not actually kinder.

The first audit described a reckless but inventive system.
The second audit describes a more disciplined but still structurally confused one.

WTF TV now has:

- better guardrails
- better media ingestion for uploads
- better boot hygiene
- better recovery instincts

It also still has:

- god files
- dual frontends
- inconsistent pipelines
- incomplete privacy boundaries
- half-finished abstractions

The refactor did not make the TV microapp small, clean, or battle-tested.

It made it less obviously broken while leaving too many of the same architectural lies in place.

That is progress.

It is not enough.

## External Recommendation Sources

- hls.js: https://github.com/video-dev/hls.js
- Shaka Player: https://github.com/shaka-project/shaka-player
- Video.js: https://videojs.com/
- Mux Video docs: https://www.mux.com/docs/guides/video
- Cloudflare Stream docs: https://developers.cloudflare.com/stream/
- Uppy docs: https://uppy.io/docs/uppy/
- tus protocol: https://tus.io/protocols/resumable-upload
