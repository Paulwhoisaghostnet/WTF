# Shadowbox Multi-Contract Proof

- Status: PASSED
- Timestamp: 2026-05-17T22:04:21.942Z
- Phase: LAW.BB068/02
- Kiln API: https://kiln.wtfgameshow.app
- Kiln host commit: b8bd9e2
- Network ID: tezos-shadownet
- Shadowbox job: sbox_ae493400-ebed-433e-9cb8-1456e6888d31

## Result

```json
{
  "success": true,
  "provider": "command",
  "executed": true,
  "passed": true,
  "summary": {
    "total": 2,
    "passed": 2,
    "failed": 0
  },
  "warnings": []
}
```

## Contracts

```json
[
  {
    "id": "ledger",
    "address": "KT1Ea6M8JtvV6reG6iM7yvDB74jBm6KmJ5Pw"
  },
  {
    "id": "payable",
    "address": "KT1JGZn1Rqw7jVuGoysju5DxWaNUbbqzeB2Q"
  }
]
```

## Assertions

```json
[
  {
    "id": "payable_storage",
    "kind": "storage",
    "status": "passed",
    "expected": "ready",
    "actual": "ready"
  },
  {
    "id": "payable_balance",
    "kind": "balance",
    "status": "passed",
    "expected": "1000000",
    "actual": "1000000"
  },
  {
    "id": "ledger_buyer_big_map",
    "kind": "big_map",
    "status": "passed",
    "expected": "7",
    "actual": "7"
  }
]
```

## Verification Commands

- `npx vitest run tests/flextesa-runner.test.ts tests/shadowbox-runtime.test.ts` passed 8 tests.
- `npm run lint` passed.
- `npx vitest run tests/server-app.test.ts` passed 56 tests after rerun.
- `ssh -i .ssh-local/kiln-hetzner-ed25519 paul@5.78.202.50 "cd /opt/platform/repos/shadownet-kiln && sudo KILN_DEPLOY_BRANCH=main bash scripts/server-deploy.sh"` passed host deploy health.
- Token-authenticated `POST https://kiln.wtfgameshow.app/api/kiln/shadowbox/run` returned the passing job above.
