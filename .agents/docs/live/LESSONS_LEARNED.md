## 2026-06-04 — Skywire Chat OAuth must bind to the user's requested account, never a shared actor

**What happened**: Skywire Chat Add-on OAuth could steer users into the shared `wtfgameshow.bsky.social` Bluesky actor instead of their own linked account. The start path trusted the handle already present in `/api/atproto/me`, and the callback trusted whichever DID the OAuth provider returned before falling back to the user's latest account row. A poisoned or shared platform actor row could therefore keep the settings UI locked to the wrong handle and make Chat permission changes target the wrong identity.

**Why it mattered**: Chat OAuth is a private-message permission boundary. A shared platform actor must never become a user's durable chat identity, and a returned OAuth DID that differs from the account being upgraded is not an upgrade; it is an identity mismatch.

**Rule**: Skywire OAuth state must persist the requested handle, `/api/atproto/me` must not expose reserved shared platform actors as user accounts, OAuth start/callback must reject reserved platform handles such as `wtfgameshow.bsky.social`, and Chat Add-on callbacks must require the returned DID/handle to match the signed-in user's already-linked account before writing account rows or encrypted token material.

---

## 2026-06-04 — Skywire permission OAuth must not create a second Skywire reality

**What happened**: Repeated Skywire Chat Add-on fixes kept trying to synchronize a popup/new-window OAuth result back into the original Skywire window. Production still created a second upgraded Skywire instance, while the original settings/account view stayed disabled or snapped back to Home after a few seconds because the app's default-tab logic treated refetched account state as permission to reset the tab.

**Why it mattered**: A permission upgrade is not a background notification problem. Creating another full Skywire window for the OAuth result gives users two conflicting realities and makes the popup look like the only place the permission exists.

**Rule**: Skywire permission-changing OAuth must use the current browser window, return to `/skywire?tab=account`, and keep the account/settings tab selected until canonical `/api/atproto/me` shows the durable account permission. Do not add more popup polling or popup-close recovery for this path; popup/storage completion handling is legacy fallback only.

---

## 2026-06-04 — Skywire OAuth upgrades must persist from OAuth state, not popup session state

**What happened**: The Skywire Chat Add-on popup could finish OAuth and land in a second Skywire/wtfOS instance that looked upgraded, while the original window and later fresh sessions still showed chat disabled. The earlier popup-sync fix proved the opener could react to canonical state, but it did not prove the callback always wrote the upgraded scope to the canonical account row. The callback depended on `req.session.atprotoOAuth` for `popup`, `userId`, requested scope, tier, and chat intent, so a popup/new-window OAuth callback with drifted browser session state could fall back to a normal Skywire redirect or lose the app-owned chat metadata.

**Why it mattered**: OAuth permissions are account state, not window state. If chat exists only because a popup URL says `chat=1`, users get a fake upgrade that disappears after closing windows, refreshing, or reopening WTF OS.

**Rule**: Skywire OAuth start must store app-owned metadata in a server-side pending-state record keyed by the OAuth `state` token, and the callback must recover from that state before writing the exact user+DID `atproto_accounts` row. Token persistence must carry `oauthRequestedScopes`, `oauthPermissionTier`, and `oauthChatEnabled` along with encrypted token material so every later `/api/atproto/me` read reflects the durable permission.

---

## 2026-06-04 — Skywire Market Feed search must use a search-capable AppView

**What happened**: Skywire's Market Feed could show "This lane is quiet right now" even while Bluesky had fresh posts linking Objkt and Teia tokens. The server was calling `app.bsky.feed.searchPosts` through the same public AppView helper used for read-only profile/feed calls, and `public.api.bsky.app` returned HTTP 403 for `searchPosts`. Because the route settled all domain searches and returned an empty successful feed, the client rendered an empty-lane state instead of an upstream search failure.

**Why it mattered**: Market Feed is supposed to connect users to Tezos token posts across Bluesky. An empty-but-successful response hides the source outage and makes it look like there is no marketplace activity or that Skywire's token filtering is broken.

**Rule**: Skywire Market/Search/Discover feeds that call `app.bsky.feed.searchPosts` must use a search-capable AppView (`https://api.bsky.app` by default, overridable with `ATPROTO_SEARCH_APPVIEW`) and keep domain-scoped Objkt/Teia searches. If every marketplace domain search fails, return an upstream-unavailable error instead of converting the outage into a quiet feed.

---

## 2026-06-04 — Skywire OAuth popups need canonical-state polling while they remain open

**What happened**: The first Skywire Chat Add-on sync fix handled popup completion messages and popup-close refetches, but a popup could still become a second Skywire instance with the upgraded chat permission while the original window stayed disabled. Because that second window remained open, the original window never hit its close-poll refetch path.

**Why it mattered**: OAuth permission upgrades are persisted account state, and users keep working in the original wtfOS window. If that window waits for the popup to close or for a fragile cross-window event, the UI can misrepresent the user's real grants and make chat look like it vanished when the popup is closed.

**Rule**: When Skywire starts an OAuth permission upgrade in a popup, the original window must actively poll canonical `/api/atproto/me` until the requested tier/chat scope is visible, update itself from that state, and close the popup from the retained window handle. Any OAuth-created Skywire fallback page must broadcast structured completion metadata and close based on the OAuth popup window name, even when `popup=1` is missing from the URL.

---

## 2026-06-04 — WTF LIVE room joins must preserve wtfOS and expose explicit exits

**What happened**: The signed-in WTF LIVE dashboard used `window.location.href` for room Join, replacing the wtfOS app with the public guest room. Once inside the public room, users had no obvious Leave Room or Close Window control and could only escape by using browser chrome.

**Why it mattered**: A public live room is a separate guest surface, not a replacement for the signed-in WTF OS workspace. Users also need a clear way to disconnect media/signaling state before walking away, especially after granting mic/camera/screen permissions.

**Rule**: WTF LIVE dashboard Join opens `/live/r/:roomId` in a separate browser tab/window and leaves `/live` intact. Public room pages must show explicit Leave Room and Close Window controls; Leave performs socket, peer connection, local media, and state cleanup, while Close performs the same cleanup before requesting tab closure.

---

## 2026-06-04 — WTF LIVE participant presence must not push chat offscreen

**What happened**: Public room guests who joined without turning on camera or screen still rendered as black media placeholder tiles. As more people entered the room, those idle tiles consumed the main panel and pushed the bottom chat composer offscreen without a usable scroll path.

**Why it mattered**: A live room needs chat to remain usable precisely when the room fills up. Treating idle presence like active video also makes users think media is broken because every participant appears as an empty black box.

**Rule**: Separate presence from media. Idle WTF LIVE peers render as compact presence rows, mic-only peers attach audio without taking a video frame, and only live video tracks get media-sized tiles. The public room workspace must keep media and chat in bounded, independently scrollable panes and test a crowded idle room with the chat composer still inside the viewport.

---

## 2026-06-04 — Skywire OAuth permission upgrades must sync the opener window from canonical account state

**What happened**: Enabling the Skywire Chat Add-on opened a Bluesky OAuth popup, but completion only signaled through fragile popup-local storage. Users could see the permission upgrade in the new OAuth window while the original Skywire window stayed on the old `/api/atproto/me` state, making chat appear disabled again when the popup closed.

**Why it mattered**: OAuth permission changes are account state, not popup state. If the original app window does not refetch the persisted `atproto_accounts` row after callback, users cannot trust that Be Bold + chat permissions actually stuck.

**Rule**: Skywire OAuth callbacks must emit structured same-origin completion metadata (tier, chat flag, requested/granted scopes, account id) through BroadcastChannel plus storage fallback, and the opener/original Skywire client must refetch `/api/atproto/me` on completion and popup close. Chat capability detection must tolerate stored `transition:chat.bsky` and `chat.bsky` spellings while still requesting the canonical transitional scope.

---

## 2026-06-04 — WTF LIVE media controls must prove remote tracks, not local preview

**What happened**: WTF LIVE guest rooms exposed Mic, Camera, Screen, and media capability labels, but the public room client only rendered local previews. There was no public room signaling socket, no WebRTC peer connection, no remote stream rendering, and no room-scoped chat/media lane, so two guests in the same room could not hear or see each other.

**Why it mattered**: A live room is useless if media never leaves the local browser. The first focused harness run also showed two easy false positives: stale `dist/public` assets can make Playwright test the old UI, and a visible remote `<video>` shell does not prove `srcObject` contains a remote track.

**Rule**: WTF LIVE media work must include a room-scoped realtime transport plus a two-browser-context Playwright proof that participant B receives participant A's actual `MediaStream` track and chat/media attachment. Avoid empty no-media negotiations; bind video elements to a stream track signature so mutated `MediaStream` objects still attach after tracks arrive.

---

## 2026-06-04 — WTF LIVE owner controls must follow ownership, not list context

**What happened**: Owned public rooms could render in the "Open public rooms" directory with `owned=false`, so the visible room card showed join/share actions but not the owner-only Close/Delete controls.

**Why it mattered**: Room owners need to manage the room from the card they are actually looking at. Hiding lifecycle controls in a separate owned-only rendering path makes public rooms feel impossible to close or delete even though the API supports it.

**Rule**: Derive room lifecycle controls from `canManageRoom(room)` wherever a room card is rendered, including public directory cards and selected room cards. Add stable `data-wtf-live-*` hooks and inventory behavior coverage for owner-visible Close/Delete before claiming the lifecycle UX is covered.

---

## 2026-06-04 — WTF LIVE schema changes must ship numbered SQL migrations

**What happened**: WTF LIVE public rooms shipped with Drizzle schema for `wtf_live_rooms` and `wtf_live_stages`, but no numbered production SQL migration created those tables. Production then returned 503/500 responses from room/stage registry routes when users tried to list or create rooms.

**Why it mattered**: The inventory harness mocked WTF LIVE APIs and did not exercise the real Postgres tables, so build and route smoke passed while the live app could not persist user-created rooms.

**Rule**: Any WTF LIVE change that adds or reads persistent tables must include a numbered `drizzle/0xxx_*.sql` production migration in the same commit and a deploy-migration policy test for the table names. Harness mocks are not proof that the real registry can query production DB tables.

---

## 2026-06-04 — WTF LIVE public rooms need room-only guest lanes

**What happened**: WTF LIVE needed the Odio-style public room experience, but the existing `/live` surface mixed host controls, identity state, room lists, stages, and desktop navigation into one signed-in app.

**Why it mattered**: A public room link should feel as simple as "open this URL and join this room" without giving anonymous visitors a path into the wider WTF app, host dashboard, stages, or Skywire identity flows.

**Rule**: Keep `/live` as the authenticated WTF LIVE host dashboard. Put no-account visitors on `/live/r/:roomId` with room-scoped public metadata/message APIs only. Adding guest media controls, screen share, camera, or listener affordances must preserve that room-only boundary instead of weakening the `/live` or Skywire gates.

---

## 2026-06-04 — Skywire vault tests must rebuild the dist harness before checking UI changes

**What happened**: A Skywire vault UI pass split owned and created tokens, grouped created tokens by collection/contract, and added token-share posting. The first Playwright run still showed the old flat vault because the inventory harness serves `dist/public`, not the live Vite source, and the client bundle had not been rebuilt. After rebuilding, the test exposed only a strict-selector issue because collection names appear in both headers and token cards.

**Why it mattered**: A green TypeScript check does not prove the browser harness is exercising the current Skywire UI. Vault behavior is specifically layout and interaction heavy, so stale built assets can make failures look like product regressions or missing DOM hooks when the browser is simply running yesterday's bundle.

**Rule**: For Skywire UI changes, run `npm run build` or `npm run test:e2e:inventory` before Playwright harness assertions that read `dist/public`. Add stable `data-skywire-*` hooks for vault sections/actions, and scope text assertions to the intended header or first match when collection names are repeated in token cards.

## 2026-06-03 — Skywire dark mode must cover shell, controls, and transparent feed affordances together

**What happened**: A Skywire default-dark pass initially darkened the page shell and feed cards but left React95-inherited controls rendering as gray buttons and turned actor/author buttons into visible button slabs.

**Why it mattered**: Partial dark mode makes Skywire feel inconsistent even when the main panels are dark. Feed author affordances need to read like content, while nav/action/input controls need explicit dark treatment so the UI does not fall back to classic gray inside a dark shell.

**Rule**: When changing Skywire's default theme, verify the shared `SkywireShell` sidebar, page shell, feed cards, token previews, compose inputs, React95 buttons, text-field wrappers, modals, vault cards, and actor/avatar buttons in one direct visual smoke. Actor/header buttons must stay transparent; nav and action buttons must not inherit default gray.

## 2026-06-03 — Skywire feed polish must verify real media/token embeds, not text-only route smoke

**What happened**: Skywire feed cards technically rendered, but the UI pass exposed two gaps: the visual smoke fixture had only text posts, so media hierarchy and token cards could pass unseen; and token href detection was split between a narrow client matcher and a slightly broader server resolver, causing valid Objkt/Teia/OE links embedded as Bluesky external cards to be rejected before hydration. During the same inventory rerun, CRP Nominations crashed on sparse harness API responses because it assumed optional arrays were always present.

**Why it mattered**: A Bluesky client can look "green" while still hiding the exact product failure users see: cropped media, generic links instead of Tezos previews, and route crashes under sparse AppView payloads. Token previews must be accepted by the client before the server can resolve listings, and inventory route smoke only protects the UI surface it actually exercises.

**Rule**: When polishing Skywire feed UI, include a harness post with media plus an Objkt/Teia token external href, and visually smoke the rendered card. Keep client and server token URL support in lockstep for Objkt asset/token/collection/open-edition and Teia token routes. For AppViews, treat API array fields as optional at runtime and guard with `Array.isArray(...)` before `.length` or `.map(...)`.

---

## 2026-05-31 — Rat Race empty feed means fix tz2at Postgres, not add bypass sources

**What happened**: Rat Race showed zero cards for every filter. Investigation traced it to `https://tz2at.xyz/health` and `/replay` returning 500. The tz2at semantic relay Postgres volume had filled the server disk (`No space left on device`), which panicked the checkpointer and left the DB stuck in recovery (`57P03` / "not yet accepting connections"). WTF local market tables were also empty, so Rat Race had no fallback within the intended tz2at pipeline.

**Why it mattered**: Filter changes could not help because the upstream indexer could not read `sync_checkpoints` or `events`. Adding a separate Objkt sales bypass would hide the real outage and skip the tz2at replay path Rat Race is designed to use.

**Rule**: When Rat Race is empty, check tz2at relay health first (`/health`, postgres disk/recovery on the TZAT host). Restore tz2at ingestion before changing WTF ranking logic or adding alternate sale sources. Keep Rat Race on local index → tz2at replay → legacy ATProto fallback only.

---

## 2026-05-31 — Rat Race replay must read processed head and store.tz2at collects

**What happened**: After tz2at Postgres recovered, `/health` reported fresh intake at block ~13446400 while `processed.lastLevel` stayed at 13412063 (~34k blocks behind). Rat Race still returned zero cards because the replay adapter scanned recent unprocessed intake ranges (noise blocks/transactions hitting the 5,000-event cap with zero collects) and filtered replay records to `$type === "xyz.tz2at.marketplace.collect"` even though `/replay` emits `store.tz2at.marketplace.collect`.

**Why it mattered**: The upstream indexer was degraded, but the consumer made the feed look empty even when ~1,200 processed marketplace collects existed through block 13412063. An Objkt GraphQL bypass would have masked both the TZAT drain backlog and these adapter bugs.

**Rule**: Rat Race tz2at replay must cap scans at `health.processed.lastLevel`, treat `store.tz2at.*` and `xyz.tz2at.*` marketplace/FA2 collections as equivalent, and surface intake-vs-processed lag in diagnostics. Unblock TZAT block-tank drain separately; do not add parallel sale sources to hide stale processed checkpoints.

---

## 2026-05-31 — WTF LIVE is a standalone app; Skywire only supplies AT identity

**What happened**: WTF LIVE rooms and stages lived inside Skywire tabs and `/api/skywire/rooms*` routes, so users could not clearly create rooms/stages or tell where Skywire ended and live publishing began.

**Why it mattered**: Rooms/stages are public AT repo writes with their own registry, rollout gate (`wtf-live` desktop app), and create flows. Burying them in Skywire made the feature feel like a sidebar experiment instead of a first-class app.

**Rule**: Keep Skywire as the Bluesky social cockpit (`/skywire`, `/api/skywire/*` feeds/chat/pipelines). Run WTF LIVE as its own desktop app at `/live` with `/api/wtf-live/*`, user-created rooms/stages in `wtf_live_rooms` / `wtf_live_stages`, and Skywire Link tab for OAuth tier upgrades only. Feed "Room"/"Stage" quote actions hand off via `sessionStorage['wtf-live:pending-quote']` to `/live?tab=rooms|stages`. Do not re-mount Skywire with `liveMode` or expose room/stage list APIs on Skywire.

---

## 2026-05-31 — wtfOS CLI/TUI must mirror browser gates, never the public access manifest alone

**What happened**: First CLI pass validated `open /route` against `/api/access` (public manifest listing every registered browser path). That let unauthenticated or under-privileged clients discover and attempt admin/session routes the browser UI would block.

**Why it mattered**: CLI/TUI is a UI-less mirror, not a backdoor. Operators and users must not get extra reach from Terminal, `/cli`, or `@wtfos/cli` beyond normal login, role, WTF OS surface grants, and desktop app gates.

**Rule**: Route opens and `routes` listings must evaluate `shared/wtf-browser-route-access` (same logic as `getPageAccessState`). Native clients call `/api/cli/can-open` and `/api/cli/routes` with the session cookie; browser CLI evaluates locally with the signed-in user's roles, `wtfOsAccess.surfaceIds`, and desktop app availability. Keep `shared/wtf-browser-routes.ts` synced with `PAGE_DEFS` via `shared/wtf-browser-routes.sync.test.ts`. Anonymous `/api/cli/can-open` responses must use generic deny copy (no route oracle). Production CLI `baseUrl` values must be https-validated in `packages/wtfos-cli/src/base-url.ts`.

---

## 2026-05-31 — Skywire + WTF LIVE rollout must gate browser, API, and OAuth together

**What happened**: Skywire and WTF LIVE rooms/stages existed behind the desktop app gate and AT OAuth scopes, but there was no shared rollout policy for staff-alpha testing across admin, host, cohost, resident wizard, and test subject roles, and `/live` was referenced by pipelines without a registered route.

**Why it mattered**: Operators could hide Skywire from launchers while direct routes still worked, or open OAuth to roles that the browser shell denied. WTF LIVE room/stage APIs also needed an explicit lane gate separate from read-only Skywire feeds.

**Rule**: Use `SKYWIRE_ROLLOUT_MODE` (`staff_alpha` | `all_users` | `disabled`) and `SKYWIRE_WTF_LIVE_ENABLED` from `shared/skywire-rollout.ts`. Enforce the same eligibility in `evaluateBrowserRouteAccess`, Skywire API middleware, and Skywire OAuth start. Register `/live` on the Skywire admin surface/start-menu gate, keep the desktop app row enabled/doc-registered, and treat test subjects as experimental Skywire surface grantees during staff-alpha.

---

## 2026-05-31 — CRP Nominations must register as a first-class wtfOS desktop app

**What happened**: CRP nominations shipped with route/API/inventory coverage but without the full wtfOS registration pass (`DESKTOP_APPS`, desktop icon, start-menu gate, admin surface, package acceptance, domain registry, builder/user manuals).

**Why it mattered**: Partial registration violates P6.CA4 / same-pass doctrine; the app could not be gated, observed, or documented like Skywire/tz2at, and failed package acceptance invariants once added to `DESKTOP_APPS` without the companion surfaces.

**Rule**: New wtfOS apps must land route, `desktopIcon`, start-menu gate, `DEFAULT_DESKTOP_APP_CONFIG`, admin surface (`desktopAppKey`, nativeSettings, automationHandles), `wtf-app-packages.ts` entry, domain registry/command palette updates, `.env.example` operator vars, builder guide, and user manual in the same pass.

---

## 2026-05-31 — CRP anonymous nominations: separate reward credits without nominee linkage

**What happened**: Users needed to submit CRP nominations without attaching nominator identity to the CRP repo record or their wtfOS repo echo, while still allowing reward systems to count that they nominated.

**Why it mattered**: Public AT records with `nominatorUserId` / handle and user-repo echoes deanonymize nominators even when the UI hides My nominations.

**Rule**: Anonymous submit sets `anonymous: true` on the CRP repo record, omits all nominator fields, uses opaque `crp-anon-{nominationId}` rkeys, skips user-repo echo, emits `crp.nomination.submitted.anonymous` without nominee/category metadata, and inserts one row into `crp_appview_nomination_credits` (user id only — no nominee, category, or timestamp). Reward eligibility counts rows in that table via `GET /api/crp-nominations/credits`.

---

## 2026-05-31 — CRP nominations: Bluesky-native share records + dedicated repo + user echo

**What happened**: First CRP AppView pass stored only `app.wtfos.liveops.crpNomination` and tried to pass custom AT URIs through a nonexistent Bluesky intent `embed` param. Bluesky intent links only support `text`; embeddable/shareable records on Bluesky are `app.bsky.feed.post` (plus a few other bsky lexicons), not custom `app.wtfos.*` types.

**Why it mattered**: Users could not literally share a Bluesky-compatible AT record; custom lexicon URIs do not render in the Bluesky app.

**Rule**: CRP publish must write (1) canonical `app.wtfos.liveops.crpNomination` to the dedicated CRP repo, (2) a paired `app.bsky.feed.post` share record in that same repo, (3) `app.wtfos.index.ref` echo to the nominator's wtfOS user repo, and (4) master index echo. Configure `CRP_NOMINATIONS_REPO_*` credentials for outbox publish. Bluesky share buttons use intent `text` plus the published `bsky.app/profile/.../post/...` URL (oEmbed/card), not fake embed params.

---

## 2026-05-31 — CRP MCP tools must attribute actions to the token owner with scoped rate limits

**What happened**: CRP Nominations needed paired-agent access without bypassing desktop gates, scope policy, or abuse controls.

**Why it mattered**: Ungated MCP submit would let agents nominate at global MCP rates with weak audit attribution, making abuse hard to trace back to the responsible WTF account.

**Rule**: Register CRP MCP tools with `crp-nominations:read` / `crp-nominations:write`, enforce the `crp-nominations` admin desktop gate, apply per-token CRP rate limits (`MCP_CRP_*`), emit `mcp.crp.*` plus domain `crp.nomination.*` events with `userId` of the token owner and metadata `{ agentActingOnBehalfOfUser, mcpTokenPrefix, mcpToolName }`, and document token-owner liability in builder/MCP doctrine docs.

---

## 2026-05-31 — CRP nomination AppView: merge Tezos social sources before AT publish

**What happened**: CRP nominations needed a wtfOS AppView that resolves nominees from wallet, `.tez`, X, or Bluesky inputs, lets the nominator pick the exact wallet/X/Bluesky bundle, publishes `app.wtfos.liveops.crpNomination` through the spine outbox, and opens Objkt-style X/Bluesky compose intents (no OAuth) with platform character caps.

**Why it mattered**: The legacy CRP watcher only ingests `#TezosCRP` X posts; builders needed a structured nomination record on the AT spine plus share drafts that reference real Bluesky-indexable posts.

**Rule**: Resolve nominee identity by merging WTFOS DB hints, Objkt/TzKT/tzprofiles/tezos.domains, tz2at identity links, and tzbsky `com.tzbsky.cryptoAddress/self` proofs before asking the user to confirm the bundle. Publish canonical facts and paired `app.bsky.feed.post` share records to the dedicated CRP repo via `enqueueCrpOutboxRecord`; echo `app.wtfos.index.ref` to the nominator's user repo when provisioned; list from `wtfos_appview_records`. Share via `twitter.com/intent/tweet` and `bsky.app/intent/compose` only — never OAuth post on behalf of the user.

---

## 2026-05-31 — W digest production: container env, AT outbox user id, handle spelling

**What happened**: Production digest scraper reported `missing_scraper_session_or_credentials` even though `.env` had `W_X_SCRAPER_*` keys — `docker compose up -d --force-recreate app` left a stale `wtf-app-app-1` without `env_file` vars until `docker compose rm -f app` before `up`. First scrape stored posts but failed AT outbox with `user_id=1` FK errors (prod has no user id 1); ingest aborted per handle until `posts.ts` logged-and-continued on outbox failure. Seed handle `transparentart` should be `_transparentart`.

**Why it mattered**: Operators saw an empty timeline despite a “successful” deploy; outbox rows never queued; one curated account never ingested.

**Rule**: After changing `.env` scraper keys, run `docker compose stop app && docker compose rm -f app && docker compose up -d app` (also wired in `scripts/server-deploy.sh`). Set `W_DIGEST_ATPROTO_USER_ID` to a real `users.id` on that database (e.g. `wtf-admin`). Digest ingest must persist posts even when outbox insert fails. Seed X handles exactly as on x.com (including leading `_`).

---

## 2026-05-30 — Security hardening pass 2: deploy guards, settings races, and shared rate limits

**What happened**: Follow-up hardening added Kiln production posture checks to deploy, `TOKEN_ENCRYPTION_KEY` preflight, optimistic `platform_settings` updates (409 on stale `expectedUpdatedAt`), Postgres-backed API rate limits via `RATE_LIMIT_STORE=postgres`, and a shared `kiln-client` module.

**Why it mattered**: Open Kiln hosts and missing deploy guards let public callers hit puppet-wallet infrastructure; last-write-wins admin settings silently overwrite concurrent edits; per-process rate limits do not protect multi-replica deploys.

**Rule**: Run `check-kiln-production-posture.mjs` on every production deploy. Admin settings writes that merge remote state must accept `expectedUpdatedAt` and return 409 on conflict. Use `RATE_LIMIT_STORE=postgres` in multi-instance production. Keep Kiln server token required for in-app Kiln proxies. Enable `CSP_STRICT_SCRIPTS=1` only after verifying the production Vite shell has no required inline scripts.

---

## 2026-05-30 — W is a read-only Tezos digest (profile scrape + AT outbox URLs, no X API)

**What happened**: W was redesigned from an X API / DM / native-action client into a chronological digest of admin-curated handles. A Playwright bot visits profile pages only, records `/status/` URLs (25 on first scrape per handle, incremental after), mirrors each new URL to the primary wtfOS AT outbox as `w.digest.post.scraped`, and the UI shows iframe embeds plus X intent links for view/repost/reply (no server-side posting).

**Why it mattered**: Filtered Stream and OAuth write paths were unsustainable; the product goal is staying in touch with Tezos voices without replacing X or paying API credits.

**Rule**: Default `W_TIMELINE_INGEST_MODE=digest`. Do not register W message/action/stream/DM workers when digest is active. Store handles in `w_digest_handles` and posts in `w_digest_posts`. Never commit scraper passwords — use `W_X_SCRAPER_USERNAME` / `W_X_SCRAPER_PASSWORD` or `W_X_SCRAPER_STORAGE_STATE` in env only. Edit handles from `/api/w/admin/digest-handles` and `/api/admin/w-digest-handles`.

---

## 2026-05-30 — W timeline: scraper ingest replaces paid X Filtered Stream by default

**What happened**: W burned X API credits on Filtered Stream even with budgets. Operator prefers a logged-in web scraper over paid stream/search ingest for Shadownet-adjacent social monitoring.

