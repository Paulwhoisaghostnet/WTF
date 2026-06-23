# Shadownet Rehearsal

## Classification

- Service ID: `shadownet-rehearsal`
- Role: Pasta Protocol supporting infrastructure

## Purpose

Explicit Tezos Shadownet deployment, collector, marketplace, and recovery validation for every value-signing Pasta flow.

## Inputs

- Pasta application output artifacts, metadata, contract addresses, pages, or actor fixtures.
- wtfOS session, trusted-creator capability, host, chain, and deployment context.

## Outputs

- Validation evidence proving the infrastructure can support Pasta product flows.
- Public or embedded availability signals consumed by creators, collectors, administrators, and tests.

## Dependencies

- wtfOS app routing and access gates.
- PDS/user-site services where hosting or identity is involved.
- IPFS provider, storage backend, Tezos RPC, indexer, and browser wallet as applicable.

## Produced Assets

- Shadownet RPC selection evidence and validation result
- Wallet chain-id guard evidence and validation result
- Creator deploy rehearsal evidence and validation result
- Collector interaction rehearsal evidence and validation result
- Marketplace interaction rehearsal evidence and validation result
- Recoverable failure proof evidence and validation result

## Consumed Assets

- Pasta package manifests.
- Media artifacts and metadata CIDs.
- Contract addresses, operation hashes, or puppet actor state.

## Feature Inventory

- [Shadownet RPC selection](../features/shadownet-rehearsal/shadownet-rpc-selection.md)
- [Wallet chain-id guard](../features/shadownet-rehearsal/wallet-chain-id-guard.md)
- [Creator deploy rehearsal](../features/shadownet-rehearsal/creator-deploy-rehearsal.md)
- [Collector interaction rehearsal](../features/shadownet-rehearsal/collector-interaction-rehearsal.md)
- [Marketplace interaction rehearsal](../features/shadownet-rehearsal/marketplace-interaction-rehearsal.md)
- [Recoverable failure proof](../features/shadownet-rehearsal/recoverable-failure-proof.md)
