# Pasta Protocol Coverage Report

## Coverage %

Story, requirements, and validation-test-spec coverage: 99.0% (852/861 generated coverage units).

The report exceeds the 95% documentation/spec threshold required before any implementation coding. It does not claim production or executable-test completion; it provides the validation suite that later coding passes must implement.

The current deployment boundary is tracked in `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md`. That matrix is the safe-push gate for distinguishing proven production downloads, signer-backed Shadownet publisher evidence, recorded Colander action evidence, and still-open full Pasta deployment requirements.

## Repository-grounded suite analysis (2026-07-16)

### Product architecture conclusion

Colander is now the correct central user experience. It owns the portable local project manifest, remembers contracts and self-hosted outputs, chooses the outcome-specific tool, recovers contracts by KT1 address, and presents adapter-driven management actions. CH-EASE is a preparation step, not a competing dashboard. Spaghetti, Gnocchi, Ravioli, Rotini, Penne, Lasagna, and Macaroni remain independently usable production tools; when launched from Colander, they return durable results to the originating project.

This is the intended ownership split:

| Layer | Authority | Responsibility |
| --- | --- | --- |
| Central workspace | Colander | Projects, contracts, exported sites, recovery, management actions, app routing |
| Preparation | CH-EASE | Media/metadata normalization and portable package handoff |
| Product creation | Macaroni + six Pasta publishers | App-specific origination, minting, configuration, operations, and portable site export |
| Public buyer surface | Exported static sites | Wallet connection and direct contract interaction without marketplace execution dependency |
| Optional discovery | Objkt/TzKT/wtfOS | Indexing, explorer links, and hosted convenience; not transaction authority |

### Current vertical-slice capability matrix

| App | Creates | Operates/manages | Public self-hosted result | Colander return path | Remaining material gap |
| --- | --- | --- | --- | --- | --- |
| CH-EASE | Versioned collection or single-token preparation package | Local media selection, creator-controlled Pinata/Kubo pinning, metadata editing, JSON/ZIP export, import, reload recovery, target selection | Portable package plus collision-safe original-media archive | Project-scoped preparation draft and next-publisher context | Provider credentials and local file bytes intentionally remain session-only and must be re-entered/reselected after restart |
| Macaroni | Creator-owned blind-mint FA2 drop | Stages, allowlists, delayed reveal, resume, backups | Blind-mint/reveal site ZIP | Deployed/resumed KT1 and exported site now attach to project; native suite can install ZIP | Broader real-wallet/mainnet launch proof remains a release decision |
| Spaghetti | Standard/fixed-edition collection | Mint, transfer, minters, admin handoff, direct-sale config/pause | Inventory-backed primary-sale page | KT1 + sale site artifact | Fresh Shadownet originate → configure → buy proof passed on `KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i` |
| Gnocchi | One multi-token collection containing independently locked Timed OEs, Forever OEs, Limited Editions, or custom curve-priced policies | New-or-existing collection publishing, edition listing, lifetime mint/cap accounting, creator reserves, sale editing, explicit vault/unvault, mint, transfer, minters, admin handoff | Policy-aware open-mint page per token | KT1 + selected token mint-site artifact | Current artifact and three-token lifecycle are signer-proven on Shadownet contract `KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw`; the Studio's same-KT publishing workflow is browser-proven |
| Ravioli | Bundle/redeemable/mystery wrapper | Mint, transfer, reveal contents, redeem, direct sale, roles/admin | Buy and redeem page | KT1 + bundle site artifact | Fresh Shadownet originate → configure → buy → redeem proof passed on `KT1LF14kfDc3nGq8Vs26J2BykYixWeEfYqMQ` |
| Rotini | Collector-finalized generative projects producing PNG, animated GIF, or dependency-free interactive ZIP tokens | Preview, publish generator, reserve immutable seed/token id, materialize and pin artifact, finalize NFT/hash, refund expiry, close/reopen, transfer/admin | Collector reserve/render/pin/finalize page | KT1 + output-specific generative mint-site artifact | Browser and SmartPy v2 lifecycle pass; fresh signer-backed v2 Shadownet proof is pending a durable IPFS pinner. The old `KT1BY…` `mint_iteration` proof is superseded. |
| Penne | Distribution FA2 and allocations | Pull claims, claim window, push airdrops, transfer/admin | Claim page | KT1 + claim site artifact | Bulk recipient composition remains in Penne by design |
| Lasagna | On-chain exhibition registry | Curators, revisions, current revision, admin handoff | Current-revision exhibition page | KT1 + exhibition site artifact | Revision composition remains in Lasagna by design |

