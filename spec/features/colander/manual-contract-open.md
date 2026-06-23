# Colander: Manual contract open

## Purpose

Manual contract open lets Pasta Protocol users move the Colander workflow toward a valid management outcome while preserving wallet, pinning, relationship metadata, and recovery guarantees.

## Actor

Primary actor: Creator. Secondary actors: Collector, Curator, Marketplace User, Administrator.

## Preconditions

- The user can access `/tools/colander` and the relevant app gate is enabled.
- Tezos network selection is explicit before wallet signing.
- Required media, metadata, package, contract, or role inputs are available.
- Embedded wtfOS-only services are shown only for authorized trusted creators.

## Inputs

- User-entered configuration for manual contract open.
- Wallet/network context when the feature signs or reads chain state.
- Package, media, metadata, contract, or relationship data appropriate to Colander.

## Outputs

- Validated state for manual contract open.
- Inline status or error notice; no browser-native modal dependency inside embedded tools.
- System-event/audit handle where the feature mutates package, contract, pinning, hosting, or handoff state.

## Success Conditions

- Required fields are validated before pinning, export, deployment, or wallet signing.
- The generated package/metadata/operation is deterministic enough for replay or recovery.
- The user can see the resulting file, CID, KT1, op hash, page URL, graph state, or handoff target.
- The feature remains consistent between embedded and standalone distribution modes.

## Failure Conditions

- Missing or malformed input blocks progress with a visible in-page error.
- Wrong network, mismatched chain id, unavailable pinner, broken indexer, or rejected wallet signature does not mutate durable state as successful.
- Trusted-creator-only wtfOS pinning/hosting is unavailable to ordinary users and standalone builds.
- Recovery instructions identify whether the last durable artifact was a package, CID, operation hash, contract address, or hosted URL.

## Validation Tests

- Standalone validation: open Colander, exercise manual contract open, assert visible status and no console-modal dependency.
- Package/metadata validation: assert output schema and relationship metadata shape where applicable.
- Integration validation: run this feature after CH-EASE handoff or before Colander/WTF.ME/WTFOS flow when applicable.
- Deployment validation: for value-signing features, repeat on Shadownet with explicit RPC and chain-id proof.
