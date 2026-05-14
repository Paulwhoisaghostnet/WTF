# Phase 5 Kernel Grafts Closeout

## Status

Phase 5 is complete as of production commit `cb9f206` plus this closeout record.

Phase 5 moved WTF from shell-complete OS surfaces into hardened domain organs: shared upstream clients, Tezos/TzKT cache and cursor contracts, IPFS rendering fallback, marketplace classification, Tezos Domains wallet labels, health/job visibility, WalletConnect-ready CSP, CI inventory gates, and operator runbooks.

## Completed Steps

| Step | Delivered |
| --- | --- |
| P5.UP1/12 | Shared upstream retry, timeout, and retry-budget contract. |
| P5.TZ2/12 | TzKT cursor pagination helper with bounded non-advancing cursor guard. |
| P5.CA3/12 | Persistent bounded TzKT hot-route cache. |
| P5.IP4/12 | Unified IPFS media fallback rendering. |
| P5.MK5/12 | Marketplace contract map and sale classification. |
| P5.TD6/12 | Tezos Domains reverse and owned-domain wallet labels. |
| P5.HL7/12 | Health readiness snapshot for DB, chain, contracts, version, and jobs. |
| P5.JV8/12 | Authenticated/redacted background job visibility. |
| P5.WC9/12 | WalletConnect-ready CSP and Octez/Beacon wallet boundary runbook. |
| P5.E2E10/12 | CI inventory coverage and Playwright smoke gate. |
| P5.RB11/12 | Production deployment and TzKT upstream runbooks. |
| P5.CL12/12 | Phase closeout verification and live readiness evidence. |

## Local Verification

Focused Phase 5 policy/helper tests:

```bash
npx tsx --test server/lib/upstream.test.ts server/tzkt-policy.test.ts server/tzkt-kernel-policy.test.ts server/tzkt-persistent-cache-policy.test.ts server/tzkt-cursor-pagination.test.ts server/wallet-tezos-domains-policy.test.ts server/lib/health.test.ts server/cockpit-sync-visibility-policy.test.ts server/app-csp-policy.test.ts client/src/lib/tezos/wallet-connect-policy.test.ts docs/runbooks-policy.test.ts tests/e2e/inventory/ci-gate-policy.test.ts
```

Result: 22 tests passed.

Phase-level gates:

```bash
npm run check -- --pretty false
npm run build
npm run test:e2e:inventory:coverage
npx playwright test tests/playwright/inventory
npm run check:external-links
```

Latest local inventory Playwright result during P5.E2E10: 233 passed.

## Production Verification

Latest deployed Phase 5 evidence before this closeout:

- Commit: `cb9f206`
- `/api/health`: `status: ok`
- DB: `ok: true`
- Chain: `ok: true`
- Network: `mainnet`
- TzKT API: `https://api.tzkt.io/v1`
- Tezos RPC: `https://rpc.tzkt.io/mainnet`
- Jobs: `ok: true`, `recentErrors: 0`, `issues: []`
- Quality Gates: passed with inventory coverage and inventory Playwright smoke enabled.
- Deploy to Hetzner: passed.

## Next Phase Boundary

Do not reopen Phase 5 unless one of these contracts regresses. The next Sacred OS work should proceed to the next canonical phase and should reference the specific phase/substep identifier before editing.
