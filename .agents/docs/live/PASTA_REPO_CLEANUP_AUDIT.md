# Pasta Repo Cleanup Audit

Last audited: 2026-07-01
Auditor: Codex Pasta cleanup/status continuation
Production focus: `https://wtfos.app`

## Current Production Authority

- Authoritative production source is current `origin/main` at `069bd7493e69104dac708cdc376eadc5454d7829` (`Add Colander Shadownet discovery proof`).
- Live `https://wtfos.app/api/health` returned `status: "ok"`, `version.commitRef: "069bd74"`, `nodeEnv: "production"`, healthy database, and current mainnet chain defaults during the 2026-07-01 cleanup/status pass.
- Clean promotion branch `codex/spaghetti-installer-live` is currently the Pasta release lane and ahead of `origin/main` by 17 scoped commits after this pass: WTF.ME hosted-page proof, Pasta pinning/recovery proof, hardened pin recovery publish path, suite manifest `bundledApps`, explicit-host WTF.ME live check, explicit/discovered-host live inventory, stale-branch classification refresh, live publisher overwrite guards, live publisher expected-host pinning, a Pasta live-readiness gate, installer-aware readiness coverage, post-publish public host verification, credentialed publish dry-run validation, signer-backed Colander management action proof, and Colander browser-wallet choreography proof.
- The Spaghetti installer route was code-verified on commit `09fff2fb2efe8481957d6f199cdf164f73c658c4`; live verification and release notes were promoted on `e080b896`.
- Live cleanup verification later reported `commitRef: "21e1aca"`, `nodeEnv: "production"`, and healthy database, chain, and jobs status after the stale-worktree cleanup-doc deploy.
- Main Quality Gates run `28494018464` and Deploy to Hetzner run `28494018454` succeeded for commit `21e1aca`.
- Shadownet preflight commit `24cf9e26` is live: Deploy to Hetzner run `28494771031` and Quality Gates run `28494771038` passed, and live health reported `commitRef: "24cf9e2"` with healthy database, chain, and jobs status.
- The broader Pasta evidence branch `codex/pasta-live-readiness` is now a historical proof branch. Standalone Spaghetti, shared Shadownet proof-kit work, Gnocchi, Ravioli, Rotini, Penne, Lasagna, Colander discovery, WTF.ME hosted-page tooling, and pinning/recovery work have been promoted or reworked into narrower validated slices. Do not merge or replay that branch wholesale; current `HEAD..codex/pasta-live-readiness` would delete newer guard files and reintroduce stale assumptions.
- Macaroni Desktop `1.0.0` individual installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Pasta Suite Desktop `1.0.0` bundled installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Spaghetti Studio Desktop `1.0.0` standalone installer package, GitHub Actions workflow, authenticated `/api/spaghetti/installers` manifest route, production env names, live verifier, docs, inventory probe, GitHub release assets, production env, and authenticated live verification now exist for macOS, Windows, and Raspberry Pi.
- Local Macaroni Shadownet puppet proof now passes 5/5 against a disposable Postgres database and `https://tezos-shadownet.octez.io/`, covering trusted-creator defaults, wallet chain safety, wtfOS publish gating, standalone mint-page wallet restore/disconnect, mismatched RPC blocking, and Shadownet Kukai handoff.
- Local signer-backed Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna Shadownet E2E proofs now pass against `https://tezos-shadownet.octez.io/` with operation and indexed TzKT evidence; Colander browser discovery opens those six current proof KT1s through `/tools/colander`, the signer-backed Colander action proof submits an idempotent Lasagna management action through the shared adapter semantics, and the browser-wallet choreography proof drives the Colander UI submit path through wallet preflight/send/confirmation with a localhost-only harness.
- Live Pasta/Macaroni static wallet bundles for `macaroni`, `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna` passed stale-Taquito probes: Taquito `24.3.0` is absent, Taquito `25.0.0` is present, and the old `rpc.shadownet.teztnets.com` marker is absent.
- Live Pasta static publisher `common.js` files now expose the `window.MD` runtime export in `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna`, while retaining `consumeCheaseHandoff()` and `loadPlatformCapabilities()` markers.

## Cleanup Performed

- Ran `git fetch --all --prune`; no ref changes were needed.
- Ran `git worktree prune -v` after dry-run proof and removed seven dead worktree metadata records whose `/private/tmp` paths no longer existed.
- Left existing checked-out worktrees untouched, especially dirty ones, because they may contain user context.
- Re-ran `git worktree list --porcelain` and a filesystem search under `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo` on 2026-07-01; `WTF-pasta-deploy` is no longer registered and its old directory is absent.
- Classified `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/WTF combo/DUMMY PASTA` as a separate tiny Shadownet Macaroni fixture repo, not a WTF production worktree or deploy candidate.
- No user work was deleted during this follow-up audit.

## Worktree Classification

