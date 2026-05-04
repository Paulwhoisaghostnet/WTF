## 2026-04-30 — Timeline and DM credit explosion from live-heavy design

**What happened**: The W microapp had almost no durable persistence for the two most expensive paths: timeline (`/api/w/timeline`) and DM/groupchat reads. Timeline was entirely in-process memory + client refetch every 60s. DM paths had good DB tables but many routes still preferred live X calls, with short in-memory caches that cleared on restart. Every reboot, tab switch, or refresh triggered full X API calls, rapidly burning credits (especially when the user was testing heavily).

**Why it mattered**: X Pay-Per-Use pricing makes every `/users/{id}/tweets` and `/dm_conversations/.../dm_events` call expensive. Without DB-first reads and longer cache TTLs, the app became a credit black hole. The "no posts on timeline" symptom was the direct result of the bearer token expiring after credit exhaustion.

**Fix**: 
- Added `x_timeline_posts` table with indexes for fast lookup by author and time.
- Made `/api/w/timeline` DB-first (`loadTimelineFromDb` before any live call), with automatic persist on successful live fetch.
- Increased DM/groupchat cache TTLs (fresh 10min, stale 4h for public mirror).
- Forced groupchat route to DB-only path for all users (public read-only mirror).
- Updated types, diagnostics, UI labels ("Cached for Credit Efficiency"), and added staleness indicators.
- Strengthened spam filtering (1-participant = ignore) and ensured per-user OAuth isolation.
- No changes to OAuth paths (only platform token for timeline/public groupchat, user tokens for private inboxes).

**Rule**: For any Pay-Per-Use API, default to DB-first reads with background writers. In-memory cache is only a hot layer on top of durable storage. Always expose cache age and rate-limit status to the user. Measure credit burn before adding polling or frequent refreshes. This pattern (DB cache + background sync + visible staleness) is the battle-tested way to keep social features affordable.

**Impact**: Timeline and groupchat now survive restarts and heavy use with near-zero incremental credit cost. DM inboxes remain private and user-scoped.

---

## 2026-05-02 — SmartPy FA2 layout and test fixture types matter

**What happened**: The WTF -> XTZ exchange initially used an FA2 transfer record without the exact FA2 Michelson layout, so `sp.contract(..., entrypoint="transfer")` failed against the SmartPy FA2-library dummy with `FA2_TRANSFER_ENTRYPOINT_MISSING`. The first test fixture also wrapped `sp.test_account` objects inside `sp.record`, which produced a SmartPy interpreter assertion during scenario calls.

**Why it mattered**: FA2 compatibility is not just field names; Michelson pair layout must match. A dummy token that is too loose can hide the exact failure mainnet users would see. Test fixtures should keep Python-side actors as Python objects, not on-chain record expressions.

**Fix**: The exchange transfer types now use the standard FA2 layouts `("to_", ("token_id", "amount"))` and `("from_", "txs")`. The dummy WTF token now uses the SmartPy FA2 library single-asset implementation. Test accounts are carried in a Python `SimpleNamespace`.

**Rule**: For SmartPy contract-to-contract calls, always declare external entrypoint parameter types with the target contract's exact layout and test against a standards-based counterparty. Keep scenario/test helper objects out of `sp.record` unless they are actual contract parameters.

---

## 2026-04-30 — W timeline: search ingest + ID rows + oEmbed (credit floor)

**What happened**: Even DB-first timeline still burned credits when every cache miss fanned out to `/users/{id}/tweets` for up to N handles.

**Fix**: Background job `w-timeline-search-ingest` uses a small number of `/tweets/search/recent` queries (`from:user OR …`, minimal `tweet.fields`, global `since_id` in `x_timeline_cursors`), persists tweet IDs into `x_timeline_posts`, and `/api/w/timeline` reads DB first and hydrates missing text via free `publish.twitter.com/oembed`. Legacy bearer fan-out remains behind `USE_LEGACY_TIMELINE_FANOUT`; `?source=search` forces the low-credit path only.

