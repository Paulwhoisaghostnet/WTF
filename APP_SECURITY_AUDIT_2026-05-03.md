# WTF Application Security Audit - 2026-05-03

## Scope And Method

This is a defensive, repository-only pre-launch audit. I reviewed local source, deployment, package, scripts, and documentation files. I did not open secret-bearing `.env` files, did not probe live services, did not bypass authentication, and did not run intrusive network scans.

Safe checks performed:

- Repo file map with `rg --files`.
- Static review of Express routes, auth/session code, deployment files, media/TV routes, Tezos/Web3 routes, backup code, scripts, and package manifests.
- `npm audit --omit=dev --json` for the root app, Particle Painter (`PP`), and Discord bot extension.
- Bounty-board intake for newly discovered red flags: WTF-BB-076 through WTF-BB-087.

## File Map

Primary runtime:

- `server/app.ts` - Express middleware, CORS, Helmet/CSP, JSON limits, rate limiting, auth setup.
- `server/routes.ts` - route mounting order.
- `server/auth/*` - sessions, local auth, OAuth, wallet auth, nonce storage.
- `server/routes/*` - API endpoints for admin, board, messages, W/X integration, TV/media, studio, cockpit, Tezos/Web3 features.
- `server/lib/*` - scheduler, backup pipeline, system logs, Tezos/indexer helpers, operator signer client.
- `client/src/*` - React frontend and Tezos wallet interactions.
- `shared/schema.ts`, `shared/types.ts` - DB schema and RBAC permission defaults.

Deployment/runtime:

- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `Caddyfile`.
- `.github/workflows/*.yml`.
- `.gitignore`, `.dockerignore`, `.env.example`.

Web3/contracts/media:

- `contracts/**`.
- `client/src/lib/tezos/**`.
- `server/routes/marketplace.ts`, `server/routes/barter.ts`, `server/routes/buyback-windows.ts`, `server/routes/wtf-auctions.ts`, `server/routes/wtf-recapture.ts`.
- `PP/src/services/teiaService.ts`, `public/creation-tools/**`.

## Executive Summary

The app has several good pre-launch controls already in place: production CORS fails closed when origins are missing, session cookies are `httpOnly`/`secure` in production, `.env` files are ignored, Studio file serving has MIME downgrades and private cache headers, and marketplace listing creation now verifies on-chain op hashes before treating rows as verified.

The launch blockers are not "one magic hack." They are mostly privilege-boundary and resilience gaps that combine badly in a rogue-user or compromised-account scenario:

- Some maintenance routes are only `isAuthenticated`, letting ordinary users trigger expensive background jobs or arbitrary wallet indexing.
- Legacy board/channel routes bypass the newer board permission model.
- Several Tezos payment/attestation flows accept client-submitted state before confirmed on-chain evidence is consumed.
- The backup pipeline can look green while the only off-host artifact is a manifest, not a restorable dump.
- Existing open bounty items confirm broad CSRF exposure, public/enumerable uploaded media, unauthenticated TV prefetch/cache surfaces, and rate-limit bypasses on write-heavy routes.

## Risk Table

