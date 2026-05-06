## 2026-05-05 — Schema domain candidates need lower branches before barrel integration

**What happened**: Studio looked ready to integrate as a schema module, but it depended on `dmConversations` still owned by `shared/schema.ts`. Integrating Studio directly would have created a `schema.ts -> schema-studio.ts -> schema.ts` cycle.

**Why it mattered**: Large schema breakup is not just copying tables into files. Dependency direction decides whether agents can safely work in parallel, and a single barrel import inside a domain module turns the compatibility wrapper back into a hidden monolith.

**Fix**: Extracted `shared/schema-dm.ts` first, retargeted Studio to that lower branch, then integrated Studio, wallet/cockpit, analytics, recapture/operator, liveops, and session domains behind a 90-line `shared/schema.ts` barrel. Duplicate-owner, barrel-import, typecheck, and whitespace checks passed.

**Rule**: Before integrating a schema candidate, scan its imports for `./schema` or `@shared/schema`. If a candidate needs another branch still in the barrel, extract that lower branch first and only then re-export both through the compatibility barrel.

---

## 2026-05-05 — Tab extraction integration must audit wrapper-only leftovers

**What happened**: After the final Admin Studio and WTF.tez tabs moved into feature modules, the wrapper import cleanup removed `GroupBox` even though the wrapper Overview panel still used it. A parallel typecheck also surfaced a worker-created error display where an `unknown` mutation error was rendered directly.

**Why it mattered**: A tab module can be behavior-preserving and type-safe in isolation while the page wrapper still owns small shared UI pieces. Import cleanup and error rendering are integration concerns, so they need a wrapper scan after every batch of tab cuts.

**Fix**: Restored the wrapper-only `GroupBox` import, converted the WTF.tez mutation error to a string before rendering, and reran `npm run check -- --pretty false` plus `git diff --check`.

**Rule**: After batch-extracting tabs, scan the wrapper for remaining JSX component names and helper references before trimming imports. Never render an `unknown` mutation error directly; normalize it to a string or typed `Error` message first.

---

## 2026-05-05 — Shell extraction must keep layout constants tied to moved nav data

**What happened**: After extracting W's panels and reducing the nav to four active views, the shell grid still reserved five columns. Typecheck passed because this was a layout constant, but verifier review caught the stale empty slot.

**Why it mattered**: Monolith breakup often moves visible data and leaves small styling assumptions behind. Those stale constants make the extracted UI look half-moved even when behavior is intact.

**Rule**: When extracting shell/nav components, audit the paired layout constants with the moved data source. View counts, grid tracks, tab widths, and hard-coded slot counts must change in the same slice as the nav model.

---

## 2026-05-05 — Extracted hooks should preserve setter types exactly

**What happened**: During the TV queue-advance extraction, the new hook initially typed the active-bumper setter as `StateSetter<unknown>`. That looked harmless because the hook only writes `null`, but React setters are invariant enough that the real `Dispatch<SetStateAction<BumperPoolItem | null>>` could not be assigned to it.

**Why it mattered**: Mechanical hook moves can introduce type churn even when runtime behavior is unchanged. A loose generic setter type makes the extraction fail at the boundary instead of proving the moved logic is behavior-preserving.

**Rule**: When extracting React controller hooks, type state setters with the exact state shape owned by the caller. Avoid `unknown` or overly broad setter aliases for values that are wired through typed component state.

---

## 2026-05-05 — Feature-tab extraction types should avoid ambient JSX namespace assumptions

**What happened**: While extracting the Admin Round Library tab into its own module, the new prop type for the injected confirmation button used `JSX.Element`. The project typecheck failed because that module did not have the global `JSX` namespace available under the current TypeScript/react configuration.

**Why it mattered**: A behavior-preserving component move can still break the build if extracted modules depend on ambient types that are not consistently exposed. These are easy to miss when the JSX itself renders correctly but the type annotation is too specific to the old context.

**Fix**: Use an explicit React type import such as `ReactElement` for component-returning callback props in extracted tab modules.

**Rule**: When moving JSX into a feature module, prefer explicit React type imports for public prop signatures instead of relying on the ambient `JSX` namespace.

---

## 2026-05-05 — Cross-desktop toys need hidden ownership and real purchase caps

**What happened**: Desktop toys are visible and chaotic, but their ownership and routing cannot be treated as client-owned cosmetic state. A transferred ball also touches the in-app marketplace, so a "limit 3" rule enforced only by the care tray would be easy to bypass with direct API calls or chain-sync grants.

**Why it mattered**: Neighbor desktop travel only works if users see anonymous local visitors, while the server keeps the original owner and topology private. Marketplace-backed toys also become durable inventory, so caps must live on the server purchase/grant path as well as in the UI.

**Fix**: Added anonymous ball visitors to the server-owned desktop world, retained toy owner ids only inside server visitor records, and capped pet-ball cart creation, EXP checkout, and WTF sync grants at three owned balls. The client only receives local toy instructions and treats visitor balls as playable desktop objects without exposing their source user.

**Rule**: Any cross-user desktop object must carry hidden ownership server-side and expose only anonymous render data client-side. Any live game inventory cap must be enforced on every grant path, not just disabled in the purchasing UI.

---

## 2026-05-05 — Hidden shared-world simulations need server-owned topology and anonymous visitors

**What happened**: Turning desktops into connected map tiles could have leaked the hidden topology if the client knew neighbor ids, coordinates, or routing data. It also could have kept moving entities while nobody was watching, which would make the ambient desktop toys feel like mysterious background state drift.

**Why it mattered**: The feature only works if each user sees their own desktop as the whole visible world. Ants and runaway pets can cross boundaries, but the exact desktop-to-desktop mapping must remain server-side and interactions should happen only while at least one involved desktop is active.

**Fix**: Added a server-owned in-memory desktop world that hashes users into hidden tiles, accepts active-viewer heartbeats, and returns only anonymous visitor instructions with entry/exit edges. Ant traffic is issued only around active food sources and active neighbors; guinea pig escapes target only the closest active neighbor and otherwise fail into no movement.

**Rule**: For hidden topology systems, never send map coordinates, neighbor ids, or route graphs to the client. Clients should render anonymous local effects from server-issued visitor instructions, and the server should gate simulation work on active presence so offscreen/no-viewer state stays effectively frozen.