**Rule**: Prefer one batched search (or few chunked queries) over N per-user timeline calls; store IDs; serve text from oEmbed or prior full fetch. Cursor + TTL keep rows bounded.

---

## 2026-05-02 — Kiln must fail closed when runtime evidence is missing

**What happened**: Kiln's architecture was growing toward a full Tezos product-system rig, but several surfaces still looked more capable than they were: Etherlink testnet metadata pointed at the old Ghostnet-era rail, `/api/kiln/capabilities?networkId=...` returned the server default instead of the requested network, Shadowbox mock mode could produce a passing-looking result, and Tezos execute/E2E calls had no way to attach mutez for payable entrypoints.

**Why it mattered**: NFT marketplaces and token swaps fail at integration boundaries: payable XTZ calls, FA2 operator approvals, multi-contract address wiring, storage reads, indexer reads, and wallet/network mismatches. A green result from a structural simulator or stale network card would send builders into Shadownet or mainnet with false confidence.

**Fix**:
- Updated the sibling Kiln app's active Etherlink test rail to Etherlink Shadownet metadata and left old Ghostnet testnet as planned/legacy.
- Added `amountMutez` plumbing through execute and E2E APIs into Taquito `{ amount, mutez: true }` send options.
- Added browser-scoped `kiln.project.json` workspace modeling and a project file/graph panel without host filesystem access.
- Made Shadowbox mock mode fail closed and made the current single-contract runner reject unsupported multi-contract targets/assertions instead of pretending to test them.
- Made capabilities resolve the requested network and added explicit no-stub status fields.

**Rule**: A Tezos test rig feature is not "supported" until it executes in the relevant runtime and has automated evidence. Mock simulation can be useful as a lint-like signal, but it must never grant Shadowbox clearance or stand in for payable, multi-contract, storage, balance, big-map, wallet, or indexer behavior. Stale network metadata is a deploy blocker, not a cosmetic bug.

---

## 2026-05-02 — Same-origin assets must bypass Kiln's external CORS allowlist

**What happened**: Browser verification of the sibling Kiln app at `http://localhost:3001/#build` loaded only the HTML shell. The JavaScript and CSS asset requests returned HTTP 500 because Chrome sent `Origin: http://localhost:3001` on `crossorigin` module/script/style fetches, while Kiln's CORS middleware checked only `CORS_ORIGINS` and rejected localhost. The page body stayed empty, and the browser console reported strict MIME failures because Express returned HTML error pages for asset URLs.

**Why it mattered**: The no-stub rule applies to the tooling UI too. A contract builder cannot be considered browser-verified if the app shell silently fails before React hydrates. Same-origin requests are not cross-site exposure and should not be blocked by an external-origin allowlist.

**Fix**: The sibling Kiln app now allows an origin whose host exactly matches the request `Host` header before checking the configured external CORS allowlist. A server test covers `Origin: http://localhost:3001` with `Host: localhost:3001` while `CORS_ORIGINS` is set to a different production domain.

**Rule**: App-wide CORS middleware must never reject same-origin asset or API requests. If Vite emits `crossorigin` assets, test local and deployed pages with a real browser and check that `/assets/*.js` and `/assets/*.css` return their correct MIME types.

---

## 2026-05-02 — Observability failures must not bury the actual Kiln failure

**What happened**: While verifying Kiln locally, every browser request tried to append to `/var/log/kiln` and failed with `EACCES`. The repeated activity-log stack traces flooded the server output and made it harder to see the meaningful runtime failure.

**Why it mattered**: Kiln's job is to preserve evidence for contract compile, Shadowbox, Shadownet, wallet, and indexer failures. If the logger itself spams on every request, it damages the audit trail instead of helping it.

**Fix**: The sibling Kiln activity logger now reports only the first console error for each distinct write-failure path/code. A unit test forces an unwritable log path and verifies repeated writes do not spam the console.

**Rule**: Logging and telemetry paths must fail noisy once, then stay quiet unless the failure changes. For deployment tools, evidence capture cannot become the loudest failure in the room.

