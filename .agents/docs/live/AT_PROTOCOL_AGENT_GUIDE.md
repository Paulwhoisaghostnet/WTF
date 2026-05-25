# AT Protocol Agent Guide

Updated: 2026-05-25

This guide teaches WTF agents enough AT Protocol to work on Skywire without guessing. It is a synthesis of official AT Protocol and Bluesky documentation, plus WTF-specific lessons from the Skywire implementation.

Do not treat this file as a replacement for the protocol docs. Treat it as the local field manual. When implementing auth, permissions, repository writes, identity, sync, or Bluesky client behavior, verify against the linked primary source first.

## Required Sources

Read these before changing Skywire authorization, AT repo records, or permission tiering:

- AT Protocol overview: https://atproto.com/specs/atp
- Understanding atproto: https://atproto.com/guides/understanding-atproto
- Permission Sets: https://atproto.com/guides/permission-sets
- Permission Requests: https://atproto.com/guides/permission-requests
- Permissions spec: https://atproto.com/specs/permission
- OAuth spec: https://atproto.com/specs/oauth
- OAuth Patterns: https://atproto.com/guides/oauth-patterns
- Bluesky OAuth client implementation: https://docs.bsky.app/docs/advanced-guides/oauth-client
- Bluesky OAuth improvements: https://docs.bsky.app/blog/oauth-improvements
- Reading Data: https://atproto.com/guides/reading-data
- Data Model: https://atproto.com/specs/data-model
- Repository spec: https://atproto.com/specs/repository
- Lexicon spec: https://atproto.com/specs/lexicon
- DID spec: https://atproto.com/specs/did
- Handle spec: https://atproto.com/specs/handle
- AT URI scheme: https://atproto.com/specs/at-uri-scheme
- The AT Stack: https://atproto.com/guides/the-at-stack
- Self-hosting: https://atproto.com/guides/self-hosting
- Bluesky API hosts and auth: https://docs.bsky.app/docs/advanced-guides/api-directory
- Bluesky viewing feeds: https://docs.bsky.app/docs/tutorials/viewing-feeds
- Bluesky likes/reposts: https://docs.bsky.app/docs/tutorials/like-repost
- Bluesky custom feeds: https://docs.bsky.app/docs/tutorials/custom-feeds
- Bluesky thread gates: https://docs.bsky.app/docs/tutorials/thread-gates

## Prime Directives for WTF Agents

1. Use permission sets and granular permissions as the default mental model. `transition:generic` is a compatibility fallback, not the product ideal.
2. Never request broader AT Protocol OAuth scopes just because a route currently works with broad scopes. Ask what feature actually needs the permission.
3. Keep identity, read, action, creator, and full-control tiers separate in UI and server policy.
4. Prefer DIDs for durable identity and handles for display/input. Handles can move; DIDs are the stable account IDs.
5. Normalize all actor inputs at route boundaries. Treat handles, DIDs, AT URIs, and record keys as protocol identifiers, not casual strings.
6. Use public AppView reads when possible for public data. Use authenticated PDS/OAuth sessions when the feature needs user context, viewer state, private preferences, or writes.
7. Do not confuse Bluesky with AT Protocol. Bluesky is one app using `app.bsky.*` Lexicons and AppView services. Skywire can use AT Protocol beyond Bluesky by defining or writing WTF-native Lexicons.
8. Do not build dead identity forms. If a PDS requires an official signup path, hand users to that path instead of presenting a local form that cannot complete.
9. Explicit unlink is the only user-facing way to disconnect a persisted Skywire account. OAuth SDK cache deletion is not unlink.
10. Add inventory/E2E updates whenever AT Protocol work changes a user interaction, API probe, route, normalized event, or Skywire capability.

## What AT Protocol Is

AT Protocol is a protocol for open social applications. The design centers on self-authenticating identity, user-owned repositories, Lexicon-defined schemas and APIs, and application-specific aggregation services.

At a practical level:

