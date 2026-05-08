# Operator Signer Source Map

## Source

- `../building/wtf-operator-signer`
- Standalone Unix-socket signer daemon with Taquito signing, policy checks, audit logging, systemd unit, and deploy/provision scripts.

## Integrated Targets

- `shared/operator-signer.ts` owns the versioned request and response protocol.
- `server/features/operator-signer/client.ts` builds signer envelopes and talks to the Unix socket.
- `server/features/operator-signer/health.ts` exposes a short signer health probe.
- `server/lib/operator-signer-client.ts` remains as a compatibility re-export for existing routes.
- `extensions/wtf-operator-signer` owns the deployable signer daemon package.

## Notes

- Previous WTF app code sent a flat request containing `{ token, requestId, ...request }`.
- The daemon expected `{ auth, intent, payload }`.
- The integrated protocol is now `{ version, auth, requestId, runId, intent, payload }`, imported by both sides.
- Buyback actions are mapped to contract entrypoints in the server feature before signing:
  - `fund_buyback` -> `fund_xtz`
  - `withdraw_buyback_xtz` -> `withdraw_leftover_xtz`
  - `withdraw_buyback_wtf` -> `withdraw_accumulated_wtf`
  - `pause_buyback` -> `pause`
  - `unpause_buyback` -> `unpause`
