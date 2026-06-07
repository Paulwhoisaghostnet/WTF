# WTF Marketplace V2 Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-06T20:57:11.306Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet
- Kiln WTF FA2 (bronze): KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- Sample FA2: KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V
- WTF Marketplace V2: KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy

```json
{
  "success": true,
  "contractAddress": "",
  "summary": {
    "total": 17,
    "passed": 17,
    "failed": 0
  },
  "coverage": {
    "passed": true,
    "totalEntrypoints": 15,
    "coveredEntrypoints": 15,
    "missedEntrypoints": [],
    "wallets": [
      "bert",
      "ernie"
    ],
    "contracts": [
      {
        "id": "dummy_wtf",
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
        "id": "sample_fa2",
        "address": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
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
              "bert"
            ]
          },
          "transfer": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          }
        }
      },
      {
        "id": "marketplace_v2",
        "address": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
        "totalEntrypoints": 9,
        "coveredEntrypoints": 9,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "create_listing": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "buy_listing": {
            "calls": 1,
            "wallets": [
              "ernie"
            ]
          },
          "place_offer": {
            "calls": 3,
            "wallets": [
              "ernie"
            ]
          },
          "accept_offer": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "cancel_offer": {
            "calls": 1,
            "wallets": [
              "ernie"
            ]
          },
          "create_auction": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "cancel_auction": {
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
      "label": "Mint Kiln WTF token to buyer",
      "wallet": "A",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "mint_tokens",
      "status": "passed",
      "hash": "onoDZYiiSv9KpanJJXP8v1azTakT2hca9KMFzzuUQLP1upYaYKz",
      "level": null
    },
    {
      "label": "Mint sample FA2 editions to seller",
      "wallet": "A",
      "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
      "entrypoint": "mint",
      "status": "passed",
      "hash": "oo8XETPTkiTeui3wSiVkiVrW4k1RSB9wVh9fhXgJrphenCqSye2",
      "level": null
    },
    {
      "label": "Seller approves Marketplace V2 for sample FA2",
      "wallet": "A",
      "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "ooZu93W5dArptm4rNmv7ZxXFnNPV1VbYiZEcmtZVGBbuLSDMNpn",
      "level": null
    },
    {
      "label": "Seller zero-transfer sample FA2 for coverage",
      "wallet": "A",
      "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "opB3JwxhTh4kBqqGuQuFrwv1nxCuMocugbPpgXkhRxq3wy91kRA",
      "level": null
    },
    {
      "label": "Buyer approves Marketplace V2 for Kiln WTF token",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "ooePUEaznGzEbvBQryCE8czLCKw8pEGYo8twPaZHvLVQJC7ysdJ",
      "level": null
    },
    {
      "label": "Buyer zero-transfer Kiln WTF token for coverage",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "oo3C6v7Zf6ggE3ce4v6rjfrC1ynQUjYzodUgw9zN2sC4KyforeG",
      "level": null
    },
    {
      "label": "Seller creates explicit quantity listing",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "create_listing",
      "status": "passed",
      "hash": "ooJNyQac7VYTU4nfotr8rSShzuWapPbNFscoZRqC6zH7EDjum3J",
      "level": null
    },
    {
      "label": "Buyer buys two editions with expected terms",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "buy_listing",
      "status": "passed",
      "hash": "ooxXZ1aUYPRwoY4PfHihYeQa1KNTv4z5zVdv5LeffCAxa1ouRyt",
      "level": null
    },
    {
      "label": "Buyer places explicit quantity offer",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "place_offer",
      "status": "passed",
      "hash": "oofnrh93i4WsyKSw4th49rjbrgVDaeujFMwGo1aMnzMCTRb9vaU",
      "level": null
    },
    {
      "label": "Seller accepts offer with expected terms",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "accept_offer",
      "status": "passed",
      "hash": "ootcCfQh5A4QkeWecLfJ4jU1Nta4AckpdDJK3pwUYVtfyBr5N1V",
      "level": null
    },
    {
      "label": "Buyer places refundable offer",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "place_offer",
      "status": "passed",
      "hash": "ooVg6dZ9RVFdnT839sRNMdCwwYv64WXXAEY3vvMe979aMQL313S",
      "level": null
    },
    {
      "label": "Buyer cancels offer and receives refund",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "cancel_offer",
      "status": "passed",
      "hash": "oo4S2RTvpiDvoBFvaHPo8EDowWfnzzym1YkPauNYhwpU9s8seup",
      "level": null
    },
    {
      "label": "Seller creates auction with explicit quantity",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "create_auction",
      "status": "passed",
      "hash": "onqzHYz6SqFrRJTz3APyMkGuvmPJLbCy1tBw6shDvZ8WGTqAtzE",
      "level": null
    },
    {
      "label": "Seller cancels auction before bid",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "cancel_auction",
      "status": "passed",
      "hash": "oouoiqocsUTfN29dtbDHKpjphe5gYH6EMw6rPQBYrsQXjtUurT8",
      "level": null
    },
    {
      "label": "Admin pauses Marketplace V2",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "pause",
      "status": "passed",
      "hash": "opB523AgQF19eB1n2KjCt3tziCVD8VGQzDphDKrAB2zNUYAuRkK",
      "level": null
    },
    {
      "label": "Paused Marketplace V2 rejects new offer",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "place_offer",
      "status": "passed",
      "error": "PAUSED"
    },
    {
      "label": "Admin unpauses Marketplace V2",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "unpause",
      "status": "passed",
      "hash": "onk2NPgxP2mCeTLf4WzBsUtzdsVb67LuRGNFCWhcVZTgQdZX4qA",
      "level": null,
      "assertions": [
        {
          "id": "marketplace_v2_wtf_token_address_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
          "target": "marketplace_v2",
          "path": "wtf_token_address",
          "expected": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "actual": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj"
        },
        {
          "id": "marketplace_v2_unpaused_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
          "target": "marketplace_v2",
          "path": "paused",
          "expected": false,
          "actual": false
        },
        {
          "id": "marketplace_v2_zero_xtz_balance",
          "kind": "balance",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
          "target": "marketplace_v2",
          "expected": "0",
          "actual": "0"
        },
        {
          "id": "buyer_dummy_wtf_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "target": "dummy_wtf",
          "bigMap": "ledger",
          "key": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
          "expected": "28950",
          "actual": "28950"
        },
        {
          "id": "buyer_sample_fa2_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
          "target": "sample_fa2",
          "bigMap": "ledger",
          "key": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
          "expected": "3",
          "actual": "3"
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