---

## 2026-05-03 — Deploy Kiln through the runtime that actually serves production

**What happened**: `kiln.wtfgameshow.app` is served by the native Hetzner/systemd path, not the Netlify rollback path. The public app stayed stale until the Kiln changes were committed to `origin/main` and the host script pulled, rebuilt, pruned, and restarted `kiln.service`. A side check of `npx netlify status` failed because the local npm cache has root-owned files, but Netlify was not the live serving path.

**Why it mattered**: A successful local build or a Netlify-oriented deploy check would not update the real public Kiln service. The only meaningful production proof here was the host deploy log plus public API/browser probes against `https://kiln.wtfgameshow.app`.

**Fix**: Commit `09ca113` was pushed to `origin/main`, `scripts/server-deploy.sh` was run on the Hetzner host, `kiln.service` passed health, and public verification confirmed Etherlink Shadownet metadata, requested-network capabilities, the new `index-D3yZ8s-r.js` frontend bundle, and the `Project workspace` UI.

**Rule**: Before declaring a deploy done, identify the actual serving path, deploy through that path, and verify from the public URL. Rollback paths are useful but do not count as production deployment evidence unless the DNS/service is actually using them.

---

## 2026-05-03 — Kiln API auth needs a reversible product-mode switch

**What happened**: Kiln's protected routes required an API token whenever `API_AUTH_TOKEN` was configured. That made sense as a default, but it also meant the public builder UI could be blocked by missing/inlined client token config while the product is still in open pre-product testing.

**Why it mattered**: The meaningful risk is not user wallet custody: connected-wallet users still approve every wallet operation themselves. The meaningful platform risk is server-side puppet wallet and runtime access: public callers can spend Bert/Ernie Shadownet funds, originate throwaway contracts, consume RPC/runtime resources, and hit Shadowbox/API rate limits.

**Fix**: The sibling Kiln app now has `KILN_API_AUTH_REQUIRED`. Leave it blank for legacy behavior, set `false` for open public builder mode while keeping `API_AUTH_TOKEN` configured, or set `true` to force token auth and fail closed if the token is missing. `/api/health` and `/api/kiln/capabilities` expose only auth mode/status, never the token.

**Rule**: Feature-gate public test infrastructure with explicit reversible modes. Do not delete secrets just to open access temporarily; keep a one-line rollback path and expose non-sensitive status so production can be verified from the outside.

---

## 2026-05-03 — Open Kiln mode needs public protected-route verification

**What happened**: After adding `KILN_API_AUTH_REQUIRED`, production still reported token mode until the Hetzner host env was explicitly changed and `kiln.service` was restarted. The desired public behavior also inverted the old security check: unauthenticated 401 was no longer proof of correctness once the user intentionally chose open Shadownet builder mode.

**Why it mattered**: In open mode, the risk model shifts from "is the API locked?" to "is public Shadownet puppet/runtime access intentional, visible, rate-limited, and reversible?" Health alone is not enough; a formerly protected route must be probed without a token to prove the runtime is actually open.

**Fix**: Production was set to `KILN_API_AUTH_REQUIRED=false` while keeping `API_AUTH_TOKEN` configured for rollback. Public verification confirmed `/api/health` reports `auth.required=false`, `auth.mode=open`, and `auth.tokenConfigured=true`; unauthenticated `/api/kiln/balances` returns HTTP 200 with Bert/Ernie Shadownet balances.

**Rule**: When changing auth posture, verify both the status endpoint and one real protected endpoint from the public URL. Record the rollback command/config path and update the bug board because the operational risk changes even when user wallet custody is unaffected.

---

## 2026-05-03 — TV uploads need a channel-scoped playback path, not raw library IDs or external-cache treatment

**What happened**: The TV stack blurred together three different concerns: private media-library file access, public channel playback, and the external HTTP cache/probe pipeline. Upload-backed media was stored behind internal `staging://` / object-storage state, then exposed through generic `/api/media/:id/file` ids or fed into helpers that only understand public HTTP/IPFS media. At the same time, the WTF auto-refresh path treated the canonical dial-03 creator channel as a platform-wide aggregate whenever config fell back to `all_users`.