### What “independent of Objkt” means in the current implementation

- Creation, origination, minting, sale configuration, buyer purchase/open mint/claim/redeem actions, creator management, and static-page hosting do not require Objkt.
- TzKT and configured Tezos RPCs remain read/explorer infrastructure; the contracts and wallet-signed operations are the source of truth.
- Objkt may index minted FA2 tokens after they exist, but Pasta does not depend on Objkt discovering an unminted open-edition contract or providing the primary-sale transaction path.
- Exported pages are portable ZIPs. Pasta Suite Desktop can safely install them under the creator's user-owned site directory and serve them over a loopback-only local host; the same archive can be uploaded to any static host.

### Central-workspace continuity now proven

Colander project identity survives direct publisher launches and the multi-hop `Colander → CH-EASE → publisher` path. Macaroni also preserves the project context through its landing page into Studio, records deployed or resumed contracts, records the exported mint site, and uses the native Pasta Suite site installer when available. The focused browser suite proves Macaroni plus all six newer publishers update the same versioned Colander workspace without a wtfOS database.

### Draft and recovery parity now proven

Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna now share one `pasta-studio-draft@1` runtime rather than six incompatible storage formats. Each app autosaves fixed form state plus its specialized structures: token rows, hosted artifact references, bundle members, trait layers/weights, recipient allocations, and exhibition references. Reload recovery and portable JSON backup/import are available in the standalone studio itself, while a Colander-launched studio also records a lightweight recovery reference in the originating Pasta Project so Colander can show and resume unfinished work.

The boundary intentionally excludes passwords, Pinata JWTs, and local file bytes. Already-hosted/IPFS URIs survive, but creators must reselect local cover, artifact, wrapper, or generative layer files after recovery. A mounted studio may update Colander only when its app id matches the handoff `kind`; this prevents an older wtfOS window from attaching its autosave to a newly opened app's project.

### Standalone contract resume parity now proven

Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna now share a `pasta-studio-contract@1` device-local ledger. A confirmed deployment is recorded even when the app was opened standalone; a pasted KT1 is not remembered until the shared runtime reads it from the selected network; reopening the app restores the appropriate contract input and, where applicable, its existing-contract mode. Verify, resume, and forget actions emit normalized lifecycle events, and forgetting changes only the device-local reference—not the on-chain contract.

Colander projects now include backward-compatible `pasta-contract-ref@1` records alongside legacy contract strings. The central dashboard shows the complete KT1, owning Pasta app, network, and last verification time, then lets the creator reopen the central contract manager or resume the specialized owner app. This closes the clipboard/indexer dependency for creator contract recovery without making Colander duplicate every specialized editor.

### Installed Colander lifecycle parity now proven

Pasta Suite Desktop's native Colander now consumes the same project lifecycle produced by the bundled standalone apps instead of acting as a reduced parallel dashboard. It normalizes current and legacy manifests on load/import/storage refresh, filters malformed drafts/contracts/sites and unsafe loopback paths, displays recoverable studio drafts, complete structured contract records, and project-linked self-hosted page artifacts, and routes each object back to its bundled owner app with project/network/contract context.

The installed authority can also place a remembered address into the native wallet-safe contract manager and open a project-linked page from its loopback `/sites/:slug/` host. A direct native contract read attaches a current `pasta-contract-ref@1` record with detected owner app and verification time. Hosted wtfOS pinning and publishing remain intentionally outside this local management boundary.

