# Tezos Platform Registry

This registry is the operational companion to [tezos-platform.md](./tezos-platform.md). It covers chain, wallet, contract, and identity-adjacent platform surfaces.

## Command Palette Registry

Primary launchable surfaces:

- Tezos Intel
- Wallet preflight
- Contract Factory
- Operator Wallet
- Domain and chain support views

## MCP Registry

Platform work is often mediated by host-side scripts, wallet preflight, and audited admin surfaces. Any new Tezos MCP capability must be wired into the shared MCP manifest and the domain registry before it can be treated as real platform surface area.

## Event Registry

Common event families:

- `blockchain.tezos.*`
- `wallet.*`
- `contract_factory.*`
- `operator.*`
- `tezos_domains.*`
- `tezos_intel.*`

Registry rule:

- Any platform write must preserve chain evidence and rollback notes.
- Value-moving actions must stay preflighted and auditable.

## Install Policy

Tezos platform apps are only installable while their docs and install keys are fresh. If a platform surface changes, the registry has to be refreshed alongside the app/package acceptance record.

## Operating Procedures

1. Keep the chain, wallet, and contract surfaces auditable.
1. Never rely on a stale docs/install key when the app touches value or identity.
1. Cross-link new platform scripts in the acceptance registry before they ship.
