# @wtfos/atproto-spine

App-agnostic AT Protocol spine primitives for wtfOS. Extracted and generalized from the
[TZAT](../../../TZAT) (tz2at) relay, with all Tezos/Objkt specifics removed. This package knows
nothing about wtfOS apps, domains, or Tezos — callers supply a `SpineConfig` and routing rules.

It is the reusable mechanism layer; the wtfOS kernel wires it in via the kernel spine service
(`server/features/atproto-spine`, step S2.1). See `docs/atproto/00-decisions.md` and the
`atproto-spine` skill (`.cursor/skills/atproto-spine/SKILL.md`).

## Contents

| Module | Purpose | Generalized from |
| --- | --- | --- |
| `atproto-client` | Authenticated single-repo PDS write client (`createRecord`/`putRecord`/`applyWrites`). | `publisher/atproto-client.ts` |
| `pds-admin-client` | Raw XRPC admin/provisioning (`createAccount`, `resolveHandle`, `updateAccountPassword`, `describeServer`). | `provisioning/pds-admin-client.ts` |
| `record-mapper` | `$type`→collection mapping, deterministic rkeys, key stripping, oversized-record shrink. | `publisher/record-mapper.ts` |
| `record-router` | Config-driven `$type`-prefix → domain routing for pointer-echo fan-out. | `publisher/entity-router.ts` |
| `firehose-consumer` | Resilient relay `subscribeRepos` WebSocket consumer with cursor + reconnect. | `firehose/*` |
| `tls-gate` | On-demand TLS allow decision + Node handler for Caddy's `ask` endpoint. | `routes/semantic.ts` `/internal/tls/allow` |

## Resolution model

The WTF repo is not (yet) a workspace monorepo. This package is consumed in-tree via the
`@wtfos/atproto-spine` TypeScript path alias and resolves `@atproto/api`, `ws`, and `zod` from the
**root** `node_modules`. On a true extraction, promote the `peerDependencies` to `dependencies` and
add a local install.

## Verify

```bash
npm run atproto-spine:check   # tsc --noEmit against tsconfig.atproto-spine.json
npm run atproto-spine:test    # node --test via tsx
```
