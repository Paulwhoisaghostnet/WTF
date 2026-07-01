# Pasta Protocol Ravioli Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T06:38:22.398Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Ravioli Shadownet bundle deploy/create/mint/transfer/redeem proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`
- Explorer: https://shadownet.tzkt.io/KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB

## Operations

- Origination: `ooDmME87nAtUV3geC9GvoGPDHzsjwDniCEqcJUuBqZQaYe82xHA`
- Create bundle: `op6ZN8ZSKJh3buMmKEzG49uW3FsapFrAj2EouxYJ9BSdEkVzGzt`
- Mint: `oouWdA3DA8y1Qnd41o2o953nLHEKHU4eoqbukux9yDhnwakdQaT`
- Transfer/collect: `onrLHw2CzkCPxwbVrRibuM9ESUEpY2FmoxqB9zUXJPxammdPRVQ`
- Redeem: `onwmjEHevLpqs8UGC7CojeGQswCXZweCQybi55YtpQLWMaFA2vn`

## Indexed Proof

- Contract storage indexed ledger big map `26808`, token_metadata big map `26814`, total_supply big map `26815`, bundles big map `26807`, and redeemed big map `26812`.
- Collector ledger big-map entry returned balance `1` for token 0 after redeeming one edition.
- Total supply big-map entry returned `2` for token 0 after one redeemed burn.
- Bundle big-map entry returned redeemable=`true`, mystery=`false`, item_count=`2`.
- Redeemed big-map entry returned `1` for token 0.
- Token metadata big-map entry decoded to `Ravioli Proof Bundle` with relationship and bundle manifest metadata intact.
- Relationship group: `ravioli-shadownet-e2e-mr1pdpt4`

## Scope

- This proves signer-backed Shadownet origination, bundle creation, minting, transfer/collect, redeem/burn, bundle config, redeemed count, metadata decoding, total supply, and ownership resolution for Ravioli bundles.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, mystery reveal, or every Pasta publisher variant.
