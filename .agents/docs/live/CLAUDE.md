# WTF Claude Notes

## Required Reading

Before changing code, read:

1. `.agents/docs/live/LESSONS_LEARNED.md`
2. `.agents/docs/live/BUG_BOUNTY_BOARD.md`
3. `.agents/docs/live/user-interaction-inventory.md` when touching routes, app interactions, rewards, admin tooling, events, tests, or monitoring.

## Interaction Inventory and E2E Coverage

When adding, removing, renaming, or materially changing any route, sub-app, desktop item, admin screen, API handle, challenge trigger, side quest verifier, reward action, bot/agent tool, telemetry event, or normalized `SystemEvent`, update the inventory-driven E2E scheme in the same change.

Required:

1. Add or update the owned interaction row in `.agents/docs/live/user-interaction-inventory.md`.
2. Add or update the relevant modular E2E fixture under `tests/e2e/inventory/`.
3. Preserve domain/subdomain ownership. Do not create a giant all-purpose E2E file for a domain-owned interaction.
4. Run `npm run test:e2e:inventory:coverage`; run `npm run test:e2e:inventory` for UI/interaction changes whenever practical.
5. Do not treat route smoke or normalized-handle coverage as full feature behavior coverage. State-changing interactions need domain-owned assertions for both the visible result and durable side effect.
6. For auth, role, wallet, reward, admin, persistence, or cross-domain workflow changes, update the live puppet orchestration under `tests/e2e/puppets/` and `tests/playwright/live/` as needed. Run `npm run test:e2e:live:puppets` when practical, or document the blocker.
