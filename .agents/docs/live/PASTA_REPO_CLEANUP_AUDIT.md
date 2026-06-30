# Pasta Repo Cleanup Audit

Last audited: 2026-06-30
Auditor: Codex Pasta live-readiness continuation
Production focus: `https://wtfos.app`

## Current Production Authority

- Authoritative production source is `origin/main` at `2c8a34636679ae781d0d7a9919b843d817ce16c8`.
- Live health reports `commitRef: "2c8a346"` and `nodeEnv: "production"`.
- Main Quality Gates run `28480098540` and Deploy to Hetzner run `28480098529` succeeded for commit `2c8a3463`.
- The release evidence branch `codex/pasta-live-readiness` is clean at `2c8a3463` and aligned with `origin/main`.
- Macaroni Desktop `1.0.0` individual installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Pasta Suite Desktop `1.0.0` bundled installers are published as release assets and passed public plus authenticated manifest/download verification for macOS, Windows, and Raspberry Pi.
- Local Macaroni Shadownet puppet proof now passes 5/5 against a disposable Postgres database and `https://tezos-shadownet.octez.io/`, covering trusted-creator defaults, wallet chain safety, wtfOS publish gating, standalone mint-page wallet restore/disconnect, mismatched RPC blocking, and Shadownet Kukai handoff.
- Local Spaghetti Shadownet preflight now passes against `https://tezos-shadownet.octez.io/` and Shadownet TzKT, covering the real RPC chain id, indexer head, contract artifact entrypoints, Colander adapter detection, package metadata, relationship metadata, token metadata, and origination storage payload shape before signer-backed injection.
- Live Pasta/Macaroni static wallet bundles for `macaroni`, `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna` passed stale-Taquito probes: Taquito `24.3.0` is absent, Taquito `25.0.0` is present, and the old `rpc.shadownet.teztnets.com` marker is absent.
- Live Pasta static publisher `common.js` files now expose the `window.MD` runtime export in `spaghetti`, `gnocchi`, `ravioli`, `rotini`, `penne`, and `lasagna`, while retaining `consumeCheaseHandoff()` and `loadPlatformCapabilities()` markers.

## Cleanup Performed

- Ran `git fetch --all --prune`; no ref changes were needed.
- Ran `git worktree prune -v` after dry-run proof and removed seven dead worktree metadata records whose `/private/tmp` paths no longer existed.
- Archived the stale `WTF-pasta-deploy` checkout to `/Users/joshuafarnworth/.codex/archives/WTF-pasta-deploy-2026-06-30-2c8a346`, including branch refs, status, a binary tracked diff, an untracked-file tarball, and SHA-256 checksums.
- Removed the stale `WTF-pasta-deploy` worktree and deleted the local `pasta-protocol` branch after confirming it was 105 commits behind `origin/main` with zero unique commits.
- Left other existing checked-out worktrees untouched, especially dirty ones, because they may contain user context.

## Worktree Classification

| Worktree | Branch/Head | Dirty Count | Classification | Action |
| --- | --- | ---: | --- | --- |
| `.config/superpowers/worktrees/WTF/codex-pasta-live-readiness` | `codex/pasta-live-readiness` / `2c8a3463` | 0 | Valid current Pasta/live-readiness record | Keep until the broader goal is fully audited; it is the clean evidence branch and is aligned with `origin/main`. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF` | local `main` / `9d043fd` | 295 | Stale mixed scratch checkout | Do not deploy from it. It is behind `origin/main` and mixes Pasta, Gamma/Beta, apphost, Agent, localization, Skywire, WTF LIVE, Particle Painter, docs, and test churn. |
| `Desktop/cursor-projects/Sandbox/WTF combo/WTF-pasta-deploy` | `pasta-protocol` / `f6256708` | 29 archived | Archived superseded Pasta prototype | Removed after archive proof. Do not recreate or promote wholesale. See stale Pasta findings below. |
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

Conclusion: this checkout has been archived outside the repo for recovery/audit only, then removed from the active worktree list. Do not apply its archived patch to main.

## Remaining Product Gaps

- The CH-EASE package-to-Pasta static runtime fix is now production-deployed: post-deploy live probes confirm `window.MD` exports on the six Pasta publisher bundles.
- Pasta suite installer/download is now production-complete for the bundled native suite lane: `apps/pasta-suite-desktop`, the `pasta-suite-desktop-installers.yml` workflow, `/api/pasta/installers`, inventory coverage, package policy checks, GitHub release assets, production env, and the authenticated live verifier all passed for `pasta-suite-desktop-v1.0.0`.
- Full Pasta contract/product workflow proof remains broader than static bundle availability, the now-green Macaroni Shadownet confidence lane, and the new Spaghetti Shadownet preflight: actual signer-backed Shadownet origination, mint/collect, failure recovery, WTF.ME hosting, wtfOS pinning, and cross-app Colander management should remain open until executable evidence exists.
- Local `main` at the original workspace should be fast-forwarded, reset, or archived only after the user confirms whether its dirty scratch content should be preserved.

## Current Macaroni Shadownet Proof

- Local proof command: `DATABASE_URL=postgresql://wtf:***@127.0.0.1:55432/wtf npm run test:e2e:macaroni:shadownet`.
- Database proof: disposable local Postgres on `127.0.0.1:55432`, prepared with `npm run db:push`.
- Puppet proof: 12 actor-backed Shadownet wallets seeded against `https://tezos-shadownet.octez.io/` with chain id `NetXsqzbfFenSTS`.
- Playwright proof: 5/5 passed for trusted-creator Shadownet defaults and chain-verified wallet, regular-user wtfOS provider exclusion, generated mint-page wallet restore/disconnect, mismatched RPC blocking before wallet signing, and Shadownet Kukai handoff.
- Scope note: this proves Macaroni's local Shadownet wallet/publish-page confidence lane. It does not yet prove a live KT1 origination, token mint/collect, hosted page resolution, Colander discovery, or all Pasta app publishers.

