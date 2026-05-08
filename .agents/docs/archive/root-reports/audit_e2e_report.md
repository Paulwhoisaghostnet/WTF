# WTF Gameshow — End-to-End Audit

**Date:** 2026-04-17  
**Commit audited:** `cb95e5a` on `main`  
**Deployment:** `https://wtfgameshow.app` (Hetzner + Cloudflare + Caddy + Docker Compose)  
**Scope:** full stack — client (React 19 / Vite 8), server (Express 5 / Drizzle / Postgres 16), WebSocket layer, Studio storage drivers, wallet/OAuth auth, deployed infra, SmartPy contracts, and CI/CD

## Health at a glance

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | **PASS** — 0 errors |
| External link safety gate | **PASS** — all `target="_blank"` links have `rel="noopener noreferrer"` |
| CI quality gates (last run) | **PASS** |
| Deploy workflow (last run) | **PASS** — retry-hardened |
| Production containers | **3/3 healthy** (`app`, `postgres`, `caddy`) |
| `/api/health` | `status: ok` at expected SHA |
| DB schema | **56 public tables**, all expected |
| TV cache | 2.77 GiB / 10 GiB budget (139 files, all immutable) |
| Disk `/` on server | **81 % used** (58G / 75G) — tight |

Overall the stack is in good shape, but there are a handful of findings worth prioritising — one in particular lets an authenticated user weaponise file uploads into same‑origin XSS.

---

## HIGH — fix this week

### H1. Stored XSS via Studio file uploads rendered as same‑origin HTML/SVG
**Location:** `server/routes/studio-files.ts` lines ~59‑73 (allowlist) + lines ~374‑390 (serve)  
**Impact:** authenticated Studio member → session theft of any victim who opens the served file.

```59:73:server/routes/studio-files.ts
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "text/",
  "application/pdf",
  "application/json",
  "application/zip",
  "application/octet-stream",
];

function mimeAllowed(mime: string): boolean {
  const m = String(mime || "").toLowerCase();
  if (!m) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => (p.endsWith("/") ? m.startsWith(p) : m === p));
}
```

- `text/` prefix covers `text/html` → inline HTML/JS.
- `image/svg+xml` matches `image/` → SVG with `<script>` executes when opened directly.
- The raw serve path propagates the stored `mime_type` onto `Content-Type` and streams inline — no `Content-Disposition: attachment`. `X-Content-Type-Options: nosniff` is present from helmet but does **not** override an explicit `Content-Type: text/html`.
- CSP is strong for the SPA but `script-src` includes `'unsafe-inline'`, so inline scripts inside a served HTML file execute with the WTF session.

**Remediation (pick two):**
1. Drop `text/` prefix and `application/octet-stream` from the allowlist; only permit exact `text/plain`, `text/markdown`, `text/csv`. Reject `image/svg+xml` explicitly (or convert to PNG in the preview pipeline before ever streaming).
2. On `/api/studio/files/:id/raw` and `/preview`, always send `Content-Disposition: attachment; filename=…` for any mime that isn't in a hard‑coded "safe to inline" list (images except SVG, audio, video, PDF).
3. Long‑term: serve user files from a cookieless sibling origin (e.g. `files.wtfgameshow.app`) with its own CSP and no session cookie reachability.

### H2. Critical‑rated transitive vuln in an unused declared dep
`npm audit` flags `xmldom` (GHSA‑h6q6‑9hqw‑rwfv) critical and GHSA‑wh4c‑j3r5‑mjhp high. It arrives via `xtraverse` → `passport‑twitter`. **`xtraverse` is declared in `package.json` but never imported anywhere in the source tree** — confirmed by repo‑wide grep.

**Remediation:** remove `xtraverse` from `dependencies` entirely (zero runtime effect). For the transitive `passport‑twitter` → `xtraverse` chain, take the breaking update `passport-twitter@0.1.5` (removes the xmldom dependency path) — we already use passport‑twitter so this is a one‑step bump + smoke test of the Twitter OAuth link flow on `/profile`.

### H3. High‑severity `vite` path‑traversal advisory
`vite 8.0.3` installed, latest `8.0.8`. GHSA‑4w7w‑66w2‑5vf9 (source‑map path traversal in dev server). Only the dev server is affected — production uses the built `dist/index.cjs` — but bumping is one line in `package.json`.

### H4. `express-rate-limit` declared but never installed, never imported
`package.json` lists `express-rate-limit@^8.3.2` in prod deps. `node_modules/express-rate-limit` does not exist locally and no file imports it. The actual rate limiting is a **homegrown in‑memory map** in `server/app.ts` (`createInMemoryRateLimit`). That's fine for today's single‑process deploy, but there are two concrete issues:

- The declared-but-unused package is dead weight in `package.json` and implies coverage that doesn't exist.
- The real limiter is process‑local — **horizontally scaling the app or even an in‑place container restart resets every counter.** An attacker hitting `/api/auth/login` during a rolling restart gets a fresh 20‑attempts window every time.

**Remediation:** pick one of
1. Delete the dead declaration (drop `"express-rate-limit"` line) and note the homegrown limiter is deliberate.
2. Migrate to `express-rate-limit` + `rate-limit-redis` or `rate-limit-postgres` store so limits survive restarts and can shard — worth doing before we scale past one app container.

---

## MEDIUM

### M1. Password policy inconsistency
- `POST /api/auth/register` requires `password.length >= 6` (`server/auth/routes.ts:134`).
- `POST /api/auth/change-password` requires `newPassword.length >= 8` (`server/auth/routes.ts:260`).
- Register has **no max length** — long passwords hash through scrypt synchronously → trivial CPU DoS.

**Fix:** make both paths enforce `8 ≤ length ≤ 200` and add the same check to `POST /api/auth/wallet/register`.

### M2. Container runs as `root`
`Dockerfile` has no `USER` directive. `node:20-slim` launches as root, giving any post‑exploitation path (e.g. template‑injection, RCE) full FS write on the container layer. Quick win:

```dockerfile
RUN groupadd -r app && useradd -r -g app -d /app app && chown -R app:app /app
USER app
```

### M3. WebSocket `SESSION_SECRET` dev fallback lacks a production guard
`server/websocket.ts:33`:

```ts
const SESSION_SECRET = process.env.SESSION_SECRET || "wtf-gameshow-dev-secret";
```

`server/auth/passport.ts:33‑37` correctly **throws** when `NODE_ENV === "production"` and `SESSION_SECRET` is unset, but the WS module quietly falls back to the hard‑coded dev value. Production is fine today because env is set, but this is an inconsistent defense‑in‑depth gap — if env loading ever fails or is partial, cookies become forgeable. Lift the production check into a shared `getSessionSecret()` and fail fast on import.

### M4. `cross-origin-resource-policy: cross-origin` is more permissive than needed
Helmet config sets `crossOriginResourcePolicy: { policy: "cross-origin" }`. Drop to `"same-site"` unless we're intentionally embedding assets on other origins. Same for `crossOriginEmbedderPolicy: false` — keep disabled only while the TV microapp needs to iframe third‑party media (currently yes).

### M5. Taquito moderate transitive vuln — ed25519 signature malleability
`@stablelib/ed25519 ≤ 2.0.2` (GHSA‑x3ff‑w252‑2g7j). Our wallet login verifies via `@taquito/utils@24.2.0` which still pulls a vulnerable `@stablelib/ed25519`. The malleability means an attacker who already has a valid signed challenge can produce a second, valid‑looking signature for the same message.

In our flow the nonce is **consumed atomically** on first successful verify (`consumeWalletAuthNonce`), so we don't re‑verify and the second signature has nowhere to land. Still a yellow flag — track upstream and bump as soon as taquito cuts a fixed release.

### M6. No session regeneration on login
`req.login()` does not rotate the session id. Minor session‑fixation weakness — if an attacker tricks a victim into using a pre‑set session before login, the post‑login session inherits the planted id.

**Fix:** call `req.session.regenerate` → `req.login` inside `/api/auth/login`, `/api/auth/wallet/verify`, and the OAuth callbacks.

### M7. Production server disk at 81 %
`/var/lib/docker` is on the same partition as `/`. TV cache is at 2.77 GiB / 10 GiB budget and uploads/Studio blobs will grow against the same disk. A single big Studio project (5 GB quota × N projects) will tip this over fast.

**Fix:** add disk‑usage alert now (5 minutes with a `df` cron + post to the admin DM), and plan a move of the Docker data root or the `uploads/studio` volume onto Hetzner block storage.

---

## LOW

### L1. `.env` drift vs `.env.example`
Keys present in `.env` but missing from `.env.example`:

- `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `STUDIO_CRYPTO_KEY`
- `TV_CACHE_MAX_TOTAL_BYTES`

New ops onboarding a fresh environment won't know to set these. Mirror them into `.env.example` (with empty / default values + a comment).

### L2. Dead code in `studio-drive.ts` status endpoint
`server/routes/studio-drive.ts:62‑84` runs two nearly identical queries and overwrites `projectCount` — the first select‑with‑count is dead. Not a bug, just wasted round trip.

### L3. No React `ErrorBoundary` in the client tree
A render error anywhere inside `client/src` unmounts the whole app. Given we now have TV, Studio, Board, and wallet surfaces mounted side‑by‑side, a single broken component can nuke the session screen. Drop an `ErrorBoundary` around `App` and a smaller one per microapp route.

### L4. Permissive CSP `connect-src` / `style-src`
- `connect-src 'self' https: wss: ws:` allows exfil to any HTTPS endpoint. If we can enumerate the actual domains we call (TzKT, tzprofiles, Google Drive API, Supabase, Objkt), switch to an allowlist.
- `style-src 'self' 'unsafe-inline'` is needed today by styled‑components — if we can emit nonces we can drop `unsafe-inline`. Not worth doing until SC releases nonce support.

### L5. No WebSocket heartbeat
`server/websocket.ts` never pings. Half‑open connections linger in the `clients` set until the process restarts. Low impact now, but add a 30 s ping with a 60 s pong deadline before we scale presence across multiple Studio projects.

### L6. Outdated dependencies (non‑security)
`npm outdated` shows routine minor/patch churn for `@tanstack/react-query`, `react`, `vite`, `styled-components`, etc. Mostly safe bumps — worth batching into a single dependency‑update PR.

### L7. No max chat content length enforced on the DM HTTP path
WS chat caps at `10_000` chars (`websocket.ts:19`). The HTTP DM endpoint (`messages.ts`) should re‑check the same cap on server side. Spot‑check required.

---

## What's solid

Worth recording — we do a lot right, and I don't want to lose track of it next time we revisit:

- **Parameterised queries everywhere.** Drizzle's tagged `sql` and `pool.query($N, …)` — no string interpolation into SQL anywhere I looked. No SQLi risk.
- **Robust Studio access model.** `resolveStudioAccess` is the single gate used by both HTTP handlers and the WS layer. Permission‑based capability helpers (`canEditFiles`, `canAnnotate`, `canInvite`, `canManageProject`) prevent role drift. Platform moderators override correctly.
- **AES‑256‑GCM for OAuth refresh tokens.** Proper 12‑byte IV, 16‑byte auth tag, SHA‑256 key derivation, safe base64url encoding (`server/lib/studio/crypto.ts`). Falls back to `SESSION_SECRET` in dev with a warning.
- **Path‑traversal hardening on local disk driver.** Explicit rejection of `.`, `..`, and `\0` per URI segment before `path.join`. URIs aren't URL‑decoded prior to parsing so percent‑encoded bypasses degrade to literal filenames inside the storage root.
- **Wallet auth.** Nonce is atomically consumed on first verify, `publicKeyToAddress` cross‑checks the claimed address, `verifyWalletSignature` uses taquito's `verifySignature`. Wallet‑only accounts can later set a password via `/api/auth/change-password` without losing prior sessions.
- **Session security basics.** `httpOnly`, `sameSite: "lax"`, `secure: production`, 7‑day cookie. Session store in Postgres via `connect-pg-simple`. Production fails fast if `SESSION_SECRET` is unset. Other sessions of a user are killed on password change, preserving the current one.
- **CSRF.** Sensitive endpoints are POST/PUT/DELETE with JSON, protected by `sameSite: "lax"`. Studio Drive OAuth uses a 24‑byte random state token stored in session with a 10‑minute TTL.
- **WS authn uses `timingSafeEqual`.** Session cookie unsigning is custom but correct and constant‑time.
- **Upload limits.** Multer caps at 200 MB global, per‑backend caps enforced before writing bytes, quota reserved atomically via a conditional update.
- **CI gates + retry‑hardened deploy.** `check`, `check:external-links`, and build pass. Deploy retries `docker compose up -d` 3× with cleanup between attempts — the fix that landed in `cb95e5a`.
- **Production security headers.** CSP (with `object-src 'none'` and `script-src-attr 'none'`), HSTS 1 y with subdomains, nosniff, SAMEORIGIN, `referrer-policy: no-referrer`, COOP `same-origin`.
- **Typecheck clean** and **external‑link gate green**, so CI is signalling correctly.

---

## Recommended action order

1. **This week:** H1 (Studio file‑serving hardening), H2 (drop `xtraverse`, bump `passport‑twitter`), M1 (password policy), M2 (Docker non‑root).
2. **Next week:** H3 (vite bump), H4 (pick: delete dead dep or introduce real persistent rate limiter), M3 (shared `SESSION_SECRET` guard), L1 (`.env.example` sync).
3. **Next month:** M6 (session rotation), M7 (disk monitoring + volume plan), L3 (ErrorBoundary), L5 (WS heartbeat), L6 (dep bump PR).
4. **Track upstream:** M5 (taquito / @stablelib/ed25519).

I'm happy to knock out items 1 and 2 in a single PR — let me know which pieces you want bundled and I'll get on it.