---

## 2026-05-04 — Desktop pet derived health must persist through existing JSON state

**What happened**: Adding sickness, poop exposure, medicine, and rest tracking to the hamster model would have been easy to lose on the next save because `desktop_pet_states` only has fixed stat columns plus `interaction_counts` JSON. Any route that wrote the old `interactionCounts` shape could silently drop the derived health fields.

**Why it mattered**: The care loop depends on state that is not just cosmetic: sickness risk must keep growing while the pet is dirty, medicine/rest progress must survive refetches, and death cleanup needs a consistent snapshot. If hidden state is only held client-side or only in a TypeScript object, it evaporates during normal persistence.

**Fix**: Store health metadata in reserved `interaction_counts` keys, normalize those keys back into `HamsterState`, and serialize them on every pet-state write. Server and MCP pet paths both need the same conversion layer so alternate control surfaces do not regress the pet model.

**Rule**: When expanding a persisted game/pet state without a schema migration, define explicit reserved JSON keys and update every persistence adapter in the same pass. Add round-trip tests for the new fields before wiring UI behaviors to them.

---

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

## 2026-05-05 — TzKT verification must normalize live parameter entrypoints

**What happened**: The in-app market router worked on-chain, but live TzKT transaction rows for the mainnet purchase exposed the called entrypoint as `parameter.entrypoint` while the row-level `entrypoint` field was null. The shared verifier only checked `row.entrypoint`, so a valid purchase could fail closed during inventory verification.

**Why it mattered**: Thin payment-router contracts deliberately move product policy off-chain. That makes the indexer verifier part of the security boundary. If its fixture shape drifts from live TzKT, users can pay successfully but the app cannot reliably grant inventory, and follow-on policy checks may never run.

**Rule**: For Tezos op-hash verification, always fixture against real TzKT rows and normalize entrypoints from both `row.entrypoint` and `row.parameter.entrypoint`. For public routers, test the full chain evidence path: router call, internal FA2 transfer, token/treasury match, linked wallet, and catalog/intent policy.

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

## 2026-05-04 — TV playback cannot have two authorities

**What happened**: The server still had enough information to answer “what should be airing right now?” with loop durations and offsets, but the main TV client ignored that and ran its own local queue cursor, buffer gate, and bumper-cover transitions. Once object storage and local cache made startup faster, those two models started racing each other in public: hidden video audio could begin under a bumper overlay, the client could step to a different item than the server thought was current, and every viewer effectively got a private playlist session instead of tuning into a channel.

**Why it mattered**: This was the deeper reason the TV felt like a cursed DVD player instead of a broadcast. Better storage did not fix it; faster media simply exposed the design mistake more clearly.

**Fix**: Restored a server-authoritative broadcast cursor and rotated queue, returned real `offsetSeconds` from the TV endpoints, sought the client into the current on-air item, refetched at natural boundaries, and stopped using local cover-bumper handoffs in the main playback path.

**Rule**: For live-channel products, pick exactly one playback authority. Either the server owns the feed position or the client does. Mixing a server “current item” model with a client-owned cursor and transition layer will produce race conditions, overlapping media, and broken mental models.

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

## 2026-05-04 — Axe heads need the handle-eye relationship to read correctly

**What happened**: The next hatchet pass still looked wrong because the head sat at the wrong angle to the shaft. Even with a better metal silhouette, the handle did not convincingly pass through the axe eye, so the head felt pasted onto the side instead of mounted around the handle.

**Why it mattered**: Real axe readability comes from construction: the shaft runs into the eye, while the blade/bit and poll/pick extend across that eye. References like classic fire axes and the Shining prop make that relationship obvious. At cursor size, if that geometry is wrong, the object reads as a shovel, hammer, or broken tool no matter how many highlights are added.

**Fix**: Redrew `Hatchet` again with a curved wooden handle entering a visible eye, a compact blade on one side, a poll/pick on the other, and a rest/swing transform that preserves the head-to-shaft construction.

**Rule**: For axes and hatchets, draw the handle-eye-head assembly first. Blade detail, shading, and swing effects come after the handle visibly passes through the head at the correct angle.

---

## 2026-05-04 — Match the supplied cursor reference before adding realism

**What happened**: The hatchet iterations kept chasing a more realistic axe when the correct target was a tiny pixel-art hatchet reference: a simple gray wedge head, black outline, and short brown diagonal handle.

**Why it mattered**: When the user supplies the exact target image, visual fidelity to that reference beats anatomical plausibility. A small cursor should preserve the reference's scale, pixelation, and simple shapes rather than becoming a better-rendered but different object.

**Fix**: Replaced the rendered axe with a compact 42px pixel-art hatchet matching the supplied reference: chunky gray head, tiny eye block, brown handle, and minimal strike streaks during the click swing.

**Rule**: For reference-led cursor art, copy the reference's silhouette and pixel language first. Do not upscale the idea into a different art style unless the user asks for that.

---

## 2026-05-04 — TV title cards need one metadata authority and viewer-timed visibility

**What happened**: The TV overlay pipeline was lying in two places at once. On the data side, `server/routes/tv.ts` treated `metadata.creators[0]` as a display name even when it was only a Tezos address, and imported library tokens could later lose their raw metadata entirely when added to a channel by `mediaItemId`. On the UI side, `client/src/pages/TV.tsx` decided overlay visibility from asset-relative timing, so joining a channel mid-broadcast could suppress the title card immediately even though the viewer had only just started watching.

**Why it mattered**: That is how you get raw wallet strings on-screen, missing credit bars, and upload rows that cannot explain who made the work. It also breaks the intended TV illusion: a title card should feel tied to what the viewer is seeing right now, not to whether the asset happened to start five seconds ago on some server clock.

**Fix**: Added `server/lib/tv-overlay-metadata.ts` as the single resolver for creator/collection/mint/title-card metadata, with support for address-label fallback, upload overrides under `metadata.wtfTvOverlay`, uploader-credit fallback, and Objkt URLs for token-backed items. Persisted token raw metadata during media import, propagated upload metadata edits into linked `tv_channel_videos`, and changed the TV overlay to show on viewer-start plus viewer-end instead of trusting only the asset playhead.

