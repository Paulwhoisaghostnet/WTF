# Pasta Protocol Colander Shadownet Action Report

- Status: PASSED
- Timestamp: 2026-07-01T11:19:52.641Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Summary

- Proof type: signer-backed Colander adapter management action.
- Contract: `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r` (Lasagna / exhibition).
- Signer wallet id: `arcade-treasury`.
- Signer address: `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`.
- Adapter action: `set_current_revision(0)`.
- Operation hash: `oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h`.
- TzKT level: `4008347`.

## Evidence

- Shadownet RPC chain id matched `NetXsqzbfFenSTS` before signer load and before operation submission.
- The opened contract entrypoints detected the shared `exhibition` adapter through `detectPastaContract`.
- `availableActions` exposed Colander action `set_current_revision` in the `curation` group.
- Pre-operation storage had administrator equal to the collector signer, no pending administrator, revision count `2`, and current revision `0`.
- Taquito confirmed the submitted operation after one Shadownet confirmation.
- TzKT indexed the operation as an applied transaction from the administrator to the Lasagna proof contract with entrypoint `set_current_revision` and parameter `0`.
- Indexed post-operation storage still reports administrator, revision count `2`, and current revision `0`.

## Scope Boundary

- This proves a real signer-backed Colander management action against a current Shadownet Pasta proof contract.
- It intentionally uses an idempotent current-revision update so the proof does not alter the live proof graph semantics.
- It does not prove browser wallet UI submission, production WTF.ME hosting, live pin recovery, mainnet readiness, or every Colander action.