**Why it mattered**: Filtered Stream bills per delivered post; a long-lived connection to hundreds of handles is unsustainable for a community timeline mirror.

**Rule**: Default `W_TIMELINE_INGEST_MODE=scraper` and `W_TIMELINE_STREAM_ENABLED=0`. Use Playwright storage state (`W_X_SCRAPER_STORAGE_STATE`) via `scripts/w-x-timeline-scraper.mjs --save-session`. Only enable `stream` or `search` modes when explicitly accepting API cost. `/api/w/timeline` stays DB-first regardless of ingest path.

---

## 2026-05-30 — Kiln open Shadownet mode is intentional builder convenience, not a custody bug

**What happened**: Security hardening treated public Kiln open mode and puppet-wallet balances as a deploy blocker. Operator clarified that Shadownet XTZ is free from the faucet and shared Bert/Ernie signers only save builders from fetching their own test funds.

**Why it mattered**: Blocking open mode would fight the product goal (fast public Shadownet testing) while providing no meaningful security gain on faucet-funded signers.

**Rule**: Do not fail deploy on `auth.mode=open` or public `/api/kiln/balances`. Still fail deploy when unauthenticated callers can hit protected mutation routes. Treat mainnet Kiln auth, WTF app `KILN_API_TOKEN`, and user wallet signing as the real boundaries.

---

## 2026-05-30 — Security hardening: outbound fetch policy, proof redaction, and production secret separation

**What happened**: A security audit flagged Porcupin connector SSRF, W link-preview redirect SSRF, public side-quest proof leakage, challenge submit XP farming, shared `SESSION_SECRET` token encryption, oversized `platform_settings` payloads, and permissive JSON body limits.

**Why it mattered**: User-controlled outbound URLs and redirect chains can reach internal networks; public proof fields expose PII; gratuitous XP on submit invites sybil farming; one secret for sessions and encrypted tokens widens blast radius; huge settings rows and bodies are cheap DoS vectors.

**Rule**: Validate every server-initiated HTTP URL with `assertSafeOutboundUrl` / `fetchSafeHttp` (block private hosts, optional HTTPS-only and host allowlists, re-validate each redirect hop). Redact side-quest proofs unless the viewer owns the completion or is staff. Award challenge XP only on pass/bonus grade, not on submit. Require `TOKEN_ENCRYPTION_KEY` and `STUDIO_CRYPTO_KEY` in production. Bound `platform_settings` values and default JSON bodies conservatively (override with env when a route truly needs more).

---

## 2026-05-30 — Market-health AppViews need explicit windows, replay, entity repos, and hydration — not live-head defaults

**What happened**: The tz2at ecosystem tab still behaved like a one-shot live-stream sampler (`limit=40`, no time window). It could not answer "how much liquidity entered or left Tezos in the last 24–168 hours" because records were not filtered by timestamp, tz2at `/replay` was not queried for the block window, CEX wallets were not hydration-queued for backfill, and the UI never sent `windowHours`/`hydrateCex` to the API.

**Why it mattered**: Endstream market-health analytics must be time-bounded and source-composed: replay for the window, category PDS samples for cross-cutting activity, and per-CEX entity repos for custody truth. Without hydration requests, entity repos may only contain recent indexer traffic and under-report exchange flow for longer windows.

**Rule**: tz2at market-health endpoints must accept `windowHours` (24/48/72/96/168), filter all merged records by timestamp, pull tz2at `/replay?fromLevel&toLevel` for the matching block span, read CEX custody from entity repos, optionally `POST /hydrate/wallet/async` for book wallets scaled to the window, and return a first-class `marketHealth` object the UI leads with. Default the UI to a 72h mainnet snapshot, not raw collection limits.

---

## 2026-05-30 — Read the spine's per-entity repos, do not re-derive filtering from the main firehose

**What happened**: After fixing tz2at CEX sampling by paging deeper through the main relay's mixed firehose, the result was still a partial sample (~7,158 XTZ withdrawn) that depended on randomly catching exchange flows among Etherlink noise. The tz2at spine (TZAT) already shards every event into per-entity repos: each wallet/contract has its own repo whose `store.tz2at.xtz.flow` records are, by construction, exactly the flows where that entity is `from` or `to`. The repo handle is a deterministic function of `(network, category, address)` — TZAT's `nounSlug` produces `m-w-<head>-<sha256(network:category:address)[:12]>` and the handle `…​.wallets.tz2at.store`. Computing that handle for a known CEX address and calling `com.atproto.identity.resolveHandle` returns the repo DID with no enumeration of the 10k+ repos. Reading those repos directly raised the live figure to ~558,636 XTZ withdrawn / ~373,386 XTZ deposited across Coinbase and Bybit wallets.

**Why it mattered**: The federated spine already did the categorization/filtering work. Trying to reconstruct "flows touching exchange X" from the undifferentiated main stream is both lossy (recency/volume bias) and wasteful. The data was already stored in the right place; the analytics just had to look there. Two prefix gotchas matter: entity repos store raw events under `store.tz2at.*` (only profiles are mirrored as `xyz.tz2at.*`), so the analyzer must treat both prefixes as equivalent; and the same canonical event appears in multiple repos (main mirror + both participants), so merged sources must be deduped by `type + operationHash + eventIndex`.

**Rule**: When consuming a federated/sharded ATProto spine, resolve and read the specific per-entity repo for a known subject instead of mining the aggregate firehose. Reuse the publisher's deterministic handle derivation (do not invent a parallel scheme), resolve via `resolveHandle`, normalize `store.tz2at.*`↔`xyz.tz2at.*` collection prefixes, dedupe the same canonical event across repos, and filter `xtz.flow` to `flowKind === "transaction_amount"` for custody deposit/withdrawal accounting (fees/burns/rewards are not transfers). Keep touching the main relay for the broad cross-cutting view, but source entity-specific facts from entity repos.

---

## 2026-05-30 — A populated classifier book is useless if sampling never reaches the matching network

**What happened**: The tz2at ecosystem AppView shipped a 30-entry Tezos CEX custody book (WTF-BB-180) yet still reported `0 XTZ` flow in and out of CEX wallets. A live AT Protocol probe showed the cause was not the classifier: the canonical `tz2at.store` relay repo interleaves very high-volume Etherlink (`etherlink-mainnet`, 18-decimal, `0x`-prefixed) flow records with the Tezos L1 (`mainnet`) flows that actually touch exchange custody. `analyzeRecords` only read the newest ~40 `xyz.tz2at.xtz.flow` records from a single main repo, and that recency-ordered head was 100% Etherlink. The Tezos `mainnet` flows carrying known CEX addresses sat hundreds of records deep and were never fetched. Deep-paging the same repo found the book addresses (15 hits across 6 known exchanges in 1,500 records); a focused fix that pages past the Etherlink head until enough Tezos-native flow records are sampled produced ~7,158 XTZ withdrawn / ~6,512 XTZ deposited against live data.

**Why it mattered**: "Classifier returns zero" was misdiagnosed before as a missing/incomplete address book. The real failure was a sampling/recency bias on a multi-network stream: a perfectly correct Tezos classifier can never fire if the only records sampled belong to a different chain whose addresses can never be in a Tezos custody book. Adding more addresses would not have helped.

**Rule**: When an entity classifier on a multi-network or multi-source AT Protocol/relay stream returns all-zero, verify the *sample composition* (network mix and address formats) before touching the entity book. A recency-ordered `listRecords` head on a mixed Tezos/Etherlink repo is not a representative sample; page the high-volume liquidity collections until enough records of the classifier's target network are present, bounded by a hard page cap and an early-stop target. Keep classifier-adjacent surfaces (e.g. unclassified custody candidates) scoped to the same network family as the book so deeper sampling does not surface cross-chain noise.

---

## 2026-05-29 — Route smoke can need same-process harness verification in sandboxed desktop sessions

**What happened**: A Map Lab UI pass passed TypeScript and inventory coverage, but `npm run test:e2e:inventory` timed out waiting for Playwright's configured webServer even after the Vite build succeeded. A manually started harness reported that it was listening, while a separate shell could not connect to the port from the sandboxed session.

**Why it mattered**: The feature route still needed browser verification. Treating the Playwright webServer timeout as a route failure would have been misleading, but skipping visual smoke would have left the new canvas unproven.

**Rule**: When Playwright's webServer hook times out in the desktop sandbox, isolate whether the app route is broken or the harness port is unreachable across sandboxed command sessions. A same-process harness plus Playwright smoke can verify the route while preserving the failed full-suite evidence.

---

## 2026-05-28 — Visual smoke must use sparse harness payloads, not only route smoke

**What happened**: A Skywire UI polish pass typechecked and passed inventory route smoke, but a direct Playwright visual pass against the local harness exposed a crash when `me.tezosIdentity` was absent from the sparse test account payload.

**Why it mattered**: Production API responses may include the full identity shape, while harnesses and partially migrated sessions can still return sparse objects. A polished UI is not shippable if its first-frame status area can crash before a user sees the repair path.

**Rule**: For Skywire and other protocol apps, direct visual smoke should exercise sparse auth/account payloads after route smoke. Treat optional server enrichment as optional in the client, especially for identity bridge fields such as Tezos aliases, wallet summaries, and capability metadata.

## 2026-05-29 — Inventory docs must point at live helper locations, not guessed shared paths

**What happened**: While documenting the WTFOS creator SDK and MCP doctrine, it was easy to refer to the access manifest helper as if it lived under `shared/`, even though the actual implementation is `server/lib/wtf-access.ts`.

**Why it mattered**: A cross-app inventory contract only stays trustworthy if its docs point to the real live helper paths. A guessed path can make future agents chase the wrong source of truth and accidentally build around stale assumptions.

**Rule**: When documenting a platform registry or inventory contract, verify the actual helper location before naming it. If the live implementation is server-owned, say so explicitly and keep the docs aligned with the real source-of-truth file paths.

---

## 2026-05-28 — Skywire room records are public social records unless encrypted later

**What happened**: Skywire gained `app.wtfgameshow.skywire.room.message` records so users can send room messages from their own AT/PDS repo and attach quoted-post preview snapshots. This supports user-owned storage and multi-user aggregation, but it is not private chat.

**Why it mattered**: AT repos are public signed content. A room UI can feel like chat, but unless a separate encrypted transport/private storage layer exists, records written to a user's PDS must be treated as public social publishing.

**Rule**: Skywire Rooms may write user-authored portable public room records to the user's canonical PDS with explicit Be Heard/Be Bold consent. Do not use canonical user repos for hidden WTFOS system state, moderation-only data, secrets, or private DMs; those need WTFOS repos, app storage, or an encrypted chat design.

---

## 2026-05-28 — Quote previews should use AppView embed views

**What happened**: Skywire needed Bluesky-compatible quoted-post previews and quote creation. The write path correctly uses `app.bsky.embed.record`, but the preview normalizer has to prefer AppView `view.embeds` over the raw quoted record embed so rendered cards get hydrated thumbnails/external previews when Bluesky provides them.

**Why it mattered**: Quote cards are the bridge between Bluesky compatibility and X-style UX. If Skywire writes compatible records but renders weak previews, the feature feels local and unfinished even though the protocol object is correct.

**Rule**: For Skywire quote/reply preview UI, write only Bluesky-compatible strong refs for external reach, and render quoted content from normalized AppView views first. Treat future chat/room/stage AT records as public repo records unless a separate encryption/private transport layer is explicitly designed.

---

## 2026-05-28 — Isolate inventory smoke cascades at the first failing spec

**What happened**: A full inventory E2E run for a Rat Race UI change built successfully, then failed first in the unrelated in-app market pricing spec because the storefront did not render the expected sale badge. Subsequent route smokes briefly reported `ECONNREFUSED` against the harness port, which made the log look broader than the original failure.

**Why it mattered**: Inventory runs cover many domains. A cascade can obscure whether the changed surface is broken or whether an earlier unrelated spec destabilized the harness.

**Rule**: When inventory E2E fails across many routes, inspect the first failed spec before changing code. Rerun the changed route or workflow in isolation and record unrelated first-failure evidence on the bounty board instead of treating every downstream `ECONNREFUSED` as a feature regression.

---

## 2026-05-28 — Analytics AppViews must explain uncertainty before tables

**What happened**: The tz2at ecosystem analytics AppView exposed useful CEX, Etherlink, network, route, and value-flow tables, but the primary readout still said things like "0 CEX buyers/sellers" without explaining sampling boundaries. Etherlink XTZ movement also appeared as large values without telling the operator whether the records proved bridge flow or only Etherlink-native movement.

**Why it mattered**: WTFOS AppViews are supposed to interpret protocol records for humans. Raw blocks of ambiguous analytics can lead operators to overclaim "nobody bought from a CEX" or misread Etherlink movement as L1 bridge liquidity.

**Rule**: Protocol analytics surfaces must lead with a plain-language executive readout, confidence notes, and network-aware charts. Raw data blocks belong in the full report, and zero/unknown states must say what the sample can and cannot prove.

---

## 2026-05-28 — Rat Race thresholds must be operator-tunable

**What happened**: Rat Race's API accepted filter query parameters, but the frontend and route defaults still presented the launch thresholds as fixed behavior: 24-hour sales window, 14-day mint window, 50% sold-through, 2 recent sales, and 24 cards.

**Why it mattered**: Market velocity shifts quickly, and Rat Race is a hunting tool. Hardcoded thresholds force code edits for normal operator tuning and make debugging "no hot editions" slower because the app cannot vary the filter from the surface being tested.

**Rule**: Rat Race threshold values must be first-class variables: environment-configurable backend defaults, query parameters on the API, and visible controls in the app. When a threshold appears in the UI, it should reflect the active server response, not a copied constant.

---

## 2026-05-28 — Objkt replay collects can carry token pk, not FA2 token id

**What happened**: After tz2at billing recovered, live replay emitted current Objkt `list_buy` collect records, but Rat Race still produced almost no hot cards. The records carried `tokenContract` correctly, while `tokenId` was Objkt GraphQL `token.pk` (for example `77144222`) rather than the FA2 token id used by Objkt URLs and token hydration (for example `161`).

**Why it mattered**: Rat Race queried metadata and active listings as `contract/pk`, so current Objkt sales were discarded during hydration. Older HEN-style records still worked, which made the failure look like market quietness instead of a marketplace-specific identifier mismatch.

**Rule**: Treat tz2at marketplace token identifiers as source-specific until hydrated. For Objkt records, resolve numeric token IDs as either `(fa_contract, token_id)` or `(fa_contract, pk)`, then normalize cards and market URLs to the actual FA2 `token_id`.

---

## 2026-05-28 — Mixed replay pages can hit tz2at's 5,000 event cap

**What happened**: Live `/replay` pages returned exactly 5,000 mixed events for some 500-block ranges, and `eventType`/`type` query parameters did not narrow the response. Larger chunks made it easier for marketplace collect records to be truncated behind blocks, transactions, account activity, raw observations, and big-map updates.

**Why it mattered**: Raising Rat Race's total replay window is not enough if each page is too broad. A wide time window with oversized chunks can silently miss the sale records the filter is trying to count.

**Rule**: Keep Rat Race replay chunks small while tz2at replay is a mixed-event endpoint without server-side type filtering. If tz2at adds an event-type filter later, verify it with raw counts before increasing chunk sizes.

---

## 2026-05-28 — CEX classifiers need a default custody book

**What happened**: The tz2at ecosystem analytics AppView had CEX-flow logic, but it only classified exchange inflow/outflow when a user or operator supplied `TZ2AT_CEX_ADDRESS_BOOK` or typed addresses into the UI. That meant the shipped default experience still could not answer "who is buying from/selling to CEX custody" even though the UI showed a CEX section.

**Why it mattered**: A classifier without a seed set is not a useful analytics feature. Operators need a conservative built-in custody list, and overrides should extend or replace entries without forcing every session to rediscover common exchange addresses.

**Rule**: Any WTFOS analytics classifier that depends on known entities must ship with a sourced default entity book, an explicit disable switch, and tests for the no-env/no-query path.

---

## 2026-05-28 — Rat Race filter windows must match replay scan windows

**What happened**: Rat Race exposed filters up to 168 hours, but the tz2at replay adapter capped its default scan at 14,400 estimated Tezos blocks, roughly 24 hours. Testing wider market windows showed Objkt had many tokens with multiple sales and active listings, while Rat Race could still miss anything whose repeat sales only became visible beyond the first day.

**Why it mattered**: A "last few days" urgency filter is only honest if the source fetch covers the same period the ranker is evaluating. Otherwise relaxing `windowHours` in the API/UI looks like it should broaden discovery, but the backend silently keeps using a one-day source slice.

**Rule**: Whenever Rat Race changes `windowHours`, update and test the upstream replay/backfill range in the same pass. The scan cap must be at least the maximum exposed filter window, and broad replay reads should be batched to avoid stampeding tz2at.

---

## 2026-05-28 — Cross-chain XTZ amounts need network-aware display units

**What happened**: The tz2at ecosystem analytics AppView displayed every `xtz.flow` amount as Tezos mutez. A live AT Protocol probe showed Etherlink records carrying 18-decimal native XTZ units, which would make the UI overstate Etherlink liquidity by a trillion-fold if rendered through the mutez formatter.

**Why it mattered**: The analytics suite is meant to answer liquidity and value-flow questions. Unit mistakes are not cosmetic there; they change the economic story the operator sees.

**Rule**: Any AppView that displays cross-chain XTZ liquidity must format amounts with network context. Treat Tezos mainnet as 6-decimal mutez and Etherlink/native EVM records as 18-decimal units unless the record schema explicitly provides a normalized display amount.

---

## 2026-05-28 — Surface replay freshness inside Rat Race diagnostics

**What happened**: Rat Race began using the fresh tz2at replay stream, but the first replay integration treated `/health` mostly as a way to discover block ranges. The live health payload already exposes `headLagBlocks`, `maxHeadLagBlocks`, `ageMs`, `maxStaleMs`, `ok`, and `state`, but Rat Race was not carrying those facts into the feed diagnostics.

**Why it mattered**: The user-facing question is not just whether any rows rank hot; it is whether the source was fresh enough to trust the empty result. Without replay freshness in the API/UI, a blank Rat Race feed can still be confused with a broken or stale upstream.

**Rule**: Rat Race must expose tz2at rolling-indexer freshness alongside candidate counts, and must fail closed without fetching replay pages when tz2at explicitly reports stale health.

---

## 2026-05-28 — Empty fresh replay windows are still source truth

**What happened**: Rat Race switched to the fresh tz2at replay stream, but the first implementation only returned `tz2at-replay` diagnostics when replay produced candidate rows. A healthy replay window with zero relevant sale candidates would fall through to the legacy ATProto repo path, which can now return `RepoNotFound` for the old hardcoded relay DID.

**Why it mattered**: "The current replay window has no qualifying sale rows" is a valid market/source state. Falling back after a successful empty replay can turn a truthful empty feed into an upstream error, and it makes diagnostics look like the new stream is broken when it is simply quiet for the selected range.

**Rule**: Only fall back from tz2at replay to legacy repo reads when replay itself fails. A successful replay response, including an empty one, must remain the diagnostic source for that Rat Race pass.

---

## 2026-05-28 — Generic test doubles must match generic fetch contracts

**What happened**: The tz2at ecosystem analytics implementation compiled, but the new unit test's `fetchJson` double returned concrete union objects from a generic `<T>` function. TypeScript rejected the mock even though the runtime behavior was correct.

**Why it mattered**: Protocol aggregation helpers often accept generic fetch adapters so response types stay anchored to each XRPC call. A test double that ignores that contract can make verification fail for the harness instead of the implementation.

**Rule**: When mocking generic XRPC/fetch helpers in TypeScript tests, annotate the mock with the same generic signature and cast fixture responses to `T` at the return boundary. Keep the cast in the test adapter, not in production parsing code.

---

## 2026-05-28 — Prefer fresh semantic replay records over legacy relay repos

**What happened**: tz2at's legacy relay PDS repo disappeared for the old hardcoded DID, while the improved `tz2at.xyz` stream became fresh at head and started emitting enriched marketplace records with `tokenContract`, `tokenRef`, `seller`, `amount`, and OBJKT provenance. Rat Race still tried the old `com.atproto.repo.listRecords` path first, so the improved source was not used.

**Why it mattered**: Rat Race should not infer token contracts from subject-address guesses when the current stream already provides canonical token refs. The old path can fail even when the new rolling indexer and replay records are healthy.

**Rule**: Rat Race must prefer the current tz2at replay/semantic record stream for market sale candidates, use legacy ATProto repo reads only as a fallback, and keep Objkt hydration only for fields not yet guaranteed by tz2at, such as edition supply and direct-buy listing ids.

---

## 2026-05-27 — Firehose liveness must include chain-head freshness

**What happened**: Rat Race still showed no hot editions after the tz2at AT Protocol fallback shipped. A live probe proved `wss://tz2at.xyz/firehose` and `wss://tz2at.store/xrpc/com.atproto.sync.subscribeRepos` were emitting messages, but tz2at's latest indexed block was `13371830` at `2026-05-26T18:34:37Z` while Tezos head was `13384239` at `2026-05-27T15:23:55Z`.

**Why it mattered**: A stream can be "alive" while still replaying stale history. Urgency commerce needs current sale events; a healthy websocket, non-empty repo, or green `/health` response is not enough if the indexed block level lags chain head by hours.

**Rule**: Every Rat Race/tz2at source-health diagnostic must compare latest indexed event level/timestamp against current Tezos head. Treat stale source freshness as a separate failure from missing edition supply or strict ranking filters.

---

## 2026-05-27 — AppViews need explorer surfaces separate from identity setup

**What happened**: The first tz2at WTFOS appview put firehose visibility inside the wallet-link wizard, so the only visible data path was "select one of my linked wallets and preview activity." That made the app feel like personal wallet plumbing even though WTFOS needs a broader AppView over tz2at replay/firehose records.

**Why it mattered**: Identity proof and AppView exploration have different trust boundaries. Wallet-link writes need slow, contextual consent; replay/firehose search should be read-only, searchable, and useful without implying the signed-in user's canonical repo is the data source or destination.

**Rule**: Protocol AppViews must separate setup/consent panels from read-only explorer panels. Personal wallets can be presets, but network firehose search needs first-class filters for event type, chain, address, contract, marketplace, token, operation hash, cursor/range, and source diagnostics.

---

## 2026-05-27 — Edition urgency filters must fail closed on unknown supply

**What happened**: Rat Race consumed sale records from `xyz.tz2at.marketplace.collect`, but those records do not carry total minted edition count. The fallback hydrates supply from Objkt metadata, but the first implementation still treated missing supply as `1`, which could make the "50% sold" filter pass or fail on invented math.

**Why it mattered**: Sold-through percentage is the core Rat Race signal. If total edition supply is unknown, the app cannot honestly know whether half the edition is gone, no matter how fresh the sale event is.

**Rule**: Never default unknown NFT edition supply to one for scarcity or sell-through filters. Require explicit metadata/mint supply, reject unknown-supply candidates from hot ranking, and show that rejection reason in diagnostics.

---

## 2026-05-27 — Protocol relays need repo collection reads, not route-shaped assumptions

**What happened**: After Rat Race launched against empty local market tables, the first investigation treated the existing WTF tz2at route as the available source shape. The upstream service actually exposed the needed market-wide records over the AT Protocol PDS at `tz2at.store`, especially `xyz.tz2at.marketplace.collect`; WTF had not consumed those collections.

**Why it mattered**: A protocol relay can provide the right facts while an app still looks broken if it only integrates with a narrower local route. For Rat Race, the difference was "tz2at lacks a market firehose" versus "WTF is reading the wrong surface of tz2at."

**Rule**: When integrating AT Protocol-backed data, inspect the repo collections and XRPC surfaces directly before judging source coverage. For market intelligence, treat app-local convenience routes as adapters, not the protocol boundary.

---

## 2026-05-26 — Empty market indexes must not masquerade as quiet demand

**What happened**: Rat Race showed no hot editions after launch. The filter logic was strict, but the actual root cause was earlier in the data path: the local market index tables Rat Race reads from had no sale rows, no mint rows, and no active listing rows. The tz2at firehose slice exposed a read-only wallet activity snapshot, not a market-wide sale-event consumer.

**Why it mattered**: A blank feed can be misread as "the market is cold" when the product is actually missing its source data. Urgency/ranking products need to prove the feed is fresh before rendering an empty state as a real market signal.

**Rule**: Any market-intelligence surface backed by indexed data must expose freshness/progression diagnostics for source rows, recent events, active listings, and final candidates. Do not ship a "no results" state until the ingestion path can distinguish empty market conditions from empty/stale tables.

---

## 2026-05-26 — Purchase intent narrowing must survive async wallet sends

**What happened**: The Rat Race direct-buy helper validated an external marketplace purchase intent, then continued to read `params.intent` inside the async contract-send closure. TypeScript correctly refused to treat those later indexed entrypoint reads as non-null, because the narrowed property access was not preserved across the closure boundary.

**Why it mattered**: Wallet operations are exactly where loose narrowing is dangerous. A nullable entrypoint or contract address must be proven once and then carried as a stable local value through preflight, contract lookup, and send.

**Fix**: Bound the validated intent to a local `const intent` immediately after the assertion and used that local for contract address, entrypoint, listing id, and mutez amount.

**Rule**: After validating a wallet-send DTO with nullable fields, copy the narrowed object into a local constant before entering async callbacks or transaction wrappers. Do not rely on repeated property reads from the original params object for contract entrypoint indexing.

---

## 2026-05-25 — Merge overlaps can duplicate registry-backed app entries

**What happened**: The full-send merge combined local and upstream desktop app gate work, leaving duplicate Skywire and Mail entries in the desktop icon registry. Browser inventory smoke still passed, but the actor-backed live puppet run emitted repeated React duplicate-key errors.

**Why it mattered**: Registry-backed app lists are identity maps, not decoration. Duplicate keys can make the desktop render unstable and can hide the fact that two branches both added the same app surface in different positions.

**Fix**: Removed the duplicate lower Skywire/Mail icon definitions and kept one canonical desktop icon per app key.

**Rule**: After resolving merge conflicts in app registries, search for duplicated app keys and run at least one actor-backed or browser smoke that would surface duplicate-key warnings before shipping.

---

## 2026-05-25 — Multi-role admin UI should read as additive, not bulk-edit

**What happened**: The Users admin role control was corrected away from a single-role mental model, but the replacement checklist made every user row feel like a bulk permission grid instead of a clean role assignment flow.

**Why it mattered**: Admins need to understand that roles are additive memberships. A dropdown that appends roles plus removable role tags communicates "this user has these keys" more clearly than either a scalar picker or a dense checkbox wall.

**Fix**: User rows now show assigned role tags with a small red remove control and keep the dropdown as an add-only role picker sourced from the role catalog.

**Rule**: For per-user multi-role assignment, use additive role tags plus an explicit add-role control. Reserve matrix/checklist layouts for role definition and access policy screens, not individual user cards.

---

## 2026-05-25 — Mailbox status payloads can be sparse during route smoke

**What happened**: Inventory route smoke for `/mail` crashed when the harness returned a sparse mail status object without `mailbox.address`. The page treated `status.mailbox` and `status.config` as fully present as soon as the status request resolved.

**Why it mattered**: Mailbox provisioning can be partial in local smoke, first-run accounts, disabled provider states, or provider outages. A route should show pending/unavailable labels instead of collapsing the app window.

**Fix**: Mail now optional-chains mailbox and config fields, showing useful fallback labels for pending address, status, rollout mode, provider, and inbound/outbound capability.

