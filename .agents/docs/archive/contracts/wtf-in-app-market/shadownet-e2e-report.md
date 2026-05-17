# WTF In-App Market Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-05-17T17:09:59.741Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet
- Dummy WTF FA2: KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx
- Payment WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- WTF in-app market: KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC

```json
{
  "success": true,
  "contractAddress": "",
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0
  },
  "coverage": {
    "passed": true,
    "totalEntrypoints": 4,
    "coveredEntrypoints": 4,
    "missedEntrypoints": [],
    "wallets": [
      "bert",
      "ernie"
    ],
    "contracts": [
      {
        "id": "dummy_wtf",
        "address": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
        "totalEntrypoints": 3,
        "coveredEntrypoints": 3,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "mint": {
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
        "id": "in_app_market",
        "address": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
        "totalEntrypoints": 1,
        "coveredEntrypoints": 1,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "purchase": {
            "calls": 2,
            "wallets": [
              "ernie"
            ]
          }
        }
      }
    ]
  },
  "results": [
    {
      "label": "Mint dummy WTF to buyer",
      "wallet": "A",
      "contractAddress": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
      "entrypoint": "mint",
      "status": "passed",
      "hash": "oo3C7PZnREmyjNvTXZUdFwFcjQPxNSHZ24WQhBpEZHMeij4mTNV",
      "level": null
    },
    {
      "label": "Buyer approves market operator",
      "wallet": "B",
      "contractAddress": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "opPVtf16vL18XW3DWjVR7q8rpdxqs7NPFYKeTmiC75Q7yM5nuHx",
      "level": null
    },
    {
      "label": "Buyer purchases pet food",
      "wallet": "B",
      "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
      "entrypoint": "purchase",
      "status": "passed",
      "hash": "opRCybSCsW9rHYXwhYb6CLUnQMLu1L6C3cvXmiDkryGRdyAhVMw",
      "level": null,
      "assertions": [
        {
          "id": "in_app_market_token_address_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
          "target": "in_app_market",
          "path": "wtf_token_address",
          "expected": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "actual": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj"
        },
        {
          "id": "in_app_market_treasury_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
          "target": "in_app_market",
          "path": "treasury",
          "expected": "tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn",
          "actual": "tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn"
        },
        {
          "id": "in_app_market_zero_xtz_balance",
          "kind": "balance",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
          "target": "in_app_market",
          "expected": "0",
          "actual": "0"
        },
        {
          "id": "buyer_dummy_wtf_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
          "target": "dummy_wtf",
          "bigMap": "ledger",
          "key": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
          "expected": "100000000000",
          "actual": "100000000000"
        }
      ]
    },
    {
      "label": "Buyer transfers dummy WTF after purchase",
      "wallet": "B",
      "contractAddress": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "ooTVKJepfzDtBQG4wxqdNkfHnk93bAGLaCBVDwq3EdDpzQqJxcc",
      "level": null
    },
    {
      "label": "Reject XTZ attached to purchase",
      "wallet": "B",
      "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
      "entrypoint": "purchase",
      "status": "passed",
      "error": "NO_XTZ_IN"
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
    "assertionCount": 4
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
  "assertionCount": 8
}
```