**Why it mattered**: That mixup created privacy leakage, brittle upload playback, useless same-origin prefetch/probe work, and semantically hijacked a creator-owned channel into an "everything bucket". It also prevented the TV surface from cleanly using Hetzner object storage with the mounted volume as a hot cache, because uploads were not flowing through a context-aware storage-serving route.

**Fix**:
- Split private library access from public TV playback: `/api/media/:id/file` is now owner/staff-only, while public TV playback uses `/api/tv/channels/:channelId/media/:mediaItemId/file`.
- Route upload-backed TV playback through the shared storage resolver so object-storage objects are promoted into the hot-cache volume on demand.
- Rewrite TV stream, `/now`, and slug-current responses to emit channel-scoped same-origin playback URLs for upload-backed items.
- Require auth + dedicated rate limits for TV cache prefetch, and narrow the generic media rate-limit bypass to actual read-only playback routes.
- Force canonical dial 03 (`paulwhoisaghost` / `paulwhoisaghost-wtf-tv`) back to owner-scoped media unless config explicitly names users or wallets.

**Rule**: For upload-backed media, always separate private library file access from public playback. Same-origin stored media must go through a context-aware route backed by the storage resolver, and any cache/probe pipeline that assumes public HTTP should skip those files. Canonical owner channels also need explicit scope guards so a permissive `all_users` default cannot silently turn them into platform-wide aggregate feeds.

---

## 2026-05-03 — TV cache must use object storage as the warm tier and IPFS only as last resort

**What happened**: Even after upload-backed playback was fixed, the general TV cache still treated public IPFS/external fetch as canonical for token media. The attached volume acted as a hot cache, but if the file fell out of local cache the next miss went straight back to IPFS. Warm cache hits also did nothing to backfill object storage, so the system kept relearning the same media from the slowest source.

**Why it mattered**: That defeats the whole architecture. The point of the attached volume is low-latency serving, and the point of Hetzner object storage is a faster, persistent warm tier so the app can recover from local eviction or restart without begging public gateways again. If IPFS stays the primary delivery source, TV smoothness remains hostage to gateway luck.

**Fix**:
- Added deterministic TV cache object keys under `tv-cache/v1`.
- TV cache fills now mirror into object storage.
- Local cache misses now try object-storage promotion before any IPFS/external fetch.
- Warm-cache hits queue backfill so existing volume-resident media also gets mirrored.
- The serving model is now volume first, object storage second, IPFS/external host last.

**Rule**: For TV media, public IPFS/external URLs are ingest sources, not the delivery backbone. Always design the playback pipeline as hot local volume -> mirrored object storage -> external source of truth last. If a warm-hit path does not also backfill the object store, the architecture is incomplete.

---

## 2026-05-03 — Compose env interpolation can silently blank secret-backed runtime config during deploy

**What happened**: The server had valid object-storage secrets in `/etc/wtf/wtf.env`, but the deploy path recreated the app container with empty `S3_*` values anyway. Two things combined into the bug: the deploy user could not directly read the root-owned runtime env file, and `docker-compose.yml` redundantly set `S3_*`/`GDRIVE_REMOTE` in the `environment:` block with `${VAR:-}` defaults. Compose interpolated those before the protected runtime file was available, then the empty `environment:` entries overrode the real `env_file` values.

**Why it mattered**: The app stayed superficially healthy while losing object storage at runtime. For TV, that meant the new storage architecture silently collapsed back to slower external media fetches right after deploy, exactly when stability mattered most.

**Fix**:
- Removed empty-string overrides for `S3_*`, `GDRIVE_REMOTE`, and `RCLONE_CONFIG` from compose.
- Added `scripts/server-deploy.sh` to materialize a temporary readable copy of `/etc/wtf/wtf.env` for Compose and to source it for build/runtime interpolation.
- Moved production deploy to that script and removed `drizzle-kit push --force`.

