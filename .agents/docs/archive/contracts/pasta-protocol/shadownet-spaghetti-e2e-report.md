# Pasta Protocol Spaghetti Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T06:08:50.166Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Spaghetti Shadownet deploy/mint/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`
- Explorer: https://shadownet.tzkt.io/KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc

## Operations

- Origination: `oo88bXJQvofrsMUkguvdm5cYqc191oibyqdMioyvKAtrqFYhAJB`
- Create token: `onyinAoomrdeo6kJrKw7yPMFF4G4MkcLyVoVTfWxmC51PJ3bp9V`
- Mint: `op2qSe5jNqcieMGzsXC52BkaCgtP9bmArndN2Pk1KkWGsuNQocX`
- Transfer/collect: `ooBgUrdzwoEBnQxGs4UmbGNwJSMHi3WrfeGmvbd2BWEdHVsHWRU`

## Indexed Proof

- Contract storage indexed ledger big map `26801` and token_metadata big map `26805`.
- Collector ledger big-map entry returned balance `1` for token 0.
- Token metadata big-map entry decoded to `Spaghetti Proof Token` with relationship metadata intact.
- Relationship group: `spaghetti-shadownet-e2e-mr1oc17f`

## Scope

- This proves signer-backed Shadownet origination, token creation, mint, transfer/collect, and TzKT ownership resolution for Spaghetti standard collections.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander discovery, or every Pasta publisher variant.
