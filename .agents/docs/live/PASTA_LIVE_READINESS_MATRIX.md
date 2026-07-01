# Pasta Live Readiness Matrix

Last updated: 2026-07-01
Production focus: `https://wtfos.app`
Release lane: `codex/spaghetti-installer-live`

## Deployment Claim Boundary

This lane can safely claim:

- Macaroni Desktop `1.0.0` individual installers are published and production-verifiable.
- Pasta Suite Desktop `1.0.0` bundled installers are published and production-verifiable; this branch also makes the Suite installer manifest enumerate the bundled Pasta app surfaces so the suite download contract is explicit.
- Spaghetti Studio Desktop `1.0.0` standalone installers are published and production-verifiable.
- Pasta static publisher bundles are reachable on `wtfos.app` and expose the shared `window.MD` runtime.
- Spaghetti has a real-network Shadownet preflight and a signer-backed deploy/mint/collect proof command.
- Gnocchi has a signer-backed Shadownet open-edition deploy/configure/open-mint proof command.
- Ravioli has a signer-backed Shadownet bundle deploy/create/mint/transfer/redeem proof command.
- Rotini has a signer-backed Shadownet generative deploy/create/mint/collect proof command.
- Penne has a signer-backed Shadownet distribution deploy/configure/claim/airdrop proof command.
- Lasagna has a signer-backed Shadownet exhibition deploy/configure/revision/admin-handoff proof command.
- Colander opens all six current signer-backed Shadownet Pasta proof contracts in-browser, detects adapters/actions, renders relationship metadata, and emits discovery events.
- WTF.ME hosted Pasta page snapshots, live publish/check tooling, and local user-site browser proof exist for the current Shadownet proof contracts.
- Pasta pinning/recovery source proof now builds credential-free public pinPolicy, pinManifest, and pinItem records for hosted pages, contract artifacts, token metadata, and relationship metadata, with a `.well-known/wtfos-pins` recovery drill and fail-closed manifest readiness guard.

This lane must not claim:

- Full Pasta Protocol production deployment.
- Mainnet Pasta contract readiness.
- Live WTF.ME hosted mint/collection/purchase readiness.
- Live wtfOS hosted pinning/recovery readiness for Pasta artifacts.
- Hosted-page, hosted-pinning, wallet-signed Colander mutation, and mainnet coverage for every Pasta publisher variant.

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
| Gnocchi | Open-edition token publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Ravioli | Bundle token publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Rotini | Generative collection publisher | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Penne | Distribution contract product | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Lasagna | Exhibition contract product | PROVEN | PARTIAL | PARTIAL | PROVEN | OPEN | PROVEN | PARTIAL | OPEN |
| Colander | Management and discovery | PROVEN | PARTIAL | PARTIAL | OPEN | N/A | PROVEN | PARTIAL | OPEN |
| WTF.ME | Hosted public pages | PARTIAL | N/A | N/A | N/A | PARTIAL | OPEN | N/A | OPEN |
| wtfOS pinning | Artifact and metadata durability | PROVEN | N/A | N/A | PARTIAL | PARTIAL | N/A | N/A | OPEN |
| Pasta Suite Desktop | Bundled native app suite | N/A | N/A | N/A | N/A | N/A | N/A | PROVEN | N/A |

Note: `PARTIAL` installer status for individual Pasta publishers means the bundled Pasta Suite Desktop download includes that app surface and this branch's `/api/pasta/installers` manifest exposes it under `bundledApps`, but no separate per-app native installer has been proven for that publisher.

## Proof Inventory