**Rule**: Never duplicate secret-backed runtime variables in Compose `environment:` with empty defaults when those same keys come from an env file. If the real env file is root-protected, the deploy path must explicitly materialize or source a readable copy for Compose, or you will ship a “healthy” container with silently blank critical config.

---

## 2026-05-03 — Deploy metadata must come from the checked-out repo, not inherited host env

**What happened**: The first live run of `scripts/server-deploy.sh` built and restarted the correct checked-out code, but the app still reported `commitRef: "33350da"` after deploy because the script honored an inherited `COMMIT_SHA` from the host environment instead of forcing the current repo HEAD.

**Why it mattered**: That kind of mismatch poisons release verification. Operators think they are looking at one revision while the health endpoint reports another, which is how people lose hours chasing phantom “stale deploys” that are really stale metadata.

**Fix**:
- Changed `scripts/server-deploy.sh` to always set `COMMIT_SHA` from `git rev-parse --short HEAD` after checkout.
- Re-deployed and verified that `/api/health` now reports the real live commit.

**Rule**: Deploy labels must be derived from the exact checked-out revision being built, never from ambient host env. If a deploy script allows inherited commit metadata to win, your health endpoint becomes a liar.

---

## 2026-05-04 — TV resilience cannot live in the hidden route, and skip lists must actually drive scheduling

**What happened**: The canonical `/tv` route was still missing the item-end telemetry and skip-notice UX that existed in hidden `/tv2`. Worse, the experimental path's per-session skip list looked like hardening but was half fake: failures were counted, but queue advancement did not actually consult the skip list, so blacklisted clips could come right back on the next loop.

**Why it mattered**: That is the worst kind of patchwork: a safer path exists, the live path doesn't use it, and even the "better" path contains dead-state resilience that makes operators think the product is self-healing when it isn't. Viewers still sit through repeat failures, and telemetry understates how broken the loop really feels.

**Fix**:
- Backported skip-notice UX plus `/api/tv/telemetry/item-end` reporting into `client/src/pages/TV.tsx`.
- Patched both `TV.tsx` and `TV2.tsx` so queue advancement skips session-blacklisted items instead of only recording them.

**Rule**: Reliability logic is not real until the production route uses it and the scheduler actually honors it. A skip list that never influences next-item selection is theater, not resilience.

---

## 2026-05-04 — TV write-path integrity belongs in unique indexes and row locks, not polite preflight reads

**What happened**: The TV backend still trusted app-layer prechecks in two places that should have been database-enforced invariants: adding a channel video did a select-then-insert dedupe dance, and active playlist flips toggled peer rows without any per-channel lock or unique active constraint.

**Why it mattered**: Under concurrency, those patterns rot immediately. Two requests can both "see nothing" and then collide, or two playlist activations can interleave and leave split-brain active state. That kind of bug is extra nasty because it only shows up when the system is busy, which is exactly when TV has the least room for nonsense.

**Fix**:
- Reworked channel-video creation around insert-first upserts backed by the existing unique keys, with fallback reconciliation on alternate-key conflicts.
- Added a partial unique index for one active playlist per channel and wrapped active-playlist mutations in channel-row locks inside a transaction.

**Rule**: If a TV invariant matters to playback, put it in the database and serialize the write path around it. "Check first, then write" is not a concurrency strategy.

---

## 2026-05-04 — A rolling telemetry window must expire evidence inside hot buckets, not just delete cold buckets

**What happened**: TV playback telemetry tracked distinct error sessions in a plain `Set` per item and only pruned whole buckets when an item went fully cold. A video that kept receiving any traffic could retain hour-old error sessions forever, and a noisy client could also manufacture arbitrary item ids and session ids to grow those maps.

**Why it mattered**: The code called itself a rolling window, but it was lying. Memory could climb under churn, blacklisting could stay sticky for the wrong reasons, and the protection path itself became an availability risk.