**Rule**: Mail and other provisioned integration surfaces must treat resolved status payloads as partial until the route boundary proves each nested field exists. Sparse route fixtures should render a degraded state, not an error boundary.

---

## 2026-05-25 — Complete behavior assertions in small verified slices

**What happened**: Behavior assertion coverage was too broad to finish honestly in one sweep. The next useful move was to complete named assertions one at a time, with each assertion tied to its owning app/admin surfaces and a focused verification command.

**Why it mattered**: Bulk-filling behavior assertions would recreate the same overclaim risk the coverage layers are meant to prevent. Incremental app-owned assertions let the coverage number rise only when a real visible result and durable side-effect contract has a named owner.

**Fix**: Completed the first four app-owned behavior assertions in this pass: Skullzarmy/FAFOlab integration contracts, runtime admin app gates, time-out app lockdown, and additive role/surface access. The workflow behavior layer now reports complete only when all domain workflows have named behavior ownership.

**Rule**: Add behavior assertions in small verified slices. Every new assertion must have an owner surface or platform owner, a focused verification command, and reciprocal registry ownership before the coverage gate is allowed to pass.

---

## 2026-05-25 — App gates must be runtime policy, not launcher decoration

**What happened**: Desktop app toggles were treated mostly as presentation state for icons and Start Menu entries. A disabled app could still be reached through direct routes, stale shortcuts, or command-palette commands because page access checks only evaluated auth, role, and surface grants.

**Why it mattered**: Admins need app disable controls to stop an app from running, not merely make it less visible. If launch surfaces and route rendering use different gate logic, disabled apps remain reachable through any path the UI forgot to hide.

**Fix**: Page access now combines role/surface access with the desktop app enabled map, command palette and Start Menu filtering use that shared decision, and direct disabled-app routes render an explicit admin-disabled failure state instead of mounting the app.

**Rule**: Every desktop app gate must be enforced at runtime in the shared route access layer. Launcher hiding is secondary; direct URLs, stale shortcuts, command palette entries, and open windows must all honor the same admin app state.

---

## 2026-05-25 — Behavior coverage must be owned by the app registry

**What happened**: The behavior assertion layer listed named proofs centrally, but the owning app/admin surfaces did not declare which behavior assertions belonged to them. That made the behavior map less modular than the app registry it was supposed to protect.

**Why it mattered**: Agents can safely mutate app behavior only when the owning app is forced to carry its own coverage contract. A central-only list lets behavior proofs drift away from app control mappings and makes it too easy to update tests without updating the app's registry-owned coverage surface.

**Fix**: Added app-owned `behaviorAssertionIds` to admin/app surfaces, added reciprocal `ownerSurfaceIds` or `platformOwner` to core behavior assertions, and made the inventory coverage gate fail when either side is missing or mismatched.

**Rule**: Behavior assertions are app-owned coverage contracts. When an app behavior changes, update the named behavior assertion and the owning surface's `behaviorAssertionIds` in the same pass; platform-wide assertions must explicitly declare a `platformOwner`.

---

## 2026-05-25 — WTF OS registries need executable cross-parity gates

**What happened**: Skywire and Mail were present in the desktop app registry, launcher gates, and routes but did not both have desktop-app admin surface bindings. Browser Boundaries and Digest route ownership could be shadowed by broader surfaces, Dear Diary's package doctrine domain disagreed with its admin surface, and the human route matrix missed live route entries.

**Why it mattered**: WTF OS registries are supposed to describe the same runnable surface from different angles: launch policy, app defaults, admin control, package acceptance, route inventory, and E2E coverage. When those drift independently, an app can run without full native/admin control mapping and tests can still claim skeleton coverage while operator observability is wrong.

**Fix**: Added the missing Skywire/Mail admin mappings, resolved route ownership collisions, aligned package domains with admin doctrine domains, updated the interaction route matrix, and expanded the inventory coverage gate to compare app keys, default config, Start Menu gates, admin bindings, package acceptance, and exact route inventory mentions.

**Rule**: Every WTF OS app, route, or domain change must satisfy the cross-registry parity gate in the same pass. Do not add app keys or route patterns without default config, launcher gate coverage, exactly one admin surface binding, package acceptance/domain alignment, and an exact inventory route mention.

---

## 2026-05-25 — Dynamic role tables need pre-migration fallbacks at every direct read

**What happened**: The role catalog pass made `user_roles` the canonical membership source, but `notifyHosts` directly joined the new table. The live puppet harness runs against a local database that had not applied the new role migration yet, so host notifications logged a missing-table error even though other role helpers had migration fallbacks.

**Why it mattered**: A production deploy can briefly run code near migration boundaries, and local/live puppet environments may lag new migrations. If one caller bypasses the shared fallback helper, the product stops behaving like one resilient role system.

**Fix**: Host notification lookup now tries canonical `user_roles` first, then falls back to the legacy `users.role` shadow for system roles when the membership table is missing.

**Rule**: During role-system migrations, direct reads of new role tables must either use the shared role helper or catch missing-relation errors and fall back to the legacy shadow field. Do not add one-off joins to `user_roles` without a migration-bridge path.

---

## 2026-05-25 — Sparse optional config must guard nested fields

**What happened**: Inventory route smoke for `/wtf-subdomains` crashed when the harness returned a sparse hack.tez config object without `attribution`. The panel guarded `config` but then read `config.attribution.productName` directly.

**Why it mattered**: Optional integration config often arrives in partial states during local smoke, missing env, or upstream downtime. A route should show fallback labels instead of crashing the WTF OS window.

**Fix**: Hack.tez attribution rendering now optional-chains nested attribution fields and falls back to the known product, org, and creator labels.

**Rule**: When an integration config object is optional, every nested branch from that object is optional too unless the route boundary parser proves otherwise. Sparse inventory fixtures should render useful fallbacks, not fatal component errors.

---

## 2026-05-25 — Additive roles need one canonical membership model

**What happened**: The first role refactor direction preserved `users.role` as an admin-managed primary role while adding multi-role assignments beside it, which would have made the product feel like two competing role systems instead of Discord-style additive membership.

**Why it mattered**: Role-gated apps, permissions, and experimental access must all answer the same question: which roles does this user have? If one UI edits a scalar role while another grants role memberships, access becomes hard to reason about and admins cannot trust the matrix.

**Fix**: `user_roles` is now the canonical role membership source for runtime access; `users.role` is treated as a compatibility shadow/fallback for old reads. Auth responses expose assigned `roles`, permission checks evaluate the union of all memberships, and WTF OS surface access is granted from the registered admin surface inventory.

**Rule**: Do not ship new role behavior as "primary role plus side badges." New access code must consume canonical role memberships and only use legacy scalar role fields as migration fallbacks or denormalized display shadows.

---

## 2026-05-24 — WIM buddy lists must be user-derived, not room-derived

**What happened**: WIM rendered the buddy list from the DM conversation list, so Studio project group conversations appeared as if they were individual buddies. The UI also had no real WTF user roster, online indicators, friend shortcut flow, or reliable direct-chat open smoke.

**Why it mattered**: An instant messenger buddy list is a people surface. Mixing project rooms into it sends users into the wrong context, hides who is actually online, and makes “add friend / open chat with this user” feel broken even if the message backend works.

**Fix**: WIM now fetches WTF users separately from direct conversations, excludes the signed-in user, decorates users with session-derived online status, keeps Studio rooms out of the roster, stores friend shortcuts locally, and opens/creates direct chats from double-click or the chat button. The inventory registry now includes `wim.friend.added`, and browser smoke confirms the unsafe-method direct-DM creation path.

**Rule**: People rosters must be sourced from people and friendship state; room/project/group conversations belong in their owning surfaces or an explicitly labeled recent-room section. For messenger UI changes, smoke the actual open-chat click path, including CSRF and POST behavior, not only route render.

---

## 2026-05-24 — Route-smoke fixtures need explicit empty-state API contracts

**What happened**: WIM verification surfaced unrelated route-smoke crashes: `DiscoveryCard` assumed random discovery payloads always had addresses, Porcupin route smoke fell through to a generic truthy mock object instead of a real “not connected” response, and the WIM unsafe-method smoke could not create a direct DM until the harness returned a real CSRF token.

**Why it mattered**: Sparse fixtures should either match a valid empty state or intentionally prove defensive rendering. Generic catch-all API objects can make components take impossible branches, while missing CSRF mocks can hide whether a click handler actually reaches its mutation.

**Fix**: Discovery address labels now tolerate missing addresses, the harness has explicit Porcupin empty-state responses, and the harness exposes `/api/auth/csrf-token` for client POST flows.

**Rule**: When a route-smoke harness mocks an app route, model the route's empty-state contract explicitly. Any browser smoke that clicks a POST/PUT/PATCH/DELETE path must include CSRF token handling so the test verifies the feature, not the harness fallback.

---

## 2026-05-24 — OAuth SDK cache deletion must not unlink persisted identity sessions

**What happened**: After Skywire fixed the missing OAuth token subject, the AT OAuth SDK could still report `This session was deleted by another process` on refresh because the app's session-store delete callback cleared encrypted access, refresh, and DPoP tokens from the database. A transient SDK restore/delete path could therefore turn a linked AT account into a tokenless row.

**Why it mattered**: Browser refreshes and deploys must not destroy a user's AT Protocol link. SDK cache lifecycle is not the same as a user choosing to unlink an identity, and raw SDK errors make Skywire feel unreliable exactly where a social client needs trust.

**Fix**: The OAuth delete callback now only clears pending in-memory handoffs and leaves persisted DB tokens intact until an explicit unlink path exists. Stored OAuth sessions persist and restore the full token contract, account responses expose a reconnect-required state when token material is actually missing, and public-read Skywire tabs can fall back to appview instead of every tab failing together.

**Rule**: Treat OAuth SDK session-store deletion as cache invalidation unless the user explicitly unlinks the account. Persist enough issuer, audience, subject, token, and DPoP material to restore across refreshes, and surface missing persisted tokens as a reconnect action rather than leaking SDK restore errors.

---

## 2026-05-24 — Nullable policy reasons must be normalized at route boundaries

**What happened**: A rebased communication route resolver returned `policy.reason` directly into `CommunicationRouteTarget.reason`, but the browser policy type allows `null` while the route target allows only `string | undefined`.

**Why it mattered**: A nullable diagnostic value can block the whole production TypeScript gate even when runtime behavior would be harmless. Boundary DTOs need explicit normalization.

**Fix**: The comms route resolver now falls back to `browser_policy_blocked` when a blocked browser policy has no reason string.

**Rule**: When returning shared DTOs, convert `null` diagnostics to either a concrete reason string or `undefined`; do not leak nullable internal policy fields across typed route boundaries.

---

## 2026-05-24 — OAuth callback sessions must be readable before account rows exist

**What happened**: Skywire let the AT OAuth SDK save the callback session into a pending in-memory handoff when no `atproto_accounts` row existed yet, but the SDK's returned `OAuthSession` immediately reloaded credentials from `sessionStore` before profile hydration. Because `sessionStore.get` ignored pending sessions, the callback saw `The session was deleted by another process` and redirected the popup into a second WTF desktop with a generic failure notice.

**Why it mattered**: New-account linking is the exact moment when there may be no account row yet. If the callback cannot read its own just-created session, OAuth approval succeeds upstream but fails inside WTF before Skywire can create the link.

**Fix**: The OAuth session store now reads pending sessions before falling back to the database, restored sessions use the SDK-documented `new Agent(session)` path, and popup callback results render a tiny completion page that signals the already-open Skywire window instead of loading a second WTF shell.

**Rule**: Any OAuth session store that defers persistence until an app-owned account row exists must still make pending sessions readable to the SDK during the same callback. Popup OAuth callbacks should complete through a dedicated handoff page, not a full app route.

---

## 2026-05-24 — Linked identity is not the same as a usable social client

**What happened**: Skywire could connect a Bluesky/AT Protocol account, but the user landed in account/bridge tooling and keyword-search feeds. The real authenticated home timeline route existed server-side as `feedType=following`, but no UI tab exposed it, and feed cards rendered raw AT payload fragments without the basic Bluesky affordances users expect.

**Why it mattered**: OAuth success only earns one more click. If the next screen is not the user's actual Bluesky timeline with recognizable posts, authors, embeds, counts, actions, and pagination, the product feels like identity plumbing instead of a client.

**Fix**: Promoted the authenticated Bluesky home timeline to Skywire's default connected surface, normalized timeline/search/author/notification payloads server-side, added cursor pagination, and rendered a single richer feed card across home, WTF, Tezos, author, and notification surfaces while keeping WTF-native AT repo signals as a separate extension.

**Rule**: For protocol clients, ship the canonical user loop first. Account linking must immediately lead to the primary content/action surface, and tests must cover that the route is both implemented and visible in the UI.

---

## 2026-05-24 — Do not leave alternate registration branches in live identity UI

**What happened**: Skywire no longer wanted to own user-facing AT Protocol registration, but the React panel still contained a config-dependent branch that could render the local handle/email/password/phone form for non-external PDS modes.

**Why it mattered**: Hidden UI branches become live product as soon as configuration changes. For identity flows, that means users may see a registration surface the product has deliberately decided not to support.

**Fix**: Removed the local registration form branch from Skywire entirely. The account panel now offers only the official Bluesky signup handoff plus the OAuth connect flow.

**Rule**: When product direction removes a user-facing flow, delete the UI branch rather than hiding it behind provider configuration. Keep backend protocol experiments unavailable from user screens until the full flow is intentionally supported.

---

## 2026-05-24 — AT OAuth callback persistence must not depend on private client caches

**What happened**: Skywire's AT OAuth callback let the OAuth library store a fresh session before the linked `atproto_accounts` row existed. The store update could affect zero rows, then the route tried to recover the stored session through a private `sessionGetter` cache. The callback also hydrated the profile through a restored fetch handler instead of the library's documented `new Agent(session)` path, and the popup-style user journey did not refresh the already-open Skywire app.

**Why it mattered**: A user can approve Bluesky/AT Protocol permissions and still return to Skywire with no visibly linked account. OAuth approval is the trust moment; losing the handoff makes Skywire feel fake even if the upstream authorization worked.

**Fix**: Added an explicit pending OAuth session handoff until the account row exists, switched callback profile reads to `new Agent(session)`, and made popup completion notify the open Skywire app through same-origin storage before closing.

**Rule**: OAuth callback routes must persist authorization state through explicit app-owned storage and use public SDK session APIs. Do not rely on private client caches to bridge lifecycle gaps, and make popup callbacks refresh the initiating app window.

---

## 2026-05-24 — Tezos domain identity belongs in account surfaces, not only wallet rows

**What happened**: WTF linked wallets could resolve reverse and owned `.tez` domains, but Skywire's Identity Bridge and the account/profile surfaces only showed a single vague `tezDomain` value. Users with several domains had no clear preferred Tezos identity in Skywire and no way to select a detected domain for account-level use.

**Why it mattered**: Tezos identity is part of the user's WTF account, not just wallet metadata. Skywire needs to bridge AT handles, WTF-hosted handles, and Tezos aliases coherently so users understand what identity each network sees.

**Fix**: Added a user-level Tezos identity resolver, exposed preferred/reverse/owned domains to Skywire, enriched wallet responses with detected domains, and added a route/UI affordance for selecting a detected `.tez` domain as the preferred wallet identity.

**Rule**: Any feature that asks for a "Tezos alias" should consume the shared user Tezos identity resolver first, showing reverse-domain preference and detected owned domains before asking users to type an alias manually.

---

## 2026-05-24 — Connection flows must normalize handles like registration flows

**What happened**: Skywire's direct registration path accepted short Bluesky usernames by appending the default suffix, but the connect path sent the typed value to OAuth start unchanged. A user typing `wtfgameshow` could hit a pre-OAuth validation failure instead of being sent to Bluesky.

**Why it mattered**: Users do not distinguish "register" and "connect" parsing rules. If one identity flow accepts a short username and another requires a full DNS handle, the app feels randomly broken.

**Fix**: The connect button and `/api/atproto/oauth/start` now normalize short handles with the default suffix. OAuth start failures redirect back to Skywire with a visible message and a sanitized server log.

**Rule**: Shared identity inputs need shared normalization across register, connect, claim, and search flows. Do not let adjacent AT Protocol entry points invent their own handle grammar.

---

## 2026-05-24 — External signup paths should not keep local registration forms visible

**What happened**: Skywire routed `bsky.social` account creation to the official Bluesky signup flow, but still rendered the local handle/email/password/invite form in the same registration panel.

**Why it mattered**: Users read form fields as available product actions. A disabled or irrelevant registration form creates false work and undermines the clean handoff to the provider that actually owns account creation.

**Fix**: Official-signup-managed PDSes now show only the official signup action. Skywire's direct registration form remains reserved for allowlisted PDSes that can actually complete account creation through Skywire-managed AT Protocol APIs.

**Rule**: Once a provider-owned flow is selected, remove local form fields that cannot affect that flow. Do not leave dead fields around as explanatory scaffolding.

---

## 2026-05-24 — Required verification is not the same as exposed verification

**What happened**: Skywire correctly added `com.atproto.temp.requestPhoneVerification`, but `bsky.social` currently reports that phone verification is required while returning `InvalidRequest: phone verification not enabled` from that public phone-code endpoint. The UI still offered "Send Phone Code", creating a dead-end loop.

**Why it mattered**: AT Protocol PDS policy and PDS remediation surfaces are separate contracts. A PDS can require an account-creation verification step while reserving the code-sending flow for its own official signup surface.

**Fix**: Registration options now distinguish Skywire-managed phone-code PDSes from official-signup-managed PDSes. `bsky.social` routes users to the official signup path, while other allowlisted PDSes can still use the in-app phone/code flow when they expose it.

**Rule**: Do not infer that a required remediation is available through the same public API surface. Probe or model support separately, and present only the user action the selected provider can actually complete.

---

## 2026-05-24 — PDS verification requirements should become in-app flows

**What happened**: Skywire initially translated `InvalidPhoneVerification` into a clearer error, but the product still did not offer the supported AT Protocol phone verification procedure even though the SDK includes `com.atproto.temp.requestPhoneVerification` and `createAccount` accepts `verificationPhone` plus `verificationCode`.

**Why it mattered**: A user-actionable error is not the same thing as completing the job. Registration is a core identity flow, and Skywire is supposed to bind users to AT Protocol DIDs from inside WTF OS, not merely explain why it failed.

**Fix**: Added an in-app phone verification request endpoint, passed verification phone/code through account creation, exposed phone/code controls in the Skywire registration UI, and registered the new interaction in inventory coverage.

**Rule**: When an upstream protocol exposes a remediation flow, implement that flow before settling for explanatory error text. Error copy is the fallback, not the product.

---

## 2026-05-24 — PDS registration rejections must not become 500s

**What happened**: `bsky.social` rejected Skywire account creation with `InvalidPhoneVerification` because that PDS now requires additional phone verification through the official Bluesky flow. Skywire did not catch the XRPC rejection, so Express returned a generic Internal Server Error.

**Why it mattered**: Users cannot fix an upstream PDS requirement if the app hides it behind a 500. AT Protocol PDS registration policies can change independently from WTF, so Skywire has to translate those rejections into clear, user-actionable responses.

**Fix**: Wrapped `createAccount` in a PDS error boundary, logged sanitized PDS status/error details, and returned a 4xx JSON response that names phone verification, invite, email, handle, or generic verification requirements.

**Rule**: Every outbound AT Protocol mutation to a third-party PDS must map XRPC errors to user-actionable 4xx or 502 responses. Never let expected upstream policy rejections escape as generic 500s.

---

## 2026-05-24 — Registration forms must resist browser autofill drift

**What happened**: Skywire AT identity registration rendered the email field as a generic text input, so browser autofill could place the WTF username into the email slot. The server then returned a generic invalid-payload error instead of naming the failing field.

**Why it mattered**: Account registration is already high-friction. If autofill silently moves identity values into the wrong field and validation errors are generic, users cannot tell whether the handle, email, password, PDS, or invite code is wrong.

**Fix**: Marked the client email/password/handle fields with explicit input types, names, and autocomplete hints; disabled submit until the email looks like an email; normalized short registration handles with the default AT suffix; and returned field-level server validation errors.

**Rule**: New account or identity forms must use field-specific input types/autocomplete attributes and return field-level validation errors. Never ship a generic registration payload error when the parser knows the failing field.

---

## 2026-05-24 — Skywire routes must normalize AT client inputs before deployment

**What happened**: Expanding Skywire from OAuth linking into registration, actor discovery, follows, profile updates, and custom repo records introduced more path and query values that flow directly into AT Protocol client methods.

**Why it mattered**: AT Protocol clients expect canonical strings such as handles, DIDs, and AT URIs. Raw Express params or unchecked user input can make type drift, flaky upstream calls, or unsupported PDS choices show up as confusing runtime failures.

**Fix**: Added zod parsing and PDS allowlisting for registration, normalized actor route params before author-feed calls, and made actor search degrade to an empty result set when the public appview is unavailable.

**Rule**: New Skywire/AT Protocol routes must parse or normalize path/query/body inputs at the route boundary, keep registration PDS hosts allowlisted, and make non-critical public appview reads degrade without blocking inventory smoke.

---

## 2026-05-24 — Iframe integrations must ship with matching CSP frame sources

**What happened**: The TTC calendar submission flow opened `https://thetezos.com/submit-event/` in an in-app iframe modal, but production smoke showed WTF's CSP still allowed only self, Beacon, and WalletConnect/Reown frame sources. The feature would load locally and still fail in production because the response header blocked the new frame.

**Why it mattered**: Browser integrations are a contract between UI, upstream headers, and our own security policy. A button can be correct React and still be nonfunctional if CSP does not name the embedded origin.

**Fix**: Added `https://thetezos.com` as an explicit trusted calendar frame source and covered it with the CSP policy test.

**Rule**: Any new iframe, popup-like embed, wallet frame, media frame, or cross-origin browser surface must update CSP and include a production-header smoke check before deploy is called live.

---

## 2026-05-24 — Browser-local state must load before save effects can run

**What happened**: Calendar personal events were added as browser-local entries keyed by user, but the first implementation used the same render cycle for loading from `localStorage` and persisting state back. That made it possible for an empty initial array to overwrite previously saved personal calendar entries before the load effect had hydrated them.

**Why it mattered**: Browser-local features are still durable user data. A page refresh should not race itself and erase a user's private view just because React effects ran in the wrong order.

**Fix**: Added an explicit readiness flag so the save effect only writes after the load effect has attempted to hydrate the current user's personal calendar key.

**Rule**: Any browser-local persistence path needs a load-before-save guard, especially when the storage key depends on auth/session state.

---

## 2026-05-24 — Passive wallet rehydration must never become wallet proof

**What happened**: `WalletProvider` correctly avoided initializing Beacon/Octez during page-load rehydration, but once the web session user loaded it reused the same wallet-link helper for both passive refresh and explicit connect. If a cached local wallet was not linked to the current account, passive refresh requested `/api/wallets/challenge` and called `signPayload`, so a normal browser refresh could surface a wallet signature prompt.

**Why it mattered**: Wallet signatures are identity proof, not a background sync primitive. A cached local wallet can belong to another account, a previous visitor, or a wallet the current user has not decided to link. Asking for ownership proof on refresh makes the app feel pushy and blurs the line between observing local wallet state and creating account identity state.

**Fix**: Split wallet linking into passive and explicit modes. Passive rehydration now only syncs wallets that are already linked to the current account; unlinked cached wallets remain unsynced until the user explicitly connects/links or starts a participation flow that requires wallet proof.

**Rule**: Page-load wallet hydration may read cached display state and sync already-linked wallets, but it must not create a wallet challenge or request a signature. Only user-initiated connect, login/register, link, or action-specific participation flows may ask for wallet ownership proof.

---

## 2026-05-22 — New desktop routes must update every inventory gate immediately

**What happened**: While adding Skywire, the route registry and inventory route fixture had to move together. The coverage gate also exposed an existing `/task-manager` registry route that was missing from the route fixtures, which would have made the new Skywire pass look responsible for unrelated inventory drift.

**Why it mattered**: WTF OS route registration is executable product inventory. A route that is launchable from the desktop but missing from `tests/e2e/inventory/route-fixtures.mjs` breaks the coverage contract and makes later feature work inherit stale debt.

**Fix**: Added Skywire to the route fixtures and filled the missing Task Manager fixture while updating the interaction inventory and social workflow handles.

**Rule**: Any desktop route registry change must be paired with inventory docs, route fixtures, and coverage gate verification in the same pass. If the gate reveals unrelated missing route fixtures, fill the fixture rather than leaving the inventory contract broken.

---

## 2026-05-19 — Leaderboard smoke must not make reward deploys depend on profile enrichers

**What happened**: While verifying Side Quest rewards, the launch-surface puppet also visited the leaderboard. That path triggered TzKT holder cache reads and repeated TzProfiles upstream retries, then timed out despite the Side Quest and reward assertions already passing.

**Why it mattered**: Reward deploy confidence should come from owned reward ledger, cashout, market, and leaderboard API assertions. A public-profile enrichment outage should not make an unrelated feature look unsafe to deploy.

**Fix**: Removed leaderboard navigation from the launch-surface puppet and left leaderboard coverage in inventory route smoke plus explicit reward leaderboard API probes.

**Rule**: Keep profile-enriched leaderboard UI checks in their own behavior test with bounded/mocked upstreams. Do not attach them to reward or launch-surface puppets unless the leaderboard UI itself is the feature under test.

---

## 2026-05-19 — Live behavior tests should stay inside their owned surface

**What happened**: The Gameshow launch-surface puppet was meant to prove Mission Control, Challenges, Side Quests, and leaderboard behavior, but it also waited on a broader Rounds launch-board check. During the Side Quests deploy pass, that extra route sat behind noisy TzKT/TzProfiles retries and consumed the whole test timeout after the owned assertions had already passed.

**Why it mattered**: Live puppet tests are expensive and can touch real upstream dependencies. A behavior test that reaches outside its owned assertion surface can become a deploy blocker for unrelated upstream or page-load noise.

**Fix**: Kept the puppet focused on the owned flow: seed side quests, create an active challenge, verify Mission Control side-quest wording, verify Challenges visibility, verify leaderboard XP navigation, and clean up the temporary challenge.

**Rule**: Keep live puppet behavior assertions scoped to the stated feature contract. Put adjacent route smoke in inventory route tests unless the user-visible behavior depends on that route in the same workflow.

---

## 2026-05-19 — Live puppet assertions must scope repeated page text

**What happened**: The Side Quests launch-surface live puppet test found the temporary challenge title on Mission Control and again on the Challenges page. The product rendered correctly, but Playwright strict mode failed because the test used an unscoped `getByText(title)` assertion after navigating to Challenges.

**Why it mattered**: Actor-backed E2E should fail on broken user behavior, not on broad locators that become ambiguous as pages gain richer summaries, legends, or repeated accessible names.

**Fix**: Scoped the challenge title assertion to the first visible match on the Challenges page while keeping the surrounding route and button assertions intact.

**Rule**: When a live puppet assertion uses generated text that can appear in cards, legends, headers, or summaries, scope it to the owning panel/card or use `.first()` intentionally with nearby route/action assertions.

---

## 2026-05-19 — Reward currency boundaries must be explicit before wallet payout

**What happened**: The Side Quests reward pass needed earned WTF to work both as in-app market credit and as a wallet cashout, while EXP stayed as an in-app experience system. Treating all reward buckets generically would have made it too easy to route EXP toward a signer or to double-pay earned WTF through the legacy unpaid-ledger operator path.