- Users publish records into per-user repositories.
- Those repository changes sync through PDSes, relays, firehoses, and application services.
- Apps define record types and APIs with Lexicons.
- Clients read/write through HTTP APIs called XRPC.
- OAuth authorizes apps to act for users.
- DIDs identify accounts durably.
- Handles are human-readable DNS-like names that resolve to DIDs.

AT Protocol itself does not define "a post", "a follow", or "an avatar" globally. Those are application-layer conventions. Bluesky defines many of them under `app.bsky.*`.

## The Stack

### PDS

Personal Data Servers host accounts. They handle authentication, key management, repositories, blobs, and many client requests. In OAuth terms, the PDS is often the resource server. In Bluesky-hosted deployments, an entryway may sit in front of many PDSes.

Skywire rule:

- Persist the user's PDS/audience/resource information with their AT account row.
- Do not assume every user is on `bsky.social`.
- If an account migrates PDSes, future work must resolve DID-to-PDS rather than relying forever on the first stored endpoint.

### Relay

Relays aggregate repository events from many PDSes and publish a unified firehose. Relays do not interpret the app semantics of records; they move events.

Skywire rule:

- A full Bluesky-style client can rely on AppView APIs.
- WTF-native AT features that need network-wide indexing should eventually use a relay/Tap/AppView strategy, not per-user polling.

### Tap

Tap is a higher-level sync service that can backfill repositories and then stream filtered events from a relay. It can filter by DID, collection, or full-network mode.

Skywire rule:

- Use Tap-like architecture for future WTF-native feeds if Skywire needs a Tezos/WTF social index beyond Bluesky AppView endpoints.

### AppView

AppViews understand application records and produce user-facing views: feeds, profiles, search, counts, graph summaries, and other aggregations.

Bluesky's AppView is what makes `app.bsky.*` client behavior feel like Bluesky rather than raw repo browsing.

Skywire rule:

- Use `https://public.api.bsky.app` for unauthenticated public Bluesky reads where it fits.
- Use authenticated AppView/PDS calls for home timeline, viewer state, notifications, follows, likes, reposts, and personalized behavior.
- If Skywire invents WTF-native AT records, plan the corresponding AppView/indexer before promising rich feeds.

### Labelers

Labelers publish moderation labels. Labels are separate metadata, signed and distributed outside user repositories.

Skywire rule:

- Do not treat labels as ordinary user records.
- If Skywire displays third-party content at scale, moderation/label support becomes product infrastructure, not polish.

## Identity: DIDs and Handles

### DIDs

DIDs are the durable account identifiers. AT Protocol currently blesses `did:plc` and `did:web`.

Important rules:

- DIDs are case-sensitive.
- The DID document declares service endpoints, keys, and `alsoKnownAs` handle claims.
- The DID remains the stable identity even when handles change.
- Implementations should distinguish invalid DID syntax, unsupported DID method, and supported DID resolution failure.

Skywire rule:

- Store linked account identity by DID.
- Use handles for display and user input.
- Use DIDs in durable references and database uniqueness.
- Never percent-encode a DID inside a Bluesky profile URL path. Prefer the author handle for source links; if falling back to DID, keep `did:plc:...` readable.

### Handles

Handles are DNS hostnames used as usernames. They resolve to DIDs through either:

- DNS TXT at `_atproto.<handle>` with a `did=` value.
- HTTPS well-known at `https://<handle>/.well-known/atproto-did`.

Handle verification is bidirectional:

1. Resolve handle to DID.
2. Resolve DID document.
3. Confirm DID claims that handle in `alsoKnownAs`.

Skywire rule:

- WTF-hosted handle claims must serve `/.well-known/atproto-did`.
- Tezos aliases like `.tez` are identity hints, not automatically valid AT handles unless they also satisfy handle resolution.
- Handle claim UI must distinguish "Tezos alias", "WTF subdomain", and "AT-compliant handle".

## Data Model

AT Protocol records and messages share a common data model with JSON and CBOR representations. Important concepts:

