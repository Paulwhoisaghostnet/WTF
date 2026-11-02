# Macaroni V3.5 Companion

The Companion is the private, always-on half of a self-published Macaroni V3.5 blind mint. The collector page remains a normal static website. The Companion keeps the hidden allocation material and final IPFS CARs off that website, follows paid claims from Tezos, signs the contract's forced FIFO settlement, waits for Tenderbake finality, and then publishes the exact committed artifact followed by its metadata.

It does not accept a buyer-selected token or CID. It does not expose signer keys, entropy preimages, private CIDs, metadata nonces, raw artifacts, encrypted-file paths, or signed operation bytes through status/API responses.

## Asset strategies

`pin_on_claim` is the secure default. Raw uploads are streamed into encrypted private storage. Deterministic final artifact and metadata CARs are created locally and encrypted at rest. Their CIDs and metadata nonce remain inside an encrypted manifest. After the exact settlement operation has two blocks on top of its inclusion block, the Companion re-reads the claim/token/digest/metadata postcondition, publishes the artifact CAR, verifies it, and only then publishes and verifies the metadata CAR.

This still has an unavoidable Tezos mempool disclosure: the final metadata CID and entropy preimage are parameters of the atomic settlement operation, so an RPC provider, mempool observer, or baker can see those pointers before inclusion. Because `pin_on_claim` withholds both plaintext CARs until finalized settlement, the observer cannot retrieve the committed artifact or metadata bytes from Macaroni during that window. An adversary can still copy the visible pointer into another transaction. A creator-controlled/local RPC avoids expanding this trust to an additional RPC provider, but it does not make the public Tezos mempool private. The installer leaves a required acknowledgement unresolved until the creator reads and accepts this limitation.

`public_prepin_private_manifest` is an advanced compatibility option. It publishes the final plaintext CARs before sale while keeping only the CID/nonce mapping private. Anyone who discovers those public IPFS blocks can copy them before the Macaroni mint. Do not describe this option as encrypted content or a fully hidden blind mint.

## Duplicate-artifact protection

Macaroni rejects identical artifact bytes inside one staged drop. Editions belong in one token row with a larger `quantity`; they must not be repeated as separate token rows. Before arming a sale, it also checks both computed artifact and metadata CIDs against Objkt's public token index and fails closed if the check is unavailable or finds a match.

The default `private_full_scan` mode downloads public index pages and compares them inside the Companion. It never places a target private CID in the GraphQL request. This can take time on mainnet, but it preserves the hidden-CID boundary.

The advanced `external_direct_lookup` mode is faster because it sends every target artifact and metadata CID to the configured index service. When that URL is Objkt's service, Objkt receives those private CIDs before the sale even though they are omitted from Macaroni's database reports and APIs. Enabling it requires the exact acknowledgement shown in `.env.example`.

Objkt's own minting guide says minting the exact same artifact twice flags the account. The preflight reduces accidental duplicates; it is not a guarantee about future mints or Objkt moderation decisions.

## Install

Requirements:

- Node.js 22 or newer, or Docker Compose.
- An always-on machine with durable backed-up storage.
- A dedicated Tezos finalizer wallet. Put only its raw secret key in `secrets/finalizer.key`; never reuse a high-value wallet.
- Either a private Kubo API or a CAR-capable hosted upload endpoint. The collector-facing gateway must retrieve the exact CID after publication.
- A creator-controlled/local Tezos RPC is preferred. A third-party RPC is an advanced trust expansion and requires a separate acknowledgement.
- A creator-controlled HTTPS hostname for the public endpoints when the static drop is hosted remotely.

macOS/Linux:

```sh
./scripts/install-macos-linux.sh
```

Windows PowerShell:

```powershell
.\scripts\install-windows.ps1
```

The installer creates a 32-byte master key, a separate admin token, private directories, and an `.env` containing the SHA-256 values of the bundled reviewed contract, encoded storage template, and policy manifest. It deliberately does not invent or print a Tezos signer key. Add the dedicated finalizer key, replace every public URL/origin placeholder, configure IPFS and your RPC, then read and replace the mempool-disclosure acknowledgement placeholder.

Then run:

```sh
npm run doctor
npm test
npm start
```

`doctor` performs real readiness work: file-custody checks, SQLite opening, reviewed artifact hashing, the compiled SmartPy PACK/hash fixture, encrypted entropy recovery, RPC chain identity, finalizer loading, TzKT and duplicate-index probes, and a harmless deterministic CAR publish plus public retrieval. `npm start` exits fail-closed unless all selected capabilities pass.

### Macaroni Desktop and Pasta Suite Desktop

