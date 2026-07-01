# Pasta Protocol Coverage Report

## Coverage %

Story, requirements, and validation-test-spec coverage: 99.0% (852/861 generated coverage units).

The report exceeds the 95% documentation/spec threshold required before any implementation coding. It does not claim production or executable-test completion; it provides the validation suite that later coding passes must implement.

The current deployment boundary is tracked in `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md`. That matrix is the safe-push gate for distinguishing proven production downloads and Spaghetti Shadownet evidence from still-open full Pasta deployment requirements.

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
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e` now provides signer-backed Spaghetti deploy/mint/collect proof on Shadownet. The latest refactored-run evidence originated `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, created token 0, minted supply, transferred one edition to the collector wallet, decoded token metadata from TzKT big-map state, and proved collector ownership by indexed ledger big-map balance.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e` now provides signer-backed Gnocchi open-edition proof on Shadownet. The latest run originated `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, created open edition token 0, collector-open-minted one edition, decoded token metadata from TzKT big-map state, and proved collector ownership, total supply, and active sale configuration. This covers Spaghetti standard collections and Gnocchi open editions only; Ravioli, Rotini, Penne, Lasagna, hosted pinning, WTF.ME, and Colander discovery remain open.
- Individual Macaroni Desktop, bundled Pasta Suite Desktop, and standalone Spaghetti Desktop downloadable lanes now have GitHub release artifacts and authenticated live manifest verifiers passing on `wtfos.app`. Future standalone app installers must follow the same release-asset, SHA-256, production-env, deployment, and authenticated-manifest proof pattern.

## Current Live Evidence

- Macaroni Desktop `1.0.0` individual installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Pasta Suite Desktop `1.0.0` bundled installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Spaghetti Studio Desktop `1.0.0` standalone installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof on `wtfos.app`.
- Macaroni Shadownet local puppet proof passed 5/5 against `https://tezos-shadownet.octez.io/`, covering Shadownet defaults, chain-verified wallet safety, trusted-creator publish gating, mint-page wallet restore/disconnect, mismatched RPC blocking, and Kukai handoff.
- Local Spaghetti proof passed through the real `/tools/spaghetti?handoff=chease-package` shell after rebuilding, proving the CH-EASE handoff query reaches the iframe and the static publisher module receives its shared `window.MD` runtime before rehearsing the chain-guarded publish sequence.
- Real Shadownet preflight passed through `npm run pasta:shadownet:preflight`, proving the Spaghetti artifact and metadata/origination payload plan against `https://tezos-shadownet.octez.io/` and Shadownet TzKT before any wallet signing.
- Signer-backed Spaghetti Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-spaghetti-e2e-report.md` with contract `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, operation, metadata, and TzKT ownership evidence.
- Signer-backed Gnocchi Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-gnocchi-e2e-report.md` with contract `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, operation, sale, supply, metadata, and TzKT ownership evidence.
- Static Pasta tool bundles are live on `wtfos.app`, and their Tezos vendor bundles now pass the Taquito `25.0.0` / no-`24.3.0` live marker probe.
- The latest `window.MD` static-module runtime export fix is live on `wtfos.app` commit `c4ba55f`: production `common.js` for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna all expose the export.
- Static reachability, branch-level mocked choreography, and the Spaghetti/Gnocchi signer-backed Shadownet proofs still do not prove every Pasta publisher, WTF.ME hosting, wtfOS hosted pinning, hosted-page recovery, or mainnet deployment workflows.

## Risk Areas

- Wallet/network drift between Macaroni's proven legacy RPC defaults and new Pasta AGENTS.md defaults.
- Trusted-creator wtfOS pinning/hosting accidentally leaking into standalone builds.
- Future individual app installer manifests falsely reporting downloads before GitHub release digests, production env, deploy, and authenticated live verification are complete.
- Public hosting falsely reporting live before WTF.ME serves the expected page.
- Indexer lag or high-level token endpoint omissions causing operation hashes to be mistaken for full ownership/metadata proof; fresh Shadownet contracts should verify storage and big-map state directly when needed.
- Colander offering action forms from guessed contract type instead of entrypoint detection.
- Marketplace previews hiding edition quantity, owner, price, or target contract.

## Recommended Implementation Order

1. Keep Macaroni unchanged and lock naming tests.
2. Implement or verify shared Pasta package, metadata, relationship, and adapter helpers.
3. Complete CH-EASE target-aware package export and handoff validation.
4. Complete Spaghetti because it anchors standard collection/token-product publishing.
5. Complete Ravioli and Rotini token-product signer proofs after the now-green Gnocchi open-edition proof.
6. Complete Penne and Lasagna contract-product publishers.
7. Complete Colander adapters and relationship graph after publisher contracts stabilize.
8. Repeat the individual installer package/manifest/live-check pattern for Gnocchi, Ravioli, Rotini, Penne, and Lasagna if separate downloads are required beyond the Pasta Suite.
9. Extend the shared signer-backed proof kit across Ravioli, Rotini, Penne, Lasagna, then add WTF.ME, WTFOS pinning, and Colander discovery tests.
10. Keep Macaroni, Spaghetti, and Pasta Suite installer verifiers as release gates while adding any future standalone Pasta installers.
11. Use `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md` as the live-push checklist, then only after Shadownet and hosted-page proof, plan mainnet/full-send deployment work.
