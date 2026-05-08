# WTF Gameshow — Reference-Project Grafting Plan

**Date:** 2026-04-19
**Scope:** Identify concrete code, schemas, and workflows from sibling Tezos projects in the `WTF combo` working directory that should be grafted into WTF to improve stability, performance, security, and UX.
**Source repos audited (read-only, no git at that level):**
- `building/Bowers` — full Tezos dApp (React + Express + Drizzle + Playwright + SmartPy artifact pipeline)
- `building/shadownet kiln` — SmartPy kiln + Hetzner-native migration plan
- `building/skllz` — agent skill corpus (lessons only)
- `building/smartpy-test-platform` — Python-based SmartPy run-UI
- `building/shadowdex` — agent docs only (skip)
- `Tezos analytics/Objkt-Advisor` — Objkt GraphQL-driven creator analytics + investment scoring
- `Tezos analytics/Tezos-Intel` — Postgres-backed wallet analytics with 2-min cache
- `Tezos analytics/Tezos-Scout` — minimal Objkt ingest MVP
- `Tezos analytics/tezpulse` — TzKT activity scanner (**ships `TZKT_API_CHEATSHEET.md`, 541 lines**)
- `Tezos analytics/wallet-constellations` — ego-centric wallet graph with d3-force
- `Tezos analytics/Guidance` — scheduled TzKT ingest with overlap-safe runs
- `Tezos analytics/web3 simulator/nft-pipeline` — canonical TzKT cursor client with 429-aware backoff
- `Tezos analytics/objkt-owned-editions-sorter` — DOM-only Chrome ext (skip, not graftable)
- `Particle Painting/particle-studio` — browser mint pipeline (Pinata → Objkt-style metadata → HEN/Teia minter)

**No git was touched at the parent level.** All grafts below land in `WTF/` once we open that repo in its own Cursor instance.

---

## 0. Executive summary

WTF is the most operationally mature of the surveyed repos — it already has a Hetzner-ready Docker Compose stack, `gosu`-dropped non-root runtime, chain-ID preflight (`preflight.ts`), fail-closed contract-config (`contract-config.ts`), a marketplace verifier that reconciles pending DB rows against TzKT, and a three-tier wallet surveillance pipeline (backfill → 5-min global sweep → 6-hour safety sweep) that most reference projects don't match.

What the reference projects genuinely do *better* is mostly at the **edges**:

1. **TzKT client robustness** — WTF has no 429/5xx backoff, no retry floor, no cursor-based pagination. `nft-pipeline/src/tzkt.ts` is the canonical pattern.
2. **IPFS gateway fallback at render time** — WTF only normalizes `ipfs://` once; Objkt-Advisor's `IpfsImage.tsx` cycles gateways on image error.
3. **Known-marketplace contract map** — WTF has no awareness of Objkt/Teia/fxhash/Versum/akaSwap, so it can't classify user sales vs plain transfers on the leaderboard. Tezos-Intel + tezpulse both ship the mapping.
4. **Tezos Domains GraphQL (reverse + owned)** — WTF's `teznames.ts` hits only `api.teznames.com`. `nft-pipeline/identity_resolver.ts` uses `api.tezos.domains/graphql` and pulls both reverse record and owned domains in one shot.
5. **Playwright e2e** — WTF has *zero* end-to-end tests. Bowers has a production-hardened CI pattern: start `npm start`, curl-wait for `/api/styles`, run Playwright, separate job against Netlify preview URL.
6. **Deployment runbook** — Bowers' `docs/DEPLOYMENT-GUIDE.md` documents Kukai chain-ID quirks, Temple stale-state clearing, Beacon pitfalls. WTF has none of this written down.
7. **WalletConnect-ready CSP** — Bowers' `server/app.ts` allowlists `wss://relay.walletconnect.com/.org` and frame-sources. WTF's CSP blocks future expansion to Kukai desktop / Atomex / other WalletConnect wallets.
8. **The TzKT cheatsheet itself** — tezpulse's `TZKT_API_CHEATSHEET.md` is a portable reference that should live inside WTF's `docs/`.

Everything else is either already handled, not applicable, or optional feature expansion.

---

## 1. What WTF already has (avoid duplicate work)

Reference projects confirmed several patterns WTF already implements — don't rework these:

