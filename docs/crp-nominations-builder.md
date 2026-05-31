# CRP Nominations — Builder Guide

This guide is for engineers extending or operating the **CRP Nominations** wtfOS desktop app (`crp-nominations` key, route `/crp-nominate`).

## Doctrine Placement

| Concern | Value |
|--------|--------|
| Desktop app key | `crp-nominations` |
| Route | `/crp-nominate` |
| Doctrine domain | Identity And Social |
| Domain guide | `docs/domains/identity-and-social.md` |
| Domain registry | `docs/domains/identity-and-social-registry.md` |
| Package acceptance | `shared/wtf-app-packages.ts` → `desktop:crp-nominations` |
| Admin surface id | `crp-nominations` |
| User manual | `docs/crp-nominations-user-manual.md` |

The app follows the wtfOS **same-pass registration checklist** (`docs/atproto/01-doctrine-map.md`, `docs/constitutional-acceptance.md` P6.CA4):

- Route + desktop icon + start-menu gate
- Admin OS surface with automation handles
- Package acceptance (provenance, permissions, rollback, uninstall)
- Interaction inventory row + E2E fixtures
- AT spine publish through kernel outbox (not a bespoke PDS client in the UI)

## Architecture

```
User (browser) → /crp-nominate UI
              → /api/crp-nominations/* (Express)
              → identity resolver (Objkt, TzKT, tzprofiles, tezos.domains, tz2at, tzbsky, wtfOS DB)
              → publishCrpNomination()
                   ├─ enqueueCrpOutboxRecord → dedicated CRP repo
                   │     ├─ app.wtfos.liveops.crpNomination (canonical fact)
                   │     └─ app.bsky.feed.post (Bluesky-compatible share record)
                   ├─ enqueueSpineRecord → user repo echo (app.wtfos.index.ref) when not anonymous
                   ├─ echoRecordToMaster → master index echo
                   └─ recordAnonymousNominationCredit() when anonymous
              → wtfos_atproto_outbox worker → PDS createRecord
              → AppView indexer (indexFromOutbox) → wtfos_appview_records
```

### AT Protocol records

| Collection | Repo | Purpose |
|------------|------|---------|
| `app.wtfos.liveops.crpNomination` | CRP nominations repo | Structured nomination fact |
| `app.bsky.feed.post` | Same CRP repo | Bluesky-indexable share post |
| `app.wtfos.index.ref` | Nominator wtfOS user repo | User-owned pointer (attributed only) |
| `app.wtfos.index.ref` | Master repo | Spine index echo |

Lexicon: `shared/atproto/lexicons/app.wtfos.liveops.crpNomination.json`  
Zod: `shared/atproto/zod.ts` → `crpNominationSchema`

### Anonymous nominations

When `anonymous: true`:

- CRP repo record sets `anonymous: true` and omits all nominator fields
- Rkey uses `crp-anon-{nominationId}` (no embedded user id)
- Skips user-repo echo
- Inserts one row into `crp_appview_nomination_credits` (user id only — no nominee, category, or timestamp)
- Emits `crp.nomination.submitted.anonymous` without nominee/category metadata

Reward counting: `GET /api/crp-nominations/credits` or `anonymousNominationCredits` on `/mine`.

## Code Map

| Path | Role |
|------|------|
| `client/src/pages/CrpNominate.tsx` | User UI |
| `client/src/routes/page-defs.ts` | Route registration |
| `server/features/crp-nominations/routes.ts` | HTTP API |
| `server/features/crp-nominations/publish.ts` | Publish orchestration |
| `server/features/crp-nominations/records.ts` | Lexicon record builders |
| `server/features/crp-nominations/identity-resolver.ts` | Nominee identity merge |
| `server/features/crp-nominations/crp-repo.ts` | Dedicated repo env config |
| `server/features/crp-nominations/outbox.ts` | Outbox enqueue |
| `server/features/crp-nominations/bsky-post.ts` | Bluesky share post builder |
| `server/features/crp-nominations/share-intents.ts` | X/Bluesky intent URLs |
| `server/features/crp-nominations/reward-credits.ts` | Anonymous credit ledger |
| `server/features/crp-nominations/mcp.ts` | Paired MCP tools (scoped + rate limited) |
| `server/features/crp-nominations/events.ts` | SystemEvent emit helper |
| `shared/crp-categories.ts` | Official Tezos Commons categories |
| `drizzle/0095_crp_appview_nomination_credits.sql` | Anonymous credits table |

## Environment

Required for live publish (otherwise submit returns `503 crp_repo_not_configured`):

```env
ATPROTO_SPINE_ENABLED=true
CRP_NOMINATIONS_REPO_DID=
CRP_NOMINATIONS_REPO_PDS_URL=
CRP_NOMINATIONS_REPO_IDENTIFIER=
CRP_NOMINATIONS_REPO_PASSWORD=
CRP_NOMINATIONS_REPO_HANDLE=
```

Aliases with `WTFOS_CRP_NOMINATIONS_REPO_*` prefix are supported.