## Current Spaghetti Shadownet Preflight

- Local proof command: `npm run pasta:shadownet:preflight`.
- Network proof: real RPC `https://tezos-shadownet.octez.io/` returned chain id `NetXsqzbfFenSTS`.
- Indexer proof: Shadownet TzKT `/v1/head` returned `chain: "shadownet"`, `chainId: "NetXsqzbfFenSTS"`, and a positive head level.
- Artifact proof: `public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json` exposes FA2 plus standard collection entrypoints required by the Colander `standard_collection` adapter.
- Payload proof: CH-EASE collection package validation, relationship metadata extraction, token metadata, and origination storage map planning all pass for a two-token Spaghetti publish rehearsal.
- Scope note: this is an unsigned real-network preflight. It does not yet originate, mint, collect, or wait for TzKT-indexed token balances.

## Current Suite Installer Proof

- Source/package proof: `npm run pasta-suite:desktop:check` passed 5/5.
- Macaroni regression proof: `npm run macaroni:desktop:check` passed 4/4.
- Inventory proof: `npm run test:e2e:inventory:coverage` passed with `pasta_suite.installer_manifest.viewed` and `/api/pasta/installers` in the Pasta workflow.
- TypeScript proof: `npm run check -- --pretty false` passed.
- Local macOS build proof: `npm run dist:mac --prefix apps/pasta-suite-desktop` produced unsigned artifacts:
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 3b00d06229d2527294aac8f67e43e9437f5544846225e9688a345af9addf01e9`)
  - `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.zip` (`sha256 812650e1e62d1bbe7332b84d6a437966ef9ddb2262977c8923429551a4e73f24`)
- Branch Quality Gates run `28470551711` passed on `fd4afcd`; later Pasta readiness Quality Gates included run `28478213183` on `c4ba55ff` and main run `28480098540` on `2c8a3463`.
- Main Deploy to Hetzner run `28471646097` passed for `fd4afcd`; later main Deploy to Hetzner runs `28479148838` and `28480098529` passed, main Quality Gates runs `28479148843` and `28480098540` passed, and live health currently reports `commitRef: "2c8a346"`.
- Pasta Suite Desktop Installers workflow run `28471682307` passed and published release tag `pasta-suite-desktop-v1.0.0`.
- Release asset proof from GitHub release metadata:
  - macOS DMG: `Pasta-Suite-1.0.0-mac-universal.dmg` (`sha256 1c62cfde5a019d0c5900476c9dc72d2fc60c25e8098b06be5a88b4e858dbf39f`)
  - Windows NSIS: `Pasta-Suite-1.0.0-win-x64.exe` (`sha256 5fb9c02531aa492a306928e89501eb3d628c61b4380720fb8a7e54fffa0c2f8a`)
  - Raspberry Pi Debian package: `Pasta-Suite-1.0.0-linux-arm64.deb` (`sha256 bd15004c5a4233bf27280d9b2132e0408739f349ef7f0184af0cf665c5fe4a29`)
- Production `PASTA_SUITE_INSTALLER_*` env was configured from those release digests, then the app container was recreated with the deploy temp-env pattern so the running process picked up the values.
- `npm run pasta-suite:installers:live-check` passed against `https://wtfos.app` with production puppet `e2e_bert`; it verified unauthenticated `401`, GitHub release asset discovery, byte-range download support for all three platform assets, authenticated login, and manifest version/URL/SHA agreement.

## Recommended Next Actions

1. Extend the now-green Macaroni Shadownet lane into one end-to-end Pasta chain: CH-EASE package -> publisher -> Shadownet deploy/mint -> Colander discovery -> hosted page or artifact resolution.
2. After user confirmation, archive/delete merged historical Macaroni branches and clean checked-out worktrees that are ancestors of `origin/main`.
3. Keep the removed `WTF-pasta-deploy` archive only as recovery evidence; do not mine it for implementation unless a future pass needs a specific historical note.