**Rule**: TV overlays must derive from one normalized metadata resolver, not ad hoc JSON field grabs in multiple routes. Raw creator addresses are not display names. Broadcast TV also needs viewer-timed overlay windows: use the moment the art actually becomes visible to the viewer for the opening card, and the asset tail for the closing card.

---

## 2026-05-04 — Pet-state tests must pin simulated dates

**What happened**: The new hamster scooper test built a snapshot with an old `lastCareDate` but did not pass a fixture `now` into `deriveHamsterSnapshot`. The test ran against the real current date, so normal missed-care decay changed the state before the scooper assertion.

**Why it mattered**: Desktop pet behavior intentionally depends on elapsed days. Tests that rely on default wall-clock time can fail later, or worse, assert against a death/decay path when they meant to cover a care action.

**Fix**: Pinned the snapshot and action to the same explicit fixture date before asserting hygiene and care-point changes.

**Rule**: Any hamster/pet test that includes `lastCareDate`, missed-care decay, streaks, or care actions must pass an explicit `Date` into both snapshot derivation and action application.

---

## 2026-05-04 — Pixel pet sprites need a real sprite language, not CSS blobs

**What happened**: The first wandering desktop hamster was built from rounded CSS shapes. It moved and recolored correctly, but the silhouette read like a generic green blob instead of a small pixel pet.

**Why it mattered**: At desktop-icon scale, shape language beats clever implementation. A believable pet needs a readable side-view body, head patch, snout, ears, paws, outline weight, and animation cadence before the color system matters.

**Fix**: Replaced the blob actor and settings preview with a reusable pixel SVG sprite modeled after the supplied guinea-pig sprite sheet. The new sprite keeps generative coat colors through CSS variables while using sheet-like body mass, face patches, ears, feet, and walk/idle animation.

**Rule**: For pixel desktop pets, start with the source sprite silhouette and animation vocabulary. Keep procedural recoloring in a second layer so themes vary without destroying the species read.

---

## 2026-05-04 — MCP agent access needs its own auth boundary and feature gates

**What happened**: Adding a remote MCP layer to WTF could have turned browser-session APIs into a broad agent surface. The risky parts were easy to blur together: user-owned settings writes, desktop pet care, public blockchain-derived database reads, public trade-board workflows, admin-disabled sub apps, and on-chain listing actions that still require wallet signatures.

**Why it mattered**: Agents need enough power to help users, but they are not browser sessions. If MCP tools reuse cookie auth, expose private rows, ignore admin app toggles, or fabricate marketplace rows without a verified wallet operation hash, the feature becomes an account-control and data-boundary problem instead of a helpful integration.

**Fix**:
- Added one-time-visible MCP pairing tokens stored only as SHA-256 hashes.
- Mounted a rate-limited Streamable HTTP `/mcp` endpoint authenticated by `Authorization: Bearer wtf_mcp_...`.
- Added tool-level checks against the same desktop-app config the admin control panel changes.
- Kept public data tools scoped to Objkt/TzKT/IPFS/on-chain-derived rows.
- Made listing support a safe workflow/preparation tool unless the normal wallet-signed operation hash exists.

**Rule**: Remote MCP surfaces need a separate pairing-token boundary, per-agent rate limits, and feature-gate checks inside every tool, not just in the browser UI. Treat blockchain/IPFS/indexer-derived rows as public, but keep user-private rows and wallet-signature requirements explicit. Agents can prepare or record verified on-chain workflows; they must not invent marketplace state that the wallet and TzKT have not proven.

---

## 2026-05-04 — Ant colonies need shared origin state before pathfinding cleverness

**What happened**: Desktop ants spawned with a fresh random edge point and an immediate food target per ant. The pathfinding worked, but the swarm read like unrelated one-off insects teleporting in from every side instead of a colony exploring, discovering food, and carrying it home.

**Why it mattered**: Simulation believability comes from the lifecycle contract, not only movement. A colony system needs a stable home, scouts that explore without omniscient food knowledge, and foragers that return to the same off-screen origin after harvesting.

**Fix**: Added shared colony state for the desktop ant loop, introduced an `exploring` phase, spawned scouts from jittered entrances around the same off-screen colony, and made ants switch to food-seeking only after sensing nearby food or pheromone trails.

**Rule**: For desktop colony simulations, establish the shared home/origin first. Spawn, exploration, pheromones, and return paths should all reference that colony; do not assign each actor a new private edge origin unless the design explicitly calls for independent wanderers.

---

## 2026-05-04 — TV creator tools need intent-preserving actions, not cascade-shaped wording

**What happened**: The TV creator UI and the standalone My Videos library both leaned on the same cascade model, so routine actions were expressed as blunt deletes. Playlist editing only targeted the active playlist, media management mostly offered “delete the library item,” and community bumpers could only leave the public pool by deleting the clip outright.

**Why it mattered**: Users do not think in foreign keys. “Remove this from channel 03,” “take this bumper out of the community pool,” and “delete this file from my library” are different intents with different consequences. When the UI collapses them into one destructive action, people either hesitate or make the wrong change.

**Fix**:
- Added a channel-scoped detach route for library-backed media.
- Added a bumper update route so owners can move a bumper between personal and community without deleting it.
- Reworked the playlist editor to target a selected playlist directly and support add/remove/reorder instead of only editing whichever playlist is active.
- Surfaced channel-attachment management in both TV’s My Media screen and the standalone My Videos app.

**Rule**: If the data model has layered relationships, the UI must expose layered actions. Never force a destructive root delete when the user’s real intent is to detach, unshare, or reorder one layer of the graph.

---

## 2026-05-05 — In-app purchases need contract-anchored chain evidence before inventory grants

**What happened**: A WTF in-app item market could easily have been implemented as a UI payment intent or a raw "treasury received some WTF" watcher. That would miss listing context, exact quantity, sender linkage, and replay protection.

**Why it mattered**: Platform-only inventory is still value-bearing. If the app grants food, medicine, or cosmetics from an unverified client claim, an unrelated treasury transfer, or an indexer row without the matching purchase call, users can get inventory without paying the configured listing price or can replay an old transfer.

