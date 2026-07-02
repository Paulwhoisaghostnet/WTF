# Pasta Live Readiness Matrix

Last updated: 2026-07-02 UTC
Production focus: `https://wtfos.app`
Evidence snapshot: the latest recorded live source verification is current `origin/main` commit `9d279ba`, where `PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1 npm run pasta:live-readiness` proves live health, repo cleanup, Taquito/static runtime markers, all suite/individual installer release assets, installer catalog auth, and the recorded Colander action proof before blocking only on dedicated WTF.ME credentials and `PASTA_WTFME_LIVE_HOST`. The latest Pasta product-state deployment boundary remains PR #30 deploy-cache-recovery commit `6f71f14`, with Deploy to Hetzner run `28570029612` and main Quality Gates run `28570029603` passing; later main commits through `9d279ba` did not complete the WTF.ME host/pin launch. Current draft PR #32 adds non-production launch-path evidence for the remaining WTF.ME blocker, including a canonical publish runbook and stricter publish-response/pin-recovery host consistency checks. This is a production evidence snapshot, not a full Pasta launch claim.

## Deployment Claim Boundary

This lane can safely claim:

- Macaroni Desktop `1.0.0` individual installers are published and production-verifiable.
- Pasta Suite Desktop `1.0.0` bundled installers are published and production-verifiable; the Suite installer manifest enumerates the bundled Pasta app surfaces so the suite download contract is explicit.
- Spaghetti Studio Desktop `1.0.0` standalone installers are published and production-verifiable.
- Gnocchi, Ravioli, Rotini, Penne, and Lasagna Studio Desktop `1.0.0` standalone installers are published and production-verifiable for macOS, Windows, and Raspberry Pi.
- Pasta static publisher bundles are reachable on `wtfos.app` and expose the shared `window.MD` runtime.
- Spaghetti has a real-network Shadownet preflight and a signer-backed deploy/mint/collect proof command.
- Gnocchi has a signer-backed Shadownet open-edition deploy/configure/open-mint proof command.
- Ravioli has a signer-backed Shadownet bundle deploy/create/mint/transfer/redeem proof command.
- Rotini has a signer-backed Shadownet generative deploy/create/mint/collect proof command.
- Penne has a signer-backed Shadownet distribution deploy/configure/claim/airdrop proof command.
- Lasagna has a signer-backed Shadownet exhibition deploy/configure/revision/admin-handoff proof command.
- Colander opens all six current signer-backed Shadownet Pasta proof contracts in-browser, detects adapters/actions, renders relationship metadata, and emits discovery events.
- Colander has a guarded signer-backed Shadownet adapter action proof for the Lasagna `set_current_revision(0)` management path, including Taquito confirmation and indexed TzKT operation evidence; a separate non-spending verifier rechecks the recorded report plus TzKT operation.
- Colander has a localhost-only browser-wallet choreography proof for the same `set_current_revision(0)` action path, covering UI form submission, wallet preflight, wallet contract lookup, send, and confirmation.
- WTF.ME hosted Pasta page snapshots, live publish/check tooling, and local user-site browser proof exist for the current Shadownet proof contracts.
- Pasta pinning/recovery source proof now builds credential-free public pinPolicy, pinManifest, and pinItem records for hosted pages, contract artifacts, token metadata, and relationship metadata, with a `.well-known/wtfos-pins` recovery drill and fail-closed manifest readiness guard.
- `npm run pasta:live-readiness` exists as a promotion gate that proves live health, live static Pasta bundle/runtime markers, public installer release assets for Macaroni/Pasta Suite/Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna, and the recorded Colander Shadownet action operation without signer execution. When WTF.ME credentials are supplied it runs a forced non-writing publisher dry-run before the public host proof, then blocks until the credentialed WTF.ME publish/host proof is real. `npm run pasta:live-readiness:final` wraps the same gate in strict final-launch mode, refusing blocker-allowed mode and disabled repo-cleanup, static, installer, Colander, or WTF.ME probes.
- `/api/pasta/installers/catalog` is deployed on `wtfos.app` and returns unauthenticated `401`, giving the suite-or-individual download surface its own live route proof.
- `npm run pasta:standalone-installers:audit` exists as the release-ops checklist for Gnocchi/Ravioli/Rotini/Penne/Lasagna standalone installers. It proves local source/policy wiring, checks whether the remote GitHub Actions workflows are registered, checks release tags/assets and SHA-256 digests, and checks whether production manifest routes are deployed and auth-protected.