**Why it mattered**: Cashout code crosses user balances, primary wallets, platform signer policy, and production funding. The app needs a settlement state machine that separates available earned WTF, pending cashout, paid cashout, and market-spent WTF before any signer request is made.

**Fix**: Added reward-ledger settlement states, a reward cashout table, 20 WTF minimum validation, reward-WTF market checkout, signer FA2 asset allowlisting, and leaderboard/account views that keep EXP and other rewards separate from wallet disbursement.

**Rule**: Any future reward currency must declare whether it is wallet-disbursable or in-app-only before it reaches ledger, market, signer, leaderboard, or E2E inventory code. Never let a new reward type reuse WTF cashout plumbing by default.

---

## 2026-05-11 — Phase law must restart from current main, not stale clones

**What happened**: Phase 0 work began in a gitless clone that was several dozen commits behind production `main`. Some useful patches existed there, but treating that clone as authoritative would have overwritten newer OS organs and hidden current production shape.

**Why it mattered**: The Law is an execution order, not permission to transplant stale files wholesale. WTF OS doctrine says no organs get amputated casually; a stale clone can silently remove newer shell, game, auth, media, and deploy work.

**Fix**: Restored `The Law, Delivered.md` exactly onto a clean worktree from current `origin/main`, switched the working ledger to the private triage board, and used the old clone only as reference while reapplying narrow Phase 0 fixes against current files.

**Rule**: Before executing Law phases, verify the repo, branch, remote, commit, dirty state, and private ledger source. Reference old work as a patch library, never as the tree of truth.

---

## 2026-05-09 — Mock-service tests must control the service clock they observe

**What happened**: A WTF Button audit-summary regression test reset the mocked game state to a fixed historical timestamp, then called snapshot/quote helpers that use `Date.now()`. The service correctly advanced the old round before quoting, so the test saw a cannot-press quote instead of the active fresh table it intended to inspect.

**Why it mattered**: Casino table services mix pure rule functions with process-level mock adapters. If a test resets service state to an old timestamp but observes through wall-clock helpers, it can accidentally test settlement/idle behavior instead of the target action.

**Fix**: Reset the mock service with a current baseline for wall-clock snapshot tests and kept historical timestamps for pure-rule tests that pass `nowMs` explicitly.

**Rule**: When testing casino mock services, either pass `nowMs` end to end or reset the service with a current baseline before calling helpers that read `Date.now()`.

---

## 2026-05-09 — Do not run nested build smoke suites beside standalone builds

**What happened**: A standalone `npm run build` and `npm run test:e2e:inventory` were started at the same time. The inventory command runs its own build, so both Vite jobs tried to clean/write `dist` concurrently and the inventory run produced an `ENOTEMPTY`/missing `index.html` artifact failure before a targeted rerun cleared the unrelated route smoke.

**Why it mattered**: Concurrent build cleanup can make healthy routes look broken and burn verification time on false failures.

**Fix**: Reran the failed route smoke after the standalone build completed and confirmed it passed.

**Rule**: Do not run `npm run build` in parallel with commands that already run a build, including `npm run test:e2e:inventory`. Let build-producing verification steps run serially unless they use isolated output directories.

---

## 2026-05-09 — MCP scopes must be account-role capped, not user-declared

**What happened**: MCP bearer tokens were tied to the user that created them and privileged tools still checked the user's role, but token creation accepted arbitrary posted scope strings. A non-admin could therefore store scopes like `*`, `arcade:*`, or `arcade:admin`; the tool role checks blocked the worst outcome, but the token itself overstated what the account should be allowed to delegate.

**Why it mattered**: MCP is delegated account access. A user's agent must not gain any WTF surface that the same user could not reach through the browser, and future tools should not have to survive forged wildcard/admin scopes by convention alone.

**Fix**: Added a shared MCP scope policy that filters scopes at token creation and again at bearer authentication. Non-admin accounts can only receive exact user-level scopes; wildcard and admin scopes are effective only for admin accounts, and explicit invalid scope requests now fail closed to an empty scope set.

**Rule**: Treat MCP scopes as derived from the paired user's account role, never as trusted client input. Any new MCP admin or wildcard scope must be added to the shared scope policy and covered by role-cap tests.

---

## 2026-05-09 — MCP bearer auth must never become browser session auth

**What happened**: The MCP route authenticated paired-agent bearer tokens independently from Passport, but it still lived behind the global Express session middleware. A browser could therefore include an existing `connect.sid` cookie on `/mcp` while the MCP request used a different paired token, leaving the boundary dependent on route discipline.

**Why it mattered**: Users need MCP access without risking their normal site session. A paired-agent call must not create, rotate, replace, refresh, or clear the browser's account cookie, and browser cookies must never be accepted as MCP credentials.

**Fix**: Made `/mcp` suppress all outgoing `Set-Cookie` headers, reject cookie-only MCP access with explicit messaging, and log `mcp.browser_session_ignored` whenever a browser session identity is present but a paired bearer token remains authoritative.

**Rule**: `/mcp` may read only `Authorization: Bearer wtf_mcp_...` for MCP identity. Do not add Passport login/logout, `isAuthenticated`, cookie writes, or browser-session identity fallback to the MCP transport path.

---

## 2026-05-09 — One-time auth modals must be accounted for in E2E actors

**What happened**: Adding the WTF OS welcome event correctly showed a one-time modal for accounts without the welcome flag, but the inventory Playwright harness returned an admin user fixture without that flag. The modal intercepted the `ADM` button click in the strict-admin system integration test.

**Why it mattered**: First-login UI is part of the auth surface. If test actors do not model whether they have already completed account onboarding, unrelated route and admin tests can fail behind an overlay even though the app behavior is correct.

**Fix**: Added the welcome flag to harness users, gave the harness a welcome-completion endpoint, and marked live puppet users as already welcomed during seeding while preserving the real first-login path for normal accounts.

**Rule**: Any future one-time account modal or onboarding gate must update mocked harness users and live puppet seed state in the same pass, or explicitly dismiss the modal in the affected browser tests.

---

## 2026-05-09 — Agent access needs one manifest shared by API and MCP

**What happened**: The repo documented browser, public API, and MCP access in prose, and the interaction inventory listed MCP access handles, but there was no runtime access manifest that both JSON clients and paired MCP agents could read before navigating or automating WTF. MCP transport requests also were not emitting the normalized agent events the inventory said existed.

**Why it mattered**: Browser access, JSON API access, and paired-agent access have different auth envelopes. Without a single runtime manifest and telemetry spine, agents could drift from the standard browser route model or make it harder to prove MCP usage was isolated from normal browser sessions.

**Fix**: Added a public read-only `/api/access` manifest, exposed the same manifest through `wtf_get_access_manifest`, and wrapped the MCP transport with connection/tool telemetry that records paired-token usage without touching browser session cookies.

**Rule**: Any future change that adds or reshapes standard WTF access for agents must update the shared access manifest, MCP capabilities, public access docs, and inventory coverage together.

---

## 2026-05-09 — Local dev CORS must follow the active app port

**What happened**: The WTF OS browser smoke started the app on `PORT=3317`, but development CORS only allowed a fixed set of local origins (`3000`, `3001`, and `5173`). Same-origin browser API calls from `http://localhost:3317` were rejected, so the desktop never reached the taskbar during smoke verification.

**Why it mattered**: Local verification ports are often moved to avoid conflicts. If CORS does not include the actual runtime port, the app can look broken even though the route, Vite server, and API code are all present.

**Fix**: Added the active `PORT` to the non-production local origin allowlist and covered it with a focused CORS origin test.

**Rule**: Development CORS allowlists must include the active runtime port, not only the common default ports. Browser smoke tests should use the same URL the server prints and treat self-origin CORS failures as app boot failures.

---

## 2026-05-09 — Start Menu structure needs one registry-backed model

**What happened**: The Start Menu/Stuffs launcher had drifted into a hand-maintained list where Arcade and My Games lived under a Casino category, while the route registry carried different labels and ownership. The first cleanup made the menu registry-driven but still did not match the intended WTF OS information architecture.

**Why it mattered**: WTF OS feels scattered when users cannot predict where native apps, domain workflows, account tools, and browse surfaces live. Launcher grouping is product architecture, not decorative copy.

**Fix**: Rebuilt the Start Menu model into explicit Windows 95-style sections: Apps, domain categories, account/system entries, Browse, then session action. Gaming now owns Casino, Arcade, and Game Console; My Games lives under My Media; Casino can render visible-but-inactive when the current user lacks a membership card.

**Rule**: Start Menu changes must update the registry-backed menu model and focused structure tests. Do not add one-off hardcoded launcher categories in JSX.

---

## 2026-05-09 — Live puppet probes must encode fail-closed access as success

**What happened**: The live puppet domain workflow probed Casino game-state APIs with an admin puppet that did not own the Casino app pass or active membership card. The app correctly returned `402` with the fail-closed access payload, but the harness treated every non-2xx API probe as a test failure.

**Why it mattered**: Actor-backed E2E should prove permission boundaries as well as happy paths. A gated API returning a clear denial can be the expected behavior, especially for wager-adjacent Casino surfaces.

**Fix**: Added per-probe expected status support to the inventory workflow contract and marked the Casino WTF Button state/quote probes as accepting either an accessible `200` or a fail-closed `402`.

**Rule**: Inventory and live puppet probes for gated APIs must document acceptable denial statuses instead of assuming every reachable path should return `2xx`.

---

## 2026-05-09 — Deploy warnings are part of the release surface

**What happened**: The Arcade full-send deploy succeeded, but GitHub Actions emitted a warning that `actions/checkout@v4` was still running on the deprecated Node.js 20 action runtime.

**Why it mattered**: A warning in the deploy job can become tomorrow's production blocker. Full-send verification should account for the workflow health, not only the application health endpoint.

**Fix**: Upgraded the deploy workflow from `actions/checkout@v4` to `actions/checkout@v5`, whose action metadata runs on Node 24 instead of requiring a forced runtime override.

**Rule**: After a production deploy, scan workflow annotations as part of the smoke pass. If an annotation names an upcoming runtime cutoff, fix and redeploy while the change is still tiny and attributable.

---

## 2026-05-09 — Manager-wallet deploy UI must ship signer intent support with the domain

**What happened**: The clean full-send worktree compiled the Club Dues domain against `origin/main` and immediately caught that the app-level dues service called `intent: "originate_contract"` while the checked-in operator signer protocol on `main` did not yet know that intent or return originated KT1 addresses.

**Why it mattered**: The dues admin screen could have looked ready while manager-wallet deployment failed at typecheck or runtime. Contract factory-style features cross the app server, shared signer envelope, signer daemon policy, and signer tests; shipping only the UI/service slice is incomplete.

**Fix**: Included the signer protocol, client, daemon policy, env gates, build, and tests in the same isolated club-dues release commit.

**Rule**: Any feature that asks a platform wallet to originate or administer a contract must update and verify the shared signer protocol plus daemon policy in the same pass, including `npm run operator-signer:check`, `npm run operator-signer:build`, and `npm run operator-signer:test`.

---

## 2026-05-09 — Node signer services need V8-aware systemd hardening

**What happened**: The production `wtf-operator-signer` systemd unit used `MemoryDenyWriteExecute=yes`. Node/V8 tried to allocate executable JIT memory during signer startup and crashed with `status=5/TRAP`, leaving no Unix socket for the app container. A first attempted fix using `NODE_OPTIONS=--jitless` avoided the trap but broke Node's built-in Undici HTTP stack because its llhttp path expects WebAssembly.

**Why it mattered**: The app can have the correct signer protocol, auth token, keyring, and Docker socket mount while still failing manager-wallet deployment if the isolated signer process cannot survive its service sandbox.

**Fix**: Disabled `MemoryDenyWriteExecute` for the Node signer unit and updated the signer deploy script to refresh the unit file before restart.

**Rule**: Do not enable `MemoryDenyWriteExecute=yes` for Node signer services unless the exact production Node version, dependency graph, and HTTP/RPC path have been proven under that sandbox.

---

## 2026-05-09 — Asset catalog edits need runtime and type verification together

**What happened**: A Game Studio CC0 asset manifest slug used a malformed slash regex, which compiled far enough to land in the dirty tree but crashed at module load with `ReferenceError: g is not defined`. The same pass removed Hoard's `findLooseCoin()` helper while the pig AI still called it.

**Why it mattered**: Game Studio catalog imports are shared by packaging and MCP modules, so one loader typo can break unrelated server tests and production startup paths. Canvas/UI polish can also silently remove behavior helpers when a visual rewrite replaces a large drawing block.

**Fix**: Replaced the fragile slash/dot regexes with valid path-safe patterns, made CC0 manifest asset iteration tolerate missing arrays, and restored the Hoard loose-coin selector used by the guinea pig state machine.

**Rule**: After large asset-catalog or canvas animation edits, run both focused runtime tests and `npm run check -- --pretty false`. Treat TypeScript errors and module-load tests as complementary gates, not substitutes.

## 2026-05-09 — Sandboxed module scripts send `Origin: null`

**What happened**: Flappy Bower progressed past storage access but the Start button stayed inert. The HTML and CSS loaded, but the sandboxed iframe fetched module scripts with `Origin: null`; the global CORS allowlist rejected those requests before the Arcade source proxy could return its public asset headers.

**Why it mattered**: Static game HTML can render enough to look loaded even when its JavaScript never executes. That creates a misleading "button does nothing" symptom instead of an obvious load failure.

**Fix**: Added a narrow global CORS exception for `Origin: null` only on public Arcade source asset paths, while leaving authenticated APIs on the normal allowlist.

**Rule**: Any sandboxed iframe that omits `allow-same-origin` and loads module scripts from same-origin URLs must have an explicit `Origin: null` asset path policy. Do not broaden null-origin CORS for authenticated or stateful APIs.

## 2026-05-09 — Sandboxed source games need storage compatibility, not wider trust

**What happened**: Hackcade-source Arcade games loaded in the Arcade iframe but crashed before play because the published-game sandbox intentionally omitted `allow-same-origin`. Browser storage access then threw `SecurityError`, and several Hackcade games read `localStorage` at module top level.

**Why it mattered**: The Arcade catalog could show imported games as playable while the runtime blocked common game boot code. Loosening the sandbox for every published cartridge would have fixed the symptom by widening trust too far.

**Fix**: Added localStorage/sessionStorage fallbacks inside the Hackcade compatibility SDK served by the source proxy, so imported source games can boot while the stricter published-game sandbox remains in place.

**Rule**: For untrusted or imported game runtimes, preserve sandbox boundaries first. Patch compatibility shims at the narrow source-runtime boundary before adding iframe privileges globally.

## 2026-05-09 — Studio preview derivatives need explicit MIME fallbacks

**What happened**: Studio uploaded images generated WebP preview and thumbnail derivatives, but the local disk storage driver streamed derivative blobs back as `application/octet-stream`. Because Studio also sends `X-Content-Type-Options: nosniff`, browser image previews could fail to render inline even when the bytes existed.

**Why it mattered**: Studio is a collaboration and review surface. If image previews fail silently, collaborators cannot see the media they are discussing, and the app looks like it only stores files instead of supporting visual review.

**Fix**: Added deterministic Studio stream MIME fallbacks for preview and thumbnail derivatives, made image previews fall back to the original file when a generated preview fails, and exposed an open-original action for selected files.

**Rule**: Any generated media derivative served through a generic storage driver must carry or reconstruct the derivative MIME at the API boundary. Do not rely on a storage driver returning anything more specific than `application/octet-stream`.

## 2026-05-09 — App gates must cover every launcher, not just desktop icons

**What happened**: The admin desktop-app gate hid disabled apps from desktop icons, but the Start Menu/Stuffs launcher was hardcoded and still showed the same apps. The central Admin Panel also accumulated long tab labels that made the maximized window feel cramped instead of operator-grade.

**Why it mattered**: A gate that only hides one launch surface is misleading. Operators expect "off" to mean users cannot launch the app from any WTF OS launcher, and cramped admin tabs make it harder to trust the control surface during live operations.

**Fix**: Added shared Start Menu app-gate filtering, kept disabled apps out of both icons and Start Menu entries, tightened app-gate copy/actions, and changed the Admin Panel into a full-height shell with compact titled tabs and a flexing content body.

**Rule**: WTF OS app gates must be applied to every launcher surface in the same pass: desktop icons, Start Menu/Stuffs entries, native admin panels, central admin labels, MCP feature gates, and inventory/E2E coverage where applicable.

## 2026-05-08 — Game Studio open-asset importer needs bounded upstream fetches

**What happened**: The open-asset import script `scripts/import-game-studio-open-assets.mjs` depended on `fetch` without a timeout. When an upstream API or gateway stalled, the import run could block indefinitely and never return control.

**Why it mattered**: A single stalled request prevented maintenance runs from completing and made the source refresh pipeline unsafe for production operators.

**Fix**: Added `IMPORT_FETCH_TIMEOUT_MS` and a shared bounded-fetch helper (`fetchWithTimeout`, `fetchJsonWithTimeout`, `fetchTextWithTimeout`) for Objkt/Polyhaven metadata and payload downloads.

**Rule**: Maintenance import workers should not use unbounded network calls. All upstream and gateway fetches must have explicit timeout + fallback handling so a stale endpoint cannot stall the entire ingest loop.

## 2026-05-08 — Generic helpers need type checks, not just runtime tests

**What happened**: The Guinea Pig Raceway probability helper passed runtime tests after stripping internal allocation fields, but TypeScript correctly rejected the generic return because `T` could be instantiated with a stricter subtype than the base entrant shape.

**Why it mattered**: Casino game math helpers will become settlement-adjacent. Runtime tests prove behavior, but generic type drift can still leak into API contracts or future contract-verifier call sites.

**Fix**: Added an explicit typed return assertion at the helper boundary after removing internal fields, then reran the Raceway tests and full TypeScript check.

**Rule**: For reusable Casino/game-economy helpers, run `npm run check -- --pretty false` in addition to domain tests before calling the helper shape ready.

---

## 2026-05-08 — Live E2E needs real actors and signer-backed wallets

**What happened**: The inventory-driven E2E skeleton proved route, handle, admin-surface, and domain workflow coverage, but it still did not prove that real local users could log in, hold linked wallets, sign wallet challenges, pass role gates, or exercise stateful workflows against the database.

**Why it mattered**: The first live puppet orchestration runs caught bugs that static/smoke coverage could not: wallet verifier module loading, local E2E rate-limit/session behavior, schema drift, pet starter-food SQL parameter ambiguity, and admin-only API probes running with non-admin actors.

**Fix**: Added local DB preparation, 12 seeded puppet users with strong ignored passwords, platform-keyring-backed puppet wallets, signer-backed wallet challenge verification, role-aware route/workflow orchestration, and worker rules requiring live puppet coverage for auth, wallet, reward, admin, persistence, and cross-domain changes.

**Rule**: Do not treat an interaction as live-safe until the relevant layer has real actor coverage. Changes that cross auth, roles, wallet binding, rewards, admin tooling, persistence, or domain interoperability must update or run `npm run test:e2e:live:puppets` when practical, with any blocker documented.

---

## 2026-05-08 — E2E skeleton coverage is not feature behavior coverage

**What happened**: After adding an inventory-driven E2E suite, it was tempting to summarize the result as "every feature is tested." The suite did prove complete coverage of known inventory rows, handles, routes, admin surface routes, and domain workflows, but it did not yet assert every feature's real persistence, reward, permission, wallet, or chain-backed side effect.

**Why it mattered**: Overstating E2E coverage creates a false sense of safety. A mocked route smoke test can prove that a page renders, and a normalized-handle test can prove that an event shape exists, but neither proves that a post is saved, XP is granted once, settings persist, wallet signing succeeds, or a reward settlement is correct.

**Fix**: Added feature-depth accounting through `tests/e2e/inventory/coverage-layers.mjs`, a Playwright depth spec, coverage output that explicitly reports `fullFeatureBehaviorComplete: false`, and worker rules requiring durable behavior assertions for state-changing interactions.

**Rule**: Use precise coverage language. "Complete E2E skeleton" means every known inventory route/handle/domain path has an executable test. "Fully behavior-tested feature" means a domain-owned test asserts both the user-visible result and the durable side effect.

---

## 2026-05-08 — Desktop wiring tests must follow owning registries

**What happened**: After the server/client restructuring, desktop wiring checks still read stale owner files (`client/src/App.tsx` and `shared/schema.ts`), while desktop icon and artifact automation handles were advertised without a general client-to-server event bridge. Inventory-backed desktop items also only normalized positions during first localStorage load, so later surface-size changes could leave elements outside the current desktop bounds.

**Why it mattered**: Desktop UI state crosses several boundaries: visible icons, persisted settings, admin surface metadata, challenge events, local artifact storage, and route registries. When any one of those owners drifts, users see symptoms like reset/rubberband movement, silent missing automation events, or elements that behave differently after a resize.

**Fix**: Updated wiring tests to read `client/src/routes/page-defs.ts` and `shared/schema-gameshow.ts`, added authenticated `/api/desktop/events` ingestion for icon/object/artifact/tool actions, wired desktop icon opens/moves, item clicks, tool selection, portal placement, and icon-layout reset to that bridge, re-clamped artifact positions when bounds change, and added SKU registry coverage for inventory-backed desktop items.

**Rule**: Desktop changes must be checked across the owning registries, not old aggregate files: icon definitions, shared layout keys, route page definitions, desktop app config, admin surface handles, storage normalizers, and challenge event ingestion. If a desktop surface advertises an automation handle, the UI must emit it or intentionally document why it is latent.

---

## 2026-05-08 — Public docs need an explicit boundary

**What happened**: The public repo root and `docs/` tree mixed user-facing README material with agent plans, audit reports, active bug bounties, run logs, integration source maps, ops notes, and historical scratch docs. GitHub visitors had to wade through internal project memory before finding the actual product shape.

**Why it mattered**: Documentation organization is part of the security and product surface. Live risk boards and stale plans create confusion for users and give too much operational context to anyone browsing the public repo.

**Fix**: Moved active internal boards to `.agents/docs/live`, moved stale or historical material to `.agents/docs/archive`, rewrote the root README and architecture map as public docs, and added lightweight domain guides under `docs/domains`.

**Rule**: Keep `README.md`, `ARCHITECTURE.md`, and `docs/` public-facing. Put agent memory, bug boards, lessons, audits, plans, run logs, and deployment scratch material under `.agents/docs` unless the owner explicitly asks to publish a sanitized version.

---

## 2026-05-08 — Interaction inventories need executable coverage gates

**What happened**: The interaction inventory had become the source for E2E, rewards, monitoring, cheat detection, challenge automation, and admin control, but it was still possible to update routes, handles, or admin surfaces without an executable test scheme proving the inventory stayed wired.

**Why it mattered**: A complete inventory that is not machine-checked can silently drift into documentation theater. Reward handles, side-quest triggers, route surfaces, and strict-admin affordances all need test ownership at the same domain/subdomain boundary where the app owns the behavior.

**Fix**: Added an inventory parser, modular route/domain/system fixtures, Playwright subdomain/domain/system specs, an E2E coverage gate, package scripts, and Codex/Claude/Cursor/system-prompt rules requiring future workers to update the inventory and E2E scheme together.

**Rule**: Any new or changed route, sub-app, desktop item, admin surface, API handle, reward/challenge/side-quest trigger, bot/agent tool, telemetry event, or `SystemEvent` must update `.agents/docs/live/user-interaction-inventory.md` and the matching `tests/e2e/inventory/` fixture in the same change. Run `npm run test:e2e:inventory:coverage`; for UI or interaction changes, run `npm run test:e2e:inventory` or document the blocker.

---

## 2026-05-08 — Custody manifests must default outside the repo

**What happened**: The platform wallet tooling kept the actual keyring outside the Git worktree, but its default public-manifest output still pointed at a repo-local docs path. Even ignored metadata files create visible local artifacts and can drift back into packaging or review workflows.

**Why it mattered**: Custody backups and wallet manifests have different sensitivity, but neither should default into the GitHub-enabled app tree. Operators need active signer access in a locked host directory, while archive backups should stay offline with the owner.

**Fix**: Removed repo-local wallet manifests, deleted the temporary archive copy, and changed the platform wallet helper's default manifest path to the host-local signer directory.

**Rule**: Wallet tooling defaults must write keyrings, master keys, backup archives, and generated manifests outside the repo. Repo ignore rules can remain as a fail-safe, but normal operation should not populate custody artifacts in the worktree.

---

## 2026-05-08 — Desktop icon state needs one shared key registry

**What happened**: The WTF desktop rendered newer icons such as WTF IAM, WTF Arcade, and Game Studio, but the main desktop settings route still normalized icon layouts through an older local allow-list. Moving those icons appeared to work locally, then the saved settings response or later refetch dropped their coordinates and rehydrated them at defaults.

**Why it mattered**: Desktop icon movement has two state owners: immediate client drag state and persisted server settings. If either side has a different idea of valid icon keys, the UI can look interactive while persistence silently deletes part of the layout, creating rubberband/reset behavior that feels random to users.

**Fix**: Moved the first-party desktop icon layout keys into `shared/desktop.ts`, reused that registry from the settings route and MCP helper, added allow-list coverage in `shared/desktop.test.ts`, and made client layout hydration merge/clamp local state instead of rebuilding from stale settings during active edits.

**Rule**: Desktop icon definitions, server layout normalization, and agent/MCP layout helpers must share the same icon key registry. Client hydration should apply persisted layouts only when local icon edits are not in progress; resizes should clamp current positions instead of treating saved settings as a fresh source of truth.

---

## 2026-05-08 — Docker ignores must follow custody ignores

**What happened**: Platform wallet tooling had git ignore rules for keyrings, master-key files, host-local signer directories, and local public manifests, but Docker build context did not ignore the same custody artifact patterns.

**Why it mattered**: A file can stay out of git and still be sent to Docker, cached in build layers, uploaded by CI, or copied into intermediate images. Wallet custody has to be protected at every packaging boundary, not just source control.

**Fix**: Mirrored the platform wallet custody patterns into `.dockerignore` and logged the gap on the bounty board.

**Rule**: Whenever a new secret, keyring, local manifest, or custody-adjacent artifact is added to `.gitignore`, update `.dockerignore` and any release/archive packaging denylist in the same pass.

---

## 2026-05-08 — Platform wallets need custody boundaries, not secret sprawl

**What happened**: Expanding Arcade credits, creator earnings, refunds, rewards, buybacks, and contract admin flows would have pushed the old `WTF_OPERATOR_SIGNER_SECRET` pattern toward multiple raw hot-wallet env keys or a single overloaded operator wallet.

**Why it mattered**: Env-key sprawl increases rotation pain and leak blast radius, while one shared hot wallet makes role separation and audit trails mushy. The app needs wallet roles and public addresses, but it should not be able to read, print, or persist private keys.

**Fix**: Added a platform wallet keyring inside the isolated signer process. It creates Taquito-backed Tezos wallets, encrypts secret keys with host-local AES-256-GCM keyring storage, and keeps wallet creation/listing in server-local tooling instead of WTF OS UI routes.

**Rule**: New WTF platform wallets belong in the signer/keyring boundary and actual custody files belong outside git. The app may ask an already configured wallet to sign an allowed backend operation; wallet creation, keyring inspection, keyring backup, and master-key handling must remain direct server access only.

---

## 2026-05-08 — OS admin affordances need a registry, not per-page drift