| ID | Severity | Title | Status |
| --- | --- | --- | --- |
| F-01 | Critical | Production dependency tree carries critical `xmldom` via legacy `passport-twitter` | New, WTF-BB-085 |
| F-02 | High | Any authenticated user can force-run registered cockpit jobs | New, WTF-BB-076 |
| F-03 | High | Legacy channel message endpoints bypass board permissions | New, WTF-BB-078 |
| F-04 | High | Buyback swap intent is trusted before on-chain confirmation | New, WTF-BB-079 |
| F-05 | High | Paid side-quest completion does not require confirmed entry-fee payment | New, WTF-BB-080 |
| F-06 | High | Backup defaults do not create immutable off-host dump bytes | New, WTF-BB-082 |
| F-07 | High | Cookie-authenticated write routes still lack a CSRF token layer | Existing, WTF-BB-014 |
| F-08 | High | Uploaded media files/metadata are exposed without consistent ownership checks | Existing, WTF-BB-015 plus new evidence |
| F-09 | Medium | Manual cockpit wallet sync accepts arbitrary wallet targets | New, WTF-BB-077 |
| F-10 | Medium | Wallet-login proof is not bound to submitted wallet address | New, WTF-BB-081 |
| F-11 | Medium | W link preview follows redirects before validating every target | New, WTF-BB-083 |
| F-12 | Medium | Particle Painter expects Pinata JWT in Vite client env | New, WTF-BB-084 |
| F-13 | Medium | OAuth/Studio encryption falls back to `SESSION_SECRET` | Existing, WTF-BB-019 |
| F-14 | Medium | W media IDs are accepted by format only | Existing, WTF-BB-032 |
| F-15 | Medium | TV/cache/client-log/media route prefixes bypass generic API rate limiting | Existing, WTF-BB-016, WTF-BB-056, WTF-BB-017 |
| F-16 | Medium | Profile PFP update stores arbitrary image URLs | New, WTF-BB-086 |
| F-17 | Medium | Broad cohost defaults include destructive user-management actions | New, WTF-BB-087 |
| F-18 | Low | Public cockpit status endpoints disclose job/backfill state | Hardening |

## Detailed Findings

### F-01 - Production dependency tree carries critical `xmldom` via legacy `passport-twitter`

- Severity: Critical
- Affected files: `package.json:64`, `server/auth/passport.ts:141-179`, `server/auth/routes.ts:1013-1033`
- Why it matters: `npm audit --omit=dev --json` reported one critical production vulnerability from `passport-twitter -> xtraverse -> xmldom@0.6.0`. The legacy Twitter OAuth 1.0 strategy is dynamically enabled by `TWITTER_CONSUMER_KEY` and `TWITTER_CONSUMER_SECRET`, while the app also has a newer OAuth2 flow.
- Safe reasoning: The dependency is in the root production install and the route can be enabled by env config. No live request testing was performed.
- Recommended fix: Remove `passport-twitter` and legacy `/api/auth/twitter` OAuth 1.0 if OAuth2 fully replaces it. Otherwise replace the strategy with a maintained implementation that does not depend on vulnerable XML parsing.
- Patch suggestion:

```diff
- "passport-twitter": "^1.0.4",
```

Then remove the legacy strategy registration and `/api/auth/twitter` routes, leaving `/api/auth/twitter-oauth2`.

### F-02 - Any authenticated user can force-run registered cockpit jobs

- Severity: High
- Affected files: `server/routes/cockpit.ts:361-365`, `server/lib/background-jobs.ts:45-187`
- Why it matters: Jobs include backups, media cache warming, transcode sweeps, X/DM sync, portfolio sync, wallet/indexer workers, and recapture watchers. Any logged-in user can trigger them by name.
- Safe reasoning: Static route review shows only `isAuthenticated`; no permission check or job allowlist is present.
- Recommended fix: Require `manage_settings` or a dedicated `manage_background_jobs` permission, and allowlist manually runnable job names.
- Patch suggestion:

```ts
const MANUAL_JOB_ALLOWLIST = new Set(["supabase-backup", "tv-cache-evict"]);

router.post(
  "/api/cockpit/sync/run/:jobName",
  requirePermission("manage_settings"),
  async (req, res) => {
    const name = String(req.params.jobName);
    if (!MANUAL_JOB_ALLOWLIST.has(name)) {
      return res.status(403).json({ error: "Job cannot be manually run" });
    }
    await runJob(name);
    res.json({ ok: true, jobName: name });
  }
);
```

### F-03 - Legacy channel message endpoints bypass board permissions

- Severity: High
- Affected files: `server/routes.ts:97-109`, `server/routes/messages.ts:1311-1366`, `server/lib/board-channel-permissions.ts:84-107`
- Why it matters: New board routes support per-channel view/post/manage checks, but legacy `/api/channels/:id/messages` routes can read and post by numeric channel id with only authentication.
- Safe reasoning: The legacy route does not load channel permissions, check locked state, or call `canViewChannel`/`canPostInChannel`.
- Recommended fix: Remove the legacy routes if the frontend no longer needs them. If compatibility is required, adapt them to the same permission helpers used by `server/routes/board.ts`.

