# Pasta Protocol Spaghetti Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T05:33:47.994Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Spaghetti Shadownet deploy/mint/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1WwwBcnK5b9VLtWpq6jjHn9WE9KHwRyDdd`
- Explorer: https://shadownet.tzkt.io/KT1WwwBcnK5b9VLtWpq6jjHn9WE9KHwRyDdd

## Operations

- Origination: `ooP5aAfkximqFDCNTnh22TzMfanQtkeFVaMkF5hbTRyqY5FGoDX`
- Create token: `oojX42FnxhRUbv1PgwJ1imNxr3C3oyvRNUsEiJ7q4KfEBsfTW5W`
- Mint: `opQNNb6g3m6KsHosh4nqySpT6R2oee6Sw6qJNe8aXp4c5ocafgz`
- Transfer/collect: `ooQSU4TWL1gzEhp6KUnZtPEGqDyzbXB3hSdD7Wtwc6kjU4hgPcL`

## Indexed Proof

- Contract storage indexed ledger big map `26788` and token_metadata big map `26792`.
- Collector ledger big-map entry returned balance `1` for token 0.
- Token metadata big-map entry decoded to `Spaghetti Proof Token` with relationship metadata intact.
- Relationship group: `spaghetti-shadownet-e2e-mr1n351t`

## Scope

- This proves signer-backed Shadownet origination, token creation, mint, transfer/collect, and TzKT ownership resolution for Spaghetti standard collections.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander discovery, or every Pasta publisher variant.
