# Pasta Protocol Coverage Report

## Coverage %

Story, requirements, and validation-test-spec coverage: 99.0% (852/861 generated coverage units).

The report exceeds the 95% documentation/spec threshold required before any implementation coding. It does not claim production or executable-test completion; it provides the validation suite that later coding passes must implement.

The current deployment boundary is tracked in `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md`. That matrix is the safe-push gate for distinguishing proven production downloads and signer-backed Shadownet publisher evidence from still-open full Pasta deployment requirements.

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
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e` now provides signer-backed Gnocchi open-edition proof on Shadownet. The latest run originated `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, created open edition token 0, collector-open-minted one edition, decoded token metadata from TzKT big-map state, and proved collector ownership, total supply, and active sale configuration.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e` now provides signer-backed Ravioli bundle proof on Shadownet. The latest run originated `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, created bundle token 0, minted supply, transferred two editions to the collector, redeemed one edition, decoded token metadata from TzKT big-map state, and proved collector ownership, total supply, bundle config, and redeemed count.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:rotini:e2e` now provides signer-backed Rotini generative proof on Shadownet. The latest run originated `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`, created two deterministic generated token types, minted both editions, transferred token 1 to the collector, decoded token metadata from TzKT big-map state, and proved creator ownership, collector ownership, total supply, trait attributes, and Rotini DNA.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e` now provides signer-backed Penne distribution proof on Shadownet. The latest run originated `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, created token 0, loaded collector/creator allocations, opened claim, completed a collector pull claim, completed an admin push airdrop, closed claim, decoded token metadata from TzKT big-map state, and proved allocation consumption, claimed state, total supply, and creator/collector ownership.
- `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e` now provides signer-backed Lasagna exhibition proof on Shadownet. The latest run originated `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, added and removed a curator, published two revisions, rolled the current pointer back to revision 0, transferred and accepted administration, decoded collection/revision metadata from TzKT big-map state, and proved final administrator, revision count, current revision, referenced contracts, and cleared curator state.
- `npm run pasta:shadownet:colander` now provides browser-side Colander discovery proof against the six current signer-backed Shadownet proof contracts. It opens Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna KT1s through `/tools/colander`, detects adapters/actions from live entrypoints/storage, renders Shadownet explorer links and relationship groups, and observes Colander discovery events. This covers Spaghetti standard collections, Gnocchi open editions, Ravioli bundles, Rotini generated collections, Penne distributions, and Lasagna exhibitions for Colander discovery; hosted pinning, WTF.ME, wallet-signed Colander mutations, and mainnet remain open.
- Individual Macaroni Desktop, bundled Pasta Suite Desktop, standalone Spaghetti Desktop, and standalone Gnocchi/Ravioli/Rotini/Penne/Lasagna Desktop downloadable lanes now have GitHub release artifacts, SHA-256 digests, production env, and authenticated live manifest verifiers passing on `wtfos.app`.

## Current Live Evidence

