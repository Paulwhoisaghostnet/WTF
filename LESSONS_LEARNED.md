# WTF Lessons Learned Log

**MANDATORY**: Every agent MUST read this file before starting work and append new entries after completing a pass that involved debugging, fixing, or correcting any issue. Entries must capture what went wrong, why, and what to do differently. Do not delete or edit existing entries.

---

## 2026-04-28 — Token refresh broken in DM sync jobs

**What happened**: The background DM sync workers (`x-dm-sync.ts`) were constructing a stripped-down user object with only `twitterOauth2AccessToken` and `twitterOauth2Scopes` when calling `getUserXOAuth2AccessToken`. This object was missing `twitterOauth2RefreshToken`, `twitterOauth2ExpiresAt`, and `id`.

**Why it mattered**: `getUserXOAuth2AccessToken` checks `user.twitterOauth2ExpiresAt` to decide whether to refresh. Since that field was `undefined`, it evaluated to `0` (falsy), skipping the refresh check entirely. The function returned the expired access token raw, which then hit 401 on every X API call. Meanwhile `refreshUserToken` needs `user.twitterOauth2RefreshToken` and `user.id` to refresh and persist — both were missing.

**Fix**: Select the full set of token fields from the users table and pass the complete object. Never construct a partial user object for token operations.

**Rule**: When calling `getUserXOAuth2AccessToken`, always pass an object that includes at minimum: `id`, `twitterOauth2AccessToken`, `twitterOauth2RefreshToken`, `twitterOauth2ExpiresAt`, `twitterOauth2Scopes`.

---

## 2026-04-28 — Stale persisted env OAuth2 token poisoning boot

**What happened**: The `w.env_oauth2_tokens` row in `platform_settings` contained a refresh token from a previous rotation cycle. X OAuth2 refresh tokens are single-use — once used, X issues a new one and the old one is permanently dead. On every boot, `loadPersistedEnvOAuth2Tokens` loaded the stale token, overriding the (possibly valid) `X_OAUTH2_REFRESH_TOKEN` env var.

**Why it mattered**: Every sync tick tried to refresh with the dead token, got 400, logged an error, and fell through to the user-record path. This wasted an API call to X's token endpoint on every single sync cycle (dozens per hour) and spammed the logs.

**Fix**: Deleted the stale row. Added exponential backoff so if env refresh fails, it waits 15min before retrying (doubling up to 4h). The stale token no longer gets retried every 60 seconds.

**Rule**: X refresh tokens are single-use. If a refresh succeeds, the OLD refresh token is dead forever. When persisting tokens, always store the NEW refresh token from the response. If refresh fails, back off — do not retry on the next tick.

---

## 2026-04-28 — No rate-limit circuit breaker on DM sync

**What happened**: The three DM sync jobs (groupchat, users, backfill) ran independently with no shared rate-limit awareness. When one job hit a 429, the other two would still fire their API calls and also get 429'd. With jobs running every 60s–180s, this meant continuous 429 responses burning API quota and risking account suspension.

**Why it mattered**: X DM endpoints share an app-level rate bucket. One 429 means the entire bucket is drained for all endpoints. Continuing to call after a 429 is wasteful and risks getting the app banned.

**Fix**: Added a global `dmRateLimitedUntil` timestamp. When any DM call returns 429, ALL sync jobs check this timestamp before making any API call and skip their entire cycle if the window hasn't passed. The reset time comes from X's `x-rate-limit-reset` header or defaults to 15 minutes.

**Rule**: Always implement a shared circuit breaker for API endpoints that share a rate bucket. A 429 on one endpoint means stop ALL calls to that bucket.

---

## 2026-04-28 — Platform token fallback leaking private DMs

**What happened**: User-facing DM routes (`/api/w/user-dms`, `/api/w/user-dms/:conversationId/messages`) had a fallback that used the platform token when the user's token was unavailable. This meant viewing user A's inbox could return DMs from the platform account's inbox instead.

