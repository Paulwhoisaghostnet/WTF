# Pasta Shadownet Pinning/Recovery Report

Date: 2026-07-01
Network: Tezos Shadownet (`NetXsqzbfFenSTS`)
Scope: source-level Pasta pinning and recovery proof

## Status

`PARTIAL`

The source proof validates public pin record shape and recovery coverage for the current Pasta Shadownet proof contracts. It does not prove live provider-side pinning, production PDS publication, production object mirror writes, or live `.well-known/wtfos-pins` resolution.

## Evidence

- Command: `npm run pasta:shadownet:pinning`
- Source: `server/features/ipfs-pinning/pasta-proof.ts`
- Tests:
  - `server/features/ipfs-pinning/pasta-proof.test.ts`
  - `server/features/ipfs-pinning/well-known-policy.test.ts`

The proof covers hosted pages, contract artifacts, token metadata, relationship metadata, SHA-256 checksums, IPFS gateway URLs, object-mirror keys, public pinPolicy/pinManifest/pinItem records, and recovery from `.well-known/wtfos-pins` through manifest and item records.

## Claim Boundary

This report supports a source-level Pasta pinning/recovery claim only. A production readiness claim still requires a live claimed WTF.ME host, a published PDS manifest URI, provider-side pin evidence, public recovery URLs, object-mirror fallback proof, and recovery after simulated provider/node loss.
