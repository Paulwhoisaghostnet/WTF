# wtfgameshow.app Pre-Mortem Report

Date: 2026-05-04
Mode: deep
Scope: live `https://wtfgameshow.app` plus local `WTF combo/WTF` app, API, deploy, storage, and TV cache surface.

## Summary

This pre-mortem asked: "Imagine it is three months from now and wtfgameshow.app failed in production. Why did it fail?"

The app is already doing several important things well:

- Production CORS rejects hostile origins and allows the canonical site origin.
- Helmet/CSP/HSTS/referrer protections are active on live responses.
- Local session auth regenerates sessions on login/register/wallet auth.
- Admin and operator routes are mostly permission-gated.
- User media architecture separates durable Object Storage originals from hot Volume caches.
- Private/local literal hostnames are blocked in the TV cache URL normalizer.

The main risks are not objections to user media sharing or Object Storage. They are boundary issues: a feature intended to cache and stream user/media content can also fetch arbitrary public URLs; legacy Twitter OAuth keeps a critical dependency in the active auth surface; unknown API routes currently return the SPA HTML; and disk-health severity ordering hides a full-cache critical condition.

## Implementation Update

Local fixes applied on 2026-05-04:

- The legacy `passport-twitter -> xtraverse -> xmldom` critical audit path was removed from dependencies, and the OAuth 1.0a route/config path is disabled unless explicitly opted in and the legacy package is present.
- The public TV cache no longer treats an empty host allowlist as permission to fetch every public host; default accepted hosts come from configured/default IPFS gateways plus explicit `TV_CACHE_ALLOWED_HOSTS` entries.
- TV cache responses are constrained to playback media (`video/*` or `image/gif`), while the generic media cache can still serve images from allowed/IPFS hosts for non-TV surfaces.
- Missing `/api/*` routes now return JSON 404 instead of SPA HTML 200.
- Disk health can now reach `crit` at full utilization.

Live verification is still pending until these changes are deployed.

## Tigers

| Severity | Risk | Evidence | Mitigation Checked | Suggested Fix |
| --- | --- | --- | --- | --- |
| High | Legacy Twitter OAuth leaves a critical `xmldom` advisory in the active production auth surface. | `npm audit --audit-level=critical` reports critical `xmldom` via `passport-twitter -> xtraverse`. Live `GET /api/auth/social/config` returned `twitter: true`, `twitterOauth2: true`, and `discord: true`. `server/auth/passport.ts` enables `passport-twitter` when `TWITTER_CONSUMER_KEY` and `TWITTER_CONSUMER_SECRET` are set. | OAuth2 exists, but legacy OAuth 1.0a remains enabled. The package override does not remove the advisory because the vulnerable transitive package is still present. | Disable legacy Twitter OAuth if OAuth2 covers the use case, or replace `passport-twitter` with a maintained OAuth 1.0a implementation that avoids `xtraverse/xmldom`. |
| High | Public TV cache endpoint can be used as a general external fetch/cache proxy. | Live `GET /api/tv/cache/media?url=https%3A%2F%2Fexample.com%2F` returned `200 text/html` with `X-TV-Cache: MISS`. The unauthenticated endpoint is mounted in `server/routes/tv.ts`; empty `TV_CACHE_ALLOWED_HOSTS` means every non-private public host is accepted by `server/lib/network-safety.ts`. | Literal private hosts are blocked, redirects are normalized, content length is capped, request timeout exists, and cache budget exists. Missing: auth or signed-token boundary, non-empty production allowlist, media content-type gate, and DNS-resolution/private-IP validation after redirects. | Preserve user media sharing, but make TV cache inputs DB-backed or allowlisted: user uploads by media id/object key, token/IPFS media by normalized gateway allowlist, and arbitrary external URLs only for staff or signed import flows. Reject non-media content and private resolved IPs. |
| Medium | Unknown `/api/*` routes return SPA HTML with HTTP 200, which hides broken API calls and weakens monitoring. | Live `GET /api/definitely-not-a-route` returned `200 text/html` and the Vite app shell. `server/static.ts` has a final catch-all `app.get(/.*/, ...)` that sends `index.html`; no API 404 handler appears before static serving. | Existing real API routes work, and frontend deep links need the SPA fallback. Missing: an `/api` JSON 404 before the frontend fallback. | Add `app.use('/api', ...)` JSON 404 before `serveStatic(app)`. |
| Medium | Disk health can never report `crit`. | `server/routes.ts` computes `usage >= 0.9 ? "warn" : usage >= 1.0 ? "crit" : "ok"`, so `crit` is unreachable. Live `/api/health/disk` is currently ok at 69.89% utilization, so this is latent rather than active. | The endpoint exists and reports current TV cache stats. Missing: correct threshold ordering and regression coverage. | Check `usage >= 1.0` before `usage >= 0.9`, and add a small test. |

## Elephants

- The product is intentionally ambitious: auth, admin controls, user media, TV playback, Tezos/wallet flows, X/Discord integration, background jobs, deployment, migrations, cache warming, and storage policy all live in one Node app. That can work, but failures can couple unless the highest-risk boundaries have tests and runbooks.
- The deploy path applies migrations during deployment. Backup scripts and timers exist, but `scripts/server-deploy.sh` does not visibly run a fresh pre-migration backup. This is an assumption gap, not a verified blocker.
- The current media strategy is valid, but the cache/proxy layer needs to distinguish "WTF-hosted user media" from "any public URL on the internet".

## Paper Tigers

| Concern | Why It Is Probably Fine | Evidence |
| --- | --- | --- |
| CORS with credentials enabled | Hostile browser origins are rejected; canonical site origin is allowed. | A live request with `Origin: https://evil.example` returned `403 {"error":"Origin not allowed"}`. A live request with `Origin: https://wtfgameshow.app` returned `200` and `access-control-allow-origin: https://wtfgameshow.app`. |
| Admin APIs are publicly writable | Unauthenticated calls are denied on sampled admin endpoints; route files use permission middleware. | `GET /api/admin/users` returned `401`. `server/routes/admin.ts`, `server/routes/operator-wallet.ts`, `server/routes/control-board.ts`, and related routes use `requirePermission(...)`. |
| Literal localhost/private-host SSRF through TV cache | Literal local/private hosts are rejected before fetch. | Live `GET /api/tv/cache/media?url=http://127.0.0.1:3000/api/health` returned `400 {"error":"Unsupported media URL"}`. `server/lib/network-safety.ts` blocks localhost, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, and local IPv6 patterns. |
| Object Storage itself is the problem | Object Storage is the right durable source-of-record for user uploads. | `docs/server-storage-architecture.md` describes validated uploads into Object Storage with hot playback copies on the Volume. `docs/object-storage-policy.md` defines capacity thresholds and upload protection. |

## False Alarms

- The TV cache issue is not "users can upload/share media". That is an intended product feature and the current architecture supports it.
- The issue is not "the app caches media". Hot caching is necessary for playback quality and cost control.
- The issue is specifically "an unauthenticated endpoint accepts arbitrary public HTTP(S) URLs and fetches/caches them under the app's origin".

## Recommended Next Step

1. Fix the TV cache boundary without removing user media sharing.
2. Disable or replace legacy Twitter OAuth.
3. Add an `/api` JSON 404 before static fallback.
4. Fix disk-health threshold ordering.
5. Add live smoke checks and regression tests for each item.

See `docs/superpowers/plans/2026-05-04-wtfgameshow-premortem-mitigation-plan.md` for the implementation plan.
