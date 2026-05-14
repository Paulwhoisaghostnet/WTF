# Wallet Connect Boundary

## Purpose

WTF uses Octez Connect as the primary user-wallet path for Tezos account selection, signing, and contract writes. Beacon remains a compatibility fallback only. The boundary exists so wallet popups, relay traffic, and user-value writes keep working in production without weakening the whole app.

## Production Contract

- Octez Connect is initialized before Beacon in `client/src/lib/tezos/wallet.ts`.
- Wallet initialization is singleton-guarded by `adapterInitPromise`; user connect attempts are guarded by `connectPromise`.
- Contract writes call `assertNetworkReadyForSend()` before submission, which binds the active wallet account and RPC chain ID to the expected WTF network.
- Prepared writes that name an expected wallet address must fail when the active wallet differs.
- CSP must define `frame-src` and `child-src` explicitly. Wallet frames must not rely on `default-src`.
- CSP must allow Beacon, WalletConnect, and Reown frame origins. WalletConnect/Reown relay traffic must remain visible in `connect-src`.

## Verification

Run the local policy checks before changing wallet or CSP behavior:

```bash
npx tsx --test server/app-csp-policy.test.ts client/src/lib/tezos/wallet-connect-policy.test.ts
npm run check -- --pretty false
npm run test:e2e:inventory:coverage
```

After production deployment, verify the live header still exposes an explicit wallet frame policy:

```bash
curl -fsSI https://wtfgameshow.app
```

The `content-security-policy` header must include `frame-src` entries for `walletbeacon.io`, `walletconnect.com`, `walletconnect.org`, and `reown.com`.

## Recovery

If users report wallet chooser frame errors, inspect the live CSP header first. A report that says `frame-src` was not explicitly set means production is not running this contract. Restore the deployed build before changing wallet code.

If Octez Connect fails before a user can choose a wallet, the fallback may open Beacon for that session, but Octez Connect remains the primary path and should be repaired rather than feature-gated off.
