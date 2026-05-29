# wtfOS AT Protocol Spine — Go-Live Checklist & Pre-Mortem (S5.4)

This closes the SOW. It re-runs the pre-mortem against the **implemented** spine (not the
original plan) and gives an operator a single gated checklist for enabling federation.

## Pre-Mortem

Mode: deep
Scope: enabling `ATPROTO_SPINE_ENABLED=true` + the `wtfos-atproto` Docker profile in
production, turning wtfOS into an AT Protocol client/AppView while keeping the OS unchanged.

> Imagine it is three months from now and this work failed. Why did it fail?

### Tigers

| Severity | Risk | Evidence | Mitigation Checked | Suggested Fix |
| --- | --- | --- | --- | --- |
| high | Private DM encryption key lost → all DM envelopes in `private.wtfos.me` permanently unrecoverable | `private-pds.ts` derives the key from `WTFOS_PRIVATE_PDS_ENC_KEY`; envelopes are AES-256-GCM | Backup runbook now lists the key as a secrets-manager item, drill flags it as required when spine is on | Store key in secrets manager + verify via `npm run atproto:backup-drill` before enabling |
| high | New `wtfos_appview_records` / `wtfos_appview_cursor` tables not migrated → indexer/read-API errors in prod | Tables added to `shared/schema-atproto-appview.ts`; all queries guard `42P01` (missing relation) and degrade to empty | DB push (`drizzle-kit push` / boot backfill) must run; code already no-ops if absent | Run schema push as part of release; confirm tables exist post-deploy |
| medium | Enabling the flag floods the outbox with `skipped`/`queued` rows for users with no repo | `enqueueSpineRecord` records `skipped` when no target; emit fns early-return when `!hasRepo` | Emit fns verified to early-return without writing rows when identity has no repo | Provision tracking repos before enabling broad emission; monitor `getOutboxStats()` |

### Elephants

| Severity | Concern | Why It Matters | Suggested Fix |
| --- | --- | --- | --- |
| medium | Federation is irreversible-ish: once external relays crawl `pds.wtfos.me`, public records are copied off-platform | Deletes propagate but caches/forks may persist | Keep `WTFOS_ACCEPT_EXTERNAL=false` + delay `requestCrawl` until content/labeling reviewed |
| low | CAR firehose decoding is injected, not bundled | External/federated indexing is inert until a decoder is supplied at deploy | Acceptable: our own records index via `indexFromOutbox`; wire `@atproto/repo` decoder when external indexing is needed |

### Paper Tigers

| Concern | Why It Is Probably Fine | Evidence |
| --- | --- | --- |
| "This changes app behavior / breaks the OS" | All hooks are additive, `void ...catch()` best-effort, and flag-gated off by default | `acceptance.test.ts` asserts spine off by default; board/W/DM writes proceed regardless of emit outcome |
| "Lexicon drift between JSON and types" | Parity test enforces sync | `shared/atproto/lexicon-parity.test.ts` |
| "AppView read API collides with existing routes" | Router owns only new `/api/atproto/appview/*` + `/xrpc/app.wtfos.appview.*` paths and 404s when disabled | `appview/router.ts` |

### False Alarms

| Initial Concern | Why It Was Discarded |
| --- | --- |
| "W feed must be rewritten onto AT" | W activity already mirrors via the existing tz2at outbox (`isWtfosEventExportable`) + new AppView indexer; rewriting reads would change behavior and violate doctrine |
| "Need a monorepo migration for the new packages" | Repo uses `tsconfig` path aliases + isolated typechecks; `@wtfos/atproto-spine`, `@wtfos/sdk`, `@wtfos/mcp` follow the same pattern |

### Recommended Next Step

Proceed to staged enablement. No unmitigated high-severity tigers remain *as long as* the
secrets + schema-push items on the checklist below are completed before flipping the flag.

## Go-Live Checklist

Pre-flight (do not flip the flag until all checked):

- [ ] DNS + TLS live for `wtfos.me`, `pds.wtfos.me`, `relay.wtfos.me`, `plc.wtfos.me`,
      `mod.wtfos.me`, `media.wtfos.me`, `private.wtfos.me` (see `docs/atproto/02-dns-tls.md`).
- [ ] Secrets set: PDS admin passwords, `PLC_ROTATION_KEY`, `WTFOS_PRIVATE_PDS_ENC_KEY`.
- [ ] `npm run atproto:backup-drill` passes (required checks green).
- [ ] Schema push applied; `wtfos_appview_records` + `wtfos_appview_cursor` exist.
- [ ] `wtfos-atproto` Docker profile healthy in staging; Caddy `Caddyfile.wtfos-atproto` imported.
- [ ] Full typecheck (`npm run check`) and spine tests (`npm run atproto-spine:kernel:test`,
      `wtfos-sdk:test`, `wtfos-mcp:test`) green.

Enable (staged):

- [ ] Set `ATPROTO_SPINE_ENABLED=true` with `WTFOS_ACCEPT_EXTERNAL=false` (no inbound federation yet).
- [ ] Provision tracking repos; verify `/.well-known/atproto-did` resolves a sample handle.
- [ ] Run `npm run atproto:backfill` (idempotent) for identity-social history.
- [ ] Start AppView indexer; confirm `GET /api/admin/atproto/observability` shows growing
      `published` outbox + AppView cursors.

Federate (final):

- [ ] Review labeler policy + moderation coverage.
- [ ] `requestCrawl` to `relay.wtfos.me` (then optionally the public network).
- [ ] Flip `WTFOS_ACCEPT_EXTERNAL=true` only after content/labeling review.

Rollback:

- [ ] Set `ATPROTO_SPINE_ENABLED=false` — all emit hooks no-op, AppView API 404s, OS unaffected.
- [ ] Stop the `wtfos-atproto` profile; canonical Postgres data is untouched.

### Pre-Mortem Run

- Date: 2026-05-29
- Mode: deep
- Tigers: 3 (all mitigated by checklist items)
- Elephants: 2