| Gate | Evidence | Status |
| --- | --- | --- |
| Repo cleanup authority | `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md` classifies active, stale, and archived Pasta worktrees. | PROVEN |
| Stale Pasta worktree safety | `WTF-pasta-deploy` is absent from active worktrees and its historical patch is marked as do-not-replay. | PROVEN |
| Static Pasta bundle reachability | Live probes recorded in `.agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md`; `window.MD` is exported for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna. | PROVEN |
| Macaroni individual installers | `npm run macaroni:desktop:check`, live manifest verifier, GitHub release assets, and production env proof recorded in audit docs. | PROVEN |
| Pasta Suite installers | `npm run pasta-suite:desktop:check`, `npm run pasta-suite:installers:live-check`, release tag `pasta-suite-desktop-v1.0.0`, and production manifest proof recorded in audit docs. Current branch source policy also requires `/api/pasta/installers` and the live verifier to enumerate Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna in `bundledApps`; this strengthened field still needs post-deploy live verification before claiming production serves it. | PROVEN |
| Spaghetti standalone installers | `npm run spaghetti:desktop:check`, `npm run spaghetti:installers:live-check`, release tag `spaghetti-desktop-v1.0.0`, and production manifest proof recorded in audit docs. | PROVEN |
| Macaroni Shadownet confidence lane | `DATABASE_URL=... npm run test:e2e:macaroni:shadownet` passed 5/5. | PARTIAL |
| Spaghetti real-network preflight | `npm run pasta:shadownet:preflight` verifies Shadownet RPC, TzKT head, artifact entrypoints, adapter detection, and metadata/storage payload shape. | PROVEN |
| Spaghetti signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e` originated `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, created token 0, minted supply, transferred one edition to the collector, decoded token metadata, and verified collector ownership in TzKT big maps. | PROVEN |
| Gnocchi signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e` originated `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, created open edition token 0, collector-open-minted one edition, decoded token metadata, and verified collector ownership, supply, and sale config in TzKT big maps. | PROVEN |
| Ravioli signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e` originated `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, created bundle token 0, minted supply, transferred two editions to the collector, redeemed one edition, decoded token metadata, and verified collector ownership, total supply, bundle config, and redeemed count in TzKT big maps. | PROVEN |
| Rotini signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:rotini:e2e` originated `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`, created two deterministic generated token types, minted both editions, transferred token 1 to the collector, decoded token metadata, and verified creator ownership, collector ownership, total supply, trait attributes, and Rotini DNA in TzKT big maps. | PROVEN |
| Penne signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e` originated `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, created token 0, loaded two allocations, opened claim, completed a collector pull claim, completed an admin push airdrop, closed claim, decoded metadata, and verified allocation consumption, claimed state, total supply, and creator/collector ownership in TzKT big maps. | PROVEN |
| Lasagna signer-backed Shadownet E2E | `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e` originated `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, added and removed a curator, published two revisions, rolled the current pointer back to revision 0, transferred and accepted administration, decoded metadata, and verified final storage and revision big-map state in TzKT. | PROVEN |
| Colander real KT1 discovery | `npm run pasta:shadownet:colander` opened the current Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna Shadownet proof KT1s through `/tools/colander`, detected adapters/actions, rendered Shadownet explorer links and relationship groups, and observed `colander.contract_opened` / `colander.graph_viewed` events. | PROVEN |
| WTF.ME hosted Pasta pages | `npx tsx --test server/features/wtf-sites/pasta-hosting.test.ts`, `npm run pasta:wtfme:live-publish:check`, `npm run pasta:wtfme:live-inventory:check`, `npm run test:e2e:inventory:coverage`, `npm run check -- --pretty false`, and `npm run pasta:shadownet:wtfme` passed. These prove current-contract page snapshots, dry-run/write-gated live publish tooling, read-only live inventory tooling, inventory ownership, and a local published WTF.ME host browser proof for landing/mint/collection pages. The live publisher now checks the production TLS gate before attempting Pasta pin recovery, so a denied host cannot create a fresh pin manifest. `npm run pasta:wtfme:live-check` still fails against production because `https://wtfos.app/internal/tls/allow?domain=wtf-admin.wtfos.me` returns HTTP 403 `handle not registered`, so the actual live host is not proven. | PARTIAL |
| wtfOS Pasta pinning/recovery | `npm run pasta:shadownet:pinning` validates Pasta pinPolicy, pinManifest, pinItem records, hosted-page/contract-artifact/token-metadata/relationship-metadata coverage, credential-free storage refs, IPFS gateway fallbacks, object-mirror keys, `.well-known/wtfos-pins` recovery drill, the fail-closed public discovery guard, and route policy for `POST /api/ipfs-pinning/pasta-protocol/publish`. The live publish route is permission-gated, requires a published WTF.ME site, active PDS/repo, linked Tezos wallet, reachable object storage, and reuses an existing in-flight/published Pasta manifest instead of creating duplicate recovery rows. This is source/proof coverage plus live-write guard coverage only; it does not prove live provider-side pinning or a production host manifest publication. | PARTIAL |
| Mainnet deployment | Intentionally blocked until Shadownet and hosted-page gates are complete. | OPEN |

## Live Push Recommendation

The safe next push target is this narrow proof lane. A full production Pasta deployment claim should wait until these minimum gates are green:

1. Signer-backed Shadownet proof exists for every Pasta publisher that production UI presents as deployable.
2. WTF.ME serves at least one live Pasta mint page, collection page, and landing page backed by Shadownet proof data.
3. wtfOS pinning verifies artifact, metadata, redundancy, and recovery for a Pasta publish.
4. Wallet-signed Colander management mutations are covered before using Colander as an operational admin surface.
5. All executable verification commands pass on the production promotion branch.

## Next Implementation Order

1. Publish the generated Pasta landing/mint/collection pages to a claimed production WTF.ME host and make `npm run pasta:wtfme:live-check` pass, including `.well-known/wtfos-pins`.
2. Turn the current source-level wtfOS artifact/metadata pinning and recovery checks into a live provider/host proof.
3. Add wallet-signed Colander management mutation proof for representative safe actions before treating Colander as an operational admin surface.
4. Repeat the standalone installer manifest/release proof pattern for remaining individual Pasta apps if separate native downloads are required.
5. Re-run production readiness checks and only then evaluate mainnet/full-send deployment work.
