# Pasta Repo Cleanup Audit

Last audited: 2026-07-01
Auditor: Codex Pasta live-readiness continuation
Production focus: `https://wtfos.app`

## Current Production Authority

- Authoritative production source is current `origin/main` at `f2a8deabc37a2de3dddd1e246b9ac5e165013feb` before this signer-backed Ravioli Shadownet E2E slice.
- The Spaghetti installer route was code-verified on commit `09fff2fb2efe8481957d6f199cdf164f73c658c4`; live verification and release notes were promoted on `e080b896`.
- Live cleanup verification later reported `commitRef: "21e1aca"`, `nodeEnv: "production"`, and healthy database, chain, and jobs status after the stale-worktree cleanup-doc deploy.
- Main Quality Gates run `28494018464` and Deploy to Hetzner run `28494018454` succeeded for commit `21e1aca`.
- Shadownet preflight commit `24cf9e26` is live: Deploy to Hetzner run `28494771031` and Quality Gates run `28494771038` passed, and live health reported `commitRef: "24cf9e2"` with healthy database, chain, and jobs status.
- The broader Pasta evidence branch `codex/pasta-live-readiness` is a proof-only source branch; standalone Spaghetti, shared Shadownet proof-kit work, Gnocchi proof, and Ravioli proof were promoted by narrow validated slices instead of merging that whole branch.
- Macaroni Desktop `1.0.0` individual installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Pasta Suite Desktop `1.0.0` bundled installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Spaghetti Studio Desktop `1.0.0` standalone installer package, GitHub Actions workflow, authenticated `/api/spaghetti/installers` manifest route, production env names, live verifier, docs, inventory probe, GitHub release assets, production env, and authenticated live verification now exist for macOS, Windows, and Raspberry Pi.
- Local Macaroni Shadownet puppet proof now passes 5/5 against a disposable Postgres database and `https://tezos-shadownet.octez.io/`, covering trusted-creator defaults, wallet chain safety, wtfOS publish gating, standalone mint-page wallet restore/disconnect, mismatched RPC blocking, and Shadownet Kukai handoff.
- Local signer-backed Spaghetti, Gnocchi, and Ravioli Shadownet E2E proofs now pass against `https://tezos-shadownet.octez.io/` with operation and indexed TzKT evidence.
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
| `.config/superpowers/worktrees/WTF/codex-pasta-live-readiness` | `codex/pasta-live-readiness` / `1354f490` | 0 | Valid Pasta proof branch with unique unmerged work | Keep as a source branch for narrow, validated Shadownet/WTF.ME/pinning slices. It is not the production base and should not be merged wholesale. |
| `.config/superpowers/worktrees/WTF/codex-spaghetti-installer-live` | `codex/spaghetti-installer-live` / `f2a8deab` | 0 before this E2E proof slice | Current production/promotion checkout | Production-aligned with `origin/main` before this signer-backed Ravioli proof edit; keep as the clean continuation lane for the next Pasta slice. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF` | local `main` / `9d043fd` | 298 | Stale mixed scratch checkout | Do not deploy from it. It is 38 commits behind `origin/main` and mixes Pasta, Gamma/Beta, apphost, Agent, localization, Skywire, WTF LIVE, Particle Painter, docs, and test churn. Preserve or archive only after user confirmation. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` | absent | 0 | Removed stale Pasta prototype | Historical regression warning only. Do not recreate or replay its patch. |
| `Desktop/cursor-projects/Sandbox/WTF combo/DUMMY PASTA` | standalone fixture repo | 0 | Shadownet Macaroni rehearsal fixture | Keep as fixture/reference material; it is not a WTF app worktree and not production deploy code. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-macaroni-fullsend` | `codex/macaroni-direct-upload-lane` / `6706df2` | 0 | Historical Macaroni branch now ancestor of `origin/main` | Candidate for archival after user confirms no local notes are needed. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-ipfs-fullsend` | `codex/ipfs-pinning-organ` / `d40ab44` | 0 | Historical IPFS branch now ancestor of `origin/main` | Out of current Pasta installer scope; candidate archival. |
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
- Pasta suite installer/download is now production-complete for the bundled native suite lane: `apps/pasta-suite-desktop`, the `pasta-suite-desktop-installers.yml` workflow, `/api/pasta/installers`, inventory coverage, package policy checks, GitHub release assets, production env, and the authenticated live verifier all passed for `pasta-suite-desktop-v1.0.0`.
- Spaghetti standalone installer/download is production-complete for the standalone native app lane: `apps/spaghetti-desktop`, the `spaghetti-desktop-installers.yml` workflow, `/api/spaghetti/installers`, inventory coverage, package policy checks, env examples, docs, live verifier, GitHub release assets, production `SPAGHETTI_INSTALLER_*` env, deploy, and authenticated live verifier all passed for `spaghetti-desktop-v1.0.0`.
- Full Pasta contract/product workflow proof remains broader than static bundle availability, the now-green Macaroni Shadownet confidence lane, the Spaghetti preflight, and the signer-backed Spaghetti/Gnocchi/Ravioli proofs: Rotini, Penne, Lasagna, failure recovery, WTF.ME hosting, wtfOS pinning, and cross-app Colander management should remain open until executable evidence exists.
- The remaining unique Pasta proof work is concentrated in `codex/pasta-live-readiness`; it should be mined by narrow slices. The current slice adds the signer-backed Ravioli bundle proof on the shared Shadownet proof kit without merging that broader branch wholesale.
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
- Scope note: this proves Spaghetti standard-collection deployment, token creation, minting, transfer/collect, metadata decoding, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, Colander real-contract discovery, or every Pasta publisher variant.

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
- Scope note: this proves Gnocchi open-edition deployment, sale configuration, collector open mint, metadata decoding, supply, sale state, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, Colander real-contract discovery, or every Pasta publisher variant.

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
- Scope note: this proves Ravioli bundle deployment, bundle creation, minting, transfer/collect, redeem/burn, metadata decoding, total supply, bundle config, redeemed count, and ownership resolution. It does not yet prove WTF.ME page hosting, hosted wtfOS pinning, recovery, Colander real-contract discovery, mystery reveal, or every Pasta publisher variant.

## Recommended Next Actions

1. Mine `codex/pasta-live-readiness` by narrow slices for Rotini, Penne, Lasagna, Colander discovery, WTF.ME hosting, and wtfOS pinning/recovery. Do not merge the branch wholesale.
2. Extend the now-green Macaroni Shadownet lane and signer-backed Spaghetti/Gnocchi/Ravioli proofs into one end-to-end Pasta chain: CH-EASE package -> publisher -> Shadownet deploy/mint -> Colander discovery -> hosted page or artifact resolution.
3. Repeat the individual installer package/manifest/live-check pattern for Gnocchi, Ravioli, Rotini, Penne, and Lasagna if separate per-app downloads are required beyond the bundled Pasta Suite.
4. After user confirmation, archive/delete merged historical Macaroni/IPFS and other clean ancestor worktrees; leave dirty non-Pasta worktrees untouched.
5. Decide whether the original dirty local `WTF` checkout should be preserved before any reset, fast-forward, or archival action.
