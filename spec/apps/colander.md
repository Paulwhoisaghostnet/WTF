# Colander

## Classification

- App ID: `colander`
- Surface: `/tools/colander`
- Product type: Ownership/management/discovery
- Current status: React control panel

## Purpose

Reads owned or manually opened contracts, detects Pasta contract type, shows safe contract-specific management actions, and visualizes Wallet -> Franchise -> Collection -> Token relationships.

## Inputs

- connected wallet
- KT1 contract address
- on-chain entrypoint/storage data
- contract metadata relationship block
- selected action parameters

## Outputs

- detected adapter and available action list
- relationship graph
- wallet-signed management calls
- external handoff links into publisher apps

## Dependencies

- shared/pasta-protocol adapter registry
- Taquito wallet/RPC loaders
- TzKT/explorer links
- publisher routes for complex handoffs

## Produced Assets

- Colander graph view
- admin/role/transfer operation hashes
- colander.* audit events
- publisher handoff URLs

## Consumed Assets

- contract entrypoints
- metadata URI and IPFS gateway reads
- connected wallet authority

## Feature Inventory

- [Wallet and network context](../features/colander/wallet-and-network-context.md)
- [Manual contract open](../features/colander/manual-contract-open.md)
- [Pasta adapter detection](../features/colander/pasta-adapter-detection.md)
- [Available action filtering](../features/colander/available-action-filtering.md)
- [Relationship graph rendering](../features/colander/relationship-graph-rendering.md)
- [Generic FA2 transfer fallback](../features/colander/generic-fa2-transfer-fallback.md)
- [Token transfer form](../features/colander/token-transfer-form.md)
- [Role/admin update forms](../features/colander/role-admin-update-forms.md)
- [External publisher handoff](../features/colander/external-publisher-handoff.md)
- [Post-operation state refresh](../features/colander/post-operation-state-refresh.md)

## Integration Notes

- CH-EASE packages use schema `wtfos.pasta.chease-package.v1` for app handoff when this app consumes package input.
- Tezos L1 network choices must stay explicit. New Pasta apps use Tezos Mainnet `https://tezos-mainnet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/mainnet`, and Tezos Shadownet `https://tezos-shadownet.octez.io/` with fallback `https://tcinfra.net/rpc/tezos/shadownet`.
- Embedded wtfOS trusted-creator storage/pinning/hosting must be hidden from downloaded standalone builds.
- Tortellini is intentionally absent; Macaroni remains the blind-mint product.