| WTF file | Pattern | Already-comparable reference |
|----------|---------|------------------------------|
| `client/src/lib/tezos/preflight.ts` | Chain-ID assertion before every signed op | Bowers `originate.ts:127-151`, Kiln `tezos-service.ts:84-97` |
| `client/src/lib/tezos/wallet.ts` | Octez Connect → Beacon adapter with promise-cached singleton | Bowers `client/src/lib/tezos/wallet.ts` (same shape) |
| `server/lib/contract-config.ts` | Fail-closed production, dev fallback, network-keyed TzKT base | No reference project has this — WTF is ahead |
| `server/lib/marketplace-verifier.ts` | Pending-row reconciliation with TTL | No reference project has this — WTF is ahead |
| `server/lib/tzkt-ops.ts` | `verifyContractCall({opHash, contract, senderOneOf, entrypoint})` with retries | No reference has this caliber |
| `server/lib/wallet-events.ts` | Global sweep (5min) + safety sweep (6h) + per-wallet backfill, idempotent upsert on TzKT row id, in-flight guards | **Strictly more sophisticated** than Tezos-Intel, Guidance, and nft-pipeline combined |
| `server/tzkt.ts` | Chunked `anyof.sender.target.in=`, `id.gt` cursor helpers | Matches nft-pipeline's `paginateByCursor` except for retry/backoff |
| `shared/token-media.ts` | Artifact MIME resolution with WebP deprioritization | Better than any reference project — keep |
| `Dockerfile` + `docker-entrypoint.sh` | `tini` PID 1, `gosu node` privilege drop after chown | Bowers + Kiln do not do this |
| `docker-compose.yml` | `pg_isready` healthcheck + app `HEALTHCHECK` + named volumes | Bowers compose has DB only, no healthchecks |
| `.github/workflows/deploy.yml` | `docker compose up -d --build` retry 3× + 5× curl-to-`/api/health` gate | Better than Bowers' Netlify preview gate for our runtime |
| `server/auth/session-secret.ts` | Fail-fast production check | Kiln pattern reinforced |

**Do not re-graft any of the above.** The audit reports in this repo (`AUDIT_REPORT_CONTRACTS_DAPP_2026-04-17.md` + `audit_e2e_report.md`) already itemize residual bugs — address those *separately* from grafting work.

---

## 2. Grafting tiers

Each graft lists: **Source** (file:line), **Target** (new or modified file in `WTF/`), **Effort** (S = <1h, M = 1–4h, L = 1–3 days), **Risk**, **Dependencies**, **Exit criteria**.

### TIER 1 — Stability & correctness (graft first; highest win-per-hour)

#### G-1. Robust TzKT client with 429/5xx backoff + cursor pagination
- **Why:** `server/tzkt.ts` currently does raw `fetch` with no retry, no rate-limit awareness, no floor between requests, and mixes offset+cursor paging. A single TzKT rate-limit incident can cascade into failed token syncs, broken marketplace verifier runs, and empty leaderboards. Reference has battle-tested pattern.
- **Source:**
  - `Tezos analytics/web3 simulator/nft-pipeline/src/tzkt.ts:184-228` (`paginateByCursor<T extends { id: number }>`)
  - Same file, request throttler with **100 ms min interval**, **exponential backoff on 429/5xx**, **ECONNRESET retry**
  - `Tezos analytics/Guidance/server/services/http.ts:1-23` (3-attempt linear `350 * attempt` backoff, simpler fallback)
- **Target:** New `server/lib/tzkt-client.ts` — wraps `fetch`, adds: min-interval throttle, exponential backoff (500ms → 8s, 5 tries), respects retry-after header if present, returns `null` on terminal 404 vs throws on transient. Migrate `server/tzkt.ts` helpers to use it. Keep `tzkt-ops.ts` and `wallet-events.ts` wire-compatible.
- **Effort:** M
- **Risk:** Low — isolated, existing callers keep same signature.
- **Dependencies:** none.
- **Exit criteria:**
  1. `npm run check` green.
  2. Simulated 429 response triggers backoff in a dev harness or Vitest suite.
  3. Token sync log shows "throttled N ms" entries under load.

#### G-2. Multi-gateway IPFS fallback on `<img>` render error
- **Why:** WTF resolves `ipfs://` once to `ipfs.io/ipfs/…` in `server/tzkt.ts:117-123` and in `server/lib/thumbnail-url.ts`. When ipfs.io is slow (common) or a specific CID is pinned only on Cloudflare, token thumbnails show as broken images for hours. No client-side retry logic exists.
- **Source:**
  - `Tezos analytics/Objkt-Advisor/client/src/components/IpfsImage.tsx:9-58` — gateway list `["cf-ipfs.com", "dweb.link", "ipfs.io"]`, `onError` advances `gatewayIndex`.
- **Target:** New `client/src/components/IpfsImage.tsx`. Replace raw `<img>` in:
  - `client/src/components/TokenCard.tsx`
  - `client/src/components/OwnedTokensGallery.tsx`
  - Any `marketplace`/`barter`/`gallery` page that renders a token thumbnail.
  - TV channel thumbnails where artifact URIs are rendered.
- **Effort:** S (~90 min)
- **Risk:** Low — pure additive UI change; keep fallback to original URL if none match.
- **Dependencies:** none.
- **Exit criteria:**
  1. `grep -r "<img" client/src | grep -i "ipfs\|thumb"` shows no raw IPFS image tags in media-rendering components.
  2. Manual: block `ipfs.io` in devtools → thumbnails still load via cf-ipfs / dweb.link.

