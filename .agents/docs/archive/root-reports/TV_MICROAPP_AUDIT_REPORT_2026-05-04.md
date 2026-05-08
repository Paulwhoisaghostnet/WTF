# WTF TV Microapp Audit - Current State After The May 4 Hardening Pass

Date: 2026-05-04
Repo revision audited: `1f96186`
Supersedes: `TV_MICROAPP_AUDIT_REPORT_2026-05-03.md`
Scope: `client/src/pages/TV.tsx`, `client/src/pages/TV2.tsx`, `client/src/App.tsx`, `server/routes/tv.ts`, `server/routes/tv-embed.ts`, `server/routes/media-library.ts`, `server/app.ts`, `server/lib/tv-policy.ts`, `server/lib/tv-telemetry.ts`, `server/lib/tv-stream-snapshot-cache.ts`, `server/lib/tv-wtf-config.ts`, TV schema, current TV bug-board state.

## Executive Verdict

The previous audit is now stale in important ways.

That is good news.

Several of the ugliest findings from the May 3 report are no longer true:

- the authenticated private-channel detail leak is fixed
- raw uploaded library files are no longer public by naked id
- anonymous TV cache prefetch is gone
- personal bumpers no longer leak through the public pool for hidden channels
- channel 03 is no longer silently hijacked into platform-wide "everything TV"
- the stream endpoint no longer rebuilds the entire expensive queue snapshot on every hit
- TV telemetry no longer lies about being a rolling window while hoarding error sessions forever
- channel list/detail payloads are no longer unbounded

That said, the system is still not clean.

It is less dangerous, more coherent, and more honest than it was. It is also even bigger.

The TV subsystem is still:

- a 6,163-line Express god-route
- a 5,414-line production React page
- a 5,971-line hidden experimental React clone
- a custom playlist engine
- a custom cache/proxy
- a custom transcode sweeper
- a custom queue materializer
- a custom pseudo-broadcast scheduler
- a custom telemetry ring
- a creator studio disguised as a CRT toy

This is no longer a reckless media toy.

It is now a moderately hardened, deeply overgrown media subsystem.

That is progress, but it is not elegance.

## What The Old Report Gets Wrong Now

The May 3 report overstates the current danger in several places. If someone reads that file without this update, they will come away with facts that are no longer accurate.

### No longer true: authenticated users can read private channel internals

This was real before. It is not real now.

`GET /api/tv/channels/:channelId` now gates through `ensureChannelEditable(...)` in `server/routes/tv.ts:3501`, which means owner-or-staff, not "any logged-in user."

The old finding was valid. It is now obsolete.

### No longer true: upload-backed media is publicly exposed by raw library file route

The old report called out `GET /api/media/:id/file` as public. That is no longer true.

`server/routes/media-library.ts:417-456` now requires auth and owner/staff permission for `/api/media/:id/file`.

Public playback for uploaded media is now separated into the channel-scoped route `GET /api/tv/channels/:channelId/media/:mediaItemId/file` in `server/routes/tv.ts:4672-4756`, which verifies:

- channel visibility
- actual channel/media association
- upload-backed source type

That split is a real architectural correction.

### No longer true: anonymous TV prefetch can force large media downloads

`POST /api/tv/cache/prefetch` is no longer anonymous.

It is now `isAuthenticated` at `server/routes/tv.ts:5018`.

The previous report's complaint was right for the old code. It is stale for the current code.

### No longer true: personal bumpers leak through the public pool for hidden channels

`GET /api/tv/bumpers/pool` now checks `canViewChannel(...)` when `channelId` is supplied at `server/routes/tv.ts:5181-5199`.

That means you no longer get to scrape someone's personal bumper pool just by guessing a private channel id.

### No longer true: channel 03 is still being semantically hijacked

The hardening pass added canonical owner fallback logic in `server/lib/tv-policy.ts:1-95`.

Dial 03 is now treated as `paulwhoisaghost`'s owner-scoped channel when config tries to fall back to the sloppy `all_users` mode.

That is the right correction. The platform-wide "everything channel" belongs on the platform channel, not on someone else's dial.

### Partially no longer true: the stream endpoint used to fully rebuild the expensive queue every hit

That was real. It is not fully real anymore.