**Why it mattered**: Catastrophic privacy violation. Users could see DMs belonging to `_transparentart` or `wtf_gameshow`.

**Rule**: Platform token is ONLY for reading the public timeline and the designated gameshow groupchat. It must NEVER be used as a fallback on any user-facing DM route. If the user has no token, serve from their DB cache or return 403.

---

## 2026-04-28 — Group chats appearing in DMs tab

**What happened**: Conversations were categorized as "DM" or "group" based on the `type` field from X API responses, but X doesn't always include a clean type. Group conversations with only a numeric ID (no `g` prefix) and incomplete participant data were miscategorized.

**Fix**: Classify by participant count: 2 participants = DM, more than 2 = group chat. Also check for `g` prefix on conversation ID and `type.includes("group")` as secondary signals.

**Rule**: Never rely solely on a single field for conversation type. Use participant count as the primary signal, with ID prefix and type string as fallbacks.

---

## 2026-04-28 — Groupchat data in DB but route returned empty

**What happened**: The `GET /api/w/groupchat` route checked `platformStatus.token` first. If the token was null (refresh failed), it returned empty results immediately without checking the database, even though the DB had 500+ perfectly good cached messages.

**Fix**: Made the route DB-first — `loadGroupchatFromDb` is called inside the cache loader before any X API attempt.

**Rule**: Always implement DB-first reads for cached content. Token availability should only affect whether NEW data is fetched, not whether EXISTING cached data is served.

---

## 2026-04-28 — DB-first helper must not call X with an empty bearer

**What happened**: The correct plan was to remove the outer platform-token guard from `GET /api/w/groupchat`, but a naive implementation would pass an empty string into `fetchGameshowGroupchats`. That helper is DB-first, but when the DB is cold it falls through to live X calls. Passing `""` would then produce noisy unauthorized X calls instead of a clean cached-data response.

**Why it mattered**: Fixing the route-level DB short-circuit must not create a new tokenless X request path. If the platform token is unavailable, W may serve cached DB data but must not attempt a live DM fetch.

**Fix**: Let `fetchGameshowGroupchat(s)` accept `string | null`, use a `db-only` cache key when no token exists, return a cold-cache diagnostic instead of calling X, and keep live X bootstrap available only when a real token exists.

**Rule**: DB-first means "serve DB before X" and "do not call X at all without a valid token." Never use an empty bearer as a control-flow placeholder.

---

## 2026-04-28 — Sync and routes used different groupchat setting keys

**What happened**: The HTTP route resolved configured gameshow conversations from the singular key `w.gameshow_dm_conversation_id`, while the background sync worker only checked the plural key `w.gameshow_dm_conversation_ids`. Production had the singular key, so the UI and worker could disagree about which groupchat should be mirrored.

**Why it mattered**: A DB-first UI only works if the sync job warms the same conversation IDs the UI reads. Mismatched setting keys make the route look correct while the worker silently starves the DB.

**Fix**: The sync worker now checks both keys, preferring plural when present, then singular, then env/default values.

**Rule**: Shared configuration keys must be resolved through one compatible path or explicitly support all legacy keys. Route and worker config drift causes invisible data-pipeline failure.

---

## 2026-04-28 — Expired env OAuth2 access token returned after refresh failure

**What happened**: `getEnvOAuth2AccessToken()` attempted to refresh an expired env OAuth2 token, but if refresh failed (or was in backoff), it still fell through and returned the old `envOAuth2AccessToken`. `getPlatformXOAuth2Status()` then reported `source: "env-oauth2"` with a bearer that X immediately rejected as 401.

**Why it mattered**: A stale env access token blocked the healthier fallback path to the linked `W_X_DEFAULT_ACCOUNT_HANDLE` user record. Diagnostics misleadingly showed "platform token via env-oauth2" even though the token was unusable, and groupchat/admin tests hit X with a known-bad bearer.