#### G-3. Known-marketplace contract map + sale classification
- **Why:** WTF's leaderboard (`server/routes/leaderboard.ts`) and user activity (`server/routes/wallets.ts`) treat all FA2 transfers the same. When a user buys a token on Objkt or Teia for 10 XTZ, WTF shows it as a transfer of unknown provenance. Classifying the counterparty lets us show "purchased on Objkt" and eventually score creator reputation.
- **Source:**
  - `Tezos analytics/tezpulse/TZKT_API_CHEATSHEET.md` §7 — Objkt/Teia/fxhash/Versum/akaSwap KT1 addresses + entrypoints (`collect`, `match`, `swap`, `ask`, `fulfill`, `cancel`).
  - `Tezos analytics/Tezos-Intel/server/workers.ts:622-769` — `MARKETPLACE_CONTRACTS` map + `/operations/{hash}` inspection to classify sale vs transfer.
- **Target:** New `shared/tezos-marketplaces.ts` — address map, entrypoint→event-type map, network-scoped. Extend `server/lib/wallet-events.ts` classification: when an event's TzKT op shows target ∈ known-marketplaces, mark `eventType = 'marketplace_sale'` and denormalize marketplace name into `walletEvents.metadata`.
- **Effort:** M
- **Risk:** Low — purely additive columns/metadata; leaderboard/wallets routes read optional marketplace name.
- **Dependencies:** G-1 (benefits from throttled `/operations/{hash}` lookups).
- **Exit criteria:**
  1. Leaderboard transfer rows show "Objkt" / "Teia" / "Versum" labels where applicable.
  2. `walletEvents` for a known sale (pick one from TzKT explorer) has `metadata.marketplace = "objkt"`.
  3. Unit test: classification helper on hand-crafted TzKT op fixtures.

#### G-4. Augment Tezos Domains with GraphQL (reverse + owned)
- **Why:** `server/teznames.ts` uses **only** `api.teznames.com/info/getNameFromAddress` (reverse record only). Users with multiple .tez domains or who want to show an owned-domains list get nothing. `tezos.domains` GraphQL is the canonical source and returns both in one query.
- **Source:**
  - `Tezos analytics/web3 simulator/nft-pipeline/src/identity_resolver.ts` — GraphQL query for `domains(where: {address: {eq: $address}})` + `reverseRecord`.
- **Target:** Replace `server/teznames.ts` with new `server/tezos-domains.ts` (keep the old export name via re-export to avoid churn on callers like `leaderboard.ts` and `profile.ts`). New API:
  - `resolveDomain(address)` — unchanged signature, same 30-min cache, GraphQL source, graceful fallback to teznames.com on GraphQL error.
  - `resolveMultipleDomains(addresses[])` — batched single GraphQL call for `anyOf` addresses (vastly fewer HTTP round trips than N parallel `getNameFromAddress`).
  - New: `getOwnedDomains(address)` — returns array of owned .tez names. Used in profile page.
- **Effort:** M
- **Risk:** Low — graceful degradation to existing API; cache semantics unchanged.
- **Dependencies:** G-1 (for retry/backoff).
- **Exit criteria:**
  1. Leaderboard shows the same (or more) .tez names for top holders.
  2. `/profile` surfaces an "Owned .tez domains" list.
  3. Domain resolution latency drops on 50-address leaderboard page (measurable via a log line).

#### G-5. Scheduler overlap guard on token-sync + nonce cleanup intervals
- **Why:** `server/lib/token-sync.ts:156-169` starts `runTokenSync` via `setInterval` every 4 h. If a sync takes longer than the interval (possible at scale or during TzKT slowness), a second sync starts on top of the first, creating duplicated upserts and doubled TzKT load. `wallet-events.ts` already uses an in-flight flag for global/safety sweeps — the token-sync side never got the same treatment.
- **Source:**
  - `server/lib/wallet-events.ts:50-51` (`globalSweepInFlight`, `safetySweepInFlight`) — already in WTF.
  - `Tezos analytics/Guidance/server/services/scheduler.ts` (`running` flag) — external reference.
- **Target:** Add `tokenSyncInFlight` boolean to `server/lib/token-sync.ts`, wrap `runTokenSync()` early-return if already running; log skip lines. Same for `cleanupExpiredNonces`.
- **Effort:** S (~20 min)
- **Risk:** Minimal — self-contained.
- **Exit criteria:** `console.log("[token-sync] skipped — previous run still in progress")` appears if manually triggered mid-run.

#### G-6. Health endpoint enrichment
- **Why:** `/api/health` currently returns `{status:"ok"}`. Kiln returns chainId, network, contract resolution, activity log path — far more useful for CI health-gates, deploy verification, and admin UI.
- **Source:**
  - `building/shadownet kiln/src/server/routes/system-router.ts:31-42`.