`server/routes/tv.ts:4758-4899` now keeps auth, visibility, and schedule lookup live, but pushes the expensive queue assembly behind `tvStreamSnapshotCache` with revision-keyed reuse and in-flight coalescing.

This does not make the route elegant.

It does mean the old "every viewer request pays the full rebuild cost" complaint is no longer accurate.

## What The TV Subapp Is Now

### Software engineering level

It is a stitched-together media product with these major responsibilities:

- channel directory
- creator-only channel management
- playlist editing
- recurring playlist scheduling
- absolute media scheduling
- upload-backed playback
- token/IPFS/external media caching
- object-storage mirroring
- volume hot-cache serving
- transcode sweeps
- telemetry-driven self-healing
- platform-managed WTF auto-refresh
- hidden experimental frontend rollout lane

The architecture has improved in one meaningful way:

- the storage and playback path is now easier to reason about

The canonical media flow is now:

1. uploaded media goes to object storage
2. uploaded media gets copied into the attached volume as hot cache
3. token/IPFS/external media is cached to volume and mirrored into object storage
4. playback prefers local volume
5. object storage acts as the warm tier
6. IPFS/external hosts are fallback ingest sources, not the preferred delivery path

That is the right direction.

### High design level

The product is still trying to fuse three moods that do not naturally want to be in the same room:

- retro CRT toy
- MTV-style linear channel fantasy
- serious creator media control panel

Visually, it still works.

Architecturally, it is still too many products sharing one costume.

### Consumer perspective

From the outside, the TV app is better than it used to be:

- fewer silent failure loops
- better self-healing
- better media delivery path
- less chance of landing on broken or wrong content

But it still feels like a beautifully art-directed contraption rather than a disciplined consumer video product.

The vibe is strong.

The internals are still chaotic enough that the vibe is doing too much labor.

## Evidence Snapshot

Current file sizes:

- `client/src/pages/TV.tsx`: 5,414 lines
- `client/src/pages/TV2.tsx`: 5,971 lines
- `server/routes/tv.ts`: 6,163 lines
- `server/routes/tv-embed.ts`: 510 lines
- `server/routes/media-library.ts`: 639 lines

Current frontend state surface:

- `TV.tsx`
  - 23 `useState`
  - 13 `useRef`
  - 17 `useEffect`
  - 30 `useCallback`
  - 11 `useQuery`
  - 15 `useMutation`
- `TV2.tsx`
  - 26 `useState`
  - 13 `useRef`
  - 20 `useEffect`
  - 31 `useCallback`
  - 11 `useQuery`
  - 15 `useMutation`

Current TV-specific test files found:

- `server/lib/tv-policy.test.ts`
- `server/lib/tv-stream-snapshot-cache.test.ts`
- `server/lib/tv-telemetry.test.ts`
- `server/lib/tv-wtf-config.test.ts`

This is better than the prior state.

It is still nowhere near mature coverage for a system this complicated.

## What It Does Well Now

### 1. The storage architecture finally makes sense

This is the cleanest improvement in the stack.

The TV system now actually respects the intended media hierarchy:

- attached volume as hot cache
- Hetzner object storage as warm persistent backing
- public IPFS/external fetch as source-of-truth fallback

That is vastly better than treating IPFS as the primary delivery plane for everything.

### 2. Public playback and private library access are finally separate concerns

The old implementation blurred ownership and playback context.

The current one is much better:

- private library file access is owner/staff-only
- public playback for uploads is channel-scoped
- playback source rewriting is centralized in `server/lib/tv-policy.ts`

This is basic systems hygiene. The TV stack finally has some.

### 3. The stream endpoint now behaves like someone thought about traffic

The new stream snapshot cache is one of the healthiest changes in the repo.

Instead of reloading and reshuffling the same queue for every viewer hit, the route now reuses deterministic snapshots keyed by:

- channel
- active playlist
- shuffle window
- revision aggregates
- current blacklist signature

That is the kind of systems thinking the TV code previously lacked.

### 4. Telemetry is less fake

The old telemetry path claimed rolling-window behavior while only forgetting whole cold items.

Now there is a bounded telemetry store with:

- per-session timestamps
- session expiry inside hot buckets
- bucket caps
- dedicated endpoint limiter

Still custom. Still homemade. But no longer self-deceptive.

### 5. The CRT/MTV fantasy still carries real emotional weight

