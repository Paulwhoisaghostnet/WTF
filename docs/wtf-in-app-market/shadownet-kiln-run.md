# WTF In-App Market Shadownet Kiln Run

- Attempted at: 2026-05-05T01:13:17.555Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet

## Health Probe

- HTTP status: 200
```json
{
  "status": "ok",
  "requestId": "f18210ce-8fa5-4c15-99a2-7ab599580c4d",
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
  "requestId": "edf63ce0-7d87-4e0a-abd7-2812fb71afdd",
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
    "storageAssertions": "blocked-until-runtime-reader",
    "shadowboxMultiContract": "blocked-single-contract-runner-present"
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
    "audit": "/api/kiln/audit/run",
    "simulate": "/api/kiln/simulate/run",
    "shadowbox": "/api/kiln/shadowbox/run",
    "workflow": "/api/kiln/workflow/run",
    "deploy": "/api/kiln/upload",
    "execute": "/api/kiln/execute",
    "e2e": "/api/kiln/e2e/run",
    "bundle": "/api/kiln/export/bundle"
  },
  "clients": {
    "ui": true,
    "cli": "npm run kiln:cli",
    "agentic": "Use OpenAPI + JSON endpoints for tool-call orchestration."
  }
}
```

## Unauthenticated Mutation Probe

- HTTP status: 401
```json
{
  "error": "Unauthorized"
}
```

## Local Compact Compile

- Contract Michelson bytes: 1048
- Initial storage bytes: 93

## Status

BLOCKED: `KILN_API_TOKEN` is not set and Kiln is currently in token-required mode.