- **Target:** Extend `server/routes/console.ts` (or wherever `/api/health` lives — quick search confirms) to return:
  - `status`, `sha` (from `process.env.GIT_SHA` or `git rev-parse HEAD` at build), `startedAt`
  - `network` + `expectedChainId` from `contract-config.ts`
  - `actualChainId` from TzKT `/v1/head`
  - `db.ok` boolean (from `SELECT 1`)
  - `contracts.marketplace` + `.barter` present/absent
  - `versions` — `node`, `pg`, WTF deps snapshot (optional)
  - Flag a **degraded** status (HTTP 200 still, but `status:"degraded"`) when expected≠actual chain ID or contracts missing. The deploy workflow's healthcheck can treat this as a failure.
- **Effort:** S (~45 min)
- **Risk:** Low — existing `/api/health` shape expanded additively.
- **Exit criteria:** `curl /api/health` returns the enriched JSON; `.github/workflows/deploy.yml` can optionally check `.status == "ok"` instead of just HTTP 200.

---

### TIER 2 — Performance & operational resilience

#### G-7. Persistent TzKT response cache (Postgres) for hot routes
- **Why:** `server/tzkt.ts:12-37` uses an in-process `Map` with 5-min TTL. A container restart (deploys, OOM kills) drops the cache and every first request to `/api/leaderboard`, `/api/marketplace/onchain`, and `/api/barter/onchain` hits TzKT cold. Multi-instance deploys would also mean cache doesn't shard.
- **Source:**
  - `Tezos analytics/Tezos-Intel/server/routes.ts:812-838` — `storage.getWalletCache(address)` with 120 s TTL.
  - Schema: `wallet_cache { address pk, tokensJson, lastSynced }` — adapted from Tezos-Intel `shared/schema.ts`.
- **Target:** New Drizzle table `tzkt_cache { key text pk, payload jsonb, storedAt timestamptz, ttlSeconds int }`. New `server/lib/tzkt-cache.ts` — get/set with key+ttl. Replace hottest read paths first: `getTokenHolders`, `getTokenTransfers`, `getWalletTokenTransfers`. Keep `Map` for sub-second hot paths where DB round-trip > TzKT latency.
- **Effort:** M
- **Risk:** Medium — cache-stampede behavior changes; must be careful to set *before* returning from TzKT fetch (lock window).
- **Dependencies:** G-1 (throttled TzKT client).
- **Exit criteria:**
  1. Restart container — first `/api/leaderboard` is served from DB cache if a prior instance populated it within TTL.
  2. Cache hit rate >60% observable in a dev log line.

#### G-8. Request-ticket dedup for in-flight client fetches
- **Why:** When a user rapidly navigates (open Marketplace → close → open Profile → open Marketplace), React Query may have multiple stale fetches resolving after re-mount, overwriting fresh state with older responses. The `wallet-constellations` codebase solved this with a monotonic ticket.
- **Source:**
  - `Tezos analytics/wallet-constellations/src/app/useWalletStudio.ts:61-80` — `ticketRef` pattern.
- **Target:** New `client/src/lib/use-ticketed-query.ts` helper wrapping `useQuery` with ticket-aware `onSuccess`. Apply to pages known to race: `Profile`, `Marketplace`, `TradeBoards`.
- **Effort:** S
- **Risk:** Low.
- **Exit criteria:** Manual "thrash navigation" test — no state regression visible.

#### G-9. Cursor-based token-balance sync
- **Why:** `server/lib/token-sync.ts:29-83` paginates `/tokens/balances` with `offset=0…500`. For whales (10k+ tokens), offset paging blows up linearly and can miss inserts between pages. TzKT explicitly recommends `offset.cr` for balance endpoints.
- **Source:**
  - `Tezos analytics/tezpulse/TZKT_API_CHEATSHEET.md` §1 — `offset.cr=<cursor>` documentation.
  - `Tezos analytics/web3 simulator/nft-pipeline/src/tzkt.ts:184-228` — `paginateByCursor` pattern.
- **Target:** Modify `server/tzkt.ts:getOwnedFa2TokensPage` to accept a cursor (`lastId`) and sort by `id.asc`. Update `server/lib/token-sync.ts` loop to advance by cursor instead of offset. Keep public signature for one release behind a feature flag.
- **Effort:** M
- **Risk:** Medium — sort order from `lastTime desc` → `id asc` changes result order (UI might show differently). Verify nothing downstream depends on order.
- **Dependencies:** G-1.
- **Exit criteria:** Syncing a fixture wallet with 2,000 tokens completes in < N HTTP calls (where N = ceil(2000/500)) with no duplicate rows.

#### G-10. Objkt GraphQL as secondary data source
- **Why:** TzKT alone doesn't tell us when a collection is "trending on Objkt", price floors, active marketplaces. Tezos-Intel and Objkt-Advisor both layer Objkt GraphQL (`https://data.objkt.com/v3/graphql`) on top of TzKT for this. Gives WTF leaderboard / gallery pages access to floor prices without building our own indexer.
- **Source:**
  - `Tezos analytics/Tezos-Intel/server/workers.ts` — `axios.post` to Objkt GraphQL, error handling.
  - `Tezos analytics/Objkt-Advisor/server/routes.ts` — well-formed queries.