| Worktree | Branch/Head | Dirty Count | Classification | Action |
| --- | --- | ---: | --- | --- |
| `.config/superpowers/worktrees/WTF/codex-pasta-live-readiness` | `codex/pasta-live-readiness` / `1354f490` | 0 | Historical Pasta proof branch, superseded by release slices | Keep as audit evidence only. Range comparison shows the current release branch contains newer reworked slices; do not merge/replay it wholesale because it would remove current host-gate, pinning-policy, and production-readiness guardrails. |
| `.config/superpowers/worktrees/WTF/codex-spaghetti-installer-live` | `codex/spaghetti-installer-live` | 0 | Current Pasta production/promotion checkout | Clean continuation lane, ahead of `origin/main` by 17 scoped commits after this pass. This is the only Pasta release branch to promote from; still blocked from a full production Pasta claim by live WTF.ME host and pin-discovery proof. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF` | local `main` / `9d043fd` | 298 | Stale mixed scratch checkout | Do not deploy from it. It is 47 commits behind `origin/main` and mixes Pasta, Gamma/Beta, apphost, Agent, localization, Skywire, WTF LIVE, Particle Painter, docs, and test churn. Preserve or archive only after user confirmation. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` | absent | 0 | Removed stale Pasta prototype | Historical regression warning only. Do not recreate or replay its patch. |
| `Desktop/cursor-projects/Sandbox/WTF combo/DUMMY PASTA` | standalone fixture repo | 0 | Shadownet Macaroni rehearsal fixture | Keep as fixture/reference material; it is not a WTF app worktree and not production deploy code. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-macaroni-fullsend` | `codex/macaroni-direct-upload-lane` / `6706df2` | 0 | Historical Macaroni branch now ancestor of `origin/main` | `git merge-base --is-ancestor` confirms it has no commits ahead of `origin/main`; candidate for archival after user confirms no local notes are needed. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-ipfs-fullsend` | `codex/ipfs-pinning-organ` / `d40ab44` | 0 | Historical IPFS branch now ancestor of `origin/main` | `git merge-base --is-ancestor` confirms it has no commits ahead of `origin/main`; out of current Pasta installer scope and candidate archival. |
| Clean non-Pasta ancestor worktrees | appearance, app-window, stage roles, wallet/X, fonts, reactions, inbox | mostly 0 | Already-merged non-Pasta work | Ignore for Pasta deployment; prune only after owner confirmation. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-fullsend-note` | `codex/future-dev-note` / `3d6818b` | 2 | Dirty non-Pasta note work | Leave untouched. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-maplab-fullsend` | `codex/maplab-demo-fullsend` / `83d5a57` | 6 | Non-Pasta dirty work | Leave for separate Map Lab pass. |
| `.config/superpowers/worktrees/WTF/wtf-tv-roger-radio` | `codex/wtf-tv-roger-radio` / `a7a430f` | 20 | Non-Pasta dirty work | Leave for separate TV pass. |
| Gamma/Beta worktrees | assorted | 0 | Explicitly out of scope | Ignore for this goal unless files contaminate main production release work. |

## Historical Stale Pasta Findings

The old `WTF-pasta-deploy` checkout is no longer present, but the earlier audit finding remains important as a "do not replay" warning:

- Most untracked Pasta app surfaces already exist on `origin/main`: `client/src/features/pasta-protocol`, `client/src/pages/Colander.tsx`, `client/src/pages/MacaroniPackager.tsx`, `contracts/pasta-protocol`, `docs/domains/pasta-protocol.md`, all six new static Pasta tools, `scripts/pasta-protocol`, `server/features/macaroni/packages.ts`, `shared/pasta-protocol`, `shared/schema-macaroni.ts`, `tests/playwright/inventory/macaroni-packager.spec.mjs`, and `tests/unit`.
- `drizzle/0103_macaroni_packages.sql` is superseded by tracked `drizzle/0104_macaroni_packages.sql` on `origin/main`.
- `server/features/pasta-protocol` contains only `.gitkeep`, so it does not carry product behavior.
- Its dirty `server/routes/macaroni.ts` would have removed live installer checksum exposure, advertised the old Windows `.msi` filename, and allowed remote `http:` installer URLs again. Those are supply-chain regressions compared with current production.
- Its dirty inventory and route files also removed newer app routes and presentation entries; those differences were old checkout drift, not a clean Pasta change.
- 2026-07-01 follow-up verification shows `git worktree list --porcelain` no longer lists the checkout and the old directory is absent from the local `WTF combo` folder.

Conclusion: `WTF-BB-332` is verified closed. Preserve the warning in history, but do not treat the removed checkout as active work or a release blocker.

## Remaining Product Gaps

