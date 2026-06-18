# Subplan — Spaghetti (standard collection + token-product publisher)

Surface: static creation tool (`public/creation-tools/spaghetti/`), forked from Macaroni.

## Role

The general-purpose publisher. Two jobs:

1. **Publish a standard collection** — originate a new FA2 collection contract (no blind-mint reveal).
2. **Publish a token product** into any contract the user can mint to. At publish time the user picks a
   **mint target** (`MintTarget`):
   - a collection they just created or already own/administer,
   - the HEN shared contract,
   - a wtfOS open collection (e.g. HEN-style shared contract).

## Modules vs Macaroni base

Keep: M1 network+wallet, M2 IPFS pinning (trusted-creator/standalone), M3 CSV import, M4 metadata
builder, M5 media, M6 origination, M8 royalties, M9 publish/export. Add: M_mint_target selector,
standard-collection origination (non-blind), token-into-existing-contract mint, CH-EASE package import.
Remove: M7 blind-mint reveal scheduling.

Absorbs collaboration (split/collab) and achievements/badges config as optional modules.

## Wallet / RPC

User-signed via shared Macaroni wallet kernel. New apps use octez.io doctrine RPCs (Macaroni keeps its
existing RPCs untouched).

## Handles

`spaghetti.collection_deployed`, `spaghetti.token_published`, `spaghetti.mint_target_selected`,
`spaghetti.exported`.

## Phase 1 — DONE (static studio)

Implemented `public/creation-tools/spaghetti/`:

- Kernel forked verbatim from Macaroni (`js/common.js`, `js/octez-wallet.js`, `vendor/tezos.js`,
  `vendor/octez-connect.js`); only RPC defaults (octez.io doctrine) and the wallet-session namespace
  differ. Macaroni is untouched.
- `js/pasta-foundation.js` (parity-tested) builds TZIP-21/16 metadata + relationship blocks.
- `js/studio.js` + `index.html` + `css/theme.css`: network/wallet connect, pinning provider
  (Pinata JWT / IPFS node / wtfOS trusted-creator pinner), mint-target selection (new collection vs a
  contract the wallet administers), CH-EASE package import + export, token-product rows.
- Origination + publish reuse the proven Taquito path: `tezos.wallet.originate({ code, storage })`
  then batched `create_token` + `mint`. Relationship metadata rides along in the pinned JSON.

Contract: `contracts/pasta-protocol/PastaStandardCollectionFA2.py` (own standard mintable FA2 in the
SmartPy 0.24.x `assert` syntax), compiled by `scripts/pasta-protocol/compile-fa2-template.mjs` to
`public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json`. The shared
`contracts/fa2-templates/*` (Kiln factory) are intentionally left untouched.

## Remaining before "live"

- Rehearse origination + create_token + mint on Shadownet with a real wallet (Bowers lesson: no faked
  on-chain success) before claiming the deploy path is production-verified.
- Mint-target resolution currently supports new + administered-contract; HEN/wtfOS-open-collection
  targets (different ABIs) are a follow-up.
