# Pasta Protocol Coverage Report

## Coverage %

Story, requirements, and validation-test-spec coverage: 99.0% (852/861 generated coverage units).

The report exceeds the 95% documentation/spec threshold required before any implementation coding. It does not claim production or executable-test completion; it provides the validation suite that later coding passes must implement.

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
- Individual Macaroni Desktop, bundled Pasta Suite Desktop, and standalone Spaghetti Desktop downloadable build lanes now have GitHub release artifacts. Macaroni and Pasta Suite have live manifest verifiers passing on `wtfos.app`; Spaghetti still needs the production route/env deployed and authenticated live verifier passing before it is marked downloadable from `wtfos.app`. Future standalone app installers must follow the same release-asset, SHA-256, and authenticated-manifest proof pattern.

## Current Live Evidence

- Macaroni Desktop `1.0.0` individual installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Pasta Suite Desktop `1.0.0` bundled installers are live for macOS, Windows, and Raspberry Pi with authenticated manifest and byte-range release asset proof.
- Spaghetti Studio Desktop `1.0.0` standalone release assets are published for macOS, Windows, and Raspberry Pi, and the branch contains the Electron package, workflow, `/api/spaghetti/installers`, env example, inventory probe, docs, and `npm run spaghetti:installers:live-check`; it is not yet live because production env has not been configured and the route has not been deployed/verified on `wtfos.app`.
- Macaroni Shadownet local puppet proof passed 5/5 against `https://tezos-shadownet.octez.io/`, covering Shadownet defaults, chain-verified wallet safety, trusted-creator publish gating, mint-page wallet restore/disconnect, mismatched RPC blocking, and Kukai handoff.
- Local Spaghetti proof passed through the real `/tools/spaghetti?handoff=chease-package` shell after rebuilding, proving the CH-EASE handoff query reaches the iframe and the static publisher module receives its shared `window.MD` runtime before rehearsing the chain-guarded publish sequence.
- Static Pasta tool bundles are live on `wtfos.app`, and their Tezos vendor bundles now pass the Taquito `25.0.0` / no-`24.3.0` live marker probe.
- The latest `window.MD` static-module runtime export fix is live on `wtfos.app` commit `c4ba55f`: production `common.js` for Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna all expose the export.
- Static reachability and branch-level mocked choreography do not prove Shadownet deploy, mint, collect, indexer, or hosted-page recovery workflows.

## Risk Areas

- Wallet/network drift between Macaroni's proven legacy RPC defaults and new Pasta AGENTS.md defaults.
- Trusted-creator wtfOS pinning/hosting accidentally leaking into standalone builds.
- Individual app installer manifests falsely reporting downloads before GitHub release digests and production env are configured.
- Public hosting falsely reporting live before WTF.ME serves the expected page.
- Indexer lag causing wallet-returned hashes to be mistaken for chain-accepted operations.
- Colander offering action forms from guessed contract type instead of entrypoint detection.
- Marketplace previews hiding edition quantity, owner, price, or target contract.

## Recommended Implementation Order

1. Keep Macaroni unchanged and lock naming tests.
2. Implement or verify shared Pasta package, metadata, relationship, and adapter helpers.
3. Complete CH-EASE target-aware package export and handoff validation.
4. Complete Spaghetti because it anchors standard collection/token-product publishing.
5. Complete Gnocchi, Ravioli, and Rotini token-product publishers.
6. Complete Penne and Lasagna contract-product publishers.
7. Complete Colander adapters and relationship graph after publisher contracts stabilize.
8. Deploy and live-verify the Spaghetti standalone installer manifest on `wtfos.app`, then repeat the individual installer package/manifest/live-check pattern for Gnocchi, Ravioli, Rotini, Penne, and Lasagna if separate downloads are required beyond the Pasta Suite.
9. Extend the Macaroni Shadownet puppet lane into executable deploy/mint/collect, WTF.ME, WTFOS pinning, and Colander discovery tests.
10. Keep Macaroni, Spaghetti, and Pasta Suite installer verifiers as release gates while adding any future standalone Pasta installers.
11. Only after Shadownet and hosted-page proof, plan mainnet/full-send deployment work.