Web and installed Colander now own the same project-management lifecycle. Creators can rename work, duplicate the workflow/network into a clean independent project without reusing draft keys or contract/site ledgers, archive work while preserving its prior stage, restore current or legacy archived manifests, and permanently delete only an archived project through explicit inline confirmation. Archived projects are excluded from normal tool-launch selection until restored, and every transition persists through the portable `pasta-project@1` record and emits a canonical lifecycle event.

Self-hosted pages now have a deliberate lifecycle rather than write-once installation. Web Colander can rebuild a recorded page in the exact owner app and contract context or forget only the portable artifact record while leaving ZIPs, native files, and chain state untouched. Installed Colander can perform the same record actions and can additionally uninstall a served page from either its project record or global site registry. The loopback service accepts only an exact managed slug, rejects path coercion and symlink targets, atomically renames the directory out of service before removal, and prunes every matching project artifact after success.

### Portable CH-EASE preparation now proven

CH-EASE is no longer available only through the hosted React/API screen. The standalone static studio is bundled as Pasta Suite Desktop's eighth tool and can prepare a collection or single-token package entirely on-device: select original media, edit collection/token metadata, choose one of the six publisher targets, import/export the shared v1 JSON contract, and download a ZIP containing the package plus collision-safe numbered original-media paths.

Metadata recovery is project-scoped and intentionally excludes file bytes and provider credentials. CH-EASE can now pin loaded originals directly through the creator's own Pinata JWT or Kubo HTTP API, write each returned CID into the matching item, and proceed immediately to publisher handoff; the JWT and node controls never enter the draft or Colander manifest. After reload, the creator gets durable URIs and metadata back plus a visible instruction to reselect originals for the next archive. Colander receives a `ch-ease` draft reference, preserves the preparation owner through native normalization, and resumes into installed CH-EASE. Publisher handoff still fails closed until each item has a durable artifact URI, then uses the same package contract consumed by the standalone publishers while retaining project id/title/network.

CH-EASE also has a source-ready individual Electron package for macOS, Windows, and Raspberry Pi. Because preparation is only complete when its selected publisher can consume the package, the individual app bundles Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna as local same-origin dependencies while keeping Colander and Macaroni outside its scope. Its protected manifest remains unavailable until a production-safe release URL and matching SHA-256 are configured; no CH-EASE installer release is claimed live in this report.

The cross-window handoff now survives `noopener` isolation. CH-EASE writes the existing session payload plus a five-minute one-use `pasta-handoff-envelope@1` local fallback; the publisher validates the expiry and deletes both transports on consumption. A real popup proof exercises the packaged CH-EASE → Spaghetti path rather than merely inspecting the source window's storage.

### Remaining release blockers versus product gaps

- The fixed-edition commerce product gap is closed for Spaghetti and Ravioli. Rotini is no longer classified as fixed inventory: its v2 contract now uses `create_project → reserve_iteration → local PNG/GIF/offline-ZIP materialization and IPFS pin → finalize_iteration`, with expiry refunds and close/reopen behavior. The old single-call Shadownet proof is historical and the v2 signer-backed proof remains a release blocker until durable IPFS bytes and their on-chain hashes are verified.
- Production proof gap: a dedicated public WTF.ME Pasta host and credentialed pin/recovery proof are still missing. This blocks a claim that the optional wtfOS-hosted lane is fully live, not the portable self-hosted ZIP workflow.
- Assurance gap: Colander has representative signer-backed management proof, deterministic browser coverage for broader actions, and contract tests, but not real-wallet-extension proof for every adapter action.
- Mainnet remains intentionally gated behind current Shadownet and hosted-page evidence. No current report should describe the complete suite as mainnet/full-launch proven.

## Missing Features

- No app-roster feature is undocumented in this pass.
- Tortellini is explicitly not a product; `CH-EASE -> Tortellini` is covered as a blocked-flow story and excluded-target validation, not as an implementation requirement.
- Future franchise enforcement is intentionally design-only through relationship metadata.

## Missing Stories