- **Target:** New `server/objkt.ts` — typed queries for: token floor, recent sales by contract, trending creators. Wire into:
  - `server/routes/gallery.ts` — show floor price alongside token.
  - `server/routes/leaderboard.ts` (optional) — rank creators by 30-day Objkt volume.
- **Effort:** L (full day to do well)
- **Risk:** Low — additive. Objkt outage degrades gracefully (return null).
- **Dependencies:** G-1 (for retry pattern) if we want to unify.
- **Exit criteria:** Gallery shows floor price for a known Teia collection; missing floor renders `—`.

#### G-11. HTTP retry budget for TzKT-adjacent calls
- **Why:** Related to G-1 but more focused. Every direct `fetch()` call in `server/` (contract-activity, wallets, leaderboard, gallery) should route through a shared retrying client rather than bare fetch. Kiln, Guidance, nft-pipeline all independently converged on this.
- **Source:**
  - `Tezos analytics/Guidance/server/services/http.ts` — simple 3-attempt helper (good starting point).
- **Target:** Generalize the `fetchJson<T>` helper from tzkt-ops.ts and promote it to `server/lib/http-retry.ts`. All non-cached TzKT-like calls use it. Objkt, Tezos Domains, better-call.dev (future) use it too.
- **Effort:** S (~60 min, mostly a sweep of callers)
- **Risk:** Low.
- **Exit criteria:** `grep -r "await fetch(" server/ | grep -v "http-retry"` returns near-zero outside of attachment/streaming paths.

#### G-12. Background-jobs watchdog + visibility
- **Why:** Right now, `startBackgroundJobs()` logs initial state but there's no ongoing "last ran at" visibility. When an admin wonders "is the token sync healthy?", they have to tail docker logs. Guidance has the pattern: a `sync_runs` table + begin/end tracing.
- **Source:**
  - `Tezos analytics/Guidance/server/services/scheduler.ts` + `beginSyncRun`/`endSyncRun` in Guidance's `index.ts`.
- **Target:** New Drizzle table `job_runs { id, jobName, startedAt, endedAt, status, errorMessage, stats jsonb }`. Every job in `server/lib/token-sync.ts`, `marketplace-verifier.ts`, and `wallet-events.ts` writes begin + end. New admin route `GET /api/admin/jobs` lists recent runs per job.
- **Effort:** M
- **Risk:** Low — diagnostic only.
- **Exit criteria:** Admin page shows last run of each job with duration, status, and counts.

---

### TIER 3 — Security & hardening

#### G-13. WalletConnect-ready CSP expansion
- **Why:** The current WTF CSP likely doesn't allowlist WalletConnect relay endpoints. Adding WalletConnect as a transport (via `@airgap/beacon-transport-walletconnect` or `@tezos-x/octez.connect-transport-walletconnect`) unlocks Kukai desktop, Temple mobile, Atomex, and future wallets — but only if CSP permits the relay connections.
- **Source:**
  - `building/Bowers/server/app.ts:28-85` — `connectSrc` adds `wss://relay.walletconnect.com`, `wss://relay.walletconnect.org`, `https://relay.walletconnect.com`, `https://relay.walletconnect.org`. `frameSrc` adds `https://walletconnect.com` + `*.walletconnect.com/.org`.
- **Target:** Amend `server/app.ts` helmet CSP `connectSrc` and `frameSrc` arrays accordingly. **Actually enabling WalletConnect transport is a separate graft** (G-21 below, optional). CSP expansion is zero-cost and non-breaking — ship it preemptively.
- **Effort:** S (5 min)
- **Risk:** Minimal — CSP widening, not weakening (still no `*` sources).
- **Exit criteria:** `curl -I https://wtfgameshow.app` shows updated CSP header; no functional change yet.

#### G-14. Playwright e2e harness + CI integration
- **Why:** WTF has zero end-to-end tests. Every deploy relies on a `/api/health` check and manual smoke. Bowers has a full Playwright setup running (a) locally against `npm start` with a curl wait loop, and (b) against Netlify preview URLs. We can adapt the pattern to Docker Compose.
- **Source:**
  - `building/Bowers/playwright.config.ts:1-20`
  - `building/Bowers/.github/workflows/test.yml:60-74` (Postgres service + health + curl wait)
  - `building/Bowers/e2e/` (test fixtures)
- **Target:**
  - New `playwright.config.ts` in WTF root.
  - New `e2e/` directory with smoke tests: landing loads, login flow, wallet connect mocked, marketplace listing visible, TV channel playable.
  - New CI job in `.github/workflows/test.yml` (or extend quality gates): spin `docker compose up postgres app -d --build`, curl-wait `/api/health` up to 60 s, `npx playwright test --reporter=github`.
  - Keep `pre-deploy` blocking: if e2e red, `deploy.yml` does not run.
