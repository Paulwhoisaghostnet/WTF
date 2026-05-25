# WTF Inventory-Driven E2E

The live interaction inventory is `.agents/docs/live/user-interaction-inventory.md`.

The E2E suite is layered:

- `tests/playwright/inventory/subdomains.spec.mjs` parses the inventory and verifies every subdomain row plus every canonical handle can become a normalized event-shaped test action.
- `tests/playwright/inventory/routes.spec.mjs` drives every concrete route in `PAGE_DEFS` through the browser harness.
- `tests/playwright/inventory/domain-interoperability.spec.mjs` runs umbrella workflows across subdomains inside each domain.
- `tests/playwright/inventory/system-integration.spec.mjs` checks cross-domain integration, strict admin visibility, native admin panels, central automation access, and every handle in the normalized event spine.
- `tests/playwright/inventory/feature-depth.spec.mjs` prevents coverage overclaims by separating complete skeleton coverage from named feature-behavior assertions.
- `tests/playwright/live/puppet-orchestration.spec.mjs` runs the inventory routes and domain workflows against a real local server/database with 12 seeded puppet users and signer-backed Tezos wallets.
- `tests/e2e/inventory/behavior-assertions.mjs` is the canonical list of named behavior proofs. Each entry must name the owning spec, verification command, user-visible result, durable side effect, and either owning app/admin surface ids or a platform owner.
- `client/src/features/admin-os/admin-surface-registry.ts` is the app-owned behavior coverage map: any app/admin surface that owns a named behavior proof must list its `behaviorAssertionIds`, and the inventory coverage gate verifies the behavior assertion reciprocally names that surface.

Coverage terms:

- **Skeleton coverage** means every known inventory row, canonical handle, registered route, admin surface route, and domain workflow has an executable E2E test path.
- **Feature behavior coverage** means the test asserts the real user-visible result and durable side effect for a specific interaction, such as a saved post, awarded XP, persisted settings update, wallet preflight, queue mutation, or reward claim.

The current inventory suite is complete as an E2E skeleton and now has a named core behavior layer for the live puppet harness. It is not yet a claim that every feature has exhaustive behavioral assertions against real persistence, wallet signing, chain state, or reward settlement.

Live actor-backed orchestration:

- The puppet registry lives in `tests/e2e/puppets/registry.mjs` and currently defines Bert, Ernie, Elmo, BigBird, TheCount, Snuffaluffagus, Grover, CookieMonster, Oscar, AbbyCadabby, Zoe, and Rosita.
- `npm run test:e2e:puppets:seed` creates/repairs the local puppet users, gives them strong local-only passwords, links each account to a platform-keyring wallet, and writes ignored credentials under `.e2e/`.
- `npm run test:e2e:puppets:prepare-db` applies only the idempotent local schema catch-ups needed by the live harness. It refuses non-local databases unless explicitly overridden.
- `npm run test:e2e:live:puppets` seeds puppets, starts the live Playwright harness, password-logs every puppet in, verifies signer-backed wallet challenges, route-smokes every route fixture, and runs every domain workflow API probe/route path. External OAuth flows such as X/Twitter, Google, GitHub, and Discord are intentionally skipped by the live harness.

Maintenance commands:

```bash
npm run test:e2e:inventory:coverage
npm run test:e2e:inventory
npm run test:e2e:puppets:prepare-db -- --dry-run
npm run test:e2e:puppets:seed
npm run test:e2e:live:puppets
WTF_E2E_ACTOR_FILTER=bert npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g "wallet-login checkout intent"
WTF_E2E_LIVE_BASE_URL=https://wtfgameshow.app WTF_E2E_ACTOR_FILTER=bert,thecount npx playwright test --config=playwright.live.config.mjs tests/playwright/live/puppet-orchestration.spec.mjs -g "W groupchat mirror"
```

`Quality Gates` runs the inventory coverage check and the Playwright inventory smoke suite on every push to `main` and `codex/**`, and on pull requests. Live puppet orchestration remains a local/staging proof because it requires seeded local users and a database.

When adding a route, app, desktop item, admin surface, API handle, reward/XP/challenge trigger, side quest verifier, bot/agent tool, telemetry event, or normalized `SystemEvent`, update the inventory and the appropriate fixture under `tests/e2e/inventory/` in the same change.
When that interaction changes durable state, add or extend an app-owned behavior assertion rather than relying only on route smoke or normalized-handle coverage. Update both the assertion's `ownerSurfaceIds` and the owning surface's `behaviorAssertionIds`; `npm run test:e2e:inventory:coverage` fails if either side is missing.
When the change crosses auth, wallet, roles, rewards, admin tooling, persistence, or cross-domain workflows, also update the live puppet harness or document why it is not applicable.