- Records often include `$type`, naming the Lexicon schema.
- CBOR is used when data must be hashed, signed, or stored efficiently.
- CIDs identify content-addressed blocks.
- Blob references represent files such as images or videos.
- Field names starting with `$` are reserved for protocol/data-model use.
- `null` and missing fields are semantically different.
- False-y values like `false`, `0`, empty arrays, and empty objects are also distinct from null/missing.

Skywire rule:

- Normalize upstream payloads before React renders them.
- Do not use truthiness alone to interpret AT records.
- Preserve `uri`, `cid`, `$type`, author DID, author handle, and timestamps when normalizing feed cards.
- Do not invent custom `$` fields for WTF data.

## Repositories and Records

Each account has a public repository. Repositories are content-addressed, signed, and structured as a Merkle Search Tree. In app code, most work happens at the record level:

- Collection: an NSID such as `app.bsky.feed.post`.
- Record key/rkey: identifies one record inside a collection.
- AT URI: identifies a repo, collection, and optional rkey.
- CID: content hash for record content.

Example AT URI shape:

```text
at://did:plc:example/app.bsky.feed.post/3kabc
```

Skywire rule:

- Treat `at://` URIs as protocol references.
- Prefer DID-based AT URIs for durability.
- Use handle-based AT URIs only for user-friendly display or temporary inputs.
- Convert Bluesky URLs to AT URIs carefully.
- Do not assume all `app.bsky.feed.post` records appear immediately in AppView feeds; AppView indexing can lag or reject invalid records.

## Lexicons and NSIDs

Lexicon is the schema language for records, XRPC endpoints, and event stream messages. NSIDs are namespaced identifiers such as:

- `com.atproto.repo.createRecord`
- `app.bsky.feed.post`
- `app.bsky.graph.follow`
- `app.wtfgameshow.skywire.signal`

Lexicons can define:

- Records
- Queries
- Procedures
- Subscriptions
- Permission sets
- Tokens and refs

Skywire rule:

- WTF-native records should live under a WTF-controlled namespace, not under `app.bsky.*`.
- Before writing a custom record collection, document:
  - Lexicon ID
  - record schema
  - intended readers/indexers
  - OAuth permissions required
  - AppView/indexing plan
  - migration/versioning strategy

## XRPC

XRPC is HTTP with routes defined by Lexicons.

Patterns:

- `com.atproto.*` covers protocol/account/repository operations.
- `app.bsky.*` covers Bluesky application records and API endpoints.
- RPC permissions can grant authenticated calls to remote service endpoints.

Skywire rule:

- Use official SDK methods when available.
- If calling XRPC directly, parse and bound inputs with zod first.
- Map XRPC/PDS errors to user-actionable 4xx/502 responses; do not let expected upstream policy errors become generic 500s.

## Reading Data

Ways to read:

- List records from a user's repo.
- Get a specific record by rkey.
- Resolve a handle to DID.
- Use public AppView APIs for public Bluesky data.
- Use authenticated calls for personalized timeline, viewer state, notifications, preferences, and writes.

Skywire rule:

- Home timeline should be the user's personalized Bluesky timeline, not their own posts.
- WTF feed should be the official WTFgameshow actor feed.
- Tezos feed should be curated official Tezos actor feeds, not generic keyword search.
- Discover should use graph-backed suggestions and open author selections in the canonical Actor Feed tab.

## OAuth: Core Model

AT Protocol uses a specific OAuth profile:

- Authorization code flow only.
- PKCE is required.
- PAR is required.
- DPoP-bound access tokens are required.
- Client metadata is public and fetched by URL.
- No centralized app registration is assumed.
- `atproto` scope is required for atproto OAuth sessions.
- Token responses must include granted scopes and `sub` should be the account DID.

WTF architecture:

- WTF is a web service/BFF-style client.
- Store AT OAuth tokens server-side, encrypted.
- Browser session auth is separate from AT OAuth.
- AT OAuth callback must be able to read pending sessions before account rows exist.
- The SDK session-store delete callback is cache invalidation, not user unlink.

## Permission System

Permission resources:

- `repo`: write access to records in the account repo.
- `rpc`: authenticated calls to remote API endpoints.
- `blob`: upload media blobs.
- `identity`: DID document and handle control.
- `account`: hosting/account details like email.
- `include`: reference a permission set.

The Permission Sets guide is mandatory reading. It explains why apps should avoid broad access and request only the resources they actually need. Permission sets can bundle related permissions with human-readable titles/details so consent screens are understandable.

### Granular Permissions

Examples:

```text
atproto
repo:app.bsky.feed.like
repo:app.bsky.feed.repost
repo:app.bsky.feed.post?action=create&action=delete
blob:image/*
rpc:app.bsky.actor.getProfile?aud=did:web:api.bsky.app#bsky_appview
identity:handle
account:email
```

Notes:

- `repo:<collection>` grants write access to that collection.
- `repo:<collection>?action=create&action=update` narrows record actions.
- `blob:*/*` grants broad blob upload.
- `rpc` permissions must name endpoint(s) and/or audience. Do not treat one `rpc:*` as a casual read-all permission.
- `identity:*` is very powerful.
- `account:email?action=manage` is much stronger than `account:email`.

### Permission Sets

Permission sets are Lexicon schemas with user-facing descriptions and a list of permissions. They are referenced with `include:<nsid>`.

Use them when:

- A feature needs many permissions.
- Users would otherwise see a long opaque list.
- WTF owns the namespace and can publish a clear consent description.
- The permission cluster is stable enough to version.

Do not use them to hide broad permissions. They should clarify consent, not launder it.

### Progressive Scope Requests

AT Protocol supports starting with a smaller scope set and requesting more later. Client metadata declares the maximum scopes the client may request, while individual authorization flows can request a subset.

Skywire rule:

- Build scope tiers.
- Store granted scopes.
- Gate UI/actions by actual granted scopes, not by the user's selected label.
- When the user tries a feature beyond their current grant, offer an explicit upgrade OAuth flow.
- After callback, replace or update the stored session and scopes.

## Transitional Scopes

Transitional scopes exist for compatibility with older app-password-style access:

- `transition:generic`
- `transition:chat.bsky`
- `transition:email`

### `transition:generic`

Broad account/PDS permissions roughly equivalent to old app password access.

It can include:

- create/update/delete any repo record type
- upload blobs
- read/write personal preferences
- proxy or call most Lexicon endpoints
- generate service auth tokens for accessible endpoints

It does not include:

- account deletion/deactivation
- account migration
- handle/email management
- DMs/chat

Skywire rule:

- This is current Skywire behavior.
- Label it honestly as Full/Broad.
- Do not make it the quiet default once tiered scopes exist.

### `transition:chat.bsky`

Adds Bluesky DM/chat access. It depends on `transition:generic`.

Skywire rule:

- Do not include this in any default tier.
- If Skywire ever supports DMs, make it a separate explicit consent tier.

### `transition:email`

Allows access to account email via `com.atproto.server.getSession`.

Skywire rule:

- Do not request this unless WTF product actually needs the AT account email.
- Users may decline email permissions while granting other scopes, so always inspect granted scopes.

## Recommended Skywire Permission Tiers

These are proposed product tiers. Verify exact scope strings against current PDS/AppView support before implementation.

### Tier 1: Read Only

Purpose:

- Connect identity.
- Read public profiles.
- Read public actor feeds.
- Read public WTF/Tezos curated feeds.
- Search actors/posts where public AppView allows it.

Scope direction:

```text
atproto
rpc:app.bsky.actor.getProfile?aud=did:web:api.bsky.app#bsky_appview
rpc:app.bsky.feed.getAuthorFeed?aud=did:web:api.bsky.app#bsky_appview
rpc:app.bsky.feed.searchPosts?aud=did:web:api.bsky.app#bsky_appview
rpc:app.bsky.actor.searchActors?aud=did:web:api.bsky.app#bsky_appview
```

Open question:

- Personalized home timeline may require more than public AppView read. Test `app.bsky.feed.getTimeline` with granular RPC scope before promising full Home in read-only.

UI behavior:

- Show read tabs.
- Hide/disable like, repost, follow, compose, reply, quote, signal publishing, and preferences writes.

### Tier 2: Social Actions

Purpose:

- Everything in Read Only.
- Follow/unfollow.
- Like/unlike.
- Repost/unrepost.
- Like feeds if supported.

Scope direction:

```text
atproto
repo:app.bsky.feed.like
repo:app.bsky.feed.repost
repo:app.bsky.graph.follow
```

Possibly add granular RPC scopes for the reads used in the UI.

UI behavior:

- Enable like/repost/follow actions.
- Keep compose/reply/quote/media disabled.
- This is likely the recommended default for normal Skywire users.

### Tier 3: Creator

Purpose:

- Everything in Social Actions.
- Compose posts.
- Reply.
- Quote post.
- Upload media.
- Possibly edit/delete own Skywire-created records where lexicon allows.

Scope direction:

```text
atproto
repo:app.bsky.feed.post
repo:app.bsky.feed.like
repo:app.bsky.feed.repost
repo:app.bsky.graph.follow
blob:image/*
```

If video is needed:

```text
blob:video/*
```

or broader:

```text
blob:*/*
```

UI behavior:

- Enable compose, reply, quote, media upload.
- Keep handle/email/account settings out unless separately requested.

### Tier 4: Full Skywire

Purpose:

- Current full client behavior and maximum compatibility.
- WTF-native custom repo records.
- Broad AppView/PDS access while the granular Bluesky permission ecosystem matures.

Scope:

```text
atproto transition:generic
```

Optional, only if explicitly needed:

```text
transition:email
```

Avoid unless the product adds DMs:

```text
transition:chat.bsky
```

UI behavior:

- Show full Skywire.
- Clearly state that this is broad PDS/repo access comparable to an app-password-era full client.

## Comparing to X/Twitter OAuth Tiers

Old X/Twitter OAuth concepts were product-bucket permissions like read, write, DM, offline. AT Protocol is not the same.

Mapping for user explanation:

| X-style idea | AT Protocol equivalent |
| --- | --- |
| Sign in only | `atproto` |
| Read public profile/content | public AppView reads or granular `rpc:*` |
| Personalized reads | authenticated RPC scopes or broader session |
| Like/repost/follow | `repo:app.bsky.feed.like`, `repo:app.bsky.feed.repost`, `repo:app.bsky.graph.follow` |
| Post/reply/quote | `repo:app.bsky.feed.post` |
| Media upload | `blob:image/*`, `blob:video/*`, or `blob:*/*` |
| DM access | `transition:chat.bsky` plus `transition:generic` |
| Email access | `transition:email` or granular `account:email` depending support |
| Broad app password style | `transition:generic` |

Do not tell users AT scopes are "just like X." Say Skywire offers familiar tiers, but AT Protocol permissions are collection/API based under the hood.

## Bluesky `app.bsky.*` Collections Skywire Cares About

Common record collections:

- `app.bsky.actor.profile`: profile record
- `app.bsky.feed.post`: posts, replies, quotes
- `app.bsky.feed.like`: likes
- `app.bsky.feed.repost`: reposts
- `app.bsky.feed.generator`: custom feed definitions
- `app.bsky.feed.threadgate`: reply controls for a post
- `app.bsky.graph.follow`: follows
- `app.bsky.graph.block`: blocks
- `app.bsky.graph.list`: lists
- `app.bsky.graph.listitem`: list membership

Common AppView/XRPC reads:

- `app.bsky.actor.getProfile`
- `app.bsky.actor.searchActors`
- `app.bsky.feed.getTimeline`
- `app.bsky.feed.getAuthorFeed`
- `app.bsky.feed.searchPosts`
- `app.bsky.feed.getPostThread`
- `app.bsky.feed.getFeed`
- `app.bsky.feed.getFeedGenerator`
- `app.bsky.notification.listNotifications`
- `app.bsky.graph.getFollows`
- `app.bsky.graph.getFollowers`

