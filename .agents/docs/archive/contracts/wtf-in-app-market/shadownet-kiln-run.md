# WTF In-App Market Shadownet Kiln Run

- Attempted at: 2026-06-10T04:12:15.891Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet

## Health Probe

- HTTP status: 200
```json
{
  "status": "ok",
  "requestId": "46147c4b-d004-43a1-abbd-b929dbcd13f2",
  "network": "https://rpc.shadownet.teztnets.com",
  "chainId": "NetXsqzbfFenSTS",
  "networkId": "tezos-shadownet",
  "networkLabel": "Tezos Shadownet",
  "ecosystem": "tezos",
  "tokens": {
    "source": "named",
    "bronze": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
    "silver": "KT1SxqT3TUF44syQ5QauuF9L8upWjr4ayVoq",
    "gold": "KT1SVy1QrAnXB9oyGPWEbRnotrggPkHt2TLH",
    "platinum": "KT1KiGwrgfsg7sJTyJHkGstLY4YKfrHAf3TN",
    "diamond": "KT1JAaj2EUjGBfWmJGy3Z5UsoGus7iGVkvEG"
  },
  "activityLogPath": "/var/log/kiln/activity.log",
  "auth": {
    "required": true,
    "tokenConfigured": true,
    "mode": "token"
  }
}
```

## Capability Probe

- HTTP status: 200
```json
{
  "success": true,
  "runtime": {
    "network": {
      "id": "tezos-shadownet",
      "label": "Tezos Shadownet",
      "ecosystem": "tezos",
      "status": "active",
      "tier": "testnet",
      "accent": "success",
      "defaultRpcUrl": "https://rpc.shadownet.teztnets.com",
      "chainId": "NetXsqzbfFenSTS",
      "beaconNetworkName": "shadownet",
      "nativeSymbol": "tez",
      "explorerAddress": "https://shadownet.tzkt.io/{address}",
      "explorerTx": "https://shadownet.tzkt.io/{tx}",
      "blurb": "Public Tezos testnet with pre-funded Bert/Ernie puppets for live-chain testing.",
      "capabilities": {
        "walletConnect": true,
        "puppetWallets": true,
        "predeploy": true,
        "postdeployE2E": true,
        "sourceLanguages": [
          "michelson",
          "smartpy"
        ]
      },
      "rpcUrl": "https://rpc.shadownet.teztnets.com"
    },
    "defaultNetwork": {
      "id": "tezos-shadownet",
      "label": "Tezos Shadownet",
      "ecosystem": "tezos",
      "status": "active",
      "tier": "testnet",
      "accent": "success",
      "defaultRpcUrl": "https://rpc.shadownet.teztnets.com",
      "chainId": "NetXsqzbfFenSTS",
      "beaconNetworkName": "shadownet",
      "nativeSymbol": "tez",
      "explorerAddress": "https://shadownet.tzkt.io/{address}",
      "explorerTx": "https://shadownet.tzkt.io/{tx}",
      "blurb": "Public Tezos testnet with pre-funded Bert/Ernie puppets for live-chain testing.",
      "capabilities": {
        "walletConnect": true,
        "puppetWallets": true,
        "predeploy": true,
        "postdeployE2E": true,
        "sourceLanguages": [
          "michelson",
          "smartpy"
        ]
      },
      "rpcUrl": "https://rpc.shadownet.teztnets.com"
    },
    "clearanceRequired": true,
    "deployClearanceRequired": true,
    "shadowboxRequiredForClearance": true,
    "shadowbox": {
      "enabled": true,
      "requiredForClearance": true,
      "provider": "command",
      "limits": {
        "timeoutMs": 300000,
        "maxActiveJobs": 2,
        "maxActiveJobsPerIp": 1,
        "maxSourceBytes": 200000,
        "maxSteps": 80
      }
    },
    "auth": {
      "required": true,
      "tokenConfigured": true,
      "mode": "token"
    },
    "mcp": {
      "endpoint": "/mcp",
      "auth": "Bearer token generated from Settings after wallet login",
      "tokenTtlHours": 24
    }
  },
  "noStubPolicy": {
    "shadowboxMockClearance": "blocked",
    "unsupportedAssertions": "fail_closed",
    "incompleteAdapters": "planned_or_unavailable"
  },
  "projectWorkspace": {
    "manifest": "kiln.project.json",
    "status": "active-browser-workspace",
    "hostFilesystemBrowsing": "blocked"
  },
  "systemScenarios": {
    "payableTezosCalls": "supported",
    "multiContractTargets": "supported-in-live-e2e-payloads",
    "storageAssertions": "supported-in-live-e2e-runtime",
    "shadowboxMultiContract": "supported-in-command-provider"
  },
  "sources": {
    "supported": [
      "auto",
      "smartpy",
      "michelson"
    ],
    "uploadExtensions": [
      ".tz",
      ".json",
      ".smartpy",
      ".sp",
      ".py",
      ".txt",
      ".md"
    ]
  },
  "workflowStages": [
    "source_intake",
    "compile_if_needed",
    "validate",
    "audit",
    "simulate",
    "shadowbox_runtime",
    "clearance",
    "deploy",
    "post_deploy_e2e"
  ],
  "exports": {
    "source": [
      "smartpy",
      "michelson"
    ],
    "compiled": [
      "michelson (.tz)"
    ],
    "deliverables": [
      "mainnet-ready bundle (.zip)"
    ]
  },
  "entrypoints": {
    "guidedElements": "/api/kiln/contracts/guided/elements",
    "guidedCreate": "/api/kiln/contracts/guided/create",
    "audit": "/api/kiln/audit/run",
    "simulate": "/api/kiln/simulate/run",
    "shadowbox": "/api/kiln/shadowbox/run",
    "workflow": "/api/kiln/workflow/run",
    "deploy": "/api/kiln/upload",
    "execute": "/api/kiln/execute",
    "e2e": "/api/kiln/e2e/run",
    "balance": "/api/kiln/balances",
    "evmCompile": "/api/kiln/evm/compile",
    "evmEstimate": "/api/kiln/evm/estimate",
    "evmDryRun": "/api/kiln/evm/dry-run",
    "evmBalance": "/api/kiln/evm/balance",
    "bundle": "/api/kiln/export/bundle",
    "mcp": "/mcp"
  },
  "clients": {
    "ui": true,
    "cli": "npm run kiln:cli",
    "agentic": "Use /mcp after generating a 24-hour agent token from Settings."
  },
  "requestId": "15066dcc-420e-4f16-a6dc-694ce5dd690e"
}
```

## Unauthenticated Mutation Probe

- HTTP status: 200
```json
{
  "success": true,
  "networkId": "tezos-shadownet",
  "ecosystem": "tezos",
  "sourceType": "michelson",
  "compile": {
    "performed": false,
    "warnings": []
  },
  "artifacts": {
    "michelson": "parameter unit; storage unit; code { CAR; NIL operation; PAIR; }",
    "initialStorage": "Unit",
    "entrypoints": [],
    "entrypointMetadata": [],
    "codeHash": "cfc72e37a23356350a00536377695e876e1832762cb1a16b016bafa687f87882"
  },
  "validate": {
    "passed": true,
    "issues": [],
    "warnings": [
      "No annotated entrypoints were detected."
    ],
    "estimate": {
      "gasLimit": 1000,
      "storageLimit": 363,
      "suggestedFeeMutez": 357,
      "minimalFeeMutez": 337
    }
  },
  "audit": {
    "passed": true,
    "score": 88,
    "entrypoints": [],
    "findings": [
      {
        "id": "entrypoints_missing",
        "severity": "warning",
        "title": "No named entrypoints detected",
        "description": "The contract appears to use default-only parameters or unannotated branches.",
        "recommendation": "Annotate entrypoints with `%name` to improve tooling and UX."
      },
      {
        "id": "failwith_missing",
        "severity": "info",
        "title": "No FAILWITH checks detected",
        "description": "The contract may have limited explicit guardrails or revert messages.",
        "recommendation": "Add assertion/fail paths for access control, balance checks, and invariant enforcement."
      }
    ]
  },
  "simulation": {
    "success": true,
    "summary": {
      "total": 0,
      "passed": 0,
      "failed": 0
    },
    "generatedDefaultSteps": true,
    "steps": [],
    "state": {
      "paused": false,
      "totalSupply": 0,
      "listings": 0,
      "offers": 0,
      "swaps": 0,
      "auctions": 0,
      "barters": 0,
      "balances": {
        "bert": 1000000,
        "ernie": 1000000,
        "user": 1000000
      }
    },
    "coverage": {
      "passed": true,
      "totalEntrypoints": 0,
      "coveredEntrypoints": 0,
      "missedEntrypoints": [],
      "wallets": [],
      "contracts": [
        {
          "id": "contract",
          "totalEntrypoints": 0,
          "coveredEntrypoints": 0,
          "missedEntrypoints": [],
          "byEntrypoint": {}
        }
      ]
    },
    "warnings": []
  },
  "shadowbox": {
    "enabled": true,
    "requiredForClearance": true,
    "provider": "command",
    "executed": true,
    "passed": true,
    "jobId": "sbox_11f41d44-f111-459a-93a1-fd7487464c0a",
    "startedAt": "2026-06-10T04:12:17.453Z",
    "endedAt": "2026-06-10T04:12:44.587Z",
    "durationMs": 27134,
    "contractAddress": "KT1Ugzyaon5ZME1BCwS6s2DtippFzjtnY3vV",
    "contracts": [
      {
        "id": "shadowbox",
        "address": "KT1Ugzyaon5ZME1BCwS6s2DtippFzjtnY3vV"
      }
    ],
    "summary": {
      "total": 0,
      "passed": 0,
      "failed": 0
    },
    "steps": [],
    "warnings": []
  },
  "clearance": {
    "approved": true,
    "record": {
      "id": "clr_d335d522-398b-4a17-9a8e-9a4d7fe08ba3",
      "codeHash": "cfc72e37a23356350a00536377695e876e1832762cb1a16b016bafa687f87882",
      "createdAt": "2026-06-10T04:12:44.587Z",
      "expiresAt": "2026-06-10T10:12:44.587Z",
      "auditPassed": true,
      "simulationPassed": true,
      "shadowboxPassed": true
    }
  }
}
```