**What happened**: The WTF OS had admin controls scattered across the central Admin page, feature-local moderator panels, desktop app gates, and route role metadata. New apps could be added to `PAGE_DEFS` or the desktop without receiving a native app settings screen, central admin entry, or challenge automation handle inventory. Client `isAdmin` also treated host/cohost as admin-like for visibility, which no longer matched the strict-admin request.

**Why it mattered**: Admin-only controls are part of the product surface and the monitoring/reward automation contract. If each app owns its own hidden admin affordance, the platform can drift into missing settings, incomplete challenge handles, and accidental staff visibility for screens that should only be available to the admin role.

**Fix**: Added a strict-admin WTF OS admin surface registry, native `AppWindow` admin/settings panel, central OS Admin tab, route-coverage audit, and strict client admin visibility for admin routes/screens.

**Rule**: Every new WTF OS route, sub-app, tool, or desktop item must add an admin surface registry entry with domain, subdomain, settings controls, admin-panel links, and automation handles. Admin-only visibility should use strict `role === "admin"` unless a screen is explicitly designed as a broader staff/moderator tool.

---

## 2026-05-08 — Reward automation needs a normalized event spine

**What happened**: Building challenge automation from the interaction inventory showed that direct side-quest/reward handlers are too narrow for the upgraded WTF surface. Messageboard posts, XP grants, wallet linking, desktop pet care, Tezos ownership checks, and future Arcade/map/game-show actions need one shared event and audit model instead of one-off challenge code.

**Why it mattered**: E2E generation, EXP/reward quests, activity monitoring, and cheat detection all depend on stable handles. If each reward rule is wired manually at the feature route, the app will drift back into latent schema values and untestable reward paths.

**Fix**: Added a DB-backed challenge automation engine with normalized `SystemEvent` ingestion, trigger/action registries, predicate evaluation, Tezos ownership predicates, idempotent completions/action logs, admin builder UI, and live hooks for messageboard posts, XP awards, wallet links, and desktop pet events.

**Rule**: New rewardable user activity should emit a normalized `SystemEvent` at the feature boundary and reuse registry-backed predicates/actions. Reward actions must go through existing reward services and idempotency logs, not route-local duplicate grant logic.

---

## 2026-05-08 — Interaction inventories must separate live triggers from latent schema

**What happened**: Re-examining the WTF interaction inventory after the Arcade, Game Studio, trusted creator, wallet, and rewards upgrades found that a route/schema mismatch could make future E2E and EXP work overstate coverage. The side-quest schema declares additional auto-verification types, but the live side-quest route only whitelists and implements a smaller set.

**Why it mattered**: The inventory is no longer just product documentation; it is an input to E2E generation, reward triggers, activity monitoring, and cheat detection. Schema-only or doc-only handles must not be treated as live rewardable interactions.

**Fix**: Rebuilt `docs/user-interaction-inventory.md` from current routes, schemas, reward modules, Arcade/Console/Game Studio boundaries, MCP tools, and monitoring tables. Marked latent auto-verification handles as a coverage gap and added a bounty item to track implementation alignment.

**Rule**: When an inventory will drive tests, rewards, or monitoring, derive it from live route handlers and persistence paths, not names alone. Explicitly label latent schema handles, compatibility routes, and manual-attestation flows so downstream automation does not assume they are fully implemented.

---

## 2026-05-08 — Wallet session memory is not a signer

**What happened**: The in-app marketplace could display a remembered Tezos wallet address after page refresh, then try to approve/purchase without a live wallet provider attached to the singleton Taquito toolkit. Taquito surfaced this as `No signer has been configured` even though the contract had previously accepted test purchases.

**Why it mattered**: A cached address proves only UI continuity, not signer readiness. In-app market and Arcade ticket checkout both rely on the WtfIAM cart path, so a refresh-session provider gap can block paid flows while making the contract look broken.

**Fix**: Added a signed-operation preflight that rehydrates or requests the active wallet account, attaches the wallet provider to Taquito before chain-id validation, and rejects account mismatches before sending. WTF checkout now revalidates the wallet before creating the payment intent.

**Rule**: Before any browser-originated Tezos write, prove three things in order: active wallet account, wallet provider attached to Taquito, and expected chain id. Never treat a localStorage wallet address as sufficient signer configuration.

---

## 2026-05-08 — RPC providers are release-critical infrastructure

**What happened**: ECAD RPC endpoints remained in WTF/Kiln-adjacent defaults even after notice that the provider would cease operation at the end of May 2026.

**Why it mattered**: RPC URLs are not passive documentation. Wallet preflight, contract sends, operator signing, domain helpers, and creation tools all depend on a live node provider, and a defunded endpoint becomes a scheduled production outage.

**Fix**: Replaced ECAD mainnet defaults with `https://rpc.tzkt.io/mainnet`, Ghostnet defaults with `https://rpc.ghostnet.teztnets.com`, updated local/env/template references, and verified both replacement chain IDs.

**Rule**: When a Tezos RPC provider is deprecated or scheduled to shut down, scan source, env templates, local env, generated runtime assets, and helper extensions in one pass. Verify replacement chain IDs before considering the migration safe.

---

## 2026-05-08 — Migration numbering is part of release readability

**What happened**: The Arcade migration slice introduced new files with `0060` and `0061` prefixes even though the repository already had Game Studio build and trusted creator migrations with those numbers.

**Why it mattered**: The production migration ledger keys by filename, so duplicate numeric prefixes may still run, but humans and future agents use those prefixes to reason about order. Reusing numbers makes deploy audits and references noisier than they need to be.

**Rule**: Before wrapping a migration-heavy pass, list the tail of `drizzle/` and ensure new migrations form a unique ordered sequence after existing files. Update docs and bounty notes whenever migration files are renumbered.

---

## 2026-05-08 — Compatibility aliases belong in source adapters, not the WTF SDK

**What happened**: After the Arcade/Console split, the Game Studio client was already publishing to WTF Arcade but still used Console-shaped state names for the creator's submitted Arcade games. The regular `/api/console/sdk.js` also exposed a legacy source compatibility global that only imported source games should need.

**Why it mattered**: WTF Arcade, WTF Console, and WTF Game Studio SDK are separate product surfaces. Compatibility for open-source/source-derived games is useful, but leaking legacy aliases through the normal WTF SDK makes creators and future agents think the old source surface is part of the core product API.

**Rule**: Keep legacy globals and route names inside compatible-source adapters only. Regular SDKs, Game Studio client state, MCP descriptions, admin labels, and public docs should use WTF-owned target-surface names: Arcade for public paid play, Console for personal owned media, and Game Studio SDK for creation.

---

## 2026-05-08 — Game Studio upload limits belong at draft-save time

**What happened**: Game Studio local assets were type/size checked during ZIP packaging, but project create/update accepted the local asset JSON first. A creator could save oversized or unsupported asset payloads into draft metadata and only hit validation later when building.

**Why it mattered**: The creator studio stores uploaded local assets as project state. Build-time validation protects public bundles, but draft-save validation protects database size, editor performance, and creator feedback loops.

**Rule**: Enforce Game Studio upload MIME, per-asset size, total-size, and base64 integrity at project save/update and again at packaging. Keep DTO reads lenient for old rows, but all new writes must use strict local-asset normalization.

---

## 2026-05-08 — Console catalog dedupe must use surface identity

**What happened**: Adding installed-manifest entries for stock Console games made them appear on every user's Console, but DB-backed stock rows for the same slugs could still appear beside them because the catalog deduped demos and published rows with different keys.

**Why it mattered**: A game can be correctly classified as stock and still render twice if the dedupe key follows storage origin instead of product identity. Every-user stock cartridges should be one library entry per slug, regardless of whether a DB row also exists.

**Rule**: Console catalog dedupe should key stock cartridges by `stock:${slug}` and only use origin/token keys for non-stock owned media. When adding stock manifest entries, smoke `/api/console/games` for duplicate stock slugs, not just presence.

---

## 2026-05-08 — Studio publish boundaries need Arcade-owned handoff names

**What happened**: After splitting WTF Arcade from WTF Console, Game Studio project publishing still kept a compatibility alias named for Console submission, called the shared Console bundle submitter directly, and stored `console*` keys in last-submission metadata even though the target surface was Arcade.

**Why it mattered**: Shared bundle validation is fine, but creator workflow ownership should read through the product domain the creator is actually using. If Studio talks directly to Console for public publish, future agents and UI code can accidentally route public creator games back into the personal Console surface.

**Rule**: Game Studio public publishing should hand off through Arcade-owned APIs/helpers and persist Arcade-named metadata. Keep Console bundle validators behind Arcade wrappers when reused, and reserve Console names for personal owned-media/export flows.

---

## 2026-05-08 — Source-route rebrands need read-time normalization

**What happened**: The Arcade source-import code wrote new `/api/arcade/source/*` paths, but existing database rows still emitted legacy Console compatibility paths through the public Arcade catalog until a migration or refresh touched them.

**Why it mattered**: Rebranding code is not enough when public DTOs are backed by durable rows. Users and agents can still see stale product language or stale routes from old data, and the UI can launch through the wrong surface even though new imports are correct.

**Rule**: Any source-route/product-language migration needs both a database migration and a read-time normalizer at the DTO boundary. Keep legacy strings readable only inside compatibility adapters, never in public catalog payloads.

---

## 2026-05-08 — MCP tool registration must match capability and scope contracts

**What happened**: The Arcade MCP server registered play-status and manual source-import tools, but the capabilities payload did not advertise them. The read-only Arcade play-status tool also required a market read scope even though the default paired token only needs Arcade read access to answer whether the user can play.

**Why it mattered**: MCP tools can exist but still be effectively invisible or awkward for agents if discovery payloads and scope requirements drift. That weakens the agent workflow exactly where MCP is meant to make domain actions obvious.

**Rule**: When adding an MCP tool, update the capabilities tool list, public access docs, and scope contract in the same pass. Read-only tools should require the narrowest domain read scope that matches the data they return.

---

## 2026-05-08 — Console stock classifiers need installed-manifest parity

**What happened**: The Console/Arcade surface classifier correctly reserved `inverse-snake` and `backwards-pong` as stock Console games, but the installed game manifest did not list them even though their files existed under `public/games/wtf/*`.

**Why it mattered**: A surface classifier can say a game belongs on every user's Console while the catalog still cannot show it. That creates a subtle product split bug where stock games disappear locally, and Arcade filtering looks correct only because the missing games never enter either catalog.

**Rule**: When adding or changing stock Console slugs, update the installed manifest, fallback cartridge list, and surface tests together. The classifier, shipped files, and catalog manifest must agree before the Console/Arcade split is considered verified.

---

## 2026-05-07 — Public lazy routes must load their shared browser vendors

**What happened**: Making WTF Arcade publicly routable exposed a crash in the shared ZIP game loader. The loader imported the vendored JSZip UMD bundle as an ES default export, but the browser module only executed as a side-effect/global script, so the Arcade window failed before rendering.

**Why it mattered**: Auth-gated routes can hide lazy-load crashes until a feature becomes public. A route can pass API checks and typecheck while still failing the first time the browser imports a shared runtime dependency.

**Rule**: When opening a previously auth-gated/lazy game route to public users, run a browser smoke on the route itself. For vendored UMD browser scripts, import them as side effects or namespace modules and resolve the global they install; do not assume they provide an ES default export.

---

## 2026-05-07 — Product naming needs a compatibility boundary

**What happened**: The Console source-import work correctly preserved open-source attribution, but user-facing labels started treating the upstream project name as the WTF product name. That made the feature sound like a borrowed surface instead of WTF's own arcade experience built from compatible source material.

**Why it mattered**: Attribution and branding are different concerns. We need to credit upstream MIT/source origins without giving away the product language, navigation, stats, admin buttons, or MCP workflows to the upstream name.

**Rule**: Keep upstream names inside compatibility adapters, source URLs, and provenance evidence only. User-facing surfaces should use WTF-owned product language, with attribution phrased as "built on" or "source" context when needed.

---

## 2026-05-07 — Discovery mappers should type selected DTOs, not whole table rows

**What happened**: The Console discovery shelf query selected only the fields needed for public cards, but the first mapper type was widened to the full `console_games` row shape. Runtime behavior was fine in intent, but TypeScript correctly rejected mapping a skinny selected DTO through a full-row function.

**Why it mattered**: Modular discovery/read-model queries should stay small. If their mapper types pretend to receive full table rows, future agents either over-select columns to satisfy types or weaken type safety with casts.

**Rule**: For read-model modules, type mapper inputs to the exact selected DTO shape. Keep full table row types for full-row adapters only, and let TypeScript catch accidental coupling between public shelves and private/admin fields.

---

## 2026-05-07 — Build warnings can expose duplicate package script ownership

**What happened**: After adding console/studio slices, the production build still succeeded but esbuild warned that `package.json` contained two `creation-tools:check` script keys. The duplicate came from parallel app/tooling additions and would make the effective script depend on whichever key survived JSON parsing.

**Why it mattered**: Duplicate JSON keys are easy to miss because TypeScript and many runtime paths continue working. They still create ambiguous ownership and noisy builds, which makes real bundle warnings harder to spot.

**Rule**: When a build emits duplicate-key warnings, treat them as integration debt before final verification. Keep one canonical script entry near its owning domain and remove duplicate script keys instead of tolerating warning noise.

---

## 2026-05-07 — Direct creator submissions need source-specific provenance builders

**What happened**: Adding direct Game Studio project submission to Console introduced a second bundle source beside media-library ZIPs. The first integration pass accidentally called media-token provenance from the direct bundle update path, and MCP/route schemas used the old one-argument `z.record(...)` form against the repo's current Zod types.

**Why it mattered**: Game Studio builds and media-library token imports have different attribution evidence. Mixing their provenance builders can either fail typecheck or, worse, imply token provenance for a project-built bundle that should instead carry project/build snapshot evidence.

**Rule**: When adding a new submission source, keep source-specific metadata/provenance construction at the boundary: media imports build token provenance, project builds carry project/build/source snapshots, and Console stores whichever normalized evidence it receives. Run typecheck before smoke testing new MCP schemas because Zod record signatures can differ across major versions.

---

## 2026-05-07 — Trusted creator bypasses need explicit domain permissions

**What happened**: Console version moderation was gaining a pending-review path, but the product model also needs an admin-assignable trusted creator lane for creators who should not wait on manual review every time they publish. Treating that as an implicit staff shortcut would have blurred admin power with creator trust.

**Why it mattered**: Trusted creator status is not the same as moderation authority. A creator may be allowed to auto-publish their own Console game, TV channel programming, or in-app store item submissions without gaining access to user management, role management, rewards, or global moderation.

**Rule**: Model creator bypasses as explicit domain permissions under a non-staff role. Keep each bypass narrow, auditable, and actor-bound: trusted creators can fast-track their own creations, while staff permissions remain separate.

---

## 2026-05-07 — Open-source game imports need visible attribution, not just compatible playback

**What happened**: The Hackcade import path correctly used public API data and a same-origin compatibility bridge, but the public console card did not yet surface source/platform/license attribution. The Game Studio create route also accepted saved project metadata without preserving first-save edited files, which would make creator builds less auditable.

**Why it mattered**: MIT/open-source imports are allowed to be reused, but the product should make provenance obvious to players, creators, admins, and future agents. Creator builds also need a durable source snapshot so review and resubmission decisions can be traced.

**Rule**: Any third-party open-source game import must carry source URL, source platform, creator/builder identity, and license metadata through catalog DTOs, version metadata, audit events, and UI. Any creator build flow must save the exact source files before packaging and store build checksum/source-snapshot evidence.

---

## 2026-05-06 — Full send means production, not local verification

**What happened**: The user said "full send" after a crawler/embed integration pass. I implemented and verified the changes locally, restarted the local dev server, and reported the work as complete without deploying to production.

**Why it mattered**: The repo already defines "full send" in `AGENTS.md` as taking the work all the way live through the normal production path. Stopping at local verification creates exactly the branch/deploy ambiguity the instruction exists to prevent.

**Fix**: Strengthened `AGENTS.md` with an explicit full-send completion checklist: relevant change on `main`, pushed to `origin`, production deploy completed, live site smoke-tested, and final response includes the production URL plus live verification.

**Rule**: When the user says "full send", do not call the work done until it is live in production and verified there. If deployment cannot be completed, say what is pending and why; never let "local", "branch", "main but not deployed", or "pushed but not live" masquerade as complete.

---

## 2026-05-06 — Tezos donor tools need confidence-bearing grafts, not page transplants

**What happened**: Tezos Open Tools had useful P&L and marketplace logic, but copying the donor pages into WTF would have bypassed WTF's existing DB-first analytics, wallet preflight, and upstream rate-limit controls. The P&L donor code also needed a stricter distinction between priced purchases/mints and gift/free-transfer evidence so the dashboard would not invent profit from unknown basis.

**Why it mattered**: Tezos analytics are only useful when the user can see evidence quality. A dashboard number that silently mixes latest-buy assumptions, duplicate sale rows, free transfers, BIN-trap floors, and external marketplace data looks precise while still being structurally suspect.

**Fix**: Added a native FIFO lot-costing engine, fed it from WTF's existing holdings/sales/mints/events/acquisition-lots tables, exposed confidence and exclusion labels on Dashboard, routed recent sale P&L through the same lot engine, preserved full external marketplace contract addresses, added linked-wallet external listing cancellation through WTF wallet preflight, and moved TzKT operation verification to the shared upstream client.

**Rule**: When grafting external Tezos tools into WTF, transplant the durable organ: pure costing/operation/query logic plus evidence labels and shared infrastructure hooks. Do not mount donor app pages as standalone tools, and never let a signed operation bypass `assertNetworkReadyForSend` or a server chain read bypass `server/lib/upstream.ts`.

---

## 2026-05-06 — Gallery token actions need canonical MIME routing and one import spine

**What happened**: My Gallery exposed external marketplace links on token detail cards, but it did not expose local "add to my videos/photos/games" operations. The media-library import path already preserved raw token metadata and token contract/id for attribution, but gallery cards were not using it, and ZIP game cartridges were not extractable through that path.

**Why it mattered**: If gallery actions bypass the media-library import route, WTF can end up with displayable media that no longer carries creator, collection, mint, contract, or token-id provenance. If MIME routing trusts preview formats instead of the artifact MIME, a token can be sent to the wrong domain or fail to become a local object at all.

**Fix**: Gallery card actions now route video/GIF, still-image, and ZIP game tokens through `/api/media/import-token`. The shared token media resolver recognizes ZIP cartridge artifacts, media-library import can extract game assets while storing raw metadata, and My Games reads locally imported game media alongside wallet-detected cartridges. External objkt/Teia/TzKT links are rendered as buttons without changing their destinations.

**Rule**: Gallery-to-local media actions must use the canonical media-library import path and determine the target domain from the artifact MIME, not preview thumbnails. Always preserve raw token metadata plus contract/token id on import so downstream TV, studio, editing, and game surfaces can attribute the creator and collection correctly.

---

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

---

## 2026-05-06 — Survival test tools must not depend on undistributed inventory

**What happened**: The pet care Rest tool was implemented as a pillow placement tool and gated on `shoebox` inventory. Because users were granted food but not shoeboxes, live testers saw Rest greyed out and could not keep pets alive through normal care.

**Why it mattered**: During live care-loop testing, rest is a core survival action, not a cosmetic market item. An inventory gate is only safe when the item has a verified grant, purchase, or backfill path for the testers who need it.

**Fix**: Removed the shoebox requirement from the Rest/pillow tool while keeping food and medicine consumption checks intact. The button now reads `Rest`, only requires the pet to be alive, and placement no longer fails with "No shoebox in inventory."

**Rule**: Do not gate survival-critical test tools on inventory unless distribution has been verified in production. If a tool is temporarily free for testing, make the UI label match the free action and leave itemized inventory checks only on consumables that users actually have.

---

## 2026-05-06 — Bumper toggles need persisted media assignments, not inferred button state

**What happened**: My Videos and the TV creator screens could send media into channel workflows, but bumper membership was still represented by upload-oriented bumper rows and one-way buttons. That left media-library videos without visible personal/community bumper state, and deleting a media item would not clearly describe the bumper memberships it was about to clear.

**Why it mattered**: A toggle is only trustworthy if it reflects a durable server record. Bumper caps also have to be enforced where the record is created, otherwise different UI surfaces can disagree about whether a user has slots left.

**Fix**: Added a `tv_bumpers.media_item_id` FK for media-backed bumpers, routed media-library bumper assignment through a server-side toggle endpoint that enforces personal/community caps, and surfaced those assignments in My Videos, TV channel media, TV media library, and delete-usage previews.

**Rule**: Whenever UI shows local media membership in a TV bucket, model the membership as its own persisted domain link with cap checks in the owning server route. Do not infer state from labels, and include the membership in cascade previews.

---

## 2026-05-06 — Desktop environment items need element-owned interaction scripts

**What happened**: Adding desktop objects like fans, sticky notes, lights, mops, and vacuums could have turned into another top-level simulation branch where pet, ant, ball, and drop rules all depend on one giant orchestrator knowing every object.

**Why it mattered**: The desktop layer is meant to become chaotic and expandable. If new items do not have explicit per-element interaction contracts, future elements will collide in unpredictable ways, and every new item will require risky edits across unrelated simulation loops.

**Fix**: Added a persisted desktop item subdomain, then gave ants, pets, balls/toys, and drops their own item-interaction scripts. The top-level scene now only wires refs/state/rendering, while sticky traps, fan/light effects, dirty ball smears, mop passes, vacuum cleanup, wet paper, footprints, and note marks live in the relevant element domains.

**Rule**: When adding a desktop item, add the item model/rendering in the item subdomain and add each affected element's reaction in that element's own `itemInteractions` script. Keep living-element behavior separate from physics/drop cleanup so new objects do not become cross-cutting one-offs.

---

## 2026-05-06 — Desktop artifacts must be owned by the desktop shell, not pet care

**What happened**: I initially surfaced fan, sticky note, mop, vacuum, and hanging-light placement through the desktop pet care tray because those items interact with pets and ants.

**Why it mattered**: Interaction is not ownership. General desktop artifacts can affect pets without being pet-care tools. Putting them in the care tray made the pet system the only way to create or place them, which conflicts with marketplace purchases that should spawn artifacts directly on the user's desktop.

**Fix**: Removed general artifact tools from pet care, lifted desktop artifact state into the desktop shell, added independent artifact persistence, and synchronized spawned artifacts from `desktop_fun` inventory quantities. Pet, ant, ball, and drop simulations now read the desktop-owned artifact layer instead of creating it.

**Rule**: Before adding a tool button, identify the owning surface. Pet care owns pet maintenance actions only, such as food, water, rest, medicine, and balls. Purchased desktop artifacts belong to the desktop shell and should spawn from inventory or desktop artifact systems, even when pets react to them.

---

## 2026-05-06 — Desktop artifact spawners and inactive catalog seeds must match

**What happened**: The desktop artifact synchronizer knew how to spawn generic desktop icons for spraycan, catapult, and ant farm inventory, but the inactive in-app market seed only created the fan, hanging-light, sticky-note, mop, and vacuum rows.

**Why it mattered**: A desktop item can be correctly modeled in the client and still be impossible for admins to grant or later stock if the marketplace catalog row does not exist. This is especially easy to miss when items are intentionally inactive and hidden from users.

**Fix**: Added inactive `desktop_fun` catalog rows for spraycan, catapult, and ant farm, keyed to the same SKUs the desktop artifact synchronizer already watches. Added a normalization test for generic artifact icons.

**Rule**: Whenever adding an inventory-driven desktop artifact, update the spawner SKU map, inactive catalog seed, and normalization tests in the same pass. Hidden/not-for-sale items still need catalog rows if admin inventory is expected to target them later.

---

## 2026-05-06 — Store inventory must be enforced on the grant path

**What happened**: The in-app marketplace needed admin-controlled item visibility and store inventory, but the existing item table only had an `active` flag. Without server-side stock checks, a hidden UI could still be bypassed by direct checkout API calls once an item was active.

**Why it mattered**: Marketplace stock is an economy invariant, not just a display count. If the grant route does not reserve stock atomically, users can overbuy limited items through stale carts, concurrent checkouts, or direct API calls.

**Fix**: Added `stock_quantity` to in-app market items, added an Admin Panel In-App Market tab for visibility and stock quantity, included stock in user-facing market responses, capped cart quantities by stock, and made EXP checkout decrement stock before granting inventory.

**Rule**: Any limited marketplace inventory must be stored and decremented server-side in the same transaction that grants inventory. UI limits are helpful, but they are never the authority for stock.

---

## 2026-05-06 — Etherlink wallets need their own EVM domain, not widened Tezos tables

**What happened**: Adding Etherlink connectivity was tempting to solve by pushing 0x addresses through the existing Tezos wallet and FA2 holdings tables, but those tables are constrained around tz/KT1 address lengths and many app routes assume every linked wallet is a Tezos wallet.

**Why it mattered**: Users need to connect Tezos and Etherlink at the same time. If Etherlink rows live in Tezos-owned tables, downstream auctions, recapture, marketplace, TzKT sync, and primary-wallet assumptions can accidentally treat EVM accounts as Tezos accounts.

**Fix**: Added a separate Etherlink schema, auth nonce table, wallet session context, API routes, Blockscout sync helper, and Profile panel. The client uses EIP-6963/EIP-1193 provider discovery with Temple preference and MetaMask fallback, while the server verifies EVM signatures with `viem`.

**Rule**: Cross-chain wallet support should be split by chain/runtime domain. Keep Tezos Beacon/Taquito state and Etherlink EIP-1193 state independent, and bridge them only through account-level UI and explicit server ownership checks.

---

## 2026-05-06 — External explorer links must satisfy the link safety gate

**What happened**: The Etherlink Profile panel linked wallet and token contracts to Blockscout with `target="_blank"` and `rel="noreferrer"`. Local typecheck and build passed, but the GitHub Quality Gates workflow failed at `npm run check:external-links`.

**Why it mattered**: The external link checker is part of the production gate. A deploy can begin from a main push, but leaving the quality workflow red makes the release harder to trust and can hide real browser security regressions.

**Fix**: Updated the new Etherlink explorer anchors to use `rel="noopener noreferrer"` and reran the external link check before pushing the follow-up commit.

**Rule**: Every new `target="_blank"` anchor must include the exact `rel="noopener noreferrer"` value expected by the repo safety script. Run `npm run check:external-links` when adding any external links.

---

## 2026-05-06 — Desktop mutators need shared material contracts before item-specific behavior

**What happened**: Adding scale tools, portals, paper shredders, trains, a jukebox, and weather effects touched desktop persistence, simulation loops, media routes, and in-app market stock. The one concrete bug in this pass was a train-kit unpack array whose item kind widened during construction, which TypeScript caught before build.

**Why it mattered**: Mutator items are especially risky because they act on other objects. Without a shared material/compatibility contract, each new item would need bespoke checks scattered through pet, ant, ball, media, and shell code.

**Fix**: Added desktop material, scale, portal, and mutator helpers before wiring item actors. Train-kit pieces now construct as explicit `DesktopItemState` objects, while pets, ants, balls, and desktop tools consume shared contracts instead of naming every future item inline.

**Rule**: Build mutator-capable desktop items around shared capability contracts first, then add element-owned reactions. If an item can transform another object, the target object must declare material compatibility instead of relying on the mutator to know every target by SKU or component name.

---

## 2026-05-07 — Game creator upload paths must align storage, routes, and domain helpers

