# Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-09T18:32:11.876Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet

## Addresses

- Listing owner/admin: tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn
- Taker: tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4
- Configured WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- Exchange: KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF
- Listing id: 1
- Mint entrypoint: mint_tokens
- Token source: exchange storage

## Economic Terms

- Escrow mutez: 1000000
- Rate numerator mutez: 100
- Rate denominator WTF units: 1
- First fill WTF units: 1000
- First fill XTZ out mutez: 100000
- Second fill WTF units: 2000
- Second fill XTZ out mutez: 200000

## Result

```json
{
  "success": true,
  "contractAddress": "",
  "summary": {
    "total": 13,
    "passed": 13,
    "failed": 0
  },
  "coverage": {
    "passed": true,
    "totalEntrypoints": 8,
    "coveredEntrypoints": 8,
    "missedEntrypoints": [],
    "wallets": [
      "bert",
      "ernie"
    ],
    "contracts": [
      {
        "id": "wtf_token",
        "address": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
        "totalEntrypoints": 3,
        "coveredEntrypoints": 3,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "mint_tokens": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "update_operators": {
            "calls": 1,
            "wallets": [
              "ernie"
            ]
          },
          "transfer": {
            "calls": 1,
            "wallets": [
              "ernie"
            ]
          }
        }
      },
      {
        "id": "wtf_xtz_exchange",
        "address": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
        "totalEntrypoints": 5,
        "coveredEntrypoints": 5,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "create_listing": {
            "calls": 2,
            "wallets": [
              "bert"
            ]
          },
          "swap": {
            "calls": 5,
            "wallets": [
              "ernie"
            ]
          },
          "cancel_listing": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "pause": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "unpause": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          }
        }
      }
    ]
  },
  "results": [
    {
      "label": "Mint configured WTF to taker",
      "wallet": "A",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "mint_tokens",
      "status": "passed",
      "hash": "onmD2QJTuvZDim9CoHeTC3n9er8nKc9s1pU2ifwu9FoRiJxMkzn",
      "level": null
    },
    {
      "label": "Taker approves exchange as WTF operator",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "ooH7yM9zBepnpD25Zn68fV4H4PpzWSEQgvJ3X2nrWo6HSCsuLvY",
      "level": null
    },
    {
      "label": "Taker zero-transfers configured WTF for coverage",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "ooRo5e4snmx7dy72SxN669GGKP9E2r7Z5W7xYBFadXZtMX9F2Xh",
      "level": null
    },
    {
      "label": "Reject mismatched explicit escrow amount",
      "wallet": "A",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "create_listing",
      "status": "passed",
      "error": "ESCROW_AMOUNT_MISMATCH"
    },
    {
      "label": "Listing owner creates fixed-rate XTZ escrow listing",
      "wallet": "A",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "create_listing",
      "status": "passed",
      "hash": "ooQWJpJqG2QyRJrbRMgwMWLMbo4xKNu4MmcggiQ8AsgFt52xH1i",
      "level": null
    },
    {
      "label": "Admin pauses exchange",
      "wallet": "A",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "pause",
      "status": "passed",
      "hash": "ooN1QGwqu7eCXSe8kuEBdeHJ8iozd7X9oZQShJpQgtf6drY7QLm",
      "level": null
    },
    {
      "label": "Paused exchange rejects swap",
      "wallet": "B",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "swap",
      "status": "passed",
      "error": "PAUSED"
    },
    {
      "label": "Admin unpauses exchange",
      "wallet": "A",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "unpause",
      "status": "passed",
      "hash": "opBf4Vt4o4MjCaW8RJzCxhe7KAyLQghxrQjh8czH6edY7UKS16T",
      "level": null
    },
    {
      "label": "Reject stale expected XTZ output",
      "wallet": "B",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "swap",
      "status": "passed",
      "error": "XTZ_OUT_MISMATCH"
    },
    {
      "label": "Taker swaps first partial fill",
      "wallet": "B",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "swap",
      "status": "passed",
      "hash": "ooq3CWh5FbhEPVckWvBzmg1cjEww8W77xwqzt11pKe1hV3uNRpa",
      "level": null
    },
    {
      "label": "Taker swaps second partial fill",
      "wallet": "B",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "swap",
      "status": "passed",
      "hash": "onfJzs3Lqz3P6EiEdMokF6fcHMRMnJWVcA4HcttFwe1FjsdSHjc",
      "level": null
    },
    {
      "label": "Reject swap above remaining escrow",
      "wallet": "B",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "swap",
      "status": "passed",
      "error": "INSUFFICIENT_ESCROW"
    },
    {
      "label": "Listing owner cancels remaining escrow",
      "wallet": "A",
      "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
      "entrypoint": "cancel_listing",
      "status": "passed",
      "hash": "oodW8EVk9pwTyGb4GRbWexGCKkfzLawzLvskaUQQcUnzP6W8jYw",
      "level": null,
      "assertions": [
        {
          "id": "wtf_xtz_exchange_token_address_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
          "target": "wtf_xtz_exchange",
          "path": "wtf_token_address",
          "expected": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "actual": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj"
        },
        {
          "id": "wtf_xtz_exchange_unpaused_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
          "target": "wtf_xtz_exchange",
          "path": "paused",
          "expected": false,
          "actual": false
        },
        {
          "id": "wtf_xtz_exchange_balance_after_cancel",
          "kind": "balance",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1UTYBkXLWm6JDqFhEJmfeDmbZcK1avQGZF",
          "target": "wtf_xtz_exchange",
          "expected": "0",
          "actual": "0"
        },
        {
          "id": "owner_wtf_token_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "target": "wtf_token",
          "bigMap": "ledger",
          "key": "tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn",
          "expected": "5100010750",
          "actual": "5100010750"
        },
        {
          "id": "buyer_wtf_token_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "target": "wtf_token",
          "bigMap": "ledger",
          "key": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
          "expected": "339250",
          "actual": "339250"
        }
      ]
    }
  ],
  "assertionSummary": {
    "ok": true,
    "storage": true,
    "balance": true,
    "big_map": true,
    "passedKinds": [
      "storage",
      "balance",
      "big_map"
    ],
    "missingKinds": [],
    "assertionCount": 5
  },
  "networkId": "tezos-shadownet"
}
```

## Assertion Evidence

```json
{
  "ok": true,
  "passedKinds": [
    "storage",
    "balance",
    "big_map"
  ],
  "missingKinds": [],
  "assertionCount": 10
}
```
