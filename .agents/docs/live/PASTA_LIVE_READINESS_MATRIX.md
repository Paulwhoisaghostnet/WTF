# Pasta Live Readiness Matrix

Last updated: 2026-07-01
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
- Lasagna has one signer-backed Shadownet exhibition deploy/configure/revision/admin-handoff proof with TzKT curator, revision, administration, and metadata verification.
- Colander opens all six signer-backed Shadownet Pasta proof contracts from the browser, detects the correct adapters/actions, links Shadownet TzKT, and decodes relationship metadata.
- WTF.ME hosted-page branch proof claims `wtf-admin.wtfos.me`, saves Pasta landing, Gnocchi mint, and Spaghetti collection pages, publishes them through the Playwright harness WTF.ME APIs, and serves them from the user-site host with Shadownet chain markers, real proof KT1s, wallet-connect markers, purchase/mint route markers, Shadownet TzKT links, user-site CSP/opener headers, and claim/save/publish/public-view events.

This branch must not claim:

- Full Pasta Protocol production deployment.
- Mainnet Pasta contract readiness.
- Production/live WTF.ME hosted mint, collection, or purchase readiness.
- wtfOS hosted pinning/recovery readiness for Pasta artifacts.
- Browser-wallet Colander signed mutation or post-operation refresh against real Pasta contracts.

Current live blocker: `npm run pasta:wtfme:live-check` now probes the real production host boundary, and currently fails before content verification because `https://wtfos.app/internal/tls/allow?domain=wtf-admin.wtfos.me` returns `handle not registered`. DNS already resolves `wtf-admin.wtfos.me` to the WTF host, so the next fix is production host registration/publication rather than a missing A record.
Production publication helper: `npm run pasta:wtfme:live-publish` performs a dry-run with Pasta-specific credentials and prints the resolved user-site host; it only mutates production when `PASTA_WTFME_LIVE_PUBLISH=1` is set.

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
| Spaghetti | Standard collection publisher | PROVEN | PROVEN | PROVEN | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Gnocchi | Open-edition token publisher | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Ravioli | Bundle token publisher | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Rotini | Generative collection publisher | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Penne | Distribution contract product | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Lasagna | Exhibition contract product | PROVEN | PARTIAL | PROVEN | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Colander | Management and discovery | PROVEN | PARTIAL | PROVEN | OPEN | N/A | PROVEN | PARTIAL | OPEN |
| WTF.ME | Hosted public pages | PARTIAL | N/A | N/A | OPEN | PARTIAL | OPEN | N/A | OPEN |
| wtfOS pinning | Artifact and metadata durability | PROVEN | N/A | N/A | OPEN | PARTIAL | N/A | N/A | OPEN |
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
| Lasagna signer proof | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e:lasagna` originated `KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN`, added and removed a curator, published two cross-Pasta exhibition revisions, reset the current revision pointer to 0, completed two-step administration transfer, decoded metadata, and verified curator, revision, administration, and metadata state in TzKT big maps. | PROVEN |
| Colander real KT1 discovery | `npm run pasta:shadownet:colander` opens Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna proof KT1s through `/tools/colander`, verifies adapter/action rendering, Shadownet TzKT links, relationship metadata graph decoding, and inventory event emission. Report: `.agents/docs/archive/contracts/pasta-protocol/shadownet-colander-discovery-report.md`. | PROVEN |
| WTF.ME hosted Pasta pages | `npx tsx --test server/features/wtf-sites/pasta-hosting.test.ts` validates immutable landing/mint/collection page snapshots and manifest digest behavior; `npm run pasta:shadownet:wtfme` claims the user site, saves the Pasta pages, publishes them through the harness WTF.ME APIs, then serves them from `wtf-admin.wtfos.me` with Shadownet proof KT1s, wallet/purchase markers, CSP/opener headers, and `wtf_site.claimed` / `wtf_site.page_saved` / `wtf_site.published` / `wtf_site.public.viewed` events. `npm run pasta:wtfme:live-publish` now provides a gated production API-publish helper, and `npm run pasta:wtfme:live-check` is the production host gate. The live gate currently fails because the production TLS ask gate denies `wtf-admin.wtfos.me` as `handle not registered`, so production live TLS/content, browser UI authoring persistence, hosted pinning/recovery, and wallet-signed purchase completion are still open. | PARTIAL |
| wtfOS Pasta pinning/recovery | `npm run pasta:shadownet:pinning` builds app.wtfos.media pinPolicy, pinManifest, and pinItem records from real Pasta hosted-page snapshots and contract artifacts, validates them against the AT lexicon, and proves public storage refs, IPFS gateway URLs, object-storage mirror keys, `.well-known/wtfos-pins`, and restore order for hosted pages plus Pasta metadata. Live provider pin completion, published PDS records, object-store writes, and recovery drill are still open. | PARTIAL |
| Mainnet deployment | Intentionally blocked until Shadownet and hosted-page gates are complete. | OPEN |

## Live Push Recommendation

The safe next push target is the proof branch, not `main` production. A production full-send should wait until these minimum gates are green:

1. Signer-backed Shadownet proof remains green for every non-Macaroni Pasta publisher that production UI presents as deployable.
2. Colander browser-wallet mutation and post-operation refresh are proven against at least one safe Shadownet Pasta action if signed management is in the first production release boundary.
3. `npm run pasta:wtfme:live-check` passes against a real production `*.wtfos.me` host, proving the Pasta mint page, collection page, landing page, user-site headers, and pin discovery over live TLS beyond the current local API-publish host-mapped harness proof.
4. wtfOS pinning verifies artifact, metadata, redundancy, and recovery for a Pasta publish against the live provider/PDS/object-store path, beyond the current record-shape proof.
5. All executable verification commands pass on the production promotion branch.

## Next Implementation Order

1. Run `npm run pasta:wtfme:live-publish` with Pasta-specific production credentials to confirm the eligible host, then intentionally publish with `PASTA_WTFME_LIVE_PUBLISH=1`, and make `PASTA_WTFME_LIVE_HOST=<published-host> npm run pasta:wtfme:live-check` pass before adding a signed mint/purchase dry run.
2. Promote the wtfOS Pasta pinning proof from record-shape validation to live provider/PDS/object-store pinning and recovery drill.
3. Prove Colander browser-wallet mutation and post-operation refresh if signed management is part of the production release.
4. Generalize the signer-backed Pasta E2E runners into reusable publisher proof helpers.
5. Re-run production readiness checks and only then evaluate a main/full-send.