**Fix**:
- Moved TV telemetry into a bounded helper store.
- Expire old error-session evidence inside each hot bucket on every read/write pass.
- Cap total tracked video/bumper buckets and distinct error sessions per item.
- Add a dedicated route-level rate limiter and unit tests for expiry/cap behavior.

**Rule**: Any “distinct sessions within N minutes” feature needs per-session timestamps plus cardinality caps. If old evidence only disappears when the entire parent record goes idle, the window is not rolling and the memory story is fiction.

---

## 2026-05-04 — Pagination is fake if the database still returns the full table

**What happened**: The TV channel/detail endpoints had no hard row caps. During hardening, the easy mistake was to add offset/limit semantics in the route response while still fetching the whole relation first and trimming it in Node.

**Why it mattered**: That preserves the same DB cost, the same server memory spike, and the same timeout risk while giving everyone a warm placebo called “pagination.”

**Fix**:
- Added bounded `limit`/`offset` handling to the TV channel list route.
- Added bounded video/playlist/playlist-item windows to TV channel detail.
- Pushed those bounds down into the actual SQL queries and surfaced pagination metadata so clients can page intentionally.

**Rule**: If a payload-size fix does not move the bound into SQL, it is not a real fix. Pagination must reduce rows read, rows serialized, and bytes returned, not just the final array shape.

---

## 2026-05-04 — Deterministic TV stream assembly belongs behind a revision-keyed snapshot cache

**What happened**: The TV `/stream` route was doing a full playlist-row load, bumper-pool load, seeded shuffle, telemetry blacklist filter, probe scheduling, and prefetch planning on every request even though most viewers hitting the same channel within the same shuffle window should see the same loop.

**Why it mattered**: That is wasted CPU, repeated DB work, and self-inflicted request amplification right on the hot read path. Worse, concurrent viewers all paid that rebuild cost separately because there was no in-flight coalescing.

**Fix**:
- Added a bounded stream snapshot cache with in-flight request sharing.
- Keyed cached snapshots by resolved playlist, shuffle window seed, revision aggregates from playlist/video/media/bumper state, and the current blacklist signature.
- Left auth, visibility, and schedule resolution live so correctness still comes from the database while the expensive deterministic assembly gets reused.

**Rule**: If a read path produces a deterministic queue from mostly stable inputs, treat that queue as a cacheable snapshot. Cache the expensive assembled artifact by revision and time window, and coalesce concurrent cache misses so N viewers do not trigger N identical rebuilds.

---

## 2026-05-04 — Appearance presets need real art direction, and cursor imports need license review

**What happened**: System Appearance shipped with a narrow set of mostly related muted color schemes, one intentionally loud Hotdog Stand preset, and a custom cursor default that felt unfinished. The cursor list also mixed simple built-in glyphs with a user request for weird online cursor packs, which would be tempting to satisfy by grabbing `.cur`/`.ani` files directly.

**Why it mattered**: Appearance controls are part of the product voice. If presets are barely differentiated, users do not get meaningful personalization. Cursor packs are also a supply-chain and rights surface: many funny or game-themed cursor packs claim permissive reuse while importing trademarked or third-party art, and browser cursor rendering usually needs conversion rather than raw Windows `.ani` files.

**Fix**: Expanded the desktop palette list into distinct, high-contrast presets while preserving existing scheme keys where users may already have settings. Changed the default cursor to the aubergine option, rebuilt the cartoon hand and paintbrush as local SVG glyphs with better hotspots, and kept third-party cursor candidates as an authorization list pending license review.

**Rule**: Treat appearance presets like designed product states, not minor tint variants. For cursors, prefer local SVG/PNG sprite assets with documented licenses; do not import meme/game cursor packs until the actual source art license is verified, even if the hosting page claims public-domain release.

---

## 2026-05-04 — TV playback must pin the airing item by identity, not by stale queue index

