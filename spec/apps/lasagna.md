# Lasagna

## Classification

- App ID: `lasagna`
- Surface: `/tools/lasagna`
- Product type: Contract product
- Current status: Static Pasta tool

## Purpose

On-chain curation and exhibition publisher with ordered token references, curator roles, and revision history.

## Inputs

- exhibition title/statement/cover URL
- ordered token references
- curator/admin wallet settings
- revision metadata
- network/pinning configuration

## Outputs

- PastaExhibitionRegistry contract
- pinned exhibition revision manifests
- curator role changes
- current revision pointer

## Dependencies

- PastaExhibitionRegistry template
- shared exhibition parser/metadata builder
- Macaroni-derived wallet/pinning kernel
- Colander exhibition adapter

## Produced Assets

- exhibition contract
- revision manifests
- curation graph
- current revision state

## Consumed Assets

- existing token contract/id refs
- curator addresses
- hosted cover URI

## Feature Inventory

- [Exhibition metadata setup](../features/lasagna/exhibition-metadata-setup.md)
- [Ordered token reference parsing](../features/lasagna/ordered-token-reference-parsing.md)
- [Revision manifest validation](../features/lasagna/revision-manifest-validation.md)
- [Exhibition contract deployment](../features/lasagna/exhibition-contract-deployment.md)
- [Curator role management](../features/lasagna/curator-role-management.md)
- [Publish revision](../features/lasagna/publish-revision.md)
- [Set current revision](../features/lasagna/set-current-revision.md)
- [Version history inspection](../features/lasagna/version-history-inspection.md)
- [Hosted exhibition export](../features/lasagna/hosted-exhibition-export.md)
- [Colander curation handoff](../features/lasagna/colander-curation-handoff.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
