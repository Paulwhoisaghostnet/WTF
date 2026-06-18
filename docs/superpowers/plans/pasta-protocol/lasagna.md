# Subplan — Lasagna (on-chain curation / exhibition publisher) — DONE (static studio, Phase 3)

Surface: static creation tool (`public/creation-tools/lasagna/`), forked from Macaroni.

## Status (Phase 3b complete)

- **Shared module (M18)**: `shared/pasta-protocol/exhibition.ts` — pure `parseTokenReferences`
  (`KT1…, tokenId` lines, order preserved, exact-duplicate drop, KT1-only structural validation) and
  `buildExhibitionMetadata` (TZIP-16/21 manifest with ordered references + curator snapshot + revision).
  JS port in `pasta-foundation.js`; parity-tested + unit-tested (42 foundation/parity tests green).
- **Contract**: `contracts/pasta-protocol/PastaExhibitionRegistry.py` (SmartPy 0.24.x, **not an FA2** —
  holds no balances, mints nothing). Storage: curator set + append-only `revisions` big_map + movable
  `current_revision` pointer. Entrypoints: `add_curator`/`remove_curator` (admin), `publish_revision`
  (admin or curator; appends an ordered reference list + metadata pointer, sets it current),
  `set_current_revision` (roll the pointer to any earlier revision), `set_metadata`, two-step admin
  handoff. Views: `get_revision_count`, `get_current_revision`, `get_revision`, `is_curator`. Compiled to
  `public/creation-tools/lasagna/contract/`; scenario passes (curator gating, first publish, second
  publish, rollback, nonexistent-revision revert, removed-curator revert, admin handoff).
- **Static studio**: forked Spaghetti kernel (`lasagna.wallet.session.v1`). Pinning is for the small
  exhibition manifest only — **no media upload / no re-minting** (M2/M5/M7 removed). UI: pinning →
  exhibition title/statement/cover-URL → ordered references (import/validate, live count + errors) →
  deploy `PastaExhibitionRegistry` → curate (add/remove curators, publish revision, set current). The
  `revision` field is read from on-chain `revision_count` so the manifest self-labels.
- **Registration**: `tool-registry.ts` requiredAssets updated; inventory + e2e fixtures already carried
  the route and four handles from Phase 0.

Phase 3 (Penne + Lasagna) is complete.

## Role

Publish on-chain curation / exhibition contracts: multi-curator exhibitions referencing existing
tokens, with version history (layers, like the dish).

## Modules vs Macaroni base

Keep: M1 wallet, M4 metadata, M9 export.
Add: M18 token reference picker (add existing KT1/token references to an exhibition), M19 multi-curator
roles, M20 version history (append-only revisions of the exhibition).
Remove: M2 pinning of new artifacts (references existing tokens), M5 media upload, M7 blind-mint.

## Contract

`contracts/pasta-protocol/` SmartPy exhibition contract: curator set, ordered token references,
revision log. Curation is references + roles, not re-minting art.

## Handles

`lasagna.contract_deployed`, `lasagna.curator_added`, `lasagna.exhibition_published`,
`lasagna.revision_added`.

## Phase 3.