- No missing story category remains for the current Pasta roster.
- Cross-app coverage includes 72 directed pairs and 22 meaningful chains, including explicit Macaroni/Gnocchi/Ravioli example chains and the blocked Tortellini example.
- Future app additions must regenerate directed pairs and E2E combinations before implementation.

## Missing Tests

- No missing validation test specifications remain for the current generated feature roster.
- Executable Playwright/API runners still need to be implemented from the markdown and manifest validation cases in later coding passes.
- Mainnet deployment tests are intentionally excluded until full Shadownet proof is complete. Macaroni now has a green Shadownet confidence lane, but that is not yet full protocol deploy/mint/collect proof.
- CH-EASE -> Spaghetti now has a focused executable browser proof for route-query handoff, static-module runtime wiring, imported collection metadata, Shadownet chain guard, origination choreography, create_token batching, mint batching, pinned metadata payloads, and canonical Spaghetti audit events. This is still a mocked wallet/chain choreography proof, not live Shadownet origination evidence.
- `npm run pasta:shadownet:preflight` now provides an executable real-network preflight for Spaghetti: it verifies the configured Shadownet RPC chain id, Shadownet TzKT head, the Spaghetti Michelson artifact entrypoint surface, Colander standard-collection adapter detection, CH-EASE package validity, relationship metadata, token metadata, and origination storage payload shape. This still does not sign or inject a Shadownet operation.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e` now provides signer-backed Spaghetti deploy/mint/direct-sale proof on Shadownet. The latest evidence originated `KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i`, created token 0, minted creator inventory, configured an exact-price sale, completed collector purchase, decoded token metadata, and proved exhausted sale inventory plus collector ownership in TzKT big maps.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e` is the guarded Gnocchi multi-edition proof command. The passing run originated current contract `KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw`, created a locked uncapped Timed OE, locked Forever OE, and locked capped-and-timed LE in that one KT1, included a creator reserve, used two independent collectors, proved deadline/sold-out/vault/policy-expansion rejections, and verified lifetime minted, current supply, locks, metadata, ownership, and sale state through TzKT.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e` now provides signer-backed Ravioli bundle commerce proof on Shadownet. The latest run originated `KT1LF14kfDc3nGq8Vs26J2BykYixWeEfYqMQ`, created bundle token 0, minted inventory, configured a direct sale, sold two editions to the collector, redeemed one, decoded token metadata, and proved exhausted sale inventory, collector ownership, total supply, bundle config, and redeemed count.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:rotini:e2e` is now the guarded v2 proof command. It refuses chain writes without a durable Kubo or Pinata pinner, then pins generator sources/manifests, originates one contract with PNG/GIF/ZIP projects, uses independent collectors for reserve/finalize operations, verifies exact artifact bytes and SHA-256 through an IPFS gateway, and verifies TzKT ownership/supply/seed/metadata/artifact bindings. A fresh passing v2 contract has not yet replaced the historical `KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls` v1 proof.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e` now provides signer-backed Penne distribution proof on Shadownet. The latest run originated `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, created token 0, loaded collector/creator allocations, opened claim, completed a collector pull claim, completed an admin push airdrop, closed claim, decoded token metadata from TzKT big-map state, and proved allocation consumption, claimed state, total supply, and creator/collector ownership.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e` now provides signer-backed Lasagna exhibition proof on Shadownet. The latest run originated `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, added and removed a curator, published two revisions, rolled the current pointer back to revision 0, transferred and accepted administration, decoded collection/revision metadata from TzKT big-map state, and proved final administrator, revision count, current revision, referenced contracts, and cleared curator state.
- `npm run pasta:shadownet:colander` provides browser-side discovery proof for Spaghetti, Gnocchi, Ravioli, Penne, and Lasagna plus historical Rotini v1. The adapter/browser fixture now recognizes Rotini v2 reserve/finalize/refund entrypoints, but live Rotini Colander discovery must be rerun after the registry receives a fresh v2 KT1.
- `PASTA_SHADOWNET_COLANDER_E2E_EXECUTE=1 npm run pasta:shadownet:colander:action` now provides a guarded signer-backed Colander management action proof for the Lasagna `set_current_revision(0)` path. The recorded TzKT operation `oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h` is rechecked without signer execution by `npm run pasta:shadownet:colander:action-proof` and by the shared `pasta:live-readiness` gate. Hosted pinning, WTF.ME public host proof, real wallet-extension Colander submission, broader action coverage, and mainnet remain open.
- Individual Macaroni Desktop, bundled Pasta Suite Desktop, standalone Spaghetti Desktop, and standalone Gnocchi/Ravioli/Rotini/Penne/Lasagna Desktop downloadable lanes now have GitHub release artifacts, SHA-256 digests, production env, and authenticated live manifest verifiers passing on `wtfos.app`.