- The CH-EASE package-to-Pasta static runtime fix is now production-deployed: post-deploy live probes confirm `window.MD` exports on the six Pasta publisher bundles.
- Pasta suite installer/download is now production-complete for the bundled native suite lane: `apps/pasta-suite-desktop`, the `pasta-suite-desktop-installers.yml` workflow, `/api/pasta/installers`, inventory coverage, package policy checks, GitHub release assets, production env, and the authenticated live verifier all passed for `pasta-suite-desktop-v1.0.0`. The current branch strengthens the source manifest contract by adding a `bundledApps` list for Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna; that field still needs post-deploy authenticated live verification before claiming production serves it.
- Spaghetti standalone installer/download is production-complete for the standalone native app lane: `apps/spaghetti-desktop`, the `spaghetti-desktop-installers.yml` workflow, `/api/spaghetti/installers`, inventory coverage, package policy checks, env examples, docs, live verifier, GitHub release assets, production `SPAGHETTI_INSTALLER_*` env, deploy, and authenticated live verifier all passed for `spaghetti-desktop-v1.0.0`.
- Full Pasta contract/product workflow proof remains broader than static bundle availability, the now-green Macaroni Shadownet confidence lane, the Spaghetti preflight, the signer-backed Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna proofs, the current Colander browser discovery, browser-wallet choreography, and representative signer-backed action proof, and the source-level WTF.ME/pinning proofs: live production WTF.ME hosting, live provider pinning, failure recovery, real wallet-extension Colander submission, and broader Colander action coverage should remain open until executable live evidence exists.
- The former `codex/pasta-live-readiness` proof branch has been mined/reworked into the current release lane. Future work should continue from `codex/spaghetti-installer-live`, not from the older broad proof branch.
- `npm run pasta:live-readiness` now provides the release-lane gate: it checks live `wtfos.app` health, live Pasta/Macaroni static Tezos bundle markers, shared Pasta runtime markers, Macaroni/Pasta Suite/Spaghetti public installer release assets, a forced non-writing WTF.ME publisher dry-run when local credentials are supplied, and the explicit `PASTA_WTFME_LIVE_HOST` checker. `PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1` keeps audit/reporting runs nonfatal while still printing the host/credential blockers.
- Local `main` at the original workspace should be fast-forwarded, reset, or archived only after the user confirms whether its dirty scratch content should be preserved.

## Current Macaroni Shadownet Proof

- Local proof command: `DATABASE_URL=postgresql://wtf:***@127.0.0.1:55432/wtf npm run test:e2e:macaroni:shadownet`.
- Database proof: disposable local Postgres on `127.0.0.1:55432`, prepared with `npm run db:push`.
- Puppet proof: 12 actor-backed Shadownet wallets seeded against `https://tezos-shadownet.octez.io/` with chain id `NetXsqzbfFenSTS`.
- Playwright proof: 5/5 passed for trusted-creator Shadownet defaults and chain-verified wallet, regular-user wtfOS provider exclusion, generated mint-page wallet restore/disconnect, mismatched RPC blocking before wallet signing, and Shadownet Kukai handoff.
- Scope note: this proves Macaroni's local Shadownet wallet/publish-page confidence lane. It does not yet prove a live KT1 origination, token mint/collect, hosted page resolution, Colander discovery, or all Pasta app publishers.

## Current Suite Installer Proof

- Source/package proof: `npm run pasta-suite:desktop:check` passed 5/5.
- Source manifest contract update: `/api/pasta/installers` now returns `bundledApps` for Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna, and the source policy/live verifier reject missing or unexpected suite app metadata after deployment.
- Macaroni regression proof: `npm run macaroni:desktop:check` passed 4/4.
- Inventory proof: `npm run test:e2e:inventory:coverage` passed with `pasta_suite.installer_manifest.viewed` and `/api/pasta/installers` in the Pasta workflow.
- TypeScript proof: `npm run check -- --pretty false` passed.
- Local macOS build proof: `npm run dist:mac --prefix apps/pasta-suite-desktop` produced unsigned artifacts:
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 3b00d06229d2527294aac8f67e43e9437f5544846225e9688a345af9addf01e9`)
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.zip` (`sha256 812650e1e62d1bbe7332b84d6a437966ef9ddb2262977c8923429551a4e73f24`)
- Branch Quality Gates run `28470551711` passed on `fd4afcd`; the current release branch Quality Gates run `28478213183` passed on `c4ba55ff`.
- Main Deploy to Hetzner run `28471646097` passed for `fd4afcd`; the later main Deploy to Hetzner run `28479148838` passed for `c4ba55ff`, main Quality Gates run `28479148843` passed, and this proof remains historical while live production has since advanced to `e080b89`.
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
- Pre-deploy public release verifier proof: `SPAGHETTI_INSTALLER_CHECK_ASSETS=1 SPAGHETTI_INSTALLER_REQUIRE_AUTH=0 npm run spaghetti:installers:live-check` confirmed release asset discovery and byte-range support, then failed closed on the production manifest because live `https://wtfos.app/api/spaghetti/installers` returned 404 before this promotion branch was deployed.
- Inventory proof added on branch: `spaghetti.installer_manifest.viewed` and `/api/spaghetti/installers` are registered in `tests/e2e/inventory/domain-workflows.mjs`; `npm run test:e2e:inventory:coverage` passed on the promotion branch.
- Promotion branch validation passed: `node --check` on Spaghetti desktop/verifier scripts, `npm run spaghetti:desktop:check`, `npx tsx --test server/routes/macaroni-policy.test.ts`, `npm run spaghetti:desktop:prepare`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, and `git diff --check HEAD~1..HEAD`.
- Production `SPAGHETTI_INSTALLER_*` env was configured from the release digests, then the app container was recreated by Deploy to Hetzner run `28492620424` so the running process picked up the values.
- `SPAGHETTI_INSTALLER_CHECK_ASSETS=1 SPAGHETTI_INSTALLER_REQUIRE_AUTH=1 npm run spaghetti:installers:live-check` passed against `https://wtfos.app` with production puppet `e2e_bert`; it verified unauthenticated `401`, GitHub release asset discovery, byte-range download support for all three platform assets, authenticated login, and manifest version/URL/SHA agreement.
- Scope note: this proves the standalone Spaghetti native installer download lane. It does not prove separate native installers for Gnocchi, Ravioli, Rotini, Penne, or Lasagna beyond their bundled Pasta Suite availability.

