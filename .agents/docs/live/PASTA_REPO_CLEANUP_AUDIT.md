# Pasta Repo Cleanup Audit

Last audited: 2026-07-01
Auditor: Codex Pasta live-readiness continuation
Production focus: `https://wtfos.app`

## Current Production Authority

- Authoritative production source is `origin/main` at `96b852369b0f3bcb737514afae922d4427f45d69`.
- Live health reports `commitRef: "96b8523"` and `nodeEnv: "production"`.
- Main Quality Gates run `28489362581` and Deploy to Hetzner run `28489362538` succeeded for commit `96b85236`.
- The broader Pasta evidence branch `codex/pasta-live-readiness` is at `1354f490` with additional proof-only work; current `origin/main` is ahead with WTF LIVE stage controls, so standalone Spaghetti promotion is being prepared as a narrow cherry-pick onto `96b85236`.
- Macaroni Desktop `1.0.0` individual installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Pasta Suite Desktop `1.0.0` bundled installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Spaghetti Studio Desktop `1.0.0` standalone installer package, GitHub Actions workflow, authenticated `/api/spaghetti/installers` manifest route, production env names, live verifier, docs, inventory probe, and GitHub release assets exist; production env/deploy/live verification is still pending.
- Local Macaroni Shadownet puppet proof now passes 5/5 against a disposable Postgres database and `https://tezos-shadownet.octez.io/`, covering trusted-creator defaults, wallet chain safety, wtfOS publish gating, standalone mint-page wallet restore/disconnect, mismatched RPC blocking, and Shadownet Kukai handoff.
- Live Pasta/Macaroni static wallet bundles for `macaroni`, `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna` passed stale-Taquito probes: Taquito `24.3.0` is absent, Taquito `25.0.0` is present, and the old `rpc.shadownet.teztnets.com` marker is absent.
- Live Pasta static publisher `common.js` files now expose the `window.MD` runtime export in `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna`, while retaining `consumeCheaseHandoff()` and `loadPlatformCapabilities()` markers.

## Cleanup Performed

- Ran `git fetch --all --prune`; no ref changes were needed.
- Ran `git worktree prune -v` after dry-run proof and removed seven dead worktree metadata records whose `/private/tmp` paths no longer existed.
- Left existing checked-out worktrees untouched, especially dirty ones, because they may contain user context.

## Worktree Classification

