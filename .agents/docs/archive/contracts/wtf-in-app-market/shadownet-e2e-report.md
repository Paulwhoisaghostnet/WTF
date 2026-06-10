# WTF In-App Market Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-06-10T04:16:06.763Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet
- Kiln WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- WTF in-app market V2: KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t
- WTF in-app redemption escrow: KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS

```json
{
  "success": true,
  "contractAddress": "",
  "summary": {
    "total": 16,
    "passed": 16,
    "failed": 0
  },
  "coverage": {
    "passed": true,
    "totalEntrypoints": 10,
    "coveredEntrypoints": 10,
    "missedEntrypoints": [],
    "wallets": [
      "ernie",
      "bert"
    ],
    "contracts": [
      {
        "id": "dummy_wtf",
        "address": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
        "totalEntrypoints": 2,
        "coveredEntrypoints": 2,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "update_operators": {
            "calls": 2,
            "wallets": [
              "ernie",
              "bert"
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
        "address": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
        "totalEntrypoints": 1,
        "coveredEntrypoints": 1,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "purchase": {
            "calls": 3,
            "wallets": [
              "ernie"
            ]
          }
        }
      },
      {
        "id": "redemption_escrow",
        "address": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
        "totalEntrypoints": 7,
        "coveredEntrypoints": 7,
        "missedEntrypoints": [],
        "byEntrypoint": {
          "fund": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "create_redemption": {
            "calls": 2,
            "wallets": [
              "bert"
            ]
          },
          "claim_redemption": {
            "calls": 3,
            "wallets": [
              "ernie"
            ]
          },
          "cancel_redemption": {
            "calls": 1,
            "wallets": [
              "bert"
            ]
          },
          "return_unreserved_escrow": {
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
      "label": "Buyer approves market operator",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "opJf5ReVobi8NTwDjJRHhSXXSRYCF8AsJyayVJKx4Rc6J53T99o",
      "level": null
    },
    {
      "label": "Buyer purchases pet food",
      "wallet": "B",
      "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
      "entrypoint": "purchase",
      "status": "passed",
      "hash": "oomDuXV22f74HVJ27MENioQBQKZxiU7zem415BUM2HeJwaVFh7i",
      "level": null,
      "assertions": [
        {
          "id": "in_app_market_version_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
          "target": "in_app_market",
          "path": "version",
          "expected": "wtf-in-app-market-v2",
          "actual": "wtf-in-app-market-v2"
        },
        {
          "id": "in_app_market_token_address_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
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
          "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
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
          "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
          "target": "in_app_market",
          "expected": "0",
          "actual": "0"
        },
        {
          "id": "treasury_dummy_wtf_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "target": "dummy_wtf",
          "bigMap": "ledger",
          "key": "tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn",
          "expected": "6200010753",
          "actual": "6200010753"
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
          "expected": "2025339248",
          "actual": "2025339248"
        }
      ]
    },
    {
      "label": "Buyer transfers dummy WTF after purchase",
      "wallet": "B",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "transfer",
      "status": "passed",
      "hash": "opUDNdxGDo4Bn6ccq9z3bCYgajhRySx5E3AUMvX3BxFDJmQJfPX",
      "level": null
    },
    {
      "label": "Reject XTZ attached to purchase",
      "wallet": "B",
      "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
      "entrypoint": "purchase",
      "status": "passed",
      "error": "NO_XTZ_IN"
    },
    {
      "label": "Reject purchase with wrong expected treasury",
      "wallet": "B",
      "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
      "entrypoint": "purchase",
      "status": "passed",
      "error": "TREASURY_MISMATCH"
    },
    {
      "label": "Treasury approves redemption escrow operator",
      "wallet": "A",
      "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
      "entrypoint": "update_operators",
      "status": "passed",
      "hash": "oooHyW22zDGnhcqTQF2R52bUdvnFKd1r2bUMmzDsstr31xrBrXP",
      "level": null
    },
    {
      "label": "Treasury funds redemption escrow",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "fund",
      "status": "passed",
      "hash": "oo9C1d8FdqSWa7hE72BwFLdEUxWRtd7TSZMwtAH2ekMbmc8oqNJ",
      "level": null
    },
    {
      "label": "Admin returns one unreserved WTF unit from redemption escrow",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "return_unreserved_escrow",
      "status": "passed",
      "hash": "ooobyAuawNUicocc6SSm5MXxSAFYLWKLmvBtvDYJcdQrNUVKvH1",
      "level": null
    },
    {
      "label": "Admin creates WTF redemption",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "create_redemption",
      "status": "passed",
      "hash": "onfYAU4X5k9afw5573sPigLNaa4kMbS1wVGfR8HuSu5MyjwKw5q",
      "level": null
    },
    {
      "label": "Reject redemption claim with wrong expected amount",
      "wallet": "B",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "claim_redemption",
      "status": "passed",
      "error": "AMOUNT_MISMATCH"
    },
    {
      "label": "Admin creates cancellable WTF redemption",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "create_redemption",
      "status": "passed",
      "hash": "ong3GuCy5XCbv8EYGhLzQ3UaLmFmdUGYpDz3ACMfi2nPsLgH3od",
      "level": null
    },
    {
      "label": "Admin cancels second WTF redemption",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "cancel_redemption",
      "status": "passed",
      "hash": "onhZYWcNCSEoNy4PZLuZTsScYNkiumQPmeeFGhEdukQqab94Csn",
      "level": null
    },
    {
      "label": "Admin pauses redemption escrow",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "pause",
      "status": "passed",
      "hash": "onx6r6NTTWLL225R243NJYBe7KyAimM3UaqDCgnT4ouxLYqQn87",
      "level": null
    },
    {
      "label": "Reject claim while redemption escrow is paused",
      "wallet": "B",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "claim_redemption",
      "status": "passed",
      "error": "PAUSED"
    },
    {
      "label": "Admin unpauses redemption escrow",
      "wallet": "A",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "unpause",
      "status": "passed",
      "hash": "oo4DeD7hd9fQ49STM3EBada2wM26WqSdBRTFFtD5iEXEm2VzT2A",
      "level": null
    },
    {
      "label": "Buyer claims WTF redemption",
      "wallet": "B",
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "entrypoint": "claim_redemption",
      "status": "passed",
      "hash": "op1CTQxfZbrw7wc45YPjxAexEGGJSQpeBP8awV1NUVGenhgFPWb",
      "level": null,
      "assertions": [
        {
          "id": "redemption_escrow_token_address_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
          "target": "redemption_escrow",
          "path": "wtf_token_address",
          "expected": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "actual": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj"
        },
        {
          "id": "redemption_escrow_balance_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
          "target": "redemption_escrow",
          "path": "escrow_balance_wtf",
          "expected": "74999999",
          "actual": "74999999"
        },
        {
          "id": "redemption_escrow_reserved_storage",
          "kind": "storage",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
          "target": "redemption_escrow",
          "path": "reserved_wtf",
          "expected": "0",
          "actual": "0"
        },
        {
          "id": "redemption_escrow_zero_xtz_balance",
          "kind": "balance",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
          "target": "redemption_escrow",
          "expected": "0",
          "actual": "0"
        },
        {
          "id": "buyer_redeemed_wtf_ledger_big_map",
          "kind": "big_map",
          "status": "passed",
          "passed": true,
          "contractAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
          "target": "dummy_wtf",
          "bigMap": "ledger",
          "key": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
          "expected": "2050339247",
          "actual": "2050339247"
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
    "assertionCount": 11
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
  "assertionCount": 22
}
```
