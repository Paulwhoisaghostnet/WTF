# Subplan — Gnocchi (open-edition publisher) — DONE (static studio, Phase 2)

Surface: static creation tool (`public/creation-tools/gnocchi/`), forked from the Spaghetti kernel
(itself the proven Macaroni kernel).

## Status

DONE (Phase 2 static studio). Remaining: live Shadownet rehearsal of originate → create_open_edition →
public open_mint before mainnet.

Implemented:

- Shared bonding-curve pricing keystone `shared/pasta-protocol/pricing.ts` (`priceAtSupply`,
  `costForBatch`, `validateBondingCurve`), exported from the barrel, mirrored in the browser foundation
  port and parity-tested (`tests/unit/pasta-foundation-parity.test.mjs`) + unit-tested
  (`shared/pasta-protocol/foundation.test.ts`).
- Contract `contracts/pasta-protocol/PastaOpenEditionFA2.py` (SmartPy 0.24.x `assert` syntax, FA2 core
  forked from `PastaStandardCollectionFA2`) with a per-token `sales` config and a public payable
  `open_mint`. Pricing steps **between** calls (flat unit price per call) so the on-chain charge equals
  `costForBatch` exactly. Proceeds forwarded to the sale treasury via `sp.send`. SmartPy test scenario
  covers payment, wrong-payment revert, supply cap, pause, free admin mint, and admin handoff.
- Compile via `node scripts/pasta-protocol/compile-fa2-template.mjs contracts/pasta-protocol/PastaOpenEditionFA2.py pasta-open-edition gnocchi`
  → `public/creation-tools/gnocchi/contract/pasta-open-edition.{contract,template}.json`.
- Static studio (`index.html`, `js/studio.js`, `css/theme.css`) reusing the copied kernel
  (`common.js` with `gnocchi.wallet.session.v1`, `octez-wallet.js`, `pasta-foundation.js`, vendored
  Taquito/octez-connect). Configures mode (forever/timed/capped), window, bonding curve (base +
  increment + step + min/max clamps), supply cap, treasury, with a live price preview. Deploys +
  registers the edition, and a public mint surface loads the live price and mints paying the exact cost.
- Imports CH-EASE single-token packages; CH-EASE already lists Gnocchi as an export target.
- Registered assets in `tool-registry.ts` (verified by `npm run creation-tools:check`).

## Role

Publish open-edition Token Products / collections: timed, forever, supply-limited, and **bonding-curve**
pricing.

## Modules vs Macaroni base

Keep: M1 wallet, M2 pinning, M4 metadata, M5 media, M6 origination, M8 royalties, M9 export.
Add: M13 bonding-curve pricing, open-edition window config (start/end/supply cap), mint button surface.
Remove: M7 blind-mint reveal, M3 bulk-CSV (single product focus; optional).

## Contract

`contracts/pasta-protocol/` SmartPy open-edition FA2 with optional bonding curve. Reuse curve math from
`tezos-franchise-factory` (`base_price` + `increment`, clamps, step size). Lesson from Bowers: never
fake on-chain success; surface real operation hashes and failures.

## Handles

`gnocchi.collection_deployed`, `gnocchi.edition_published`, `gnocchi.curve_configured`.

## Phase 2.