### F-04 - Buyback swap intent is trusted before on-chain confirmation

- Severity: High
- Affected files: `server/routes/buyback-windows.ts:445-490`, `server/routes/side-quests.ts:204-236`, `server/lib/wtf-recapture-watcher.ts:131-215`
- Why it matters: User-submitted swap intent updates `swappedWtf` immediately. Side-quest auto-verification then trusts `swappedWtf`, so reward logic can treat an unconfirmed or fake op hash as a completed buyback swap.
- Safe reasoning: The watcher later consumes confirmed wallet events, but the side-quest auto-verification path does not require watcher-confirmed evidence.
- Recommended fix: Store swap intent as pending. Only the watcher should update confirmed swap totals after matching sender, operator wallet, contract, token id, amount, window, and op hash.

### F-05 - Paid side-quest completion does not require confirmed entry-fee payment

- Severity: High
- Affected files: `server/routes/side-quests.ts:470-539`, `server/routes/wtf-recapture.ts:167-230`
- Why it matters: A quest can have `entryFeeWtf`, but the completion endpoint does not require a confirmed `side_quest_entry_fees` row before submission, auto-approval, or reward distribution.
- Safe reasoning: The completion route checks quest status/deadline/max completions and auto-verification, but no entry-fee check appears.
- Recommended fix: If `entryFeeWtf > 0`, require a matching confirmed fee row before accepting completion or before any approval/reward path.

### F-06 - Backup defaults do not create immutable off-host dump bytes

- Severity: High
- Affected files: `server/lib/backup/targets/local.ts:10-24`, `server/lib/backup/targets/supabase.ts:126-181`, `server/lib/backup/pipeline.ts:151-154`
- Why it matters: Local dumps default to 2-day retention. Supabase defaults to manifest mode, which uploads metadata/hash but not the dump bytes. A host compromise or volume deletion can leave no restorable off-host database backup.
- Safe reasoning: Static code shows local retention and manifest-only remote default. No secret or live backup target was inspected.
- Recommended fix: Add an immutable off-host target (Drive/S3/B2/restic/borg) and require restore drills. In production, alert or fail health if no remote target stores actual dump bytes.

### F-07 - Cookie-authenticated write routes lack a CSRF token layer

- Severity: High
- Affected files: `server/app.ts:205-255`, `server/auth/passport.ts:45-50`, many `POST`/`PUT`/`DELETE` routes
- Why it matters: Sessions use cookies with `sameSite: "lax"`, which is helpful but not a full CSRF control for all browser/form/navigation edge cases or future same-site subdomain surfaces.
- Safe reasoning: No CSRF middleware/token validation was found in the route stack. Existing bounty WTF-BB-014 already tracks this.
- Recommended fix: Add a synchronizer or double-submit CSRF token for cookie-authenticated state-changing routes. Exempt only signed webhooks and explicitly token-authenticated service endpoints.

### F-08 - Uploaded media files/metadata are exposed without consistent ownership checks

- Severity: High
- Affected files: `server/routes/media-library.ts:75-87`, `server/routes/media-library.ts:189-310`
- Why it matters: `GET /api/media/:id` returns any media row to any logged-in user, and `GET /api/media/:id/file` is public. Upload IDs are numeric and file responses are public-cacheable.
- Safe reasoning: The update/delete/usage routes have owner/staff checks; read/file routes do not. Existing bounty WTF-BB-015 tracks public file access.
- Recommended fix: Require owner/staff checks for metadata and raw files, or issue short-lived signed URLs for public playback surfaces that truly need anonymous viewing.

### F-09 - Manual cockpit wallet sync accepts arbitrary wallet targets

