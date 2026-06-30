# Pasta Protocol Spaghetti Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-30T23:17:11.596Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Spaghetti Shadownet deploy/mint/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH`
- Explorer: https://shadownet.tzkt.io/KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH

## Operations

- Origination: `op3EUiVa4vLndQe49EMWUY3jQFGDtBmpDwHHAEpnM8uPAra2JMk`
- Create token: `opEms2XFiRrS5s8wU8VA47BF8wQBBEpc373QW7zDpyDLZ38tbvh`
- Mint: `oouZ5csYnV2KobvcwPdEfLbjLj5meD1ZpPSzBdnb53LMSx9i3Dr`
- Transfer/collect: `ooicX8mNH4zJASga466CSbKxHtnSAVAvwHKFTT2w81x792mjnwJ`

## Indexed Proof

- Contract storage indexed ledger big map `26723` and token_metadata big map `26727`.
- Collector ledger big-map entry returned balance `1` for token 0.
- Token metadata big-map entry decoded to `Spaghetti Proof Token` with relationship metadata intact.
- Relationship group: `spaghetti-shadownet-e2e-mr19mwvk`

## Scope

- This proves signer-backed Shadownet origination, token creation, mint, transfer/collect, and TzKT ownership resolution for Spaghetti standard collections.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, or every Pasta publisher variant.