Common protocol/PDS writes:

- `com.atproto.repo.createRecord`
- `com.atproto.repo.deleteRecord`
- `com.atproto.repo.putRecord`
- `com.atproto.repo.uploadBlob`

## WTF-Native AT Protocol Opportunities

Skywire should become a Bluesky-quality client, but WTF can use AT Protocol beyond Bluesky.

Potential WTF-native records:

- `app.wtfgameshow.skywire.signal`: portable quests/drops/proofs/broadcasts.
- `app.wtfgameshow.quest.claim`: public claim/proof intent.
- `app.wtfgameshow.drop.receipt`: portable drop receipt.
- `app.wtfgameshow.tezos.alias`: user-declared Tezos alias evidence.
- `app.wtfgameshow.game.result`: game result proof.
- `app.wtfgameshow.club.membership`: portable club/membership attestation.

Rules before shipping custom records:

- Publish or document the Lexicon.
- Decide read path: direct repo reads, relay/Tap indexer, or WTF AppView.
- Define moderation behavior.
- Define schema versioning.
- Define OAuth scope tier.
- Add inventory handles and E2E probes.

## Skywire Implementation Map

Current important files:

- `server/features/atproto/oauth.ts`: OAuth client/session handling.
- `server/routes/atproto.ts`: registration, OAuth start/callback, profile/handle claims, unlink.
- `server/routes/skywire.ts`: feeds, actors, follows, actions, WTF-native signals.
- `server/features/atproto/identity.ts`: handles, DIDs, AT URIs, source URLs.
- `server/features/atproto/events.ts`: normalized AT system events.
- `server/features/atproto/sync.ts`: background AT sync.
- `client/src/pages/Skywire.tsx`: Skywire app UI.
- `client/src/pages/Profile.tsx`: linked Skywire identity in profile.
- `shared/schema-social.ts`: `atprotoAccounts`, claims, OAuth/token fields.
- `server/features/atproto/skywire-policy.test.ts`: policy guardrails.
- `.agents/docs/live/user-interaction-inventory.md`: interaction inventory.

Current shipped scope:

```text
atproto transition:generic
```

Source of current constant:

```text
server/features/atproto/oauth.ts
```

## Implementation Rules for Permission Tiering

When implementing tiered permissions:

1. Define a small enum of Skywire permission tiers.
2. Map each tier to a scope builder, not a hardcoded scattered string.
3. Ensure public OAuth client metadata advertises the maximum scope set the app may request.
4. Let OAuth start request the selected tier's subset.
5. Store:
   - selected tier
   - requested scope
   - granted scope returned by token response
   - granted-at time
6. On every action, check actual granted scopes, not selected tier.
7. Hide or disable actions if missing scopes.
8. Offer "Upgrade Skywire permissions" when the user clicks a gated action.
9. Make upgrades explicit OAuth flows.
10. Keep unlink independent from tier changes.
11. Add a policy test that blocks accidental fallback to `transition:generic` for lower tiers.
12. Add inventory probes for any new OAuth tier endpoints or profile/Skywire controls.

## Capability Gating Matrix

| Skywire feature | Minimum tier | Notes |
| --- | --- | --- |
| Connect identity | Read Only | `atproto` |
| Show linked handle/DID | Read Only | profile metadata is generally public |
| Public actor profile | Read Only | public AppView read may be enough |
| Public author feed | Read Only | public AppView read may be enough |
| Home timeline | Read Only or Social Actions | verify granular `getTimeline` behavior |
| Discover follows | Read Only or Social Actions | `getFollows` may require authenticated user context |
| Like/unlike | Social Actions | writes `app.bsky.feed.like` |
| Repost/unrepost | Social Actions | writes `app.bsky.feed.repost` |
| Follow/unfollow | Social Actions | writes `app.bsky.graph.follow` |
| Compose post | Creator | writes `app.bsky.feed.post` |
| Reply | Creator | writes `app.bsky.feed.post` with reply refs |
| Quote | Creator | writes `app.bsky.feed.post` with embed |
| Upload image | Creator | `blob:image/*` |
| Upload video | Creator | `blob:video/*` or broader |
| Publish WTF Skywire signal | Creator or Full | custom `app.wtfgameshow.*` repo write |
| Preferences write | Full | currently broad under `transition:generic`; granular path must be verified |
| DMs | Separate DM tier | do not bundle with Full unless product explicitly decides |
| Email read | Separate email add-on | `transition:email` or `account:email` |
| Handle changes | Separate identity add-on | `identity:handle`; high-risk |

