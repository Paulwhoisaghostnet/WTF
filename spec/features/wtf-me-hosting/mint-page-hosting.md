# WTF.ME Hosting: Mint page hosting

## Purpose

Prove that mint page hosting supports Pasta Protocol creator, collector, and operator workflows without hiding deployment, hosting, or availability state.

## Actor

Primary actor: Administrator. Secondary actors: Creator, Collector, Marketplace User.

## Preconditions

- The relevant Pasta app output exists.
- Required session, host, pinning, network, or puppet credentials are available.
- Any trusted-creator or production-only capability is explicitly gated.

## Inputs

- Pasta output artifact, package, CID, contract, URL, operation hash, or puppet actor state.

## Outputs

- Validation evidence and recovery status for mint page hosting.

## Success Conditions

- The user-visible resource remains reachable through the intended service.
- Verification can distinguish staged, pinned, hosted, deployed, indexed, and recovered states.

## Failure Conditions

- Missing provider, stale DNS/TLS, wrong network, unavailable RPC/indexer, or lost node data produces a recoverable state rather than a false success.

## Validation Tests

- Simulate the happy path and at least one provider failure.
- Assert the status copy names the failing boundary.
- Assert retry/recovery does not duplicate irreversible operations.
