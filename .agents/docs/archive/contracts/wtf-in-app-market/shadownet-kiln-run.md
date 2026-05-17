# WTF In-App Market Shadownet Kiln Run

- Attempted at: 2026-05-17T17:07:57.177Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet

## Health Probe

- HTTP status: 200
```json
{
  "status": "ok",
  "requestId": "97acc082-5c9a-4750-89c4-e3a443bf3824",
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
  "requestId": "562f59f2-17cd-4ebb-aa41-a7e4319ab242"
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
    "jobId": "sbox_9a3ebdd1-1e55-4cc7-a4b3-af234620932f",
    "startedAt": "2026-05-17T17:07:59.257Z",
    "endedAt": "2026-05-17T17:08:11.734Z",
    "durationMs": 12477,
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
      "id": "clr_ecba3496-8275-411c-bf9d-02406a79e656",
      "codeHash": "cfc72e37a23356350a00536377695e876e1832762cb1a16b016bafa687f87882",
      "createdAt": "2026-05-17T17:08:11.735Z",
      "expiresAt": "2026-05-17T23:08:11.735Z",
      "auditPassed": true,
      "simulationPassed": true,
      "shadowboxPassed": true
    }
  }
}
```

## Local Compact Compile

- Contract Michelson bytes: 1048
- Initial storage bytes: 93

## Kiln Puppet Wallets

```json
{
  "networkId": "tezos-shadownet",
  "ecosystem": "tezos",
  "puppetsAvailable": true,
  "walletA": {
    "address": "tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn",
    "balance": 4971.30989
  },
  "walletB": {
    "address": "tz1gQyc3ZrMtg1ztDvpS2okyUH2yvoKsFnL4",
    "balance": 4997.201792
  }
}
```

## Status

PASSED

## Contracts

- Dummy WTF FA2: KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx
- Payment WTF FA2: KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj
- WTF in-app market: KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC

