# Main wtfOS Pasta Release Triage

Last audited: 2026-06-30
Release worktree: `/Users/joshuafarnworth/.config/superpowers/worktrees/WTF/codex-pasta-live-readiness`
Release branch: `codex/pasta-live-readiness` based on `origin/main` `eda1db4b`
Source checkout audited for stale/ongoing work: `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/WTF`
Source checkout snapshot: `main` at `9d043fd1`, behind the original `origin/main` baseline `56955345` by 12 commits during the first audit pass

## Purpose

This file separates valid ongoing work from stale, redundant, or unsafe-to-deploy work for the main `wtfos.app` release path. Gamma and Beta concerns are intentionally out of scope except where their files contaminate main production release composition.

Target state remains:

- main `wtfos.app` can deploy Pasta Protocol without unrelated dirty work;
- Pasta Protocol routes, contracts, shared helpers, specs, and Shadownet validation are verified;
- Macaroni/Pasta software installers are built, published, and downloadable as individual packages or a suite;
- production is smoke-tested after deployment before anything is called live.

## Current Release Blockers

The original source checkout is not a live-push candidate:

- `main` is 12 commits behind `origin/main`.
- The worktree contains 206 tracked-file changes plus many untracked files.
- The dirty tree mixes Pasta/Macaroni, Tezos dependency upgrades, Gamma/Beta presentation work, apphost, Agent, localization, Skywire, Mail/Messages, WTF LIVE, Particle Painter assets, and test-result churn.
- No changes are staged, so there is no commit boundary separating valid release work from stale or unrelated work.

The safe path is now in progress on `codex/pasta-live-readiness`, a clean worktree rebased to latest `origin/main` with only the audited Pasta/Macaroni release slice applied.

The release is still not live-complete because:

- Macaroni Desktop installer artifacts have not been built or published.
- Production installer URLs/version are not proven configured.
- Live `wtfos.app` still serves the stale Taquito `24.3.0` static creator-tool bundles.
- Production health still reports `version.commitRef: "dev"`, so deployed revision identity remains weak.

## Live Production Baseline

Probed on 2026-06-30 against `https://wtfos.app`.

### Health And Release Identity

- `/api/health` returned HTTP 200 with `status: "ok"`.
- Health reported `nodeEnv: "production"` but `version.commitRef: "dev"`, so live commit identity is not strong enough to prove a specific git revision.
- Health exposes verbose runtime and chain topology, matching the existing `WTF-BB-302` public-observability risk.

### Pasta Static Tool Availability

All checked static Pasta/Macaroni tool pages returned HTTP 200:

- `/creation-tools/macaroni/studio.html`
- `/creation-tools/spaghetti/index.html`
- `/creation-tools/gnocchi/index.html`
- `/creation-tools/ravioli/index.html`
- `/creation-tools/rotini/index.html`
- `/creation-tools/penne/index.html`
- `/creation-tools/lasagna/index.html`

Observed page content confirms the Pasta publisher pages exist on production and expose Shadownet/wallet/contract-oriented flows, but this is reachability only. It does not prove successful deployment, minting, collecting, or recovery.

### Production Tezos Vendor Drift

Every checked live vendor bundle still reports Taquito `24.3.0`:

- `/creation-tools/macaroni/vendor/tezos.js`
- `/creation-tools/spaghetti/vendor/tezos.js`
- `/creation-tools/gnocchi/vendor/tezos.js`
- `/creation-tools/ravioli/vendor/tezos.js`
- `/creation-tools/rotini/vendor/tezos.js`
- `/creation-tools/penne/vendor/tezos.js`
- `/creation-tools/lasagna/vendor/tezos.js`

This contradicts a live-complete Pasta claim. Local policy expects the refreshed Taquito `25.0.0` / U025 / Octez baseline and passes locally, but production has not received that refresh.

Tracked as `WTF-BB-329`.

### Installer Exposure

- `/api/macaroni/installers` returned HTTP 401 to an unauthenticated request, which matches the authenticated endpoint contract.
- Macaroni Studio production HTML/JS contains the installer download controls and the `/api/macaroni/installers` manifest fetch.
- No authenticated production proof exists yet that installer URLs are configured or available.

## Origin Main Baseline

Checked on 2026-06-30 against local `origin/main` (`eda1db4b` after the System Appearance promotion).

### Already On Origin Main

- `.github/workflows/macaroni-desktop-installers.yml`
- `apps/macaroni-desktop/package.json`
- `docs/macaroni-desktop-packaging.md`

This means installer source, docs, and CI workflow are already part of the remote base.

### Missing From Origin Main

- `spec/tests/validation-manifest.json`
- `scripts/check-tezos-rpc-defaults.test.mjs`

These are now carried from the dirty checkout onto `codex/pasta-live-readiness`, but remain missing from `origin/main` until this release branch lands.

