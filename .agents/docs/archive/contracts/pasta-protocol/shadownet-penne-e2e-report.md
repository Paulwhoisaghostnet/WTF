# Pasta Protocol Penne Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T07:35:27.779Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Penne Shadownet distribution deploy/configure/claim/airdrop proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`
- Explorer: https://shadownet.tzkt.io/KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz

## Operations

- Origination: `oo4EWt4cSBzh8YQXMvstowHos8FyBJ4hHCmQgn6N6Tjf5AqoMkN`
- Create distribution token: `oobqhAW2hYrFKgH8oUzVhDBXFNxgX2MjMezFrYcpBo5ePDJoo2n`
- Set allocations: `ooKD83y3BSchZp7ag4SNN9EmEzz3sv6CdusqHq6g9oTFhk9qcxU`
- Open claim: `opYFDNKKVqYCi6grnxmzptRFbmfUtymfYUzbV7EjnBh98sWFXq8`
- Collector claim: `oo5bYmyRD3jbNkrM55SEYgMQJLWXmiyGT9HGZAJkteAprBaiJGG`
- Admin airdrop: `onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq`
- Close claim: `ookcHpcnnux1bD1VsJ3AE9fAh9YQZ14LaG8tcF2nrLc4Fh6sg6n`

## Indexed Proof

- Contract storage indexed ledger big map `26824`, token_metadata big map `26828`, total_supply big map `26829`, allocations big map `26822`, and claimed big map `26823`.
- Collector ledger big-map entry returned balance `2` after pull claim.
- Creator ledger big-map entry returned balance `3` after admin airdrop.
- Total supply big-map entry returned `5` for token 0.
- Claimed big-map entries returned collector=`2` and creator=`3`; active allocations were cleared for both recipients.
- Final claim window active state: `false`.
- Token metadata big-map entry decoded to `Penne Proof Distribution Token` with relationship metadata and distribution modes intact.
- Relationship group: `penne-shadownet-e2e-mr1reng0`

## Scope

- This proves signer-backed Shadownet origination, token creation, allocation loading, claim-window configuration, recipient pull claim, admin push airdrop, allocation consumption, supply, ownership, claimed-state, and metadata resolution for Penne distributions.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, browser wallet batching, failure recovery, or every Pasta publisher variant.