## E2E Result

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
  "assertionCount": 8
}
```

## Raw Deployment Results

```json
{
  "dummy": {
    "contractAddress": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
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
        "michelson": "parameter (or (or (pair %balance_of (list %requests (pair (address %owner) (nat %token_id))) (contract %callback (list (pair (pair %request (address %owner) (nat %token_id)) (nat %balance))))) (list %mint (pair (address %to_) (nat %amount)))) (or (address %set_administrator) (or (list %transfer (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount)))))) (list %update_operators (or (pair %add_operator (address %owner) (pair (address %operator) (nat %token_id))) (pair %remove_operator (address %owner) (pair (address %operator) (nat %token_id))))))));\nstorage   (pair (address %administrator) (pair (big_map %ledger address nat) (pair (big_map %metadata string bytes) (pair (nat %next_token_id) (pair (big_map %operators (pair (address %owner) (pair (address %operator) (nat %token_id))) unit) (pair (nat %supply) (big_map %token_metadata nat (pair (nat %token_id) (map %token_info string bytes)))))))));\ncode\n{\nLAMBDA\n(pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR;\nSWAP;\nDUP;\nCDR;\nDIG 2;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nSWAP;\nDUP;\nGET 3;\nDIG 2;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair address (pair address nat))\nunit\n{\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"FA2_NOT_OWNER\";\nFAILWITH;\n};\nUNIT;\n};\nSWAP;\nLAMBDA\n(pair (pair address (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair unit (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{\nDROP;\nPUSH bool True;\n}\n{\nDUP 2;\nGET 9;\nDUP 2;\nGET 4;\nSENDER;\nDIG 3;\nCAR;\nPAIR 3;\nMEM;\n};\nIF\n{}\n{\nPUSH string \"FA2_NOT_OPERATOR\";\nFAILWITH;\n};\nUNIT;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair unit (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nCDR;\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nSWAP;\nDUP;\nGET 12;\nDIG 2;\nMEM;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair address (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nSWAP;\nDUP;\nGET 9;\nDIG 2;\nMEM;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) nat) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR;\nDUG 2;\nPAIR;\nEXEC;\nUNPAIR;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nDUP;\nGET 11;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair address (pair address (pair nat nat))) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair unit (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nDUP 2;\nDUP;\nGET 3;\nDUP 3;\nGET 6;\nDIG 4;\nGET 3;\nDUP 5;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"FA2_INSUFFICIENT_BALANCE\";\nFAILWITH;\n}\n{};\nSOME;\nDUP 4;\nCAR;\nUPDATE;\nUPDATE 3;\nSWAP;\nDUP 2;\nDUP;\nGET 3;\nDUP 3;\nGET 6;\nDIG 4;\nGET 3;\nDUP 5;\nGET 3;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nADD;\nSOME;\nDIG 3;\nGET 3;\nUPDATE;\nUPDATE 3;\nUNIT;\nPAIR;\n};\nSWAP;\nPUSH (pair (string %ledger_type) (pair %policy (string %name) (pair (bool %supports_operator) (bool %supports_transfer)))) (Pair \"SingleAsset\" (Pair \"owner-or-operator-transfer\" (Pair True True)));\nSWAP;\nUNPAIR;\nIF_LEFT\n{\nIF_LEFT\n{\nLAMBDA\n(pair (pair (pair address nat) (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (lambda (pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))))) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair (pair (pair address nat) nat) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR 3;\nDIG 2;\nDUP 2;\nDIG 3;\nPAIR;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nSWAP;\nPAIR;\nPAIR;\n};\nDUP 2;\nCAR;\nMAP\n{\nDUP 2;\nDUP 14;\nDUP 11;\nPAIR;\nDIG 2;\nPAIR;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 12;\nDUG 12;\nDUG 12;\nDUG 12;\nDIG 10;\nDIG 12;\nDIG 12;\nDIG 12;\n};\nSWAP;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nNIL operation;\nDIG 2;\nCDR;\nPUSH mutez 0;\nDIG 3;\nTRANSFER_TOKENS;\nCONS;\n}\n{\nDUP 8;\nUNIT;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 11;\nDUG 11;\nDUG 11;\nDIG 10;\nDIG 11;\nDIG 11;\nIF\n{}\n{\nPUSH string \"FA2_NOT_ADMIN\";\nFAILWITH;\n};\nDUP;\nITER\n{\nDUP 8;\nPUSH nat 0;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 12;\nDUG 12;\nDUG 12;\nDUG 12;\nDIG 10;\nDIG 12;\nDIG 12;\nDIG 12;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nDIG 2;\nDUP;\nGET 11;\nDUP 3;\nCDR;\nADD;\nUPDATE 11;\nDUG 2;\nDUP 3;\nDUP;\nGET 3;\nDUP 3;\nCDR;\nDIG 5;\nGET 3;\nDUP 5;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nADD;\nSOME;\nDIG 3;\nCAR;\nUPDATE;\nUPDATE 3;\nSWAP;\n};\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nNIL operation;\n};\n}\n{\nIF_LEFT\n{\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 2;\nUNIT;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nIF\n{}\n{\nPUSH string \"FA2_NOT_ADMIN\";\nFAILWITH;\n};\nUPDATE 1;\n}\n{\nIF_LEFT\n{\nDUP 3;\nGET 6;\nIF\n{\nDUP;\nITER\n{\nDUP;\nCDR;\nITER\n{\nDUP 9;\nSWAP;\nDUP;\nGET 3;\nDIG 2;\nDIG 5;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 13;\nDUG 13;\nDUG 13;\nDUG 13;\nDUG 13;\nDIG 10;\nDIG 13;\nDIG 13;\nDIG 13;\nDIG 13;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nDUP 11;\nDUP 2;\nGET 3;\nDUP 3;\nCAR;\nDUP 5;\nCAR;\nPAIR 3;\nSWAP;\nDIG 5;\nDIG 2;\nPAIR;\nEXEC;\nCDR;\nDUG 12;\nDUG 12;\nDUG 12;\nDUG 12;\nDIG 9;\nDIG 12;\nDIG 12;\nDIG 12;\nPUSH nat 0;\nDUP 2;\nGET 4;\nCOMPARE;\nGT;\nIF\n{\nDUP 2;\nCAR;\nPAIR;\nDUP 6;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nCDR;\nDUG 11;\nDUG 11;\nDUG 11;\nDIG 9;\nDIG 11;\nDIG 11;\n}\n{\nDROP;\n};\n};\nDROP;\n};\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n}\n{\nPUSH string \"FA2_TX_DENIED\";\nFAILWITH;\n};\n}\n{\nDUP 3;\nGET 5;\nIF\n{\nDUP;\nITER\n{\nIF_LEFT\n{\nDUP 11;\nDUP 2;\nEXEC;\nDROP;\nDIG 2;\nDUP;\nGET 9;\nPUSH (option unit) (Some Unit);\nDIG 3;\nUPDATE;\nUPDATE 9;\nSWAP;\n}\n{\nDUP 11;\nDUP 2;\nEXEC;\nDROP;\nDIG 2;\nDUP;\nGET 9;\nNONE unit;\nDIG 3;\nUPDATE;\nUPDATE 9;\nSWAP;\n};\n};\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n}\n{\nPUSH string \"FA2_OPERATORS_UNSUPPORTED\";\nFAILWITH;\n};\n};\n};\nNIL operation;\n};\nPAIR;\n};\nview\n\"get_balance_of\" (list (pair (address %owner) (nat %token_id))) (list (pair (pair %request (address %owner) (nat %token_id)) (nat %balance)))\n{\nUNPAIR;\nLAMBDA\n(pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR;\nSWAP;\nDUP;\nCDR;\nDIG 2;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nSWAP;\nDUP;\nGET 3;\nDIG 2;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nSWAP;\nDUP;\nGET 12;\nDIG 2;\nMEM;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair (pair address nat) (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (lambda (pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))))) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair (pair (pair address nat) nat) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR 3;\nDIG 2;\nDUP 2;\nDIG 3;\nPAIR;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nSWAP;\nPAIR;\nPAIR;\n};\nDUP 2;\nMAP\n{\nDUP 2;\nDUP 6;\nDUP 6;\nPAIR;\nDIG 2;\nPAIR;\nSWAP;\nDIG 6;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 5;\n};\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n};",
        "initialStorage": "(Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair {} (Pair {Elt \"\" 0x} (Pair 0 (Pair {} (Pair 0 {Elt 0 (Pair 0 {Elt \"decimals\" 0x38; Elt \"name\" 0x44756d6d7920575446; Elt \"symbol\" 0x575446})}))))))",
        "entrypoints": [
          "balance_of",
          "mint",
          "set_administrator",
          "transfer",
          "update_operators"
        ],
        "entrypointMetadata": [
          {
            "name": "balance_of",
            "args": [
              {
                "name": "requests",
                "type": "list"
              },
              {
                "name": "callback",
                "type": "contract"
              }
            ],
            "parameterType": "pair (list (pair address nat)) (contract (list (pair (pair address nat) nat)))",
            "sampleArgs": [
              "(Pair { (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1) } \"KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton\")"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "requests": {
                  "__michelsonType": "list",
                  "schema": {
                    "__michelsonType": "pair",
                    "schema": {
                      "owner": {
                        "__michelsonType": "address",
                        "schema": "address"
                      },
                      "token_id": {
                        "__michelsonType": "nat",
                        "schema": "nat"
                      }
                    }
                  }
                },
                "callback": {
                  "__michelsonType": "contract",
                  "schema": {
                    "parameter": {
                      "__michelsonType": "list",
                      "schema": {
                        "__michelsonType": "pair",
                        "schema": {
                          "request": {
                            "__michelsonType": "pair",
                            "schema": {
                              "owner": {
                                "__michelsonType": "address",
                                "schema": "address"
                              },
                              "token_id": {
                                "__michelsonType": "nat",
                                "schema": "nat"
                              }
                            }
                          },
                          "balance": {
                            "__michelsonType": "nat",
                            "schema": "nat"
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "sampleJsArgs": [
              {
                "requests": [
                  {
                    "owner": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                    "token_id": 1
                  }
                ],
                "callback": "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"
              }
            ]
          },
          {
            "name": "mint",
            "args": [
              {
                "name": "arg0",
                "type": "list"
              }
            ],
            "parameterType": "list (pair address nat)",
            "sampleArgs": [
              "{ (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1) }",
              "{}"
            ],
            "parameterSchema": {
              "__michelsonType": "list",
              "schema": {
                "__michelsonType": "pair",
                "schema": {
                  "to_": {
                    "__michelsonType": "address",
                    "schema": "address"
                  },
                  "amount": {
                    "__michelsonType": "nat",
                    "schema": "nat"
                  }
                }
              }
            },
            "sampleJsArgs": [
              [
                {
                  "to_": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                  "amount": 1
                }
              ]
            ]
          },
          {
            "name": "set_administrator",
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
            "name": "transfer",
            "args": [
              {
                "name": "arg0",
                "type": "list"
              }
            ],
            "parameterType": "list (pair address (list (pair address (pair nat nat))))",
            "sampleArgs": [
              "{ (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" { (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 1 1)) }) }",
              "{}"
            ],
            "parameterSchema": {
              "__michelsonType": "list",
              "schema": {
                "__michelsonType": "pair",
                "schema": {
                  "from_": {
                    "__michelsonType": "address",
                    "schema": "address"
                  },
                  "txs": {
                    "__michelsonType": "list",
                    "schema": {
                      "__michelsonType": "pair",
                      "schema": {
                        "to_": {
                          "__michelsonType": "address",
                          "schema": "address"
                        },
                        "token_id": {
                          "__michelsonType": "nat",
                          "schema": "nat"
                        },
                        "amount": {
                          "__michelsonType": "nat",
                          "schema": "nat"
                        }
                      }
                    }
                  }
                }
              }
            },
            "sampleJsArgs": [
              [
                {
                  "from_": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                  "txs": [
                    {
                      "to_": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                      "token_id": 1,
                      "amount": 1
                    }
                  ]
                }
              ]
            ]
          },
          {
            "name": "update_operators",
            "args": [
              {
                "name": "arg0",
                "type": "list"
              }
            ],
            "parameterType": "list (or (pair address (pair address nat)) (pair address (pair address nat)))",
            "sampleArgs": [
              "{ (Left (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1))) }",
              "{}"
            ],
            "parameterSchema": {
              "__michelsonType": "list",
              "schema": {
                "__michelsonType": "or",
                "schema": {
                  "add_operator": {
                    "__michelsonType": "pair",
                    "schema": {
                      "owner": {
                        "__michelsonType": "address",
                        "schema": "address"
                      },
                      "operator": {
                        "__michelsonType": "address",
                        "schema": "address"
                      },
                      "token_id": {
                        "__michelsonType": "nat",
                        "schema": "nat"
                      }
                    }
                  },
                  "remove_operator": {
                    "__michelsonType": "pair",
                    "schema": {
                      "owner": {
                        "__michelsonType": "address",
                        "schema": "address"
                      },
                      "operator": {
                        "__michelsonType": "address",
                        "schema": "address"
                      },
                      "token_id": {
                        "__michelsonType": "nat",
                        "schema": "nat"
                      }
                    }
                  }
                }
              }
            },
            "sampleJsArgs": [
              [
                {
                  "add_operator": {
                    "owner": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                    "operator": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                    "token_id": 1
                  }
                }
              ]
            ]
          }
        ],
        "codeHash": "41f26525333f17c48da3a3715ca7e46f40117bc2463f3f2f82d3b243034f44bf"
      },
      "validate": {
        "passed": true,
        "issues": [],
        "warnings": [],
        "estimate": {
          "gasLimit": 5842,
          "storageLimit": 7524,
          "suggestedFeeMutez": 6799,
          "minimalFeeMutez": 6779
        }
      },
      "audit": {
        "passed": true,
        "score": 98,
        "entrypoints": [
          "balance_of",
          "mint",
          "set_administrator",
          "transfer",
          "update_operators"
        ],
        "findings": [
          {
            "id": "pause_missing",
            "severity": "info",
            "title": "Pause entrypoint not detected",
            "description": "No pause mechanism was found. Emergency response options may be limited.",
            "recommendation": "Consider adding pause/unpause controls for incident response."
          }
        ]
      },
      "simulation": {
        "success": true,
        "summary": {
          "total": 5,
          "passed": 5,
          "failed": 0
        },
        "generatedDefaultSteps": true,
        "steps": [
          {
            "label": "contract: Bert mints token supply",
            "wallet": "bert",
            "entrypoint": "mint",
            "status": "passed",
            "note": "Mint simulation added 1 units to bert."
          },
          {
            "label": "contract: Ernie checks balance or token metadata",
            "wallet": "ernie",
            "entrypoint": "balance_of",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "contract: Bert transfers token inventory to Ernie",
            "wallet": "bert",
            "entrypoint": "transfer",
            "status": "passed",
            "note": "Transfer simulation moved 1 units from bert to ernie."
          },
          {
            "label": "contract: Bert updates token operators",
            "wallet": "bert",
            "entrypoint": "update_operators",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          },
          {
            "label": "contract: reach set_administrator",
            "wallet": "bert",
            "entrypoint": "set_administrator",
            "status": "passed",
            "note": "Entrypoint simulated structurally (ABI + flow), not semantically."
          }
        ],
        "state": {
          "paused": false,
          "totalSupply": 1,
          "listings": 0,
          "offers": 0,
          "swaps": 0,
          "auctions": 0,
          "barters": 0,
          "balances": {
            "bert": 1000000,
            "ernie": 1000001,
            "user": 1000000
          }
        },
        "coverage": {
          "passed": true,
          "totalEntrypoints": 5,
          "coveredEntrypoints": 5,
          "missedEntrypoints": [],
          "wallets": [
            "bert",
            "ernie"
          ],
          "contracts": [
            {
              "id": "contract",
              "totalEntrypoints": 5,
              "coveredEntrypoints": 5,
              "missedEntrypoints": [],
              "byEntrypoint": {
                "balance_of": {
                  "calls": 1,
                  "wallets": [
                    "ernie"
                  ]
                },
                "mint": {
                  "calls": 1,
                  "wallets": [
                    "bert"
                  ]
                },
                "set_administrator": {
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
                },
                "update_operators": {
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
          "Opaque simulation for balance_of: no domain-specific model registered.",
          "Opaque simulation for update_operators: no domain-specific model registered.",
          "Opaque simulation for set_administrator: no domain-specific model registered."
        ]
      },
      "shadowbox": {
        "enabled": true,
        "requiredForClearance": true,
        "provider": "command",
        "executed": true,
        "passed": true,
        "jobId": "sbox_27855f78-8e3e-4b82-8934-fa0cc1ac1452",
        "startedAt": "2026-05-17T17:08:15.419Z",
        "endedAt": "2026-05-17T17:08:37.231Z",
        "durationMs": 21812,
        "contractAddress": "KT1FvEiz6WEYdPh83YuefqDGu9CWUBqV7Rib",
        "contracts": [
          {
            "id": "shadowbox",
            "address": "KT1FvEiz6WEYdPh83YuefqDGu9CWUBqV7Rib"
          }
        ],
        "summary": {
          "total": 4,
          "passed": 4,
          "failed": 0
        },
        "steps": [
          {
            "label": "contract: Bert mints token supply",
            "wallet": "bert",
            "entrypoint": "mint",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          },
          {
            "label": "contract: Bert transfers token inventory to Ernie",
            "wallet": "bert",
            "entrypoint": "transfer",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          },
          {
            "label": "contract: Bert updates token operators",
            "wallet": "bert",
            "entrypoint": "update_operators",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          },
          {
            "label": "contract: reach set_administrator",
            "wallet": "bert",
            "entrypoint": "set_administrator",
            "status": "passed",
            "note": "Entrypoint call applied in ephemeral runtime."
          }
        ],
        "warnings": [
          "shadowbox: retried origination with normalized Michelson formatting.",
          "Shadowbox skipped balance_of: balance_of requires a callback contract payload, so Shadowbox skips it and covers it through static entrypoint detection."
        ]
      },
      "clearance": {
        "approved": true,
        "record": {
          "id": "clr_e07c3de8-77b8-4cda-adc0-7bc17bb5aafb",
          "codeHash": "41f26525333f17c48da3a3715ca7e46f40117bc2463f3f2f82d3b243034f44bf",
          "createdAt": "2026-05-17T17:08:37.232Z",
          "expiresAt": "2026-05-17T23:08:37.232Z",
          "auditPassed": true,
          "simulationPassed": true,
          "shadowboxPassed": true
        }
      }
    },
    "upload": {
      "success": true,
      "contractAddress": "KT1S38UCAP7EAGQSEsFEkviePRBBvgcLnSDx",
      "injectedCode": "parameter (or (or (pair %balance_of (list %requests (pair (address %owner) (nat %token_id))) (contract %callback (list (pair (pair %request (address %owner) (nat %token_id)) (nat %balance))))) (list %mint (pair (address %to_) (nat %amount)))) (or (address %set_administrator) (or (list %transfer (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount)))))) (list %update_operators (or (pair %add_operator (address %owner) (pair (address %operator) (nat %token_id))) (pair %remove_operator (address %owner) (pair (address %operator) (nat %token_id))))))));\nstorage   (pair (address %administrator) (pair (big_map %ledger address nat) (pair (big_map %metadata string bytes) (pair (nat %next_token_id) (pair (big_map %operators (pair (address %owner) (pair (address %operator) (nat %token_id))) unit) (pair (nat %supply) (big_map %token_metadata nat (pair (nat %token_id) (map %token_info string bytes)))))))));\ncode\n{\nLAMBDA\n(pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR;\nSWAP;\nDUP;\nCDR;\nDIG 2;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nSWAP;\nDUP;\nGET 3;\nDIG 2;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair address (pair address nat))\nunit\n{\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"FA2_NOT_OWNER\";\nFAILWITH;\n};\nUNIT;\n};\nSWAP;\nLAMBDA\n(pair (pair address (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair unit (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nIF\n{\nDROP;\nPUSH bool True;\n}\n{\nDUP 2;\nGET 9;\nDUP 2;\nGET 4;\nSENDER;\nDIG 3;\nCAR;\nPAIR 3;\nMEM;\n};\nIF\n{}\n{\nPUSH string \"FA2_NOT_OPERATOR\";\nFAILWITH;\n};\nUNIT;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair unit (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nCDR;\nDUP;\nCAR;\nSENDER;\nCOMPARE;\nEQ;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nSWAP;\nDUP;\nGET 12;\nDIG 2;\nMEM;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair address (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nSWAP;\nDUP;\nGET 9;\nDIG 2;\nMEM;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) nat) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR;\nDUG 2;\nPAIR;\nEXEC;\nUNPAIR;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nDUP;\nGET 11;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair address (pair address (pair nat nat))) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair unit (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nDUP 2;\nDUP;\nGET 3;\nDUP 3;\nGET 6;\nDIG 4;\nGET 3;\nDUP 5;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nSUB;\nISNAT;\nIF_NONE\n{\nPUSH string \"FA2_INSUFFICIENT_BALANCE\";\nFAILWITH;\n}\n{};\nSOME;\nDUP 4;\nCAR;\nUPDATE;\nUPDATE 3;\nSWAP;\nDUP 2;\nDUP;\nGET 3;\nDUP 3;\nGET 6;\nDIG 4;\nGET 3;\nDUP 5;\nGET 3;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nADD;\nSOME;\nDIG 3;\nGET 3;\nUPDATE;\nUPDATE 3;\nUNIT;\nPAIR;\n};\nSWAP;\nPUSH (pair (string %ledger_type) (pair %policy (string %name) (pair (bool %supports_operator) (bool %supports_transfer)))) (Pair \"SingleAsset\" (Pair \"owner-or-operator-transfer\" (Pair True True)));\nSWAP;\nUNPAIR;\nIF_LEFT\n{\nIF_LEFT\n{\nLAMBDA\n(pair (pair (pair address nat) (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (lambda (pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))))) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair (pair (pair address nat) nat) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR 3;\nDIG 2;\nDUP 2;\nDIG 3;\nPAIR;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nSWAP;\nPAIR;\nPAIR;\n};\nDUP 2;\nCAR;\nMAP\n{\nDUP 2;\nDUP 14;\nDUP 11;\nPAIR;\nDIG 2;\nPAIR;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 12;\nDUG 12;\nDUG 12;\nDUG 12;\nDIG 10;\nDIG 12;\nDIG 12;\nDIG 12;\n};\nSWAP;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nNIL operation;\nDIG 2;\nCDR;\nPUSH mutez 0;\nDIG 3;\nTRANSFER_TOKENS;\nCONS;\n}\n{\nDUP 8;\nUNIT;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 11;\nDUG 11;\nDUG 11;\nDIG 10;\nDIG 11;\nDIG 11;\nIF\n{}\n{\nPUSH string \"FA2_NOT_ADMIN\";\nFAILWITH;\n};\nDUP;\nITER\n{\nDUP 8;\nPUSH nat 0;\nSWAP;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 12;\nDUG 12;\nDUG 12;\nDUG 12;\nDIG 10;\nDIG 12;\nDIG 12;\nDIG 12;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nDIG 2;\nDUP;\nGET 11;\nDUP 3;\nCDR;\nADD;\nUPDATE 11;\nDUG 2;\nDUP 3;\nDUP;\nGET 3;\nDUP 3;\nCDR;\nDIG 5;\nGET 3;\nDUP 5;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nADD;\nSOME;\nDIG 3;\nCAR;\nUPDATE;\nUPDATE 3;\nSWAP;\n};\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nNIL operation;\n};\n}\n{\nIF_LEFT\n{\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 2;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 3;\nDROP;\nDIG 2;\nUNIT;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nIF\n{}\n{\nPUSH string \"FA2_NOT_ADMIN\";\nFAILWITH;\n};\nUPDATE 1;\n}\n{\nIF_LEFT\n{\nDUP 3;\nGET 6;\nIF\n{\nDUP;\nITER\n{\nDUP;\nCDR;\nITER\n{\nDUP 9;\nSWAP;\nDUP;\nGET 3;\nDIG 2;\nDIG 5;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nDUG 13;\nDUG 13;\nDUG 13;\nDUG 13;\nDUG 13;\nDIG 10;\nDIG 13;\nDIG 13;\nDIG 13;\nDIG 13;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nDUP 11;\nDUP 2;\nGET 3;\nDUP 3;\nCAR;\nDUP 5;\nCAR;\nPAIR 3;\nSWAP;\nDIG 5;\nDIG 2;\nPAIR;\nEXEC;\nCDR;\nDUG 12;\nDUG 12;\nDUG 12;\nDUG 12;\nDIG 9;\nDIG 12;\nDIG 12;\nDIG 12;\nPUSH nat 0;\nDUP 2;\nGET 4;\nCOMPARE;\nGT;\nIF\n{\nDUP 2;\nCAR;\nPAIR;\nDUP 6;\nDIG 4;\nDIG 2;\nPAIR;\nEXEC;\nCDR;\nDUG 11;\nDUG 11;\nDUG 11;\nDIG 9;\nDIG 11;\nDIG 11;\n}\n{\nDROP;\n};\n};\nDROP;\n};\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n}\n{\nPUSH string \"FA2_TX_DENIED\";\nFAILWITH;\n};\n}\n{\nDUP 3;\nGET 5;\nIF\n{\nDUP;\nITER\n{\nIF_LEFT\n{\nDUP 11;\nDUP 2;\nEXEC;\nDROP;\nDIG 2;\nDUP;\nGET 9;\nPUSH (option unit) (Some Unit);\nDIG 3;\nUPDATE;\nUPDATE 9;\nSWAP;\n}\n{\nDUP 11;\nDUP 2;\nEXEC;\nDROP;\nDIG 2;\nDUP;\nGET 9;\nNONE unit;\nDIG 3;\nUPDATE;\nUPDATE 9;\nSWAP;\n};\n};\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n}\n{\nPUSH string \"FA2_OPERATORS_UNSUPPORTED\";\nFAILWITH;\n};\n};\n};\nNIL operation;\n};\nPAIR;\n};\nview\n\"get_balance_of\" (list (pair (address %owner) (nat %token_id))) (list (pair (pair %request (address %owner) (nat %token_id)) (nat %balance)))\n{\nUNPAIR;\nLAMBDA\n(pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR;\nSWAP;\nDUP;\nCDR;\nDIG 2;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nIF\n{}\n{\nPUSH string \"FA2_TOKEN_UNDEFINED\";\nFAILWITH;\n};\nSWAP;\nDUP;\nGET 3;\nDIG 2;\nCAR;\nGET;\nIF_NONE\n{\nPUSH nat 0;\n}\n{};\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nSWAP;\nDUP;\nGET 12;\nDIG 2;\nMEM;\nPAIR;\n};\nSWAP;\nLAMBDA\n(pair (pair (pair address nat) (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (lambda (pair (pair (lambda (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair bool (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))) (pair address nat)) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes)))))))))) (pair nat (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))))) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n(pair (pair (pair address nat) nat) (pair address (pair (big_map address nat) (pair (big_map string bytes) (pair nat (pair (big_map (pair address (pair address nat)) unit) (pair nat (big_map nat (pair nat (map string bytes))))))))))\n{\nUNPAIR;\nUNPAIR 3;\nDIG 2;\nDUP 2;\nDIG 3;\nPAIR;\nSWAP;\nDIG 3;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 2;\nSWAP;\nPAIR;\nPAIR;\n};\nDUP 2;\nMAP\n{\nDUP 2;\nDUP 6;\nDUP 6;\nPAIR;\nDIG 2;\nPAIR;\nSWAP;\nDIG 6;\nDIG 2;\nPAIR;\nEXEC;\nUNPAIR;\nSWAP;\nDUG 5;\n};\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\nSWAP;\nDROP;\n};",
      "codeHash": "41f26525333f17c48da3a3715ca7e46f40117bc2463f3f2f82d3b243034f44bf",
      "entrypoints": [
        {
          "name": "balance_of",
          "args": [
            {
              "name": "requests",
              "type": "list"
            },
            {
              "name": "callback",
              "type": "contract"
            }
          ],
          "parameterType": "pair (list (pair address nat)) (contract (list (pair (pair address nat) nat)))",
          "sampleArgs": [
            "(Pair { (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1) } \"KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton\")"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "requests": {
                "__michelsonType": "list",
                "schema": {
                  "__michelsonType": "pair",
                  "schema": {
                    "owner": {
                      "__michelsonType": "address",
                      "schema": "address"
                    },
                    "token_id": {
                      "__michelsonType": "nat",
                      "schema": "nat"
                    }
                  }
                }
              },
              "callback": {
                "__michelsonType": "contract",
                "schema": {
                  "parameter": {
                    "__michelsonType": "list",
                    "schema": {
                      "__michelsonType": "pair",
                      "schema": {
                        "request": {
                          "__michelsonType": "pair",
                          "schema": {
                            "owner": {
                              "__michelsonType": "address",
                              "schema": "address"
                            },
                            "token_id": {
                              "__michelsonType": "nat",
                              "schema": "nat"
                            }
                          }
                        },
                        "balance": {
                          "__michelsonType": "nat",
                          "schema": "nat"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "sampleJsArgs": [
            {
              "requests": [
                {
                  "owner": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                  "token_id": 1
                }
              ],
              "callback": "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton"
            }
          ]
        },
        {
          "name": "mint",
          "args": [
            {
              "name": "arg0",
              "type": "list"
            }
          ],
          "parameterType": "list (pair address nat)",
          "sampleArgs": [
            "{ (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1) }",
            "{}"
          ],
          "parameterSchema": {
            "__michelsonType": "list",
            "schema": {
              "__michelsonType": "pair",
              "schema": {
                "to_": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "amount": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                }
              }
            }
          },
          "sampleJsArgs": [
            [
              {
                "to_": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "amount": 1
              }
            ]
          ]
        },
        {
          "name": "set_administrator",
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
          "name": "transfer",
          "args": [
            {
              "name": "arg0",
              "type": "list"
            }
          ],
          "parameterType": "list (pair address (list (pair address (pair nat nat))))",
          "sampleArgs": [
            "{ (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" { (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair 1 1)) }) }",
            "{}"
          ],
          "parameterSchema": {
            "__michelsonType": "list",
            "schema": {
              "__michelsonType": "pair",
              "schema": {
                "from_": {
                  "__michelsonType": "address",
                  "schema": "address"
                },
                "txs": {
                  "__michelsonType": "list",
                  "schema": {
                    "__michelsonType": "pair",
                    "schema": {
                      "to_": {
                        "__michelsonType": "address",
                        "schema": "address"
                      },
                      "token_id": {
                        "__michelsonType": "nat",
                        "schema": "nat"
                      },
                      "amount": {
                        "__michelsonType": "nat",
                        "schema": "nat"
                      }
                    }
                  }
                }
              }
            }
          },
          "sampleJsArgs": [
            [
              {
                "from_": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                "txs": [
                  {
                    "to_": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                    "token_id": 1,
                    "amount": 1
                  }
                ]
              }
            ]
          ]
        },
        {
          "name": "update_operators",
          "args": [
            {
              "name": "arg0",
              "type": "list"
            }
          ],
          "parameterType": "list (or (pair address (pair address nat)) (pair address (pair address nat)))",
          "sampleArgs": [
            "{ (Left (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" (Pair \"tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\" 1))) }",
            "{}"
          ],
          "parameterSchema": {
            "__michelsonType": "list",
            "schema": {
              "__michelsonType": "or",
              "schema": {
                "add_operator": {
                  "__michelsonType": "pair",
                  "schema": {
                    "owner": {
                      "__michelsonType": "address",
                      "schema": "address"
                    },
                    "operator": {
                      "__michelsonType": "address",
                      "schema": "address"
                    },
                    "token_id": {
                      "__michelsonType": "nat",
                      "schema": "nat"
                    }
                  }
                },
                "remove_operator": {
                  "__michelsonType": "pair",
                  "schema": {
                    "owner": {
                      "__michelsonType": "address",
                      "schema": "address"
                    },
                    "operator": {
                      "__michelsonType": "address",
                      "schema": "address"
                    },
                    "token_id": {
                      "__michelsonType": "nat",
                      "schema": "nat"
                    }
                  }
                }
              }
            }
          },
          "sampleJsArgs": [
            [
              {
                "add_operator": {
                  "owner": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                  "operator": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
                  "token_id": 1
                }
              }
            ]
          ]
        }
      ],
      "networkId": "tezos-shadownet"
    }
  },
  "market": {
    "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
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
        "michelson": "parameter (or (unit %default) (pair %purchase (nat %amount_wtf_units) (pair (nat %listing_id) (string %purchase_ref))));\nstorage   (pair (address %treasury) (pair (address %wtf_token_address) (nat %wtf_token_id)));\ncode\n{\nUNPAIR;\nIF_LEFT\n{\nDROP;\nPUSH bool False;\nIF\n{}\n{\nPUSH string \"DEFAULT_DISABLED\";\nFAILWITH;\n};\nNIL operation;\n}\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nCAR;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 4;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"PURCHASE_REF_TOO_LONG\";\nFAILWITH;\n};\nCAR;\nDUP 2;\nGET 4;\nDUP 3;\nCAR;\nPAIR 3;\nDUP 2;\nGET 3;\nCONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));\nIF_NONE\n{\nPUSH string \"FA2_TRANSFER_ENTRYPOINT_MISSING\";\nFAILWITH;\n}\n{};\nNIL operation;\nSWAP;\nPUSH mutez 0;\nNIL (pair address (list (pair address (pair nat nat))));\nNIL (pair address (pair nat nat));\nDIG 5;\nCONS;\nSENDER;\nPAIR;\nCONS;\nTRANSFER_TOKENS;\nCONS;\n};\nPAIR;\n};",
        "initialStorage": "(Pair \"tz1aXPHYxQrXmsDigEJKDF7PyB8FvUTtGyfn\" (Pair \"KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj\" 0))",
        "entrypoints": [
          "purchase"
        ],
        "entrypointMetadata": [
          {
            "name": "purchase",
            "args": [
              {
                "name": "amount_wtf_units",
                "type": "nat"
              },
              {
                "name": "listing_id",
                "type": "nat"
              },
              {
                "name": "purchase_ref",
                "type": "string"
              }
            ],
            "parameterType": "pair nat (pair nat string)",
            "sampleArgs": [
              "(Pair 1 (Pair 1 \"shadowbox\"))"
            ],
            "parameterSchema": {
              "__michelsonType": "pair",
              "schema": {
                "amount_wtf_units": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "listing_id": {
                  "__michelsonType": "nat",
                  "schema": "nat"
                },
                "purchase_ref": {
                  "__michelsonType": "string",
                  "schema": "string"
                }
              }
            },
            "sampleJsArgs": [
              {
                "amount_wtf_units": 1,
                "listing_id": 0,
                "purchase_ref": "kiln-e2e"
              }
            ]
          }
        ],
        "codeHash": "e2676291fd39e79fd3cbfcad5b4dafb5c93575ac871e216fa88c06052419ee6c"
      },
      "validate": {
        "passed": true,
        "issues": [],
        "warnings": [],
        "estimate": {
          "gasLimit": 1000,
          "storageLimit": 1109,
          "suggestedFeeMutez": 1051,
          "minimalFeeMutez": 1031
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
        "jobId": "sbox_63db5e2a-d23c-4be2-a18d-4ffa78ef5147",
        "startedAt": "2026-05-17T17:08:49.229Z",
        "endedAt": "2026-05-17T17:09:14.226Z",
        "durationMs": 24997,
        "contractAddress": "KT1NtD7N6agAMY25DRQGKsVDKvgZLkvPS2qY",
        "contracts": [
          {
            "id": "shadowbox",
            "address": "KT1NtD7N6agAMY25DRQGKsVDKvgZLkvPS2qY"
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
            "note": "Entrypoint call applied in ephemeral runtime.",
            "operationHash": "opJ84Vj4wmbtj8VCRikrJyedHkqx7BjGfqmFSvLf2zoaCGF2FAx"
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
          "id": "clr_45a018fe-7bb7-4f58-89df-32a84c9e84fa",
          "codeHash": "e2676291fd39e79fd3cbfcad5b4dafb5c93575ac871e216fa88c06052419ee6c",
          "createdAt": "2026-05-17T17:09:14.227Z",
          "expiresAt": "2026-05-17T23:09:14.227Z",
          "auditPassed": true,
          "simulationPassed": true,
          "shadowboxPassed": true
        }
      }
    },
    "upload": {
      "success": true,
      "contractAddress": "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC",
      "injectedCode": "parameter (or (unit %default) (pair %purchase (nat %amount_wtf_units) (pair (nat %listing_id) (string %purchase_ref))));\nstorage   (pair (address %treasury) (pair (address %wtf_token_address) (nat %wtf_token_id)));\ncode\n{\nUNPAIR;\nIF_LEFT\n{\nDROP;\nPUSH bool False;\nIF\n{}\n{\nPUSH string \"DEFAULT_DISABLED\";\nFAILWITH;\n};\nNIL operation;\n}\n{\nPUSH mutez 0;\nAMOUNT;\nCOMPARE;\nEQ;\nIF\n{}\n{\nPUSH string \"NO_XTZ_IN\";\nFAILWITH;\n};\nPUSH nat 0;\nDUP 2;\nCAR;\nCOMPARE;\nGT;\nIF\n{}\n{\nPUSH string \"ZERO_AMOUNT\";\nFAILWITH;\n};\nPUSH nat 128;\nDUP 2;\nGET 4;\nSIZE;\nCOMPARE;\nLE;\nIF\n{}\n{\nPUSH string \"PURCHASE_REF_TOO_LONG\";\nFAILWITH;\n};\nCAR;\nDUP 2;\nGET 4;\nDUP 3;\nCAR;\nPAIR 3;\nDUP 2;\nGET 3;\nCONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));\nIF_NONE\n{\nPUSH string \"FA2_TRANSFER_ENTRYPOINT_MISSING\";\nFAILWITH;\n}\n{};\nNIL operation;\nSWAP;\nPUSH mutez 0;\nNIL (pair address (list (pair address (pair nat nat))));\nNIL (pair address (pair nat nat));\nDIG 5;\nCONS;\nSENDER;\nPAIR;\nCONS;\nTRANSFER_TOKENS;\nCONS;\n};\nPAIR;\n};",
      "codeHash": "e2676291fd39e79fd3cbfcad5b4dafb5c93575ac871e216fa88c06052419ee6c",
      "entrypoints": [
        {
          "name": "purchase",
          "args": [
            {
              "name": "amount_wtf_units",
              "type": "nat"
            },
            {
              "name": "listing_id",
              "type": "nat"
            },
            {
              "name": "purchase_ref",
              "type": "string"
            }
          ],
          "parameterType": "pair nat (pair nat string)",
          "sampleArgs": [
            "(Pair 1 (Pair 1 \"shadowbox\"))"
          ],
          "parameterSchema": {
            "__michelsonType": "pair",
            "schema": {
              "amount_wtf_units": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "listing_id": {
                "__michelsonType": "nat",
                "schema": "nat"
              },
              "purchase_ref": {
                "__michelsonType": "string",
                "schema": "string"
              }
            }
          },
          "sampleJsArgs": [
            {
              "amount_wtf_units": 1,
              "listing_id": 0,
              "purchase_ref": "kiln-e2e"
            }
          ]
        }
      ],
      "networkId": "tezos-shadownet"
    }
  }
}
```
