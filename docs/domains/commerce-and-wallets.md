# Commerce And Wallets

## Purpose

Commerce and wallet systems handle marketplace activity, in-app purchases, WTF token reads, user wallet connection, and platform wallet boundaries.

## WTF OS Connection

Marketplace, swap, in-app market checkout, and wallet tray/status surfaces run inside WTF OS. User purchases and approvals must use the connected user wallet, not a cached address alone.

## Main Code

- `client/src/lib/tezos`
- `client/src/lib/wallet-context.tsx`
- `server/routes/marketplace.ts`
- `server/routes/in-app-market.ts`
- `server/features/in-app-market`
- `server/features/operator-signer`
- `extensions/wtf-operator-signer`
- `contracts`

## Notes

User wallet writes require an active provider, Taquito signer attachment, and chain validation before operation submission. Platform wallets are backend-only signer resources; keys and keyrings must remain outside the repo and outside WTF OS UI.

Octez Connect is the primary wallet path. Beacon exists as a compatibility fallback. CSP and production recovery requirements live in [Wallet Connect Boundary](wallet-connect-boundary.md).
