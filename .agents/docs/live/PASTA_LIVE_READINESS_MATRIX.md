# Pasta Live Readiness Matrix

Last updated: 2026-06-30
Production focus: `https://wtfos.app`
Release branch: `codex/pasta-live-readiness`

## Deployment Claim Boundary

This branch can safely claim:

- Macaroni Desktop `1.0.0` individual installers are published and production-verifiable.
- Pasta Suite Desktop `1.0.0` bundled installers are published and production-verifiable.
- Pasta static publisher bundles are reachable on `wtfos.app` and expose the shared `window.MD` runtime.
- Spaghetti has one signer-backed Shadownet deploy/mint/collect proof with TzKT big-map ownership and metadata verification.
- Gnocchi has one signer-backed Shadownet open-edition deploy/configure/collector-mint proof with TzKT sale, supply, ownership, and metadata verification.
- Ravioli has one signer-backed Shadownet bundle deploy/create/mint/transfer/redeem proof with TzKT bundle, redeemed, supply, ownership, and metadata verification.
- Rotini has one signer-backed Shadownet generative deploy/create/mint/transfer proof with TzKT supply, ownership, trait metadata, and generation DNA verification.
- Penne has one signer-backed Shadownet distribution deploy/configure/claim/airdrop proof with TzKT allocation, claimed, supply, ownership, and metadata verification.

This branch must not claim:

- Full Pasta Protocol production deployment.
- Mainnet Pasta contract readiness.
- WTF.ME hosted mint/collection/purchase readiness.
- wtfOS hosted pinning/recovery readiness for Pasta artifacts.
- Complete signer-backed coverage for all Pasta publisher variants.

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
| Spaghetti | Standard collection publisher | PROVEN | PROVEN | PROVEN | PROVEN | OPEN | PARTIAL | PARTIAL | OPEN |
| Gnocchi | Open-edition token publisher | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | OPEN | PARTIAL | OPEN |
| Ravioli | Bundle token publisher | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | OPEN | PARTIAL | OPEN |
| Rotini | Generative collection publisher | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | OPEN | PARTIAL | OPEN |
| Penne | Distribution contract product | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | OPEN | PARTIAL | OPEN |
| Lasagna | Exhibition contract product | PROVEN | PARTIAL | OPEN | OPEN | OPEN | OPEN | PARTIAL | OPEN |
| Colander | Management and discovery | PROVEN | PARTIAL | PARTIAL | OPEN | N/A | OPEN | PARTIAL | OPEN |
| WTF.ME | Hosted public pages | PARTIAL | N/A | N/A | OPEN | OPEN | OPEN | N/A | OPEN |
| wtfOS pinning | Artifact and metadata durability | PROVEN | N/A | N/A | OPEN | OPEN | N/A | N/A | OPEN |
| Pasta Suite Desktop | Bundled native app suite | N/A | N/A | N/A | N/A | N/A | N/A | PROVEN | N/A |

Note: `PARTIAL` installer status for individual Pasta publishers means the bundled Pasta Suite Desktop download includes the app surface, but no separate per-app native installer has been proven for that publisher.

## Proof Inventory

| Gate | Evidence | Status |
| --- | --- | --- |
| Repo cleanup authority | `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md` classifies active, stale, and archived Pasta worktrees. | PROVEN |
| Stale Pasta worktree safety | `WTF-pasta-deploy` archived outside the repo and removed after zero-unique-commit proof. | PROVEN |
| Static Pasta bundle reachability | Live probes recorded in `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md`; `window.MD` exported for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna. | PROVEN |
| Macaroni individual installers | `npm run macaroni:desktop:check`, live manifest verifier, GitHub release assets, and production env proof recorded in audit docs. | PROVEN |
| Pasta Suite installers | `npm run pasta-suite:desktop:check`, `npm run pasta-suite:installers:live-check`, release tag `pasta-suite-desktop-v1.0.0`, and production manifest proof recorded in audit docs. | PROVEN |
| Macaroni Shadownet confidence lane | `DATABASE_URL=... npm run test:e2e:macaroni:shadownet` passed 5/5. | PARTIAL |
| Spaghetti real-network preflight | `npm run pasta:shadownet:preflight` verifies Shadownet RPC, TzKT head, artifact entrypoints, adapter detection, and metadata/storage payload shape. | PROVEN |
| Spaghetti signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e` originated `KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH`, created token 0, minted supply, transferred one edition, decoded metadata, and verified collector ownership in TzKT big maps. | PROVEN |
| Fresh FA2 ownership proof method | `.agents/docs/live/LESSONS_LEARNED.md` documents direct storage/big-map verification when high-level token endpoints lag. | PROVEN |
| Gnocchi signer proof | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:gnocchi` originated `KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax`, created token 0, configured the open-edition sale, collector-minted one edition for 1 mutez, decoded metadata, and verified sale state, total supply, and collector ownership in TzKT big maps. | PROVEN |
| Ravioli signer proof | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:ravioli` originated `KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG`, created token 0, minted three editions, transferred two to the collector, redeemed one, decoded metadata, and verified bundle config, redeemed count, total supply, and collector ownership in TzKT big maps. | PROVEN |
| Rotini signer proof | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:rotini` originated `KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz`, created two generated token types, minted one edition of each, transferred token 1 to the collector, decoded trait/DNA metadata, and verified supply plus creator/collector ownership in TzKT big maps. | PROVEN |
| Penne signer proof | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:penne` originated `KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx`, created token 0, loaded two allocations, opened claim, completed a collector pull claim, completed an admin push airdrop, closed claim, decoded metadata, and verified allocation consumption, claimed state, total supply, and creator/collector ownership in TzKT big maps. | PROVEN |
| Lasagna signer proof | None yet. | OPEN |
| Colander real KT1 discovery | No end-to-end proof from a real Shadownet Pasta contract into Colander action/state refresh. | OPEN |
| WTF.ME hosted Pasta pages | No proof for mint pages, collection pages, landing pages, branding, wallet connect, or purchase flows. | OPEN |
| wtfOS Pasta pinning/recovery | No proof for artifact pinning, metadata pinning, file pinning, redundancy, accessibility, or recovery tied to Pasta publish flows. | OPEN |
| Mainnet deployment | Intentionally blocked until Shadownet and hosted-page gates are complete. | OPEN |

## Live Push Recommendation

The safe next push target is the proof branch, not `main` production. A production full-send should wait until these minimum gates are green:

1. Signer-backed Shadownet proof exists for every Pasta publisher that production UI presents as deployable.
2. Colander opens at least one real Shadownet Pasta contract, detects the adapter from entrypoints/storage, refreshes post-operation state, and shows ownership/action state from indexed data.
3. WTF.ME serves at least one Pasta mint page, collection page, and landing page backed by the Shadownet proof data.
4. wtfOS pinning verifies artifact, metadata, redundancy, and recovery for a Pasta publish.
5. All executable verification commands pass on the production promotion branch.

## Next Implementation Order

1. Generalize the signer-backed Pasta E2E runners into reusable publisher proof helpers.
2. Add Lasagna contract-product deploy/configure proof.
3. Wire Colander real-contract discovery against the Shadownet proof contracts.
4. Add WTF.ME hosted page checks for the proven contracts/tokens.
5. Add wtfOS artifact/metadata pinning and recovery checks.
6. Re-run production readiness checks and only then evaluate a main/full-send.