**Fix**: The market contract now records listing IDs and pulls exact WTF FA2 amounts directly from the buyer to the gameshow treasury. The app grants inventory only after TzKT shows an applied `purchase` call to the configured contract and the exact matching WTF transfer to the treasury, with unique TzKT transfer IDs and idempotent inventory updates.

**Rule**: Never grant in-app inventory from wallet intent alone. Require an on-chain contract call that names the listing plus an exact WTF transfer from the same linked buyer wallet to the configured treasury, and make the grant idempotent on an indexer-stable transfer ID.

---

## 2026-05-05 — Simple Tezos payment routers must stay simple and compile compact

**What happened**: The first in-app market contract tried to make the chain own too much product state: listings, purchase records, admin rotation, views, events, and counters. SmartPy expanded that into an annotated 897 KB Michelson artifact, which tripped Kiln Shadowbox's 200 KB source limit for a contract whose real job was just "send WTF to the gameshow wallet with item context."

**Why it mattered**: Oversized contracts are not only expensive; they break tooling before they reach chain testing. For this flow, on-chain storage did not make item delivery safer because the server still must verify the actual WTF transfer and grant platform inventory off-chain.

**Fix**: Replaced the registry-style contract with a tiny payment router: `purchase(listing_id, amount_wtf_units, purchase_ref)` pulls WTF from the buyer to the treasury. Catalog prices and inventory grants remain in the app database, and generated SmartPy `.tz` artifacts are compacted before Kiln upload. The compiled router is about 1 KB.

**Rule**: For platform-only in-app purchases, keep Tezos contracts to payment authorization and immutable routing. Put mutable catalog/product behavior in the app, verify chain evidence before grants, and always check compacted Michelson size before calling a contract "Kiln-ready."

---

## 2026-05-05 — Batched in-app purchases need durable cart receipts, not single-row transfer assumptions

**What happened**: The initial in-app market verifier treated one Tezos transfer as one purchase row keyed by a unique `tzkt_transfer_id`. That matched single-item buys but contradicted the cart requirement where one router transaction can pay for pet food, medicine, and a shoebox together.

**Why it mattered**: A batched payment has one chain transfer but multiple inventory grants. If the database uniqueness model only allows one row per transfer, later cart lines are either lost or hidden inside an opaque raw payload. EXP checkout also has no TzKT transfer at all, so forcing every purchase through chain-only identifiers would create fake evidence.

**Fix**: Add durable payment intents keyed by `purchase_ref`, store the cart lines before wallet payment, verify WTF totals against that intent, and grant one purchase/inventory row per line using `(tzkt_transfer_id, sku)` for WTF idempotency. EXP checkout deducts points atomically and stores non-chain purchase rows without fake operation hashes.

**Rule**: Whenever a payment can cover multiple in-app items, separate the payment receipt from the grant rows. Chain evidence proves the total payment; the signed-in app intent explains how that total fans out into inventory.

---

## 2026-05-05 — Reserve payment sentinel IDs before seeding product listings

**What happened**: The first in-app market seed used `contract_listing_id = 0` for pet food. The cart checkout then correctly needed `listing_id = 0` as a router sentinel for “this payment is a cart; resolve item lines from `purchase_ref`.”

**Why it mattered**: Sentinel collisions make verification ambiguous. A value cannot safely mean both “pet food listing” and “batched cart payment,” especially when future tooling may inspect listing ids without knowing the checkout mode.

**Fix**: Keep `0` reserved for cart router payments and seed concrete marketplace items with positive listing ids. The migration now normalizes food/medicine/shoebox to `1/2/3` while the UI sends `0` only for WTF cart checkout intents.

**Rule**: Before adding sentinels or reserved IDs to a payment protocol, audit and update seed data. Real catalog records should use positive, non-reserved identifiers unless the contract explicitly defines otherwise.

---

## 2026-05-05 — Pet emotion loops need persisted scoring, not client vibes

**What happened**: Adding bond, happiness indexing, home-return behavior, and trauma could have slipped into the desktop animation layer only. That would make the pet look reactive for one browser session while MCP care tools, server snapshots, and future breeding/racing systems saw none of the emotional progression.

**Why it mattered**: Bond and trauma are gameplay state, not decoration. They affect future pet value, recovery difficulty, and defensive behavior, so they must survive refreshes and alternate care surfaces while remaining compact enough to fit the existing pet-state storage.

**Fix**: Store bond XP, happiness index samples, trauma, and recovery metadata in reserved `interaction_counts` keys, normalize them through both browser routes and MCP routes, and keep the desktop animation as a projection of the persisted state.

**Rule**: Any pet progression stat that can affect future mechanics must round-trip through the canonical server pet state before it drives UI behavior. Client motion may be local, but scoring, recovery, and progression counters must persist through every adapter.

---

## 2026-05-05 — Ambient desktop requests need an explicit behavior matrix

**What happened**: The pet/toy pass covered the big shared-world and toy mechanics, but two smaller ambient behaviors were easy to miss: a BRB signpost when a pet leaves home and a hungry pet reacting to food smells from a neighbor desktop.

**Why it mattered**: For simulation features, the small visible affordances are part of the contract. Without the signpost, walkabout looks like disappearance. Without an anonymous food-scent signal, neighbor food affects ants but not hungry pets, breaking the intended desktop-world ecology.

**Fix**: Added a server-issued, identity-safe neighbor food smell signal, client-side border sniff/scratch behavior that scales with hunger, and a temporary BRB signpost while pets are away.

**Rule**: When implementing ambient simulation requests, turn the user’s prose into a checklist of visible behaviors, server signals, privacy constraints, and tests before calling the pass complete.

---

## 2026-05-05 — Render-budget item caps must count account-owned active inventory

**What happened**: The pet ball limit was treated too much like a cart or current-desktop placement cap, which left ambiguity around repeat purchases and balls that temporarily leave the desktop through tunnels.

**Why it mattered**: This cap protects rendering and physics load. If enforcement only watches the current cart or visible local actors, users can exceed the account budget through repeated checkout/grant cycles or by freeing visible slots while owned balls are still active elsewhere.