**What happened**: Adding a console submission path from the new Game Studio surfaced two integration misses: the media upload allowlist did not accept ZIP game bundles, and the console route imported a manifest helper from the catalog module instead of the manifest module.

**Why it mattered**: A creator flow can look wired in the UI while failing at the first server boundary. Game bundles cross media storage, console review, runtime SDK, and moderation domains, so each hop needs an explicit contract.

**Fix**: Added ZIP MIME variants to the media upload allowlist, kept manifest reading in the console manifest subdomain, and verified the full TypeScript/build path after wiring the new routes.

**Rule**: When adding a creator upload flow, check the storage MIME allowlist, route imports, domain helper ownership, and final publish endpoint in the same pass. Treat upload acceptance as part of the feature contract, not a later polish item.

---

## 2026-05-07 — Remote game imports must preserve nullable score caps

**What happened**: The Hackcade import worker initially normalized `null` score caps with `Number(null)`, which produced `0`. Imported games with no max score would have rejected every positive score through our anti-cheat checks.

**Why it mattered**: Score caps are authority data. Treating "unset" as "zero" turns an open leaderboard into an impossible game, and scheduled importers can silently spread that bad policy to every imported title.

**Fix**: Updated the Hackcade cap normalizer to preserve `null`, `undefined`, and empty strings as `null`, added a regression assertion, and reran the importer so local imported rows carried the correct caps.

**Rule**: For liveops limits, distinguish absent from zero before converting values to numbers. `null` means no cap; `0` means no score may exceed zero. Tests for importers should cover both meanings explicitly.

---

## 2026-05-07 — Tezos identities belong in server payloads, not display fallbacks

**What happened**: Several token surfaces were still reading `metadata.creators[0]` and handing the resulting tz/KT address to React. The repo had Objkt/X identity tools and address-label backfills, but no universally callable resolver for "give me the human name for this address/token."

**Why it mattered**: Fixing display strings in individual components would leave search, TV overlays, media imports, and collection filters inconsistent. Creator and collection identity is a data concern: the API response should already include the best available name and keep raw addresses as machine-readable context.

**Fix**: Added a shared Tezos identity extractor and a server-side resolver that batches local address labels, linked-wallet Tezos domains, X hints, Objkt holder aliases, and contract metadata titles. Token, gallery, media library, marketplace, colleKT, and TV endpoints now enrich payloads before the UI renders them.

**Rule**: Any new Tezos token payload should pass through the identity resolver before leaving the server. Components may shorten a fallback address, but they should not be responsible for discovering creator aliases or collection titles.

---

## 2026-05-07 — Creator game ZIPs need validation before public runtime paths

**What happened**: The first console submission path could register a media-library ZIP directly as a public game `embedPath`, which meant review could approve an archive without proving it had a root `index.html`, safe paths, bounded uncompressed size, or console SDK wiring.

**Why it mattered**: A public game runtime is executable content. If ZIP extraction happens in the browser or after moderation, unsafe paths, unsupported files, score-spoofing SDK gaps, and unavailable private media URLs all show up too late.

**Fix**: Added a console-owned ZIP validator/extractor, versioned bundle serving under `/api/console/bundles/*`, SDK injection, moderation queue controls, and a parent postMessage bridge so sandboxed games can score through the console shell without owning credentials.

**Rule**: Game bundle approval must be based on server-validated, extracted, versioned runtime files. Do not promote a ZIP URL itself to an arcade embed path; extract it through the console domain, inject/verify the SDK, and keep score-bearing API calls brokered by the parent console shell.

---

## 2026-05-07 — Studio packagers and console validators need one asset contract

**What happened**: The first server-side Game Studio ZIP build test packaged SVG stock art, but the Console bundle validator still rejected `.svg` files. The new Studio build endpoint could have produced a neat ZIP that the next Console hop refused.

**Why it mattered**: Creator tooling and runtime validation are separate domains, but they are one user workflow. If the packager and validator disagree on allowed asset formats, creators hit a dead end after doing the right thing.

**Fix**: Added SVG to the Console bundle extension allowlist and kept a Game Studio packaging test that validates generated Studio ZIPs through the Console bundle validator.

**Rule**: Any new Game Studio packaged asset type must be accepted by the Console bundle validator in the same pass, with a cross-domain test that builds a Studio bundle and validates it as a Console bundle.

---

## 2026-05-07 — Arcade reports need accountability and audit mirroring

**What happened**: Adding community game reports could have been treated as a lightweight client feedback form. That would have left staff actions, duplicate reports, and abuse review outside the Console domain that owns public runtime and moderation.

**Why it mattered**: Public game reports are liveops evidence. If they are anonymous, unbounded, or not linked to console audit events, moderators cannot distinguish real safety issues from spam or reconstruct why a game was removed.

**Fix**: Made game reports session-bound, persisted them in `console_game_reports`, blocked duplicate open reports per user/game/category, added staff review/resolve/dismiss/reopen actions, and mirrored report opens plus staff actions into `console_audit_events`.

**Rule**: Any player-facing moderation path must have an accountable actor, bounded duplicate behavior, staff-owned status transitions, and an audit-event mirror in the owning game domain.

---

## 2026-05-07 — Arcade and Console are separate product surfaces

**What happened**: Source-imported and creator-submitted public games were being modeled through Console endpoints and stats even after the product direction had split WTF Arcade, WTF Console, and WTF Game Studio SDK into separate surfaces.

**Why it mattered**: Console is a personal owned-media experience. Arcade is the public paid-play surface. If public games leak through Console catalogs, moderation, scoring, or MCP tools, users see the wrong product model and imported games can bypass the intended play-fee lane.

**Fix**: Added explicit surface classification for stock console games versus Arcade games, moved public/imported/creator catalogs and admin routes to WTF Arcade, made Console APIs stock/owned-only, and wired the Arcade play ticket through the in-app market cart/contract path.

**Rule**: Console means stock plus owned user media. Arcade means public paid play, including source imports and creator/Game Studio submissions. Game Studio publishes to Arcade and exports/imports for Console only as owned media.

---

## 2026-05-08 — Economy anchors belong in one pricing domain

**What happened**: Arcade play access and in-app market catalog items were priced from separate surfaces, which let a play card, an Arcade credit, and desktop utility items drift into a thoughtless ladder instead of a designed economy.

**Why it mattered**: WTF, EXP, and Arcade credits all touch commerce behavior. If each feature owns its own constants, admin cannot tune rarity, score, sales, or cross-surface balance without creating arbitrary price gaps.

**Fix**: Added the in-app market rarity/score pricing lattice, locked the 1 WTF play card and 10 WTF Arcade credit as tier-one anchors, set the mop as the 100 WTF tier-two floor, seeded the vacuum as a rare item, and made Arcade read its play fee from the catalog.

**Rule**: Currency-bearing system items must declare rarity, score, and lock state in the market domain. Cross-surface prices like Arcade credits should read from catalog economics instead of duplicating constants, and discounts must round system checkout totals to whole WTF.

---

## 2026-05-08 — Inventory route fixtures must match page data contracts

**What happened**: The inventory route smoke run exposed `/user/:username` crashing because the harness returned a generic paginated response for `/api/users/:username`, while `PublicProfile` expected a profile payload with a `wallets` array.

**Why it mattered**: Route smoke tests only prove reachability when mocks preserve the same payload shape the page consumes. A fixture that is too generic can hide broken contracts until a page reads an expected field.

**Fix**: Added profile-specific user endpoint fixtures in the Playwright inventory harness and made the public profile wallet rendering tolerate a missing wallet array.

**Rule**: When adding or touching inventory route coverage, give each dynamic page the API shape it actually consumes. Keep UI components defensive around optional arrays, but fix harness shape drift at the endpoint boundary.

---

## 2026-05-08 — Desktop app gate fixtures must include every app key

**What happened**: The final type sweep found an MCP desktop app gate test still using the pre-casino app map after `DesktopAppConfig` gained the `casino` key.

**Why it mattered**: Feature-gate helpers are intentionally typed against the full desktop app registry. Stale fixture maps make unrelated work fail late and can hide whether a new app is actually governed by admin gates.

**Fix**: Updated the MCP test fixture to include `casino` so it matches the current desktop app config contract.

**Rule**: When adding a desktop app key, update test fixtures, harness app maps, and admin gate expectations in the same pass. Treat missing app keys as registry drift, not harmless test noise.

---

## 2026-05-08 — Route verification payloads should not restate spread fields

**What happened**: The Casino membership verification route returned `{ ok: true, ...result }` even though the verifier already returns its own `ok` field. TypeScript caught the duplicate response key before runtime.

**Why it mattered**: Verification endpoints are policy boundaries. A response shape that silently overwrites verifier fields makes it harder to trust failures, idempotent successes, and client-side access refresh behavior.

**Fix**: Returned the verifier result directly with the access snapshot appended, so `ok` has one source of truth.

**Rule**: When wrapping verification results, append only new fields after the verifier payload or destructure intentionally. Do not restate status fields that already come from the policy function.

---

## 2026-05-08 — Harness endpoint catch-alls must preserve exact response shapes

**What happened**: The inventory route smoke suite caught `/wtf-subdomains` crashing because the Playwright harness answered all `/api/wtf-subdomains/*` requests with one generic object. The native app expected `/api/wtf-subdomains/my` to return an array, while registrar and chat endpoints each return different object contracts.

**Why it mattered**: Broad harness catch-alls can make an E2E skeleton look complete while feeding impossible payloads to real pages. When the page hard-crashes on a harness-only shape, the suite stops proving the route surface is stable.

**Fix**: Split the WTF Domains harness responses by endpoint, mirroring the real API contracts, and added lightweight client guards around optional arrays on the native WTF Domains panels.

**Rule**: Any E2E harness route that covers a subdomain with multiple endpoints must model each endpoint shape separately. Catch-alls are only acceptable after exact fixtures for the page-owned contracts.

---

## 2026-05-08 — Live puppet E2E must own its server process

**What happened**: `npm run test:e2e:live:puppets` reused a long-running dev server on port 3000. That server was not guaranteed to be running the current branch or the E2E rate-limit bypass, causing wallet signature verification and repeated puppet logins to fail during release verification.

**Why it mattered**: Live puppet tests are only meaningful when they exercise the code under test with the test-only environment that keeps local automation inside production safety rails. Reusing an arbitrary server turns the suite into a stale-environment lottery.

**Fix**: Made the live puppet script start a Playwright-managed server on an isolated default port with `WTF_E2E_START_SERVER=1` and `WTF_E2E_REUSE_SERVER=0`, so it runs the current branch with the configured local E2E bypass.

**Rule**: Full live E2E orchestration scripts must own their server lifecycle, port, and local-only test env unless the caller explicitly opts into a remote base URL.

---

## 2026-05-08 — Live puppet DB prep must include every domain workflow schema

**What happened**: After the live puppet suite started its own server, the Casino domain workflow reached `/api/casino/status` and failed because the local E2E database had not applied the `casino_memberships` migration.

**Why it mattered**: Domain-level live E2E tests should fail on broken behavior, not missing local schema setup. If the prep script omits a domain migration, the workflow becomes a database bootstrap test by accident.

**Fix**: Added the Casino membership migration to the local puppet DB preparation migration list.

**Rule**: When adding a live route or domain workflow that reads a new table, add that table's migration to `tests/e2e/puppets/prepare-local-db.ts` in the same pass.

---

## 2026-05-08 — Console harness fixtures need endpoint-level contracts

**What happened**: Post-merge release verification caught `/console` crashing in the inventory route smoke suite because the Playwright harness returned one generic Console object for every `/api/console/*` endpoint. The page expects `/api/console/demo-cartridges` and `/api/console/cartridges` to return arrays, so spreading the generic object triggered `TypeError: It is not iterable`.

**Why it mattered**: The Console and Arcade domains have several API contracts behind one route surface. A broad catch-all can break the page with an impossible fixture shape and make the inventory suite fail for the wrong reason.

**Fix**: Split Console/Arcade harness responses for catalog, demo cartridges, user cartridges, stats, discovery, leaderboard, play-fee, and play-status endpoints before the generic fallback.

**Rule**: For route-backed domains with multiple read endpoints, add exact harness fixtures for every page-owned API contract before using a broad fallback.

---

## 2026-05-08 — Contract and signer changes need package-local verification

**What happened**: The club dues pass added a SmartPy admin helper and signer origination policy in separate packages. Root TypeScript did not catch the signer extension env-schema drift, and SmartPy rejected the private helper's storage access during contract import.

**Why it mattered**: On-chain membership flows cross the app server, browser wallet path, signer daemon, and SmartPy compiler. A clean root check alone can miss package-local signer config errors, while a contract that looks straightforward in source can still fail before it reaches Shadownet.

**Fix**: Flattened the SmartPy admin guard into the admin entrypoints, added the origination env flags to the signer extension schema, and verified with root TypeScript, signer package typecheck, signer protocol tests, SmartPy tests/compile, and inventory E2E.

**Rule**: When changing contract templates or signer protocol/policy, run the package-local verifier as well as the app-level checks: SmartPy test/compile for contracts and `npm run operator-signer:check` for signer daemon changes.

---

## 2026-05-09 — Let Taquito estimate Shadownet origination storage

**What happened**: Manual Shadownet origination of the club dues contract failed during simulation when the deploy script passed an explicit `storageLimit: 80000`, which exceeds the Tezos protocol cap.

**Why it mattered**: The compiled contract was valid and the wallet was funded, but an oversized client-side storage limit made the RPC reject the operation before origination. That turns a good deployment artifact into a false deployment failure.

**Fix**: Reused the compiled artifact and reran origination without an explicit storage limit, allowing Taquito to estimate a valid operation.

**Rule**: For Shadownet manual originations, let Taquito estimate storage unless there is a measured reason to override it. If an override is needed, keep it under the protocol limit and verify with simulation before sending.

---

## 2026-05-09 — SmartPy module constants need compiler-friendly forms

**What happened**: The tiered club dues rewrite initially declared typed constants such as `ACTION_RENEW: sp.nat = 0` inside `@sp.module`. SmartPy rejected them as non-module statements before tests could run.

**Why it mattered**: The contract behavior was straightforward, but parser-only failures stop the template before typechecking, compilation, or Shadownet simulation. Constants that look like ordinary Python can still be invalid inside SmartPy's module subset.

**Fix**: Replaced the module constants with explicit `sp.nat(...)`/numeric literals at storage and comparison sites, then reran SmartPy unit tests and compile.

**Rule**: In SmartPy `@sp.module` contracts, keep module-level declarations to supported type/class forms. Use inline literals or storage-backed config for action/status codes unless a known-good constant pattern has already compiled in this repo.

---

## 2026-05-09 — Casino simulations must preserve aggregate fairness counters

**What happened**: The WTF Button simulator initially counted Rug Clash winners that differed from the first entrant by looking only at the currently live button rounds. Trial restarts replace round objects, so settled-round clash histories were no longer visible to the final report. The first smoke report also labeled a modest multi-winner spread as single-player domination because the threshold was too sensitive for short experiments.

**Why it mattered**: Simulation reports guide economy and fairness tuning. If counters are derived from mutable live state after restart, the report can undercount resolved clashes and make the table look less random or more dominated than it is.

**Fix**: Added an aggregate simulation stats object that increments when each Rug Clash resolves, and tightened the dominance flag to require a majority of winner rounds.

**Rule**: Long-running casino simulations must record aggregate metrics at the event moment, not reconstruct them only from the final live state. Restarted or archived rounds need durable report counters.

---

## 2026-05-09 — Verify WebGL game scenes with screenshots when direct pixels lie

**What happened**: The Guinea Pig Raceway scene was visibly rendering in Playwright screenshots, but a direct WebGL `readPixels` probe still reported an empty buffer in automation. The test looked like a blank-canvas failure even though the rendered 3D racers and track were present.

**Why it mattered**: Browser game release checks need to prove the player can see the real 3D scene across desktop and mobile. A false negative in the pixel probe either blocks valid work or tempts future agents to delete useful visual checks.

**Fix**: Kept the Three.js renderer using a preserved drawing buffer and changed the Playwright scene test to capture the canvas screenshot, parse the PNG pixels, and assert nonblank color variance from the actual rendered output.

**Rule**: For WebGL/Three.js route smoke tests, prefer screenshot-based pixel assertions when direct canvas or GL buffer reads disagree with visible output. Keep desktop and mobile viewports in the same release check.

---

## 2026-05-09 — Telegram wallet ingest must preserve Tezos address case

**What happened**: The first Telegram digest normalizer pass treated extracted wallet mentions as lowercase identifiers. Tezos addresses are base58 strings, so lowercasing can change the address and break wallet matching or on-chain balance checks.

**Why it mattered**: FART NOISES tracking depends on matching Telegram text to linked wallets and TzKT balance responses. A case-mutated address would silently miss the real wallet and make the digest look empty or untrusted.

**Fix**: Changed the normalizer to trim and validate `tz1`/`tz2`/`tz3` base58 addresses without changing case.

**Rule**: Never lowercase Tezos wallet addresses for matching, storage, or chain queries. Normalize whitespace only, then validate with a base58-aware pattern.

---

## 2026-05-09 — Descriptor APIs must not read deploy-only asset bytes

**What happened**: The Game Studio asset catalog endpoint returned 500 in production after deploy because descriptor generation called the raw asset file builder for every stock asset. The runtime image served built assets from `dist/public` but did not include the original `public/` tree expected by those raw file reads.

**Why it mattered**: A metadata endpoint should stay cheap and resilient. Reading source bytes while listing descriptors couples public catalog browsing to container file layout and turns missing optional files into full route failure.

**Fix**: Made descriptor bundle paths metadata-only, added a `dist/public` fallback for raw source resolution, copied `public/` into the runtime image, and covered the descriptor path with a missing-source regression test.

**Rule**: Descriptor/list endpoints must not read large or deploy-layout-sensitive source files. Reserve byte reads for explicit download/build paths and keep Docker runtime copies aligned with any files those paths resolve.

---

## 2026-05-09 — Test-only puppet grants must still satisfy production constraints

**What happened**: The live puppet seed attempted to create temporary casino memberships with a zero-fee row. The insert failed on the production table's positive-fee constraint before the puppets could exercise casino routes.

**Why it mattered**: Seed shortcuts are there to make coverage practical, but they still run against the same schema invariants as paid flows. A grant path that bypasses payments can accidentally prove less than production if it writes impossible rows.

**Fix**: Seed temporary puppet memberships with a minimal positive fee, keep the app-pass inventory grant alongside the membership, and verify access through `/api/casino/status` before casino game probes run.

**Rule**: Puppet entitlement seeds may bypass external purchase mechanics, but they must preserve production database constraints and then prove the resulting access through live API checks.

---

## 2026-05-09 — Bulk seeded desktop artifacts need deterministic IDs

**What happened**: Granting several desktop inventory items to every puppet made the auto-spawn path create many desktop artifacts during route smoke tests. The artifact IDs used timestamp plus randomness, which produced a duplicate React key under the bulk seeded live harness.

**Why it mattered**: A random key collision is rare in manual play but likely enough in broad route automation, and the live puppet harness correctly treats React key collisions as fatal browser errors.

**Fix**: Inventory-backed desktop artifacts now derive stable IDs from the item kind, SKU, and inventory ordinal, while manually placed desktop items keep their normal generated IDs.

**Rule**: Any inventory-backed UI object spawned in bulk by E2E seeds must have deterministic per-inventory-instance identity. Reserve random IDs for one-off user-created objects.

---

## 2026-05-09 — Arcade paid play needs both ownership and balance checks

**What happened**: The Arcade UI buried the selectable game grid below score/community panels, and the paid-play gate only looked at expendable `arcade-play-ticket` credits. It did not require the durable `arcade-play-card` pass item the product model depends on.

**Why it mattered**: Players could see games but had to scroll inside a cramped selector, while the economy did not match the intended card-and-credits model. A credit-only gate also makes admin pricing and market issuance harder to reason about because ownership and balance are separate concerns.

**Fix**: Reworked the Arcade layout so the catalog owns the main viewport, moved stats and community data into a side/bottom rail, added per-game credit rules, and made session creation require both a Play Pass Card and enough loaded credits before deducting credits.

**Rule**: Arcade paid-play checks must model pass ownership and credit balance separately. UI panels with secondary telemetry should never consume the primary game-selection viewport, and local smoke tests that add schema columns need a migrated database or explicit route mocks.

---

## 2026-05-09 — OS shell state needs durable workspace semantics

**What happened**: WTF OS could open, move, minimize, and focus app windows, but the workspace only lived in React memory. A browser refresh erased the user's open work, and the taskbar had no Show Desktop, restore-all, quick close, or keyboard focus-cycle behavior.

**Why it mattered**: A desktop shell feels coherent when the workspace survives refreshes and the taskbar behaves like a real operating environment. Without durable session state and fast global controls, WTF OS reads as a themed web page instead of an OS.

**Fix**: Added a versioned local window-session store, pure state helpers with tests, taskbar Show Desktop / Restore Windows, keyboard focus cycling, minimize-all, middle-click taskbar close, a root styled-components prop filter for React95 shell noise, and inventory handles for the new interactions.

**Rule**: Window manager changes must treat open windows as a durable workspace. Persist normalized shell state, keep global controls testable as pure helpers, filter framework-only shell props before they hit the DOM, and smoke-test taskbar plus keyboard flows in a browser before claiming OS polish.

---

## 2026-05-09 — Route shells must treat sparse payloads as empty states

**What happened**: After the OS gained per-window crash isolation, the full inventory smoke still exposed app windows that opened directly into crash fallbacks. Tezos Intel, Marketplace, My Gallery, and Studio Project each trusted nested API fields that are valid in full production payloads but absent in sparse harness or empty-state responses.

**Why it mattered**: A crash-isolated desktop is better than a collapsed desktop, but a real OS still should not greet users with crashed windows for ordinary empty data. Inventory route smoke is valuable because it exercises direct app launch paths that normal happy-path browsing can miss.

**Fix**: Defaulted list, count, facet, and pagination payloads at feature boundaries, and made Studio Project wait for an actual project detail payload before connecting realtime collaboration.

**Rule**: Route-level app shells must normalize optional arrays and nested objects before rendering. Realtime sockets should not connect until the backing entity exists, and every route fixture failure should be treated as a broken window unless the failure is explicitly external and documented.

---

## 2026-05-09 — fxhash pagination has a hard page-size ceiling

**What happened**: The first GM NFT cache dry run queried the fxhash GraphQL API with `take: 100` for project objkts. The API rejected the request because `take` must not be greater than 50.

**Why it mattered**: Server-volume hydration scripts must be boring and repeatable. A too-large page size would fail the first production cache warm and leave the daily GM welcome without local image assets.

**Fix**: Clamp the GM NFT downloader page size to 50 and verified that project 24858 returns all 192 assigned objkts across bounded pages.

**Rule**: fxhash GraphQL collection/object pagination must use `take <= 50`; larger collections need explicit bounded loops and a final count check before writing manifests.

---

## 2026-05-09 — Auth success should land on the OS, not an app window

**What happened**: Login and registration both redirected successful users to `/dashboard`, so new users immediately saw a Dashboard app window instead of the desktop and any first-run welcome messages.

**Why it mattered**: WTF OS onboarding should feel like entering an operating system. Auto-opening a dense app after account creation makes the first session feel abrupt and can visually compete with welcome/GM modals.

**Fix**: Changed login, wallet login, registration, and authenticated auth-page redirects to land on `/`; polished the React95 auth windows; and aligned the client registration password hint with the server's 8-character minimum.

**Rule**: Auth success paths should return to the desktop root unless the user explicitly requested a deep link. First-run modals should own the first post-login moment before app windows compete for attention.

---

## 2026-05-09 — Admin route smoke can return object-shaped empty payloads

**What happened**: The full inventory run for the auth polish pass failed on `/control-board` because the harness returned a non-array payload where the Control Board assumed `seasons`, `rounds`, and `contestants` query data were always arrays.

**Why it mattered**: A login UX change should not be blocked by an unrelated admin window crash, but the failure still means direct route smoke can open a broken window for staff users. Sparse harness payloads are good pressure tests for production empty states.

**Fix**: Normalized Control Board query data through an array guard before filtering, finding, mapping, or passing props downstream.

**Rule**: Admin route components must guard list-shaped API payloads with `Array.isArray` at the feature boundary before rendering. Treat harness object payloads as empty states, not as render-time exceptions.

---

## 2026-05-09 — Desktop shortcut drops need their own contract

**What happened**: WTF OS needed Start menu drag-to-desktop shortcuts and right-click-like Shift-click menus, but the desktop already has several independent interaction layers: native icons, route windows, pet/artifact toys, and pointer-driven item physics.

**Why it mattered**: A broad desktop drop or pointer handler would make the OS feel more powerful while quietly stealing events from inventory-backed desktop items. That would break the exact toy-like interactions that make the desktop feel alive.

**Fix**: Added a dedicated Start menu shortcut MIME payload, local shortcut persistence, and element-owned context menus. Desktop drops now only activate for `application/x-wtf-start-menu-item`; desktop artifacts keep their own pointer handling and expose menus through their actor layer.

**Rule**: New desktop shell gestures must be opt-in per interaction layer. Use explicit drag MIME types and element-owned context handlers instead of global desktop event interception, and verify that desktop artifacts remain outside shortcut-specific drop paths.

---

## 2026-05-09 — Welcome modal links still need repo link policy

**What happened**: The GM welcome modal added a new external Objkt collection link with `target="_blank"` and `rel="noreferrer"`, which passed local type/build checks but failed the quality gate's external-link safety check.

**Why it mattered**: Full-send deploy can finish before the parallel quality gate fails, leaving production technically updated but the release not clean. Link safety is part of the browser security surface, even for tiny modal copy.

**Fix**: Updated the welcome link to `rel="noopener noreferrer"` and refreshed the quality workflow actions to current Node 24-compatible major versions.

**Rule**: Any new `target="_blank"` link must use `rel="noopener noreferrer"` before commit. During full-send, watch both deploy and quality workflows; do not call the release done until both are green or a blocker is documented.

---

## 2026-05-09 — Editor auto-selection must not steal explicit new drafts

**What happened**: Dear Diary initially auto-selected the first loaded entry whenever no entry was selected. That helped first load, but it also meant clicking New Entry while entries existed could immediately reselect the first saved entry and wipe the blank draft.

**Why it mattered**: Creation surfaces need to respect user intent over convenience defaults. A diary app that eats the new-entry state would feel unreliable, especially when opened from onboarding with preloaded text.

**Fix**: Added a one-time auto-select guard so initial load can pick the first entry, while welcome-preloaded drafts and explicit New Entry actions keep their draft state.

**Rule**: Auto-select defaults in editor/list layouts must be one-shot bootstraps. Once the user starts a new draft or follows an intent link, list refreshes must not overwrite that draft unless the user explicitly chooses an entry.

---

## 2026-05-09 — PATCH validators must not inherit create defaults

**What happened**: The first Dear Diary PATCH validator reused the create-entry schema through `.partial()`. Because the create schema supplies defaults for optional create fields, a sparse update risked materializing those defaults and resetting untouched fields.

**Why it mattered**: Partial updates must preserve existing user content unless the request explicitly changes it. A diary edit that only renames a title should never erase tags, classification, references, or body text.

**Fix**: Split the create and patch schemas. Create keeps ergonomic defaults; PATCH now uses a separate sparse schema with no field defaults.