- **Effort:** L (1–2 days)
- **Risk:** Low — CI-only, no runtime changes.
- **Dependencies:** G-6 (richer health endpoint is the CI gate).
- **Exit criteria:** Branch protection requires e2e green; a deliberate regression on `/dashboard` fails CI.

#### G-15. Deployment runbook + wallet-quirk playbook
- **Why:** Bowers' `docs/DEPLOYMENT-GUIDE.md` captures Temple vs Kukai quirks, chain-ID gotchas, Beacon stale-state recovery — institutional knowledge WTF's support channel has to re-derive from Discord screenshots. WTF's audit reports are post-facto; a **runbook** is forward-looking.
- **Source:**
  - `building/Bowers/docs/DEPLOYMENT-GUIDE.md:130-149` (chain-ID sections) and surrounding wallet-specific sections.
  - `building/shadownet kiln/HETZNER_NATIVE_MIGRATION_PLAN.md` — Hetzner-on-host systemd deployment (relevant if we ever need to move off Docker or add a second app on the same box).
- **Target:**
  - New `docs/DEPLOYMENT.md` — WTF-specific: Hetzner box layout, Caddy, Docker compose profiles, rollback, backup restore, adding a new wallet.
  - New `docs/WALLET_RUNBOOK.md` — Temple quirks, Kukai chain ID, Octez Connect preflight handshake, Beacon stale localStorage, "my tokens aren't syncing" diagnostic tree.
  - New `docs/TZKT_CHEATSHEET.md` — port tezpulse's `TZKT_API_CHEATSHEET.md` verbatim with a "WTF additions" appendix covering our specific endpoints.
- **Effort:** M (mostly writing)
- **Risk:** None.
- **Exit criteria:** Docs exist and are cross-referenced from top-level README.

#### G-16. Server-side chain-ID guard (defense in depth)
- **Why:** Client's `preflight.ts` asserts chain ID before wallet ops — great. But the server currently trusts all `opHash` submissions without re-checking that the op actually targets the mainnet (or configured) network. Kiln has `ensureExpectedChainId` on the server; we should mirror that where it matters: `contract-activity` ingest and the marketplace verifier.
- **Source:**
  - `building/shadownet kiln/src/lib/tezos-service.ts:84-97`.
- **Target:** New `server/lib/chain-id.ts` — `ensureExpectedChainId()` reads TzKT `/v1/head.chainId` (cached 5 min), throws if ≠ `contract-config.getNetwork()`'s expected ID. Call at:
  - `marketplace-verifier.ts` start of each reconcile pass (bail whole pass if mismatch rather than verify rows against the wrong chain).
  - Optional: server boot.
- **Effort:** S
- **Risk:** Low.
- **Exit criteria:** Flipping `TEZOS_NETWORK=ghostnet` in an already-deployed mainnet server → verifier logs chain-id mismatch and no-ops.

#### G-17. Residual audit items — gate behind this plan, not inside it
- **Not grafted from reference projects, but flagged for alignment:** the residual items in `AUDIT_REPORT_CONTRACTS_DAPP_2026-04-17.md` (M-1 auction bid validation, M-2 `/sold` ownership check, M-6 contract-activity wallet derivation) should be addressed in parallel. They don't need reference-project code — they need extending the already-present `verifyContractCall` helper to cover those endpoints. Mentioning here so a future refactor doesn't "graft" something already solvable with WTF's own helpers.

---

### TIER 4 — Feature expansion (optional, deferrable)

#### G-18. Creator-scoring "investment insight" for Gallery / Leaderboard
- **Why:** Objkt-Advisor ships a 100-point, 5-category creator scoring model (liquidity, appreciation, consistency, momentum, scarcity) with decayed metrics. Grafting even a simplified version into WTF's Gallery page ("this artist's 30-day floor trend") would be a unique discovery feature and a counterweight to generic marketplace UIs.
- **Source:**
  - `Tezos analytics/Objkt-Advisor/SCORING_METHODOLOGY.md` (full methodology).
  - `Tezos analytics/Objkt-Advisor/server/scoring.ts:147-268` (implementation: percentile-based floors).
- **Target:** New `server/lib/creator-score.ts` (server) + UI in `client/src/pages/Gallery.tsx` (badges per creator). Requires G-10 (Objkt GraphQL) to have sales data.
- **Effort:** L (2–3 days if we do the full model; a scaled-down "30-day floor + momentum" v0 is M).
- **Risk:** Low — pure UX addition.
- **Dependencies:** G-1, G-7, G-10.

