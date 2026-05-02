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
