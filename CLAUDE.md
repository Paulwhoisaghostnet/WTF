# WTF Claude Notes

Claude workers must treat `.agents/docs/live/CLAUDE.md` as the active project instruction file for this repository.

Before changing code, read:

1. `.agents/docs/live/LESSONS_LEARNED.md`
2. `.agents/docs/live/BUG_BOUNTY_BOARD.md`
3. `.agents/docs/live/user-interaction-inventory.md` when touching routes, app interactions, rewards, admin tooling, events, tests, or monitoring.

## Interaction Inventory and E2E Coverage

Whenever adding, removing, renaming, or materially changing any user interaction, app route, sub-app, desktop item, admin screen, API handle, reward trigger, challenge trigger, side quest verifier, bot/agent tool, telemetry event, or normalized `SystemEvent`, update the inventory-driven E2E scheme in the same change.

Required:

1. Update `.agents/docs/live/user-interaction-inventory.md`.
2. Update the relevant modular fixture under `tests/e2e/inventory/`.
3. Run `npm run test:e2e:inventory:coverage`.
4. For UI or interaction changes, run `npm run test:e2e:inventory` or document the blocker.
5. Preserve domain/subdomain ownership. Do not build monolithic E2E scripts.
6. Do not treat route smoke or normalized-handle coverage as full feature behavior coverage. If an interaction changes durable state, add a domain-owned assertion for the visible result and persisted/event/reward side effect.
7. For auth, role, wallet, reward, admin, persistence, or cross-domain workflow changes, update the live puppet orchestration under `tests/e2e/puppets/` and `tests/playwright/live/` as needed. Run `npm run test:e2e:live:puppets` when practical, or document the blocker.