**Fix**: If the env token needs refresh and refresh does not return a new token, `getEnvOAuth2AccessToken()` now returns `null` immediately. That lets platform resolution continue to the user-record token instead of using stale env credentials.

**Rule**: After refresh failure, never return the stale access token. Failed refresh means "this token source is unavailable"; allow the next token source or DB-first read path to handle the request.

---

## 2026-04-28 — TTL caches still leak if stale keys are only trimmed on exact-key reads

**What happened**: Two different W runtime maps looked "TTL-based" at first glance, but both only enforced freshness when the same key was read again. The generic `/api/*` rate limiter kept every distinct source key in memory forever, and the W actor-id cache kept expired entries unless that exact user/token combination came back.

**Why it mattered**: TTL alone does not bound memory in long-lived, high-cardinality traffic. Quiet keys never revisit the hot path, so they never self-delete. Over time that turns "small helper maps" into uptime-coupled memory growth.

**Fix**: Added two bounded-retention helpers: the generic API limiter now runs periodic stale-key sweeps plus a hard tracked-key cap, and the W actor-id cache now uses a bounded expiring cache that sweeps stale entries and evicts the least-recently-used tail when cardinality grows.

**Rule**: For any process-local cache or limiter keyed by user/IP/token, never rely on per-key reads for cleanup. Pair TTL with explicit global reaping and a hard max entry cap.

---

## 2026-04-28 — TV config reads must not depend on arbitrary row order

**What happened**: WTF TV config consumers (`refreshWtfPlaylist`, admin WTF TV routes, and the TV boot backfill dial pin) were reading `tv_wtf_channel_config` with a bare `LIMIT 1`. If the table ever contained more than one row, Postgres was free to hand back whichever row happened to come first.

**Why it mattered**: Auto-refresh could target the wrong channel, admin updates could keep editing the wrong config row, and boot-time dial pinning could disagree with runtime TV behavior. Because `channel_id` is nullable and there is no uniqueness guard yet, duplicate or placeholder rows are a realistic state.

**Fix**: Added a shared resolver that deterministically prefers rows with a real `channel_id`, then enabled rows, then the newest `updatedAt` / highest `id`. All affected TV config call sites now use that resolver instead of trusting unspecified row order.

**Rule**: Any "singleton" config table without a hard DB uniqueness guarantee must still resolve rows deterministically in application code. Never use `LIMIT 1` alone as a singleton selector.

---

## 2026-04-28 — DM sends worked on X but W showed no evidence

**What happened**: The user OAuth write path was correct — DMs sent from W appeared in X from the right account — but W kept showing no evidence because successful sends did not clear the server-side DM inbox/thread read caches. The UI also listed user group chats inside the Group Chats tab, but clicking one set the direct-message selection and switched to the Direct Messages tab.

**Why it mattered**: This made a working OAuth path look broken. X had accepted and delivered the DM, but W immediately re-served stale cached reads and routed group conversations through the wrong tab, so the app contradicted the source of truth.

**Fix**: Clear `user-dms-inbox` and `user-dm-thread` caches after successful user DM sends, persist live user DM read payloads into `x_dm_*`, merge DB conversation metadata into live conversation classification, and keep user groupchat selection/rendering inside the Group Chats tab.

**Rule**: After any successful write to a cached external inbox, invalidate the exact read caches that back the UI. Conversation category should control UI placement: group conversations stay in Group Chats, two-party conversations stay in Direct Messages.

---

## 2026-04-28 — Playlist replacement must be atomic

**What happened**: The TV playlist replace route deleted all existing `tv_playlist_items` for a playlist and then inserted the replacement rows afterward, but those writes were not wrapped in a transaction.

**Why it mattered**: Any insert failure after the delete would strand the playlist in a partially rebuilt or empty state. For a live TV queue, that turns a single write error into a user-visible outage.