### Origin Tezos Vendor Drift

`origin/main` still has Taquito `24.3.0` in all checked Pasta/Macaroni static vendor bundles:

- `public/creation-tools/macaroni/vendor/tezos.js`
- `public/creation-tools/spaghetti/vendor/tezos.js`
- `public/creation-tools/gnocchi/vendor/tezos.js`
- `public/creation-tools/ravioli/vendor/tezos.js`
- `public/creation-tools/rotini/vendor/tezos.js`
- `public/creation-tools/penne/vendor/tezos.js`
- `public/creation-tools/lasagna/vendor/tezos.js`

This matches live production and confirms the local Tezos vendor refresh has not yet been promoted to the remote base.

### Installer Artifact Status

- GitHub API returned zero runs for the `macaroni-desktop-installers.yml` workflow.
- GitHub releases API returned an empty release list.
- No Macaroni/Pasta release tag appeared in the first 50 GitHub repo tags.

Tracked as `WTF-BB-330`.

## Carry Forward: Main/Pasta Candidate Work

These items are aligned with the main Pasta release goal and are now applied to the clean production-base branch. They still need clean-branch verification and live proof.

### Pasta Spec And Coverage

Carry:

- `PASTA_PROTOCOL_COVERAGE_REPORT.md`
- `spec/README.md`
- `spec/gaps/gap-detection.md`
- `spec/stories/crossapp/all-directed-pairs.md`
- `spec/stories/crossapp/meaningful-chains.md`
- `spec/validation/coverage-matrix.md`
- `spec/tests/`

Evidence:

- Current report claims 99.0% spec/validation coverage.
- Generated validation catalog exists under `spec/tests/`.
- This is documentation/spec coverage only. It does not prove production deployment or executable feature completeness.

### Pasta Shared Runtime And Static Publishers

Carry after clean-branch inspection:

- `shared/pasta-protocol/*`
- `contracts/pasta-protocol/*`
- `public/creation-tools/spaghetti/*`
- `public/creation-tools/gnocchi/*`
- `public/creation-tools/ravioli/*`
- `public/creation-tools/rotini/*`
- `public/creation-tools/penne/*`
- `public/creation-tools/lasagna/*`
- `client/src/features/pasta-protocol/colander/ColanderApp.tsx` only for main Colander behavior; exclude Gamma-only presentation edits unless Gamma is in scope.

Evidence:

- `./node_modules/.bin/tsx --test shared/pasta-protocol/foundation.test.ts tests/unit/pasta-foundation-parity.test.mjs` passed 49/49 in this audit.
- Static publisher routes and contracts already exist as tracked source.

Missing proof:

- Shadownet deployment and operation flow for each contract/product class.
- Browser proof for creator and collector workflows on main wtfOS routes.
- Production-hosted page proof through WTF.ME/wtfOS site publishing.

### Tezos Wallet And RPC Currency

Carry:

- `package.json`
- `package-lock.json`
- `PP/package.json`
- `PP/package-lock.json`
- `PP/src/features/tezos/walletService.ts`
- `client/src/lib/tezos/wallet.ts`
- `client/src/lib/tezos/loaders.ts`
- `client/src/lib/tezos/wallet-connect-policy.test.ts`
- `extensions/wtf-operator-signer/package.json`
- `extensions/wtf-operator-signer/package-lock.json`
- `extensions/wtf-domain-bot/src/config.ts`
- `extensions/wtf-domain-bot/.env.example`
- `contracts/wtf-subdomains/deploy.ts`
- `server/routes/buyback-windows.ts`
- `shared/schema-recapture.ts`
- `scripts/marketplace-v2/legacy-marketplace-pause.ts`
- `public/creation-tools/*/vendor/tezos.js` for Pasta/Macaroni tools
- `public/creation-tools/macaroni/vendor/octez-connect.js`
- `public/creation-tools/particle-painter/*`
- `client/src/features/creation-tools/tool-registry.ts`
- `scripts/build-tezos-browser-vendors.mjs`
- `scripts/check-tezos-rpc-defaults.test.mjs`
- `server/routes/macaroni-policy.test.ts`

Evidence:

- `npm run security:tezos-rpc-defaults` passed 5/5 in this audit.
- The current dependency target is Taquito `25.0.0` and Octez Connect `4.8.6`.

Risk:

- This is a broad dependency-lock change. It must be tested on this clean branch with build, creator-tool asset checks, Macaroni/CH-EASE workflow tests, and Shadownet tests.

### Macaroni Desktop Installers

Carry or preserve as already tracked source:

- `apps/macaroni-desktop/*`
- `.github/workflows/macaroni-desktop-installers.yml`
- `docs/macaroni-desktop-packaging.md`
- `scripts/macaroni-desktop-package-policy.test.mjs`
- `/api/macaroni/installers` behavior in `server/routes/macaroni.ts`
- Macaroni Studio installer UI in `public/creation-tools/macaroni/studio.html` and `public/creation-tools/macaroni/js/studio.js`

Evidence:

- `npm run macaroni:desktop:check` passed 3/3 in this audit.
- `npm run dist:mac --prefix apps/macaroni-desktop` produced local unsigned macOS universal artifacts:
  - `apps/macaroni-desktop/release/Macaroni-Studio-1.0.0-mac-universal.dmg` (`sha256 9df90eef0fe40b784a642d8630a0b842c7c355224c212884bf3f69777c2b187f`)
  - `apps/macaroni-desktop/release/Macaroni-Studio-1.0.0-mac-universal.zip` (`sha256 9cb9ea4c38494bf2bf9fc160288fa1988ce7ea687efc06b5a1330b569a2fdcba`)
- The workflow builds macOS, Windows, and Raspberry Pi artifacts.
- The app exposes installer links only when `MACARONI_INSTALLER_*_URL` and `MACARONI_INSTALLER_VERSION` are configured.

Missing proof:

- Windows x64 and Raspberry Pi arm64 artifacts are not proven built in this audit.
- GitHub release artifacts are not proven published in this audit.
- Production env URLs are not proven configured.
- `/api/macaroni/installers` is not proven live on `wtfos.app`.
- Public macOS distribution still needs signing/notarization or an explicit unsigned-release policy.

Installer URL hardening status:

- Fixed locally in `codex/pasta-live-readiness`: production remote installer URLs are now HTTPS-only, with same-origin relative paths allowed and loopback HTTP allowed only outside production.
- Still needs clean-branch verification and live manifest proof before it counts as production-verified.

### CH-EASE And Macaroni Packager

Inspect before carrying:

- `client/src/pages/MacaroniPackager.tsx`
- `tests/playwright/inventory/macaroni-packager.spec.mjs`
- `tests/e2e/inventory/*` rows touching CH-EASE or Macaroni packages

Reason:

- CH-EASE is a required Pasta intake path, but current dirty files may mix main behavior with Gamma presentation containment. Only main package export, handoff, audit-event, and creator workflow improvements should enter the Pasta release branch.

## Hold Or Exclude Before Main Live Push

These items may be valid ongoing work, but they are not needed for the main Pasta/Macaroni release and should not ride along accidentally.

### Gamma And Beta Presentation Work

Hold:

- `client/src/pages/GammaWtfos.tsx`
- `client/src/pages/BetaWtfos.tsx`
- `client/src/features/beta/*`
- `tests/playwright/inventory/gamma-wtfos.spec.mjs`
- `tests/playwright/inventory/beta-wtfos.spec.mjs`
- `.agents/docs/live/GAMMA_ROUTE_CONTAINMENT_LOOP.md`
- `client/src/lib/presentation-shell.tsx`
- `client/src/lib/react95-presentation.tsx`
- untracked `*-presentation-policy.test.ts` files unless they prove a main route requirement.

Reason:

- User scope says ignore Gamma/Beta.
- These changes are broad and presentation-heavy; they contaminate release composition without helping main Pasta deployment.

### Apphost, Applications, And Agent

Hold:

- `apphost/`
- `server/features/apphost/*`
- `server/routes/apphost.ts`
- `client/src/pages/Applications.tsx`
- `client/src/pages/ApplicationSession.tsx`
- `client/src/pages/Agent.tsx`
- `client/src/features/agent/*`
- related route additions in `client/src/routes/page-defs.ts`, `shared/wtf-browser-routes.ts`, and `shared/wtf-app-packages.ts`

Reason:

- This is a remote hosted-app platform, not a Pasta installer release path.
- It adds service, auth, streaming, process, and deployment surface area that needs its own security/reliability pass.

### Localization And Soft-System Fonts

Hold:

- `client/src/lib/localization*`
- `shared/localization*`
- `drizzle/0108_user_desktop_localization.sql`
- `tests/playwright/inventory/system-settings-localization.spec.mjs`
- `public/fonts/wtfos-soft-system/*`

Reason:

- This may be useful product work, but it is unrelated to Pasta deployment and installer downloads.

### Social, Skywire, Mail, Messages, WTF LIVE

Hold:

- `client/src/features/skywire/*`
- `server/routes/skywire.ts`
- `server/features/atproto/skywire-policy.test.ts`
- `server/routes/atproto.ts`
- `server/features/comms/source-registry.ts`
- `server/routes/comms.ts`
- `server/routes/messages.ts`
- `client/src/pages/Mail.tsx`
- `client/src/pages/Messages.tsx`
- `server/websocket.ts`
- `client/src/features/wtf-live/*`
- `tests/playwright/inventory/skywire-feed.spec.mjs`
- `tests/playwright/inventory/wtf-live-owner-controls.spec.mjs`
- `.agents/docs/live/wtfos-source-software-tracker.md`