- Severity: Medium
- Affected files: `server/routes/cockpit.ts:292-304`
- Why it matters: Any logged-in user can enqueue indexing for arbitrary wallet strings, causing upstream work and queue noise.
- Recommended fix: Validate Tezos address format and require a matching `user_wallets` row unless the caller has a staff permission.

### F-10 - Wallet-login proof is not bound to submitted wallet address

- Severity: Medium
- Affected files: `server/auth/wallet-verify.ts:1-5`, `server/auth/routes.ts:844-917`, `server/auth/routes.ts:926-960`, `server/routes/wallets.ts:119-123`
- Why it matters: The challenge signs only a nonce. Login/register derive an address from the public key but do not require `verifyPublicKeyOwnership(walletAddress, publicKey)` before nonce consumption. The stronger pattern already exists in the authenticated wallet-link route.
- Recommended fix: Include wallet address, action, origin, and expiry in the signed message, and require public-key ownership match before consuming the nonce.

### F-11 - W link preview follows redirects before validating every target

- Severity: Medium
- Affected files: `server/routes/w.ts:378-389`, `server/routes/w.ts:519-545`, `server/routes/tv.ts:642-666`
- Why it matters: A public URL can redirect server-side preview fetching to a private/local target before final URL validation.
- Recommended fix: Use manual redirects and validate each `Location` before following. Reuse the TV redirect-guard pattern.

### F-12 - Particle Painter expects Pinata JWT in Vite client env

- Severity: Medium
- Affected files: `PP/src/services/teiaService.ts:39-64`, `PP/src/vite-env.d.ts:4`
- Why it matters: `VITE_*` variables are bundled into the browser. A real Pinata JWT here would be exposed to every user.
- Recommended fix: Move Pinata uploads behind an authenticated server relay with file type/size checks.

### F-13 - OAuth/Studio encryption falls back to `SESSION_SECRET`

- Severity: Medium
- Affected files: `server/auth/oauth-crypto.ts:8-22`, `server/lib/studio/crypto.ts:35-53`
- Why it matters: Reusing the session secret for persisted OAuth/Studio credentials couples token decryptability to session-secret rotation and broadens the impact of one secret leak.
- Recommended fix: Require dedicated `TWITTER_TOKEN_ENCRYPTION_KEY` and `STUDIO_CRYPTO_KEY` in production; fail closed if missing.

### F-14 - W media IDs are accepted by format only

- Severity: Medium
- Affected files: `server/routes/w.ts:2125-2150`, `server/routes/w.ts:2813-2864`, `server/routes/w.ts:3162-3269`
- Why it matters: W post/DM flows accept numeric media IDs without checking that the media was uploaded/owned by the caller's X account. Existing bounty WTF-BB-032 tracks this.
- Recommended fix: Track X media upload ownership/session server-side and allow only IDs generated for the current WTF user and X identity.

### F-15 - TV/cache/client-log/media route prefixes bypass generic API rate limiting

- Severity: Medium
- Affected files: `server/app.ts:62-75`, `server/routes/system-logs.ts:36-55`, `server/routes/tv.ts:4357-4482`, `server/routes/media-library.ts:189-310`
- Why it matters: The bypass includes unauthenticated or write-heavy routes such as client log ingestion, TV cache/prefetch, media upload/file routes, and broad TV prefixes. Existing bounties WTF-BB-016, WTF-BB-056, and WTF-BB-017 track these.
- Recommended fix: Replace prefix-wide bypass with endpoint-specific limiters and concurrency/byte quotas.

### F-16 - Profile PFP update stores arbitrary image URLs

- Severity: Medium
- Affected files: `server/routes/profile.ts:236-256`, `server/lib/thumbnail-url.ts:68-95`
- Why it matters: The PFP endpoint stores arbitrary `imageUrl` into public avatar fields while token-derived candidate code uses a sanitizer.
- Recommended fix: Require `sanitizeThumbnailUrl(imageUrl)` and verify positive holdings when a token contract/id is supplied.

### F-17 - Broad cohost defaults include destructive user-management actions