**Fix**: Wrapped the delete-and-reinsert sequence in one DB transaction so the old queue remains intact unless the full replacement write succeeds.

**Rule**: Destructive "replace all children" flows must be all-or-nothing. If the operation starts with `DELETE`, it almost always belongs inside a transaction.

---

## 2026-04-28 — Production CORS must fail closed when origin allowlist is empty

**What happened**: `server/app.ts` resolved allowed origins from `CORS_ALLOWED_ORIGINS` and `PUBLIC_SITE_URL`, but if neither was configured it still returned `{ origin: true, credentials: true }` from the CORS middleware factory. In production that reflected any request origin while also allowing credentials.

**Why it mattered**: A missing allowlist silently downgraded production into credentialed origin reflection instead of a clear boot-time failure. That weakened the cookie/auth boundary exactly when config drift was already present.

**Fix**: Make production throw during boot when no allowed origin resolves. Keep the permissive reflected-origin fallback only outside production so local/dev loops still work.

**Rule**: Security allowlists that protect credentialed browser boundaries must fail closed in production. If required origin config is missing, refuse to boot instead of silently broadening trust.

---

## 2026-04-28 — Database TLS helpers must not silently downgrade certificate checks

**What happened**: Several Supabase helper scripts were generating `sslmode=no-verify` URLs or passing `rejectUnauthorized: false` directly to the Postgres client. That meant TLS was present but server certificate validation was intentionally disabled by default.

**Why it mattered**: A helper that silently disables verification normalizes insecure DB access, leaks into copied connection strings, and leaves credentialed migration/admin traffic open to interception if the network path is compromised.

**Fix**: Restored verified TLS as the default for Supabase URL generation and connection checks. Added a single explicit `ALLOW_INSECURE_DB_TLS=1` emergency escape hatch that logs loudly when used.

**Rule**: TLS exceptions must be explicit, temporary, and noisy. Default connection helpers should verify certificates; never bake `no-verify` into the happy path.

---

## 2026-04-28 — Deploy-time schema work must finish before the app boots

**What happened**: The deploy workflow started the full Compose stack first, which meant the production app, background jobs, and boot backfills could run against the old schema while SQL migrations were still pending. After that, the same deploy also invoked `drizzle-kit push --force` from inside the long-lived runtime container, creating a second schema authority and exposing the deploy to non-interactive Drizzle prompts.

**Why it mattered**: Deploys could run jobs against a partial schema, then restart the app again after migrations. The extra Drizzle push path also expanded the runtime image surface area and made deploy success depend on tooling that was not needed once SQL migrations were already the production path.

**Fix**: Start only `postgres` for the migration phase, wait for `pg_isready`, apply SQL migrations before the app boots, remove the production `drizzle-kit push --force` step, and stop installing `drizzle-kit` into the runtime image. Replay guards were added to `drizzle/0031_wtf_recapture.sql` so the SQL-first path can fail closed instead of swallowing duplicate-object noise.

**Rule**: Production deploys need a single schema authority and a strict order: database up, migrations complete, then app start. Do not boot workers or background jobs before deploy-time schema changes finish, and do not leave schema-mutation tooling inside the long-lived runtime image unless it is truly required there.

---

## 2026-04-28 — One-time volume ownership repair should not become a boot tax

**What happened**: `docker-entrypoint.sh` ran `chown -R node:node` across `/app/cache`, `/app/uploads`, and `/app/backups` on every root-started container boot, even after legacy ownership issues had already been repaired.

**Why it mattered**: Recursive `chown` time grows with the size of cache/uploads/backups, so a one-time compatibility repair quietly turned into a recurring restart penalty.

**Fix**: Keep the initial recursive repair, but write a per-volume marker after a successful pass and skip future recursive walks when the top-level directory is already owned by UID/GID `1000:1000`.

**Rule**: First-boot remediation for mounted volumes should leave behind a cheap success signal. If a repair only exists for legacy compatibility, make it self-disabling so normal restarts stay flat as data grows.

