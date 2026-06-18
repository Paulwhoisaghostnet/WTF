# Subplan 00 — Phase 0 Skeleton

Goal: stand up the Pasta Protocol structure inside the WTF architecture before any feature logic, so
later phases only fill in behavior. Keep the build green; never modify the Macaroni app.

## Directories (created)

- `public/creation-tools/{spaghetti,gnocchi,ravioli,rotini,penne,lasagna}/` with `index.html`,
  `css/theme.css`, and `js/ contract/ vendor/` placeholders.
- `client/src/features/pasta-protocol/{chease,colander,shared}/`
- `server/features/pasta-protocol/`
- `contracts/pasta-protocol/`
- `scripts/pasta-protocol/`
- `shared/pasta-protocol/` (`types.ts` — foundation types)
- `docs/superpowers/plans/pasta-protocol/` (these subplans)
- `docs/domains/pasta-protocol.md`

## Domain + subdomains

- Add `pastaProtocol` to `domainGuides` in `shared/wtf-app-packages.ts` → label "Pasta Protocol",
  guide `docs/domains/pasta-protocol.md`.
- Add `"pasta-protocol"` to `CreationToolDomain` in `client/src/features/creation-tools/tool-registry.ts`.
- Subdomains (inventory + E2E): CH-EASE, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna, Colander.

## Registration stubs (per app)

Each publisher app (Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna) is a static creation tool;
CH-EASE and Colander are React pages. For each, add buildable stubs that keep coverage green:

1. `client/src/features/creation-tools/tool-registry.ts` — entry (publishers only), `requiredAssets`
   limited to the files that exist (`index.html`, `css/theme.css`).
2. `client/src/routes/page-defs.ts` — route `/tools/<id>` (publishers) or page route (CH-EASE/Colander).
3. `shared/wtf-browser-routes.ts` — matching browser route.
4. `client/src/components/layout/start-menu-model.ts` + `start-menu-app-gates.ts` — start-menu entry +
   role gate (`admin`, `host`, `cohost`, `trusted_creator`).
5. `client/src/features/admin-os/admin-surface-registry.ts` — admin surface with the app's
   automation handles.
6. `shared/wtf-app-packages.ts` — `WtfAppPackageAcceptance` entry under the Pasta Protocol domain.
7. `.agents/docs/live/user-interaction-inventory.md` — rows under Pasta Protocol / <subdomain>.
8. `tests/e2e/inventory/{route-fixtures,domain-workflows,behavior-assertions}.mjs` — fixtures.
9. `tests/playwright/inventory/<app>.spec.mjs` — route-smoke spec.

## Canonical event handle namespace

Reserve per-app handles now so admin/inventory stay consistent later:
`<app>.contract_deployed`, `<app>.token_published`, `<app>.exported`, plus app-specific handles
documented in each app subplan.

## Phase 0 gate

`npm run check`, `npm run build`, `npm run creation-tools:check`, `npm run test:e2e:inventory:coverage`
all pass with every app present as a registered stub and every subplan doc written.