## Current Spaghetti Shadownet Preflight Proof

- Local proof command: `npm run pasta:shadownet:preflight`.
- Network proof: the configured Shadownet RPC default `https://tezos-shadownet.octez.io/` returned chain id `NetXsqzbfFenSTS`, matching the project Shadownet default.
- Indexer proof: Shadownet TzKT head returned `chain: "shadownet"`, `chainId: "NetXsqzbfFenSTS"`, and a positive level during this pass.
- Contract artifact proof: `public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json` exposes FA2 plus standard-collection entrypoints required by the Colander adapter and Spaghetti publish flow.
- Payload proof: the preflight validates a CH-EASE collection package, relationship metadata, token metadata, and initial origination storage payload shape for the Spaghetti standard collection.
- Scope note: this proves the real-network, unsigned Spaghetti Shadownet readiness gate. The signer-backed operation path is owned by `npm run pasta:shadownet:e2e`.

## Current Spaghetti Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e`.
- Safety gate: without `PASTA_SHADOWNET_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before loading signer state and again before each sensitive operation.
- Keyring proof: the command loads the platform keyring wallets `wtf-os-root` and `arcade-treasury`, requires both to be Shadownet wallets, and records only public wallet ids/addresses in the report.
- Funding proof: the first historical execute attempt blocked before origination because creator wallet `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` had only `2222596` mutez against an origination fee/burn estimate of `1266565` mutez plus follow-on operation headroom. The Shadownet faucet top-up `ooeZH3kucs975uq4g6B52ooZ1oRbZNXZzxpVPCEU2yGHWavZJ31` raised the wallet to `7222596` mutez before that rerun. During the shared proof-kit refactor pass, Gnocchi execution left the same creator at `1449185` mutez, the refactored Spaghetti command blocked before spending, and faucet top-up `opUUzBLG3pd2XkACfjyPNFD7hQAzXxr11KQKLDDChpZnsvcGFJ6` raised it before the current-code rerun.
- Deployment proof: contract `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc` originated on Shadownet by `wtf-os-root`.
- Operation proof: origination `oo88bXJQvofrsMUkguvdm5cYqc191oibyqdMioyvKAtrqFYhAJB`, create token `onyinAoomrdeo6kJrKw7yPMFF4G4MkcLyVoVTfWxmC51PJ3bp9V`, mint `op2qSe5jNqcieMGzsXC52BkaCgtP9bmArndN2Pk1KkWGsuNQocX`, and transfer/collect `ooBgUrdzwoEBnQxGs4UmbGNwJSMHi3WrfeGmvbd2BWEdHVsHWRU`.
- Indexer proof: TzKT storage indexed ledger big map `26801`, token metadata big map `26805`, collector ledger balance `1`, and decoded token metadata name `Spaghetti Proof Token` with relationship metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-spaghetti-e2e-report.md`.
- Scope note: this proves Spaghetti standard-collection deployment, token creation, minting, transfer/collect, metadata decoding, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, wallet-signed Colander management, or every Pasta publisher variant.

## Current Gnocchi Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e`.
- Safety gate: without `PASTA_SHADOWNET_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before loading signer state and again before creator and collector sensitive operations.
- Keyring proof: the command loads the platform keyring wallets `wtf-os-root` and `arcade-treasury`, requires both to be Shadownet wallets, and records only public wallet ids/addresses in the report.
- Funding proof: before origination, creator wallet `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` had `3993704` mutez and collector wallet `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` had `708744` mutez; the command estimated origination fee `8953` mutez and burn `2189750` mutez, then verified collector open-mint cost plus fee headroom before spending.
- Deployment proof: contract `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK` originated on Shadownet by `wtf-os-root`.
- Operation proof: origination `ooApSTk1YyQGwUs5mKpVrGbHHfAgHmoSW7yB8KehDYypC3apk9R`, create open edition `ooke2sTVMjnLLwqhH7hCfocGTanUBEDXfMoMdieJ2QJm2j2dQir`, and collector open mint `opHEtdBfjV4UjCcmVLLoeX8kPgMaborNoJ9m5JtDZhGWYWyNGAu`.
- Indexer proof: TzKT storage indexed ledger big map `26794`, token metadata big map `26799`, total supply big map `26800`, sales big map `26798`, collector ledger balance `1`, total supply `1`, active sale config, and decoded token metadata name `Gnocchi Proof Open Edition` with relationship metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-gnocchi-e2e-report.md`.
- Scope note: this proves Gnocchi open-edition deployment, sale configuration, collector open mint, metadata decoding, supply, sale state, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, wallet-signed Colander management, or every Pasta publisher variant.

