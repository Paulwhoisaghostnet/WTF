# Subplan — Ravioli (wrapped-token publisher) — contract foundation complete

Surface: static creation tool (`public/creation-tools/ravioli/`), forked from the Spaghetti kernel
(itself the proven Macaroni kernel).

## Status

The Ravioli router and typed helper adapters are implemented and locally proven with SmartPy and
Michelson compilation. A fresh signer-backed Shadownet run remains a deployment gate; the guarded
command refuses to spend test tez unless explicitly enabled and funded.

## Implemented

- `PastaPackRouterFA2` is the production Ravioli wrapper: each wrapper edition has an ordered,
  commitment-backed recipe and is burned only after every child delivery succeeds.
- Three child primitives are typed on-chain: escrowed existing FA2 transfers, Gnocchi reserved
  allocation mints, and Rotini generative mints. `PastaGnocchiPackAdapter` and
  `PastaRotiniPackAdapter` isolate the helper entrypoint shapes and reserve capacity before wrapper
  issuance.
- Five product modes are supported: deterministic vaulted, blind funded-pool, blind allocated-mint,
  blind generative-mint, and hybrid. Mode/type mismatches are rejected by the router, and failed child
  operations roll back the wrapper, allowance, and adapter reserve state atomically.
- Generative fulfillment accepts Rotini PNG, animated GIF, and dependency-free interactive ZIP output;
  the Rotini contract stores MIME, artifact/display/thumbnail URIs, and a 32-byte artifact hash.
- `shared/pasta-protocol/bundle.ts` builds the descriptive `wtfos.pasta.pack-manifest.v2` manifest. The
  manifest is provenance/display metadata; custody and mint delivery are enforced by the router and
  adapters, not by an off-chain URI.
- The static studio uses the router artifact (`pasta-bundle.contract.json`) plus both typed adapter
  artifacts and exports the self-hosted drop/open page.
- The older `PastaBundleFA2.py` redeem/manifest contract is retained for compatibility but is not the
  Ravioli production wrapper path; it does not custody or mint enclosed assets.
- Registered assets in `tool-registry.ts` are verified by `npm run creation-tools:check`.

## Role

Publish bundle Token Products: art packs, blind packs, generative packs, hybrid packs, and wrapped sets
where opening a wrapper delivers or mints the enclosed child tokens.

## Modules vs Macaroni base

Keep: M1 wallet, M2 pinning, M4 metadata, M5 media, M6 origination, M9 export.
Add: M14 bundle composition, recipe commitment/reveal, escrow custody, typed allocation/generative
adapters, hybrid fulfillment, and optional contents reveal metadata.
Remove: M7 blind-mint reveal scheduling (Ravioli opening is a delivery flow).

## Contract

`contracts/pasta-protocol/PastaPackRouterFA2.py` plus the Gnocchi/Rotini pack adapters. `open_pack`
mutates on-chain balances, supply, serial counters, child custody/reserves, and generated token state;
the pinned manifest remains descriptive metadata.

## Proof command

`npm run contract:test:pasta-ravioli` runs the five-mode SmartPy suite and compiles the router, adapters,
Gnocchi, and Rotini. The suite covers atomic rollback, wrapper balance/supply conservation, mode guards,
and PNG/GIF/ZIP generative fulfillment. `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e`
is the guarded live rehearsal once Shadownet wallets and funding are available.

## Handles

`ravioli.collection_deployed`, `ravioli.bundle_published`, `ravioli.redeemed`.