**Fix**: Centralized the pet-ball cap decision, enforced it against account-owned inventory in both EXP and WTF grant paths with transaction advisory locking, and reserved escaped ball slots on the desktop while local-owned balls are away.

**Rule**: Any inventory cap meant to protect performance or economy must be enforced at account grant time and mirrored in active-object slot accounting, including objects temporarily offscreen or in neighboring map spaces.

---

## 2026-05-05 — Stale branch merges must not resurrect old risks

**What happened**: Merging older side branches into current `main` produced conflicts where branch hunks predated newer W/DM credit hardening and attempted to re-add legacy auth dependency metadata that the bounty board already tracks as risky.

**Why it mattered**: A merge can be green by Git ancestry but still regress production if conflict resolution blindly accepts stale code, outdated package locks, or known vulnerable dependency paths.

**Fix**: Resolved patch-equivalent W conflicts in favor of current `main`, combined only the still-relevant ecosystem additions, skipped the known `passport-twitter`/`xmldom` reintroduction, regenerated `package-lock.json` from the resolved manifest, and verified with typecheck, focused branch tests, and production build.

**Rule**: When merging stale branches, use `git cherry`/diff context plus the bounty board before choosing conflict sides. Preserve current production hardening over older equivalent hunks, never reintroduce a documented risky dependency from an old branch, and regenerate lockfiles from the final intended manifest.

---

## 2026-05-05 — Domain extraction must move the data boundary, not just the code block

**What happened**: The W timeline route looked ready for a clean service extraction, but its real scalability bug lived one layer lower: it queried every Twitter-linked user, normalized and deduped them in memory, and only then applied the configured account cap.

**Why it mattered**: Moving that route code into a feature module without changing the query would have made the architecture look more modular while preserving the same unbounded request cost. A background worker sharing the old helper would also keep drifting from the HTTP route's real membership rules.

**Fix**: Added a bounded, ordered SQL author-window reader shared by `/api/w/timeline` and the timeline search worker, then extracted DB-cache timeline payload assembly into `server/features/w/timeline.ts` behind the existing route.

**Rule**: When modularizing a hot route, identify the actual resource boundary first. Apply limits, ordering, dedupe, and cache keys at the database/service boundary before extracting wrapper code, and make background workers reuse the same bounded helper.

---

## 2026-05-05 — Refactor plans are not refactor deliverables

**What happened**: The first modular architecture pass produced a useful plan and one narrow W timeline extraction, but it left the largest client/server ownership blocks mostly intact. That made the output read like architectural paperwork instead of visible repo surgery.

**Why it mattered**: A monolith breakup request needs changed module boundaries in the tree: wrappers should shrink, feature modules should own behavior, and the line-count/ownership picture should visibly improve. A plan is only valuable if it is followed by enough extracted code for the next engineer to build on immediately.

**Fix**: Followed through with additional extractions: moved the client OS page registry out of `App.tsx` into `client/src/routes/page-defs.ts`, and moved W link preview, Objkt/TzKT preview lookup, SSRF-safe URL normalization, bounded HTML reads, and timeline preview enrichment into `server/features/w/link-preview.ts`.

**Rule**: For architecture refactor tasks, ship at least one structural module extraction per major concern touched before calling the pass useful. Update the plan checkboxes as code moves, and verify the wrapper file now owns less than it did at the start.

---

## 2026-05-05 — Desktop actor extraction should leave the OS shell as a caller

**What happened**: `Desktop.tsx` was acting as both the simulated OS shell and the owner of independent desktop actors such as custom cursors and Sunday grass. Those actors had their own storage, timing, pointer tracking, glyph rendering, and positioning rules, but they still lived inside the highest-conflict shell file.

**Why it mattered**: A modular desktop architecture needs the shell to orchestrate windows and surfaces, not own every actor implementation. Leaving actor code inline makes harmless visual or simulation changes risky because they require editing the same large file that owns window routing, icon layout, settings, and pet state.

**Fix**: Moved custom cursor behavior into `client/src/features/desktop/CustomCursor.tsx`, Sunday grass behavior into `client/src/features/desktop/SundayGrass.tsx`, and shared clamp/seed helpers into `client/src/features/desktop/geometry.ts`, while keeping the shell render calls and persisted keys stable.

**Rule**: When splitting the desktop OS, extract self-contained actors into feature modules first and leave `Desktop.tsx` as the caller. Preserve storage keys and public props during the move so line-count reduction does not become behavior drift.

---

## 2026-05-05 — First-level extraction can expose the next monolith

**What happened**: Moving desktop cursor, Sunday grass, icons, physics, and pet behavior out of `Desktop.tsx` finally turned the desktop shell back into a small orchestrator. But the pet extraction created a new, clearer second-level monolith: one feature module now owns care tray UI, in-app market checkout, pet state, toys, drops, ant trails, and shared-world traffic.

**Why it mattered**: A good strangler refactor does not pretend the first moved file is the final boundary. The first split should make the next bad boundary easier to see, then the bounty board and plan need to capture that follow-up before it gets lost.

**Fix**: Extracted the desktop shell concerns into `client/src/features/desktop/*`, reduced `Desktop.tsx` to shell orchestration, and added `WTF-BB-099` to track the remaining `DesktopPet.tsx` second-level split.

**Rule**: After each large feature extraction, re-audit the new module sizes. If the extracted module is still too broad, add a follow-up bounty immediately with the next intended ownership seams and verification target.

---

## 2026-05-05 — Deployed payment contracts need runtime and build-time defaults

**What happened**: The in-app market contract address was initially documented as an env value, but the client purchase path depends on a Vite build-time variable while the server verifier depends on runtime process env. A production rebuild without matching host env would still leave purchases disabled or verification unconfigured.

**Why it mattered**: Payment routers are not passive docs. If the wallet approval target and the chain verifier do not resolve the same deployed contract address, users can approve or submit purchases that the app cannot grant from.

**Fix**: Added the deployed in-app market KT1 as the shared default, kept env overrides for future migrations, and updated local/example env plus the market handoff doc.

**Rule**: For deployed contract addresses that power production checkout, wire a shared app default and env override together, then verify both the compiled client bundle and server bundle contain the intended KT1.

---

## 2026-05-05 — Second-level feature splits need shared model files before render moves

