# Shadownet Kiln Deployment Attempt

- Attempted at: 2026-05-02T14:45:13.961Z
- Kiln API: https://kiln.wtfgameshow.app
- Network ID: tezos-shadownet

## Public Capability Probe

- HTTP status: 200
```json
{
  "success": true,
  "requestId": "f7d9c073-cebb-4a78-a02a-b1e7f8c30413",
  "runtime": {
    "network": {
      "id": "tezos-shadownet",
      "label": "Tezos Shadownet",
      "ecosystem": "tezos",
      "status": "active",
      "tier": "sandbox",
      "accent": "success",
      "defaultRpcUrl": "https://rpc.shadownet.teztnets.com",
      "chainId": "NetXsqzbfFenSTS",
      "beaconNetworkName": "shadownet",
      "nativeSymbol": "tez",
      "explorerAddress": "https://shadownet.tzkt.io/{address}",
      "explorerTx": "https://shadownet.tzkt.io/{tx}",
      "blurb": "Fast-iteration sandbox with pre-funded puppets for free-spend testing.",
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
    "shadowbox": {
      "enabled": true,
      "requiredForClearance": true,
      "provider": "command",
      "limits": {
        "timeoutMs": 300000,
        "maxActiveJobs": 2,
        "maxActiveJobsPerIp": 1,
        "maxSourceBytes": 200000,
        "maxSteps": 12
      }
    }
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

## Status

BLOCKED: `KILN_API_TOKEN` is not set, so protected Kiln workflow/deploy routes cannot be used.