---

## 2026-04-28 — Backfill workers need deterministic intake and guarded terminal transitions

**What happened**: Several backfill seeders capped work with `LIMIT` but no explicit `ORDER BY`, so repeated passes could sample arbitrary slices of backlog. Separately, handlers could call `skip(...)`, then return normally, and the dispatcher would still call `complete(...)`, overwriting that terminal `skipped` state with `completed`.

**Why it mattered**: Arbitrary intake order makes bounded background work unfair and hard to reason about under sustained backlog, especially when priorities and freshness are supposed to matter. Overwriting `skipped` rows erases the signal that a gap was structurally unrecoverable, which weakens operator trust in manifest status counts.

**Fix**: Added task-appropriate deterministic ordering ahead of every bounded backfill seeder `LIMIT` and changed `complete()` to transition rows only while they are still `in_progress`. The dispatcher now treats a no-op completion as a skipped outcome instead of a success.

**Rule**: Any background worker that processes bounded batches must define a deterministic selection order before `LIMIT`. Any helper that moves rows into a terminal state must guard the current state and report whether the transition actually happened.

---

## 2026-04-28 — Stream-triggered refreshes need single-flight plus an inside-lock freshness check

**What happened**: The public TV stream read path called `maybeAutoRefreshWtfChannel(channelId)` before building the queue. That helper checked `lastRefreshedAt` and, if the interval looked expired, called `refreshWtfPlaylist()` directly with no lock or second freshness check.

**Why it mattered**: Multiple viewers hitting the same channel at once could all observe the same stale timestamp and launch overlapping refresh jobs. That duplicates expensive wallet/token work and lets later writers stamp over `lastRefreshedAt` or playlist contents out of order.

**Fix**: Wrapped the due-refresh path in a per-channel Postgres advisory lock and re-read the config/timestamp after the lock is acquired. Losers now return immediately, and waiters that acquire the lock after a winner finishes see the fresh timestamp and skip the redundant refresh.

**Rule**: Any background mutation triggered from a hot read endpoint must use single-flight coordination at the shared resource boundary, and the "is work still needed?" check must run again after the lock is acquired.

---

## 2026-04-28 — Media subprocesses and per-user OAuth caches need hard local bounds

**What happened**: The Studio preview pipeline spawned `ffmpeg`/`ffprobe` work inline without an explicit kill timeout or shared concurrency cap, while the user Drive integration kept process-global client and app-usage maps keyed by `userId` with no TTL or max-entry pruning.

**Why it mattered**: Expensive media inputs could leave helper processes running indefinitely, and steady user churn could retain OAuth client state far beyond active use. Both problems are easy to miss in normal traffic because they accumulate inside one long-lived Node worker.

**Fix**: Added explicit preview-process timeouts plus a bounded in-process slot gate for Studio preview jobs, and wrapped the user Drive caches with TTL + max-entry eviction helpers that prune on access/update.

**Rule**: Any long-lived process state tied to user input or user identity needs an explicit bound. External media tooling must have a kill path, and in-memory per-user caches must enforce TTL/cardinality limits instead of relying on manual invalidation alone.

---

## 2026-04-28 — Backup transports must stream large dump files end-to-end

**What happened**: The Supabase backup uploader created a resumable upload correctly, but then loaded the entire `pg_dump` artifact with `fs.readFile()` before sending the TUS PATCH.

**Why it mattered**: Backup size was effectively mirrored into Node heap usage. As the database grows, a routine off-site backup can become the biggest in-process allocation in the app container and trigger memory pressure or OOM during recovery-critical work.

**Fix**: Switched the PATCH body to `createReadStream(localPath)` and kept the existing `Content-Length` / TUS headers so the upload still uses one resumable request without buffering the whole dump in memory first.

**Rule**: Large backup and export paths should never materialize the whole artifact in application memory unless there is no streaming option. If the upstream API accepts a request body stream, use it.
