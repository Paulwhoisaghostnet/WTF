# Rotini

## Classification

- App ID: `rotini`
- Surface: `/tools/rotini`
- Product type: Generative token publisher
- Current status: Static Pasta tool

## Purpose

Generative collection publisher for weighted trait layers and collector-finalized standard FA2 tokens whose final artifact is a self-contained PNG, animated GIF, or offline interactive ZIP.

## Inputs

- layer assets
- trait names and rarity weights
- supply/cap/reservation policy; the contract assigns each collector's immutable seed
- output mode: PNG, GIF, or interactive ZIP
- collection metadata or existing contract target
- wallet/network/pinning settings

## Outputs

- pinned `pasta-rotini-generator@2` project manifest and source layers
- directly displayable PNG/GIF token artifacts or dependency-free interactive ZIP artifacts with PNG covers
- direct TZIP-21 metadata and exact on-chain SHA-256 artifact bindings
- dedicated generative FA2 contract with reservation/finalization/refund lifecycle

## Dependencies

- shared deterministic generative engine and browser artifact kernel
- dedicated PastaGenerativeCollectionFA2 template
- Macaroni-derived wallet/pinning kernel
- CH-EASE package import

## Produced Assets

- generator manifests and source-layer CIDs
- trait selections, immutable reservation seeds, and artifact hashes
- direct token metadata
- self-contained PNG, GIF, or ZIP token products

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
- Interactive ZIPs must keep `index.html` at archive root, use only packaged relative dependencies, reject network APIs/external URLs, and provide a <=2 MB PNG cover; every token artifact stays <=250 MB.
- No NFT exists at generator publication or reservation. `finalize_iteration` is the token-creation boundary after durable artifact and metadata pinning.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