## Current Ravioli Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e`.
- Safety gate: without `PASTA_SHADOWNET_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before loading signer state and again before creator and collector sensitive operations.
- Keyring proof: the command loads the platform keyring wallets `wtf-os-root` and `arcade-treasury`, requires both to be Shadownet wallets, and records only public wallet ids/addresses in the report.
- Funding proof: before origination, creator wallet `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` had `4834739` mutez and collector wallet `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` had `691254` mutez; the command estimated origination fee `6699` mutez and burn `1671250` mutez, then verified creator create/mint/transfer headroom and collector redeem fee headroom before spending.
- Deployment proof: contract `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB` originated on Shadownet by `wtf-os-root`.
- Operation proof: origination `ooDmME87nAtUV3geC9GvoGPDHzsjwDniCEqcJUuBqZQaYe82xHA`, create bundle `op6ZN8ZSKJh3buMmKEzG49uW3FsapFrAj2EouxYJ9BSdEkVzGzt`, mint `oouWdA3DA8y1Qnd41o2o953nLHEKHU4eoqbukux9yDhnwakdQaT`, transfer/collect `onrLHw2CzkCPxwbVrRibuM9ESUEpY2FmoxqB9zUXJPxammdPRVQ`, and redeem `onwmjEHevLpqs8UGC7CojeGQswCXZweCQybi55YtpQLWMaFA2vn`.
- Indexer proof: TzKT storage indexed ledger big map `26808`, token metadata big map `26814`, total supply big map `26815`, bundles big map `26807`, redeemed big map `26812`, collector ledger balance `1`, total supply `2` after one redeemed burn, bundle config `redeemable=true` / `mystery=false` / `item_count=2`, redeemed count `1`, and decoded token metadata name `Ravioli Proof Bundle` with relationship and bundle manifest metadata intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-ravioli-e2e-report.md`.
- Scope note: this proves Ravioli bundle deployment, bundle creation, minting, transfer/collect, redeem/burn, metadata decoding, total supply, bundle config, redeemed count, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, wallet-signed Colander management, mystery reveal, or every Pasta publisher variant.

## Current Rotini Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:rotini:e2e`.
- Safety gate: without `PASTA_SHADOWNET_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before loading signer state and again before creator and collector sensitive operations.
- Keyring proof: the command loads the platform keyring wallets `wtf-os-root` and `arcade-treasury`, requires both to be Shadownet wallets, and records only public wallet ids/addresses in the report.
- Funding proof: the first execute attempt blocked before origination because creator wallet `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` had `2227765` mutez and could not cover the estimated Rotini origination plus create/mint/transfer headroom. Shadownet faucet top-up `onpqeephir1NEprF9YdCpRtA4jKS72J2GLTVPu4Yte6FZLMo65q` raised the wallet before the successful rerun. On the passing run, the creator had `7227765` mutez, and the command estimated origination fee `5201` mutez plus burn `1294500` mutez before spending.
- Deployment proof: contract `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ` originated on Shadownet by `wtf-os-root`.
- Operation proof: origination `onrxE91pZk6rTW7otoyG6s9FvLoekHo4ndZ4RNEWsrVAsjdRodm`, create token 0 `onicHoBgNmamf2JxjkRHmBzr65CtEeqL6TSYDTZ4iBMJQbD1Y7c`, create token 1 `opJtvPJcV9PrYoVLBVbZ3fS83Wj5RztQREXSgRKrZnH4tcfCzAF`, mint token 0 `ooaGZNnptXs9bXsadHNAEeRa6rWercLXNuv2EQj4CfkS3vLtUwT`, mint token 1 `ooSrWREnWxY7G4sv8moSyxwis3nB1sxtQX6HfKycNzm3wtjBuBT`, and transfer/collect `ooYCs8knzTnubXY4Uug3DokTjK42ULpxpkK6rUfvvM7Y1V4ywt6`.
- Indexer proof: TzKT storage indexed ledger big map `26816`, token metadata big map `26820`, total supply big map `26821`, creator ledger balance `1` for token 0, collector ledger balance `1` for token 1, total supply entries `0:1` and `1:1`, and decoded token metadata names `Rotini Proof Seed #1` / `Rotini Proof Seed #2` with relationship metadata, trait attributes, and Rotini DNA intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-rotini-e2e-report.md`.
- Scope note: this proves Rotini generative collection deployment, deterministic generated-token metadata, token creation, minting, transfer/collect, total supply, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, wallet-signed Colander management, browser wallet batching, or every Pasta publisher variant.