**What happened**: The TV player already stopped using wall-clock drift snap, but it still derived the on-screen item directly from `queue[clientQueueIdx]` on every stream refetch. When the server returned the same logical loop with a different interleaving or reordered slot, the playback effect reacted to the wrong item before the later cursor-sync effect could move the index back to the still-airing clip.

**Why it mattered**: That turned harmless stream refreshes into visible tears: a video or bumper could start loading, then get yanked to a different clip even though nothing had naturally ended. It also meant the code’s “if the current item disappears, let it finish” comment was a lie because render no longer had a stable copy of the current item once the queue changed underneath it.

**Fix**:
- Added a shared TV playback helper that resolves the active slot by pinned item key first and only falls back to the numeric queue index when the key still matches.
- Stored the last started playback item as a snapshot so the client can keep rendering it through a server-side queue drop instead of cutting away mid-play.
- Switched next-item and preload decisions to use the stabilized playback cursor, not the stale raw index.

**Rule**: In any client-driven playlist player, the currently airing item must be anchored by stable item identity, not by array position from a refetchable queue. Numeric indices are scheduling hints; the item key is the truth.

---

## 2026-05-04 — Hidden experimental routes must expire once the main path absorbs the fix

**What happened**: `TV2` started as a private scratch clone so playback changes could be tried without touching `/tv`, but after the useful resilience and scheduling work was backported, the clone still sat in the router as a hidden second implementation. That left two giant TV pages drifting in parallel even though only one should have mattered.

**Why it mattered**: Hidden clones rot quietly. Reliability fixes can land in one route and not the other, audits stay noisy because both paths remain "real enough" to worry about, and every future TV change pays a duplication tax for no user benefit.

**Fix**:
- Removed the hidden `/tv2` route from the app router.
- Deleted `client/src/pages/TV2.tsx` after the important behavior had already been consolidated into `TV.tsx`.
- Archived the old parity-only bounty item because the clone surface no longer exists.

**Rule**: Experimental clones need an exit condition on day one. Once the production route absorbs the useful behavior, delete the clone promptly instead of maintaining two truths.

---

## 2026-05-04 — Cursor personality needs shared state, not just more names in settings

**What happened**: The appearance cursor selector could list plenty of options, but interactive cursor concepts like a running horse, click-state Blang expression, and crosshair impact marks cannot be represented by a static glyph-only renderer.

**Why it mattered**: Without pointer direction, speed, and pressed-state plumbing, the new cursors would either feel dead or silently collapse into the old static fallback. User-supplied greenscreen art also needs to be converted into local transparent assets so the app does not depend on external image URLs or browser-specific cursor files.

**Fix**: Added cursor renderer state for direction, movement speed, click/press state, and temporary crosshair impacts. Generated local transparent Blang PNG assets from the supplied greenscreen images and wired the side-eye cursor to swap to the facepalm expression while pressed.

**Rule**: Treat animated/expressive cursors as miniature UI actors. Add the state and local assets they actually need, and verify the shared settings schema knows every new cursor key before exposing it in the selector.

---

## 2026-05-04 — Cursor refreshes must preserve approved weirdness before adding more weirdness

**What happened**: The cursor pass improved the option count but overwrote details the user already liked: the old emoji aubergine, the existing middle-finger behavior, and several accepted cursor choices got mixed together with less relevant options.

**Why it mattered**: Appearance settings are taste-sensitive. A cursor can be technically valid and still be a regression if it replaces a beloved, familiar version. The selector also needs curation: novelty options that are merely okay can make the whole set feel less WTF than fewer sharper choices.

**Fix**: Restored the old aubergine and middle-finger cursor behavior, removed Glitch Block and Rubber Stamp, kept the approved paintbrush, rainbow hitbox, and pizza cursors, and added the new pixel arrow, bow shot, improved horse, guinea pig, and ant as local handmade cursor art. Tezos cursors now use official logo geometry/assets instead of invented lettering.

**Rule**: Before changing personalization art, identify which existing options are approved and preserve them exactly unless the user asks otherwise. Add new cursors as curated additions, not broad replacements, and use source-faithful brand art for branded cursors.

---