- Severity: Medium
- Affected files: `shared/types.ts:468-473`, `server/routes/admin.ts:301-386`
- Why it matters: Cohosts get every permission except role/reward management. A compromised or misassigned cohost can hard-delete many user rows and cascading content.
- Recommended fix: Split `manage_users` into support, temp-password, disable, and destructive delete permissions. Prefer soft-disable for public-launch accounts.

## Dependency Results

Root app, production dependencies:

- Command: `npm audit --omit=dev --json`
- Result: 33 total vulnerabilities: 1 critical, 14 moderate, 18 low.
- Main launch blocker: `passport-twitter -> xtraverse -> xmldom@0.6.0`.
- Other notable moderate items include Taquito/StableLib signature-malleability advisory, `axios` SSRF-related advisories, `follow-redirects`, `postcss` through styled-components.

Particle Painter (`PP`), production dependency audit:

- Result: 25 total vulnerabilities: 4 high, 5 moderate, 16 low.
- Notable high items include transitive `axios`, `defu`, `h3`, and `picomatch` advisories.
- Treat PP as untrusted/not launch-ready until dependencies are updated and the Pinata JWT flow is moved server-side.

Discord bot extension:

- Result: 0 production vulnerabilities reported by `npm audit --omit=dev --json`.

## Recommended Patch Order

1. Remove or lock down legacy Twitter OAuth 1.0 and clear the critical `xmldom` audit result.
2. Restrict cockpit job triggering and arbitrary wallet sync.
3. Remove or permission-wrap legacy `/api/channels/*` message routes.
4. Fix buyback/side-quest payment gates so only watcher-confirmed chain events satisfy rewards or paid entry.
5. Add CSRF protection to cookie-authenticated writes.
6. Make uploaded media files private or signed by default.
7. Add an immutable off-host backup target and run a restore drill.
8. Harden W link-preview redirects and route-specific rate limits.
9. Bind wallet auth signatures to wallet/action/origin/expiry.
10. Move Pinata uploads behind a server relay before exposing Particle Painter.

## Launch-Blocking Issues

- F-01, F-02, F-03, F-04, F-05, F-06, F-07, and F-08 should block public launch.
- Existing open bounties WTF-BB-014, WTF-BB-015, WTF-BB-016, WTF-BB-017, WTF-BB-032, WTF-BB-056, and WTF-BB-057 should remain visible until fixed or explicitly accepted.

## Nice-To-Have Hardening

- Reduce global JSON body limit from 40 MB and use route-specific larger limits only where required.
- Add DNS/IP resolution checks to `normalizePublicHttpUrl` for SSRF-sensitive server-side fetchers.
- Add structured security audit logs for destructive admin operations and manual job runs.
- Review cohost/staff defaults and add a "break glass" permission for destructive operations.
- Add restore-drill automation and backup age/target health to `/api/health/disk` or a staff-only health endpoint.
- Add tests for route authorization boundaries: ordinary user, contestant, cohost, host, admin.
- Add dependency audit CI gates for root, `PP`, and `extensions/wtf-gameshow-bot`.

## Final Public-Launch Checklist

- [ ] `npm audit --omit=dev` has no critical/high production vulnerabilities in root or deployable subprojects.
- [ ] Ordinary users cannot run cockpit jobs, enqueue arbitrary wallets, or access legacy channel routes beyond their permissions.
- [ ] CSRF tokens protect all cookie-authenticated write routes.
- [ ] Media library raw file URLs are owner-checked or signed.
- [ ] Paid quests and buyback swaps rely only on watcher-confirmed chain evidence.
- [ ] Wallet login/register challenges bind nonce, wallet address, origin, action, and expiry.
- [ ] Backups include restorable off-host dump bytes with retention and a documented restore drill.
- [ ] TV/cache/log ingestion endpoints have endpoint-specific rate, byte, and concurrency limits.
- [ ] Particle Painter has no client-side Pinata JWT and uploads through a server relay.
- [ ] Cohost/staff destructive permissions are split and least-privilege by default.
