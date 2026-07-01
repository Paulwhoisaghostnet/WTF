# Pasta Protocol Penne Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T00:20:40.922Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Penne Shadownet distribution deploy/configure/claim/airdrop proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx`
- Explorer: https://shadownet.tzkt.io/KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx

## Operations

- Origination: `oo7mA4ds4txrrsDZeQ4X5qDV2ERtxdXwiKDXH4j2GyuUL9hG96H`
- Create distribution token: `opDhqHgaP1dzb9Ty3xEBsEUW92mY9gNBjcMhFVd4Yx3AeQBfT9G`
- Set allocations: `op6orC8cmLjSNfWynp4ezDFqx4KufLUQA1KT7vmDQ3tMkpfsq9b`
- Open claim: `oorcEQCewpSa1XupXB4cq8W1YLRbhbxkggmZQBfR28gNWPcofUa`
- Collector claim: `ooARevfUWvyzostSimSfi5mSoz3kyWSbMZGSnHHfgECvrM9ceJT`
- Admin airdrop: `opCHwXiemfTzLjeowi9C37ZziEu2WMYDEGPwR34XPoMz3zrbvTY`
- Close claim: `oojDbTFGrTZgDRRdJGemh64q5s6QgiuvbiKU2xstwNv5YZ2pNmd`

## Indexed Proof

- Contract storage indexed ledger big map `26768`, token_metadata big map `26772`, total_supply big map `26773`, allocations big map `26766`, and claimed big map `26767`.
- Collector ledger big-map entry returned balance `2` after pull claim.
- Creator ledger big-map entry returned balance `3` after admin airdrop.
- Total supply big-map entry returned `5` for token 0.
- Claimed big-map entries returned collector=`2` and creator=`3`; active allocations were cleared for both recipients.
- Final claim window active state: `false`.
- Token metadata big-map entry decoded to `Penne Proof Distribution Token` with relationship metadata and distribution modes intact.
- Relationship group: `penne-shadownet-e2e-mr1bvphs`

## Scope

- This proves signer-backed Shadownet origination, token creation, allocation loading, claim-window configuration, recipient pull claim, admin push airdrop, allocation consumption, supply, ownership, claimed-state, and metadata resolution for Penne distributions.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, browser wallet batching, failure recovery, or every Pasta publisher variant.