| Worktree | Branch/Head | Dirty Count | Classification | Action |
| --- | --- | ---: | --- | --- |
| `.config/superpowers/worktrees/WTF/codex-pasta-live-readiness` | `codex/pasta-live-readiness` / `c4ba55ff` | 0 | Valid current Pasta/live-readiness record | Keep until the broader goal is fully audited; it is the clean evidence branch and is aligned with `origin/main`. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF` | local `main` / `9d043fd` | 295 | Stale mixed scratch checkout | Do not deploy from it. It is behind `origin/main` and mixes Pasta, Gamma/Beta, apphost, Agent, localization, Skywire, WTF LIVE, Particle Painter, docs, and test churn. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` | `pasta-protocol` / `f6256708` | 29 | Superseded Pasta prototype | Do not promote wholesale. See stale Pasta findings below. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-macaroni-fullsend` | `codex/macaroni-direct-upload-lane` / `6706df2` | 0 | Historical Macaroni branch now ancestor of `origin/main` | Candidate for archival after user confirms no local notes are needed. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-ipfs-fullsend` | `codex/ipfs-pinning-organ` / `d40ab44` | 0 | Historical IPFS branch now ancestor of `origin/main` | Out of current Pasta installer scope; candidate archival. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-maplab-fullsend` | `codex/maplab-demo-fullsend` / `83d5a57` | 6 | Non-Pasta dirty work | Leave for separate Map Lab pass. |
| `.config/superpowers/worktrees/WTF/wtf-tv-roger-radio` | `codex/wtf-tv-roger-radio` / `a7a430f` | 20 | Non-Pasta dirty work | Leave for separate TV pass. |
| Gamma/Beta worktrees | assorted | 0 | Explicitly out of scope | Ignore for this goal unless files contaminate main production release work. |

## Stale Pasta Findings

The old `WTF-pasta-deploy` checkout is not a valid ongoing release branch:

- Most untracked Pasta app surfaces already exist on `origin/main`: `client/src/features/pasta-protocol`, `client/src/pages/Colander.tsx`, `client/src/pages/MacaroniPackager.tsx`, `contracts/pasta-protocol`, `docs/domains/pasta-protocol.md`, all six new static Pasta tools, `scripts/pasta-protocol`, `server/features/macaroni/packages.ts`, `shared/pasta-protocol`, `shared/schema-macaroni.ts`, `tests/playwright/inventory/macaroni-packager.spec.mjs`, and `tests/unit`.
- `drizzle/0103_macaroni_packages.sql` is superseded by tracked `drizzle/0104_macaroni_packages.sql` on `origin/main`.
- `server/features/pasta-protocol` contains only `.gitkeep`, so it does not carry product behavior.
- Its dirty `server/routes/macaroni.ts` would remove live installer checksum exposure, advertise the old Windows `.msi` filename, and allow remote `http:` installer URLs again. Those are supply-chain regressions compared with current production.
- Its dirty inventory and route files also remove newer app routes and presentation entries; those differences are old checkout drift, not a clean Pasta change.

Conclusion: mine this checkout only for human notes if needed. Do not apply its patch to main.

## Remaining Product Gaps

- The CH-EASE package-to-Pasta static runtime fix is now production-deployed: post-deploy live probes confirm `window.MD` exports on the six Pasta publisher bundles.
- Pasta suite installer/download is now production-complete for the bundled native suite lane: `apps/pasta-suite-desktop`, the `pasta-suite-desktop-installers.yml` workflow, `/api/pasta/installers`, inventory coverage, package policy checks, GitHub release assets, production env, and the authenticated live verifier all passed for `pasta-suite-desktop-v1.0.0`.
- Spaghetti standalone installer/download is release-asset-complete but not production-manifest-complete: `apps/spaghetti-desktop`, the `spaghetti-desktop-installers.yml` workflow, `/api/spaghetti/installers`, inventory coverage, package policy checks, env examples, docs, live verifier, and GitHub release assets now exist; production `SPAGHETTI_INSTALLER_*` env, container reload/deploy, and authenticated live verifier are still required before users can download it from `wtfos.app`.
- Full Pasta contract/product workflow proof remains broader than static bundle availability and the now-green Macaroni Shadownet confidence lane: actual Shadownet origination, mint/collect, failure recovery, WTF.ME hosting, wtfOS pinning, and cross-app Colander management should remain open until executable evidence exists.
- Local `main` at the original workspace should be fast-forwarded, reset, or archived only after the user confirms whether its dirty scratch content should be preserved.

## Current Macaroni Shadownet Proof

- Local proof command: `DATABASE_URL=postgresql://wtf:***@127.0.0.1:55432/wtf npm run test:e2e:macaroni:shadownet`.
- Database proof: disposable local Postgres on `127.0.0.1:55432`, prepared with `npm run db:push`.
- Puppet proof: 12 actor-backed Shadownet wallets seeded against `https://tezos-shadownet.octez.io/` with chain id `NetXsqzbfFenSTS`.
- Playwright proof: 5/5 passed for trusted-creator Shadownet defaults and chain-verified wallet, regular-user wtfOS provider exclusion, generated mint-page wallet restore/disconnect, mismatched RPC blocking before wallet signing, and Shadownet Kukai handoff.
- Scope note: this proves Macaroni's local Shadownet wallet/publish-page confidence lane. It does not yet prove a live KT1 origination, token mint/collect, hosted page resolution, Colander discovery, or all Pasta app publishers.

## Current Suite Installer Proof

- Source/package proof: `npm run pasta-suite:desktop:check` passed 5/5.
- Macaroni regression proof: `npm run macaroni:desktop:check` passed 4/4.
- Inventory proof: `npm run test:e2e:inventory:coverage` passed with `pasta_suite.installer_manifest.viewed` and `/api/pasta/installers` in the Pasta workflow.
- TypeScript proof: `npm run check -- --pretty false` passed.
- Local macOS build proof: `npm run dist:mac --prefix apps/pasta-suite-desktop` produced unsigned artifacts:
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 3b00d06229d2527294aac8f67e43e9437f5544846225e9688a345af9addf01e9`)
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.zip` (`sha256 812650e1e62d1bbe7332b84d6a437966ef9ddb2262977c8923429551a4e73f24`)
- Branch Quality Gates run `28470551711` passed on `fd4afcd`; the current release branch Quality Gates run `28478213183` passed on `c4ba55ff`.
- Main Deploy to Hetzner run `28471646097` passed for `fd4afcd`; the later main Deploy to Hetzner run `28479148838` passed for `c4ba55ff`, main Quality Gates run `28479148843` passed, and live health currently reports `commitRef: "c4ba55f"`.
- Pasta Suite Desktop Installers workflow run `28471682307` passed and published release tag `pasta-suite-desktop-v1.0.0`.
- Release asset proof from GitHub release metadata:
  - macOS DMG: `Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 1c62cfde5a019d0c5900476c9dc72d2fc60c25e8098b06be5a88b4e858dbf39f`)
  - Windows NSIS: `Pasta-Suite-1.0.0-win-x64.exe` (`sha256 5fb9c02531aa492a306928e89501eb3d628c61b4380720fb8a7e54fffa0c2f8a`)
  - Raspberry Pi Debian package: `Pasta-Suite-1.0.0-linux-arm64.deb` (`sha256 bd15004c5a4233bf27280d9b2132e0408739f349ef7f0184af0cf665c5fe4a29`)
