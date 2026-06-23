# Penne

## Classification

- App ID: `penne`
- Surface: `/tools/penne`
- Product type: Contract product
- Current status: Static Pasta tool

## Purpose

Distribution publisher for airdrops, allowlist claims, participation rewards, and allocation-controlled token delivery.

## Inputs

- distribution token metadata
- recipient/allocation CSV
- claim window schedule
- airdrop/claim mode
- wallet/network/pinning settings

## Outputs

- PastaDistributionFA2 contract
- allocation list state
- airdrop operations
- public claim action
- distribution manifest

## Dependencies

- PastaDistributionFA2 template
- shared recipient parser
- Macaroni-derived wallet/pinning kernel
- Colander distribution adapter

## Produced Assets

- distribution contract
- claimable token metadata
- recipient allocation map
- claim/airdrop receipts

## Consumed Assets

- recipient addresses
- token artifact/media
- allocation amounts
- claim schedule

## Feature Inventory

- [Recipient list import](../features/penne/recipient-list-import.md)
- [Allocation validation and dedupe](../features/penne/allocation-validation-and-dedupe.md)
- [Distribution token metadata setup](../features/penne/distribution-token-metadata-setup.md)
- [Distribution contract deployment](../features/penne/distribution-contract-deployment.md)
- [Claim window configuration](../features/penne/claim-window-configuration.md)
- [Airdrop push distribution](../features/penne/airdrop-push-distribution.md)
- [Collector claim flow](../features/penne/collector-claim-flow.md)
- [Allocation recovery/export](../features/penne/allocation-recovery-export.md)
- [Failure replay controls](../features/penne/failure-replay-controls.md)
- [Colander distribution handoff](../features/penne/colander-distribution-handoff.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
