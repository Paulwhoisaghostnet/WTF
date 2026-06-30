# Pasta Protocol Gnocchi Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-30T23:35:18.146Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Gnocchi Shadownet open-edition deploy/configure/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax`
- Explorer: https://shadownet.tzkt.io/KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax

## Operations

- Origination: `opDUEStNnLYbs6joZf6zqMneGgosA5SvtVo7zNAyHmgHbTYP2Sc`
- Create open edition: `opPeyD3UhCy4nC23JKPNbvVMjAH9ZHcjAweX288eAg9qSia4xMN`
- Collector open mint: `op2jCQSH4yFF9bzjc8z8o6AmYmGLfBKNMmjAtDaNCiuQvREijay`

## Indexed Proof

- Contract storage indexed ledger big map `26736`, token_metadata big map `26741`, total_supply big map `26742`, and sales big map `26740`.
- Collector ledger big-map entry returned balance `1` for token 0.
- Total supply big-map entry returned `1` for token 0.
- Sale big-map entry returned active=`true`, base_price=`1`, max_supply=`5`.
- Token metadata big-map entry decoded to `Gnocchi Proof Open Edition` with relationship metadata intact.
- Relationship group: `gnocchi-shadownet-e2e-mr1aacew`

## Scope

- This proves signer-backed Shadownet origination, open-edition configuration, collector open mint, TzKT sale state, token supply, ownership, and metadata resolution for Gnocchi open editions.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, or every Pasta publisher variant.