This remains the best thing about the product.

The TV app does not look like every other sterile web video surface. It has:

- a point of view
- a recognizable mood
- a coherent fiction

That matters more than backend purists like to admit.

Without the atmosphere, this codebase would have much less forgiveness.

## What Still Fails

## P1 / Structural Findings

### 1. It is still not a microapp. It is a media monolith wearing novelty glasses.

This is still the top architectural truth.

`server/routes/tv.ts` is 6,163 lines.

That is not a route file. That is a private government.

The file contains:

- playback policy
- stream assembly
- route handlers
- bumper logic
- scheduler logic
- telemetry logic
- randomization logic
- cache prefetch behavior
- auto-refresh behavior
- transcode coordination

The comments are good. The decomposition is still bad.

The frontend is not better:

- `TV.tsx` is 5,414 lines
- `TV2.tsx` is 5,971 lines

This is not maintainable engineering. It is survivable engineering.

Those are different.

### 2. Dual TV implementations are still poisoning rollout safety

This is still one of the worst current design choices.

`client/src/App.tsx:63-67` and `client/src/App.tsx:163-167` still keep:

- `/tv` on `TV.tsx`
- `/tv2` on hidden experimental `TV2.tsx`

Yes, `/tv` has absorbed some resilience logic from `TV2`.

No, that does not solve the underlying product problem.

Two giant UIs with overlapping behavior guarantees means:

- duplicate fixes
- partial parity
- rollout drift
- support confusion
- endless "did we patch both?" risk

This is not a serious long-term deployment strategy. It is a holding pattern that overstayed its welcome.

### 3. Test coverage is still thin for a system this stateful

The code is less naked than it was, but still under-tested where it matters most.

Current TV test files cover:

- policy rewriting
- config precedence
- telemetry store bounds
- stream snapshot cache behavior

What is still missing:

- end-to-end browser playback
- `/tv` versus `/tv2` parity
- channel visibility integration
- upload-to-playback integration
- object-storage failover integration
- recurring schedule versus absolute schedule conflicts
- real stream payload contract verification

The current tests prove some helpers.

They do not prove the product.

### 4. The TV config model is still mushy

`shared/schema.ts:2128-2141` still defines `tvWtfChannelConfig` without a DB uniqueness guard that enforces one authoritative config row per channel.

Yes, `pickPreferredWtfChannelConfig(...)` made the selection deterministic.

No, deterministic garbage selection is not the same as eliminating garbage state.

This is a bandage over a model problem.

The system still allows too many rows and then politely picks a winner.

That is nicer than `LIMIT 1` roulette, but it is still roulette in a tuxedo.

### 5. Boot-time TV backfill is still doing schema-adjacent work in app startup

This remains gross operational behavior.

The audit board is still right: boot-time backfill should not be doing startup mutation work without a proper single-writer model.

This kind of logic belongs in:

- migrations
- explicit bootstrap jobs
- leader-elected startup tasks

Not in "hope two app instances do not wake up angry at the same time."

### 6. WTF refresh still uses `ORDER BY RANDOM()`

This is smaller than the earlier security and privacy bugs, but it is still cheap, lazy SQL.

The board is right to keep it open.

`ORDER BY RANDOM()` on a growing wallet population is the kind of cute query that behaves fine right up until it doesn’t, then suddenly everyone acts shocked that the database hates them.

It should be replaced with a deterministic batching or sampling strategy.

### 7. The scheduling model is still architecturally schizophrenic

This remains one of the weirdest product design smells in the subsystem.

The stack still runs two scheduling ideas at once:

- recurring daily playlist slots in `/stream`
- absolute media windows in `/now` and slug-current

You can see the split directly:

- `/stream` uses `playlistId`, `startMinuteOfDay`, `endMinuteOfDay`
- `/now` and `/api/tv/channels/by-slug/:slug/current` still inspect `startsAt`, `endsAt`, and `mediaItemId`

That is not one model with variants.

That is two different products hiding in one namespace.

The consumer does not care how you schedule content. The system does. Right now the system is still speaking two dialects to itself.

### 8. The custom media pipeline is still inferior to battle-tested streaming stacks

This is the most important "be cruel and honest" design-level criticism left.

The current stack is still a hand-rolled progressive file playback system.

