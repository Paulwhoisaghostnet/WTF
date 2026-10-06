# skllz's review walkthrough

## Install

1. Download the DMG or ZIP and `SHA256SUMS.txt` from the [review prerelease](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/pasta-review-2026-10-06). The manifest gives the exact source commit and verification evidence. Do not substitute the older `1.0.0` installers.
2. Open the DMG, accept its prerelease license, and drag **Pasta Suite** to Applications; alternatively extract the ZIP. Launch the copied application.
3. The build is unsigned/unnotarized. If macOS blocks opening it, verify its provenance and use the per-app approval provided by macOS. Do not disable Gatekeeper globally; record a blocked install as a finding if you are not comfortable approving it.
4. Start in Colander on **Shadownet**. Do not run standalone Macaroni concurrently. Browsing the tools does not require a wtfOS account, Node.js, Docker, database, or external server.

## Orientation and UX

- In Colander, create a disposable project. Inspect rename, duplicate, archive/restore, export/import, contract registry, and installed-page controls. Avoid destructive operations on existing user projects.
- Open CH-EASE and prepare a small test collection. Check whether the handoff into the chosen publisher is understandable.
- Open all eight tools from Colander; distinguish their purpose and identify unclear labels, missing guidance, broken navigation, and accessibility problems.
- Export a public page with test data; inspect what is included. A static export should not contain private assets, signer material, admin tokens, or creator credentials.
- Quit and relaunch. Confirm project/draft recovery and explainable error states. The suite uses the stable origin `http://127.0.0.1:30770`; do not clear application data to fix a port conflict.

## Macaroni V3.5

Expect Secure Blind Mint to stay locked on a fresh install. The [native setup guide](../companion/macaroni-v35/DESKTOP_SETUP.md) and [Companion README](../companion/macaroni-v35/README.md) explain the dedicated finalizer, private storage/backup, IPFS publication, RPC disclosures, and public HTTPS/CORS configuration required before the doctor can pass.

First review the setup experience and [known blockers](KNOWN_ISSUES.md). A real Shadownet lifecycle is a separate, explicitly configured rehearsal involving wallet transactions and persistent published test data; the supplied packaging smoke does not perform it. Do not treat a mocked readiness transition as a successful live setup.

Review the creator-action journal, private/public API boundary, allocation/contract binding, signed-operation recovery, finality checks, and artifact-before-metadata publication. Preserve the exact operation hash when reporting an ambiguous broadcast; never retry simply because a UI timed out.

## Verification

From the repository root with Node.js 22:

```sh
npm ci
npm ci --prefix apps/pasta-suite-desktop
npm ci --prefix companion/macaroni-v35
npm test --prefix companion/macaroni-v35
node apps/macaroni-desktop/scripts/prepare-assets.mjs
node --test scripts/macaroni/v35-contract-policy.test.mjs scripts/macaroni-desktop-package-policy.test.mjs scripts/pasta-suite-desktop-package-policy.test.mjs scripts/pasta-desktop-artifact-smoke.test.mjs
DATABASE_URL=postgresql://test:test@127.0.0.1:5432/pasta_test npx tsx --test server/routes/macaroni-policy.test.ts server/features/macaroni/v35-entropy.test.ts server/features/macaroni/v35-managed-policy.test.ts server/features/macaroni/v35-private-staging.test.ts server/features/macaroni/v35-worker.test.ts
npm run test:e2e:inventory:coverage
```

The dummy database URL above satisfies an import-time check in the focused server-policy tests; these tests use mocked dependencies and do not prove a running database or hosted service. Do not use production credentials. Preparing both desktop asset trees is required for the contract-parity policy even when only the suite is installed.

Focused mocked-browser stories require the root build and Playwright browser installation:

```sh
npm run build
npx playwright install chromium
npx playwright test tests/playwright/inventory/macaroni-native-companion-setup.spec.mjs tests/playwright/inventory/macaroni-v35-static-collector.spec.mjs --project=chromium
```

Full inventory and actor-backed live tests have wider wtfOS dependencies and are not prerequisites to opening the desktop suite. Live proof scripts can sign transactions: inspect their configuration and obtain the necessary test-wallet authority before running them.

## Send back findings

Include the release tag and full commit SHA, installer filename, macOS/device version, tool, precise steps, expected/actual result, and screenshot or redacted logs. Separate UX observations, reproducible failures, security hypotheses, and missing live proof. Never attach private artwork, hidden CIDs, credentials, `.env`, signer keys, or a private state database.
