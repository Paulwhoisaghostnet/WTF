# WTF Marketplace V2 Existing Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-08T09:11:26.555Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet

## Addresses

- Existing Marketplace V2: KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy
- Kiln WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- Existing sample FA2: KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V

## Puppets

- Kiln wallet A/admin/seller: tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn
- Kiln wallet B/buyer: tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4

## Reused IDs

- Listing id: 2
- Accepted offer id: 4
- Cancelled offer id: 5
- Auction id: 2

## Expected Final Balances

- Buyer WTF units: 48250
- Buyer sample FA2 units: 9

## Result

```json
{
  "success": true,
  "contractAddress": "",
  "summary": {
    "total": 18,
    "passed": 18,
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
            "calls": 2,
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
      "hash": "ooaxiqVdkg7DREd5o8Q9zs2Qws6aL2KeTY55BRNxKRs6oGtitrz",
      "level": null
    },
    {
      "label": "Mint sample FA2 editions to seller",
      "wallet": "A",
      "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
      "entrypoint": "mint",
      "status": "passed",
      "hash": "onhpThpV9XSLk7vpb7V4XFhHZCAbk5PJQcbyXZRAQ8UK7RSsWYd",
      "level": null
    },
    {
      "label": "Seller approves existing Marketplace V2 for sample FA2",
      "wallet": "A",
      "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "op8nek3ntLn9uzLmTErHTYRbz9jhaQzivZJ1engKs9rUSEPsNYc",
      "level": null
    },
    {
      "label": "Buyer approves existing Marketplace V2 for Kiln WTF token",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "opTuTSgmHJN7rJj4485Tvw2NDM6irZUGXeeS1a1YoPNfvcSqmNg",
      "level": null
    },
    {
      "label": "Seller zero-transfers sample FA2 for coverage",
      "wallet": "A",
      "contractAddress": "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "ootCRbdsBFyfiaaepXwJ7NiwZjPxnbgtasEEsonUgQHxd2uqBy1",
      "level": null
    },
    {
      "label": "Buyer zero-transfers Kiln WTF token for coverage",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "opYCYFGejNXC6akPhgAwynzt5De1yGypWFh7SejAXcUKwaTib3w",
      "level": null
    },
    {
      "label": "Seller creates explicit quantity listing on existing Marketplace V2",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "create_listing",
      "status": "passed",
      "hash": "opEbfAWM88qPSefhNerpssM8JW6BhUc9vsdYF6rUt2CtbZF1Hfg",
      "level": null
    },
    {
      "label": "Buyer stale expected price is rejected",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "buy_listing",
      "status": "passed",
      "error": "PRICE_MISMATCH"
    },
    {
      "label": "Buyer buys two editions with expected terms",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "buy_listing",
      "status": "passed",
      "hash": "ooeiEPuMGpS9PRrZBwCmUnttv4vnFz3JwXmSYsR3jvnMPJXBFXX",
      "level": null
    },
    {
      "label": "Buyer places explicit quantity offer",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "place_offer",
      "status": "passed",
      "hash": "onynrnEFFKPssxKDGqLWH8b42qiSxiJYEFJTkwBXAhTqPv7C6BR",
      "level": null
    },
    {
      "label": "Seller accepts offer with expected terms",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "accept_offer",
      "status": "passed",
      "hash": "ooQ3HzBiEmxwYEQzMaBpX4ULjaXQ2oi5hXpwhQJuCP5keEneut9",
      "level": null
    },
    {
      "label": "Buyer places refundable offer",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "place_offer",
      "status": "passed",
      "hash": "opGkFYT6aqJcAUqG9rK17vxbaNivJ916Y84Eyv3oUsTpVyDDSWH",
      "level": null
    },
    {
      "label": "Buyer cancels offer and receives refund",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "cancel_offer",
      "status": "passed",
      "hash": "oneia43oJoKWF9Ju6HiwW9U5n4y5t77sXrwhKn5vcMNzRc9Apga",
      "level": null
    },
    {
      "label": "Seller creates auction with explicit quantity",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "create_auction",
      "status": "passed",
      "hash": "ookA53xcf9HnYBEAqhyNjK6BbM923dN6tokkXT313muKpTEj5PU",
      "level": null
    },
    {
      "label": "Seller cancels auction before bid",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "cancel_auction",
      "status": "passed",
      "hash": "opSB3cJvB9JBisoKKmmHQnehW3CVcvkYatNvnMsqHeh8CKPS4CR",
      "level": null
    },
    {
      "label": "Admin pauses existing Marketplace V2",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "pause",
      "status": "passed",
      "hash": "opB8kC4uiuP7DrJCVkanuL7KTXqDeHDJAo45Hqi9Umttepyf5N4",
      "level": null
    },
    {
      "label": "Paused existing Marketplace V2 rejects new offer",
      "wallet": "B",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "place_offer",
      "status": "passed",
      "error": "PAUSED"
    },
    {
      "label": "Admin unpauses existing Marketplace V2",
      "wallet": "A",
      "contractAddress": "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
      "entrypoint": "unpause",
      "status": "passed",
      "hash": "opKmHKFxuhG1AnVCm8Vtw1MZuttRtKKaRmCRRkz19gw24jjLBGy",
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
          "expected": "48250",
          "actual": "48250"
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
          "expected": "9",
          "actual": "9"
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
