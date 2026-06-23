# Spaghetti

## Classification

- App ID: `spaghetti`
- Surface: `/tools/spaghetti`
- Product type: Contract + token publisher
- Current status: Static Pasta tool

## Purpose

Standard Tezos FA2 collection publisher and token-product publisher into new, owned, shared, or wtfOS-open collection contracts.

## Inputs

- CH-EASE collection package or manual collection metadata
- token media/metadata
- mint target selection
- admin/minter/collaborator wallet data
- network and pinning configuration

## Outputs

- standard FA2 collection contract
- token-product metadata and mint operations
- private management/dashboard bundle
- relationship metadata linking product hierarchy

## Dependencies

- Macaroni-derived wallet/pinning/deploy kernel
- PastaStandardCollectionFA2 contract template
- shared/pasta-protocol metadata/package helpers
- Tezos RPC defaults from AGENTS.md
- Colander adapter registry

## Produced Assets

- standard collection contract
- minted 1/1 or edition tokens
- badge/membership/reward token products
- contract registration hints for Colander

## Consumed Assets

- CH-EASE packages
- user-provided pinning or embedded trusted pinner
- mint permission target data

## Feature Inventory

- [CH-EASE package import](../features/spaghetti/ch-ease-package-import.md)
- [Mint target selection](../features/spaghetti/mint-target-selection.md)
- [Collection metadata and relationship setup](../features/spaghetti/collection-metadata-and-relationship-setup.md)
- [Standard collection origination](../features/spaghetti/standard-collection-origination.md)
- [Token metadata pinning](../features/spaghetti/token-metadata-pinning.md)
- [Token definition creation](../features/spaghetti/token-definition-creation.md)
- [Mint to recipient](../features/spaghetti/mint-to-recipient.md)
- [Collaborator, split, and minter role configuration](../features/spaghetti/collaborator-split-and-minter-role-configuration.md)
- [Private management dashboard export](../features/spaghetti/private-management-dashboard-export.md)
- [Colander registration handoff](../features/spaghetti/colander-registration-handoff.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
