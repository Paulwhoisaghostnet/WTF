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