The desktop installers bundle and supervise this same Companion runtime. Macaroni Studio serves on `http://127.0.0.1:30771`; Pasta Suite serves on `http://127.0.0.1:30770`; the supervised Companion remains on `http://127.0.0.1:47835`. On first launch, the desktop process creates private app-data custody, a master key, an admin token, and a fail-closed `.env`. It does not create a finalizer key or silently accept the mempool/RPC disclosures.

The Electron main process—not the Studio web page—reads the admin token. It starts/stops the worker with the application and proxies only the exact creator routes documented in `API.md`. The browser never receives the token. A static export copies only the public service manifest template and ordinary drop assets; it never copies `.env`, `secrets/`, `data/`, raw artifacts, encrypted CARs, or signer state.

`studioApiReady` remains false until the Companion's complete doctor passed and an authenticated admin readiness probe succeeded. `publicCollectorReady` is separate: a fresh desktop install can safely stage and manage a project while its loopback buyer endpoint remains deliberately ineligible for a remote launch/export. An unchanged failed configuration is not restarted in a loop; after the creator corrects the config or key files, the next readiness check starts it again.

## HTTPS and a remotely hosted static page

The service binds to loopback by default. Put only `/v1/public/*` and optionally `/health` behind an HTTPS reverse proxy; `templates/Caddyfile.example` is a starting point. Never proxy `/v1/admin/*`, the Kubo API, `data/`, `secrets/`, `.env`, or the raw Companion port to the internet.

Set `MACARONI_COMPANION_PUBLIC_BASE_URL` to the public HTTPS reverse-proxy base and `MACARONI_COMPANION_COLLECTOR_ORIGIN` to the exact deployed static-page origin. `MACARONI_COMPANION_ALLOWED_ORIGINS` is an exact comma-separated allowlist and must contain that collector origin. There is no wildcard CORS mode. Include the local Studio origin as a separate entry if needed. A browser origin is not authentication: admin routes additionally require the token in `secrets/admin.token`, which must never be embedded in a static page.

Loopback remains usable for local management but is not exportable by default. Before preflight, arming, activation, or static-manifest export, Companion fetches the configured public status URL using the collector origin and verifies exact CORS, service schema, Tezos network, and contract identity. An explicit loopback-only development acknowledgement exists for same-machine testing; it must never be used for a remotely hosted page.

For Docker, the published port remains loopback-only. Compose overrides data/key/artifact paths for the container. A host Kubo API at `127.0.0.1` is not the container's loopback; provide a private HTTPS Kubo endpoint or a CAR-capable hosted provider that the container can reach.

## Exact creator setup order

The creator UI should make each step resumable and explain the transaction before asking for a signature:

1. Register the immutable project. Companion creates one encrypted reverse hash chain and returns only its public head, chain length, and finalizer address.
2. Upload the public collection cover. Companion pins and verifies it, then builds and pins canonical TZIP-16 contract metadata. These two public URIs are intentionally returned for the contract and static export.
3. Upload each raw artifact and stage its token row. Non-image works may include private display and thumbnail uploads. Responses contain only token id, quantity, commitments, and publication states—not private CIDs.
4. Save the immutable creator plan: royalty configuration, sale stages, and allowlist rows. From this point forward, use the durable `creator-actions/next` planner. It returns exactly one server-authored wallet action, live estimate, plain-language explanation, and expected result.
5. After the creator reviews the action, Studio durably records `prompt-started` immediately before calling the wallet's `.send()`. Sign and report only that action. Companion waits for the exact applied operation plus two blocks, checks its on-chain result, and then returns the next action. It derives the KT1 from the finalized origination instead of trusting a browser-supplied address. Token rows, canonical physical slots, stages, and allowlists are automatically split into live-estimated resumable batches.
6. Fund the contract and dedicated finalizer wallet when the planner asks. The reviewed Shadownet evidence sets the conservative subsidy at `151,180` mutez per claim: the largest newly charged V3.5 metadata-storage burn (`97,500`) plus the highest applied historical Macaroni reveal baker fee (`53,680`). Paid-only drops therefore require at least `755,900` mutez for the contract's five-settlement reserve. A free or mixed-price drop must hold `max(5 × subsidy, physical supply × subsidy)` because free purchases retain no subsidy. The measured finalizer startup floor is `756,263` mutez; live preflight still re-estimates and reports any larger requirement.
7. After setup finalization and reserve funding, `next` runs preflight. It rechecks exact contract bindings, finalizer funding, the live public HTTPS endpoint plus exact collector CORS/contract/network identity, duplicate CIDs, private recovery, and—only for the advanced pre-pin strategy—every public plaintext CAR.
8. The dedicated finalizer signs `arm_fulfillment`, journals the signed bytes before injection, and waits for two blocks on top. The UI shows “Preparing fulfillment” and asks for no creator signature during this step.
9. Only after finalized on-chain arming does `next` return `activate_sale`. The creator signs this final action; the already-running worker observes it and begins fulfillment.