## Current Live Evidence

- Macaroni Desktop `1.0.0` individual installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Pasta Suite Desktop `1.0.0` bundled installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Spaghetti Studio Desktop `1.0.0` standalone installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof on `wtfos.app`.
- Gnocchi Studio, Ravioli Studio, Rotini Studio, Penne Studio, and Lasagna Studio Desktop `1.0.0` standalone installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof on `wtfos.app`.
- Macaroni Shadownet local puppet proof passed 5/5 against `https://tezos-shadownet.octez.io/`, covering Shadownet defaults, chain-verified wallet safety, trusted-creator publish gating, mint-page wallet restore/disconnect, mismatched RPC blocking, and Kukai handoff.
- Local Spaghetti proof passed through the real `/tools/spaghetti?handoff=chease-package` shell after rebuilding, proving the CH-EASE handoff query reaches the iframe and the static publisher module receives its shared `window.MD` runtime before rehearsing the chain-guarded publish sequence.
- Real Shadownet preflight passed through `npm run pasta:shadownet:preflight`, proving the Spaghetti artifact and metadata/origination payload plan against `https://tezos-shadownet.octez.io/` and Shadownet TzKT before any wallet signing.
- Signer-backed Spaghetti Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-spaghetti-e2e-report.md` with contract `KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i`, sale and purchase operations, metadata, exhausted inventory, and TzKT ownership evidence.
- Signer-backed Gnocchi Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e`; `.agents/docs/archive/contracts/pasta-protocol/shadownet-gnocchi-e2e-report.md` records current contract `KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw`, all three token policies, two independent collectors, creator reserve, deadline/sold-out/vault/locked-policy rejections, and TzKT-indexed ownership, supply, lifetime issuance, metadata, and policy state. The old `KT1Sso134UuSX9cRZ5a5Sq9vxAFY9tc8wy6W` remains historical v1 evidence only.
- Signer-backed Ravioli Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-ravioli-e2e-report.md` with contract `KT1LF14kfDc3nGq8Vs26J2BykYixWeEfYqMQ`, sale, purchase, redeem, bundle config, metadata, supply, and TzKT ownership evidence.
- The archived Rotini Shadownet report for `KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls` is explicitly v1 historical evidence. A v2 pass must overwrite it only after durable PNG/GIF/ZIP IPFS retrieval, exact SHA-256 checks, reserve/finalize operations, and TzKT artifact bindings succeed on a fresh contract.
- Signer-backed Penne Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-penne-e2e-report.md` with contract `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, operation, allocation, claimed-state, supply, metadata, and TzKT ownership evidence.
- Signer-backed Lasagna Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-lasagna-e2e-report.md` with contract `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, operation, curator, revision, admin-handoff, relationship metadata, referenced proof-contract, and TzKT storage/big-map evidence.
- Colander Shadownet discovery passed through `npm run pasta:shadownet:colander`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-colander-discovery-report.md` after browser-opening all six current proof KT1s, proving adapter/action rendering, Shadownet explorer routing, relationship group decoding, and `colander.contract_opened` / `colander.graph_viewed` event emission.
- Colander signer-backed Shadownet management action proof passed for the Lasagna `set_current_revision(0)` path; `npm run pasta:shadownet:colander:action-proof` rechecks the recorded report and TzKT operation `oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h` without spending signer funds.
- Static Pasta tool bundles are live on `wtfos.app`, and their Tezos vendor bundles now pass the Taquito `25.0.0` / no-`24.3.0` live marker probe.
- Local browser proof now passes for six-app project-scoped autosave/reload recovery, Spaghetti portable draft export/import, six-app confirmed-contract persistence/resume, manually chain-validated KT1 remember, structured Colander contract visibility, secret/file exclusion policy, and cross-app mounted-window ownership fencing. The focused Pasta suite passes 6/6, affected desktop preparation/package policies pass 41/41, and normalized inventory coverage passes 920/920 handles. The complete 641-story inventory run passed all 640 non-Objkt stories; its sole failure was the unrelated concurrent Objkt Operator launcher test timing out before finding its Start Menu item. This source is not yet deployed, so it is local evidence rather than a live-production claim.
- The latest recorded production evidence snapshot now distinguishes live service health from deployment identity and proves both on current live `wtfos.app`. On 2026-07-06, Deploy to Hetzner run `28830687989` and Quality Gates run `28830687933` passed for commit `9652a72dc4251efaf8d09585d2b00db98764a46f`, and live `https://wtfos.app/api/health` reports `version.commitRef:"9652a72d"`, `nodeEnv:"production"`, healthy DB, and mainnet chain defaults. `PASTA_LIVE_READINESS_EXPECT_COMMIT=9652a72d PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1 npm run pasta:live-readiness` proved production health, deployment identity, repo cleanup, static runtime markers, suite/individual installer assets, installer catalog auth, and recorded Colander action proof. This does not claim full Pasta launch completion; `PASTA_LIVE_READINESS_EXPECT_COMMIT=9652a72d npm run pasta:live-readiness:final` exits nonzero only on the remaining missing dedicated WTF.ME publish credentials and missing `PASTA_WTFME_LIVE_HOST`.
- Static reachability, branch-level mocked choreography, the Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna signer-backed Shadownet proofs, Colander browser discovery, and the representative Colander signer-backed management action proof still do not prove live WTF.ME hosting, wtfOS hosted pinning/public recovery from a production Pasta host, broad real-wallet Colander operations, or mainnet deployment workflows.

