# Companion API contract

The installed Studio uses the same-origin desktop routes below. Electron's main process starts and supervises Companion, reads `secrets/admin.token`, and adds the upstream Bearer header. The renderer and exported collector page never receive that token.

Direct local integrations may call `/v1/admin/*` with `Authorization: Bearer <admin token>`. Never expose those routes or that token on a public site. A remote static mint page uses only `/v1/public/*`.

## Desktop readiness and privacy boundary

`GET /api/macaroni/v35/companion/readiness` returns:

```json
{
  "schema": "wtfos.macaroni-v35-companion-readiness.v1",
  "ready": true,
  "studioApiReady": true,
  "code": "ready",
  "reason": "Local Companion safety checks and the private Studio adapter are ready.",
  "network": "shadownet",
  "assetStrategies": ["pin_on_claim", "public_prepin_private_manifest"],
  "managementUrl": "http://127.0.0.1:30771/studio.html#secure-v35-companion",
  "publicCollectorReady": false,
  "publicCollectorCode": "collector_loopback_not_exportable",
  "publicCollectorReason": "Loopback works for local setup, but a remotely hosted buyer page needs an HTTPS public Companion URL and exact HTTPS page origin.",
  "publicBaseUrl": null,
  "collectorOrigin": null,
  "localDevelopmentOnly": false
}
```

`studioApiReady` is true only after the full doctor and authenticated adapter probe pass. It intentionally remains separate from `publicCollectorReady`: the desktop default can safely stage and manage a project on loopback while launch/export remains locked. A remote page unlocks only with an HTTPS public base, the exact HTTPS collector origin in CORS, and a live status identity proof. While local setup is incomplete, `studioApiReady` is false and `assetStrategies` is empty.

Every proxied admin request, including reads, requires the exact installed Studio `Origin` and loopback `Host`. Missing or foreign origins are rejected before the main process reads or injects the admin token. Unknown methods, query-bearing paths, malformed ids, and arbitrary upstream paths are not proxied. Every response is checked again for secret keys, private CIDs/URIs, entropy preimages, metadata nonces, raw assets, encrypted paths, and signed bytes. Only the expressly public `contractMetadataUri` and `publicCoverUri` may contain `ipfs://` values.

## Exact desktop route map

All paths in the left column are relative to the Studio origin.

