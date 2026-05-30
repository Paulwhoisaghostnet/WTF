# WTFOS AT Protocol — Inbound Event Guardrail

Status: locked security invariant.

## Principle

**AT Protocol commands, records, and firehose frames must never trigger WTFOS kernel
events unless explicitly authorized by WTFOS design.**

The AT spine is primarily an **outbound mirror** (Postgres canonical → async outbox → PDS).
Inbound AT data is for **read models, identity, and federation** — not for driving rewards,
challenges, wallet actions, or other kernel side effects by default.

Replay is the primary threat: a captured or re-published AT record must not be able to
re-trigger XP, WTF grants, challenge completion, pipeline automation, or any other
`ingestSystemEvent` side effect.

## Data flow (allowed directions)

```text
Kernel action (auth session) ──► Postgres commit ──► ingestSystemEvent ──► outbox ──► PDS
                                      │
                                      └──► challenge / reward evaluation

Firehose / relay replay ──► AppView indexer ──► wtfos_appview_records (read model ONLY)
                              │
                              └── MUST NOT call ingestSystemEvent

AT XRPC passthrough / external repo read ──► UI / analytics / import
                              │
                              └── MUST NOT call ingestSystemEvent unless bridged below
```

## Authorized bridges (fail closed)

Only these kernel bridges may emit `ingestSystemEvent` with `source: atproto|bluesky`.
Each bridge is registered in `server/features/atproto/event-bridge.ts` and must issue an
`AtprotoBridgeCredential` at the call site:

| Bridge | Module | Purpose |
|--------|--------|---------|
| `skywire.adapter` | `server/features/atproto/events.ts` | User-initiated Skywire actions after OAuth scope + session checks |
| `skywire.notifications.sync` | `server/features/atproto/sync.ts` via adapter | Best-effort notification mirror; idempotent by URI+CID eventId |
| `skywire.pipeline` | `server/routes/skywire.ts` | Authenticated pipeline dispatch from WTF UI (not raw AT replay) |

Any other path that attempts `ingestSystemEvent` with an AT-tagged source **throws**
`AtprotoEventAuthorizationError`.

## Replay resistance

1. **No firehose → event path.** The AppView indexer (`appview/indexer.ts`) upserts read
   rows only.
2. **Idempotent eventIds.** AT-derived events use stable keys (`eventType:uri:cid` or
   adapter-defined keys) and `onConflictDoNothing` on both `atproto_events` and
   `challenge_system_events`.
3. **Kernel-first for side effects.** Wallet, board, tz2at provisioning, and similar flows
   emit events from authenticated kernel routes with non-AT sources (`tz2at`, `messageboard`,
   etc.) after Postgres commits — never from replayed AT frames alone.
4. **Scope gates.** Skywire write paths require explicit OAuth scopes (`requireAtprotoCapability`).

## Adding a new AT → event bridge

1. Document the bridge in this file and `00-decisions.md`.
2. Add the bridge kind + allowlisted `eventType` values to `event-bridge.ts`.
3. Issue `issueAtprotoBridgeCredential(bridge, eventType)` at the single authorized call site.
4. Add tests proving unauthorized/replay paths fail closed.
5. Confirm the path is **not** reachable from firehose, public XRPC, or unauthenticated API.

## Related doctrine

- `00-decisions.md` §2 — Postgres canonical, AT mirror
- `01-doctrine-map.md` — kernel-owned spine, additive hooks only
- `server/features/atproto-spine/appview/indexer.ts` — read-model ingestion
