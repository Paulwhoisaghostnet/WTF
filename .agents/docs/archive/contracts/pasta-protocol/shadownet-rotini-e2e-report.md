# Pasta Protocol Rotini Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T07:03:41.894Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Rotini Shadownet generative deploy/create/mint/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`
- Explorer: https://shadownet.tzkt.io/KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ

## Operations

- Origination: `onrxE91pZk6rTW7otoyG6s9FvLoekHo4ndZ4RNEWsrVAsjdRodm`
- Create tokens: `onicHoBgNmamf2JxjkRHmBzr65CtEeqL6TSYDTZ4iBMJQbD1Y7c`, `opJtvPJcV9PrYoVLBVbZ3fS83Wj5RztQREXSgRKrZnH4tcfCzAF`
- Mint generated editions: `ooaGZNnptXs9bXsadHNAEeRa6rWercLXNuv2EQj4CfkS3vLtUwT`, `ooSrWREnWxY7G4sv8moSyxwis3nB1sxtQX6HfKycNzm3wtjBuBT`
- Transfer/collect: `ooYCs8knzTnubXY4Uug3DokTjK42ULpxpkK6rUfvvM7Y1V4ywt6`

## Indexed Proof

- Contract storage indexed ledger big map `26816`, token_metadata big map `26820`, and total_supply big map `26821`.
- Creator ledger big-map entry returned balance `1` for token 0.
- Collector ledger big-map entry returned balance `1` for token 1.
- Total supply big-map entries returned 0:1, 1:1.
- Token metadata big-map entries decoded to `Rotini Proof Seed #1` and `Rotini Proof Seed #2` with relationship, trait attributes, and Rotini DNA intact.
- Relationship group: `rotini-shadownet-e2e-mr1q9kcr`
- Generation seed: `rotini-shadownet-e2e-tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`

## Scope

- This proves signer-backed Shadownet origination, deterministic generated-token metadata, token creation, minting, transfer/collect, total supply, and ownership resolution for Rotini generative collections.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, browser wallet batching, or every Pasta publisher variant.
