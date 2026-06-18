# Subplan — Architecture Foundation (Contract / Token Products + relationship metadata)

Implemented primarily in `shared/pasta-protocol/types.ts` (Phase 0 stub) and consumed by every app.

## Contract Products vs Token Products

- **Contract Product** creates a contract (`ContractProductKind`) and may contain Token Products.
- **Token Product** is a token definition (`TokenProductKind`) that can live in many Contract Products.
- Token Products never contain Contract Products.

## Ownership relationship metadata

`OwnershipRelationshipMetadata` is stamped into contract/token metadata JSON. All fields optional.
Never enforced in MVP, but must always be writable so a future Wallet → Franchise → Collection → Token
hierarchy needs no migration:

- `parent_contract`, `franchise_contract`, `related_contracts`, `collection_group`,
  `publisher_contract`, `ownership_chain`.

## Phase 1 work — DONE (foundation builders)

- `shared/pasta-protocol/relationship.ts` — `sanitizeRelationshipMetadata`, `mergeRelationshipMetadata`,
  `extractRelationshipMetadata` (embed/extract under the `relationships` key; empty fields omitted).
- `shared/pasta-protocol/metadata.ts` — `buildTokenMetadata` (TZIP-21, Macaroni-shape) and
  `buildCollectionMetadata` (TZIP-16, default interfaces), both embedding the relationship block.
- Browser port `public/creation-tools/spaghetti/js/pasta-foundation.js` for the static apps, locked to
  the TS source by `tests/unit/pasta-foundation-parity.test.mjs`.
- Tests: `shared/pasta-protocol/foundation.test.ts` (round-trip + omission) and the parity suite.

## Reuse

- On-chain lineage model proven by `tezos-franchise-factory` (`parent`/`root`/`generation`/`label`).
  Pasta stores a richer relationship block off-chain in metadata; on-chain franchise enforcement is a
  later phase.
