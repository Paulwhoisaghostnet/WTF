# Pasta Protocol Gnocchi Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T06:07:15.441Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Gnocchi Shadownet open-edition deploy/configure/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`
- Explorer: https://shadownet.tzkt.io/KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK

## Operations

- Origination: `ooApSTk1YyQGwUs5mKpVrGbHHfAgHmoSW7yB8KehDYypC3apk9R`
- Create open edition: `ooke2sTVMjnLLwqhH7hCfocGTanUBEDXfMoMdieJ2QJm2j2dQir`
- Collector open mint: `opHEtdBfjV4UjCcmVLLoeX8kPgMaborNoJ9m5JtDZhGWYWyNGAu`

## Indexed Proof

- Contract storage indexed ledger big map `26794`, token_metadata big map `26799`, total_supply big map `26800`, and sales big map `26798`.
- Collector ledger big-map entry returned balance `1` for token 0.
- Total supply big-map entry returned `1` for token 0.
- Sale big-map entry returned active=`true`, base_price=`1`, max_supply=`5`.
- Token metadata big-map entry decoded to `Gnocchi Proof Open Edition` with relationship metadata intact.
- Relationship group: `gnocchi-shadownet-e2e-mr1oadsz`

## Scope

- This proves signer-backed Shadownet origination, open-edition configuration, collector open mint, TzKT sale state, token supply, ownership, and metadata resolution for Gnocchi open editions.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, or every Pasta publisher variant.
