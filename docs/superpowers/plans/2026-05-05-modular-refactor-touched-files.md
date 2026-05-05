# Modular Refactor Touched Files Ledger

Generated during the `codex/modular-architecture-refactor` pass so later audit agents can inspect by domain instead of rediscovering the whole working tree.

## Desktop OS Shell

- `client/src/App.tsx`
- `client/src/components/layout/Desktop.tsx`
- `client/src/routes/page-defs.ts`
- `client/src/features/desktop/CustomCursor.tsx`
- `client/src/features/desktop/DesktopIcons.tsx`
- `client/src/features/desktop/SundayGrass.tsx`
- `client/src/features/desktop/geometry.ts`
- `client/src/features/desktop/useDesktopPhysics.ts`

## Desktop Pet Core

- `client/src/features/desktop/DesktopPet.tsx`
- `client/src/features/desktop/DesktopPetActors.tsx`
- `client/src/features/desktop/DesktopPetCareTray.tsx`
- `client/src/features/desktop/DesktopPetModel.ts`
- `client/src/features/desktop/DesktopPetSimulation.ts`
- `client/src/features/desktop/DesktopPetTypes.ts`
- `client/src/features/desktop/DesktopPetWorldActors.tsx`
- `client/src/features/desktop/useDesktopPetMarket.ts`
- `client/src/features/desktop/DesktopPetStorage.ts` (deleted/replaced by `persistence/*`)
- `client/src/features/desktop/pet/index.ts`
- `client/src/features/desktop/pet/useDesktopPetLocomotion.ts`
- `client/src/features/desktop/persistence/index.ts`
- `client/src/features/desktop/persistence/storage.ts`
- `client/src/features/desktop/persistence/useDesktopPetPersistence.ts`

## Desktop Drop Domain

- `client/src/features/desktop/drops/index.ts`
- `client/src/features/desktop/drops/model.ts`
- `client/src/features/desktop/drops/storage.ts`
- `client/src/features/desktop/drops/useDesktopDropActions.ts`

## Desktop World Domain

- `client/src/features/desktop/world/index.ts`
- `client/src/features/desktop/world/simulation.ts`
- `client/src/features/desktop/world/useDesktopWorldGateway.ts`
- `client/src/features/desktop/world/useVisitingPetSimulation.ts`

## Desktop Ant Domain

- `client/src/features/desktop/ants/AntActors.tsx`
- `client/src/features/desktop/ants/index.ts`
- `client/src/features/desktop/ants/model.ts`
- `client/src/features/desktop/ants/simulation.ts`
- `client/src/features/desktop/ants/useDesktopAntSimulation.ts`

## Desktop Toy Domain

- `client/src/features/desktop/toys/ToyActors.tsx`
- `client/src/features/desktop/toys/index.ts`
- `client/src/features/desktop/toys/model.ts`
- `client/src/features/desktop/toys/simulation.ts`
- `client/src/features/desktop/toys/storage.ts`
- `client/src/features/desktop/toys/useDesktopToyActions.ts`
- `client/src/features/desktop/toys/useDesktopToySimulation.ts`

## W Server Domain

- `server/routes/w.ts`
- `server/features/w/link-preview.ts`
- `server/features/w/timeline.ts`
- `server/lib/timeline-db.ts`

## TV Client Domain

- `client/src/pages/TV.tsx`
- `client/src/features/tv/TVStatic.tsx`
- `client/src/features/tv/index.ts`
- `client/src/features/tv/telemetry.ts`
- `client/src/features/tv/types.ts`
- `client/src/features/tv/utils.ts`

## TV Server Domain

- `server/routes/tv.ts`
- `server/features/tv/bumper-upload.ts`
- `server/features/tv/daypart.ts`
- `server/features/tv/media-urls.ts`
- `server/features/tv/pagination.ts`

## In-App Market / Tezos Dirtied In Same Working Tree

These files are dirty in the same branch and should be audited with the market/verifier pass, not the desktop split:

- `.env.example`
- `client/src/lib/tezos/in-app-market.ts`
- `docs/wtf-in-app-market/README.md`
- `server/lib/in-app-market-policy.ts`
- `server/lib/in-app-market-policy.test.ts`
- `server/lib/in-app-market-sync.ts`
- `server/lib/tzkt-ops.ts`
- `server/lib/tzkt-ops.test.ts`
- `shared/types.ts`

## Planning / Audit Tracking

- `BUG_BOUNTY_BOARD.md`
- `LESSONS_LEARNED.md`
- `docs/superpowers/plans/2026-05-05-wtf-domain-modular-architecture.md`
- `docs/superpowers/plans/2026-05-05-modular-refactor-touched-files.md`
- `docs/superpowers/plans/2026-05-05-modular-junk-drawer-integration.md`

## Generated Test Artifacts To Clean Before Merge

- `test-results/.last-run.json`
- `test-results/desktop-desktop-icon-launc-987a9-et-render-from-the-OS-shell-chromium/`
