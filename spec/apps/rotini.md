# Rotini

## Classification

- App ID: `rotini`
- Surface: `/tools/rotini`
- Product type: Generative token publisher
- Current status: Static Pasta tool

## Purpose

Generative collection publisher for trait layers, rarity weighting, deterministic edition generation, and standard FA2 output.

## Inputs

- layer assets
- trait names and rarity weights
- edition count and deterministic seed
- collection metadata or existing contract target
- wallet/network/pinning settings

## Outputs

- generated edition metadata
- rendered or referenced artifacts
- standard collection contract or minted token set
- generation proof and DNA map

## Dependencies

- shared deterministic generative engine
- PastaStandardCollectionFA2 template
- Macaroni-derived wallet/pinning kernel
- CH-EASE package import

## Produced Assets

- edition manifests
- trait/DNA table
- generated token metadata
- standard collection contract or token products

## Consumed Assets

- layer files
- seed and rarity settings
- pinning provider
- mint target data

## Feature Inventory

- [Layer and trait upload](../features/rotini/layer-and-trait-upload.md)
- [Rarity and uniqueness configuration](../features/rotini/rarity-and-uniqueness-configuration.md)
- [Deterministic edition generation](../features/rotini/deterministic-edition-generation.md)
- [Preview/render artifact export](../features/rotini/preview-render-artifact-export.md)
- [Generation proof validation](../features/rotini/generation-proof-validation.md)
- [Collection target selection](../features/rotini/collection-target-selection.md)
- [Generated metadata pinning](../features/rotini/generated-metadata-pinning.md)
- [Mint generated editions](../features/rotini/mint-generated-editions.md)
- [Regeneration from seed](../features/rotini/regeneration-from-seed.md)
- [Colander standard-collection handoff](../features/rotini/colander-standard-collection-handoff.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