## Current Penne Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e`.
- Safety gate: without `PASTA_SHADOWNET_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before loading signer state and again before creator and collector sensitive operations.
- Keyring proof: the command loads the platform keyring wallets `wtf-os-root` and `arcade-treasury`, requires both to be Shadownet wallets, and records only public wallet ids/addresses in the report.
- Funding proof: before origination, creator wallet `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` had `4928219` mutez and collector wallet `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` had `673838` mutez. The command estimated origination fee `7339` mutez plus burn `1809500` mutez and verified create/allocation/open/airdrop/close headroom before spending.
- Deployment proof: contract `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz` originated on Shadownet by `wtf-os-root`.
- Operation proof: origination `oo4EWt4cSBzh8YQXMvstowHos8FyBJ4hHCmQgn6N6Tjf5AqoMkN`, create distribution token `oobqhAW2hYrFKgH8oUzVhDBXFNxgX2MjMezFrYcpBo5ePDJoo2n`, set allocations `ooKD83y3BSchZp7ag4SNN9EmEzz3sv6CdusqHq6g9oTFhk9qcxU`, open claim `opYFDNKKVqYCi6grnxmzptRFbmfUtymfYUzbV7EjnBh98sWFXq8`, collector claim `oo5bYmyRD3jbNkrM55SEYgMQJLWXmiyGT9HGZAJkteAprBaiJGG`, admin airdrop `onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq`, and close claim `ookcHpcnnux1bD1VsJ3AE9fAh9YQZ14LaG8tcF2nrLc4Fh6sg6n`.
- Indexer proof: TzKT storage indexed ledger big map `26824`, token metadata big map `26828`, total supply big map `26829`, allocations big map `26822`, claimed big map `26823`, collector ledger balance `2` after pull claim, creator ledger balance `3` after admin airdrop, total supply `5`, claimed entries collector `2` and creator `3`, inactive/cleared allocation rows for both recipients, final claim window `false`, and decoded token metadata name `Penne Proof Distribution Token` with relationship metadata and distribution modes intact.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-penne-e2e-report.md`.
- Scope note: this proves Penne distribution deployment, token creation, allocation loading, claim-window configuration, recipient pull claim, admin push airdrop, allocation consumption, supply, ownership, claimed-state, and metadata resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, wallet-signed Colander management, browser wallet batching, failure recovery, or every Pasta publisher variant.

## Current Lasagna Shadownet E2E Proof

- Local proof command: `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e`.
- Safety gate: without `PASTA_SHADOWNET_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before loading signer state and again before creator and curator sensitive operations.
- Keyring proof: the command loads the platform keyring wallets `wtf-os-root` and `arcade-treasury`, requires both to be Shadownet wallets, and records only public wallet ids/addresses in the report.
- Funding proof: the first execute attempt blocked before origination because creator wallet `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` had `2706667` mutez and could not cover the estimated Lasagna origination plus curator/revision/admin headroom. Shadownet faucet top-up `oopACxFXLpaymaAn9HNWLpwXkzcm2J4MP5cx6sCpFa6kuwmnxQD` raised the wallet before the successful rerun. On the passing run, the creator had `12706667` mutez, the curator had `656500` mutez, and the command estimated origination fee `3399` mutez plus burn `841000` mutez before spending.
- Deployment proof: contract `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r` originated on Shadownet by `wtf-os-root`.
- Operation proof: origination `ooC4sPHna3JitAUL5fbKSszCas4gL9CsvxBA2cCNRWoHSr3jhs2`, add curator `ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM`, curator publish revision 0 `opRyqay93MN3ngWueFX1zk3JWV6Frb6SGSeWHp673Xw4Fv9iNw9`, administrator publish revision 1 `opHbmXxzPZU7vaA9iUiuQCJq3nzDcLbSuk45w2W3ShCapdPcmdG`, set current revision to 0 `ooMrVCnRvA8HZhuA874Hn7gmuvWdnEV28jwmXgGz1JCPCbMVTjG`, remove curator `onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp`, transfer administration `oojtP5PcBpsJhiRPxFPkPWuJD6kw4noVEemSCVLdnVhjatoN4ht`, and accept administration `opComejGYmbYFovuqfnffrYeLtmCT9Xs7j16XFs6oNLpyPz4YuL`.
- Indexer proof: TzKT storage indexed metadata big map `26831`, curators big map `26830`, revisions big map `26832`, final administrator `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`, null pending administrator, revision count `2`, current revision pointer `0`, revision 0 curator/metadata for Spaghetti and Gnocchi proof contracts, revision 1 curator/metadata for Ravioli, Rotini, and Penne proof contracts, and no active curator entry remaining after the curator-removal/admin-handoff path.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-lasagna-e2e-report.md`.
- Scope note: this proves Lasagna exhibition deployment, curator configuration, revision publication, current-revision rollback, curator removal, two-step administration handoff, metadata decoding, referenced-proof-contract resolution, and indexed storage/big-map state. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, wallet-signed Colander management, failure recovery, or mainnet readiness.

## Current Colander Shadownet Discovery Proof

