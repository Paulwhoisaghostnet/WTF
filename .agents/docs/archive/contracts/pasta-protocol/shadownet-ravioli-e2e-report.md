# Pasta Protocol Ravioli Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-30T23:45:59.743Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Ravioli Shadownet bundle deploy/create/mint/transfer/redeem proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG`
- Explorer: https://shadownet.tzkt.io/KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG

## Operations

- Origination: `oojirLUzsPzxboT7ho4U7BTDAwybHMQPkod4CPwXsg7PvJg8Qex`
- Create bundle: `opaKa8dpR7gYigxMxVdmd2YndjDvkSDQm2rBToBsCaKKRw5Se8h`
- Mint: `onnBGuuK1oy1wdsECXjhHR9UAN2dEiWK3MhEnL5ATZ6znjMeT3P`
- Transfer/collect: `ootNj85u3S1vddi31ddttBc2v8PhFbrBnWHY83bJmSf7RFW85w2`
- Redeem: `oom9M9yq4ZRTHGGMA1myDS41EmCfr4iCqUTMfpPKwe6eUxreKHy`

## Indexed Proof

- Contract storage indexed ledger big map `26744`, token_metadata big map `26750`, total_supply big map `26751`, bundles big map `26743`, and redeemed big map `26748`.
- Collector ledger big-map entry returned balance `1` for token 0 after redeeming one edition.
- Total supply big-map entry returned `2` for token 0 after one redeemed burn.
- Bundle big-map entry returned redeemable=`true`, mystery=`false`, item_count=`2`.
- Redeemed big-map entry returned `1` for token 0.
- Token metadata big-map entry decoded to `Ravioli Proof Bundle` with relationship and bundle manifest metadata intact.
- Relationship group: `ravioli-shadownet-e2e-mr1ano0u`

## Scope

- This proves signer-backed Shadownet origination, bundle creation, minting, transfer/collect, redeem/burn, bundle config, redeemed count, metadata decoding, total supply, and ownership resolution for Ravioli bundles.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, mystery reveal, or every Pasta publisher variant.