## Risk Areas

- Wallet/network drift between Macaroni's proven legacy RPC defaults and new Pasta AGENTS.md defaults.
- Trusted-creator wtfOS pinning/hosting accidentally leaking into standalone builds.
- Future individual app installer manifests falsely reporting downloads before GitHub release digests, production runtime env, deploy, and authenticated live verification are complete.
- Live release evidence falsely looking green if `/api/health` ever regresses to a placeholder or mismatched deployment commit marker.
- Public hosting falsely reporting live before WTF.ME serves the expected page.
- Indexer lag or high-level token endpoint omissions causing operation hashes to be mistaken for full ownership/metadata proof; fresh Shadownet contracts should verify storage and big-map state directly when needed.
- Colander now has one signer-backed management action proof, but real wallet-extension submission and broader safe-action coverage are still needed before treating Colander as a fully operational admin surface.
- Marketplace previews hiding edition quantity, owner, price, or target contract.

## Recommended Implementation Order

1. Keep Macaroni's proven contract/wallet/drop behavior stable while maintaining its Colander project and native-site integration.
2. Implement or verify shared Pasta package, metadata, relationship, and adapter helpers.
3. Keep CH-EASE's portable package contract, recovery format, media archive, and target-aware handoff locked together as one preparation boundary.
4. Complete Spaghetti because it anchors standard collection/token-product publishing.
5. Keep the expected live deployment commit marker check in every readiness run before using live evidence for a Pasta launch claim.
6. Publish WTF.ME hosted pages on a dedicated production host and make the public host checker pass.
7. Turn the current WTFOS pinning/recovery checks into a live host/provider proof for Pasta artifact and metadata durability.
8. Extend the representative Colander management action proof to real wallet-extension submission and broader safe actions.
9. Keep all standalone and suite installer verifiers as release gates while adding any future native Pasta installer.
10. Use `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md` as the live-push checklist, then only after Shadownet and hosted-page proof, plan mainnet/full-send deployment work.
