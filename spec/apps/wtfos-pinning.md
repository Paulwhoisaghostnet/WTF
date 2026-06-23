# WTFOS Pinning

## Classification

- Service ID: `wtfos-pinning`
- Role: Pasta Protocol supporting infrastructure

## Purpose

Embedded trusted-creator storage, IPFS pinning, artifact availability, redundancy, and recovery.

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

- File staging evidence and validation result
- Artifact pinning evidence and validation result
- Metadata pinning evidence and validation result
- Collection availability evidence and validation result
- Redundant pinning evidence and validation result
- Recovery repin evidence and validation result
- Trusted-creator access gating evidence and validation result
- Progress/audit events evidence and validation result

## Consumed Assets

- Pasta package manifests.
- Media artifacts and metadata CIDs.
- Contract addresses, operation hashes, or puppet actor state.

## Feature Inventory

- [File staging](../features/wtfos-pinning/file-staging.md)
- [Artifact pinning](../features/wtfos-pinning/artifact-pinning.md)
- [Metadata pinning](../features/wtfos-pinning/metadata-pinning.md)
- [Collection availability](../features/wtfos-pinning/collection-availability.md)
- [Redundant pinning](../features/wtfos-pinning/redundant-pinning.md)
- [Recovery repin](../features/wtfos-pinning/recovery-repin.md)
- [Trusted-creator access gating](../features/wtfos-pinning/trusted-creator-access-gating.md)
- [Progress/audit events](../features/wtfos-pinning/progress-audit-events.md)