This lane must not claim:

- Full Pasta Protocol production deployment.
- Mainnet Pasta contract readiness.
- Live WTF.ME hosted mint/collection/purchase readiness.
- Live wtfOS hosted pinning/recovery readiness for Pasta artifacts.
- Hosted-page, hosted-pinning, real wallet-extension Colander submission, broad Colander action coverage, and mainnet coverage for every Pasta publisher variant.

## Gate Legend

- `PROVEN`: Current evidence directly proves the gate.
- `PARTIAL`: Some prerequisite or adjacent behavior is proven, but the full gate is not.
- `OPEN`: Evidence is missing.
- `N/A`: Not part of that app's role.

## Product Readiness

| App / Surface | Role | Static / Route | Package / Handoff | Shadownet Preflight | Signer E2E | Hosted / Pinning | Colander / Discovery | Installer Download | Mainnet / Full Send |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CH-EASE | Source package builder | PROVEN | PARTIAL | N/A | N/A | OPEN | PARTIAL | N/A | OPEN |
| Macaroni | Existing drop publisher and individual desktop app | PROVEN | PROVEN | PARTIAL | OPEN | PARTIAL | OPEN | PROVEN | OPEN |
| Spaghetti | Standard collection publisher | PROVEN | PROVEN | PROVEN | PROVEN | OPEN | PROVEN | PROVEN | OPEN |
| Gnocchi | Open-edition token publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PROVEN | OPEN |
| Ravioli | Bundle token publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PROVEN | OPEN |
| Rotini | Generative collection publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PROVEN | OPEN |
| Penne | Distribution contract product | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PROVEN | OPEN |
| Lasagna | Exhibition contract product | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PROVEN | OPEN |
| Colander | Management and discovery | PROVEN | PARTIAL | PARTIAL | PARTIAL | N/A | PROVEN | PARTIAL | OPEN |
| WTF.ME | Hosted public pages | PARTIAL | N/A | N/A | N/A | PARTIAL | OPEN | N/A | OPEN |
| wtfOS pinning | Artifact and metadata durability | PROVEN | N/A | N/A | PARTIAL | PARTIAL | N/A | N/A | OPEN |
| Pasta Suite Desktop | Bundled native app suite | N/A | N/A | N/A | N/A | N/A | N/A | PROVEN | N/A |

Note: `PROVEN` installer status for Gnocchi, Ravioli, Rotini, Penne, and Lasagna means the standalone GitHub release assets, production runtime env values, auth-protected manifests, authenticated manifest contents, SHA-256 digests, and byte-range download probes passed on `wtfos.app`.

## Proof Inventory