**What happened**: Splitting `DesktopPet.tsx` into care tray, actor, model, storage, and API type modules exposed one moved simulation type (`AntColonySide`) that the main component still needed after the first extraction.

**Why it mattered**: Presentational extraction is only low-risk when constants, DTOs, and actor model types have a stable shared home. Otherwise the old component and new leaf modules can silently depend on types that were removed from the original scope.

**Fix**: Added `DesktopPetModel.ts`, `DesktopPetTypes.ts`, and `DesktopPetStorage.ts` as explicit shared boundaries, then let `npm run check` catch and verify the missing import before running the full build.

**Rule**: In second-level monolith splits, move shared constants/types/storage normalization into tiny model modules first, then extract render components and hooks against those model files. Always typecheck immediately after the first import-boundary cut.

---

## 2026-05-05 — Extract pure simulation helpers before live animation loops

**What happened**: `DesktopPet.tsx` still mixed three different things after the first split: pure target/routing/spawn helpers, market checkout state, and live animation effects. Moving the live loops first would have required threading many refs and mutable state through a new hook in one risky jump.

**Why it mattered**: The desktop pet is an ambient simulation. Small mistakes in requestAnimationFrame loops, world heartbeat timing, or ref ownership can create subtle behavior drift that typecheck will not fully catch.

**Fix**: Pulled the pure simulation helpers into `DesktopPetSimulation.ts`, checkout/cart state into `useDesktopPetMarket.ts`, and styled stage actors into `DesktopPetWorldActors.tsx` before attempting any live-loop extraction.

**Rule**: For animation-heavy monoliths, extract pure helpers, presentational actors, and isolated state hooks first. Only move requestAnimationFrame or heartbeat loops once their dependencies are already named module boundaries.

---

## 2026-05-05 — Domain extraction means owning the model, not just the hook

**What happened**: The first ant-loop extraction moved the requestAnimationFrame effect into a hook but left ant types, constants, pathing helpers, spawn helpers, and render actors scattered across the generic desktop pet files.

**Why it mattered**: That would have reduced `DesktopPet.tsx` line count without creating a real domain boundary. Future ant changes would still require edits across the pet model, pet simulation, world actors, and the hook.

**Fix**: Reworked the split into `client/src/features/desktop/ants/*`, with ant model/types, pheromone actors, route/pathfinding, desktop/world spawn helpers, pheromone aging, and the ant simulation loop owned by the ant domain. `DesktopPet.tsx` now wires shared refs/state and handles cross-domain events like trashing food or defensive swats.

**Rule**: When extracting a subdomain, move the model, constants, pure helpers, render actors, and runtime loop together when they change for the same reason. A hook alone is not a domain boundary if the rest of the behavior remains scattered.

---

## 2026-05-05 — Fast domain splits need a touched-file ledger and verifier trail

**What happened**: The desktop pet refactor needed speed more than perfect local certainty. Stopping to prove every browser path after each cut slowed the work, while the actual goal was to make parallel domain work possible by separating ownership boundaries.

**Why it mattered**: Multi-agent refactors need clear write scopes first. Once ants, toys, drops, world travel, and pet movement are in separate files, later auditors can test and fix each domain independently without fighting over one monolithic component.

**Fix**: Continued the structural cuts, moved the toy domain into `client/src/features/desktop/toys/*`, kept `npm run check` as the fast sanity gate, and used verifier subagents to trail the main restructure for stale imports and duplicate ownership.

**Rule**: During architecture breakup passes, prioritize clean domain ownership and a concrete touched-file ledger. Use fast type checks and trailing verification agents, then schedule deeper behavior audits after the monolith is split enough for agents to work in parallel.

---

## 2026-05-05 — Payment-router verification needs live-shaped op fixtures and active catalog policy

**What happened**: The in-app market server verifier trusted two assumptions that were not proven by tests: TzKT entrypoints would always appear on the row-level `entrypoint` field, and direct listing fallback could reuse catalog rows without checking whether they were still active.

**Why it mattered**: The on-chain router is intentionally tiny, so server verification is where product policy lives. If the verifier misses a valid purchase shape, paid users do not get inventory. If it accepts inactive rows, direct contract calls can bypass the cart/intent path after old listings are retired.

**Fix**: Normalized TzKT entrypoints from both row-level and `parameter.entrypoint` shapes, added a live-shaped regression fixture, and routed direct-listing fallback through an active-item selector that blocks inactive contract-specific rows from falling through to generic listings.

**Rule**: Every Tezos payment-router verifier needs tests for the live indexer row shape and for catalog lifecycle policy. Direct chain-call fallbacks must reject inactive or retired catalog entries unless a valid, unexpired payment intent explicitly authorizes the purchase.

---

## 2026-05-05 — Live-loop monoliths need behavior hooks with explicit ref contracts

**What happened**: The desktop pet component could not become a real orchestration module while it still owned the care pursuit, scent-following, escape trigger, defensive swat, sickness exposure, sleep, and digestion requestAnimationFrame loop inline. Moving only the world API calls still left escape behavior split between the gateway and the component.

**Why it mattered**: Animation loops are where domain boundaries get blurry because they touch almost every mutable ref. If that loop stays in the shell component, future agents still have to edit the same file for pet movement, world travel, toys, ants, drops, and health side effects.

**Fix**: Extracted `useDesktopPetLocomotion` under `client/src/features/desktop/pet/*` with an explicit ref/state contract, after the ant, toy, drop, world, and persistence domains already existed. `DesktopPet.tsx` now wires the hook instead of owning the loop, and `npm run check` verified the import/type boundary.

**Rule**: For live simulation refactors, move the surrounding domains first, then extract the loop as a hook with a clear argument surface. Treat the hook signature as the ownership map for follow-up audits.

---

## 2026-05-05 — TV needs compatibility wrappers before service rewrites

**What happened**: The TV route and TV page were still too large for parallel work, but jumping straight into stream/cache/creator-console behavior would have bundled route auth, playback scheduling, media storage, and UI state changes in one risky move.

**Why it mattered**: TV has many production-sensitive behaviors: playback continuity, cache warm paths, upload playback, bumper cadence, schedule windows, and creator management. A modularity pass should create ownership boundaries without changing those behaviors until focused agents can audit each domain.

