# Gnocchi

## Classification

- App ID: `gnocchi`
- Surface: `/tools/gnocchi`
- Product type: Token publisher / optional contract product
- Current status: Static Pasta tool

## Purpose

Multi-edition FA2 publisher for uncapped Timed OEs, unbounded Forever OEs, capped-and-timed Limited Editions, and advanced custom issuance policies.

## Inputs

- single-token CH-EASE package or manual open-edition metadata
- artifact and cover files
- Timed OE / Forever OE / Limited Edition preset or custom start/end/cap policy
- optional creator reserve and issuance-boundary lock
- new-collection target or an existing current-version Gnocchi KT1 administered by the connected wallet
- bonding-curve parameters
- creator wallet/network

## Outputs

- new PastaOpenEditionFA2 contract or the next token id in an existing Gnocchi collection
- open-edition metadata
- per-token policy lock, current supply, lifetime minted count, and live price/cost preview
- collector mint operation

## Dependencies

- PastaOpenEditionFA2 template
- shared bonding-curve pricing helpers
- Macaroni-derived wallet/pinning kernel
- Tezos RPC and TzKT reads

## Produced Assets

- multi-token edition contract
- independently configured Timed OE, Forever OE, and Limited Edition token ids
- open_mint sale controls
- bonding-curve price state
- collector-facing mint page/export

## Consumed Assets

- CH-EASE single-token package
- pinning provider
- current supply, lifetime minted, policy lock, and collection token-count reads

## Feature Inventory

- [Single-token package import](../features/gnocchi/single-token-package-import.md)
- [Open-edition metadata setup](../features/gnocchi/open-edition-metadata-setup.md)
- [Timed/forever/limited issuance presets](../features/gnocchi/timed-forever-capped-sale-mode.md)
- [Bonding-curve pricing validation](../features/gnocchi/bonding-curve-pricing-validation.md)
- [Collection/artifact pinning](../features/gnocchi/collection-artifact-pinning.md)
- [Open-edition contract deployment](../features/gnocchi/open-edition-contract-deployment.md)
- [Collector open mint](../features/gnocchi/collector-open-mint.md)
- [Live price and remaining supply preflight](../features/gnocchi/live-price-and-remaining-supply-preflight.md)
- [Pause or resume sale](../features/gnocchi/pause-or-resume-sale.md)
- [Export/recovery manifest](../features/gnocchi/export-recovery-manifest.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
- One Gnocchi KT1 is a multi-asset FA2 collection. `create_open_edition` assigns the next token id, so edition policies do not require helper contracts.
- Locked policies keep start, end, and maximum supply immutable while allowing vault/unvault plus price and treasury management. Lifetime mint accounting means burns do not reopen an LE cap or rewind its curve.
