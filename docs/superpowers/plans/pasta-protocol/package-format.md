# Subplan — CH-EASE Package Format

Schema: `wtfos.pasta.chease-package.v1` (`CheasePackage` in `shared/pasta-protocol/types.ts`).

## Two shapes

- **Collection package** (`kind: "collection"`): cover image, collection metadata, and an ordered list
  of token items. Used to originate a new contract (Spaghetti standard collection, Macaroni blind mint,
  Gnocchi/Ravioli/Rotini collections).
- **Single-token package** (`kind: "single_token"`): one fully-built token item (artifact + preview +
  TZIP-21 metadata). Used to mint one Token Product into an existing compatible contract.

## Rules

- Every package declares `targetApp` so the consuming app can validate shape before import.
- CH-EASE only **formats**; it does not pin or originate. Artifact/preview URIs may be app-local
  references until the consuming app (or a trusted-creator pin) resolves them to `ipfs://`.
- Round-trip: export → import must be lossless for the fields the target app needs.

## Phase 1 work

DONE — builders/validators: `shared/pasta-protocol/package.ts` (and the browser port) provide
`buildCollectionPackage`, `buildSingleTokenPackage`, `isCheasePackage`/guards, and
`validateCheasePackage` (shape-only), all tested.

REMAINING:
- CH-EASE UI: pick target app → upload media + metadata (CSV or form) → choose collection vs single
  token → preview → export `.json` (and a zipped media bundle when artifacts are local).
- Spaghetti import path reads a v1 package and pre-fills its publish form.