**Fix**: Left `server/routes/tv.ts` and `client/src/pages/TV.tsx` as compatibility wrappers, then moved low-risk, already-clustered helpers into `server/features/tv/*` and `client/src/features/tv/*`: pagination, daypart policy, bumper upload policy, DTO/view types, pure helpers, telemetry, and CRT static rendering.

**Rule**: For very large route/page refactors, extract pure policy, DTOs, helper functions, and isolated visual components first. Keep public route paths, auth gates, query keys, and page exports stable until the feature modules have enough shape for deeper service cuts.

---

## 2026-05-05 — TV media URL policy belongs with cache fetch policy

**What happened**: The TV router still owned IPFS gateway ordering, media URL allowlisting, same-origin playback bypasses, redirect guards, content-type checks, and gateway fallback fetch logic inline. That made cache/prefetch/playback hardening look like route code instead of a focused media-fetch policy.

**Why it mattered**: TV media fetches are security- and reliability-sensitive: they decide which remote hosts are allowed, how redirects are handled, when same-origin playback skips cache wrapping, and how IPFS gateways fail over. Keeping that in the huge router makes future SSRF/cache/playback fixes harder to audit.

**Fix**: Moved TV media URL normalization, IPFS gateway fallback, redirect guarding, content-type policy, same-origin cache URL resolution, and fetch-with-timeout helpers into `server/features/tv/media-urls.ts`, leaving `server/routes/tv.ts` as the compatibility caller.

**Rule**: When extracting TV cache code, keep URL policy and fetch policy together. A route should call the policy module; it should not own allowlists, gateway ordering, redirect safety, and fallback loops inline.

---

## 2026-05-05 — Channel ownership helpers should be their own TV contract

**What happened**: TV channel editability, staff checks, public/private viewing, slug allocation, dial allocation, duplicate-video recovery, and playlist row locking were all inline in the giant TV router. That meant route edits for playlists, schedules, bumpers, and stream reads all had to share ownership of channel policy details.

**Why it mattered**: Parallel TV work needs a stable channel contract. If every domain reimplements or edits channel gating directly, route-path compatibility can survive typecheck while access-control or duplicate-recovery behavior drifts.

**Fix**: Moved channel policy helpers into `server/features/tv/channel-service.ts` and left `server/routes/tv.ts` as a caller.

**Rule**: New TV server code that needs channel edit/view/staff/slug/dial/row-lock behavior must import the channel service. Do not recreate those helpers inside route handlers or feature-specific services.

---

## 2026-05-05 — Cache file identity is its own TV domain

**What happened**: TV cache paths, cache-key hashing, transcode sidecar names, max-size/TTL constants, cache metadata types, and cache log helpers lived directly beside the HTTP streaming route. That made a file-key change look like a route change and kept cache agents from owning the disk contract.

**Why it mattered**: The cache file contract is shared by streaming, prefetch, warming, eviction, transcode, object-store mirroring, and boot rekeying. If those helpers stay inline, every cache-related agent still has to edit the route monolith.

**Fix**: Moved cache/transcode config, cache-key/path helpers, cache metadata types, and cache telemetry helpers into `server/features/tv/cache-files.ts`.

**Rule**: Any code that reads or writes TV cache files must import cache paths, keying, metadata types, and cache log helpers from the cache-files module. Do not recompute cache filenames or transcode sidecar names inside route handlers.

---

## 2026-05-05 — Extracted code must leave no stale route-owned twin behind

**What happened**: The TV transcode worker was copied into `server/features/tv/transcode.ts`, but the old route-owned block was still present after imports/constants had moved. The route could import with missing transcode identifiers and block focused tests until the stale block was removed.

**Why it mattered**: Monolith breakup is supposed to create one owner per concern. A stale twin keeps the old owner alive, creates missing-import failures, and makes background-job result shapes easy to mismatch during a split.

**Fix**: Removed the old transcode worker/export block from `server/routes/tv.ts`, kept scheduler imports pointed at `server/features/tv/transcode.ts`, and reran `npm run check` plus cache/health route tests.

**Rule**: After extracting a service, immediately search for the exported function names, env constants, and scheduler imports. The route should retain only route handlers and explicit compatibility calls, not duplicate service implementations.

---

## 2026-05-05 — Mechanical JSX extraction needs a return guard

**What happened**: The CRT playback surface was moved out of `TV.tsx` as a component, but the first mechanical copy left the JSX block as a bare expression inside the function body instead of returning it.

**Why it mattered**: TypeScript catches this quickly, but it is an easy error when converting an inline render subtree into a component. The split is still valuable, but the extraction script must preserve component semantics, not just the text block.

**Fix**: Added the missing `return (...)` wrapper in `client/src/features/tv/TVPlaybackSurface.tsx`, switched the new component to import telemetry/util helpers directly to avoid feature-barrel cycles, and reran `npm run check`.

**Rule**: When lifting JSX into a new component, always inspect the generated function head and tail before continuing: imports, destructured props, `return (...)`, and closing braces must be verified before the next cut.

---

## 2026-05-05 — Source indices must be recalculated after each splice

**What happened**: The TV data-query block was extracted first, then the mutation block was replaced using indices captured from the pre-edit source. That left a partial stale mutation block in `TV.tsx` and temporarily deleted the creator-console derived memos.

**Why it mattered**: Fast monolith breakup often uses mechanical block moves, but a single stale byte offset can corrupt a page even when the extracted hook itself is correct. TypeScript caught the syntax damage, but the mistake cost a repair pass.

**Fix**: Removed the stale partial mutation block, restored the derived memo boundary, moved the derived creator data into `useTVCreatorDerivedData`, and reran `npm run check`.

**Rule**: For multi-block mechanical edits, either perform replacements from bottom to top or recalculate source indices after every splice. Never reuse offsets from a previous version of the file.

---

## 2026-05-05 — Extracted mutation hooks must preserve query-key contracts

**What happened**: `refreshSourcesMutation` moved from `TV.tsx` into `useTVMutations`, but one invalidation kept the wrong key shape: `["tv", "channels", selectedOwnChannelId]` instead of the extracted detail query's `["tv", "channel", selectedOwnChannelId]`.

