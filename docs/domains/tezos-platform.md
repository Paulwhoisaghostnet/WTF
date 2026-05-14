# Tezos Platform

## Purpose

The Tezos platform layer connects WTF to chain state: wallet login proofs, WTF FA2 balances, marketplace contracts, in-app market payments, subdomains, TzKT reads, and signer-backed platform operations.

## WTF OS Connection

Users see Tezos state through the wallet tray, profile, leaderboard, market, arcade payment flow, subdomain grants, and identity surfaces. Writes that spend or approve user funds must come from the user's wallet.

## Main Code

- `client/src/lib/tezos`
- `server/tzkt.ts`
- `server/lib/contract-config.ts`
- `server/features/wtf-subdomains`
- `server/features/operator-signer`
- `extensions/wtf-operator-signer`
- `contracts`

## Notes

Default RPCs should use supported providers such as TzKT-backed RPC, not ECAD endpoints. Platform signer operations must be audited, allowlisted, and isolated from browser/admin UI custody controls.

TzKT API/RPC ownership, cache rules, verification, and failure response live in [TzKT Upstream Runbook](../runbooks/tzkt-upstream.md).