- Local proof command: `npm run pasta:shadownet:colander`.
- Browser proof: Playwright Chromium opened `/tools/colander` with `localStorage["wtf:network"] = "shadownet"` and drove the inventory harness on `HARNESS_PORT=4322`.
- Contract proof: Colander opened the current Shadownet proof contracts for Spaghetti `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, Gnocchi `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, Ravioli `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, Rotini `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`, Penne `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, and Lasagna `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`.
- UI proof: the page rendered adapter labels, required state facts, supported actions, Shadownet explorer links, and relationship groups for all six proof contracts.
- Event proof: the inventory harness observed `colander.contract_opened` and `colander.graph_viewed`.
- Source proof: `client/src/features/pasta-protocol/colander/ColanderApp.tsx` now supports Shadownet TzKT links, inline `data:application/json` relationship metadata, HTTPS/IPFS metadata fetch policy, and `assertNetworkReadyForSend(me)` before wallet-signed writes.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-colander-discovery-report.md`.
- Browser-wallet choreography proof: the same command also runs a localhost-only Playwright wallet harness that opens the Lasagna proof contract, selects `set_current_revision`, fills revision `0`, submits the form, and records wallet preflight, Shadownet chain id read, wallet contract lookup, send, and confirmation for the Colander UI path.
- Scope note: this proves Colander browser discovery, adapter/action rendering, relationship metadata decoding, event emission, and browser UI-to-wallet choreography for a representative management action. The signer-backed real-chain management mutation proof is tracked separately below; this browser proof does not yet prove a real wallet extension, WTF.ME hosted pages, hosted wtfOS pinning/recovery, failure recovery, or mainnet readiness.

## Current Colander Shadownet Management Action Proof

- Local proof command: `PASTA_SHADOWNET_COLANDER_E2E_EXECUTE=1 npm run pasta:shadownet:colander:action`.
- Safety gate: without `PASTA_SHADOWNET_COLANDER_E2E_EXECUTE=1`, the command writes a `BLOCKED` report and exits before loading signer state or spending Shadownet test tez.
- Network proof: the command validates the configured Shadownet RPC chain id against `NetXsqzbfFenSTS` before signer load and again before operation submission.
- Adapter proof: the command opens Lasagna proof contract `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, detects the shared `exhibition` adapter with `detectPastaContract`, and verifies `availableActions` exposes the `set_current_revision` curation action.
- Storage proof: pre-operation storage confirmed administrator `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`, null pending administrator, revision count `2`, and current revision `0`.
- Operation proof: Shadownet signer `arcade-treasury` submitted idempotent `set_current_revision(0)` operation `oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h`; TzKT indexed it as an applied transaction from `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` to `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r` with entrypoint `set_current_revision`, value `0`, and final storage still at administrator/current revision/revision count `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` / `0` / `2`.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-colander-action-report.md`.
- Scope note: this proves a real signer-backed representative Colander management mutation against a current Shadownet Pasta proof contract. Together with the browser choreography proof above, it covers both UI wiring and real chain mutation for `set_current_revision(0)`, but it does not yet prove a real wallet extension, every Colander action, production WTF.ME hosting, hosted wtfOS pinning/recovery, failure recovery, or mainnet readiness.

## Current WTF.ME Hosted Pasta Page Proof

- Local proof command: `npm run pasta:shadownet:wtfme`.
- Source proof: `server/features/wtf-sites/pasta-hosting.ts` builds landing, mint, and collection page snapshots from `shared/pasta-shadownet-proof-contracts.json`, which lists the current Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna Shadownet proof contracts and relationship groups.
- Browser proof: Playwright Chromium publishes those pages through the WTF.ME harness APIs, serves them from `wtf-admin.wtfos.me` with user-site CSP/COOP headers, and verifies the Shadownet chain id, current proof KT1s, relationship groups, wallet marker, mint action marker, and Shadownet TzKT links.
- Event proof: the inventory harness observes `wtf_site.claimed`, `wtf_site.page_saved`, `wtf_site.published`, and `wtf_site.public.viewed` events for the hosted Pasta pages.
- Tooling proof: `scripts/pasta-protocol/wtfme-live-publish.ts` defaults to dry-run and requires `PASTA_WTFME_LIVE_PUBLISH=1`, `PASTA_WTFME_LIVE_EXPECT_HOST=<dedicated-host.wtfos.me>`, scoped auth, and CSRF before writing; it preflights existing WTF.ME pages before saving, refuses non-target page carryover, requires `PASTA_WTFME_LIVE_OVERWRITE_EXISTING=1` before replacing existing non-Pasta target pages, checks the production TLS gate before calling the Pasta pin recovery publish route, and runs the public `pasta:wtfme:live-check` verifier after publish/pin recovery so a denied, accidental, or publicly broken host cannot be treated as complete. `scripts/pasta-protocol/wtfme-live-inventory.ts` is read-only; `scripts/pasta-protocol/wtfme-live-check.ts` verifies the explicit `PASTA_WTFME_LIVE_HOST` real host, page markers, wallet-safe headers, and `.well-known/wtfos-pins`.
- Release-gate proof: `PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1 npm run pasta:live-readiness` passed its executable audit mode on 2026-07-01 by proving live health, live static bundle/runtime markers, and public Macaroni/Pasta Suite/Spaghetti installer release assets while reporting the expected blockers: no local Pasta WTF.ME publish credentials and no proven live Pasta WTF.ME host. Source policy now requires the gate to run `pasta:wtfme:live-publish` with `PASTA_WTFME_LIVE_PUBLISH=0` and host binding when credentials are supplied.
- Live blocker: production read-only audit on 2026-07-01 found no `wtf_user_sites` row for `wtf-admin.wtfos.me`; `paulwhoisaghost.wtfos.me` passes the TLS gate and has an active WTFOS repo/wallet but currently serves a generic user-site page, so no production host serves the Pasta landing/mint/collection pages yet.
- Credential availability audit: 2026-07-01 name-only checks found no local `PASTA_WTFME`, `WTFME`, `WTFOS_APP_LOGIN`, `APP_LOGIN`, `LIVE_PUPPET`, `E2E`, or `PUPPET` env names; no Pasta/WTF.ME matches in the local production/local puppet credential files or `.codex/secure/wtf-keyring.env`; SSH to `wtf` succeeded; sudo name-only reads of `/etc/wtf/wtf.env` were available and showed 186 env names but no matching Pasta WTF.ME/app-login/puppet credential names in current or checked installer backup env files.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-wtfme-hosting-report.md`.
- Scope note: this proves the WTF.ME hosted-page source and local serving path. It does not yet prove a live production WTF.ME host, live pin discovery, live wallet minting, hosted wtfOS pinning/recovery, real wallet-extension Colander submission, or mainnet readiness.