**Why it mattered**: Route paths can stay correct while UI freshness regresses. Query-key drift after a hook extraction leaves the stale cache alive, so creator-console changes can appear broken even though the server action succeeded.

**Fix**: Patched `useTVMutations` to invalidate the exact channel-detail key and kept verifier checks focused on route paths, query keys, returned hook values, and stale imports.

**Rule**: When moving React Query mutations, compare every `invalidateQueries` key against the extracted query hook before declaring the split clean. Keys are part of the client contract, not incidental wiring.

---

## 2026-05-05 — Extracted playback hooks own their timer cleanup and renderer state

**What happened**: Moving TV playback UX into hooks exposed two easy-to-miss contracts: timer refs created inside a hook still need unmount cleanup, and overlay visibility must follow the page's final `showBumper` render state rather than recomputing a similar condition locally.

**Why it mattered**: Playback refactors can typecheck while leaking delayed state updates or drifting from the exact renderer branch the user sees. Those bugs are subtle because they show up as stale overlays, late timers, or state updates after the component has already moved on.

**Fix**: Patched the stall-indicator hook to clear its timeout on unmount, made MTV overlay timing consume the page's `showBumper` state directly, and then moved broadcast playback-state selection, bumper deck selection, timer refs, and queue-cursor sync into hooks with explicit ownership.

**Rule**: When extracting playback hooks, move the timer cleanup and the renderer-derived state contract with the hook. Do not duplicate display predicates inside a hook if the page already computes the exact render branch.

---

## 2026-05-05 — Playback lifecycle hooks need explicit ref and setter contracts

**What happened**: The TV page still owned the power/channel reset lifecycle and the buffer-gate bumper loop inline, even after the surrounding playback timers, bumper deck, media handlers, and stall indicator had moved out. That left the shell responsible for clearing many timers, resetting pinned playback refs, and maintaining the gate's forward-ref recursion.

**Why it mattered**: These lifecycle paths are production-sensitive because stale timers or stale bumper refs can survive power toggles, channel flips, or item replacement. If the page keeps half of the state machine while hooks own adjacent playback behavior, future agents have to edit the shell for every buffer, reset, or transition change.

**Fix**: Moved the reset effect into `useTVPowerSignalReset` and moved the bumper/gate transition state machine into `useTVBufferGate`, keeping the shared `bufferGateActiveRef` and abort ref as explicit contracts for stall handling, media events, remote controls, and current-item lifecycle cleanup.

**Rule**: For playback lifecycle extraction, move the whole reset or state-machine loop together and make every shared ref/setter an explicit hook argument. Preserve forward-ref recursion inside the owning hook so the page cannot grow a stale duplicate.

---

## 2026-05-05 — Timeline JSX extraction must remove the second render owner

**What happened**: The W timeline composer and feed were moved into `client/src/features/w/timeline/WTimelinePanel.tsx`, but an older timeline feed branch was still left at the bottom of `W.tsx` after the helper styles/functions had moved.

**Why it mattered**: The page type gate failed on missing helper/style names, and even restoring those names would have created two timeline owners rendering the same feed. Extraction is only complete when the source page delegates to one owner.

**Fix**: Removed the stale bottom timeline JSX branch from `client/src/pages/W.tsx`, leaving the route to pass explicit posts, accounts, mutation objects, drafts, errors, and setters into `WTimelinePanel`.

**Rule**: After lifting a JSX panel, search the source page for the old branch label, active-view guard, helper names, and moved styled components. Delete the stale render owner before running the type gate.

---

## 2026-05-05 — Hook extraction must preserve the source effect dependency owner

**What happened**: While moving the desktop pet care-tool cursor lifecycle into `useDesktopPetToolCursor`, the source component's disabled-reset effect briefly inherited the removed cursor effect's `[activeTool]` dependency tail.

**Why it mattered**: The extracted hook was correct, but the remaining source effect would have stopped resetting desktop pet actors when `enabled` changed. A mechanical move can break behavior by damaging the code left behind, not only the code being moved.

**Fix**: Restored the disabled-reset dependency to `[enabled]`, kept the active-tool reset inside the new hook, and reran the requested verification.

**Rule**: After removing an effect block, reread the neighboring effect from `useEffect(` through its dependency array. Verify the source effect's trigger still matches the state it owns.

---

## 2026-05-06 — Pet care inventory must not depend on checkout UI

**What happened**: The desktop pet care tray still contained an in-app market/cart checkout surface while the marketplace signer/configuration was not ready for that care tool flow. Food inventory also needed explicit defaults so pet care would not depend on a live purchase path.

**Why it mattered**: Pet care needs dependable inventory, not a broken or premature purchase affordance. Buying food from the in-app market can still be valid, but the care tool should only consume canonical `in_app_inventory_items` rows and should not own wallet/cart behavior.

**Fix**: Removed the care-tray market UI and replaced its checkout hook with an inventory-only hook. Added idempotent starter food for newly generated pets through both browser and MCP pet creation paths, and added a one-time migration granting existing users three pet-food inventory items.

**Rule**: Keep purchase surfaces separate from care surfaces. Care tools may display and consume inventory, but wallet/cart controls belong in a dedicated market surface. Any starter or backfill grant must be idempotent and must write to the same inventory table used by verified purchases.

---

## 2026-05-06 — Branch pushes are not live deploys

**What happened**: The pet-care market removal and food-inventory fix was pushed to the feature branch, but production still served the old bundle and database state. A live user created a new pet and still saw zero food plus the stale market UI because the change had not reached `main` and the Hetzner deploy workflow had not run.

**Why it mattered**: A branch push can be useful for review, but it does not satisfy a production-visible bug report. Users testing `wtfgameshow.app` only see changes after the serving branch is updated, migrations run, and the deployed app is verified.

**Fix**: Move production-visible fixes onto `main`, let the Hetzner deploy workflow run, and verify live health/UI behavior before calling the issue live.

**Rule**: For production-facing fixes, do not say "live" or "done" after only pushing a feature branch. Confirm the commit is on the deployed branch, the deploy job or server deploy script has completed, migrations have applied, and the public app is serving the new behavior.