| Gate | Evidence | Status |
| --- | --- | --- |
| Repo cleanup authority | `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md` classifies active, stale, and archived Pasta worktrees. | PROVEN |
| Stale Pasta worktree safety | `WTF-pasta-deploy` is absent from active worktrees and its historical patch is marked as do-not-replay. | PROVEN |
| Static Pasta bundle reachability | Live probes recorded in `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md`; `window.MD` is exported for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna. | PROVEN |
| Macaroni individual installers | `npm run macaroni:desktop:check`, live manifest verifier, GitHub release assets, and production env proof recorded in audit docs. | PROVEN |
| Pasta Suite installers | `npm run pasta-suite:desktop:check`, `npm run pasta-suite:installers:live-check`, release tag `pasta-suite-desktop-v1.0.0`, and production manifest proof recorded in audit docs. Source policy and the live verifier require `/api/pasta/installers` to enumerate Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna in `bundledApps`; keep this verifier in the release gate set so production continues serving the strengthened suite contract. | PROVEN |
| Unified installer catalog | Live `https://wtfos.app/api/pasta/installers/catalog` returned unauthenticated `401` after PR #14 deployed commit `04b242a`, on `cb74cc1`, on `9507502`, during the PR #16 verification snapshot at `2a1977e`, during the PR #17 verification snapshot at `26c60cd`, in the PR #22 production evidence snapshot at `984b3f5`, in the PR #23 production evidence snapshot at `92bb731`, in the PR #25 production evidence snapshot at `7657a3b`, in the PR #26 production evidence snapshot at `c1686b5`, under the PR #27 live proof at `4e50cf3`, under the PR #28 live final-command proof at `956420f`, and under the PR #30 live deploy-cache-recovery proof at `6f71f14`; `npm run pasta:live-readiness` and `npm run pasta:live-readiness:final` verify this route before reporting only WTF.ME blockers. | PROVEN |
| Spaghetti standalone installers | `npm run spaghetti:desktop:check`, `npm run spaghetti:installers:live-check`, release tag `spaghetti-desktop-v1.0.0`, and production manifest proof recorded in audit docs. | PROVEN |
| Gnocchi standalone installers | `npm run gnocchi:desktop:check`, workflow run `28519193761`, release tag `gnocchi-desktop-v1.0.0`, production runtime env, `server-deploy.sh`, and authenticated `npm run gnocchi:installers:live-check` passed for macOS, Windows, and Raspberry Pi. | PROVEN |
| Ravioli standalone installers | `npm run ravioli:desktop:check`, workflow run `28519193772`, release tag `ravioli-desktop-v1.0.0`, production runtime env, `server-deploy.sh`, and authenticated `npm run ravioli:installers:live-check` passed for macOS, Windows, and Raspberry Pi. | PROVEN |
| Rotini standalone installers | `npm run rotini:desktop:check`, workflow run `28519193756`, release tag `rotini-desktop-v1.0.0`, production runtime env, `server-deploy.sh`, and authenticated `npm run rotini:installers:live-check` passed for macOS, Windows, and Raspberry Pi. | PROVEN |
| Penne standalone installers | `npm run penne:desktop:check`, workflow run `28519193792`, release tag `penne-desktop-v1.0.0`, production runtime env, `server-deploy.sh`, and authenticated `npm run penne:installers:live-check` passed for macOS, Windows, and Raspberry Pi. | PROVEN |
| Lasagna standalone installers | `npm run lasagna:desktop:check`, workflow run `28519193803`, release tag `lasagna-desktop-v1.0.0`, production runtime env, `server-deploy.sh`, and authenticated `npm run lasagna:installers:live-check` passed for macOS, Windows, and Raspberry Pi. | PROVEN |
| Standalone installer release audit | `PASTA_STANDALONE_INSTALLER_AUDIT_ALLOW_BLOCKERS=1 npm run pasta:standalone-installers:audit` passed after the GitHub Actions API workflow lookup fix, proving local source policy, active remote workflows, release assets with SHA-256 digests, and auth-protected production routes for Gnocchi/Ravioli/Rotini/Penne/Lasagna. | PROVEN |
| Macaroni Shadownet confidence lane | `DATABASE_URL=... npm run test:e2e:macaroni:shadownet` passed 5/5. | PARTIAL |
| Spaghetti real-network preflight | `npm run pasta:shadownet:preflight` verifies Shadownet RPC, TzKT head, artifact entrypoints, adapter detection, and metadata/storage payload shape. | PROVEN |
| Spaghetti signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e` originated `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, created token 0, minted supply, transferred one edition to the collector, decoded token metadata, and verified collector ownership in TzKT big maps. | PROVEN |
| Gnocchi signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e` originated `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, created open edition token 0, collector-open-minted one edition, decoded token metadata, and verified collector ownership, supply, and sale config in TzKT big maps. | PROVEN |
| Ravioli signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e` originated `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, created bundle token 0, minted supply, transferred two editions to the collector, redeemed one edition, decoded token metadata, and verified collector ownership, total supply, bundle config, and redeemed count in TzKT big maps. | PROVEN |
| Rotini signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:rotini:e2e` originated `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`, created two deterministic generated token types, minted both editions, transferred token 1 to the collector, decoded token metadata, and verified creator ownership, collector ownership, total supply, trait attributes, and Rotini DNA in TzKT big maps. | PROVEN |
| Penne signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e` originated `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, created token 0, loaded two allocations, opened claim, completed a collector pull claim, completed an admin push airdrop, closed claim, decoded metadata, and verified allocation consumption, claimed state, total supply, and creator/collector ownership in TzKT big maps. | PROVEN |
| Lasagna signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e` originated `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, added and removed a curator, published two revisions, rolled the current pointer back to revision 0, transferred and accepted administration, decoded metadata, and verified final storage and revision big-map state in TzKT. | PROVEN |
| Colander real KT1 discovery | `npm run pasta:shadownet:colander` opened the current Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna Shadownet proof KT1s through `/tools/colander`, detected adapters/actions, rendered Shadownet explorer links and relationship groups, and observed `colander.contract_opened` / `colander.graph_viewed` events. | PROVEN |
| Colander browser-wallet choreography | `npm run pasta:shadownet:colander` also runs a localhost-only Playwright wallet harness proof that opens the Lasagna proof contract, selects `set_current_revision`, fills revision `0`, submits the form, and records wallet preflight, wallet contract lookup, `set_current_revision(0)` send, and confirmation. | PARTIAL |
| Colander signer-backed management action | `PASTA_SHADOWNET_COLANDER_E2E_EXECUTE=1 npm run pasta:shadownet:colander:action` opened the current Lasagna proof contract through the shared Colander adapter registry, verified the `set_current_revision` curation action, submitted idempotent `set_current_revision(0)` with Shadownet signer `arcade-treasury`, and verified TzKT indexed applied operation `oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h` against final storage. `npm run pasta:shadownet:colander:action-proof` rechecks the recorded report and TzKT operation without signer execution. | PROVEN |
| Pasta live-readiness gate | `npm run pasta:live-readiness:check` and `npm run pasta:repo-cleanup:audit:check` passed. PR #26 policy coverage includes the disappearing-ref guard and passes 9/9. The latest blocker-allowed live-source recheck on commit `9d279ba` proved live `wtfos.app` health, repo cleanup, Taquito 25 markers across Macaroni plus six Pasta publisher bundles, `window.MD`/handoff/runtime markers across the six Pasta shared runtimes, protected installer manifests and public release assets for Macaroni Desktop, Pasta Suite Desktop, Spaghetti Desktop, Gnocchi Desktop, Ravioli Desktop, Rotini Desktop, Penne Desktop, and Lasagna Desktop, the auth-protected `/api/pasta/installers/catalog` route, and recorded Colander Shadownet action operation `oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h` without signer execution, then reported only the two expected WTF.ME blockers until credentials and `PASTA_WTFME_LIVE_HOST` are proven. Strict final-launch mode keeps blockers fatal even if `PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1` is accidentally set and refuses disabled repo-cleanup/static/installer/Colander/WTF.ME probes. The gate still reports blockers for missing local WTF.ME publish credentials plus missing `PASTA_WTFME_LIVE_HOST`. Source policy requires supplied credentials to pass a forced non-writing `pasta:wtfme:live-publish` dry-run, bound to `PASTA_WTFME_LIVE_HOST` when present. With `PASTA_WTFME_LIVE_HOST=paulwhoisaghost.wtfos.me PASTA_WTFME_LIVE_CHECK_PINS=0`, it also proves the nearest known host still fails on missing `data-pasta-hosted-page="landing"`. | PARTIAL |
| WTF.ME hosted Pasta pages | `npx tsx --test server/features/wtf-sites/pasta-hosting.test.ts`, `npm run pasta:wtfme:live-publish:check`, `npm run pasta:wtfme:live-inventory:check`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, and `npm run pasta:shadownet:wtfme` passed. These prove current-contract page snapshots, dry-run/write-gated live publish tooling, read-only live inventory tooling, inventory ownership, and a local published WTF.ME host browser proof for landing/mint/collection pages. The live publisher requires `PASTA_WTFME_LIVE_EXPECT_HOST=<dedicated-host.wtfos.me>` before production writes, rejects host drift between the planned host, publish response, pin recovery response, `.well-known/wtfos-pins`, and manifest scope, checks the production TLS gate before attempting Pasta pin recovery, refuses existing non-target pages, requires `PASTA_WTFME_LIVE_OVERWRITE_EXISTING=1` before replacing existing non-Pasta home/mint/collection drafts, and runs the public `pasta:wtfme:live-check` verifier after production publish/pin recovery, so a denied, accidental, drifted, or publicly broken host cannot silently become the proof surface. Production read-only audit on 2026-07-01 showed `wtf-admin.wtfos.me` has no `wtf_user_sites` row; `paulwhoisaghost.wtfos.me` is TLS-allowed, published, backed by an active WTFOS repo and wallet, but currently serves a generic home page instead of Pasta pages. `npm run pasta:wtfme:live-check` now requires `PASTA_WTFME_LIVE_HOST=<published-host>` and, when pin checks are enabled, resolves `.well-known/wtfos-pins` through the repo DID document to the public `app.wtfos.media.pinManifest` PDS record; if `PASTA_WTFME_LIVE_MANIFEST_PAYLOAD_URL` is set it also validates the public manifest payload checksum, item kinds, counts, IPFS CIDs, and object-mirror coordinates. The actual live Pasta host is not proven. | PARTIAL |
| wtfOS Pasta pinning/recovery | `npm run pasta:shadownet:pinning` validates Pasta pinPolicy, pinManifest, pinItem records, hosted-page/contract-artifact/token-metadata/relationship-metadata coverage, credential-free storage refs, IPFS gateway fallbacks, object-mirror keys, `.well-known/wtfos-pins` recovery drill, the fail-closed public discovery guard, and route policy for `POST /api/ipfs-pinning/pasta-protocol/publish`. The live publish route is permission-gated, requires a published WTF.ME site, active PDS/repo, linked Tezos wallet, reachable object storage, and reuses an existing in-flight/published Pasta manifest instead of creating duplicate recovery rows. The live checker now verifies the public DID/PDS manifest-record path after `.well-known` discovery and can validate the public manifest payload when a mirror URL is supplied, but this remains source/proof coverage plus live-write guard coverage until a production host publishes the Pasta pages and manifest; it does not yet prove item payload retrieval from the real production mirror or recovery after provider/node loss. | PARTIAL |
| Mainnet deployment | Intentionally blocked until Shadownet and hosted-page gates are complete. | OPEN |

## Live Push Recommendation

The safe next push target is this narrow proof lane. A full production Pasta deployment claim should wait until these minimum gates are green:

1. Signer-backed Shadownet proof exists for every Pasta publisher that production UI presents as deployable.
2. WTF.ME serves at least one live Pasta mint page, collection page, and landing page backed by Shadownet proof data.
3. wtfOS pinning verifies artifact, metadata, redundancy, and recovery for a Pasta publish.
4. Representative signer-backed Colander management mutation coverage and localhost browser-wallet choreography exist before using Colander as an operational admin surface; real wallet-extension submission and broader action coverage should still land before a full operational claim.
5. All executable verification commands pass on the production promotion branch.
6. `npm run pasta:live-readiness:final` exits successfully, with no blocker-allow mode and no disabled production probes.

## Next Implementation Order

1. Follow `.agents/docs/live/PASTA_WTFME_LIVE_PUBLISH_RUNBOOK.md` to provision or identify a dedicated Pasta WTF.ME publish account/host credential; 2026-07-01 local plus remote env-name checks found no matching Pasta WTF.ME/app-login/puppet credential names.
2. Publish the generated Pasta landing/mint/collection pages to a claimed production WTF.ME host through the runbook's expected-host-pinned dry-run/write flow, then make `PASTA_WTFME_LIVE_HOST=<published-host> npm run pasta:wtfme:live-check` pass, including `.well-known/wtfos-pins`, DID resolution, the public PDS `pinManifest` record, and `PASTA_WTFME_LIVE_MANIFEST_PAYLOAD_URL=<public-manifest-json>` when the mirror URL is available.
3. Rerun `npm run pasta:live-readiness:final` without blocker-allow mode and require it to pass before claiming the Pasta lane is production-ready.
4. Turn the current source-level wtfOS artifact/metadata pinning and recovery checks into a live provider/host proof that resolves item payload checksums plus IPFS/object-mirror fallback URLs.
5. Extend the current Colander management proofs to real wallet-extension submission and additional safe actions before treating Colander as a fully operational admin surface.
6. Decide whether Colander should ship as a separate native admin app or remain an in-suite/main-app surface; this is no longer a blocker for individual static publisher downloads.
7. Re-run production readiness checks and only then evaluate mainnet/full-send deployment work.