## Error Handling Rules

For AT/PDS errors:

- Catch XRPC errors.
- Log sanitized status, error code, and message.
- Do not log access tokens, refresh tokens, DPoP keys, raw auth headers, or full OAuth state.
- Translate upstream policy rejections into 4xx or 502 JSON.
- Tell the user what action can fix it.

Known product traps:

- PDS can require phone verification while not exposing phone-code request through the public endpoint.
- OAuth callback can complete before an account row exists.
- Token restore must preserve `sub`, `iss`, `aud`, token type, scope, access token, refresh token, DPoP key, and expiration.
- Session-store delete is not unlink.
- Public AppView reads are not the same as authenticated viewer-state reads.
- Source links should prefer handles and avoid encoded DID path segments.

## Testing Rules

Required for AT Protocol auth/permission work:

- `npx tsx --test server/features/atproto/identity.test.ts`
- `npx tsx --test server/features/atproto/skywire-policy.test.ts`
- `npm run check -- --pretty false`
- `npm run test:e2e:inventory:coverage`
- `npm run test:e2e:inventory` for UI/interaction changes

Add specific tests for:

- scope builder output
- tier-to-scope mapping
- action gating by granted scope
- OAuth start passes selected scope
- callback stores granted scope
- metadata includes maximum supported scopes
- lower tiers do not request `transition:generic`
- missing scope returns reconnect/upgrade action instead of raw SDK error

## Production Rules

Before calling Skywire AT work live:

- Confirm the relevant commit is on `main`.
- Confirm the public OAuth client metadata is live before code that requests new scopes.
- Confirm Quality Gates pass.
- Confirm Hetzner deploy succeeds.
- Confirm `/api/health` reports the new commit.
- Smoke `/skywire`, `/profile`, and auth-safe Skywire endpoints.
- Check production logs for `skywire`, `atproto`, `oauth`, `scope`, `invalid DID`, `forbidden`, `Client authentication method`, `This session was deleted`, and `Token set does not match`.

## Glossary

- **Actor**: A user/account identity in Bluesky/AT Protocol context.
- **AppView**: Service that indexes/interprets repo records for a specific app experience.
- **AT URI**: `at://` URI identifying an account repo, collection, and optional record key.
- **Blob**: Uploaded binary media referenced from records.
- **CID**: Content identifier/hash for content-addressed data.
- **Collection**: Record namespace, usually an NSID such as `app.bsky.feed.post`.
- **DID**: Durable decentralized identifier for an account.
- **DPoP**: Proof-of-possession binding for OAuth tokens; required in atproto OAuth.
- **Firehose**: Event stream of repository changes.
- **Handle**: DNS-style mutable username that resolves to a DID.
- **Lexicon**: Schema language for records, XRPC endpoints, subscriptions, and permission sets.
- **NSID**: Namespaced identifier such as `app.bsky.feed.post`.
- **PDS**: Personal Data Server hosting account data and repository.
- **Permission Set**: Lexicon-defined bundle of permissions referenced with `include:`.
- **Relay**: Network service that aggregates repository events.
- **Repo**: Per-account public repository of records.
- **Rkey**: Record key inside a collection.
- **Tap**: Service/library pattern for backfill plus filtered firehose consumption.
- **Transition scope**: Broad compatibility OAuth scope from early atproto/app-password behavior.
- **XRPC**: HTTP API style defined by Lexicons.

