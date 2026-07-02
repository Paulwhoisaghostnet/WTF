# Shadownet Colander Discovery Report

- Status: PASSED
- Date: 2026-07-01T08:42:13Z
- Command: `npm run pasta:shadownet:colander`
- Runner: Playwright Chromium through the inventory harness on `HARNESS_PORT=4322`
- Network: Shadownet (`NetXsqzbfFenSTS`)
- RPC: `https://tezos-shadownet.octez.io/`
- Explorer host: `https://shadownet.tzkt.io`

## Contracts Opened

| App | Contract | Adapter | Relationship group | Required facts | Required actions |
| --- | --- | --- | --- | --- | --- |
| Spaghetti | `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc` | Standard collection | `spaghetti-shadownet-e2e-mr1oc17f` | Token types `1` | Transfer token, Mint more, Transfer admin |
| Gnocchi | `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK` | Open edition | `gnocchi-shadownet-e2e-mr1oadsz` | Token types `1` | Pause / resume sale, Transfer token, Mint more |
| Ravioli | `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB` | Bundle | `ravioli-shadownet-e2e-mr1pdpt4` | Token types `1` | Transfer token, Mint more, Transfer admin |
| Rotini | `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ` | Standard collection | `rotini-shadownet-e2e-mr1q9kcr` | Token types `2` | Transfer token, Mint more, Transfer admin |
| Penne | `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz` | Distribution | `penne-shadownet-e2e-mr1reng0` | Token types `1` | Open / close claim, Load recipients, Airdrop |
| Lasagna | `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r` | Exhibition | `lasagna-shadownet-e2e-mr1srf15` | Revisions `2` | Add curator, Publish revision, Set current revision |

## Proof

- Colander was opened through `/tools/colander` with `localStorage["wtf:network"] = "shadownet"`.
- Each current signer-backed proof contract opened successfully from the browser.
- Adapter detection came from live entrypoints exposed by the opened contract.
- The UI rendered the Shadownet explorer link for each KT1 through `https://shadownet.tzkt.io/{contract}`.
- Colander decoded relationship metadata from the contracts and rendered the expected relationship groups.
- The proof rejected the fallback-only state by asserting `No relationship metadata found` was absent.
- The proof observed `colander.contract_opened` and `colander.graph_viewed` interaction events in the inventory harness log.

## Scope Boundary

This proves browser-side Colander read discovery, adapter detection, relationship metadata rendering, action availability, Shadownet explorer routing, and inventory event emission for the six current Shadownet Pasta proof contracts.

This does not prove wallet-signed Colander management mutations, WTF.ME hosted Pasta pages, wtfOS hosted pinning/recovery, or mainnet deployment readiness.
