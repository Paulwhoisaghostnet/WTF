# WTF Agent Notes

## Pre-Flight Checklist (MANDATORY — every pass)

1. **Read `LESSONS_LEARNED.md`** before writing any code. It contains hard-won corrections from past debugging sessions. Violating a documented lesson is unacceptable.
2. **Read `BUG_BOUNTY_BOARD.md`** to check for open bounty items related to your task.
3. After completing a pass that involved debugging, fixing, or correcting an issue, **append a new entry to `LESSONS_LEARNED.md`** documenting what went wrong, why, and the rule going forward. Do not skip this step. Do not edit or delete existing entries.

Use `BUG_BOUNTY_BOARD.md` as the repo's standing bug bounty board.

Before changing code, check whether the work maps to an open bounty item. Claim it in the board, keep the fix scoped, and update the item with verification notes when done. Add newly discovered audit red flags to the board instead of leaving them only in chat or logs.

---

## W Microapp — Token Isolation & DM Architecture (MANDATORY)

These rules are non-negotiable. Violating them is a security breach.

### Three Token Scopes — Never Cross Them

| Token | Owner | Read access | Write access |
|---|---|---|---|
| **Platform** | `_transparentart` via X dev portal env vars | Public timeline, designated gameshow groupchat | NONE — platform token never writes |
| **Admin** (`wtf_gameshow` / `wtf-admin`) | WTF admin user's OAuth2 | Admin DM diagnostics, admin conversation list | Groupchat messages (only to designated chats) |
| **User** | Each user's own OAuth2 | Their own X inbox, their own DM threads | DM send (to conversations in their inbox) |

### Platform Token Rules

- The platform token reads **two things only**: public timeline posts and the designated gameshow groupchat(s) configured via `W_X_GAMESHOW_DM_CONVERSATION_IDS`.
- Platform token results go into the **shared cache and database** (`x_dm_events`, `x_dm_conversations`, `x_dm_participants` tables). The UI pulls groupchat content from this cache/DB, never raw from the API on each page load.
- **NEVER use the platform token to read any user's DM inbox.** Doing so exposes `_transparentart`'s private conversations to other users. This is the single most critical rule.
- **NEVER use the platform token as a fallback on user-facing DM routes** (`/api/w/user-dms`, `/api/w/user-dms/:conversationId/messages`). If the user has no token, serve from DB or return 403.

### User DM Rules

- Each user's DM inbox and threads come from **their own OAuth2 token** (`dm.read` scope) or from **their cached events in the database** — never from the platform or admin token.
- The `direct_messages` capability shows Enabled only when the **user** has `dm.read` scope. Platform token presence does not affect this.
- User DM events fetched via their token are stored in `x_dm_events` with `fetched_by_token_owner` set to their twitter ID, so they persist across deploys and tab switches.
- When a user has no `dm.read` token, the route tries DB-cached events for that user. If nothing is cached, return 403 with a clear message to connect OAuth.

### Groupchat Display

- The designated gameshow groupchat is displayed to **all authenticated users** in the Group Chats tab, pulled from the shared cache/DB (populated by the platform token sync job).
- Only users with `dm.write` scope can **post** to the groupchat.
- The groupchat also appears in the DM tab for users who have it in their X inbox — this is fine, it's their own inbox data.

### Background Sync Workers

- **Groupchat sync**: Runs every 3 minutes using the platform token. Fetches new DM events for the designated groupchat and stores them to DB.
- **Backfill**: Workers should detect idle periods (no active W users) and backfill older events for conversations in the DB. Groupchat should go back to at least Jan 1, 2026. Other conversations should backfill at least 7 days.
- **User DM sync**: When a user has W open and has `dm.read`, their inbox is fetched via their own token and cached. Workers should refresh connected users' events approximately every minute, always respecting rate limits and paginating correctly.
- **Event storage**: Each DM event has a unique `event_id`. Store the full event context: `conversation_id`, `sender_twitter_id`, timestamp, text, media, sender profile data. Events are upserted (conflict on `event_id` = skip), so re-fetching the same events is safe and cheap at the DB level.
- **Pagination**: Use `pagination_token` from X API responses to walk through pages. Use `since_id` only when you have confirmed older events are already stored. For backfill, do NOT use `since_id` — paginate backwards through time.
- **Rate limits**: Always respect `x-rate-limit-reset` and `retry-after` headers. On 429, skip the cycle and try again next interval. Never retry immediately.

### Cache Hierarchy (Read Path)

1. **React Query** (client) — staleTime prevents re-fetching on tab switch
2. **In-memory Map** (server, `x-dm-cache.ts`) — TTL-based, survives within a process
3. **PostgreSQL** (`x_dm_events` etc.) — survives restarts, deploys, cold starts
4. **X API** — only hit for genuinely new events, via background workers

The UI always reads from cache/DB. The X API is only hit by background workers and explicit user-initiated refreshes (which go through the cache layer).

### What NOT to Do

- NEVER pass a platform/admin token to `fetchDmConversationList` on a user-facing route
- NEVER show `direct_messages` capability as Enabled based on platform token
- NEVER use `resolveTokenOwnerId` to map a platform token to a user's context on DM routes
- NEVER filter out conversations from the user's inbox — show everything their token returns
- NEVER skip storing events because they're "old" — backfill is essential for the full conversation view
