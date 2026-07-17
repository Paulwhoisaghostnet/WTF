# Subplan — Gnocchi (multi-edition issuance publisher)

Surface: static creation tool (`public/creation-tools/gnocchi/`), forked from the Spaghetti kernel
(itself the proven Macaroni kernel).

## Status

Local multi-edition contract, Studio, and browser choreography implemented. Fresh three-policy Shadownet proof is the release gate before this version is treated as chain-proven.

Implemented:

- Shared bonding-curve pricing keystone `shared/pasta-protocol/pricing.ts` (`priceAtSupply`,
  `costForBatch`, `validateBondingCurve`), exported from the barrel, mirrored in the browser foundation
  port and parity-tested (`tests/unit/pasta-foundation-parity.test.mjs`) + unit-tested
  (`shared/pasta-protocol/foundation.test.ts`).
- Contract `contracts/pasta-protocol/PastaOpenEditionFA2.py` (SmartPy 0.24.x `assert` syntax, FA2 core
  forked from `PastaStandardCollectionFA2`) with per-token sale config, issuance-policy locks, current
  supply, cumulative lifetime mint accounting, creator reserves, and public payable `open_mint`.
  Pricing steps between calls so the on-chain charge equals `costForBatch`; burns change current supply
  without reopening cap/curve capacity. Locked start/end/cap boundaries apply to public and delegated
  mint paths while vault/unvault and price/treasury management remain available.
- Compile via `node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaOpenEditionFA2.py pasta-open-edition gnocchi`
  → `public/creation-tools/gnocchi/contract/pasta-open-edition.{contract,template}.json`.
- Static studio (`index.html`, `js/studio.js`, `css/theme.css`) reusing the copied kernel
  (`common.js` with `gnocchi.wallet.session.v1`, `octez-wallet.js`, `pasta-foundation.js`, vendored
  Taquito/octez-connect). Offers Timed OE, Forever OE, Limited Edition, and Custom presets with
  independent window/cap controls, creator reserve, policy lock, and bonding curve. It can originate a
  collection or verify administrator ownership of a current Gnocchi KT1 and append the next token id,
  then list every token's live policy/supply/lock state. The public mint surface loads lifetime issuance
  and pays the exact cost.
- Imports CH-EASE single-token packages; CH-EASE already lists Gnocchi as an export target.
- Registered assets in `tool-registry.ts` (verified by `npm run creation-tools:check`).

## Role

Publish multiple independently managed token products under one FA2 collection: timed uncapped OE,
forever OE, capped timed LE, custom boundary combinations, and optional bonding-curve pricing.

## Modules vs Macaroni base

Keep: M1 wallet, M2 pinning, M4 metadata, M5 media, M6 origination, M8 royalties, M9 export.
Add: M13 bonding-curve pricing, open-edition window config (start/end/supply cap), mint button surface.
Remove: M7 blind-mint reveal, M3 bulk-CSV (single product focus; optional).

## Contract

`contracts/pasta-protocol/` SmartPy open-edition FA2 with optional bonding curve. Reuse curve math from
`tezos-franchise-factory` (`base_price` + `increment`, clamps, step size). Lesson from Bowers: never
fake on-chain success; surface real operation hashes and failures.

## Handles

`gnocchi.collection_deployed`, `gnocchi.collection_verified`, `gnocchi.collection_editions_viewed`,
`gnocchi.edition_published`, `gnocchi.edition_minted`, `gnocchi.edition_vaulted`,
`gnocchi.edition_unvaulted`.

## Phase 2.
