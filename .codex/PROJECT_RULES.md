# Codex Project Rules

## Interaction Inventory and E2E Coverage

For this repository, interaction coverage is part of the architecture contract.

Whenever a Codex worker adds, removes, renames, or materially changes a user interaction, app route, sub-app, desktop item, admin screen, API handle, reward trigger, challenge trigger, side quest verifier, bot/agent tool, telemetry event, or normalized `SystemEvent`, the worker must update the E2E scheme in the same pass.

Checklist:

1. Update `.agents/docs/live/user-interaction-inventory.md`.
2. Update the appropriate modular fixture under `tests/e2e/inventory/`.
3. Run `npm run test:e2e:inventory:coverage`.
4. For UI or interaction changes, run `npm run test:e2e:inventory` or document the blocker.
5. Keep ownership by domain/subdomain; do not build monolithic E2E scripts.
6. Keep the claim honest: skeleton coverage is not full feature behavior coverage. For state-changing interactions, add or extend a domain-owned test that asserts the visible result plus persisted/event/reward side effect.
7. For auth, role, wallet, reward, admin, persistence, or cross-domain workflow changes, update the live puppet orchestration under `tests/e2e/puppets/` and `tests/playwright/live/` as needed. Run `npm run test:e2e:live:puppets` when practical, or document the blocker.
