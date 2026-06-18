# Subplan — Penne (distribution publisher) — DONE (static studio, Phase 3)

Surface: static creation tool (`public/creation-tools/penne/`), forked from Macaroni.

## Status (Phase 3a complete)

- **Shared module (M16)**: `shared/pasta-protocol/distribution.ts` — pure recipient-list parser
  (`parseRecipientList`, `isTezosAddress`, `totalAllocation`). CSV-ish `address[, amount]` lines, comment
  skipping, light tz/KT structural validation, last-wins dedupe. JS port in
  `public/creation-tools/spaghetti/js/pasta-foundation.js`; parity-tested + unit-tested (35 tests green).
- **Contract**: `contracts/pasta-protocol/PastaDistributionFA2.py` (SmartPy 0.24.x, forked from
  `PastaStandardCollectionFA2`). Adds `allocations`/`claimed` big_maps + a contract-wide claim window.
  Entrypoints: `create_token`, `set_allocations`, `open_claim`, `claim` (pull, window-gated), `airdrop`
  (admin push). Both `claim` and `airdrop` route through a shared `_deliver` private that mints the loaded
  allocation, records it claimed, and clears it — so no recipient is ever distributed to twice. Compiled
  to `public/creation-tools/penne/contract/`; scenario test passes (pull claim, double-claim revert,
  push airdrop, double-airdrop revert, non-admin revert, admin handoff).
- **Static studio**: forked Spaghetti kernel (`common.js` namespaced `penne.wallet.session.v1`,
  `octez-wallet.js`, `pasta-foundation.js`, vendor). UI: pinning → distribution token → recipients list
  (import/validate, live count + total + error lines) → deploy (originate + create_token + batched
  `set_allocations`) → distribute (open/close claim window, public claim, batched admin airdrop). Airdrop
  reports real per-batch tx state (Bowers lesson: never simulate success).
- **Registration**: `tool-registry.ts` requiredAssets updated; inventory + e2e fixtures already carried
  the route and four handles from Phase 0.

## Role

Publish distribution contracts: airdrops, claims, and participation rewards. A Contract Product whose
purpose is distributing Token Products to many recipients.

## Modules vs Macaroni base

Keep: M1 wallet, M2 pinning, M4 metadata, M9 export.
Add: M16 recipient list import (CSV of addresses/allocations), M17 claim/airdrop contract config
(merkle/allowlist claim vs push airdrop), claim window.
Remove: M5 single-media focus, M7 blind-mint.

## Contract

`contracts/pasta-protocol/` SmartPy distribution FA2 (allowlist/merkle claim + push airdrop). Reuse
allowlist/claim patterns; verify gas for large lists. Lesson from Bowers: never simulate success —
report real tx state per recipient batch.

## Handles

`penne.contract_deployed`, `penne.recipients_loaded`, `penne.claim_opened`, `penne.distributed`.

## Phase 3.