## 2026-05-04 — Cursor click art needs a visible post-click hold

**What happened**: Blang's click expression was wired directly to the raw pointer-down state, so normal quick clicks flipped back on pointerup too fast to see. The rough horse cursor also needed to remain available as its own joke option instead of being silently replaced.

**Why it mattered**: Expressive cursors are judged by what users can actually perceive. A correct event handler is still broken UX if the alternate image only exists for a few milliseconds. Taste-sensitive options also need continuity: when a bad cursor becomes funny enough to keep, renaming it is safer than erasing it.

**Fix**: Added a short cursor `clickFlash` hold so click artwork can stay visible after pointerup, shrank oversized Blang and bow cursors, renamed the previous horse to `Horf`, and added a separate handmade pixel horse, hatchet, and arrow pass.

**Rule**: For cursor click-state art, hold the visual state briefly after pointerup. When preserving a disliked-but-accepted cursor as a joke option, move it under an explicit new key and keep the improved replacement separate.

---

## 2026-05-04 — Playback pinning must be scoped to the current channel, not just the current item key

**What happened**: The TV playback fix for reorder/refetch tears correctly pinned the airing item by identity, but it reused that pinned snapshot even after the user changed channels. Until the new stream payload arrived, render could keep showing `currentPlaybackItemRef.current` from the old channel, which made channel changes wait for the old clip to finish.

**Why it mattered**: This turned a correctness fix into a new UX lie. The player looked sluggish and broken even when the new feed was available fast, because the client was defending continuity across a boundary where continuity should not exist.

**Fix**: Added a channel-scoped playback resolver that only preserves pinned key and fallback item state when they still belong to the selected channel. Same-channel refetches still keep the airing item stable, but a real channel change now drops the old item immediately and waits for the new feed.

**Rule**: In playlist/video clients, sticky playback state must be keyed to both item identity and feed identity. Preserve continuity across queue churn inside one channel; never preserve it across a channel switch.

---

## 2026-05-04 — Tiny pixel animals need silhouette research before detail passes

**What happened**: The first "improved" horse cursor still read too much like a generic four-legged pet because it used blocky rectangles without enough horse-specific silhouette cues. The pixel arrow also got over-designed when the request was really for a simple chunky pointer.

**Why it mattered**: At cursor scale, anatomical detail collapses fast. Users read the outer silhouette first: long face, arched neck, withers, barrel, high tail, and long bent legs matter more than small internal shading. For simple UI primitives like an 8-bit arrow, extra decoration makes it less legible.

**Fix**: Redrew `Horse Runner` from photo, clipart, and pixel-sprite reference patterns with a longer muzzle, raised ears, arched neck, mane, barrel body, raised tail, and animated thin legs. Rebuilt `Pixel Arrow` as a chunky Minecraft-like pointer with a black outline, white fill, and minimal gray shadow.

**Rule**: For tiny animal cursor art, block the species silhouette first and only then add pixels. For basic cursor primitives, choose immediate readability over cleverness.

---

## 2026-05-04 — Tool cursors need the iconic working silhouette, not object-adjacent pixels

**What happened**: The handmade hatchet cursor used a broad flat metal shape and awkward handle angle, which made it read more like a broken shovel than a compact axe. Its click state only nudged rotation instead of feeling like a strike.

**Why it mattered**: Small tool cursors need the object-defining parts to be exaggerated: a short handle, visible axe eye, compact metal head, blade cheek, and poll. If the silhouette does not read immediately, extra shading makes the wrong object more convincing. Click animations also need a visible motion arc, not just a slightly different resting pose.

**Fix**: Rebuilt `Hatchet` with a top-heavy axe head, handle passing through the eye, metal cheek/blade highlights, and a small poll. Wrapped it in a click-triggered attack swing with an impact streak so it visibly chops during the existing click-flash window.

**Rule**: For tiny tool art, exaggerate the iconic working silhouette first. For attack cursors, animate the whole tool through a strike arc and use the existing post-click hold so the action is perceivable.

---
