# Pasta Protocol Rotini Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T00:01:16.778Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Rotini Shadownet generative deploy/create/mint/collect proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Collector wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz`
- Explorer: https://shadownet.tzkt.io/KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz

## Operations

- Origination: `onmFp1bkxq9spGiWCVCyeYMWRALuQrwmcLPHvgQ9N6Ts1xixsDX`
- Create tokens: `oo2mRGFGzWXo1aPradt5EDohggXhtJuECpWDtFbaXGXz2DHfjvu`, `oozC4ad3ZCywFZv4Fk61jTHwNm8Ax81Aqx3ZjwXFeeRtBJyhW5m`
- Mint generated editions: `op6MMHJbJukn6umKtAvYQampqpifqrmptppkQCDxiazLFVMZPW7`, `opTJp3FEvbZUqvBitwNx9gfR5ajxBNKggxyknr72ESkHep1cYXd`
- Transfer/collect: `oo13MwgeFP2bTbbeMzGda6futtrkwYgdBW9rV7P95TDgzDyUzqf`

## Indexed Proof

- Contract storage indexed ledger big map `26752`, token_metadata big map `26756`, and total_supply big map `26757`.
- Creator ledger big-map entry returned balance `1` for token 0.
- Collector ledger big-map entry returned balance `1` for token 1.
- Total supply big-map entries returned 0:1, 1:1.
- Token metadata big-map entries decoded to `Rotini Proof Seed #1` and `Rotini Proof Seed #2` with relationship, trait attributes, and Rotini DNA intact.
- Relationship group: `rotini-shadownet-e2e-mr1b70wd`
- Generation seed: `rotini-shadownet-e2e-tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`

## Scope

- This proves signer-backed Shadownet origination, deterministic generated-token metadata, token creation, minting, transfer/collect, total supply, and ownership resolution for Rotini generative collections.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander real-contract discovery, browser wallet batching, or every Pasta publisher variant.