**Rule**: Do not derive PATCH validators from create schemas that contain defaults or transforms with side effects. Define sparse patch validators explicitly and only write fields that were present in the request.

---

## 2026-05-09 — Puppet seed data must match current unique keys

**What happened**: The full-send onboarding pass could run inventory coverage and route smoke, but `npm run test:e2e:live:puppets` failed before browser tests while seeding `console_games`. The failing upsert targeted the `slug` conflict for the `adrift` fixture and stopped the actor-backed suite during local database preparation.

**Why it mattered**: Live puppet verification is supposed to test login, wallet, route, and workflow behavior. If seed fixtures drift from the schema's current uniqueness constraints, the suite blocks before it can exercise the product change being released.

**Fix**: Documented the blocker as a bounty item for the next harness repair pass and completed production verification through the deploy workflow health check plus external live smoke tests for the root page, Dear Diary route, and diary API auth boundary.

**Rule**: When local E2E seed fixtures use `onConflictDoUpdate`, keep their conflict targets and fixture uniqueness aligned with the current schema. A seed failure before Playwright launches is a harness/setup blocker, not a passing substitute for actor-backed verification.

---

## 2026-05-09 — Inventory harness fixtures must honor endpoint contracts

**What happened**: The casino full-send inventory run failed on `/swap` because the Playwright harness returned one generic object for every `/api/dex/*` path. The Swap page correctly treated `/api/dex/tokens`, `/api/dex/pools`, `/api/dex/counterparts/:tag`, and pool metrics as array endpoints, so the object-shaped token fixture crashed during `tokens.find(...)`.

**Why it mattered**: Full inventory smoke is a release gate across the whole OS. Harness drift in an unrelated domain can block a safe casino release and blur the line between product regressions and mock-contract regressions.

**Fix**: Split the DEX harness responses by endpoint so list endpoints return arrays and `/api/dex/health` returns the same health object shape as the live route.

**Rule**: Inventory harness catch-alls must never replace endpoint-specific fixtures when consumers depend on list, map, or health object contracts. Add the specific fixture before the catch-all, then rerun the focused route and full inventory suite.

---

## 2026-05-09 — Studio annotation geometry belongs in `data`

**What happened**: Studio annotation routes store geometry and presentation in the `data` JSON column, but the client still treated `position` as a top-level annotation field and attempted to post it to a strict server schema.

**Why it mattered**: Pin, box, and paint markup can silently drift if client and server disagree on the canonical annotation shape; new markup tools would have reused the wrong boundary.

**Fix**: Moved pin and rect client creation/rendering to the `data` payload, added Paint 95 brush/highlighter helpers over the same annotation path, and covered stroke normalization with focused tests.

**Rule**: New Studio annotation tools must use `studio_annotations.data` as the single geometry/presentation envelope. Do not add parallel top-level client-only fields for annotation coordinates.

---

## 2026-05-09 — Studio markup must anchor to the rendered media box

**What happened**: The first Paint 95 markup pass attached pointer math and annotation overlays to the full Studio preview stage. That works only when the media fills the stage; contained images with letterboxing would save strokes and pins against the empty surrounding area instead of the actual image pixels.

**Why it mattered**: Image review tools are spatial. A collaborator drawing an arrow or highlight needs the saved annotation to land on the same visual point for everyone, regardless of the image aspect ratio or window size.

**Fix**: Moved the Studio annotation ref, pointer handlers, and overlay into the rendered `PreviewMedia` box so normalized coordinates are relative to the visible media, not the outer checkerboard stage.

**Rule**: Any Studio visual annotation tool must bind coordinates to the rendered media element or media wrapper. Do not derive image annotations from outer layout containers that can include letterbox padding.

---

## 2026-05-09 — Route smoke payloads should be guarded at query boundaries

**What happened**: The full inventory run for the Studio markup release re-exercised `/swap` while mainline harness fixes were landing. The Swap page still assumed token, pool, and counterpart query data were arrays and called array methods directly.

**Why it mattered**: A focused Studio release can still be blocked by another route crashing under sparse or drifting API data. Harness endpoint contracts should be accurate, and route components should still normalize list-shaped payloads before rendering.

**Fix**: Normalized Swap token, pool, and counterpart query data through `Array.isArray` before using array methods.

**Rule**: Route components that render list-shaped API data must guard the query result at the feature boundary. Treat unexpected object payloads as empty lists during smoke rendering unless the domain needs an explicit fatal error state.

---

## 2026-05-24 — Hetzner app checkout is a deployment mirror

**What happened**: The Skywire full-send push landed on `origin/main`, but the production deploy failed before build because the server checkout at `/opt/platform/repos/wtf-app` had diverged from `origin/main` and the workflow used `git merge --ff-only origin/main`.

**Why it mattered**: A deployment checkout is not a developer branch. If it drifts, every full-send release can fail before migrations, Docker rebuilds, or health checks have a chance to prove the actual app state.

**Fix**: Updated the Hetzner deploy workflow to fetch, ensure the `main` branch exists, and reset the deployment checkout to `origin/main` before running `scripts/server-deploy.sh`.

**Rule**: Production mirror checkouts should be reconciled directly to the deploy ref before app deployment. Use fast-forward-only merges for developer branch hygiene, not for long-lived server mirrors that must recover from drift.

---

## 2026-05-11 — Health checks must report readiness, not just life

**What happened**: The production `/api/health` route could prove that the HTTP process was alive, but it did not expose the Law-required readiness facts: database reachability, chain/indexer config, contract config, deployed version, and scheduler visibility.

**Why it mattered**: A shallow health response lets deploys look green while core organs are blind, misconfigured, or missing. For WTF OS, health is part of kernel law because it tells users and operators whether the machine is safe to trust.

**Fix**: Added a tested health snapshot helper and expanded `/api/health` to report DB readiness, chain/config readiness, contract addresses, package/commit version, and scheduler registration/audit state.

**Rule**: Public health routes must distinguish "process is alive" from "system is ready." Keep readiness checks bounded and explicit, and include enough structured detail for deploy gates and Mission Control to explain what is broken.

---

## 2026-05-11 — Deploy scripts must tolerate Docker recreate races explicitly

**What happened**: Production deploy occasionally built the image and applied migrations successfully, then `docker compose up -d app caddy` returned a transient container-name conflict while the newly-created app container still came up healthy.

**Why it mattered**: A deploy command that exits nonzero after the app recovers is still not lawful. It breaks automation trust and leaves operators guessing whether schema, app boot, or Docker orchestration failed.

**Fix**: Added a narrow one-time retry for Docker's `already in use` recreate-name conflict before entering the normal health gate. Other compose errors still fail closed.

**Rule**: Deployment retries must be explicit, bounded, and error-specific. Never turn a deploy step into a broad ignore; retry the known transient condition once, then let the health gate prove readiness.

---

## 2026-05-22 — Desktop live UI assertions must scope repeated window text

**What happened**: The side quest UX live puppet slice correctly rendered Mission Control and the Side Quests page, but the new assertion used `getByText(/Daily Social Check-In/i)` without scoping or `.first()`. On the WTF desktop, multiple app windows can remain open at once, so Playwright strict mode found the same customer-facing quest title in both Mission Control and Side Quests.

**Why it mattered**: The product behavior was good, but an over-broad assertion turned a passing UX into a failed release gate. Desktop-style shells commonly keep prior windows visible, so repeated labels are normal and should be handled intentionally.

**Fix**: Tightened the live puppet assertion to use the first visible matching side-quest label for this route smoke and kept the durable reward behavior in the side-quest claim test.

**Rule**: For desktop/windowed UI tests, scope locators to the active window or intentionally select `.first()` when customer-facing labels can appear in multiple open windows. Do not assume route navigation removes older window content.

---

## 2026-05-22 — Daily reward live tests must be same-day idempotent

**What happened**: After the canonical side quest claim flow passed once, rerunning the same live puppet test with the same actor during the same UTC day failed because the quest was already claimed. The product state was correct, but the spec only accepted the pre-claim `claimableToday` state.

**Why it mattered**: Daily side quests intentionally use a per-user UTC-day completion key. Release verification often reruns a focused spec several times in one day, so tests must accept the valid already-claimed state and still verify idempotent reward action logs.

**Fix**: Updated the live puppet assertion to accept either ready-to-claim or already-claimed current-day state, then call the claim endpoint and accept either a completed reward action result or an `alreadyClaimed` response.

**Rule**: Tests for daily/weekly reward loops must be rerun-safe inside the same period. Assert the period key and durable side effects, not only the first-run transition state.

---

## 2026-05-22 — W timeline reads must trust the persisted stream cache first

**What happened**: W's filtered-stream worker could spend X credits and persist posts into `x_timeline_posts`, but `/api/w/timeline` still asked a separate first-window account query which posts to display. If the cached post authors were outside that window or came from the stream manifest/allowlist, the route could show an empty feed despite having paid-for cached rows.

**Why it mattered**: The W feed is supposed to be stream-backed and credit-frugal. A read-path account-window mismatch makes users retry/admins resync, which risks spending more credits while ignoring the data already stored in Postgres.

**Fix**: Made the timeline route read recent persisted `x_timeline_posts` directly, hydrate author metadata for those cached rows, fall back to cached author handles instead of dropping rows, persist text recovered from paid search/oEmbed hydration, and resolve XAA groupchat subscription IDs from local DB before remote lookup.

**Rule**: W read paths must consume durable stream/cache tables before deriving narrower author windows or attempting recovery. Any paid X payload field already in hand must be written to the DB, and one-time hydration must update the row so repeat reads do not fetch again.

---

## 2026-05-22 — Secret rewrites must verify GitHub hidden PR refs

**What happened**: A current-tree scan was clean, but full-history scanning found a real historical JWT/scoped key in an old generated Particle Painter asset. Rewriting branches and tags removed it from normal pushed refs, yet a fresh mirror clone still reached the old commits through GitHub's read-only merged-pull-request refs.

**Why it mattered**: A force-pushed branch can look clean while `refs/pull/*/head` still preserves sensitive commits for mirror clones. GitHub rejects direct git and REST deletion of those hidden refs, so the cleanup is incomplete until GitHub purges the PR refs and cached views.

**Fix**: Rewrote and force-with-lease pushed the affected branches plus the stabilization tag, verified heads/tags no longer reference the removed files, and logged the remaining GitHub PR-ref purge as a blocked security bounty item.

**Rule**: Secret-history cleanup must scan current tree, normal branch/tag history, and `git clone --mirror` output separately. Treat read-only GitHub PR refs as a distinct remediation step requiring GitHub Support, and rotate the exposed credential regardless of rewrite success.

---

## 2026-05-24 — W chat reads must not spend per-user X API calls

**What happened**: The Gameshow chat surface was still shaped like a broader X DM client even though the product only needs one official read mirror. That made route reads capable of waking personal DM code paths and made cache misses feel like broken chat.

**Why it mattered**: A single official conversation should be cheap, durable, and boring. If W can read from per-user DM surfaces, it can burn X API credits without improving the Gameshow chat experience.

**Fix**: W now serves the configured Gameshow groupchat from persisted DB cache first, exposes one chat in the UI, and uses a shared throttled platform refresh only for stale or explicit refresh reads. Personal inbox, ad hoc DM threads, groupchat sends, compose, and media upload are outside the active W surface.

**Rule**: W chat must remain a platform-account-backed read mirror unless the product intentionally reopens personal DMs. User OAuth scopes should cover read/timeline actions only, not DM permissions.
## 2026-05-24 — W chat reads must not spend per-user X API calls

**What happened**: W exposed too much of the original X surface area after the product had narrowed to one timeline stream and one gameshow chat mirror. The chat route could still depend on live platform DM resolution patterns, while the UI kept clutter from abandoned DM/inbox/posting plans.

**Why it mattered**: Under X pay-per-use constraints, a single public chat mirror should be served from the cached canonical conversation, not refreshed independently for every viewer. Extra DM, inbox, and compose affordances also invite OAuth scopes and API calls the product no longer needs.

**Fix**: Re-centered W on cached timeline plus one gameshow chat, added a shared throttled route refresh for the configured platform conversation, removed normal W route registration for compose/DM/media upload flows, added media previews and a cache-derived media tab, and narrowed OAuth to read plus timeline engagement actions.

**Rule**: When an API-priced product surface is retired, remove its UI, route registration, OAuth scopes, and inventory handles in the same pass. Shared read mirrors must be DB-first, with any upstream refresh gated globally rather than per user.

---

## 2026-05-24 — W URLs should become content, not duplicate text

**What happened**: Timeline posts and groupchat messages could show raw URLs while also trying to show media or link metadata elsewhere, which made the feed noisy and hid the useful artifact preview.

**Why it mattered**: W is a social timeline. URL and media handling is the content layer, especially for Tezos/OBJKT-style posts and streamed media entities. Users should see a clean card or media preview, not a pile of repeated links.

**Fix**: Added shared rich preview rendering for W timeline and chat cards, direct media URL detection, object/media cards, and a media-only tab reconstructed from cached timeline rows.

**Rule**: When X delivers media entities or URL preview metadata, W should render the preview once in the content card and strip duplicate raw preview URLs from the body copy.
**What happened**: The first W preview polish made rich cards render, but the raw URLs still remained in the post body above the cards. That made the feed look noisy even though the underlying preview data was present.

**Why it mattered**: W is meant to be a cached, low-cost timeline reader. If media and URL handling is the main value of the surface, links need to resolve into readable content cards instead of making users parse duplicated URL strings.

**Fix**: Added a shared rich-preview renderer for W timeline, media, and gameshow chat; direct image/video URLs now fall back into preview cards; post and chat body copy strips previewed URLs so the card becomes the primary artifact.

**Rule**: In W, a URL with any usable preview path should render as a content card and be removed from the surrounding prose. Keep raw URL text only as card metadata or fallback destination, not as duplicated body copy.

---

## 2026-05-24 — Comms routes must update every inventory spine

**What happened**: Adding Mail, Digest, AIM, Browser, and the comms kernel exposed stale inventory drift: route fixtures were missing for existing creation-tool aliases, a Task Manager fixture was duplicated, and API-only admin surface routes had been registered as browser route patterns.

**Why it mattered**: The communications mesh touches route maps, admin surfaces, public access docs, and domain workflows at once. Leaving any spine out makes the app look wired while the E2E inventory cannot prove every surface is reachable.

**Fix**: Added the new comms/mail/browser routes to page defs, access manifest, docs, admin surfaces, route fixtures, domain workflows, and the interaction inventory; moved API-only admin links into `adminRoutes`; and restored the inventory coverage gate to green.

**Rule**: Any new OS organ with routes or normalized handles must be registered across PAGE_DEFS, admin surfaces, public access docs, user-interaction inventory, route fixtures, and domain workflows in the same pass. API-only admin links belong in `adminRoutes`, not browser `routePatterns`.

---

## 2026-05-24 — Rename passes must preserve both canonical and legacy route contracts

**What happened**: Renaming the AIM messenger to WIM touched the visible app, desktop app gate, admin surface, access manifest, route fixtures, and normalized event handles. The first verification rerun also exposed conflict markers in already-dirty inventory/comms files, and the first visual smoke showed the message well rendering as a narrow strip because the React95 `Panel` did not fill its parent by default.

**Why it mattered**: A communication app rename is not just copy. If the canonical route, legacy alias, event handles, app gate, and inventory fixtures drift, users can still launch stale branding or E2E can prove the wrong surface. Visual smoke matters because route tests can pass while a layout is visibly broken.

**Fix**: Made `/wim` the canonical WIM route while preserving `/aim` as a legacy alias, updated WIM event handles and desktop/admin/inventory coverage, resolved the conflict markers without reintroducing API-only route fixtures, and made the chat log fill the message pane.

**Rule**: For app renames, update canonical route/title/icon/event handles and keep an explicit legacy alias when old launch links exist. After registry changes, scan for conflict markers and do a visual smoke, not only route coverage.

---

## 2026-05-24 — External embed links must satisfy the exact safety contract

**What happened**: The Skywire Bluesky client deploy passed the app build and inventory gates, but Quality Gates failed at `scripts/check-external-links.mjs` because an embedded external-card link used `rel="noreferrer"` with `target="_blank"`.

**Why it mattered**: A functional client can still be blocked from production if its generated social embeds violate the repository's exact external-link safety policy.

**Fix**: Updated the Skywire external embed card to use `rel="noopener noreferrer"` and ran the external-link checker alongside the Skywire route, typecheck, build, inventory coverage, and route smoke gates.

**Rule**: Any new `target="_blank"` UI path must include the exact `rel="noopener noreferrer"` contract before deploy, including links inside normalized social embed cards.

---

## 2026-05-24 — OAuth token restores must preserve identity claims

**What happened**: Skywire OAuth linking succeeded, but every authenticated Skywire tab failed during live testing with `Token set does not match the expected sub`. The database restore path rebuilt SDK token sets from encrypted access/refresh tokens but omitted the DID subject, issuer, and audience fields.

**Why it mattered**: The AT Protocol OAuth SDK intentionally refuses restored sessions whose `tokenSet.sub` does not match the DID being restored. Dropping identity claims makes a linked account look valid while all timeline, notification, and action calls fail.

**Fix**: Restored OAuth sessions now include `sub`, `iss`, `aud`, token type, scope, access/refresh tokens, and ISO expiration. A regression test builds an encrypted account row and asserts the restored token set matches the SDK contract.

**Rule**: When persisting third-party OAuth SDK sessions, preserve every identity-bearing field required by the SDK restore path, not only the secrets. Add a restore-shape regression test before shipping OAuth storage changes.

---

## 2026-05-24 — Skywire must match the SDK session shape and route read feeds to AppView

**What happened**: A fresh reconnect still produced a reconnect-required Home state because Skywire reconstructed `NodeSavedSession.authMethod` as the string `"none"`. The installed AT OAuth SDK expects an object like `{ method: "none" }`, so production restore failed with `Client authentication method "undefined" no longer supported`. At the same time, read-only Skywire tabs reused the connected account session/PDS for search and discovery, causing `forbidden` responses where public Bluesky AppView reads were the right surface.

**Why it mattered**: The OAuth flow was completing, but the durable session could not be restored. Users then saw a broken Bluesky client: no home timeline, forbidden read tabs, and Discover recommending the current user instead of other Skywire users.

**Rule**: When persisting SDK-owned objects, inspect the installed package type/runtime contract before reconstructing them. Keep authenticated surfaces for user timeline and write actions, but route public read/discovery/official-account feeds through public AppView unless the AT endpoint explicitly requires the user's OAuth session.

---

## 2026-05-24 — Route smoke fallbacks are sparse by design

**What happened**: The Skywire fix passed its own route smoke, but the full inventory suite failed on `/wtf-subdomains` because `HackTezPanel` optional-chained `config` but not the nested `attribution` object before reading `productName`.

**Why it mattered**: Inventory tests intentionally feed sparse API fallback payloads. A sibling route with brittle nested reads can block an otherwise unrelated production hotfix, and the user experiences the same thing as an app window crash.

**Rule**: For route-smoked UI, optional-chain every nested API object or normalize defaults at the boundary. Sparse harness payloads are a contract, not a nuisance.

---

## 2026-05-24 — Digest must normalize list payloads before rendering

**What happened**: After the WTF Domains sparse-config fix, the full inventory route smoke exposed the same class of crash in Digest: the page rendered `itemsQuery.data.items.map(...)` even when the resolved payload had no `items` array.

**Why it mattered**: Digest is the unified communications reader. Sparse comms payloads should render an empty state, not collapse the OS app window or fail the whole route inventory gate.

**Rule**: List pages should assign `const rows = data?.rows ?? []` or the equivalent before rendering. Do not map directly off API response properties unless the boundary has already normalized the shape.

---

## 2026-05-24 — Feed cards need actor navigation data, not just display text

**What happened**: Skywire could render home feed authors and Discover search results, but those surfaces did not let a user pivot into an author-only feed. Discover also ignored the connected user's Bluesky follows graph, so users had to search manually instead of selecting from people they already follow.

**Why it mattered**: A Bluesky client replacement is not usable if timeline actors are dead labels. Users expect profile/feed pivots from Home and a follows-based discovery surface that uses the actual AT graph.

**Rule**: Any social feed card that renders an actor should carry the normalized actor object through the UI as an interaction target. Discovery should prefer graph-backed lists for the connected account, then search/recommendations as secondary paths.

---

## 2026-05-24 — Status panels need inactive defaults

**What happened**: The inventory route smoke for `/mail` crashed because the Mail page read `status.mailbox.address` after receiving a sparse status payload with no mailbox object.

**Why it mattered**: Operational status panels often render before a user has activated the underlying service. Missing mailbox/config state is a normal inactive state, not an exceptional render path.

**Rule**: Status UIs should normalize absent nested objects to explicit inactive/not-configured defaults before rendering. Avoid direct reads like `status.mailbox.address` unless the API boundary guarantees the object.

---

## 2026-05-24 — Discovery should be a picker when a canonical detail view exists

**What happened**: Skywire had a working Actor Feed tab from Home, but Discover opened selected actors in a separate right-column feed. That created two competing author-feed experiences and made Discover feel clunky.

**Why it mattered**: Reusing the canonical detail view makes the app easier to learn and keeps future author-feed improvements in one place.

**Rule**: If a feature has a canonical detail/feed tab, discovery/search/list surfaces should select into that tab instead of rendering parallel mini-detail views.

---

## 2026-05-24 — Curated protocol feeds need actor allowlists, not keyword search

**What happened**: Skywire's Tezos Feed used Bluesky keyword search for Tezos terms, which mixed official ecosystem posts with arbitrary mentions and unrelated user chatter.

**Why it mattered**: A named community feed implies editorial trust. For official platform/community updates, the feed source should be the curated author set, not ambient text search.

**Rule**: When a feed is meant to represent official accounts, model it as an allowlisted actor feed and merge those authors only. Keep keyword search for explicit search surfaces.

---

## 2026-05-24 — Bluesky post URLs should prefer handles over encoded DID path segments

**What happened**: Skywire turned `at://did:plc:.../app.bsky.feed.post/...` URIs into `bsky.app/profile/did%3Aplc.../post/...` links. Bluesky rejected those as invalid DID/profile paths during live testing.

**Why it mattered**: Feed cards need a reliable canonical-source link. Broken source links make users doubt the client and make debugging posts harder.

**Rule**: Build Bluesky post URLs from the author handle when available. If falling back to a DID, keep it readable in the profile path rather than percent-encoding the colon-separated DID.

---

## 2026-05-24 — Linked identity rows need their own exit action

**What happened**: Profile started showing the linked Skywire/AT Protocol identity next to X and Discord, but it only offered Open/Connect Skywire. The backend unlink route existed, but the Profile row did not expose a manual disconnect button.

**Why it mattered**: Identity linking is user-owned account state. If a surface can show that an external identity is connected, it should also provide the clear local way to disconnect it from that same surface.

**Rule**: Any Profile Social & Contact row that displays a linked external identity must include a visible disconnect/unlink action when the account is connected, even if the owning app has another management surface.

---

## 2026-05-25 — Session-only roles need one shared app-launch policy

**What happened**: Adding the `time_out` account role could not be handled only in the admin role dropdown or Start Menu list. WTF OS has several launch paths: direct URL sync, restored windows, desktop icons, desktop shortcuts, keyboard launchers, command palette commands, and desktop item affordances.

**Why it mattered**: A role that can log in but cannot open apps is an access-boundary role. If any launcher keeps its own copy of role rules, the account can still enter an app through a stale shortcut, restored session, command search, or direct route.

**Fix**: Added a shared `canOpenAppsForRole` / `canOpenPageDef` policy and consumed it from window rendering, URL sync, Start Menu construction, command palette construction, desktop icons, shortcuts, and item launch callbacks.

**Rule**: New account roles that change app access must be enforced through the shared route/app-launch policy first, then consumed by every launcher. Do not patch only the visible menu.

---

## 2026-05-25 — App gates must be runtime policy, not launcher decoration

**What happened**: Desktop app toggles were treated mostly as presentation state for icons and Start Menu entries. A disabled app could still be reached through direct routes, stale shortcuts, or command-palette commands because page access checks only evaluated auth and route role flags.

**Why it mattered**: Admins need app disable controls to stop an app from running, not merely make it less visible. If launch surfaces and route rendering use different gate logic, disabled apps remain reachable through any path the UI forgot to hide.

**Fix**: Page access now combines role/surface access with the desktop app enabled map, command palette and Start Menu filtering use that shared decision, and direct disabled-app routes render an explicit admin-disabled failure state instead of mounting the app.

**Rule**: Every desktop app gate must be enforced at runtime in the shared route access layer. Launcher hiding is secondary; direct URLs, stale shortcuts, command palette entries, and open windows must all honor the same admin app state.

---

## 2026-05-25 — Inventory coverage must stay DB-free

**What happened**: CI Quality Gates failed after the desktop app registry merge because `tests/e2e/inventory/coverage.ts` imported `DEFAULT_DESKTOP_APP_CONFIG` from `server/lib/desktop-apps.ts`. That server module imports `server/db.ts` at module load, so a static registry coverage check required `DATABASE_URL` in GitHub Actions.

**Why it mattered**: Inventory coverage is a compile-time/static safety net and must run in clean CI without production secrets. Local `.env` can hide accidental runtime imports that break the same command in GitHub.

**Fix**: Moved the static desktop app default map and app-key guard into `shared/desktop-apps.ts`, kept the server runtime helper as a DB-backed wrapper, and pointed inventory coverage at the shared DB-free module.

**Rule**: Static inventory, registry, and coverage checks must import shared constants only. If a server runtime module opens the database, do not import it from CI static checks just to read constants.

---

## 2026-05-26 — Node 25 test runs need tsx loaded with --import

**What happened**: Targeted TypeScript unit tests were first launched with `node --loader tsx --test ...`, which now fails under Node 25 because `tsx` no longer supports the deprecated loader hook.

**Why it mattered**: The test files were healthy, but the obsolete invocation made the verification look broken until rerun with the supported loader path.

**Rule**: Run local TypeScript `node:test` files with `node --import tsx --test ...` on modern Node versions. Do not use `--loader tsx`.

---

## 2026-05-26 — PDS offerings must be backed by a real service boundary

**What happened**: The first tz2at/WTFOS identity slice described a WTFOS PDS offering before the repo had a concrete WTFOS PDS service, health check, or configuration gate.

**Why it mattered**: A linked WTFOS DID/repo is the spine for outward AT Protocol activity, achievements, and game/system state. If the UI implies the PDS exists before infra is configured, WTFOS can accidentally keep treating the user's canonical repo as the convenient fallback.

**Fix**: Added a dedicated `wtfos-pds` Compose service profile, Caddy host, PDS env surface, app health/status endpoints, and disabled repo requests until the PDS is configured.

**Rule**: Any user-facing PDS provisioning or DID-linking surface must prove the WTFOS PDS service boundary first. If the PDS is not configured or healthy, show that state and fail closed instead of queueing writes against canonical user repos.

---

## 2026-05-26 — App-owned AT activity needs an outbox before repo writes

**What happened**: The WTFOS PDS layer could provision a linked repo, but there was still no durable publisher rail for game/system activity. That left future features tempted to write straight from handlers, or worse, fall back to the user's canonical repo because it already had an OAuth session.

**Why it mattered**: AT repo writes are side effects with identity semantics. They need retry state, explicit target identity, and a visible failure mode so WTFOS can publish outward without polluting canonical social repos.

