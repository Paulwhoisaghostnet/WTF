# Pasta Live Readiness Matrix

Last updated: 2026-07-01
Production focus: `https://wtfos.app`
Release lane: `codex/spaghetti-installer-live`

## Deployment Claim Boundary

This lane can safely claim:

- Macaroni Desktop `1.0.0` individual installers are published and production-verifiable.
- Pasta Suite Desktop `1.0.0` bundled installers are published and production-verifiable.
- Spaghetti Studio Desktop `1.0.0` standalone installers are published and production-verifiable.
- Pasta static publisher bundles are reachable on `wtfos.app` and expose the shared `window.MD` runtime.
- Spaghetti has a real-network Shadownet preflight and a signer-backed deploy/mint/collect proof command.
- Gnocchi has a signer-backed Shadownet open-edition deploy/configure/open-mint proof command.
- Ravioli has a signer-backed Shadownet bundle deploy/create/mint/transfer/redeem proof command.

This lane must not claim:

- Full Pasta Protocol production deployment.
- Mainnet Pasta contract readiness.
- WTF.ME hosted mint/collection/purchase readiness.
- wtfOS hosted pinning/recovery readiness for Pasta artifacts.
- Complete signer-backed coverage for every Pasta publisher variant.

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
| Spaghetti | Standard collection publisher | PROVEN | PROVEN | PROVEN | PROVEN | OPEN | PARTIAL | PROVEN | OPEN |
| Gnocchi | Open-edition token publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | OPEN | PARTIAL | OPEN |
| Ravioli | Bundle token publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | OPEN | PARTIAL | OPEN |
| Rotini | Generative collection publisher | PROVEN | PARTIAL | OPEN | OPEN | OPEN | OPEN | PARTIAL | OPEN |
| Penne | Distribution contract product | PROVEN | PARTIAL | OPEN | OPEN | OPEN | OPEN | PARTIAL | OPEN |
| Lasagna | Exhibition contract product | PROVEN | PARTIAL | OPEN | OPEN | OPEN | OPEN | PARTIAL | OPEN |
| Colander | Management and discovery | PROVEN | PARTIAL | PARTIAL | OPEN | N/A | OPEN | PARTIAL | OPEN |
| WTF.ME | Hosted public pages | PARTIAL | N/A | N/A | OPEN | OPEN | OPEN | N/A | OPEN |
| wtfOS pinning | Artifact and metadata durability | PROVEN | N/A | N/A | OPEN | OPEN | N/A | N/A | OPEN |
| Pasta Suite Desktop | Bundled native app suite | N/A | N/A | N/A | N/A | N/A | N/A | PROVEN | N/A |

Note: `PARTIAL` installer status for individual Pasta publishers means the bundled Pasta Suite Desktop download includes that app surface, but no separate per-app native installer has been proven for that publisher.

## Proof Inventory

| Gate | Evidence | Status |
| --- | --- | --- |
| Repo cleanup authority | `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md` classifies active, stale, and archived Pasta worktrees. | PROVEN |
| Stale Pasta worktree safety | `WTF-pasta-deploy` is absent from active worktrees and its historical patch is marked as do-not-replay. | PROVEN |
| Static Pasta bundle reachability | Live probes recorded in `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md`; `window.MD` is exported for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna. | PROVEN |
| Macaroni individual installers | `npm run macaroni:desktop:check`, live manifest verifier, GitHub release assets, and production env proof recorded in audit docs. | PROVEN |
| Pasta Suite installers | `npm run pasta-suite:desktop:check`, `npm run pasta-suite:installers:live-check`, release tag `pasta-suite-desktop-v1.0.0`, and production manifest proof recorded in audit docs. | PROVEN |
| Spaghetti standalone installers | `npm run spaghetti:desktop:check`, `npm run spaghetti:installers:live-check`, release tag `spaghetti-desktop-v1.0.0`, and production manifest proof recorded in audit docs. | PROVEN |
| Macaroni Shadownet confidence lane | `DATABASE_URL=... npm run test:e2e:macaroni:shadownet` passed 5/5. | PARTIAL |
| Spaghetti real-network preflight | `npm run pasta:shadownet:preflight` verifies Shadownet RPC, TzKT head, artifact entrypoints, adapter detection, and metadata/storage payload shape. | PROVEN |
| Spaghetti signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e` originated `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, created token 0, minted supply, transferred one edition to the collector, decoded token metadata, and verified collector ownership in TzKT big maps. | PROVEN |
| Gnocchi signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e` originated `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, created open edition token 0, collector-open-minted one edition, decoded token metadata, and verified collector ownership, supply, and sale config in TzKT big maps. | PROVEN |
| Ravioli signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e` originated `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, created bundle token 0, minted supply, transferred two editions to the collector, redeemed one edition, decoded token metadata, and verified collector ownership, total supply, bundle config, and redeemed count in TzKT big maps. | PROVEN |
| Rotini signer proof | None yet. | OPEN |
| Penne signer proof | None yet. | OPEN |
| Lasagna signer proof | None yet. | OPEN |
| Colander real KT1 discovery | No end-to-end proof from a real Shadownet Pasta contract into Colander action/state refresh. | OPEN |
| WTF.ME hosted Pasta pages | No proof for mint pages, collection pages, landing pages, branding, wallet connect, or purchase flows. | OPEN |
| wtfOS Pasta pinning/recovery | No proof for artifact pinning, metadata pinning, file pinning, redundancy, accessibility, or recovery tied to Pasta publish flows. | OPEN |
| Mainnet deployment | Intentionally blocked until Shadownet and hosted-page gates are complete. | OPEN |

## Live Push Recommendation

The safe next push target is this narrow proof lane. A full production Pasta deployment claim should wait until these minimum gates are green:

1. Signer-backed Shadownet proof exists for every Pasta publisher that production UI presents as deployable.
2. Colander opens at least one real Shadownet Pasta contract, detects the adapter from entrypoints/storage, refreshes post-operation state, and shows ownership/action state from indexed data.
3. WTF.ME serves at least one Pasta mint page, collection page, and landing page backed by Shadownet proof data.
4. wtfOS pinning verifies artifact, metadata, redundancy, and recovery for a Pasta publish.
5. All executable verification commands pass on the production promotion branch.

## Next Implementation Order

1. Add Rotini signer-backed generated-edition proof.
2. Add Penne and Lasagna contract-product deploy/configure proofs.
3. Wire Colander real-contract discovery against Shadownet proof contracts.
4. Add WTF.ME hosted page checks for the proven contracts/tokens.
5. Add wtfOS artifact/metadata pinning and recovery checks.
6. Repeat the standalone installer manifest/release proof pattern for remaining individual Pasta apps if separate native downloads are required.
7. Re-run production readiness checks and only then evaluate mainnet/full-send deployment work.