## Local Compact Compile

- Market V2 contract Michelson bytes: 2735
- Market V2 initial storage bytes: 123
- Redemption escrow contract Michelson bytes: 13572
- Redemption escrow initial storage bytes: 206

## Kiln Puppet Wallets

```json
{
  "networkId": "tezos-shadownet",
  "ecosystem": "tezos",
  "puppetsAvailable": true,
  "walletA": {
    "address": "tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn",
    "balance": 4879.577264
  },
  "walletB": {
    "address": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
    "balance": 4992.875567
  }
}
```

## Kiln WTF Token

- WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- Initial treasury WTF units: 6100010753
- Initial buyer WTF units: 2025339248

## Status

PASSED

## Contracts

- Kiln WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- WTF in-app market V2: KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t
- WTF in-app redemption escrow: KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS

## E2E Result

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

## E2E Assertion Evidence

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

## Raw Deployment Results

```json
{
  "wtfTokenAddress": "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj",
  "market": {
    "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
    "workflow": {
      "success": true,
      "networkId": "tezos-shadownet",
      "ecosystem": "tezos",
      "sourceType": "michelson",
      "compile": {
        "performed": false,
        "warnings": []
      },
      "artifacts": {
        "michelson": "parameter (or (unit %default) (pair %purchase (nat %listing_id) (pair (nat %amount_wtf_units) (pair (string %purchase_ref) (pair (string %cart_hash) (pair (address %expected_treasury) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id))))))));\nstorage   (pair (address %treasury) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))));\ncode\n{\nUNPAIR;\nIF_LEFT\n{\nDROP;\nPUSH bool False;\nIF\n{}\n{\nPUSH string \"DEFAULT_DISABLED\";\nFAILWITH;\n};\nNIL operation;\n}\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 3;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 5;\nSIZE;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EMPTY_PURCHASE_REF\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 5;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"PURCHASE_REF_TOO_LONG\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EMPTY_CART_HASH\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"CART_HASH_TOO_LONG\";\nFAILWITH;\n};\nPUSH string \"shadowbox\";\nDUP 2;\nGET 5;\nCOMPARE;\nEQ;\nIF\n{\nPUSH string \"shadowbox\";\nDUP 2;\nGET 7;\nCOMPARE;\nEQ;\n}\n{\nPUSH bool False;\n};\nIF\n{\nPUSH nat 1;\nDUP 2;\nGET 3;\nCOMPARE;\nEQ;\n}\n{\nPUSH bool False;\n};\nDUP;\nIF\n{}\n{\nDUP 3;\nCAR;\nDUP 3;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TREASURY_MISMATCH\";\nFAILWITH;\n};\nDUP 3;\nGET 5;\nDUP 3;\nGET 11;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 3;\nGET 6;\nDUP 3;\nGET 12;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\n};\nDUP 2;\nGET 3;\nDUP 4;\nGET 6;\nDUP 5;\nCAR;\nPAIR 3;\nDUP 4;\nGET 5;\nCONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));\nIF_NONE\n{\nPUSH string \"FA2_TRANSFER_ENTRYPOINT_MISSING\";\nFAILWITH;\n}\n{};\nNIL operation;\nDUP 2;\nPUSH mutez 0;\nNIL (pair address (list (pair address (pair nat nat))));\nNIL (pair address (pair nat nat));\nDUP 7;\nCONS;\nSENDER;\nPAIR;\nCONS;\nTRANSFER_TOKENS;\nCONS;\nDUP;\nDUP 7;\nGET 6;\nDUP 8;\nGET 5;\nDUP 9;\nCAR;\nDUP 9;\nGET 5;\nDUP 10;\nCAR;\nDUP 11;\nGET 7;\nSENDER;\nDUP 13;\nGET 3;\nPAIR 8;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nEMIT %purchase (pair (nat %amount_wtf_units) (pair (address %buyer) (pair (string %cart_hash) (pair (nat %listing_id) (pair (string %purchase_ref) (pair (address %treasury) (pair (address %wtf_token_address) (nat %wtf_token_id))))))));\nCONS;\n};\nNIL operation;\nSWAP;\nITER\n{\nCONS;\n};\nPAIR;\n};\nview\n\"get_payment_config\" unit (pair (address %treasury) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))))\n{\nUNPAIR;\nDUP 2;\nGET 6;\nDUP 3;\nGET 5;\nDUP 4;\nGET 3;\nDUP 5;\nCAR;\nPAIR 4;\nSWAP;\nDROP;\nSWAP;\nDROP;\n};",
        "initialStorage": "(Pair \"tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn\" (Pair \"wtf-in-app-market-v2\" (Pair \"KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj\" 0)))",
        "entrypoints": [
          "purchase"
        ],
        "entrypointMetadata": [
          {
            "name": "purchase",
            "args": [
              {
                "name": "listing_id",
                "type": "nat"
              },
              {
                "name": "amount_wtf_units",
                "type": "nat"
              },
              {
                "name": "purchase_ref",
                "type": "string"
              },
              {
                "name": "cart_hash",
                "type": "string"
              },
              {
                "name": "expected_treasury",
                "type": "address"
              },
              {
                "name": "expected_wtf_token_address",
                "type": "address"
              },
              {
                "name": "expected_wtf_token_id",
                "type": "nat"
              }
            ],
            "parameterType": "pair nat (pair nat (pair string (pair string (pair address (pair address nat)))))",
            "sampleArgs": [
              "(Pair 1 (Pair 1 (Pair \"shadowbox\" (Pair \"shadowbox\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1))))))"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "listing_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "amount_wtf_units": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "purchase_ref": {
                  "__michelsonType": "string",
                  "schema": "string"
                },
                "cart_hash": {
                  "__michelsonType": "string",
                  "schema": "string"
                },
                "expected_treasury": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_wtf_token_address": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_wtf_token_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                }
              }
            },
            "sampleJsArgs": [
              {
                "listing_id": 0,
                "amount_wtf_units": 1,
                "purchase_ref": "kiln-e2e",
                "cart_hash": "shadowbox",
                "expected_treasury": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_wtf_token_id": 1
              }
            ]
          }
        ],
        "codeHash": "a731a7f38e612064199b901d61f9819666fa57abc610bcb399c87d1b519c49ca"
      },
      "validate": {
        "passed": true,
        "issues": [],
        "warnings": [],
        "estimate": {
          "gasLimit": 1351,
          "storageLimit": 2369,
          "suggestedFeeMutez": 2181,
          "minimalFeeMutez": 2161
        }
      },
      "audit": {
        "passed": true,
        "score": 100,
        "entrypoints": [
          "purchase"
        ],
        "findings": []
      },
      "simulation": {
        "success": true,
        "summary": {
          "total": 1,
          "passed": 1,
          "failed": 0
        },
        "generatedDefaultSteps": true,
        "steps": [
          {
            "label": "contract: reach purchase",
            "wallet": "ernie",
            "entrypoint": "purchase",
            "status": "passed",
            "note": "Marketplace purchase simulated structurally because no listing setup entrypoint is available."
          }
        ],
        "state": {
          "paused": false,
          "totalSupply": 0,
          "listings": 0,
          "offers": 0,
          "swaps": 0,
          "auctions": 0,
          "barters": 0,
          "balances": {
            "bert": 1000000,
            "ernie": 1000000,
            "user": 1000000
          }
        },
        "coverage": {
          "passed": true,
          "totalEntrypoints": 1,
          "coveredEntrypoints": 1,
          "missedEntrypoints": [],
          "wallets": [
            "ernie"
          ],
          "contracts": [
            {
              "id": "contract",
              "totalEntrypoints": 1,
              "coveredEntrypoints": 1,
              "missedEntrypoints": [],
              "byEntrypoint": {
                "purchase": {
                  "calls": 1,
                  "wallets": [
                    "ernie"
                  ]
                }
              }
            }
          ]
        },
        "warnings": [
          "purchase has no generated listing setup step; treating it as structural reachability only."
        ]
      },
      "shadowbox": {
        "enabled": true,
        "requiredForClearance": true,
        "provider": "command",
        "executed": true,
        "passed": true,
        "jobId": "sbox_e088c5f6-a3af-4183-b5e1-7b32e95a2cc1",
        "startedAt": "2026-06-10T04:12:53.223Z",
        "endedAt": "2026-06-10T04:13:23.237Z",
        "durationMs": 30014,
        "contractAddress": "KT1NHcyf7EULzQXmCjoFpNKgdzzVBUQPwPHw",
        "contracts": [
          {
            "id": "shadowbox",
            "address": "KT1NHcyf7EULzQXmCjoFpNKgdzzVBUQPwPHw"
          },
          {
            "id": "shadowbox:dependency:1",
            "address": "KT1MzbUcdjD76nsDHTXHLSYnPK9LAXHRYeFA"
          }
        ],
        "summary": {
          "total": 1,
          "passed": 1,
          "failed": 0
        },
        "steps": [
          {
            "label": "contract: reach purchase",
            "wallet": "ernie",
            "entrypoint": "purchase",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          }
        ],
        "warnings": [
          "shadowbox: mapped 1 external KT1 reference(s) into Flextesa using fa2 fixture(s) for transfer: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj -> KT1MzbUcdjD76nsDHTXHLSYnPK9LAXHRYeFA.",
          "shadowbox: retried origination with normalized Michelson formatting.",
          "Shadowbox FA2 fixtures preloaded token_ids 0 and 1 for Bert/Ernie and approved originated target contracts as operators."
        ]
      },
      "clearance": {
        "approved": true,
        "record": {
          "id": "clr_12e52699-2ed1-4c4a-883d-348ca079156a",
          "codeHash": "a731a7f38e612064199b901d61f9819666fa57abc610bcb399c87d1b519c49ca",
          "createdAt": "2026-06-10T04:13:23.237Z",
          "expiresAt": "2026-06-10T10:13:23.237Z",
          "auditPassed": true,
          "simulationPassed": true,
          "shadowboxPassed": true
        }
      }
    },
    "upload": {
      "success": true,
      "contractAddress": "KT1JTqX6JfstTciECjzPZDDxovZ4XjS2pU5t",
      "injectedCode": "parameter (or (unit %default) (pair %purchase (nat %listing_id) (pair (nat %amount_wtf_units) (pair (string %purchase_ref) (pair (string %cart_hash) (pair (address %expected_treasury) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id))))))));\nstorage   (pair (address %treasury) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))));\ncode\n{\nUNPAIR;\nIF_LEFT\n{\nDROP;\nPUSH bool False;\nIF\n{}\n{\nPUSH string \"DEFAULT_DISABLED\";\nFAILWITH;\n};\nNIL operation;\n}\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 3;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 5;\nSIZE;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EMPTY_PURCHASE_REF\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 5;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"PURCHASE_REF_TOO_LONG\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EMPTY_CART_HASH\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"CART_HASH_TOO_LONG\";\nFAILWITH;\n};\nPUSH string \"shadowbox\";\nDUP 2;\nGET 5;\nCOMPARE;\nEQ;\nIF\n{\nPUSH string \"shadowbox\";\nDUP 2;\nGET 7;\nCOMPARE;\nEQ;\n}\n{\nPUSH bool False;\n};\nIF\n{\nPUSH nat 1;\nDUP 2;\nGET 3;\nCOMPARE;\nEQ;\n}\n{\nPUSH bool False;\n};\nDUP;\nIF\n{}\n{\nDUP 3;\nCAR;\nDUP 3;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TREASURY_MISMATCH\";\nFAILWITH;\n};\nDUP 3;\nGET 5;\nDUP 3;\nGET 11;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 3;\nGET 6;\nDUP 3;\nGET 12;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\n};\nDUP 2;\nGET 3;\nDUP 4;\nGET 6;\nDUP 5;\nCAR;\nPAIR 3;\nDUP 4;\nGET 5;\nCONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));\nIF_NONE\n{\nPUSH string \"FA2_TRANSFER_ENTRYPOINT_MISSING\";\nFAILWITH;\n}\n{};\nNIL operation;\nDUP 2;\nPUSH mutez 0;\nNIL (pair address (list (pair address (pair nat nat))));\nNIL (pair address (pair nat nat));\nDUP 7;\nCONS;\nSENDER;\nPAIR;\nCONS;\nTRANSFER_TOKENS;\nCONS;\nDUP;\nDUP 7;\nGET 6;\nDUP 8;\nGET 5;\nDUP 9;\nCAR;\nDUP 9;\nGET 5;\nDUP 10;\nCAR;\nDUP 11;\nGET 7;\nSENDER;\nDUP 13;\nGET 3;\nPAIR 8;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nEMIT %purchase (pair (nat %amount_wtf_units) (pair (address %buyer) (pair (string %cart_hash) (pair (nat %listing_id) (pair (string %purchase_ref) (pair (address %treasury) (pair (address %wtf_token_address) (nat %wtf_token_id))))))));\nCONS;\n};\nNIL operation;\nSWAP;\nITER\n{\nCONS;\n};\nPAIR;\n};\nview\n\"get_payment_config\" unit (pair (address %treasury) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))))\n{\nUNPAIR;\nDUP 2;\nGET 6;\nDUP 3;\nGET 5;\nDUP 4;\nGET 3;\nDUP 5;\nCAR;\nPAIR 4;\nSWAP;\nDROP;\nSWAP;\nDROP;\n};",
      "codeHash": "a731a7f38e612064199b901d61f9819666fa57abc610bcb399c87d1b519c49ca",
      "entrypoints": [
        {
          "name": "purchase",
          "args": [
            {
              "name": "listing_id",
              "type": "nat"
            },
            {
              "name": "amount_wtf_units",
              "type": "nat"
            },
            {
              "name": "purchase_ref",
              "type": "string"
            },
            {
              "name": "cart_hash",
              "type": "string"
            },
            {
              "name": "expected_treasury",
              "type": "address"
            },
            {
              "name": "expected_wtf_token_address",
              "type": "address"
            },
            {
              "name": "expected_wtf_token_id",
              "type": "nat"
            }
          ],
          "parameterType": "pair nat (pair nat (pair string (pair string (pair address (pair address nat)))))",
          "sampleArgs": [
            "(Pair 1 (Pair 1 (Pair \"shadowbox\" (Pair \"shadowbox\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1))))))"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "listing_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "amount_wtf_units": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "purchase_ref": {
                "__michelsonType": "string",
                "schema": "string"
              },
              "cart_hash": {
                "__michelsonType": "string",
                "schema": "string"
              },
              "expected_treasury": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_wtf_token_address": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_wtf_token_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              }
            }
          },
          "sampleJsArgs": [
            {
              "listing_id": 0,
              "amount_wtf_units": 1,
              "purchase_ref": "kiln-e2e",
              "cart_hash": "shadowbox",
              "expected_treasury": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_wtf_token_id": 1
            }
          ]
        }
      ],
      "networkId": "tezos-shadownet"
    },
    "directDeploy": false
  },
  "redemptionEscrow": {
    "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
    "workflow": {
      "success": true,
      "networkId": "tezos-shadownet",
      "ecosystem": "tezos",
      "sourceType": "michelson",
      "compile": {
        "performed": false,
        "warnings": []
      },
      "artifacts": {
        "michelson": "parameter (or (or (or (unit %accept_admin) (unit %cancel_pending_admin)) (or (nat %cancel_redemption) (or (pair %claim_redemption (nat %redemption_id) (pair (address %expected_claimant) (pair (nat %expected_amount_wtf_units) (pair (string %expected_item_ref) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id)))))) (pair %create_redemption (nat %redemption_id) (pair (address %claimant) (pair (nat %amount_wtf_units) (pair (string %item_ref) (timestamp %expires_at)))))))) (or (or (unit %default) (or (pair %fund (nat %amount_wtf_units) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id))) (unit %pause))) (or (address %propose_admin) (or (pair %return_unreserved_escrow (nat %amount_wtf_units) (pair (address %destination) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id)))) (unit %unpause)))));\nstorage   (pair (address %admin) (pair (nat %escrow_balance_wtf) (pair (big_map %metadata string bytes) (pair (bool %paused) (pair (option %pending_admin address) (pair (big_map %redemptions nat (pair (address %claimant) (pair (nat %amount_wtf_units) (pair (string %item_ref) (pair (timestamp %expires_at) (pair (nat %status_code) (pair (timestamp %created_at) (pair (option %claimed_at timestamp) (option %cancelled_at timestamp))))))))) (pair (nat %reserved_wtf) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))))))))));\ncode\n{\nLAMBDA\n(pair (pair address (pair address nat)) (pair (list operation) (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat)))))))))))\n(pair unit (pair (list operation) (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat)))))))))))\n{\nUNPAIR 3;\nSWAP;\nDUP 2;\nGET 4;\nDUP 4;\nGET 18;\nDUP 4;\nGET 3;\nPAIR 3;\nDUP 4;\nGET 17;\nCONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));\nIF_NONE\n{\nPUSH string \"FA2_TRANSFER_ENTRYPOINT_MISSING\";\nFAILWITH;\n}\n{};\nDIG 2;\nSWAP;\nPUSH mutez 0;\nNIL (pair address (list (pair address (pair nat nat))));\nNIL (pair address (pair nat nat));\nDIG 5;\nCONS;\nDIG 5;\nCAR;\nPAIR;\nCONS;\nTRANSFER_TOKENS;\nCONS;\nUNIT;\nPAIR 3;\n};\nSWAP;\nLAMBDA\n(pair unit (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n(pair nat (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n{\nCDR;\nDUP;\nGET 13;\nDUP 2;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_ACCOUNTING_UNDERFLOW\";\nFAILWITH;\n}\n{};\nPAIR;\n};\nSWAP;\nUNPAIR;\nIF_LEFT\n{\nIF_LEFT\n{\nDIG 3;\nDROP;\nIF_LEFT\n{\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nGET 9;\nIF_NONE\n{\nPUSH string \"NO_PENDING_ADMIN\";\nFAILWITH;\n}\n{};\nDUP;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_PENDING_ADMIN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nDIG 2;\nDUP 3;\nUPDATE 1;\nNONE address;\nUPDATE 9;\nDUG 2;\nNIL operation;\nSWAP;\nDIG 2;\nPAIR;\nEMIT %admin_accepted (pair (address %new_admin) (address %old_admin));\nCONS;\n}\n{\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nDUP;\nGET 9;\nDUP;\nIF_NONE\n{\nPUSH string \"NO_PENDING_ADMIN\";\nFAILWITH;\n}\n{\nDROP;\n};\nSWAP;\nNONE address;\nUPDATE 9;\nSWAP;\nIF_NONE\n{\nPUSH int 505;\nFAILWITH;\n}\n{};\nNIL operation;\nSWAP;\nSENDER;\nPAIR;\nEMIT %admin_proposal_cancelled (pair (address %admin) (address %cancelled_pending_admin));\nCONS;\n};\n}\n{\nIF_LEFT\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nMEM;\nIF\n{}\n{\nPUSH string \"NO_REDEMPTION\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nGET;\nIF_NONE\n{\nPUSH int 406;\nFAILWITH;\n}\n{};\nPUSH nat 0;\nDUP 2;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"REDEMPTION_NOT_ACTIVE\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 13;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"RESERVED_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 3;\nSWAP;\nUPDATE 13;\nDUG 2;\nPUSH nat 2;\nUPDATE 9;\nNOW;\nSOME;\nUPDATE 14;\nDIG 2;\nDUP;\nGET 11;\nDUP 3;\nSOME;\nDUP 5;\nUPDATE;\nUPDATE 11;\nDUG 2;\nNIL operation;\nDUP;\nDUP 5;\nGET 13;\nDUP 5;\nDUP 5;\nCAR;\nDUP 6;\nGET 3;\nPAIR 4;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %redemption_cancelled (pair (nat %amount_wtf_units) (pair (address %claimant) (pair (nat %redemption_id) (nat %reserved_wtf))));\nCONS;\n}\n{\nIF_LEFT\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nGET 7;\nIF\n{\nPUSH string \"PAUSED\";\nFAILWITH;\n}\n{};\nDUP 2;\nGET 11;\nDUP 2;\nCAR;\nMEM;\nIF\n{}\n{\nPUSH string \"NO_REDEMPTION\";\nFAILWITH;\n};\nDUP 2;\nGET 17;\nDUP 2;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 18;\nDUP 2;\nGET 10;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nCAR;\nGET;\nIF_NONE\n{\nPUSH int 356;\nFAILWITH;\n}\n{};\nPUSH nat 0;\nDUP 2;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"REDEMPTION_NOT_ACTIVE\";\nFAILWITH;\n};\nDUP;\nGET 7;\nNOW;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"REDEMPTION_EXPIRED\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_CLAIMANT\";\nFAILWITH;\n};\nDUP;\nCAR;\nDUP 3;\nGET 3;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"CLAIMANT_MISMATCH\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 3;\nGET 5;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"AMOUNT_MISMATCH\";\nFAILWITH;\n};\nDUP;\nGET 5;\nDUP 3;\nGET 7;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"ITEM_REF_MISMATCH\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 13;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"RESERVED_UNDERFLOW\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 3;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"ESCROW_UNDERFLOW\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 13;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"RESERVED_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 3;\nSWAP;\nUPDATE 13;\nDUG 2;\nDUP;\nGET 3;\nDUP 4;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 3;\nSWAP;\nUPDATE 3;\nDUG 2;\nPUSH nat 1;\nUPDATE 9;\nNOW;\nSOME;\nUPDATE 13;\nDIG 2;\nDUP;\nGET 11;\nDUP 3;\nSOME;\nDUP 5;\nCAR;\nUPDATE;\nUPDATE 11;\nDUG 2;\nNIL operation;\nDUP 6;\nDUP 3;\nGET 3;\nDUP 4;\nCAR;\nSELF_ADDRESS;\nPAIR 3;\nSWAP;\nDIG 5;\nDIG 3;\nDIG 3;\nPAIR 3;\nEXEC;\nCDR;\nUNPAIR;\nDIG 5;\nDIG 5;\nDIG 3;\nDIG 5;\nDIG 5;\nDIG 5;\nDUP;\nDUP 5;\nGET 13;\nDUP 5;\nCAR;\nDUP 5;\nGET 5;\nDUP 8;\nGET 3;\nDUP 7;\nCAR;\nDUP 8;\nGET 3;\nPAIR 6;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %redemption_claimed (pair (nat %amount_wtf_units) (pair (address %claimant) (pair (nat %escrow_balance_wtf) (pair (string %item_ref) (pair (nat %redemption_id) (nat %reserved_wtf))))));\nCONS;\n}\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nGET 7;\nIF\n{\nPUSH string \"PAUSED\";\nFAILWITH;\n}\n{};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 5;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EMPTY_ITEM_REF\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"ITEM_REF_TOO_LONG\";\nFAILWITH;\n};\nNOW;\nDUP 2;\nGET 8;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EXPIRED_REDEMPTION\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nCAR;\nMEM;\nIF\n{\nPUSH string \"REDEMPTION_EXISTS\";\nFAILWITH;\n}\n{};\nDUP;\nGET 5;\nDUP 4;\nUNIT;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDIG 5;\nDIG 5;\nDIG 3;\nDIG 5;\nDIG 5;\nDIG 5;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"INSUFFICIENT_ESCROW\";\nFAILWITH;\n};\nSWAP;\nDUP;\nGET 11;\nNONE timestamp;\nNONE timestamp;\nNOW;\nPUSH nat 0;\nDUP 7;\nGET 8;\nDUP 8;\nGET 7;\nDUP 9;\nGET 5;\nDUP 10;\nGET 3;\nPAIR 8;\nSOME;\nDUP 4;\nCAR;\nUPDATE;\nUPDATE 11;\nDUP;\nGET 13;\nDUP 3;\nGET 5;\nADD;\nUPDATE 13;\nSWAP;\nNIL operation;\nDUP;\nDUP 3;\nCAR;\nDUP 4;\nGET 7;\nDUP 5;\nGET 8;\nDUP 6;\nGET 3;\nDUP 7;\nGET 5;\nPAIR 5;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %redemption_created (pair (nat %amount_wtf_units) (pair (address %claimant) (pair (timestamp %expires_at) (pair (string %item_ref) (nat %redemption_id)))));\nCONS;\n};\n};\n};\n}\n{\nIF_LEFT\n{\nIF_LEFT\n{\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nPUSH bool False;\nIF\n{}\n{\nPUSH string \"DEFAULT_DISABLED\";\nFAILWITH;\n};\nNIL operation;\n}\n{\nIF_LEFT\n{\nDIG 2;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nGET 7;\nIF\n{\nPUSH string \"PAUSED\";\nFAILWITH;\n}\n{};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nCAR;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nDUP 2;\nGET 17;\nDUP 2;\nGET 3;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 18;\nDUP 2;\nGET 4;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\nNIL operation;\nDIG 3;\nDUP 3;\nCAR;\nSELF_ADDRESS;\nSENDER;\nPAIR 3;\nSWAP;\nDIG 4;\nDIG 3;\nDIG 3;\nPAIR 3;\nEXEC;\nCDR;\nUNPAIR;\nSWAP;\nDUP;\nGET 3;\nDUP 4;\nCAR;\nADD;\nUPDATE 3;\nDUG 2;\nSENDER;\nDUP 4;\nGET 3;\nDIG 3;\nCAR;\nPAIR 3;\nEMIT %escrow_funded (pair (nat %amount_wtf_units) (pair (nat %escrow_balance_wtf) (address %funder)));\nCONS;\n}\n{\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH bool True;\nUPDATE 7;\nNIL operation;\nSENDER;\nEMIT %paused address;\nCONS;\n};\n};\n}\n{\nIF_LEFT\n{\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nDUP 2;\nCOMPARE;\nNEQ;\nIF\n{}\n{\nPUSH string \"ADMIN_UNCHANGED\";\nFAILWITH;\n};\nSWAP;\nDUP 2;\nSOME;\nUPDATE 9;\nSWAP;\nNIL operation;\nSWAP;\nSENDER;\nPAIR;\nEMIT %admin_proposed (pair (address %current_admin) (address %pending_admin));\nCONS;\n}\n{\nIF_LEFT\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nCAR;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nDUP 2;\nGET 17;\nDUP 2;\nGET 5;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 18;\nDUP 2;\nGET 6;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\nDUP;\nCAR;\nDUP 4;\nUNIT;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDIG 5;\nDIG 5;\nDIG 3;\nDIG 5;\nDIG 5;\nDIG 5;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"INSUFFICIENT_UNRESERVED_ESCROW\";\nFAILWITH;\n};\nDUP;\nCAR;\nDUP 3;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 2;\nSWAP;\nUPDATE 3;\nSWAP;\nNIL operation;\nDUP 5;\nDUP 3;\nCAR;\nDUP 4;\nGET 3;\nSELF_ADDRESS;\nPAIR 3;\nSWAP;\nDIG 4;\nDIG 3;\nDIG 3;\nPAIR 3;\nEXEC;\nCDR;\nUNPAIR;\nDIG 4;\nDIG 4;\nDIG 3;\nDIG 4;\nDIG 4;\nDUP;\nDUP 4;\nGET 13;\nDUP 5;\nGET 3;\nDUP 5;\nGET 3;\nDUP 6;\nCAR;\nPAIR 4;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %escrow_returned (pair (nat %amount_wtf_units) (pair (address %destination) (pair (nat %escrow_balance_wtf) (nat %reserved_wtf))));\nCONS;\n}\n{\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH bool False;\nUPDATE 7;\nNIL operation;\nSENDER;\nEMIT %unpaused address;\nCONS;\n};\n};\n};\n};\nNIL operation;\nSWAP;\nITER\n{\nCONS;\n};\nPAIR;\n};\nview\n\"get_redemption\" nat (pair (address %claimant) (pair (nat %amount_wtf_units) (pair (string %item_ref) (pair (timestamp %expires_at) (pair (nat %status_code) (pair (timestamp %created_at) (pair (option %claimed_at timestamp) (option %cancelled_at timestamp))))))))\n{\nUNPAIR;\nDUP 2;\nGET 11;\nDUP 2;\nMEM;\nIF\n{}\n{\nPUSH string \"NO_REDEMPTION\";\nFAILWITH;\n};\nSWAP;\nGET 11;\nSWAP;\nGET;\nIF_NONE\n{\nPUSH int 513;\nFAILWITH;\n}\n{};\n};\nview\n\"get_escrow_state\" unit (pair (address %admin) (pair (nat %escrow_balance_wtf) (pair (bool %paused) (pair (nat %reserved_wtf) (pair (nat %unreserved_wtf) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))))))))\n{\nUNPAIR;\nLAMBDA\n(pair unit (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n(pair nat (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n{\nCDR;\nDUP;\nGET 13;\nDUP 2;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_ACCOUNTING_UNDERFLOW\";\nFAILWITH;\n}\n{};\nPAIR;\n};\nSWAP;\nDUP 3;\nGET 18;\nDUP 4;\nGET 17;\nDUP 5;\nGET 15;\nDUP 5;\nUNIT;\nSWAP;\nDIG 7;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 6;\nDUP 7;\nGET 13;\nDUP 8;\nGET 7;\nDUP 9;\nGET 3;\nDUP 10;\nCAR;\nPAIR 8;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n};",
        "initialStorage": "(Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 0 (Pair {Elt \"\" 0x} (Pair False (Pair None (Pair {} (Pair 0 (Pair \"wtf-in-app-redemption-escrow-v1\" (Pair \"KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj\" 0)))))))))",
        "entrypoints": [
          "accept_admin",
          "cancel_pending_admin",
          "cancel_redemption",
          "claim_redemption",
          "create_redemption",
          "fund",
          "pause",
          "propose_admin",
          "return_unreserved_escrow",
          "unpause"
        ],
        "entrypointMetadata": [
          {
            "name": "accept_admin",
            "args": [],
            "parameterType": "unit",
            "sampleArgs": [
              "Unit"
            ],
            "parameterSchema": {
              "__michelsonType": "unit",
              "schema": "unit"
            },
            "sampleJsArgs": []
          },
          {
            "name": "cancel_pending_admin",
            "args": [],
            "parameterType": "unit",
            "sampleArgs": [
              "Unit"
            ],
            "parameterSchema": {
              "__michelsonType": "unit",
              "schema": "unit"
            },
            "sampleJsArgs": []
          },
          {
            "name": "cancel_redemption",
            "args": [
              {
                "name": "arg0",
                "type": "nat"
              }
            ],
            "parameterType": "nat",
            "sampleArgs": [
              "1"
            ],
            "parameterSchema": {
              "__michelsonType": "nat",
              "schema": "nat"
            },
            "sampleJsArgs": [
              1
            ]
          },
          {
            "name": "claim_redemption",
            "args": [
              {
                "name": "redemption_id",
                "type": "nat"
              },
              {
                "name": "expected_claimant",
                "type": "address"
              },
              {
                "name": "expected_amount_wtf_units",
                "type": "nat"
              },
              {
                "name": "expected_item_ref",
                "type": "string"
              },
              {
                "name": "expected_wtf_token_address",
                "type": "address"
              },
              {
                "name": "expected_wtf_token_id",
                "type": "nat"
              }
            ],
            "parameterType": "pair nat (pair address (pair nat (pair string (pair address nat))))",
            "sampleArgs": [
              "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 1 (Pair \"shadowbox\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1)))))"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "redemption_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "expected_claimant": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_amount_wtf_units": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "expected_item_ref": {
                  "__michelsonType": "string",
                  "schema": "string"
                },
                "expected_wtf_token_address": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_wtf_token_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                }
              }
            },
            "sampleJsArgs": [
              {
                "redemption_id": 1,
                "expected_claimant": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_amount_wtf_units": 1,
                "expected_item_ref": "kiln-e2e",
                "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_wtf_token_id": 1
              }
            ]
          },
          {
            "name": "create_redemption",
            "args": [
              {
                "name": "redemption_id",
                "type": "nat"
              },
              {
                "name": "claimant",
                "type": "address"
              },
              {
                "name": "amount_wtf_units",
                "type": "nat"
              },
              {
                "name": "item_ref",
                "type": "string"
              },
              {
                "name": "expires_at",
                "type": "timestamp"
              }
            ],
            "parameterType": "pair nat (pair address (pair nat (pair string timestamp)))",
            "sampleArgs": [
              "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 1 (Pair \"shadowbox\" \"1970-01-01T00:00:00Z\"))))"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "redemption_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "claimant": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "amount_wtf_units": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "item_ref": {
                  "__michelsonType": "string",
                  "schema": "string"
                },
                "expires_at": {
                  "__michelsonType": "timestamp",
                  "schema": "timestamp"
                }
              }
            },
            "sampleJsArgs": [
              {
                "redemption_id": 1,
                "claimant": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "amount_wtf_units": 1,
                "item_ref": "kiln-e2e",
                "expires_at": "1970-01-01T00:00:00Z"
              }
            ]
          },
          {
            "name": "fund",
            "args": [
              {
                "name": "amount_wtf_units",
                "type": "nat"
              },
              {
                "name": "expected_wtf_token_address",
                "type": "address"
              },
              {
                "name": "expected_wtf_token_id",
                "type": "nat"
              }
            ],
            "parameterType": "pair nat (pair address nat)",
            "sampleArgs": [
              "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1))"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "amount_wtf_units": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "expected_wtf_token_address": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_wtf_token_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                }
              }
            },
            "sampleJsArgs": [
              {
                "amount_wtf_units": 1,
                "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_wtf_token_id": 1
              }
            ]
          },
          {
            "name": "pause",
            "args": [],
            "parameterType": "unit",
            "sampleArgs": [
              "Unit"
            ],
            "parameterSchema": {
              "__michelsonType": "unit",
              "schema": "unit"
            },
            "sampleJsArgs": []
          },
          {
            "name": "propose_admin",
            "args": [
              {
                "name": "arg0",
                "type": "address"
              }
            ],
            "parameterType": "address",
            "sampleArgs": [
              "\"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\""
            ],
            "parameterSchema": {
              "__michelsonType": "address",
              "schema": "address"
            },
            "sampleJsArgs": [
              "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"
            ]
          },
          {
            "name": "return_unreserved_escrow",
            "args": [
              {
                "name": "amount_wtf_units",
                "type": "nat"
              },
              {
                "name": "destination",
                "type": "address"
              },
              {
                "name": "expected_wtf_token_address",
                "type": "address"
              },
              {
                "name": "expected_wtf_token_id",
                "type": "nat"
              }
            ],
            "parameterType": "pair nat (pair address (pair address nat))",
            "sampleArgs": [
              "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1)))"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "amount_wtf_units": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "destination": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_wtf_token_address": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "expected_wtf_token_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                }
              }
            },
            "sampleJsArgs": [
              {
                "amount_wtf_units": 1,
                "destination": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "expected_wtf_token_id": 1
              }
            ]
          },
          {
            "name": "unpause",
            "args": [],
            "parameterType": "unit",
            "sampleArgs": [
              "Unit"
            ],
            "parameterSchema": {
              "__michelsonType": "unit",
              "schema": "unit"
            },
            "sampleJsArgs": []
          }
        ],
        "codeHash": "318f54bb9b612f5f1f8533cd1a76ea7467738f2c92b9c0cc2b38418ace9c40bb"
      },
      "validate": {
        "passed": true,
        "issues": [],
        "warnings": [],
        "estimate": {
          "gasLimit": 4383,
          "storageLimit": 9320,
          "suggestedFeeMutez": 8379,
          "minimalFeeMutez": 8359
        }
      },
      "audit": {
        "passed": true,
        "score": 100,
        "entrypoints": [
          "accept_admin",
          "cancel_pending_admin",
          "cancel_redemption",
          "claim_redemption",
          "create_redemption",
          "fund",
          "pause",
          "propose_admin",
          "return_unreserved_escrow",
          "unpause"
        ],
        "findings": []
      },
      "simulation": {
        "success": true,
        "summary": {
          "total": 12,
          "passed": 12,
          "failed": 0
        },
        "generatedDefaultSteps": false,
        "steps": [
          {
            "label": "Redemption workflow funds escrow",
            "wallet": "bert",
            "entrypoint": "fund",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow creates claimable redemption",
            "wallet": "bert",
            "entrypoint": "create_redemption",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow claims redemption",
            "wallet": "ernie",
            "entrypoint": "claim_redemption",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow creates cancellable redemption",
            "wallet": "bert",
            "entrypoint": "create_redemption",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow cancels redemption",
            "wallet": "bert",
            "entrypoint": "cancel_redemption",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow returns unreserved escrow",
            "wallet": "bert",
            "entrypoint": "return_unreserved_escrow",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow unpauses from admin",
            "wallet": "bert",
            "entrypoint": "unpause",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow proposes pending admin",
            "wallet": "bert",
            "entrypoint": "propose_admin",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow cancels pending admin",
            "wallet": "bert",
            "entrypoint": "cancel_pending_admin",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow proposes pending admin again",
            "wallet": "bert",
            "entrypoint": "propose_admin",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow accepts pending admin",
            "wallet": "ernie",
            "entrypoint": "accept_admin",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "Redemption workflow pauses last",
            "wallet": "ernie",
            "entrypoint": "pause",
            "status": "passed",
            "note": "Pause simulation set paused=true."
          }
        ],
        "state": {
          "paused": true,
          "totalSupply": 0,
          "listings": 0,
          "offers": 0,
          "swaps": 0,
          "auctions": 0,
          "barters": 0,
          "balances": {
            "bert": 1000000,
            "ernie": 1000000,
            "user": 1000000
          }
        },
        "coverage": {
          "passed": true,
          "totalEntrypoints": 10,
          "coveredEntrypoints": 10,
          "missedEntrypoints": [],
          "wallets": [
            "bert",
            "ernie"
          ],
          "contracts": [
            {
              "id": "contract",
              "totalEntrypoints": 10,
              "coveredEntrypoints": 10,
              "missedEntrypoints": [],
              "byEntrypoint": {
                "accept_admin": {
                  "calls": 1,
                  "wallets": [
                    "ernie"
                  ]
                },
                "cancel_pending_admin": {
                  "calls": 1,
                  "wallets": [
                    "bert"
                  ]
                },
                "cancel_redemption": {
                  "calls": 1,
                  "wallets": [
                    "bert"
                  ]
                },
                "claim_redemption": {
                  "calls": 1,
                  "wallets": [
                    "ernie"
                  ]
                },
                "create_redemption": {
                  "calls": 2,
                  "wallets": [
                    "bert"
                  ]
                },
                "fund": {
                  "calls": 1,
                  "wallets": [
                    "bert"
                  ]
                },
                "pause": {
                  "calls": 1,
                  "wallets": [
                    "ernie"
                  ]
                },
                "propose_admin": {
                  "calls": 2,
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
        "warnings": [
          "Opaque simulation for fund: no domain-specific model registered.",
          "Opaque simulation for create_redemption: no domain-specific model registered.",
          "Opaque simulation for claim_redemption: no domain-specific model registered.",
          "Opaque simulation for create_redemption: no domain-specific model registered.",
          "Opaque simulation for cancel_redemption: no domain-specific model registered.",
          "Opaque simulation for return_unreserved_escrow: no domain-specific model registered.",
          "Opaque simulation for unpause: no domain-specific model registered.",
          "Opaque simulation for propose_admin: no domain-specific model registered.",
          "Opaque simulation for cancel_pending_admin: no domain-specific model registered.",
          "Opaque simulation for propose_admin: no domain-specific model registered.",
          "Opaque simulation for accept_admin: no domain-specific model registered."
        ]
      },
      "shadowbox": {
        "enabled": true,
        "requiredForClearance": true,
        "provider": "command",
        "executed": true,
        "passed": true,
        "jobId": "sbox_fe27cc10-a830-4408-b96c-1cec34146ccf",
        "startedAt": "2026-06-10T04:13:34.086Z",
        "endedAt": "2026-06-10T04:14:23.417Z",
        "durationMs": 49331,
        "contractAddress": "KT18dnWaBHADmWRiPH8Ta8GUpywAgouNjnQB",
        "contracts": [
          {
            "id": "shadowbox",
            "address": "KT18dnWaBHADmWRiPH8Ta8GUpywAgouNjnQB"
          },
          {
            "id": "shadowbox:dependency:1",
            "address": "KT1MzbUcdjD76nsDHTXHLSYnPK9LAXHRYeFA"
          }
        ],
        "summary": {
          "total": 12,
          "passed": 12,
          "failed": 0
        },
        "steps": [
          {
            "label": "Redemption workflow funds escrow",
            "wallet": "bert",
            "entrypoint": "fund",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "onoXCTcuE7sdRu7FMbRDnBgAoH5kNWgsW2xsXCzhkw7enidjwnY"
          },
          {
            "label": "Redemption workflow creates claimable redemption",
            "wallet": "bert",
            "entrypoint": "create_redemption",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "opNtEw894pm4pBGzMbQa61SZB2aSoNjhCJZMz9qVTm9W1cizM5i"
          },
          {
            "label": "Redemption workflow claims redemption",
            "wallet": "ernie",
            "entrypoint": "claim_redemption",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "op31mNTZa7zf1xf7DNJBy5Ff7zm7hzJuSY3d8eJJ6WXNtexuNzt"
          },
          {
            "label": "Redemption workflow creates cancellable redemption",
            "wallet": "bert",
            "entrypoint": "create_redemption",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          },
          {
            "label": "Redemption workflow cancels redemption",
            "wallet": "bert",
            "entrypoint": "cancel_redemption",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "op175EdpvYCVHtsRbvLf6iY3xBy4uLS5zwBfUyt452rK7kdMnjK"
          },
          {
            "label": "Redemption workflow returns unreserved escrow",
            "wallet": "bert",
            "entrypoint": "return_unreserved_escrow",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "op8oCycprf5Lg6iSBt1FpKMTWmzjm29ga1PKNFWqtDFaraVZN87"
          },
          {
            "label": "Redemption workflow unpauses from admin",
            "wallet": "bert",
            "entrypoint": "unpause",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "opFPEXPDTZuqVi4M8wYwRecUjHckncsurujnQg3dpR87iTWRa5r"
          },
          {
            "label": "Redemption workflow proposes pending admin",
            "wallet": "bert",
            "entrypoint": "propose_admin",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "opVeyHfRdBun3Mgi1Lf139aSpaM676zEmSiepNSJqZrT3mjuCef"
          },
          {
            "label": "Redemption workflow cancels pending admin",
            "wallet": "bert",
            "entrypoint": "cancel_pending_admin",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "op8KneWVhACD4EyQvDPaq3Fn8QQddCwA3REij4dpPraTbmzqAzH"
          },
          {
            "label": "Redemption workflow proposes pending admin again",
            "wallet": "bert",
            "entrypoint": "propose_admin",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "onr4yZwMeSQLJo9VYnbXzMuiUPJ9QQs3fDZm5XkYgWKpcr29dNi"
          },
          {
            "label": "Redemption workflow accepts pending admin",
            "wallet": "ernie",
            "entrypoint": "accept_admin",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          },
          {
            "label": "Redemption workflow pauses last",
            "wallet": "ernie",
            "entrypoint": "pause",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "opJtAKTCyr9eq4oMpZDnBoiB2tLEcT3rYbWvim3c1VcV596aVwj"
          }
        ],
        "warnings": [
          "shadowbox: mapped 1 external KT1 reference(s) into Flextesa using fa2 fixture(s) for transfer: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj -> KT1MzbUcdjD76nsDHTXHLSYnPK9LAXHRYeFA.",
          "shadowbox: retried origination with normalized Michelson formatting.",
          "Shadowbox FA2 fixtures preloaded token_ids 0 and 1 for Bert/Ernie and approved originated target contracts as operators."
        ]
      },
      "clearance": {
        "approved": true,
        "record": {
          "id": "clr_9ef123b8-1ccb-4ce4-a719-2a6f2ef539d7",
          "codeHash": "318f54bb9b612f5f1f8533cd1a76ea7467738f2c92b9c0cc2b38418ace9c40bb",
          "createdAt": "2026-06-10T04:14:23.417Z",
          "expiresAt": "2026-06-10T10:14:23.417Z",
          "auditPassed": true,
          "simulationPassed": true,
          "shadowboxPassed": true
        }
      }
    },
    "upload": {
      "success": true,
      "contractAddress": "KT1GhdX4eaK785kuF1mnFpwc1CtSTJWY1gKS",
      "injectedCode": "parameter (or (or (or (unit %accept_admin) (unit %cancel_pending_admin)) (or (nat %cancel_redemption) (or (pair %claim_redemption (nat %redemption_id) (pair (address %expected_claimant) (pair (nat %expected_amount_wtf_units) (pair (string %expected_item_ref) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id)))))) (pair %create_redemption (nat %redemption_id) (pair (address %claimant) (pair (nat %amount_wtf_units) (pair (string %item_ref) (timestamp %expires_at)))))))) (or (or (unit %default) (or (pair %fund (nat %amount_wtf_units) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id))) (unit %pause))) (or (address %propose_admin) (or (pair %return_unreserved_escrow (nat %amount_wtf_units) (pair (address %destination) (pair (address %expected_wtf_token_address) (nat %expected_wtf_token_id)))) (unit %unpause)))));\nstorage   (pair (address %admin) (pair (nat %escrow_balance_wtf) (pair (big_map %metadata string bytes) (pair (bool %paused) (pair (option %pending_admin address) (pair (big_map %redemptions nat (pair (address %claimant) (pair (nat %amount_wtf_units) (pair (string %item_ref) (pair (timestamp %expires_at) (pair (nat %status_code) (pair (timestamp %created_at) (pair (option %claimed_at timestamp) (option %cancelled_at timestamp))))))))) (pair (nat %reserved_wtf) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))))))))));\ncode\n{\nLAMBDA\n(pair (pair address (pair address nat)) (pair (list operation) (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat)))))))))))\n(pair unit (pair (list operation) (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat)))))))))))\n{\nUNPAIR 3;\nSWAP;\nDUP 2;\nGET 4;\nDUP 4;\nGET 18;\nDUP 4;\nGET 3;\nPAIR 3;\nDUP 4;\nGET 17;\nCONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));\nIF_NONE\n{\nPUSH string \"FA2_TRANSFER_ENTRYPOINT_MISSING\";\nFAILWITH;\n}\n{};\nDIG 2;\nSWAP;\nPUSH mutez 0;\nNIL (pair address (list (pair address (pair nat nat))));\nNIL (pair address (pair nat nat));\nDIG 5;\nCONS;\nDIG 5;\nCAR;\nPAIR;\nCONS;\nTRANSFER_TOKENS;\nCONS;\nUNIT;\nPAIR 3;\n};\nSWAP;\nLAMBDA\n(pair unit (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n(pair nat (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n{\nCDR;\nDUP;\nGET 13;\nDUP 2;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_ACCOUNTING_UNDERFLOW\";\nFAILWITH;\n}\n{};\nPAIR;\n};\nSWAP;\nUNPAIR;\nIF_LEFT\n{\nIF_LEFT\n{\nDIG 3;\nDROP;\nIF_LEFT\n{\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nGET 9;\nIF_NONE\n{\nPUSH string \"NO_PENDING_ADMIN\";\nFAILWITH;\n}\n{};\nDUP;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_PENDING_ADMIN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nDIG 2;\nDUP 3;\nUPDATE 1;\nNONE address;\nUPDATE 9;\nDUG 2;\nNIL operation;\nSWAP;\nDIG 2;\nPAIR;\nEMIT %admin_accepted (pair (address %new_admin) (address %old_admin));\nCONS;\n}\n{\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nDUP;\nGET 9;\nDUP;\nIF_NONE\n{\nPUSH string \"NO_PENDING_ADMIN\";\nFAILWITH;\n}\n{\nDROP;\n};\nSWAP;\nNONE address;\nUPDATE 9;\nSWAP;\nIF_NONE\n{\nPUSH int 505;\nFAILWITH;\n}\n{};\nNIL operation;\nSWAP;\nSENDER;\nPAIR;\nEMIT %admin_proposal_cancelled (pair (address %admin) (address %cancelled_pending_admin));\nCONS;\n};\n}\n{\nIF_LEFT\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nMEM;\nIF\n{}\n{\nPUSH string \"NO_REDEMPTION\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nGET;\nIF_NONE\n{\nPUSH int 406;\nFAILWITH;\n}\n{};\nPUSH nat 0;\nDUP 2;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"REDEMPTION_NOT_ACTIVE\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 13;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"RESERVED_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 3;\nSWAP;\nUPDATE 13;\nDUG 2;\nPUSH nat 2;\nUPDATE 9;\nNOW;\nSOME;\nUPDATE 14;\nDIG 2;\nDUP;\nGET 11;\nDUP 3;\nSOME;\nDUP 5;\nUPDATE;\nUPDATE 11;\nDUG 2;\nNIL operation;\nDUP;\nDUP 5;\nGET 13;\nDUP 5;\nDUP 5;\nCAR;\nDUP 6;\nGET 3;\nPAIR 4;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %redemption_cancelled (pair (nat %amount_wtf_units) (pair (address %claimant) (pair (nat %redemption_id) (nat %reserved_wtf))));\nCONS;\n}\n{\nIF_LEFT\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nGET 7;\nIF\n{\nPUSH string \"PAUSED\";\nFAILWITH;\n}\n{};\nDUP 2;\nGET 11;\nDUP 2;\nCAR;\nMEM;\nIF\n{}\n{\nPUSH string \"NO_REDEMPTION\";\nFAILWITH;\n};\nDUP 2;\nGET 17;\nDUP 2;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 18;\nDUP 2;\nGET 10;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nCAR;\nGET;\nIF_NONE\n{\nPUSH int 356;\nFAILWITH;\n}\n{};\nPUSH nat 0;\nDUP 2;\nGET 9;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"REDEMPTION_NOT_ACTIVE\";\nFAILWITH;\n};\nDUP;\nGET 7;\nNOW;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"REDEMPTION_EXPIRED\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_CLAIMANT\";\nFAILWITH;\n};\nDUP;\nCAR;\nDUP 3;\nGET 3;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"CLAIMANT_MISMATCH\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 3;\nGET 5;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"AMOUNT_MISMATCH\";\nFAILWITH;\n};\nDUP;\nGET 5;\nDUP 3;\nGET 7;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"ITEM_REF_MISMATCH\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 13;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"RESERVED_UNDERFLOW\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 3;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"ESCROW_UNDERFLOW\";\nFAILWITH;\n};\nDUP;\nGET 3;\nDUP 4;\nGET 13;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"RESERVED_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 3;\nSWAP;\nUPDATE 13;\nDUG 2;\nDUP;\nGET 3;\nDUP 4;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 3;\nSWAP;\nUPDATE 3;\nDUG 2;\nPUSH nat 1;\nUPDATE 9;\nNOW;\nSOME;\nUPDATE 13;\nDIG 2;\nDUP;\nGET 11;\nDUP 3;\nSOME;\nDUP 5;\nCAR;\nUPDATE;\nUPDATE 11;\nDUG 2;\nNIL operation;\nDUP 6;\nDUP 3;\nGET 3;\nDUP 4;\nCAR;\nSELF_ADDRESS;\nPAIR 3;\nSWAP;\nDIG 5;\nDIG 3;\nDIG 3;\nPAIR 3;\nEXEC;\nCDR;\nUNPAIR;\nDIG 5;\nDIG 5;\nDIG 3;\nDIG 5;\nDIG 5;\nDIG 5;\nDUP;\nDUP 5;\nGET 13;\nDUP 5;\nCAR;\nDUP 5;\nGET 5;\nDUP 8;\nGET 3;\nDUP 7;\nCAR;\nDUP 8;\nGET 3;\nPAIR 6;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %redemption_claimed (pair (nat %amount_wtf_units) (pair (address %claimant) (pair (nat %escrow_balance_wtf) (pair (string %item_ref) (pair (nat %redemption_id) (nat %reserved_wtf))))));\nCONS;\n}\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nGET 7;\nIF\n{\nPUSH string \"PAUSED\";\nFAILWITH;\n}\n{};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 5;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EMPTY_ITEM_REF\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 7;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"ITEM_REF_TOO_LONG\";\nFAILWITH;\n};\nNOW;\nDUP 2;\nGET 8;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"EXPIRED_REDEMPTION\";\nFAILWITH;\n};\nDUP 2;\nGET 11;\nDUP 2;\nCAR;\nMEM;\nIF\n{\nPUSH string \"REDEMPTION_EXISTS\";\nFAILWITH;\n}\n{};\nDUP;\nGET 5;\nDUP 4;\nUNIT;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDIG 5;\nDIG 5;\nDIG 3;\nDIG 5;\nDIG 5;\nDIG 5;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"INSUFFICIENT_ESCROW\";\nFAILWITH;\n};\nSWAP;\nDUP;\nGET 11;\nNONE timestamp;\nNONE timestamp;\nNOW;\nPUSH nat 0;\nDUP 7;\nGET 8;\nDUP 8;\nGET 7;\nDUP 9;\nGET 5;\nDUP 10;\nGET 3;\nPAIR 8;\nSOME;\nDUP 4;\nCAR;\nUPDATE;\nUPDATE 11;\nDUP;\nGET 13;\nDUP 3;\nGET 5;\nADD;\nUPDATE 13;\nSWAP;\nNIL operation;\nDUP;\nDUP 3;\nCAR;\nDUP 4;\nGET 7;\nDUP 5;\nGET 8;\nDUP 6;\nGET 3;\nDUP 7;\nGET 5;\nPAIR 5;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %redemption_created (pair (nat %amount_wtf_units) (pair (address %claimant) (pair (timestamp %expires_at) (pair (string %item_ref) (nat %redemption_id)))));\nCONS;\n};\n};\n};\n}\n{\nIF_LEFT\n{\nIF_LEFT\n{\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nPUSH bool False;\nIF\n{}\n{\nPUSH string \"DEFAULT_DISABLED\";\nFAILWITH;\n};\nNIL operation;\n}\n{\nIF_LEFT\n{\nDIG 2;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nGET 7;\nIF\n{\nPUSH string \"PAUSED\";\nFAILWITH;\n}\n{};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nCAR;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nDUP 2;\nGET 17;\nDUP 2;\nGET 3;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 18;\nDUP 2;\nGET 4;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\nNIL operation;\nDIG 3;\nDUP 3;\nCAR;\nSELF_ADDRESS;\nSENDER;\nPAIR 3;\nSWAP;\nDIG 4;\nDIG 3;\nDIG 3;\nPAIR 3;\nEXEC;\nCDR;\nUNPAIR;\nSWAP;\nDUP;\nGET 3;\nDUP 4;\nCAR;\nADD;\nUPDATE 3;\nDUG 2;\nSENDER;\nDUP 4;\nGET 3;\nDIG 3;\nCAR;\nPAIR 3;\nEMIT %escrow_funded (pair (nat %amount_wtf_units) (pair (nat %escrow_balance_wtf) (address %funder)));\nCONS;\n}\n{\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH bool True;\nUPDATE 7;\nNIL operation;\nSENDER;\nEMIT %paused address;\nCONS;\n};\n};\n}\n{\nIF_LEFT\n{\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nDUP 2;\nCOMPARE;\nNEQ;\nIF\n{}\n{\nPUSH string \"ADMIN_UNCHANGED\";\nFAILWITH;\n};\nSWAP;\nDUP 2;\nSOME;\nUPDATE 9;\nSWAP;\nNIL operation;\nSWAP;\nSENDER;\nPAIR;\nEMIT %admin_proposed (pair (address %current_admin) (address %pending_admin));\nCONS;\n}\n{\nIF_LEFT\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP 2;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nCAR;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nDUP 2;\nGET 17;\nDUP 2;\nGET 5;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ADDRESS_MISMATCH\";\nFAILWITH;\n};\nDUP 2;\nGET 18;\nDUP 2;\nGET 6;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"TOKEN_ID_MISMATCH\";\nFAILWITH;\n};\nDUP;\nCAR;\nDUP 4;\nUNIT;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDIG 5;\nDIG 5;\nDIG 3;\nDIG 5;\nDIG 5;\nDIG 5;\nCOMPARE;\nGE;\nIF\n{}\n{\nPUSH string \"INSUFFICIENT_UNRESERVED_ESCROW\";\nFAILWITH;\n};\nDUP;\nCAR;\nDUP 3;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_UNDERFLOW\";\nFAILWITH;\n}\n{};\nDIG 2;\nSWAP;\nUPDATE 3;\nSWAP;\nNIL operation;\nDUP 5;\nDUP 3;\nCAR;\nDUP 4;\nGET 3;\nSELF_ADDRESS;\nPAIR 3;\nSWAP;\nDIG 4;\nDIG 3;\nDIG 3;\nPAIR 3;\nEXEC;\nCDR;\nUNPAIR;\nDIG 4;\nDIG 4;\nDIG 3;\nDIG 4;\nDIG 4;\nDUP;\nDUP 4;\nGET 13;\nDUP 5;\nGET 3;\nDUP 5;\nGET 3;\nDUP 6;\nCAR;\nPAIR 4;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nEMIT %escrow_returned (pair (nat %amount_wtf_units) (pair (address %destination) (pair (nat %escrow_balance_wtf) (nat %reserved_wtf))));\nCONS;\n}\n{\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NOT_ADMIN\";\nFAILWITH;\n};\nPUSH bool False;\nUPDATE 7;\nNIL operation;\nSENDER;\nEMIT %unpaused address;\nCONS;\n};\n};\n};\n};\nNIL operation;\nSWAP;\nITER\n{\nCONS;\n};\nPAIR;\n};\nview\n\"get_redemption\" nat (pair (address %claimant) (pair (nat %amount_wtf_units) (pair (string %item_ref) (pair (timestamp %expires_at) (pair (nat %status_code) (pair (timestamp %created_at) (pair (option %claimed_at timestamp) (option %cancelled_at timestamp))))))))\n{\nUNPAIR;\nDUP 2;\nGET 11;\nDUP 2;\nMEM;\nIF\n{}\n{\nPUSH string \"NO_REDEMPTION\";\nFAILWITH;\n};\nSWAP;\nGET 11;\nSWAP;\nGET;\nIF_NONE\n{\nPUSH int 513;\nFAILWITH;\n}\n{};\n};\nview\n\"get_escrow_state\" unit (pair (address %admin) (pair (nat %escrow_balance_wtf) (pair (bool %paused) (pair (nat %reserved_wtf) (pair (nat %unreserved_wtf) (pair (string %version) (pair (address %wtf_token_address) (nat %wtf_token_id))))))))\n{\nUNPAIR;\nLAMBDA\n(pair unit (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n(pair nat (pair address (pair nat (pair (big_map string bytes) (pair bool (pair (option address) (pair (big_map nat (pair address (pair nat (pair string (pair timestamp (pair nat (pair timestamp (pair (option timestamp) (option timestamp))))))))) (pair nat (pair string (pair address nat))))))))))\n{\nCDR;\nDUP;\nGET 13;\nDUP 2;\nGET 3;\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"ESCROW_ACCOUNTING_UNDERFLOW\";\nFAILWITH;\n}\n{};\nPAIR;\n};\nSWAP;\nDUP 3;\nGET 18;\nDUP 4;\nGET 17;\nDUP 5;\nGET 15;\nDUP 5;\nUNIT;\nSWAP;\nDIG 7;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 6;\nDUP 7;\nGET 13;\nDUP 8;\nGET 7;\nDUP 9;\nGET 3;\nDUP 10;\nCAR;\nPAIR 8;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n};",
      "codeHash": "318f54bb9b612f5f1f8533cd1a76ea7467738f2c92b9c0cc2b38418ace9c40bb",
      "entrypoints": [
        {
          "name": "accept_admin",
          "args": [],
          "parameterType": "unit",
          "sampleArgs": [
            "Unit"
          ],
          "parameterSchema": {
            "__michelsonType": "unit",
            "schema": "unit"
          },
          "sampleJsArgs": []
        },
        {
          "name": "cancel_pending_admin",
          "args": [],
          "parameterType": "unit",
          "sampleArgs": [
            "Unit"
          ],
          "parameterSchema": {
            "__michelsonType": "unit",
            "schema": "unit"
          },
          "sampleJsArgs": []
        },
        {
          "name": "cancel_redemption",
          "args": [
            {
              "name": "arg0",
              "type": "nat"
            }
          ],
          "parameterType": "nat",
          "sampleArgs": [
            "1"
          ],
          "parameterSchema": {
            "__michelsonType": "nat",
            "schema": "nat"
          },
          "sampleJsArgs": [
            1
          ]
        },
        {
          "name": "claim_redemption",
          "args": [
            {
              "name": "redemption_id",
              "type": "nat"
            },
            {
              "name": "expected_claimant",
              "type": "address"
            },
            {
              "name": "expected_amount_wtf_units",
              "type": "nat"
            },
            {
              "name": "expected_item_ref",
              "type": "string"
            },
            {
              "name": "expected_wtf_token_address",
              "type": "address"
            },
            {
              "name": "expected_wtf_token_id",
              "type": "nat"
            }
          ],
          "parameterType": "pair nat (pair address (pair nat (pair string (pair address nat))))",
          "sampleArgs": [
            "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 1 (Pair \"shadowbox\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1)))))"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "redemption_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "expected_claimant": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_amount_wtf_units": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "expected_item_ref": {
                "__michelsonType": "string",
                "schema": "string"
              },
              "expected_wtf_token_address": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_wtf_token_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              }
            }
          },
          "sampleJsArgs": [
            {
              "redemption_id": 1,
              "expected_claimant": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_amount_wtf_units": 1,
              "expected_item_ref": "kiln-e2e",
              "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_wtf_token_id": 1
            }
          ]
        },
        {
          "name": "create_redemption",
          "args": [
            {
              "name": "redemption_id",
              "type": "nat"
            },
            {
              "name": "claimant",
              "type": "address"
            },
            {
              "name": "amount_wtf_units",
              "type": "nat"
            },
            {
              "name": "item_ref",
              "type": "string"
            },
            {
              "name": "expires_at",
              "type": "timestamp"
            }
          ],
          "parameterType": "pair nat (pair address (pair nat (pair string timestamp)))",
          "sampleArgs": [
            "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 1 (Pair \"shadowbox\" \"1970-01-01T00:00:00Z\"))))"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "redemption_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "claimant": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "amount_wtf_units": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "item_ref": {
                "__michelsonType": "string",
                "schema": "string"
              },
              "expires_at": {
                "__michelsonType": "timestamp",
                "schema": "timestamp"
              }
            }
          },
          "sampleJsArgs": [
            {
              "redemption_id": 1,
              "claimant": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "amount_wtf_units": 1,
              "item_ref": "kiln-e2e",
              "expires_at": "1970-01-01T00:00:00Z"
            }
          ]
        },
        {
          "name": "fund",
          "args": [
            {
              "name": "amount_wtf_units",
              "type": "nat"
            },
            {
              "name": "expected_wtf_token_address",
              "type": "address"
            },
            {
              "name": "expected_wtf_token_id",
              "type": "nat"
            }
          ],
          "parameterType": "pair nat (pair address nat)",
          "sampleArgs": [
            "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1))"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "amount_wtf_units": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "expected_wtf_token_address": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_wtf_token_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              }
            }
          },
          "sampleJsArgs": [
            {
              "amount_wtf_units": 1,
              "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_wtf_token_id": 1
            }
          ]
        },
        {
          "name": "pause",
          "args": [],
          "parameterType": "unit",
          "sampleArgs": [
            "Unit"
          ],
          "parameterSchema": {
            "__michelsonType": "unit",
            "schema": "unit"
          },
          "sampleJsArgs": []
        },
        {
          "name": "propose_admin",
          "args": [
            {
              "name": "arg0",
              "type": "address"
            }
          ],
          "parameterType": "address",
          "sampleArgs": [
            "\"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\""
          ],
          "parameterSchema": {
            "__michelsonType": "address",
            "schema": "address"
          },
          "sampleJsArgs": [
            "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"
          ]
        },
        {
          "name": "return_unreserved_escrow",
          "args": [
            {
              "name": "amount_wtf_units",
              "type": "nat"
            },
            {
              "name": "destination",
              "type": "address"
            },
            {
              "name": "expected_wtf_token_address",
              "type": "address"
            },
            {
              "name": "expected_wtf_token_id",
              "type": "nat"
            }
          ],
          "parameterType": "pair nat (pair address (pair address nat))",
          "sampleArgs": [
            "(Pair 1 (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1)))"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "amount_wtf_units": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "destination": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_wtf_token_address": {
                "__michelsonType": "address",
                "schema": "address"
              },
              "expected_wtf_token_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              }
            }
          },
          "sampleJsArgs": [
            {
              "amount_wtf_units": 1,
              "destination": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_wtf_token_address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
              "expected_wtf_token_id": 1
            }
          ]
        },
        {
          "name": "unpause",
          "args": [],
          "parameterType": "unit",
          "sampleArgs": [
            "Unit"
          ],
          "parameterSchema": {
            "__michelsonType": "unit",
            "schema": "unit"
          },
          "sampleJsArgs": []
        }
      ],
      "networkId": "tezos-shadownet"
    },
    "directDeploy": false
  }
}
```