#### G-19. Wallet-relationship graph on Profile page
- **Why:** `wallet-constellations` has a beautiful d3-force graph with FNV-seeded deterministic positioning. WTF's Profile page could show "wallets you've transacted with" or "collectors who also hold tokens from your creators". Bigger idea: "discover new people via your token holdings" = a community-growth mechanic.
- **Source:**
  - `Tezos analytics/wallet-constellations/src/shared/buildWalletAnalytics.ts` (graph construction).
  - `Tezos analytics/wallet-constellations/src/modules/network-growth/NetworkGrowthView.tsx` (d3-force + seeded positions).
- **Target:** New `client/src/components/WalletGraph.tsx` + supporting server route `GET /api/profile/network`. Pulls from existing `walletEvents` table.
- **Effort:** L (2 days — layout is fiddly).
- **Risk:** Low, optional.
- **Dependencies:** none beyond existing `walletEvents`.

#### G-20. Browser-based SmartPy test UX
- **Why:** Today `contract:test` is a bash script. `smartpy-test-platform` offers a tiny Python+vanilla-JS browser UI for picking contracts, running them in sandboxes, and inspecting artifacts. For an admin-only "compile and test in the browser before deploying" flow, it beats shelling into a dev box.
- **Source:**
  - `building/smartpy-test-platform/server.py` + `web/`.
- **Target:** New `tools/smartpy-lab/` directory, keep it isolated (separate venv, separate port, admin-only behind Caddy basic auth). Not part of the prod app.
- **Effort:** M
- **Risk:** Low (isolated tool).
- **Dependencies:** none.

#### G-21. WalletConnect transport (enables more wallets)
- **Why:** After G-13 allowlists CSP, actually enabling WalletConnect pulls in Kukai, more mobile flows, and insulates against Beacon/Octez Connect outages. Bowers ships it (transitive dep); Particle Studio does NOT (pure Beacon).
- **Source:**
  - `building/Bowers/client/src/lib/tezos/wallet.ts` — adapter pattern with WC-ready transport.
- **Target:** Add `@airgap/beacon-transport-walletconnect` (or `@tezos-x/octez.connect-transport-walletconnect`) to `package.json`. Initialize in `client/src/lib/tezos/wallet.ts` as a third adapter option. Surface UX option on Connect modal.
- **Effort:** M
- **Risk:** Medium — wallet quirks multiply; requires testing on Kukai desktop, Temple mobile, Atomex.
- **Dependencies:** G-13 (CSP).

#### G-22. Mint-from-WTF pipeline (speculative / creator expansion)
- **Why:** WTF currently *consumes* tokens but doesn't *create* them. Particle Studio has a full browser mint pipeline: canvas → IPFS (Pinata) → TZIP-21 metadata → HEN/Teia shared minter contract (`KT1Hkg5qeNhfwpKW4fXvq7HGZB9z2EnmCCA9`). A "mint your WTF submission as an NFT" feature would tie gameshow output to Tezos provenance directly.
- **Source:**
  - `Particle Painting/particle-studio/src/services/teiaService.ts` (full flow).
  - `Particle Painting/particle-studio/src/components/MintModal.tsx` (UI pattern).
- **Target:** New `client/src/lib/tezos/mint.ts` + UI hook in Challenge submissions or Media Library.
- **Critical**: The Particle Studio flow bundles `VITE_PINATA_JWT` into the client — **do not copy that directly**. Build a server-side pinning relay (`POST /api/media/pin` that takes a blob, server holds the JWT, returns CID) so secrets never ship to browsers.
- **Effort:** L (3+ days; product/legal review required for royalties + editions UX).
- **Risk:** Medium (new attack surface: anyone authenticated could spam Pinata; needs per-user rate limits + size caps).
- **Dependencies:** Server-side Pinata integration (new), rate limit infra, product decisions (pricing, royalties).

---

## 3. Suggested sequencing

Based on dependency graph + impact:

**Sprint 1 (1–2 days, infra pass):**
1. G-1 — robust TzKT client
2. G-11 — http-retry helper sweep
3. G-5 — scheduler overlap guards
4. G-6 — /api/health enrichment
5. G-16 — server chain-ID guard

**Sprint 2 (2–3 days, UX + visibility):**
6. G-2 — IPFS gateway fallback `<IpfsImage />`
7. G-4 — Tezos Domains GraphQL
8. G-3 — known-marketplace contract map (depends on G-1)
9. G-12 — job_runs table + admin visibility
10. G-7 — Postgres tzkt_cache

**Sprint 3 (1 week, testing + docs + CSP prep):**
11. G-14 — Playwright e2e (depends on G-6)
12. G-15 — deployment + wallet runbooks + TzKT cheatsheet
13. G-13 — WalletConnect CSP allowlist
14. G-9 — cursor-based token sync

**Sprint 4 (optional features, prioritized by PM signal):**
15. G-10 — Objkt GraphQL secondary source (depends on G-1)
16. G-21 — WalletConnect transport (depends on G-13)
17. G-18 — creator scoring (depends on G-7, G-10)
18. G-19 — wallet graph visualization
19. G-20 — SmartPy lab
20. G-22 — mint-from-WTF (requires product sign-off)