Reason:

- These are main production surfaces, but they are not Pasta release requirements. They should ship only through their own scoped branch and verification.

### Particle Painter Main Tezos Asset Refresh

Carried as part of the main `wtfos.app` Tezos dependency refresh, not as Pasta app behavior:

- deleted `public/creation-tools/particle-painter/assets/index-CwPOmQ7R.js`
- deleted `taquito-utils.es6-DgY7mjuu.js`
- deleted `teiaService-DVmSCyco.js`
- deleted `walletService-DHFBHtqP.js`
- new `public/creation-tools/particle-painter/assets/index-B--Bh6Oo.js`
- new Particle Painter Taquito/Teia/wallet bundles
- `public/creation-tools/particle-painter/index.html`
- `client/src/features/creation-tools/tool-registry.ts`

Reason:

- The Tezos policy gate covers all main static creator-tool bundles that would otherwise keep stale Taquito `24.3.0` code in production.
- This remains excluded from Pasta feature claims: it proves main Tezos bundle currency, not Pasta Protocol deployment or installer availability.
- It still needs `npm run creation-tools:check`, build proof, and live static asset marker proof before production closure.

### Test Artifacts

Discard from release branch:

- `test-results/.last-run.json`

Reason:

- This is runner state, not source.

## Production Hardening Still Relevant But Not Pasta-Specific

Open board items still matter before broader production confidence, but they should not be bundled into the Pasta installer branch unless directly touched:

- `WTF-BB-298`: disabled app APIs still serve public data and CRP status leaks topology.
- `WTF-BB-303`: CSP policies remain broad.
- `WTF-BB-302`: public health exposes verbose runtime and chain topology.
- `WTF-BB-310`: production Hetzner verification dependencies are incomplete.
- `WTF-BB-154`/dirty-worktree isolation family: unrelated dirty work blocks scoped release gates.

## Verification Already Run In This Audit

Passed:

- `npm run check -- --pretty false`
- `npm run macaroni:desktop:check`
- `node --test server/routes/macaroni-policy.test.ts`
- `npm run security:tezos-rpc-defaults`
- `./node_modules/.bin/tsx --test shared/pasta-protocol/foundation.test.ts tests/unit/pasta-foundation-parity.test.mjs`
- `npm run test:e2e:inventory:coverage`
- `npm run creation-tools:check`
- `npm run build`
- `npm run dist:mac --prefix apps/macaroni-desktop`

Interpretation:

- These checks support the Macaroni desktop packaging policy, Tezos dependency/RPC currency, Pasta helper parity, and inventory skeleton coverage.
- The broad TypeScript gate and production build pass on `codex/pasta-live-readiness`.
- The Tezos policy now passes on the clean branch after carrying the main Tezos defaults, operator signer, and Particle Painter static asset refresh.
- They do not prove production deployment, public downloadable installer availability, Windows/Raspberry Pi installer artifacts, Shadownet contract execution, or live `wtfos.app` behavior.

## Required Evidence Before Calling Pasta Live

The goal is not complete until current evidence proves all of the following:

1. A clean production-base branch exists from `origin/main`.
2. Only audited Pasta/Macaroni release files and directly required main Tezos currency files are included.
3. `npm run check -- --pretty false` passes on the clean branch.
4. `npm run build` passes on the clean branch.
5. `npm run creation-tools:check` passes.
6. Pasta helper and parity tests pass.
7. Tezos RPC/vendor policy tests pass.
8. CH-EASE/Macaroni focused Playwright passes.
9. Shadownet Macaroni/Pasta deployment and collector flows pass.
10. Macaroni desktop installers are built for macOS, Windows, and Raspberry Pi.
11. Installer artifacts are published to stable URLs.
12. Production env exposes installer URLs and version.
13. `https://wtfos.app` returns installer availability from `/api/macaroni/installers` for an authenticated user.
14. Pasta creator and collector workflows are smoke-tested on live `wtfos.app`.
15. Live health and release metadata confirm the deployed commit.

## Recommended Next Branch Slice

Once an isolated worktree/branch is approved, use `origin/main` as the base and apply only:

- Pasta spec/test catalog files listed above.
- Pasta shared helpers and static publisher files listed above.
- Tezos dependency/RPC/vendor refresh listed above.
- Macaroni desktop installer source, workflow, docs, and policy tests if not already in `origin/main`.
- Main CH-EASE/Macaroni/Colander behavior needed by Pasta, after separating it from Gamma-only presentation changes.
- Installer URL hardening.

Do not carry the hold/exclude sections into that branch.