- Macaroni Desktop `1.0.0` individual installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Pasta Suite Desktop `1.0.0` bundled installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Spaghetti Studio Desktop `1.0.0` standalone installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof on `wtfos.app`.
- Gnocchi Studio, Ravioli Studio, Rotini Studio, Penne Studio, and Lasagna Studio Desktop `1.0.0` standalone installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof on `wtfos.app`.
- Macaroni Shadownet local puppet proof passed 5/5 against `https://tezos-shadownet.octez.io/`, covering Shadownet defaults, chain-verified wallet safety, trusted-creator publish gating, mint-page wallet restore/disconnect, mismatched RPC blocking, and Kukai handoff.
- Local Spaghetti proof passed through the real `/tools/spaghetti?handoff=chease-package` shell after rebuilding, proving the CH-EASE handoff query reaches the iframe and the static publisher module receives its shared `window.MD` runtime before rehearsing the chain-guarded publish sequence.
- Real Shadownet preflight passed through `npm run pasta:shadownet:preflight`, proving the Spaghetti artifact and metadata/origination payload plan against `https://tezos-shadownet.octez.io/` and Shadownet TzKT before any wallet signing.
- Signer-backed Spaghetti Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-spaghetti-e2e-report.md` with contract `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, operation, metadata, and TzKT ownership evidence.
- Signer-backed Gnocchi Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:gnocchi:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-gnocchi-e2e-report.md` with contract `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`, operation, sale, supply, metadata, and TzKT ownership evidence.
- Signer-backed Ravioli Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:ravioli:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-ravioli-e2e-report.md` with contract `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, operation, bundle config, redeemed count, metadata, supply, and TzKT ownership evidence.
- Signer-backed Rotini Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:rotini:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-rotini-e2e-report.md` with contract `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`, operation, generated trait/DNA metadata, supply, and TzKT ownership evidence.
- Signer-backed Penne Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:penne:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-penne-e2e-report.md` with contract `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`, operation, allocation, claimed-state, supply, metadata, and TzKT ownership evidence.
- Signer-backed Lasagna Shadownet E2E passed through `PASTA_SHADOWNET_E2E_EXECUTE=1 npm run pasta:shadownet:lasagna:e2e`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-lasagna-e2e-report.md` with contract `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`, operation, curator, revision, admin-handoff, relationship metadata, referenced proof-contract, and TzKT storage/big-map evidence.
- Colander Shadownet discovery passed through `npm run pasta:shadownet:colander`; the command wrote `.agents/docs/archive/contracts/pasta-protocol/shadownet-colander-discovery-report.md` after browser-opening all six current proof KT1s, proving adapter/action rendering, Shadownet explorer routing, relationship group decoding, and `colander.contract_opened` / `colander.graph_viewed` event emission.
- Static Pasta tool bundles are live on `wtfos.app`, and their Tezos vendor bundles now pass the Taquito `25.0.0` / no-`24.3.0` live marker probe.
- The latest `window.MD` static-module runtime export fix is live on `wtfos.app` commit `c4ba55f`: production `common.js` for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna all expose the export.
- Static reachability, branch-level mocked choreography, the Spaghetti/Gnocchi/Ravioli/Rotini/Penne/Lasagna signer-backed Shadownet proofs, and the Colander browser discovery proof still do not prove WTF.ME hosting, wtfOS hosted pinning, hosted-page recovery, wallet-signed Colander management mutations, or mainnet deployment workflows.

## Risk Areas

- Wallet/network drift between Macaroni's proven legacy RPC defaults and new Pasta AGENTS.md defaults.
- Trusted-creator wtfOS pinning/hosting accidentally leaking into standalone builds.
- Future individual app installer manifests falsely reporting downloads before GitHub release digests, production runtime env, deploy, and authenticated live verification are complete.
- Public hosting falsely reporting live before WTF.ME serves the expected page.
- Indexer lag or high-level token endpoint omissions causing operation hashes to be mistaken for full ownership/metadata proof; fresh Shadownet contracts should verify storage and big-map state directly when needed.
- Colander signed-management actions still need wallet-backed mutation proof before Colander can be treated as an operational admin surface.
- Marketplace previews hiding edition quantity, owner, price, or target contract.

## Recommended Implementation Order

1. Keep Macaroni unchanged and lock naming tests.
2. Implement or verify shared Pasta package, metadata, relationship, and adapter helpers.
3. Complete CH-EASE target-aware package export and handoff validation.
4. Complete Spaghetti because it anchors standard collection/token-product publishing.
5. Add WTF.ME hosted page checks on top of the signer-backed proof contracts.
6. Add WTFOS pinning/recovery checks for Pasta artifact and metadata durability.
7. Add wallet-signed Colander management mutation proof for representative safe actions.
8. Keep all standalone and suite installer verifiers as release gates while adding any future native Pasta installer.
9. Use `.agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md` as the live-push checklist, then only after Shadownet and hosted-page proof, plan mainnet/full-send deployment work.