**Not sprinted (parallel track):**
- G-17 — residual audit items (M-1, M-2, M-6) — do these alongside Sprint 1, they reuse WTF's own `verifyContractCall`.

---

## 4. Out-of-scope / explicitly rejected

- **Objkt-Advisor `json_extract` SQLite filter pattern** — we use Postgres; `jsonb_path_query` exists natively, no graft needed.
- **Particle Studio's `VITE_PINATA_JWT` in client bundle** — security anti-pattern; never copy.
- **tezpulse's "real-time" polling dashboard architecture** — it is polling-on-demand, not streaming. WTF's `wallet-events.ts` sweep pattern is already more incremental and efficient.
- **Tezos-Scout** — MVP-only; blocking synchronous ingest; nothing novel vs Tezos-Intel or Guidance.
- **objkt-owned-editions-sorter** — Chrome extension DOM scraping; not portable to React.
- **shadowdex** — documentation-only agent config; no code to graft.
- **skllz** — useful as meta-knowledge but no runtime code to graft; lessons already reflected in WTF's audit reports.
- **Kiln's serverless-http Netlify bundling** — WTF is Docker-native on Hetzner; don't dilute with dual deploy targets.
- **Bowers's global `script-src 'unsafe-eval'`** — weaker than WTF's path-scoped approach; do not adopt.

---

## 5. Validation checklist before grafting starts

Before opening `WTF/` alone in its own Cursor instance to begin grafting:

- [ ] All audits on this doc's reference-project list are complete — this plan stands alone without re-reading the sibling repos.
- [ ] The `WTF/` working copy is clean (`git status` inside WTF shows no uncommitted changes other than this plan file).
- [ ] Residual audit items from `AUDIT_REPORT_CONTRACTS_DAPP_2026-04-17.md` + `audit_e2e_report.md` are triaged separately — grafting adds features/hardening, not bugfixes for known bugs.
- [ ] `.env.example` drift noted (L1 from e2e audit): graft plan does not touch secrets, but new tables (`tzkt_cache`, `job_runs`) need `npm run db:push` in CI after merge.

---

## 6. Open questions (flag for josh)

1. **Is the `/api/health` endpoint consumed by an external uptime monitor?** If yes, G-6 must stay backwards-compatible (don't change the top-level field names; only add).
2. **Do we want a scored leaderboard** (G-18) or keep the current holder-ranked one? Scoring changes a user-visible ranking and may upset top holders who lose rank.
3. **Is there appetite for a dedicated Tezos Domains cache table**, or is the 30-min in-memory cache enough? G-4 can be done either way.
4. **WalletConnect priority** — if Kukai desktop users are currently blocked, G-13 + G-21 become Tier 1. Otherwise defer.
5. **Mint-from-WTF (G-22) — is this aligned with gameshow product direction**, or does it muddy the "consume/curate" pitch?

---

## 7. File targets in WTF (for grep when grafting starts)

Quick index of files that will be created or modified under `WTF/` during Sprint 1–3:

| Action | Path |
|--------|------|
| CREATE | `server/lib/tzkt-client.ts` (G-1) |
| MODIFY | `server/tzkt.ts` (use new client) |
| CREATE | `server/lib/http-retry.ts` (G-11) |
| MODIFY | `server/lib/token-sync.ts` (G-5, G-9) |
| MODIFY | `server/routes/console.ts` or wherever `/api/health` lives (G-6) |
| CREATE | `server/lib/chain-id.ts` (G-16) |
| MODIFY | `server/lib/marketplace-verifier.ts` (G-16 hook) |
| CREATE | `client/src/components/IpfsImage.tsx` (G-2) |
| MODIFY | `client/src/components/TokenCard.tsx` + `OwnedTokensGallery.tsx` + gallery/marketplace/barter pages (G-2) |
| RENAME | `server/teznames.ts` → `server/tezos-domains.ts` (G-4, keep re-exports) |
| CREATE | `shared/tezos-marketplaces.ts` (G-3) |
| MODIFY | `server/lib/wallet-events.ts` (G-3 classification) |
| MODIFY | `shared/schema.ts` (`tzkt_cache`, `job_runs`) (G-7, G-12) |
| CREATE | `server/lib/tzkt-cache.ts` (G-7) |
| CREATE | `client/src/lib/use-ticketed-query.ts` (G-8) |
| MODIFY | `server/app.ts` helmet CSP (G-13) |
| CREATE | `playwright.config.ts` + `e2e/` (G-14) |
| CREATE | `docs/DEPLOYMENT.md`, `docs/WALLET_RUNBOOK.md`, `docs/TZKT_CHEATSHEET.md` (G-15) |
| MODIFY | `.github/workflows/test.yml` (G-14) |

---

*Plan end. Grafting starts in a fresh Cursor instance focused on `WTF/` only, as per the user's workflow preference.*
