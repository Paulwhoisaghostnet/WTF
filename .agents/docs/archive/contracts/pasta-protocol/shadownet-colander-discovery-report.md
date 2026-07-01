# Pasta Protocol Colander Shadownet Discovery Report

- Status: PASSED
- Timestamp: 2026-07-01T00:43:08Z
- Route: `/tools/colander`
- Browser proof: `npm run pasta:shadownet:colander`
- RPC/indexer target: Shadownet via the app `wtf:network=shadownet` setting

## Result

- Colander opened the signer-backed Shadownet proof contracts for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna from the real browser UI.
- Each contract resolved to the expected Pasta adapter and action controls.
- Each contract rendered a Shadownet TzKT explorer link instead of a mainnet explorer link.
- Each contract decoded relationship metadata from its on-chain contract metadata pointer, including the proof contracts that use `data:application/json;base64,...` metadata URIs.
- Colander emitted `colander.contract_opened` and `colander.graph_viewed` through the inventory harness.

## Contracts Opened

| App | Contract | Adapter | Relationship group |
| --- | --- | --- | --- |
| Spaghetti | `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH` | Standard collection | `spaghetti-shadownet-e2e-mr19mwvk` |
| Gnocchi | `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax` | Open edition | `gnocchi-shadownet-e2e-mr1aacew` |
| Ravioli | `KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG` | Bundle | `ravioli-shadownet-e2e-mr1ano0u` |
| Rotini | `KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz` | Standard collection | `rotini-shadownet-e2e-mr1b70wd` |
| Penne | `KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx` | Distribution | `penne-shadownet-e2e-mr1bvphs` |
| Lasagna | `KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN` | Exhibition | `lasagna-shadownet-e2e-mr1caxn6` |

## Code Corrections

- Colander metadata resolution now supports `ipfs://`, remote `https://`, and JSON `data:` URIs.
- Colander explorer links now route Shadownet contracts to `https://shadownet.tzkt.io`.
- Colander signed writes now call the shared `assertNetworkReadyForSend(me)` preflight before submitting wallet operations.
- The inventory-owned behavior assertion now points at the focused real-contract Playwright proof.

## Verification

- `npx tsx --test client/src/features/pasta-protocol/pasta-static-policy.test.ts`
- `npm run test:e2e:inventory:coverage`
- `npm run pasta:shadownet:colander`

## Scope

- This proves Colander browser discovery, adapter/action rendering, explorer routing, relationship metadata decoding, and event emission against the proven Shadownet contracts.
- It does not prove wallet-signed Colander mutation in a real browser wallet, WTF.ME hosted pages, wtfOS hosted pinning/recovery, or mainnet readiness.
