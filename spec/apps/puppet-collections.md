# Puppet Collections

## Classification

- Service ID: `puppet-collections`
- Role: Pasta Protocol supporting infrastructure

## Purpose

Actor-backed test collections that prove Pasta collection creation, pinning, hosting, deployment, discovery, mint, and node-loss recovery.

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

- Puppet creator collection evidence and validation result
- Puppet pinning evidence and validation result
- Puppet hosting evidence and validation result
- Puppet deployment evidence and validation result
- Puppet collector discovery evidence and validation result
- Puppet mint evidence and validation result
- Node-loss survival evidence and validation result

## Consumed Assets

- Pasta package manifests.
- Media artifacts and metadata CIDs.
- Contract addresses, operation hashes, or puppet actor state.

## Feature Inventory

- [Puppet creator collection](../features/puppet-collections/puppet-creator-collection.md)
- [Puppet pinning](../features/puppet-collections/puppet-pinning.md)
- [Puppet hosting](../features/puppet-collections/puppet-hosting.md)
- [Puppet deployment](../features/puppet-collections/puppet-deployment.md)
- [Puppet collector discovery](../features/puppet-collections/puppet-collector-discovery.md)
- [Puppet mint](../features/puppet-collections/puppet-mint.md)
- [Node-loss survival](../features/puppet-collections/node-loss-survival.md)