Spine master repo credentials (`WTFOS_PRIMARY_ATPROTO_*`) are used for master echo. User echo requires a provisioned wtfOS user repo via tz2at spine provisioning.

For Bluesky public visibility of share posts, ensure the CRP repo PDS is crawlable (`WTFOS_CRAWL_RELAYS`, `WTFOS_FEDERATED_PDS_HOSTS`) or host the CRP account on an indexed PDS.

## API Surface

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/crp-nominations/categories` | No | Official CRP categories |
| GET | `/api/crp-nominations/status` | No | Repo configuration probe |
| POST | `/api/crp-nominations/viewed` | Session | Record app open (`crp.nomination.viewed`) |
| POST | `/api/crp-nominations/resolve` | Session | Merge nominee identity sources |
| POST | `/api/crp-nominations/submit` | Session | Publish nomination (+ optional `anonymous`) |
| GET | `/api/crp-nominations/mine` | Session | Attributed nominations + anonymous credit count |
| GET | `/api/crp-nominations/credits` | Session | Anonymous nomination credit count |
| GET | `/api/crp-nominations/share` | Session | Share intent for owned nomination URI |

## System Events

| Handle | When |
|--------|------|
| `crp.nomination.viewed` | App opened |
| `crp.nomination.resolve` | Nominee lookup succeeded (browser or MCP) |
| `crp.nomination.submitted` | Attributed nomination queued |
| `crp.nomination.submitted.anonymous` | Anonymous nomination queued (no nominee/category in metadata) |
| `crp.nomination.share_x` | X share intent opened for owned nomination |
| `crp.nomination.share_bsky` | Bluesky share intent opened for owned nomination |
| `crp.nomination.user_echo` | User-repo index.ref enqueued |
| `crp.nomination.bsky_post` | Bluesky share post enqueued |
| `mcp.crp.read` | Paired MCP read tool invoked |
| `mcp.crp.nomination_submitted` | Paired MCP submit tool invoked |
| `crp.nomination.mcp.rate_limited` | CRP MCP per-token rate limit hit |
| `wtfos.atproto_outbox.enqueued` | Outbox row created |
| `wtfos.atproto_outbox.published` | Outbox worker published to PDS |

## MCP (paired agents)

CRP Nominations exposes scoped MCP tools through the standard WTF MCP server (`/mcp`, bearer `wtf_mcp_...`).

| Tool | Scope | Rate limit (default) |
|------|-------|----------------------|
| `wtf_list_crp_categories` | `crp-nominations:read` | 60/min per token |
| `wtf_get_crp_nomination_status` | `crp-nominations:read` | 60/min per token |
| `wtf_resolve_crp_nominee` | `crp-nominations:read` | 60/min per token |
| `wtf_list_my_crp_nominations` | `crp-nominations:read` | 60/min per token |
| `wtf_get_crp_nomination_credits` | `crp-nominations:read` | 60/min per token |
| `wtf_submit_crp_nomination` | `crp-nominations:write` | 20/min per token |

Optional env overrides:

```env
MCP_CRP_READ_RATE_LIMIT_PER_MINUTE=60
MCP_CRP_WRITE_RATE_LIMIT_PER_MINUTE=20
```

**Liability:** MCP agents act on behalf of the WTF user who issued the paired token. All CRP MCP activity is attributed to that user id in `challenge_system_events` with `agentActingOnBehalfOfUser: true`, `mcpTokenPrefix`, and `mcpToolName` metadata. The token owner remains responsible for agent behavior and may be held liable for abuse.

Registration checklist items satisfied by this module:

- `server/lib/mcp-scope-policy.ts` → `crp-nominations:read`, `crp-nominations:write`
- `server/lib/wtf-access.ts` → browser/API routes + scope groups
- `server/lib/wtf-mcp.ts` → tool catalog sync
- `server/routes/mcp.ts` → `mcp.crp.*` inventory events
- `docs/wtfos-mcp-doctrine.md` and `docs/wtfos-sdk.md` → CRP pathway entries

Inventory source of truth: `.agents/docs/live/user-interaction-inventory.md`

## E2E / Inventory

- Route fixture: `tests/e2e/inventory/route-fixtures.mjs` → `/crp-nominate`
- Domain workflow: `tests/e2e/inventory/domain-workflows.mjs` → Identity And Social probes

Run before shipping:

```bash
npm run test:e2e:inventory:coverage
npx tsx --test server/features/crp-nominations/records.test.ts shared/wtf-app-packages.test.ts
```

## Rollback / Uninstall

Per package acceptance:

- **Rollback:** disable the desktop gate via `PUT /api/admin/apps/desktop/crp-nominations` or redeploy prior commit
- **Uninstall:** gate off; preserves `wtfos_appview_records`, outbox history, and anonymous credit rows

## Extending Safely

1. Material interaction changes → update inventory + E2E fixtures in the same pass
2. New event handles → add to admin surface `automationHandles` and domain registry
3. Lexicon changes → update JSON + Zod + run `shared/atproto/lexicon-parity.test.ts`
4. Never post to Bluesky on behalf of users; use intent URLs only
5. Never embed nominator identity in anonymous CRP repo records or anonymous credit rows
