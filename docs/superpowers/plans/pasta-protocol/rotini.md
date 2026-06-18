# Subplan — Rotini (generative publisher) — DONE (static studio, Phase 2)

Surface: static creation tool (`public/creation-tools/rotini/`), forked from the Spaghetti kernel
(itself the proven Macaroni kernel). Reuses the standard `PastaStandardCollectionFA2` — no new contract.

## Status

DONE (Phase 2 static studio). Remaining: live Shadownet rehearsal of generate → pin → originate →
create_token → mint before mainnet.

Implemented:

- Shared deterministic engine `shared/pasta-protocol/generative.ts` (`generateEditions`, `hashSeed`,
  `mulberry32`, `pickVariantIndex`, `maxCombinations`, `dnaOf`, `traitAttributes`), exported from the
  barrel, mirrored byte-for-byte in the browser foundation port, and parity-tested (same seed → same
  editions across TS/JS) + unit-tested (determinism, weighted rarity, uniqueness cap, empty inputs).
- Static studio (`index.html`, `js/studio.js`, `css/theme.css`) reusing the copied kernel
  (`rotini.wallet.session.v1`) + vendored Taquito/octez. Layer/variant editor with rarity weights and
  thumbnails; deterministic generation; **browser `<canvas>` compositing** (no external deps); preview
  grid; publish via the standard FA2 (pin each composite + per-token trait metadata, batched
  create_token + mint); and CH-EASE collection-package export (trait attributes carried as item
  `attributes`; artwork pinned separately by the user/backend).
- Reuses the compiled `pasta-standard-collection.contract.json` (copied into `rotini/contract/`); no new
  SmartPy contract needed for generative 1/1s.
- Registered assets in `tool-registry.ts` (verified by `npm run creation-tools:check`).

## Role

Publish generative collections: layered traits composited into generative outputs, with rarity and
trait metadata.

## Modules vs Macaroni base

Keep: M1 wallet, M2 pinning, M4 metadata, M5 media, M6 origination, M9 export.
Add: M15 layer/trait engine (upload layers, set rarity, preview composites), deterministic seed,
batch artifact generation, per-token trait metadata.
Remove: M7 blind-mint reveal (generative output is the artifact; optional blind variant later).

## Notes

Generation runs client-side (no external deps; all libraries vendored locally per project rule).
Large batches export as a CH-EASE collection package for pinning by the user or trusted-creator backend.

## Handles

`rotini.collection_deployed`, `rotini.generated`, `rotini.tokens_published`.

## Phase 2.
