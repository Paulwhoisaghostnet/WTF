# Macaroni

## Classification

- App ID: `macaroni`
- Surface: `/tools/macaroni`
- Product type: Contract product
- Current status: Existing proven base

## Purpose

Blind-mint drop studio for originating creator-owned Tezos token factories and generated collector mint pages.

## Inputs

- CSV or CH-EASE package rows
- token media and optional preview media
- collection/drop metadata
- pricing, sale, reveal, allowlist, royalty, and minter-royalty settings
- creator wallet and selected Tezos network

## Outputs

- Macaroni blind-mint FA2 contract
- pinned token and collection metadata
- generated mint/reveal pages
- exportable static site bundle
- operation hashes, KT1 address, and collector mint state

## Dependencies

- Macaroni static kernel under public/creation-tools/macaroni
- Octez Connect primary wallet with Beacon fallback
- Tezos L1 mainnet/Shadownet RPC and chain-id guards
- IPFS provider: self-managed Pinata/node or embedded wtfOS pinner for trusted creators
- TzKT/indexer reads for mint and owned-token recovery
- WTF.ME/wtfOS user-site host for hosted pages

## Produced Assets

- blind-mint collection contract
- placeholder/reveal metadata
- collector mint page
- sale calendar/share presets
- manifest/export archive

## Consumed Assets

- CH-EASE Macaroni packages
- creator wallet permission
- media CIDs
- trusted-creator hosted pinning capability

## Feature Inventory

- [Wallet and network safety](../features/macaroni/wallet-and-network-safety.md)
- [Trusted creator pinning mode](../features/macaroni/trusted-creator-pinning-mode.md)
- [CSV and package ingest](../features/macaroni/csv-and-package-ingest.md)
- [Token media and metadata preparation](../features/macaroni/token-media-and-metadata-preparation.md)
- [Blind-mint sale and reveal configuration](../features/macaroni/blind-mint-sale-and-reveal-configuration.md)
- [Contract template selection and origination](../features/macaroni/contract-template-selection-and-origination.md)
- [Generated mint page hosting/export](../features/macaroni/generated-mint-page-hosting-export.md)
- [Collector mint and quantity preflight](../features/macaroni/collector-mint-and-quantity-preflight.md)
- [Reveal and owned-mint recovery](../features/macaroni/reveal-and-owned-mint-recovery.md)
- [Share, calendar, and static bundle export](../features/macaroni/share-calendar-and-static-bundle-export.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. Macaroni remains the proven existing app and keeps its tested RPC behavior unless a separate owner-approved Macaroni migration is planned. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