| Studio route | Local Companion route |
| --- | --- |
| `GET /api/macaroni/v35/companion/readiness` | main-process readiness and doctor probe |
| `POST /api/macaroni/v35/companion/projects` | `POST /v1/admin/projects` |
| `GET /api/macaroni/v35/companion/projects/{dropRef}` | `GET /v1/admin/projects/{dropRef}` |
| `PUT /api/macaroni/v35/companion/projects/{dropRef}/uploads/{uploadId}` | `PUT /v1/admin/projects/{dropRef}/uploads/{uploadId}` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/tokens/{tokenId}` | `POST /v1/admin/projects/{dropRef}/tokens/{tokenId}` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/public-contract-metadata` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/contract` | same suffix under `/v1/admin` (recovery only) |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-actions/next` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-actions/close` | same suffix under `/v1/admin` |
| `GET /api/macaroni/v35/companion/projects/{dropRef}/stuck-work` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/stuck-work/{workId}/reconcile` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/prompt-started` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/prompt-aborted` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/rejected` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/submitted` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/reconcile` | same suffix under `/v1/admin` |
| `POST /api/macaroni/v35/companion/projects/{dropRef}/{preflight\|observe-activation\|wake}` | same named `/v1/admin` action |

The protected `/contract` attachment route remains available for operator recovery, but the normal Studio flow must not use it. The planner derives the KT1 from the exact finalized origination and binds it only after checking the signer, code, storage, amount, and canonical head-minus-two snapshot.

## 1. Register the immutable project

`POST /api/macaroni/v35/companion/projects`

```json
{
  "dropRef": "4b576a3e-e443-4c6e-b9e3-97c889502cc4",
  "network": "shadownet",
  "creator": "tz1...",
  "creatorPublicKey": "edpk...",
  "administrator": "tz1...",
  "treasury": "tz1...",
  "physicalSupply": 57,
  "assetStrategy": "pin_on_claim",
  "releasePolicy": { "kind": "immediate" },
  "claimIntervalSeconds": 0,
  "fulfillmentSubsidyMutez": 151180
}
```

`creatorPublicKey` is optional only when the account is already revealed on-chain; Studio should include the connected wallet's public key when available. `releasePolicy` may also be `sellout`, `rolling_delay`, or `scheduled`:

```json
{ "kind": "sellout" }
{ "kind": "rolling_delay", "seconds": 3600 }
{ "kind": "scheduled", "at": "2026-09-03T18:00:00.000Z" }
```

`claimIntervalSeconds` is immutable. `0` means settle each eligible FIFO claim as soon as possible. A positive value is accepted only for `rolling_delay`. The reviewed manifest is authoritative for `fulfillmentSubsidyMutez`; the current evidence-backed minimum is `151180` mutez.

The response is the admin project document. Repeating registration is idempotent only when every immutable field is identical.

## 2. Upload and pin public collection metadata

Generate a fresh UUID and upload the cover bytes:

`PUT /api/macaroni/v35/companion/projects/{dropRef}/uploads/{coverUploadId}`

The body is the raw file, with its ordinary content type. The response is:

```json
{
  "schema": "pasta.macaroni-companion-upload.v1",
  "uploadId": "20000000-0000-4000-8000-000000000005",
  "state": "encrypted_private"
}
```

Then call `POST /api/macaroni/v35/companion/projects/{dropRef}/public-contract-metadata`:

```json
{
  "uploadId": "20000000-0000-4000-8000-000000000005",
  "name": "Collection name",
  "description": "Collection description",
  "homepage": "https://artist.example/drop"
}
```

`homepage` is optional. Companion creates and verifies the public cover CAR, then the canonical TZIP-16 contract-metadata CAR. This public response is the only setup response that intentionally returns CIDs:

```json
{
  "schema": "pasta.macaroni-companion-public-contract-metadata.v1",
  "contractMetadataUri": "ipfs://bafy...",
  "publicCoverUri": "ipfs://bafy...",
  "state": "pinned_verified"
}
```

## 3. Upload and stage each private token row

Use a fresh UUID and the same upload route for the raw artifact. For a non-image artifact, optionally upload separate display and thumbnail files under their own UUIDs. Then call:

`POST /api/macaroni/v35/companion/projects/{dropRef}/tokens/{tokenId}`

```json
{
  "uploadId": "artifact-upload-uuid",
  "displayUploadId": "optional-display-upload-uuid",
  "thumbnailUploadId": "optional-thumbnail-upload-uuid",
  "quantity": 3,
  "metadata": {
    "name": "Work title",
    "description": "Work description",
    "mimeType": "video/mp4"
  }
}
```

Token ids must be sequential from zero. `displayUploadId` and `thumbnailUploadId` are optional. Their final URIs are inserted into the private token metadata before its commitment is calculated. The response is secret-free:

```json
{
  "tokenId": 0,
  "quantity": 3,
  "metadataCommitment": "64-lowercase-hex-characters",
  "artifactState": "encrypted_private",
  "metadataState": "encrypted_private",
  "displayState": "encrypted_private",
  "thumbnailState": "encrypted_private"
}
```

## 4. Register the creator plan and request one action

The first `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-actions/next` includes the immutable plan:

```json
{
  "plan": {
    "contractMetadataUri": "ipfs://bafy...",
    "minterRoyalty": { "enabled": true, "bps": 1000, "mode": 0 },
    "stages": [
      {
        "stage": 0,
        "start": "2026-09-03T18:00:00.000Z",
        "priceMutez": 1000000,
        "useAllowlist": false,
        "maxPerWallet": 2
      }
    ],
    "allowlist": [
      { "stage": 1, "holder": "tz1...", "capacity": 2 }
    ]
  }
}
```

Later calls may send `{}` because the exact plan is stored durably. Companion returns only one exact action at a time. It sizes row, slot, and allowlist batches using a live RPC estimate.

```json
{
  "schema": "wtfos.macaroni-v35-next-creator-action.v1",
  "state": "awaiting_signature",
  "action": {
    "attemptId": 12,
    "setupStepId": 9,
    "step": "add_tokens_v35",
    "requestId": "v35-local:drop-ref:add_tokens_v35:uuid",
    "intentDigest": "64-lowercase-hex-characters",
    "network": "shadownet",
    "signer": "tz1...",
    "target": "KT1...",
    "entrypoint": "add_tokens_v35",
    "amountMutez": 0,
    "parameters": {
      "wallet": [{ "token_id": 0, "quantity": 3, "metadata_commitment": "..." }],
      "micheline": {},
      "routedMicheline": {}
    },
    "expectedPostcondition": {},
    "operationHash": null,
    "explanation": {
      "whatYouAreSigning": "Plain-language transaction purpose.",
      "ifYouSign": "What advances after exact finality.",
      "ifYouDoNotSign": "Why nothing is lost."
    },
    "liveEstimate": {
      "source": "live_tezos_rpc_estimate",
      "gasLimit": 0,
      "storageLimit": 0,
      "suggestedFeeMutez": 0,
      "totalCostMutez": 0,
      "opSize": 1,
      "finalOperationSizeBytes": 32768,
      "protocolOperationDataLimitBytes": 32768,
      "paddedLimits": { "gasLimit": 40002, "storageLimit": 120, "fee": 5922 }
    },
    "chunk": { "batchIndex": 0, "finalBatch": true, "rows": 1 }
  }
}
```

`opSize` is always positive. `finalOperationSizeBytes` is the exact RPC-forged operation-group size, including its curve-appropriate signature, using the same padded fee/gas/storage limits Studio will submit. It must be at or below the manifest's `protocolOperationDataLimitBytes`; larger row/slot/allowlist sets are split into more actions. `chunk` is `null` for non-batched actions. For `originate_contract`, `target` is `null`, `entrypoint` is `origination`, and `parameters` contains the reviewed `code` and encoded `storage`. Submit those as Taquito `{ code, init: parameters.storage }`, never as `{ code, storage: ... }`. For `reveal_creator_key`, send the exact one-mutez self-transfer. For contract calls, use the supplied target, amount, entrypoint, and `parameters.micheline`; do not reconstruct parameters in the browser.

Possible non-action states include `blocked`, `waiting_for_companion_fulfillment_arm`, `wallet_outcome_required`, `reconcile`, `expired_safe_to_retry`, and `complete`. Show `blocker` verbatim and do not ask for a wallet signature unless state is `awaiting_signature`.

## 5. Record the wallet outcome and reconcile

If the creator declines on Studio's review screen before any wallet prompt begins:

`POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/rejected`

```json
{ "reason": "User canceled before send", "confirmNoBroadcast": true }
```

Immediately before invoking the wallet's broadcast-capable `.send()` call, durably mark that boundary:

`POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/prompt-started`

```json
{ "requestId": "v35-local:drop-ref:add_tokens_v35:uuid" }
```

The response repeats the immutable action and adds:

```json
{ "state": "wallet_outcome_required", "proceedToWalletSend": true, "promptStartedHeadLevel": 123456 }
```

Only call `.send()` when `proceedToWalletSend` is true. Never use the generic `rejected` route from a `.send()` error handler. A high-level wallet request can remain open and later forge against a fresh Tezos branch, so elapsed protocol TTL does **not** make a hashless prompted action safe to retry.

One narrow remote-wallet response can safely close the prompt: Studio must capture Beacon's raw `OPERATION_REQUEST_ERROR` event before Taquito transforms it into a catch exception. Its `errorResponse` must be a literal `ABORTED_ERROR`, include a non-empty remote-wallet `senderId`, and include its Beacon request id and version. Record only that raw event at:

`POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/prompt-aborted`

```json
{
  "requestId": "v35-local:drop-ref:add_tokens_v35:uuid",
  "beaconEvent": "OPERATION_REQUEST_ERROR",
  "beaconErrorResponse": {
    "type": "error",
    "errorType": "ABORTED_ERROR",
    "senderId": "base58 remote wallet sender id",
    "id": "Beacon response request UUID",
    "version": "2"
  }
}
```

Companion binds and hashes the raw response identity in its append-only attempt journal, then permits the identical intent to retry. A transformed/catch-only `AbortedBeaconError`, an empty-sender local disconnect abort, a stale action request, `PEER_UNREACHABLE`, `BROADCAST_ERROR`, and every other ambiguous error remain quarantined. If `.send()` returned an operation hash:

`POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/submitted`

```json
{ "operationHash": "o..." }
```

Then poll `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-attempts/{attemptId}/reconcile` with `{}`. Companion does not advance until two blocks sit on top of an exact canonical applied operation and the expected on-chain result matches. It derives the originated KT1 from that finalized operation; the renderer must not send a KT1.

If the renderer dies immediately after `.send()` starts, requesting `next` does not issue another operation. Companion searches finalized operations and the mempool for the exact intent. If it cannot prove the outcome, it returns `wallet_outcome_required` and asks for the hash. A hashless prompted action stays quarantined indefinitely because the still-open wallet may forge later. Protocol-TTL retry is available only when an exact submitted hash or signed operation fixes its branch/counter and complete canonical absence can be proven.

## 6. Fulfillment arm, activation, and permanent close

After setup finalization and reserve funding, `next` proves the exact public HTTPS status URL, contract/network identity, and collector CORS origin before it starts Companion preflight and returns `waiting_for_companion_fulfillment_arm`. No creator signature is needed while the dedicated finalizer performs the durable `arm_fulfillment` handshake. Continue calling `next`; only after the finalized on-chain arm and a fresh public-endpoint proof will it return the exact `activate_sale` action.

Permanent close is server-authored and independent of the saved plan. Call `POST /api/macaroni/v35/companion/projects/{dropRef}/creator-actions/close` with `{}`. Before origination this abandons the local draft. After origination it returns an exact `close_sale` wallet action through the same attempt/submission/reconciliation flow. Closing is irreversible; existing claims still settle and the contract sweeps only after all created claims are settled.

## 7. Operator inspection and stuck-work reconciliation

Parked fulfillment work items and claims in `manual_review` can be inspected and safely reconciled by the operator without editing SQLite.

### Inspect parked work

`GET /api/macaroni/v35/companion/projects/{dropRef}/stuck-work` returns:

```json
{
  "dropRef": "uuid",
  "stuckItems": [
    {
      "id": 1,
      "dropRef": "uuid",
      "claimRef": 0,
      "workType": "settle_claim",
      "state": "manual_review",
      "lastError": "Persisted signed operation cannot proceed safely: ...",
      "payload": { "claimId": 0 },
      "createdAt": 1729000000000,
      "updatedAt": 1729000010000,
      "operation": {
        "journalId": 1,
        "journalState": "failed",
        "attemptNumber": 1,
        "operationHash": "o...",
        "attemptState": "failed",
        "injectedAt": 1729000005000,
        "reconciliation": { "reason": "..." }
      },
      "claim": {
        "claimId": 0,
        "state": "attention_required",
        "buyer": "tz1...",
        "recipient": "tz1...",
        "settlementOperationHash": null,
        "lastError": "..."
      }
    }
  ]
}
```

### Reconcile parked work

`POST /api/macaroni/v35/companion/projects/{dropRef}/stuck-work/{workId}/reconcile`

Safely reconciles a parked work item against on-chain reality without deleting history:
- If the signed operation is verified as applied on-chain (`chain_included`), the work item is completed and CAR publication is queued.
- If the signed operation is proven absent from canonical blocks after protocol branch TTL expiry (`safe_to_replace_expired`), the old attempt is expired with absence evidence and the work item is requeued for a fresh signed attempt with identical allocation intent.
- If the operation is still within its branch TTL window or present in the mempool, reconciliation refuses to retry prematurely and returns `awaiting_finality_or_ttl`.
- If the operation was never signed, the work item is safely requeued.

## Admin project document

`GET /api/macaroni/v35/companion/projects/{dropRef}` returns the immutable setup, public entropy head, finalizer address, lifecycle, duplicate audit, public contract metadata, creator-setup summary, and token publication states. Important integration fields are:

```json
{
  "schema": "pasta.macaroni-companion-project.v1",
  "dropRef": "uuid",
  "state": "armed",
  "contract": "KT1...",
  "publicContractMetadata": {
    "state": "pinned_verified",
    "contractMetadataUri": "ipfs://bafy...",
    "publicCoverUri": "ipfs://bafy..."
  },
  "creatorSetup": {
    "planRegistered": true,
    "activeAttempt": { "attemptId": 12, "state": "awaiting_signature", "operationHash": null },
    "completedSteps": ["stage_private_assets"]
  },
  "collectorPublishing": {
    "ready": true,
    "code": "collector_public_configuration_ready",
    "reason": "Public endpoint and exact collector CORS origin are configured; launch still requires a live identity probe.",
    "publicBaseUrl": "https://companion.example",
    "collectorOrigin": "https://artist.example",
    "localDevelopmentOnly": false
  },
  "publicStatusUrl": "https://companion.example/v1/public/projects/uuid/status",
  "publicStaticManifestUrl": "https://companion.example/v1/public/projects/uuid/static-manifest",
  "claimStatusUrlTemplate": "https://companion.example/v1/public/projects/uuid/claims/{claimId}",
  "purchaseStatusUrlTemplate": "https://companion.example/v1/public/projects/uuid/purchases/{operationHash}",
  "wakeUrl": "https://companion.example/v1/public/projects/uuid/wake"
}
```

No private CID, nonce, preimage, raw upload, file path, credential, or signed bytes appears in this document.

## Public static-page contract

The exported page fetches the direct public URL returned as `publicStaticManifestUrl`. Companion returns this URL only after preflight has armed the project. The manifest request itself repeats the live HTTPS/CORS/contract/network identity probe and fails closed if the buyer endpoint is unavailable or mismatched:

`GET /v1/public/projects/{dropRef}/static-manifest`

```json
{
  "schema": "pasta.macaroni-service.v1",
  "mode": "creator_companion",
  "network": "shadownet",
  "contract": "KT1...",
  "contractMetadataUri": "ipfs://bafy...",
  "publicCoverUri": "ipfs://bafy...",
  "status": "armed",
  "statusSource": "tezos_chain_and_companion",
  "statusUrl": "https://companion.example/v1/public/projects/uuid/status",
  "claimStatusUrlTemplate": "https://companion.example/v1/public/projects/uuid/claims/{claimId}",
  "purchaseStatusUrlTemplate": "https://companion.example/v1/public/projects/uuid/purchases/{operationHash}",
  "wakeUrl": "https://companion.example/v1/public/projects/uuid/wake",
  "containsSecrets": false
}
```

Other public routes are:

- `GET /v1/public/projects/{dropRef}/status`
- `GET /v1/public/projects/{dropRef}/claims/{claimId}`
- `GET /v1/public/projects/{dropRef}/purchases/{operationHash}`
- `POST /v1/public/projects/{dropRef}/wake`

The purchase endpoint reports confirmation only after two blocks sit on top of the exact applied purchase and its TzKT claim event is present. Public documents never expose private custody material.

All errors are JSON `{ "error": "stable_code", "message": "plain-language explanation" }`. A `409` means a lifecycle step is out of order or conflicts with immutable state. A `503` means launch remains fail-closed because a required external proof is unavailable.