- Production `PASTA_SUITE_INSTALLER_*` env was configured from those release digests, then the app container was recreated with the deploy temp-env pattern so the running process picked up the values.
- `npm run pasta-suite:installers:live-check` passed against `https://wtfos.app` with production puppet `e2e_bert`; it verified unauthenticated `401`, GitHub release asset discovery, byte-range download support for all three platform assets, authenticated login, and manifest version/URL/SHA agreement.

## Current Spaghetti Standalone Installer Proof

- Source/package proof: `npm run spaghetti:desktop:check` passed 6/6 after adding the package, workflow, manifest route, env example, live verifier, inventory probe, and native-boundary assertions.
- Asset prep proof: `npm run spaghetti:desktop:prepare` copied the Spaghetti static publisher, standard-collection contract artifact, shared Pasta foundation runtime, Taquito bundle, and Octez Connect bundle into the ignored desktop package asset directory.
- Local macOS build proof: `npm run dist:mac:dir --prefix apps/spaghetti-desktop` produced an unsigned unpacked app at `apps/spaghetti-desktop/release/mac-universal/spaghetti-studio.app` (`485M`); local proof hash recorded during the package pass: `app.asar` SHA-256 `7e5afd18dd7f191b5058c57d19a10640dfaff2a55dc43c308725aeda8f130773`.
- Production manifest proof added on branch: `/api/spaghetti/installers` is authenticated, reads `SPAGHETTI_INSTALLER_VERSION`, platform URL, and platform SHA-256 env values, rejects plaintext remote URLs in production, and marks downloads available only when both URL and SHA-256 are configured.
- Live verifier added on branch: `npm run spaghetti:installers:live-check` expects release tag `spaghetti-desktop-v1.0.0`, compares the authenticated manifest to GitHub release asset URLs and SHA-256 digests, confirms unauthenticated manifest requests stay protected, and can byte-range probe release assets.
- Release asset proof: Spaghetti Desktop Installers workflow run `28491364684` passed and published release tag `spaghetti-desktop-v1.0.0`.
- Release asset metadata from GitHub:
  - macOS DMG: `Spaghetti-Studio-1.0.0-mac-universal.dmg` (`sha256 0cca2e45d91d6438bab7b4c10ebc41226dffdee934afa24e5c34221a88f1c60a`)
  - Windows NSIS: `Spaghetti-Studio-1.0.0-win-x64.exe` (`sha256 ba402284209fc777c7995ad6573ab017444604da80f475aeb81c7385b47b42d4`)
  - Raspberry Pi Debian package: `Spaghetti-Studio-1.0.0-linux-arm64.deb` (`sha256 3e8687bc87992f64af2666401f5f2e3b38b4641182dabe1ff46590f1497a9dd8`)
- Public release verifier proof: `SPAGHETTI_INSTALLER_CHECK_ASSETS=1 SPAGHETTI_INSTALLER_REQUIRE_AUTH=0 npm run spaghetti:installers:live-check` confirmed release asset discovery and byte-range support, then failed closed on the production manifest because live `https://wtfos.app/api/spaghetti/installers` still returns 404 before this promotion branch is deployed.
- Inventory proof added on branch: `spaghetti.installer_manifest.viewed` and `/api/spaghetti/installers` are registered in `tests/e2e/inventory/domain-workflows.mjs`; `npm run test:e2e:inventory:coverage` passed on the promotion branch.
- Promotion branch validation passed: `node --check` on Spaghetti desktop/verifier scripts, `npm run spaghetti:desktop:check`, `npx tsx --test server/routes/macaroni-policy.test.ts`, `npm run spaghetti:desktop:prepare`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, and `git diff --check HEAD~1..HEAD`.
- Scope note: this is release-asset and branch readiness proof. It does not yet prove production `SPAGHETTI_INSTALLER_*` env, reloaded production app container, authenticated live manifest agreement, or downloadable assets through `https://wtfos.app`.

## Recommended Next Actions

1. Extend the now-green Macaroni Shadownet lane into one end-to-end Pasta chain: CH-EASE package -> publisher -> Shadownet deploy/mint -> Colander discovery -> hosted page or artifact resolution.
2. Configure production `SPAGHETTI_INSTALLER_*` env from the `spaghetti-desktop-v1.0.0` GitHub release digests, deploy/reload the production app so `/api/spaghetti/installers` exists on `wtfos.app`, then run `SPAGHETTI_INSTALLER_COOKIE='connect.sid=...' npm run spaghetti:installers:live-check`.
3. Repeat the individual installer package/manifest/live-check pattern for Gnocchi, Ravioli, Rotini, Penne, and Lasagna if separate per-app downloads are required beyond the bundled Pasta Suite.
4. After user confirmation, archive/delete merged historical Macaroni branches and clean checked-out worktrees that are ancestors of `origin/main`.
5. Keep `WTF-BB-332` open until the stale `WTF-pasta-deploy` checkout is archived/reset or explicitly retained with a warning note.