It has:

- cache normalization
- object storage mirroring
- volume hot cache
- background prefetch
- transcode sweep
- same-origin upload serving

That is all useful.

It is still not a real broadcast-grade or streaming-grade media pipeline.

What it still does not have:

- segmented HLS/DASH delivery
- adaptive bitrate
- manifest-based playback
- battle-tested player behavior on long-form network variability
- durable media analytics beyond custom event posting

For weird NFT artifacts, GIFs, and arbitrary IPFS junk, a custom file pipeline is understandable.

For creator-uploaded, repeat-play TV media, a more battle-tested stack would be better:

- ffmpeg-generated HLS outputs
- `hls.js`, Shaka Player, or Video.js for playback
- or managed delivery like Mux / Cloudflare Stream for upload-backed media

Right now WTF TV is still doing brave custom-workshop engineering where established media tooling would reduce risk.

### 9. `/now` and slug-current still duplicate stream-adjacent logic instead of sharing one core state model

The stream endpoint got the snapshot cache.

The `/now` endpoints did not.

`server/routes/tv.ts:5612+` and `server/routes/tv.ts:5988+` still rebuild enough playlist/schedule state to prove the subsystem does not yet have one unified "channel state resolver."

This is not catastrophic.

It is still duplication, and duplication is how drift starts.

## What It Should Do Better

### 1. Kill the dual-client split

There should be one production TV surface.

Not one public page and one hidden experimental clone forever.

Extract shared playback/state machinery and either:

- fold `TV2` behavior into `TV`
- or make `TV2` the real app and delete the corpse

But stop pretending two giant hand-maintained pages are a rollout strategy.

### 2. Enforce TV config truth in the database

Do not keep relying on code to pick the least-wrong row.

Enforce:

- one authoritative config row per channel
- explicit versioning or activation rules
- no nullable "maybe attached, maybe floating" config mush if it can be avoided

### 3. Move boot mutation work out of app startup

The app should boot.

It should not negotiate bootstrap reality with sibling app instances every time it wakes up.

### 4. Bifurcate the media pipeline on purpose

There are really two media classes here:

- arbitrary token/IPFS/external weirdness
- creator-uploaded broadcast-ish media

Treat them differently.

The weird-artifact path can stay custom.

The creator-upload path should move closer to a real segmented streaming pipeline if smoothness is a serious goal.

### 5. Add real verification, not just helper tests

Minimum missing test lanes:

1. viewer can play a public upload-backed channel item end-to-end
2. private upload cannot be fetched through a naked library route by another user
3. private channel cannot leak through detail, stream, bumper pool, or slug routes
4. `/tv` and `/tv2` produce matching externally observable fallback behavior for broken clips
5. stream cache shows `MISS` then `HIT` under repeated requests

### 6. Extract the server by capability, not by "whatever fit in the file today"

At minimum:

- stream state builder
- schedule resolver
- bumper selection
- WTF refresh
- playback telemetry
- upload/public playback policy

should not all live in one route file this size.

The code comments are already trying to be modules.

The file structure should stop fighting them.

## Current Priority Queue

If the goal is "make the TV subapp serious," the next priorities should be:

1. `WTF-BB-054` — consolidate `/tv` and `/tv2`
2. `WTF-BB-041` — enforce unique authoritative TV config rows
3. `WTF-BB-042` — remove boot-time schema-ish TV backfill work from normal startup
4. `WTF-BB-043` — kill `ORDER BY RANDOM()` in WTF refresh
5. add real browser/integration/parity coverage
6. decide whether upload-backed TV is going to stay custom-file based or graduate to segmented streaming

## Final Judgment

The TV app is now materially better than the last audit claimed.

That matters.

It would be unfair to call the current version careless. It is not careless anymore.

It is patched, battle-scarred, partially hardened, and still structurally indulgent.

The security/privacy story is much better.

The storage story is much better.

The hot-path stream story is meaningfully better.

The maintainability story is still bad.

The product architecture story is still confused.

The codebase still does too much custom work in too few files.

The harsh truth now is not "this thing is dangerously broken."

The harsh truth now is:

WTF TV finally has some discipline, but it still has not chosen between being a cool experimental art-broadcast machine and being a reliable media product.

Until it chooses, it will keep paying complexity tax in every layer.
