# Rotini — collector-finalized generative publisher

Surface: standalone static creation tool under `public/creation-tools/rotini/`, bundled into Rotini Desktop and Pasta Suite Desktop.

## Contract and artifact model

Rotini uses the dedicated `PastaGenerativeCollectionFA2`. Publication pins a `pasta-rotini-generator@2` manifest and its weighted source layers, originates the collection when requested, and registers one output-specific project through `create_project`. Publication creates no iteration token.

A collector completes two wallet operations:

1. `reserve_iteration(project_id)` locks the exact price and supply slot and stores the collector, future token id, project id, iteration number, expiry, and immutable deterministic seed. No FA2 metadata, supply, ownership, or token exists yet.
2. The self-hosted Rotini page selects traits from that seed, produces and pins the final artifact plus direct TZIP-21 metadata, computes SHA-256, and calls `finalize_iteration`. Finalization creates the one-of-one supply and ownership and binds the artifact/display/thumbnail URIs, MIME type, metadata URI, and hash on-chain.

Projects are permanently configured for one output mode:

- `png` → `image/png` direct artifact;
- `gif` → `image/gif` animated direct artifact;
- `zip` → `application/zip` interactive artifact with top-level `index.html`, relative local assets, and no external URLs or network APIs. A separate PNG cover stays within Objkt's interactive-cover limit.

The shipped browser validator rejects unsafe paths, duplicate paths, external URLs, absolute runtime paths, and `fetch`, XMLHttpRequest, WebSocket, or EventSource calls. PNG/GIF/ZIP artifacts are capped at 250 MB. Finished token display requires no Rotini, wtfOS, marketplace renderer, CDN script, or external display software.

Project price, total supply, per-wallet cap, treasury, reservation TTL, and close/reopen state are enforced on-chain. Closing blocks new reservations but does not strand a paid reservation during rendering. After expiry, `cancel_expired_reservation` is permissionless, releases capacity, and refunds the collector.

## Verification boundary

The SmartPy scenario proves reservation without token creation, unique seeds, exact payment, supply/wallet caps, output MIME enforcement, collector-only finalization, close-with-paid-finalization, expiry refund/capacity release, and transfer.

The artifact unit suite proves ZIP structure/offline validation, deterministic selection, animated GIF framing, and SHA-256. The browser inventory suite executes the exported page for PNG, GIF, and ZIP through `reserve_iteration → render/package → pin artifact → pin metadata → finalize_iteration` and checks the resulting TZIP-21 payloads and contract arguments.

The old Shadownet `mint_iteration` contract `KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls` is historical v1 evidence only. It proves collector mint authority and seed creation, not a self-contained final artifact, and must not be used as current Rotini readiness evidence. The v2 Shadownet command now requires a durable IPFS pinner and will originate a fresh contract with PNG, GIF, and offline-ZIP projects, use independent collectors, verify exact gateway bytes/hashes and TzKT state, and only then replace the recorded proof contract.

## Handles

`rotini.collection_deployed`, `rotini.generated`, `rotini.project_published`, `rotini.iteration_minted`, `rotini.package_exported`, `rotini.site_exported`.
