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