**Fix**: Added `wtfos_atproto_outbox`, a narrow `app.wtfos.activity.event` builder, and a publisher that restores the linked WTFOS PDS session and writes to `identity.wtfDid`. The tz2at wallet-link route now mirrors only the post-proof activity event through this outbox.

**Rule**: New WTFOS `app.wtfos.*` repo publications must go through a durable outbox bound to the linked WTFOS DID/repo or a synthetic actor repo. Do not add direct app/game/system repo writes against the canonical user DID.

---

## 2026-05-26 — Blockchain activity must enter through the OS event spine

**What happened**: WTFOS already persisted linked-wallet Tezos activity in `wallet_events`, but those rows did not become `challenge_system_events`. That made chain activity visible in wallet dossiers while leaving challenge, side quest, reward automation, and AT repo export on a separate track.

**Why it mattered**: WTFOS needs one semantic event spine for in-app actions and on-chain actions. If blockchain activity bypasses the SystemEvent layer, rewards and AT AppViews cannot see a unified story of what the user did.

**Fix**: `wallet_events` inserts now emit deterministic `blockchain.tezos.*` SystemEvents, and SystemEvent ingestion enqueues `app.wtfos.activity.event` records for both the primary WTFOS repo and the user's linked WTF DID repo.

**Rule**: New chain/indexer integrations must normalize into `challenge_system_events` first, then export through the WTFOS AT outbox. Do not build one-off reward triggers or repo publishers directly from raw indexer tables.

---

## 2026-05-28 — Stage broadcasts are public social records, not hidden live state

**What happened**: Skywire Stages gained `app.wtfgameshow.skywire.stage.broadcast` records so a host can publish one-way WTF LIVE or replay references from their own AT/PDS repo, optionally with a quoted-post preview snapshot.

**Why it mattered**: Stages can look like infrastructure state, but canonical user AT repos are public signed social storage. The record should describe a user-authored broadcast, not hold private room state, audience ACLs, stream secrets, moderation state, or WTFOS scheduler internals.

**Rule**: Skywire Stage records may be portable public broadcast announcements with explicit Be Heard/Be Bold consent. Keep live media auth, stage control state, private audience membership, and WTFOS automation state in WTFOS-owned storage or encrypted/private systems, then link to public artifacts only when the user intentionally broadcasts them.

---

## 2026-05-28 — Bluesky chat is service-proxied, not repo storage

**What happened**: Skywire added a Chat tab for direct and multi-member Bluesky conversations using `chat.bsky.convo.*` through `did:web:api.bsky.chat#bsky_chat`, including quoted-post record embeds that render as clickable previews.

**Why it mattered**: The user wants user-owned PDS-backed social storage where possible, but Bluesky DMs are an explicit chat-service surface behind the separate `transition:chat.bsky` scope. Treating private chat like public repo records would either leak private messages or create a non-compatible fake DM layer.

**Rule**: Use official Bluesky chat APIs for compatible private/direct/group chat and require the explicit DM add-on scope. Use user PDS repo records only for intentional public social artifacts such as posts, quotes, room messages, stage broadcasts, signals, and proofs.

## 2026-05-29 — Doc registry metadata must use real filesystem doc paths

**What happened**: The first cut of the wtfOS doc-registry links was convenient for humans but unsafe for automated acceptance checks because some install-policy references were treated like in-file anchors instead of concrete files on disk.

**Why it mattered**: Registration, packaging, and install gating need to prove that docs exist before an app can receive an install key. If the registry points at a fragment or implied section instead of a real path, the enforcement layer can drift away from the actual docs tree.

**Rule**: Any doc-registry field that is consumed by install gating, package acceptance, or existence checks must resolve to a real filesystem path. Keep section anchors separate from the path that proves the document exists.

---

## 2026-05-30 — Tezos market health and Etherlink bridge liquidity must stay in separate tabs and base units

**What happened**: tz2at ecosystem analytics mixed Etherlink-dominated relay heads with Tezos CEX custody reads, so CEX in/out looked like zero XTZ when only the newest Etherlink rows were sampled. Market-health totals also risked summing Tezos mutez with Etherlink 18-decimal wei.

**Why it mattered**: Operators need CEX ↔ user ↔ marketplace flow on Tezos L1 and a distinct mainnet↔Etherlink corridor story. Collapsing networks or sampling depth hides real exchange movement and misstates bridge volume.

**Fix**: Tag every ingested row with `source` / `sourceLabel`; build Tezos market health from mainnet-filtered analysis plus user/market flow panels; load `replay-etherlink` separately; expose `etherlinkBridge` with credit/debit/internal/tezos-bridge-corridor buckets; split the tz2at UI into **Tezos Market** and **Etherlink Bridge** tabs.

**Rule**: Never treat shallow relay heads as CEX market evidence. Keep Tezos CEX totals on entity repos + deep L1 replay; keep Etherlink bridge metrics on their own tab with network-appropriate formatting and no cross-network summation.

---

## 2026-05-30 — Cross-network liquidity totals must normalize before summing

**What happened**: WTF-BB-186: `analyzeRecords` and `segmentRecords` summed Etherlink 18-decimal `amountMutez` with Tezos 6-decimal mutez, corrupting `totalXtzFlowMutez`, leaderboards, and segment charts by ~10^12.

**Why it mattered**: Aggregated liquidity metrics are economic claims; one wei-scale Etherlink row could dwarf entire Tezos L1 windows.

**Fix**: Added `normalizeToComparableMutez` (divide Etherlink wei by 10^12) at aggregation boundaries; kept native amounts on routes, CEX custody flows, and per-flow UI. Leaderboard display uses mutez-comparable formatting without Etherlink 18-dec scale. Deployed to production WTF host via SSH (`wtfgameshow.app`).

**Rule**: Any cross-network sum or rank on tz2at amounts must use a single comparable unit (6-decimal mutez-equivalent). Per-network displays may still use native units with `formatMutez(..., network)`.

---

## 2026-06-01 — Canonical public domains must stay in explicit Caddy host parity

**What happened**: `wtfos.app` was promoted in shared branding, docs, CLI defaults, and manifests, but the production `Caddyfile` still only declared `wtfgameshow.app` hostnames. Cloudflare could present a valid edge certificate for `wtfos.app`, yet the origin handshake still failed with `525` because the canonical hostname was never put on the working app proxy block.

**Why it mattered**: Domain promotion is not only a docs/config constant change. If the reverse proxy host list lags behind branding and DNS, the canonical site can be visibly down while the legacy alias keeps working, which hides the regression until users hit the new domain.

**Fix**: Added `wtfos.app` to the main Caddy app block, added a `www.wtfos.app` redirect, and added `scripts/caddy-domain-policy.test.mjs` to assert canonical/legacy hostname parity in the repo. During the live repair, recreating the `caddy` container was required because the stack bind-mounts `Caddyfile` as a single file and an in-place-replacement edit (`sed -i`) can leave the running container pinned to the old inode.

**Rule**: Whenever `wtfos.app` (or any new public hostname) becomes canonical in branding, docs, CLI defaults, or manifests, update the production Caddy host list and redirect set in the same pass and add a regression check that proves the hostname is actually served at the origin. On the live host, treat the single-file `Caddyfile` bind mount as inode-sensitive: after replacement-style edits, recreate or restart the `caddy` container so it remounts the updated file before you trust any reload result.

---

## 2026-06-03 - Rolling-stream products must not pretend to be historical APIs

**What happened**: Rat Race was meant to test whether tz2at's rolling stream can provide the end-stream market data the app needs, but the UI still exposed wider mint-age windows and the backend treated Objkt listing hydration as the practical canonical source for buyable candidates.

**Why it mattered**: A rolling source can be canonical without being historical. Offering 14/30/90/365-day filters or requiring Objkt listings to define active market state turns the product into an Objkt/TzKT-style historical index instead of a tz2at capability test.

**Fix**: Rat Race now caps minted-age options to 1/3/7 days, returns healthy tz2at replay results without falling back to local history, consumes tz2at swap/listing records for active listing/floor signals, and reports Objkt as an explicit supplement only for metadata, supply, mint timestamp, media/creator fields, pk-to-FA2 normalization, and native direct-buy listing ids.

**Rule**: When a feature is intentionally backed by a rolling stream, clamp every UI/API/test fixture to the stream's retention window and document supplement sources separately from canonical stream facts. Do not add wider historical options unless the canonical source actually exposes that history.

---

## 2026-06-03 - Root-mounted rollout middleware must be path-scoped

**What happened**: The Skywire and WTF LIVE routers were mounted from the root route registry, but their rollout guards were registered with bare `router.use(...)`. That let a Skywire/WTF LIVE gate deny unrelated downstream APIs such as desktop app config, media, commerce, and challenge workflows.

**Why it mattered**: A rollout flag should only protect its own product surface. When root-mounted routers use unscoped middleware, one disabled experiment can quietly break live puppet coverage for unrelated domains and make the release look much worse than the feature actually is.

**Fix**: Scoped the guards to `/api/skywire` and `/api/wtf-live`, then expanded the local live puppet prep to include the schema, storage paths, CSRF headers, and fixture data needed by the route/domain workflows it exercises.

**Rule**: Any router mounted at `/` must scope feature gates, auth wrappers, and rollout middleware to the exact path prefix they own. When live puppet failures fan out across unrelated domains, inspect global middleware placement before chasing each API one by one.

---

## 2026-06-03 - Launch-surface tests must account for window scroll and display titles

**What happened**: The live puppet launch-surface check created an active challenge, then asserted the raw title was immediately visible on Mission Control. The route had loaded valid active challenge state, but the individual challenge row lived lower in the AppWindow and the app intentionally maps live-puppet raw titles to customer-safe display labels.

**Why it mattered**: A viewport-sensitive assertion made a healthy Mission Control state look broken and blocked full-send verification. Raw internal seed names are also poor UI assertions when the product has a display-title adapter.

**Fix**: The puppet now seeds the challenge with the existing live-puppet title prefix, asserts the customer-safe display title, and scrolls the Mission Control challenge queue into view before checking visibility.

**Rule**: Live puppet UI tests should assert product-facing labels and scroll AppWindow content before visibility checks on lower panels. Use API existence checks or full destination pages for exact seeded entity proof when a dashboard only previews a subset of rows.

---

## 2026-06-03 - Skywire token commerce must augment the workstation, not replace it

**What happened**: Skywire needed Ovoid-style wallet/token context and Cloudnine-style Objkt/Teia buy affordances, but copying either client wholesale would have bypassed existing Skywire social features and the app's current wallet preflight/direct-purchase guardrails.

**Why it mattered**: Token previews in a social feed are commerce actions, not decoration. A better UI still needs the same account, wallet, route, and inventory contracts as the rest of WTF OS, and unsupported marketplace entrypoints should not silently become sendable from a feed card.

**Fix**: Added Skywire-owned token-link and vault endpoints, kept owned tokens on local linked-wallet holdings, used Objkt only as a supplemental source for created tokens/listing metadata, and routed direct buys only through the existing allowlisted `purchaseRatRaceListing` path. Open-edition mints are surfaced as external actions until their contract path has first-class guardrails.

**Rule**: When importing UX ideas from external clients, map them onto existing WTF OS auth, wallet, and inventory surfaces. External indexers may enrich Skywire, but direct wallet sends must stay on locally tested allowlisted entrypoints with explicit unsupported states.

---

## 2026-06-03 - Dashboard preview tests must separate shell readiness from entity proof

**What happened**: The Mission Control launch-surface puppet could load the shell and side-quest panels while its challenge query still showed the default empty preview, so assertions for "Active challenges" and the seeded challenge title flaked even though the challenge API and challenge board were correct.

**Why it mattered**: Dashboard previews intentionally compose several async queries. Treating one preview row as the source of truth for a newly seeded entity made a healthy launch surface look broken and repeatedly blocked full-send verification.

**Fix**: The live puppet now proves the seeded challenge through the contestant challenge API and `/challenges`, while Mission Control assertions stay on stable shell affordances: status cards, the Challenges launcher, "What counts", and side-quest readiness.

**Rule**: For composite dashboards, assert shell/launcher readiness on the dashboard and assert exact seeded entities through their owning API or full destination page. Do not make a dashboard preview's loading order carry entity-proof responsibility.

---

## 2026-06-03 - Objkt open editions need the claim path, not an Objkt fallback

**What happened**: Skywire surfaced Objkt open editions as listed tokens, but direct wallet minting still fell back to Objkt because the shared purchase sender only understood fixed/listing entrypoints (`fulfill_ask`, `buy`, `collect`).

**Why it mattered**: Open editions are still wallet-sendable, but they use Objkt's separate `claim` contract shape. Treating them as unsupported makes Skywire feel worse than Cloudnine/Ovoid, while guessing at a fixed-listing ask shape would send the wrong parameters.

**Fix**: Added the Objkt open-edition contract to the allowlist, mapped it to the `claim` entrypoint, fixed Skywire OE intents to use `amount: 1`, and taught the shared Taquito sender the `claim` parameter shape while still failing closed for targeted, non-tez, unknown, or invalid fixed listings.

**Rule**: Marketplace affordances must be keyed by contract and entrypoint shape, not just by marketplace brand. Objkt open editions use `claim` with an explicit amount, so keep quantity defaulted to one unless the UI and tests intentionally add a quantity selector.

---

## 2026-06-03 - Direct wallet buys must bind session user, linked wallet, and signer

**What happened**: Skywire direct buys used the browser wallet context address and then verified the active wallet provider matched that address, but they did not re-fetch the current session's linked-wallet rows immediately before the send.

**Why it mattered**: Browser wallet state can outlive a WTF OS login session on shared machines or during account switching. If user B inherits user A's still-active wallet session, signer preflight alone proves the wallet is active, not that it belongs to user B.

**Fix**: Added a shared direct-buy ownership guard that fetches `/api/wallets` for the current cookie session, requires the requested wallet to be linked to that user, and only then lets the existing wallet-provider active-account/network preflight continue. Skywire now runs the guard before recording a buy-request event, and the shared Rat Race/Skywire sender runs it again before Taquito submission.

**Rule**: Every browser-originated contract send must prove three identities in order: the signed-in WTF OS user, a wallet linked to that user from the server session, and the active wallet-provider signer for that same address. Never trust rehydrated local wallet state as account ownership proof.

---

## 2026-06-03 - Conflict-heavy holdings upserts need bigint ids

**What happened**: Production health stayed overall `ok`, but the scheduler audit listed `holdings-derive:error`. Pulling the production container logs showed the real cause: `wallet_holdings_id_seq` hit the 32-bit serial maximum (`2147483647`). The holdings derive upsert can consume sequence values even when rows conflict and update instead of inserting.

**Why it mattered**: Skywire vault, cockpit holdings, ownership predicates, and gallery/automation surfaces all rely on `wallet_holdings` being refreshed. Once a primary-key sequence is exhausted, every scheduled refresh fails until the table and sequence are widened.

**Fix**: Migrated `wallet_holdings.id` and `wallet_holdings_id_seq` to bigint capacity, reset the sequence above the greater of current max id and current sequence value, and updated the shared schema to `bigserial`. Also kept amount parsing in a `normalized_events` CTE so malformed `token_amount` text cannot be the next all-row derive failure.

**Rule**: Any table refreshed by frequent `INSERT ... ON CONFLICT DO UPDATE` jobs must use bigint primary-key capacity from the start. PostgreSQL sequences advance before conflict handling, so update-heavy upserts can exhaust 32-bit serials far faster than row counts suggest.

---

## 2026-06-03 - Desktop icon layout keys must track the rendered native icon set

**What happened**: Native desktop icons such as Mission Control, Command Palette, Skywire, WTF LIVE, tz2at, CRP Nominations, Rat Race, Map Lab, and Mail were rendered as movable launchers, but several were absent from the shared desktop icon layout allow-list. WX controls also lived in a top-right desktop overlay instead of the tray, and experimental app status had no visible launch-surface affordance.

**Why it mattered**: A drag UI can look per-user movable while the settings API silently discards saved positions for unlisted keys, making icons reset after reload. Desktop environment controls also need to live where users expect shell controls, and experimental status should be visible before launch.

**Fix**: Expanded the shared layout allow-list and focused regression tests to cover every rendered native desktop icon, moved WX/weather selection into a lightning tray popup, and marked experimental desktop app icons with a canonical yellow outline.

**Rule**: Whenever adding or changing native desktop icons, update the shared layout allow-list and regression tests in the same pass. Keep shell controls in their owning tray area, and derive experimental icon affordances from one canonical app metadata source.

---

## 2026-06-03 - Creation tool launchers must be registry-driven

**What happened**: The Stuffs menu grouped creation tools under `My Media`, and `PAGE_DEFS` manually listed only five creation-tool routes even though the canonical creation-tool registry already included PixelPatterns and PenRose Backgrounds.

**Why it mattered**: Manual menu and route lists drift from the tool registry. That makes existing creator apps disappear from launcher surfaces and makes future creation tools easy to add to the registry without becoming reachable from the user's Start Menu.

**Fix**: Added a dedicated `CREATE!` Start Menu category, generated creation-tool page definitions from `CREATION_TOOLS`, moved tool launchers out of `My Media`, and verified the rebuilt browser harness because Playwright serves `dist/public`.

**Rule**: Creation-tool launcher routes should come from the canonical creation-tool registry. When browser smoke uses the local Playwright harness, rebuild `dist/public` before trusting Start Menu screenshots or flyout assertions.

---

## 2026-06-04 - Rat Race direct buy keys are supplemental, not market signals

**What happened**: After Rat Race began preferring tz2at marketplace swap records for active-listing/floor evidence, the row builder nulled `listing_id` whenever the floor came from tz2at. Cards could show active listings while Buy direct was disabled or unsupported even when Objkt hydration had the numeric contract key needed for the wallet send.

**Why it mattered**: tz2at can be canonical for market evidence without carrying every marketplace-specific purchase key. Wallet sends need the exact ask/swap id and price for the entrypoint being called; using tz2at floor fields as the purchase payload either disables valid buys or risks sending the wrong amount.

**Fix**: Rat Race now keeps tz2at-first floor/listing evidence while attaching direct-buy fields from supplemental Objkt public tez listings. Objkt `bigmap_key` is used as the contract purchase key, with `id` only as fallback, and the buy price/marketplace contract come from the same Objkt listing used for the wallet send.

**Rule**: Do not collapse market-signal fields and wallet-send fields into one source. For external marketplaces, keep the canonical activity source separate from the supplemental contract-call key, and assert that `listing_id`, `listing_price_mutez`, and `marketplace_contract` all refer to the exact listing the wallet will buy.

---

## 2026-06-04 - Social feed polish needs multi-card spacing and media containment tests

**What happened**: A previous Skywire feed polish pass made individual cards look better in isolation, but the real feed could still collapse into cramped horizontal strips with clipped content, cropped media, and no clear negative space between adjacent posts.

**Why it mattered**: Skywire is supposed to help users connect Bluesky posts to Tezos objects. If post frames cannot breathe, media is treated as decoration, and Objkt/Teia/OE links are not promoted into token previews, the client feels worse than the networks and tools it is trying to bridge.

**Fix**: The Skywire feed now uses a centered social column, self-sizing post cards, explicit inter-card spacing, visible card overflow, contained full-size media stages, token preview detection from text and external embed metadata, and a collapsed-by-default reply composer opened from the Reply action.

**Rule**: Feed UI verification must include multiple stacked posts, at least one tall media asset, at least one marketplace external embed, and assertions for card height, inter-card gap, non-clipping, media containment, token preview rendering, and default composer clutter.

---

## 2026-06-04 - Teia objkt links include contractful paths

**What happened**: Skywire accepted numeric `teia.art/objkt/{tokenId}` links, but rejected valid contractful `teia.art/objkt/{KT1}/{tokenId}` links in both the client href detector and the server token parser. Other app helpers already emitted contractful Teia URLs, so Skywire was rejecting a link shape the product itself could create.

**Why it mattered**: Rejected Teia links never reached token-link hydration, which meant posts could show valid Teia token URLs without token previews or wallet-buy options even when Teia had an active `collect` listing.

**Fix**: Aligned the client and server Teia parsers around both numeric and contractful `/objkt` shapes, added a contractful Teia resolver fixture that asserts a Teia `collect` purchase intent, and updated the Skywire browser harness plus inventory workflow probe to cover that exact URL family.

**Rule**: Marketplace URL support must test every URL shape emitted elsewhere in the app and every marketplace-specific contract/entrypoint used for direct buys. Do not treat the shortest canonical marketplace URL as the whole supported surface.

---

## 2026-06-04 - Marketplace feeds must use the same URL matcher as buy overlays

**What happened**: Adding a Skywire marketplace channel exposed another drift risk: Bluesky posts can carry hrefs in rich-text facets even when visible text does not show the URL, while the previous overlay extraction only checked raw text and external embed metadata. The first browser harness pass also added a unique facet URL that the token-link mock did not allow, causing noisy 400s.

**Why it mattered**: A marketplace feed should neither miss valid buyable hrefs nor show posts that only mention an Objkt/Teia domain without a supported token path. If feed search, post normalization, and token-card hydration use different URL rules, the channel becomes unreliable immediately.

**Fix**: Moved Skywire marketplace URL matching into a shared helper, normalized `app.bsky.richtext.facet#link` URLs into Skywire posts, backed Market Feed with public AppView domain searches, and locally filtered results through the same parser that powers token previews and direct-buy intents.

**Rule**: Any Skywire feed based on marketplace links must over-fetch from AppView/search safely, then post-filter with the exact shared buy-overlay URL matcher. Tests should cover text URLs, external embeds, and rich-text facet hrefs without introducing harness-only token-link URLs that the mock cannot hydrate.

---

## 2026-06-04 - Bluesky chat media needs an explicit Skywire sharing layer

**What happened**: Skywire needed chat media attachments, but the installed Bluesky chat lexicon only accepts text, facets, and `app.bsky.embed.record` quote embeds for chat messages. Treating image or video blobs as native chat embeds would have produced a UI-only illusion that other users could not reliably receive or render.

**Why it mattered**: A sender's normal `/api/media/:id/file` route is owner-only. If Skywire simply attached those URLs, recipients would see broken media; if it made all media IDs broadly readable, private uploads would leak across users.

**Fix**: Skywire now sends uploaded chat media as explicit signed Skywire file links embedded in message text, hides those transport markers in the Skywire UI, and renders the parsed attachments as GIF/image/video/audio cards. Quoted post replies remain native `app.bsky.embed.record` embeds and render above the reply as supertext with quotation marks.

**Rule**: Before adding media to any AT Protocol surface, verify the active lexicon supports that media shape. If it does not, build an explicit signed sharing layer with recipient-visible transport semantics instead of widening private media routes or inventing unsupported native embeds.

---

## 2026-06-04 - Skywire vault shares must use displayed token media

**What happened**: Skywire vault token sharing initially focused on text and Objkt URLs, then risked making the test language sound like minting or token creation work instead of sharing already-displayed Owned/Created vault tokens.

**Why it mattered**: Users expect the token card they can already see in the vault to be the source of truth. Share drafts should use dignified catalog facts, and Bluesky embeds should include the same token media the client already displays, without mixing in first-person ownership copy or unrelated creation flows.

**Fix**: Vault shares now pass the visible token media URL to the post API, which safe-fetches the image, uploads it through the signed-in user's AT agent as a PDS blob, and attaches it as the Bluesky external embed thumbnail.

**Rule**: Vault share behavior should be driven by the existing vault token record: title, creator, collection, minted date, token URL, and displayed media. Keep blob uploads bound to the posting user's AT agent, and guard all server-side media fetches with the shared outbound URL safety policy.

---

## 2026-06-04 - Feed actor cards need direct social graph actions

**What happened**: Skywire could follow actors from Discover, but the actor card opened by clicking a creator in the feed had no Follow action. That made the most natural creator-discovery path feel like a dead end.

**Why it mattered**: Skywire's feed is where users encounter artists and token links. If the creator card only shows metadata and posts, users have to hunt elsewhere to build their Bluesky graph, which weakens the Tezos/social connection the client is supposed to make.

**Fix**: The actor feed card now exposes a Be Social-gated Follow button backed by the existing `/api/skywire/follow` endpoint, checks self/following/session states, and updates the inventory harness plus browser test to prove feed-author follow works.

**Rule**: Any Skywire actor card opened from a post should expose the same core graph actions as Discover, using the signed-in user's linked AT account and the existing capability-gated server route.

---

## 2026-06-04 - Playwright harness should run the server module directly

**What happened**: The inventory Playwright webServer command wrapped the harness in a dynamic `node -e` import. During Skywire verification the browser could load static assets, but the harness process then disappeared before app API calls such as `/api/auth/user`, leaving the page on the logged-out desktop and timing out unrelated chat assertions.

**Why it mattered**: A dying harness looks like an app regression even when the mocked routes and compiled client are correct. It also makes isolated reruns unreliable because auth and desktop app availability fail after initial navigation.

**Fix**: The Playwright config now launches `tests/playwright/harness.mjs` directly. The repo is ESM and the Express listener keeps Node alive without a wrapper interval.

**Rule**: Test server launchers should execute the actual server module directly when that module owns its lifecycle. Avoid dynamic-import wrappers for long-running E2E harnesses unless the wrapper is itself tested for process lifetime.

---

## 2026-06-04 - WTF LIVE rooms need owner lifecycle controls and local media readiness

**What happened**: WTF LIVE mirrored the simple public-room URL model, but owners could not temporarily close or delete rooms, the room directory did not expose an obvious Join action, and guest mic enablement had no visual input feedback.

**Why it mattered**: Public room URLs are only simple if hosts can manage their availability without support intervention, and guests need immediate confirmation that local media permissions produced a working input before any real transport layer exists.

**Fix**: WTF LIVE now keeps open public rooms separate from owned rooms, lets owners close/reopen rooms through `is_public`, archives deleted rooms through `archived_at`, adds Join buttons to room cards, and shows a local Web Audio mic level meter after a guest joins.

**Rule**: Public room features must separate public discoverability from owner manageability. Closing should remove guest access without hiding the room from its owner, deletion should archive existing rows, archived rows must still reserve unique slugs, and media controls need visible readiness feedback before claiming a room is usable.

---

## 2026-06-04 - Skywire OAuth popup metadata is not durable permission

**What happened**: Repeated Skywire Chat Add-on fixes proved popup messages, popup close handling, and harness state flips, but still allowed the app to show a popup/new-window Skywire instance as "chat enabled" while the original window and later sessions stayed disabled. The callback could let the OAuth SDK write token material first, then rely on separate route updates for tier/chat metadata, and the client trusted popup completion payloads before forcing a fresh canonical account read.

**Why it mattered**: OAuth permission is account-level state. A URL param, BroadcastChannel payload, or popup-local Skywire instance can only be a hint; if the exact signed-in user plus DID `atproto_accounts` row is not updated with token material, effective scope, requested scope, tier, and chat flag together, the user gets a fake upgrade that disappears or disagrees across windows.

**Fix**: The OAuth callback now resolves effective Skywire grants, performs a final canonical `persistOAuthSessionForDid` write with encrypted token material plus `oauthScopes`, `oauthRequestedScopes`, `oauthPermissionTier`, and `oauthChatEnabled`, and keeps chat capability checks aligned with stored chat consent. The Skywire client no longer severs the popup opener, and completion handlers force a fresh `/api/atproto/me` read before showing Chat Add-on success.

**Rule**: Never verify Skywire OAuth upgrades from popup metadata alone. Tests must prove the callback writes durable account permission and that the original window only announces chat enabled after fresh canonical `/api/atproto/me` state confirms it.
