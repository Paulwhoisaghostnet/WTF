# Gnocchi

## Classification

- App ID: `gnocchi`
- Surface: `/tools/gnocchi`
- Product type: Token publisher / optional contract product
- Current status: Static Pasta tool

## Purpose

Open-edition publisher for timed, forever, supply-limited, and bonding-curve editions.

## Inputs

- single-token CH-EASE package or manual open-edition metadata
- artifact and cover files
- sale mode, start/end, cap, and price config
- bonding-curve parameters
- creator wallet/network

## Outputs

- PastaOpenEditionFA2 contract or token product
- open-edition metadata
- live price/cost preview
- collector mint operation

## Dependencies

- PastaOpenEditionFA2 template
- shared bonding-curve pricing helpers
- Macaroni-derived wallet/pinning kernel
- Tezos RPC and TzKT reads

## Produced Assets

- open-edition contract
- open_mint sale controls
- bonding-curve price state
- collector-facing mint page/export

## Consumed Assets

- CH-EASE single-token package
- pinning provider
- current supply/storage reads

## Feature Inventory

- [Single-token package import](../features/gnocchi/single-token-package-import.md)
- [Open-edition metadata setup](../features/gnocchi/open-edition-metadata-setup.md)
- [Timed/forever/capped sale mode](../features/gnocchi/timed-forever-capped-sale-mode.md)
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