If the browser disappears after a wallet prompt starts but before its hash is saved, Companion does not issue the action again. It searches finalized operations and the mempool for the exact intent. If the outcome remains ambiguous, it asks for the hash and keeps the project safely blocked. A wallet may leave a high-level prompt open and forge against a fresh branch much later, so elapsed protocol TTL alone can never release a hashless action. The generic wallet-rejected endpoint is valid only before the broadcast-capable send call began. Afterward, only Beacon's raw `OPERATION_REQUEST_ERROR` event containing a literal `ABORTED_ERROR`, a valid base58 remote-wallet sender id, and its request UUID/version can be recorded through `prompt-aborted`; Taquito's transformed catch error, local empty-sender aborts, and other errors stay quarantined.

For the rolling-delay release option, `claimIntervalSeconds` may add explicit FIFO pacing after each prior claim's finalized settlement. `0` means “settle as soon as eligible.” A positive interval is rejected for other release options so the creator is never shown a control that the Companion silently ignores.

The Companion can safely observe an irreversible `close_sale` and finish every already-created FIFO claim. The contract sweeps its remaining balance only after all created claims settle and either physical sellout or permanent close has occurred. `close_sale` may also permanently cancel before activation and immediately sweep when no claims exist. Closing is permanent; the UI must state that unsold slots can never be purchased afterward.

## Collector lifecycle

The public status vocabulary is intentionally simple:

1. `Purchase confirmed`
2. `Artwork secured`
3. `Publishing to IPFS`
4. `NFT ready`

`Artwork secured` is not reported at mere mempool acceptance or inclusion. It requires the inclusion block plus two blocks on top and an exact on-chain re-read. Artifact publication cannot begin before that proof. Closing the browser does not stop the durable worker.

The static package should use the secret-free manifest from:

```text
GET /v1/public/projects/{dropRef}/static-manifest
```

Purchase tracking uses the wallet operation hash:

```text
GET /v1/public/projects/{dropRef}/purchases/{operationHash}
GET /v1/public/projects/{dropRef}/claims/{claimId}
POST /v1/public/projects/{dropRef}/wake
```

The generated manifest and all public responses set `containsSecrets: false` where applicable and omit private CIDs even after allocation; collectors obtain final URIs from Tezos/IPFS.

## Admin API

Send `Authorization: Bearer <contents of secrets/admin.token>` from the local Studio or a protected same-origin server. Do not send it from the public drop.

Exact request and response shapes, including the persistent arm/activation handshake, are in `API.md`.

- `GET /v1/admin/readiness`
- `POST /v1/admin/projects`
- `GET /v1/admin/projects/{dropRef}`
- `PUT /v1/admin/projects/{dropRef}/uploads/{uploadId}` (raw request body, streamed directly into encryption)
- `POST /v1/admin/projects/{dropRef}/tokens/{tokenId}`
- `POST /v1/admin/projects/{dropRef}/public-contract-metadata`
- `POST /v1/admin/projects/{dropRef}/creator-actions/next`
- `POST /v1/admin/projects/{dropRef}/creator-actions/close`
- `POST /v1/admin/projects/{dropRef}/creator-attempts/{attemptId}/prompt-started`
- `POST /v1/admin/projects/{dropRef}/creator-attempts/{attemptId}/prompt-aborted`
- `POST /v1/admin/projects/{dropRef}/creator-attempts/{attemptId}/rejected`
- `POST /v1/admin/projects/{dropRef}/creator-attempts/{attemptId}/submitted`
- `POST /v1/admin/projects/{dropRef}/creator-attempts/{attemptId}/reconcile`
- `POST /v1/admin/projects/{dropRef}/contract`
- `POST /v1/admin/projects/{dropRef}/preflight`
- `POST /v1/admin/projects/{dropRef}/observe-activation`
- `POST /v1/admin/projects/{dropRef}/wake`

## Settlement crash safety

Before injection, the Companion estimates, forges, signs, and preapplies the exact arm or settlement operation. It encrypts the signed bytes and durably journals their SHA-256, Tezos operation hash, branch, branch level, and manager counter before asking the RPC to inject them. One finalizer is globally single-flight across every local drop, preventing two pending operations from competing for the same manager counter.

After a crash it checks the exact hash in TzKT, the mempool, canonical blocks, claim state, and FIFO cursor. It may re-inject the identical signed bytes while their branch remains live. A single RPC's rejected classification or a changed counter is not replacement authority. Only after the branch exceeds the protocol's own operation TTL and the exact hash is absent from every canonical block in its valid inclusion window may it append a linked signed attempt. That attempt keeps the same immutable claim, preimage, metadata, and allocation intent; it cannot reroll the buyer's result. Every old signed attempt remains append-only recovery evidence.

Read `BACKUP_RECOVERY.md` before opening a sale.