## Current Pasta Pinning/Recovery Proof

- Local proof command: `npm run pasta:shadownet:pinning`.
- Source proof: `server/features/ipfs-pinning/pasta-proof.ts` builds public pinPolicy, pinManifest, and pinItem records for Pasta hosted pages, contract artifacts, token metadata, and relationship metadata tied to the current Shadownet proof contracts.
- Live publish route proof: `POST /api/ipfs-pinning/pasta-protocol/publish` is permission-gated, requires a published WTF.ME site, active PDS/repo, linked Tezos wallet, reachable Hetzner Object Storage, and an object-mirrored project-bundle manifest before exposing `.well-known` discovery. The route reuses an existing in-flight/published Pasta project-bundle manifest for the same host rather than creating duplicate policy/manifest/job rows on rerun.
- Recovery proof: the focused test validates credential-free storage refs, SHA-256 checksums, IPFS gateway fallbacks, object-storage mirror keys, `.well-known/wtfos-pins` output, and a recovery drill that restores from public discovery through manifest and item records.
- Safety proof: `server/features/ipfs-pinning/well-known-policy.ts` keeps public pin discovery at 404 until the binding has public discovery enabled, a valid repo DID, and a matching `app.wtfos.media.pinManifest` AT URI for that DID.
- Inventory proof: `pasta-protocol.pinning-recovery` is registered against both the Pasta Protocol and IPFS Pinning admin surfaces, and the new Pasta pin recovery API is registered in the domain workflow/admin route inventory so coverage gates track the source proof and live publish route.
- Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-pinning-recovery-report.md`.
- Scope note: this proves source-level Pasta pinning and recovery shape. It does not yet prove a live provider-side pin, a production object mirror write, a production PDS publication, a live `.well-known/wtfos-pins` response, or recovery after real node/provider loss.

## Recommended Next Actions

1. Provision or identify a dedicated Pasta WTF.ME publish account/host credential outside the repo; then run the readiness gate's dry-run publisher preflight before enabling `PASTA_WTFME_LIVE_PUBLISH=1`.
2. Publish the generated Pasta pages to a real claimed WTF.ME host and make `PASTA_WTFME_LIVE_HOST=<published-host> npm run pasta:wtfme:live-check` pass.
3. Convert the source-level Pasta pinning/recovery proof into live provider proof: write/publish the manifest, expose `.well-known/wtfos-pins`, verify public recovery URLs, and test object-mirror fallback.
4. Extend the now-green Macaroni Shadownet lane and signer-backed Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna proofs into one end-to-end Pasta chain: CH-EASE package -> publisher -> Shadownet deploy/mint -> Colander discovery -> hosted page or artifact resolution.
5. Extend the representative Colander management proofs to real wallet-extension submission and additional safe actions before treating Colander as a fully operational admin surface.
6. Repeat the individual installer package/manifest/live-check pattern for Gnocchi, Ravioli, Rotini, Penne, and Lasagna if separate per-app downloads are required beyond the bundled Pasta Suite.
7. After user confirmation, archive/delete merged historical Macaroni/IPFS and other clean ancestor worktrees; leave dirty non-Pasta worktrees untouched.
8. Decide whether the original dirty local `WTF` checkout should be preserved before any reset, fast-forward, or archival action.
