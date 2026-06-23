# Ravioli

## Classification

- App ID: `ravioli`
- Surface: `/tools/ravioli`
- Product type: Token publisher / optional contract product
- Current status: Static Pasta tool

## Purpose

Bundle publisher for art packs, redeemables, mystery packs, and wrapped sets.

## Inputs

- bundle member list or CH-EASE package
- member media or referenced token contracts
- bundle wrapper metadata
- mystery/reveal settings
- wallet/network/pinning configuration

## Outputs

- PastaBundleFA2 contract or bundle token product
- bundle contents manifest
- redeemable/wrapped set records
- bundle mint/redeem operations

## Dependencies

- PastaBundleFA2 template
- shared bundle manifest builder
- Macaroni-derived wallet/pinning kernel
- Colander bundle adapter

## Produced Assets

- bundle contract
- bundle wrapper token
- contents_uri manifest
- redemption state

## Consumed Assets

- CH-EASE packages
- existing token references
- member media CIDs

## Feature Inventory

- [Bundle target selection](../features/ravioli/bundle-target-selection.md)
- [Bundle member import](../features/ravioli/bundle-member-import.md)
- [Bundle manifest validation](../features/ravioli/bundle-manifest-validation.md)
- [Mystery/reveal configuration](../features/ravioli/mystery-reveal-configuration.md)
- [Bundle contract deployment](../features/ravioli/bundle-contract-deployment.md)
- [Bundle token minting](../features/ravioli/bundle-token-minting.md)
- [Redeem/unwrap flow](../features/ravioli/redeem-unwrap-flow.md)
- [Wrapped set provenance export](../features/ravioli/wrapped-set-provenance-export.md)
- [Relationship metadata stamping](../features/ravioli/relationship-metadata-stamping.md)
- [Colander bundle handoff](../features/ravioli/colander-bundle-handoff.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
