import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMacaroniV35Capabilities,
  managedMacaroniRuntimeReadiness,
  publicMacaroniV35DropStatus,
} from "./v35-types";
import {
  creatorPendingOperationMatchesAttempt,
  macaroniV35LargestAcceptedBatch,
  macaroniV35CreatorDroppedOperationCanRetry,
  macaroniV35OperationSizeWithinProtocolLimit,
  macaroniV35RemoteWalletAbortCanTerminalize,
  macaroniV35SignedOperationBytes,
  macaroniV35StudioPaddedLimits,
} from "./v35-service";
import { sanitizeMacaroniConfigForPublish } from "./publish";
import {
  assertUniqueManagedMacaroniV35ArtifactRows,
  buildPublishedMacaroniV35CidCandidates,
  decryptMacaroniV35PrivatePayload,
  encryptMacaroniV35PrivatePayload,
  verifyPublishedMacaroniV35Cid,
} from "./v35-managed-assets";

test("managed CAR availability verification uses FileShip before independent gateways", () => {
  const candidates = buildPublishedMacaroniV35CidCandidates("bafybeigdyrztfixturecid", "");
  assert.equal(candidates[0], "https://ipfs.fileship.xyz/bafybeigdyrztfixturecid");
  assert.equal(candidates.at(-1), "https://ipfs.io/ipfs/bafybeigdyrztfixturecid");
});

test("managed CAR availability verification recovers after a FileShip response failure", async () => {
  const priorGateway = process.env.MACARONI_V35_IPFS_GATEWAY;
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  process.env.MACARONI_V35_IPFS_GATEWAY = "https://ipfs.fileship.xyz";
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requested.push(url);
    if (requested.length === 1) return new Response(null, { status: 504 });
    return new Response(Uint8Array.from([0]), { status: 206 });
  }) as typeof fetch;
  try {
    assert.equal(await verifyPublishedMacaroniV35Cid("bafybeigdyrztfixturecid"), true);
    assert.deepEqual(requested, [
      "https://ipfs.fileship.xyz/bafybeigdyrztfixturecid",
      "https://nftstorage.link/ipfs/bafybeigdyrztfixturecid",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorGateway == null) delete process.env.MACARONI_V35_IPFS_GATEWAY;
    else process.env.MACARONI_V35_IPFS_GATEWAY = priorGateway;
  }
});
import {
  macaroniV35SignedBranchIsIrreversiblyExpired,
  macaroniV35ClosedArmDisposition,
  pendingMacaroniV35OperationContainsHash,
} from "./v35-managed-worker";

const [schema, migration, worker, service, managedAssets, routes, corsOrigins] = await Promise.all([
  readFile(new URL("../../../shared/schema-macaroni.ts", import.meta.url), "utf8"),
  readFile(new URL("../../../drizzle/0126_macaroni_v35_infrastructure.sql", import.meta.url), "utf8"),
  readFile(new URL("./v35-managed-worker.ts", import.meta.url), "utf8"),
  readFile(new URL("./v35-service.ts", import.meta.url), "utf8"),
  readFile(new URL("./v35-managed-assets.ts", import.meta.url), "utf8"),
  readFile(new URL("../../routes/macaroni.ts", import.meta.url), "utf8"),
  readFile(new URL("../../lib/cors-origins.ts", import.meta.url), "utf8"),
]);

test("managed denial gives exact role remediation and a self-host alternative", () => {
  const denied = buildMacaroniV35Capabilities({ authenticated: true, allowed: false, roles: ["User"] });
  assert.equal(denied.managed.requiredPermission, "use_managed_macaroni");
  assert.equal(denied.managed.denial?.adminInboxPath, "/admin-inbox");
  assert.match(denied.managed.denial?.requestText || "", /Managed Macaroni/);
  assert.equal(denied.selfHostedAlternative.available, true);
});

test("capabilities publish the measured funding policy even while runtime fulfillment is unavailable", () => {
  const capability = buildMacaroniV35Capabilities({ authenticated: true, allowed: true });
  assert.equal(capability.managed.fundingPolicy.ready, true);
  if (!("fulfillmentSubsidyMutez" in capability.managed.fundingPolicy)) return;
  assert.equal(capability.managed.fundingPolicy.fulfillmentSubsidyMutez, 151_180);
  assert.equal(capability.managed.fundingPolicy.initialContractReserveMutez, 755_900);
  assert.equal(capability.managed.fundingPolicy.finalizerLiquidStartupFloorMutez, 756_263);
  assert.equal(capability.managed.fundingPolicy.initialReserveClaims, 5);
  assert.match(capability.managed.fundingPolicy.evidence, /macaroni-v35-shadownet-costs\.json$/);
});

test("managed runtime stays fail-closed when production worker configuration is absent", () => {
  const prior = process.env.MACARONI_V35_WORKER_INTERVAL_MS;
  delete process.env.MACARONI_V35_WORKER_INTERVAL_MS;
  try {
    const readiness = managedMacaroniRuntimeReadiness("mainnet");
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, "fulfillment_pipeline_unavailable");
  } finally {
    if (prior == null) delete process.env.MACARONI_V35_WORKER_INTERVAL_MS;
    else process.env.MACARONI_V35_WORKER_INTERVAL_MS = prior;
  }
});

test("managed capabilities report readiness for the creator's selected network", () => {
  const names = [
    "MACARONI_V35_WORKER_INTERVAL_MS",
    "MACARONI_V35_WORKER_LEASE_MS",
    "MACARONI_V35_INDEX_MIN_CONFIRMATIONS",
    "MACARONI_V35_ASSET_KEYRING_JSON",
    "MACARONI_V35_ASSET_ACTIVE_KEY_VERSION",
    "MACARONI_V35_ENTROPY_KEYRING_JSON",
    "MACARONI_V35_ENTROPY_ACTIVE_KEY_VERSION",
    "MACARONI_V35_RECOVERY_KEYRING_JSON",
    "MACARONI_V35_RECOVERY_ACTIVE_KEY_VERSION",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "MACARONI_V35_PINATA_JWT",
    "MACARONI_V35_IPFS_GATEWAY",
    "MACARONI_V35_FINALIZER_MAINNET_SECRET_KEY",
    "MACARONI_V35_FINALIZER_SHADOWNET_SECRET_KEY",
    "MACARONI_V35_TRUSTED_MAINNET_RPC_URL",
    "MACARONI_V35_TRUSTED_SHADOWNET_RPC_URL",
  ] as const;
  const prior = new Map(names.map((name) => [name, process.env[name]]));
  try {
    const keyring = JSON.stringify({ alpha: "a".repeat(64) });
    Object.assign(process.env, {
      MACARONI_V35_WORKER_INTERVAL_MS: "6000",
      MACARONI_V35_WORKER_LEASE_MS: "732000",
      MACARONI_V35_INDEX_MIN_CONFIRMATIONS: "2",
      MACARONI_V35_ASSET_KEYRING_JSON: keyring,
      MACARONI_V35_ASSET_ACTIVE_KEY_VERSION: "alpha",
      MACARONI_V35_ENTROPY_KEYRING_JSON: keyring,
      MACARONI_V35_ENTROPY_ACTIVE_KEY_VERSION: "alpha",
      MACARONI_V35_RECOVERY_KEYRING_JSON: keyring,
      MACARONI_V35_RECOVERY_ACTIVE_KEY_VERSION: "alpha",
      S3_ENDPOINT: "https://storage.example.test",
      S3_BUCKET: "private-assets",
      S3_ACCESS_KEY_ID: "access",
      S3_SECRET_ACCESS_KEY: "secret",
      MACARONI_V35_PINATA_JWT: "pinata-test-jwt",
      MACARONI_V35_IPFS_GATEWAY: "https://gateway.example.test/ipfs/",
      MACARONI_V35_FINALIZER_SHADOWNET_SECRET_KEY: "encrypted-test-secret",
      MACARONI_V35_TRUSTED_SHADOWNET_RPC_URL: "https://tezos-shadownet.octez.io/",
    });
    delete process.env.MACARONI_V35_FINALIZER_MAINNET_SECRET_KEY;
    delete process.env.MACARONI_V35_TRUSTED_MAINNET_RPC_URL;
    const shadownet = buildMacaroniV35Capabilities({
      authenticated: true,
      allowed: true,
      network: "shadownet",
    });
    const mainnet = buildMacaroniV35Capabilities({
      authenticated: true,
      allowed: true,
      network: "mainnet",
    });
    assert.equal(shadownet.network, "shadownet");
    assert.equal(shadownet.managed.service.ready, true);
    assert.equal(mainnet.network, "mainnet");
    assert.equal(mainnet.managed.service.ready, false);
  } finally {
    for (const name of names) {
      const value = prior.get(name);
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("a persisted ready drop becomes publicly unavailable when its live network runtime disappears", () => {
  const priorInterval = process.env.MACARONI_V35_WORKER_INTERVAL_MS;
  const priorUploadToken = process.env.MACARONI_V35_CAR_UPLOAD_TOKEN;
  const secretMarker = "must-not-appear-in-public-status";
  delete process.env.MACARONI_V35_WORKER_INTERVAL_MS;
  process.env.MACARONI_V35_CAR_UPLOAD_TOKEN = secretMarker;
  try {
    const status = publicMacaroniV35DropStatus({
      network: "shadownet",
      contract: "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG",
      provider: "wtfos_managed",
      assetStrategy: "pin_on_claim",
      fulfillmentTrigger: "on_purchase",
      claimDelaySeconds: 0,
      claimIntervalSeconds: 0,
      fulfillmentScheduledAt: null,
      status: "active",
      serviceReady: true,
      publicStatus: { state: "active", message: "Automatic fulfillment is ready." },
      contractReserveRequiredMutez: 755_900,
      contractReserveObservedMutez: 755_900,
      operatorGasObservedMutez: 756_263,
      operatorGasReady: true,
      finalFulfillmentAt: null,
      salePermanentlyClosedAt: null,
      finalSweepOperationHash: null,
    });
    assert.equal(status.serviceReady, false);
    assert.equal(status.serviceBlocker?.code, "fulfillment_pipeline_unavailable");
    const serialized = JSON.stringify(status);
    assert.doesNotMatch(serialized, new RegExp(secretMarker));
    assert.doesNotMatch(serialized, /secret.?key|api.?key|credential|preimage|nonce/i);
    const wake = service.slice(
      service.indexOf("export async function wakePublicMacaroniV35Drop"),
      service.indexOf("export async function", service.indexOf("export async function wakePublicMacaroniV35Drop") + 1)
    );
    assert.match(wake, /const status = publicMacaroniV35DropStatus\(drop\)/);
    assert.match(wake, /if \(!status\.serviceReady\)/);
  } finally {
    if (priorInterval == null) delete process.env.MACARONI_V35_WORKER_INTERVAL_MS;
    else process.env.MACARONI_V35_WORKER_INTERVAL_MS = priorInterval;
    if (priorUploadToken == null) delete process.env.MACARONI_V35_CAR_UPLOAD_TOKEN;
    else process.env.MACARONI_V35_CAR_UPLOAD_TOKEN = priorUploadToken;
  }
});

test("forward schema keeps pre-origination setup nullable and durable secrets recoverable but private", () => {
  assert.match(schema, /contract: varchar\("contract"[^\n]*\),/);
  assert.match(migration, /encrypted_entropy_recovery_ref text/);
  assert.match(migration, /entropy_recovery_key_version varchar\(80\)/);
  assert.match(migration, /encrypted_signed_bytes text/);
  assert.match(migration, /administrator_public_key varchar\(128\) NOT NULL/);
  assert.match(migration, /signed operation bytes cannot be replaced/);
  assert.match(migration, /signed_operation_branch varchar\(51\)/);
  assert.match(migration, /retry_of_attempt_id integer REFERENCES/);
  assert.match(migration, /purchase_event_id bigint NOT NULL/);
  assert.match(migration, /WHERE kind IN \('artifact', 'metadata'\)/);
  assert.doesNotMatch(migration, /WHERE kind IN \('artifact', 'metadata', 'display'/);
  assert.match(migration, /macaroni_v35_operator_inflight_unique_idx/);
  assert.match(migration, /macaroni_v35_wallet_abort_response_unique_idx/);
  assert.match(migration, /wallet response identity cannot be replaced/);
  assert.match(migration, /'closed'/);
});

test("managed worker binds exact purchase events and mints before publishing committed CARs", () => {
  assert.match(worker, /tag:\s*"purchase_claim"/);
  assert.match(worker, /purchaseOperationHash:\s*transaction\.hash/);
  assert.match(worker, /parameterDigest/);
  const persist = worker.indexOf("persistMacaroniV35PreparedSignedOperation");
  const inject = worker.indexOf("toolkit.rpc.injectOperation", persist);
  assert.ok(persist >= 0 && inject > persist, "encrypted signed bytes and operation hash must persist before injection");
  assert.match(worker, /Private CAR publishing is forbidden until the final NFT settlement is applied/);
  assert.match(service, /recheckManagedMacaroniV35IndexedDuplicates/);
  assert.match(service, /append_token_slots_v35/);
  assert.match(worker, /arm_fulfillment/);
  assert.match(worker, /assertFinalizedInventoryMatchesPrivateStaging/);
  assert.match(worker, /storage\.token_commitments\.get\(tokenId\)/);
  assert.match(worker, /openExpiredWorkerReplacement/);
  assert.match(worker, /replaceExpiredMacaroniV35WorkerAttempt/);
  assert.match(worker, /terminalizeArmAfterPermanentClose/);
  assert.match(worker, /Signed fulfillment arm remains ambiguous after permanent close until its branch irreversibly expires/);
  assert.match(worker, /Sellout and permanent-close are reveal gates/);
  assert.match(worker, /state: exactApplied \? "applied" : ambiguous \? "manual_review" : "cancelled"/);
  assert.match(worker, /MACARONI_V35_TRUSTED_MAINNET_RPC_URL/);
  assert.match(worker, /finalSweepComplete/);
  assert.doesNotMatch(worker, /fulfilled === drop\.physicalSupply/);
  assert.doesNotMatch(managedAssets, /metadata\.artifactUri\.eq=/);
  assert.match(managedAssets, /Private inventory is frozen once contract origination is attached/);
  assert.match(managedAssets, /input\.tokenId !== existingInventory\.length/);
  assert.match(managedAssets, /stagedSupply \+ input\.quantity > drop\.physicalSupply/);
});

test("private duplicate checks reject identical artifacts on different token rows", () => {
  assert.throws(() => assertUniqueManagedMacaroniV35ArtifactRows([
    { tokenId: 0, artifactCid: "bafy-artifact", checksumSha256: "a".repeat(64) },
    // A different metadata document is intentionally irrelevant: editions
    // belong on row zero's quantity rather than a duplicate artifact row.
    { tokenId: 1, artifactCid: "bafy-artifact", checksumSha256: "a".repeat(64) },
  ]), /use one token row and increase its quantity/);
  assert.doesNotThrow(() => assertUniqueManagedMacaroniV35ArtifactRows([
    { tokenId: 0, artifactCid: "bafy-artifact-a", checksumSha256: "a".repeat(64) },
    { tokenId: 1, artifactCid: "bafy-artifact-b", checksumSha256: "b".repeat(64) },
  ]));
});

test("secure-default capability copy discloses the unavoidable settlement mempool boundary", () => {
  const capability = buildMacaroniV35Capabilities({ authenticated: true, allowed: true });
  assert.match(capability.assetStrategies.pin_on_claim.copymintWindow, /trusted RPC and Tezos mempool/);
  assert.doesNotMatch(capability.assetStrategies.pin_on_claim.copymintWindow, /^No pre-mint public CID window/);
});

test("signed manager operations can only be replaced past protocol TTL and outside every mempool class", () => {
  const operationHash = `o${"1".repeat(50)}`;
  assert.equal(pendingMacaroniV35OperationContainsHash({
    validated: [{ hash: operationHash }],
  }, operationHash), true);
  assert.equal(pendingMacaroniV35OperationContainsHash({
    validated: [], refused: [], outdated: [], branch_refused: [], branch_delayed: [], unprocessed: [],
  }, operationHash), false);
  assert.equal(macaroniV35SignedBranchIsIrreversiblyExpired({
    signedBranchLevel: 100,
    protocolMaxOperationsTtl: 120,
    confirmations: 2,
    rpcHeadLevel: 222,
    indexedHeadLevel: 223,
  }), false, "the exact TTL/finality boundary remains ambiguous");
  assert.equal(macaroniV35SignedBranchIsIrreversiblyExpired({
    signedBranchLevel: 100,
    protocolMaxOperationsTtl: 120,
    confirmations: 2,
    rpcHeadLevel: 223,
    indexedHeadLevel: 223,
  }), true);
});

test("dropped creator wallet operations cannot retry early and become append-only retries after proven expiry", () => {
  const base = {
    presentInIndexer: false,
    allRpcMempoolsObserved: true,
    presentInAnyMempool: false,
    signedBranchLevel: 100,
    submissionHeadLevel: 101,
    protocolMaxOperationsTtl: 120,
    confirmations: 2,
    rpcHeadLevels: [223, 224, 225],
    indexedHeadLevel: 223,
    exactPostconditionStillPending: true,
  };
  assert.equal(macaroniV35CreatorDroppedOperationCanRetry({
    ...base,
    rpcHeadLevels: [222, 224, 225],
  }), false, "the exact TTL/finality boundary is still ambiguous on one RPC");
  assert.equal(macaroniV35CreatorDroppedOperationCanRetry({
    ...base,
    presentInAnyMempool: true,
  }), false, "any RPC mempool observation prohibits a second signature");
  assert.equal(macaroniV35CreatorDroppedOperationCanRetry(base), true);
  assert.equal(macaroniV35CreatorDroppedOperationCanRetry({
    ...base,
    signedBranchLevel: null,
    submissionHeadLevel: 100,
    rpcHeadLevels: [10_000, 10_000],
    indexedHeadLevel: 10_000,
  }), false, "a hashless Beacon prompt can forge later and never expires from its delivery head");
  assert.match(migration, /submission_head_level integer/);
  assert.match(migration, /submission head level cannot be replaced/);
  assert.match(service, /exactEquivalentFinalizedOperationAbsent:\s*true/);
  assert.match(service, /retryOfAttemptId:\s*retry\?\.id/);
  assert.match(service, /operation_hash_recovery_required/);
  assert.match(service, /findPendingEquivalentCreatorSubmission/);
  const hashlessPromptRecovery = service.slice(
    service.indexOf('if (active.state === "wallet_prompt_started"'),
    service.indexOf("return creatorActionResponse(\n      active", service.indexOf('if (active.state === "wallet_prompt_started"'))
  );
  assert.doesNotMatch(hashlessPromptRecovery, /macaroniV35CreatorDroppedOperationCanRetry/);
  assert.match(hashlessPromptRecovery, /open Beacon prompt can forge against a fresh branch later/);
});

test("crash-after-wallet-send recovery recognizes exact origination, slot, and reserve operations", () => {
  const signer = "tz1burnburnburnburnburnburnburjAYjjX";
  const target = "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG";
  const code = [{ prim: "parameter", args: [{ prim: "unit" }] }];
  const storage = { prim: "Unit" };
  assert.equal(creatorPendingOperationMatchesAttempt({
    hash: `o${"1".repeat(50)}`,
    contents: [{ kind: "origination", source: signer, counter: "1", balance: "0", script: { code, storage } }],
  }, {
    signer,
    entrypoint: "origination",
    amountMutez: 0,
    parameters: { code, storage },
  } as never), true);
  const slots = [{ prim: "Pair", args: [{ int: "0" }, { int: "2" }] }];
  assert.equal(creatorPendingOperationMatchesAttempt({
    hash: `o${"2".repeat(50)}`,
    contents: [{
      kind: "transaction", source: signer, counter: "2", destination: target, amount: "0",
      parameters: { entrypoint: "append_token_slots_v35", value: slots },
    }],
  }, {
    signer,
    target,
    intent: "append_token_slots_v35",
    entrypoint: "append_token_slots_v35",
    amountMutez: 0,
    parameters: { micheline: slots },
  } as never), true);
  const unit = { prim: "Unit" };
  assert.equal(creatorPendingOperationMatchesAttempt({
    hash: `o${"3".repeat(50)}`,
    contents: [{
      kind: "transaction", source: signer, counter: "3", destination: target, amount: "755900",
      parameters: { entrypoint: "fund_fulfillment_reserve", value: unit },
    }],
  }, {
    signer,
    target,
    intent: "fund_fulfillment_reserve",
    entrypoint: "fund_fulfillment_reserve",
    amountMutez: 755_900,
    parameters: { micheline: unit },
  } as never), true);
});

test("permanent close never releases a still-valid signed arm counter", () => {
  assert.equal(macaroniV35ClosedArmDisposition({
    hasSignedOperation: true,
    exactApplied: false,
    fulfillmentWasArmed: false,
    signedOperationIrrecoverablyAbsent: false,
  }), "hold_single_flight");
  assert.equal(macaroniV35ClosedArmDisposition({
    hasSignedOperation: true,
    exactApplied: false,
    fulfillmentWasArmed: false,
    signedOperationIrrecoverablyAbsent: true,
  }), "cancelled");
  assert.equal(macaroniV35ClosedArmDisposition({
    hasSignedOperation: false,
    exactApplied: false,
    fulfillmentWasArmed: false,
    signedOperationIrrecoverablyAbsent: false,
  }), "cancelled");
});

test("managed finality policy never accepts fewer than two successor blocks", () => {
  assert.match(service, /configured < 2/);
  assert.match(worker, /configured != null && configured >= 2/);
  assert.match(service, /Tenderbake deterministic finality/);
});

test("creator attempt APIs are authenticated, resumable, and public status/wake are credential-free CORS", () => {
  assert.match(routes, /drops\/:dropId\/next-action/);
  assert.match(routes, /drops\/:dropId\/attempts/);
  assert.match(routes, /attempts\/:attemptId\/wallet-prompt-started/);
  assert.match(routes, /attempts\/:attemptId\/wallet-prompt-aborted/);
  assert.match(routes, /raw, identified remote Beacon ABORTED_ERROR response is required/);
  assert.match(routes, /attempts\/:attemptId\/wallet-rejected/);
  assert.match(routes, /attempts\/:attemptId\/submitted/);
  assert.match(routes, /attempts\/:attemptId\/reconcile/);
  const macaroniCors = corsOrigins.slice(
    corsOrigins.indexOf("function shouldAllowMacaroniPublicOrigin"),
    corsOrigins.indexOf("/** Shared by the app")
  );
  assert.match(macaroniCors, /v35\\\/\(\?:status\|wake\)/);
  assert.doesNotMatch(macaroniCors, /v35\\\/drops/);
  assert.match(corsOrigins, /return callback\(null, \{ origin: true, credentials: false \}\)/);
  assert.match(service, /state:\s*"wallet_prompt_started"/);
  assert.match(service, /exact pre-send review attempt can be cancelled/);
  assert.match(service, /confirmNoBroadcast:\s*input\.confirmNoBroadcast/);
  assert.match(service, /Persist the wallet-prompt-started boundary before submitting/);
  assert.match(service, /beacon_operation_request_error_event/);
});

test("only an identified remote Beacon abort releases a started hashless wallet prompt", () => {
  const exact = {
    state: "wallet_prompt_started",
    expectedRequestId: "setup:42",
    requestId: "setup:42",
    operationHash: null,
    walletErrorType: "ABORTED_ERROR",
    walletResponseId: "12345678-1234-4abc-8def-1234567890ab",
    walletSenderId: "3jEA7K7vMp8HD",
  };
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize(exact), true);
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, walletSenderId: "" }), false,
    "Beacon's locally fabricated empty-sender ABORTED_ERROR remains quarantined");
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, walletErrorType: "BROADCAST_ERROR" }), false);
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, walletErrorType: "PEER_UNREACHABLE" }), false);
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, requestId: "stale:41" }), false);
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, state: "awaiting_signature" }), false);
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, operationHash: "opKnown" }), false);
  assert.equal(macaroniV35RemoteWalletAbortCanTerminalize({ ...exact, walletResponseId: "catch-only-error" }), false,
    "Taquito's catch-only AbortedBeaconError has no raw Beacon response identity");
});

test("creator signing intents and setup batches are authored and live-estimated by the server", () => {
  assert.match(service, /getNextManagedMacaroniV35CreatorAction/);
  assert.match(service, /allCreatorSetupCallsDerivedServerSide:\s*true/);
  assert.match(service, /largestLiveEstimatedPrefix/);
  assert.match(service, /largestLiveEstimatedSlotBatch/);
  assert.match(service, /toolkit\.estimate\.transfer/);
  const originateEstimateStart = service.indexOf("const estimate = await toolkit.estimate.originate");
  const originateEstimateEnd = service.indexOf("\n  });", originateEstimateStart) + "\n  });".length;
  const originateEstimate = service.slice(
    originateEstimateStart,
    originateEstimateEnd
  );
  assert.match(originateEstimate, /init:\s*origination\.storage/);
  assert.doesNotMatch(originateEstimate, /\bstorage:\s*origination\.storage/);
  assert.match(service, /let operationSize = estimateNumber\(input\.estimate\.opSize/);
  assert.match(service, /target:\s*attempt\.target/);
  assert.match(service, /expectedPostcondition:\s*attempt\.expectedPostcondition/);
  assert.match(routes, /requirePermission\("trusted_market_creator",\s*"use_managed_macaroni"\)/);
  assert.match(routes, /server_authoritative_next_action_required/);
  assert.match(service, /requestPermanentClose/);
  assert.match(service, /stepKey:\s*"close_sale"/);
});

test("server batch sizing rejects the first byte beyond the manifest operation limit", async () => {
  assert.equal(macaroniV35OperationSizeWithinProtocolLimit(32_768, 32_768), true);
  assert.equal(macaroniV35OperationSizeWithinProtocolLimit(32_769, 32_768), false);
  assert.deepEqual(macaroniV35StudioPaddedLimits({
    opSize: 1_800,
    gasLimit: 100_000,
    storageLimit: 1_000,
    suggestedFeeMutez: 2_000,
  }), {
    gasLimit: 205_000,
    storageLimit: 1_620,
    feeMutez: 27_880,
  });
  const tz4Source = `tz4${"1".repeat(33)}`;
  const tz1Source = `tz1${"1".repeat(33)}`;
  assert.equal(macaroniV35SignedOperationBytes(32_672, tz4Source), 32_768);
  assert.equal(macaroniV35SignedOperationBytes(32_673, tz4Source), 32_769);
  assert.equal(macaroniV35SignedOperationBytes(32_672, tz1Source), 32_736);
  assert.equal(macaroniV35OperationSizeWithinProtocolLimit(
    macaroniV35SignedOperationBytes(32_672, tz4Source),
    32_768
  ), true);
  assert.equal(macaroniV35OperationSizeWithinProtocolLimit(
    macaroniV35SignedOperationBytes(32_673, tz4Source),
    32_768
  ), false);
  const allRows = Array.from({ length: 1_000 }, (_, index) => index);
  const batches: number[][] = [];
  let remaining = allRows;
  while (remaining.length) {
    const selected = await macaroniV35LargestAcceptedBatch({
      maximumUnits: remaining.length,
      build: (units) => remaining.slice(0, units),
      evaluate: async (rows) => {
        const exactFinalForgedBytes = 512 + rows.length * 137;
        if (!macaroniV35OperationSizeWithinProtocolLimit(exactFinalForgedBytes, 32_768)) {
          throw new Error("exact final forged operation is too large");
        }
        return exactFinalForgedBytes;
      },
    });
    assert.ok(selected.result <= 32_768);
    batches.push(selected.candidate);
    remaining = remaining.slice(selected.units);
  }
  assert.equal(batches[0]?.length, 235);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat(), allRows);
  assert.match(service, /protocolOperationDataLimitBytes/);
  assert.match(service, /Final forged operation is \$\{opSize\} bytes/);
  assert.match(service, /exactStudioPaddedOperationSize/);
  assert.match(service, /new LocalForger/);
  assert.match(service, /macaroniV35SignedOperationBytes\(forged\.length \/ 2, input\.source\)/);
  assert.match(service, /"exact_studio_padded_forge"/);
});

test("origination hash is durable before TzKT derives the KT1", () => {
  assert.doesNotMatch(service, /entrypoint === "origination" && !input\.originatedContract/);
  assert.match(service, /const derivedContract = String\(match\.originatedContract!/);
  assert.match(service, /originatedContract: derivedContract/);
});

test("fresh creator keys are revealed in a separate durable action before origination", () => {
  assert.match(service, /stepKey:\s*"reveal_creator_key"/);
  assert.match(service, /amountMutez:\s*1/);
  assert.match(service, /readManagerKeyAtBlock/);
  assert.match(service, /liveEstimateCreatorKeyReveal/);
  assert.match(service, /liveEstimateCreatorOrigination/);
  assert.match(service, /awaiting-signature creator action has no durable live Tezos estimate/);
  assert.match(service, /administratorPublicKey/);
  assert.match(service, /Finalize the creator public-key reveal before preparing origination/);
});

test("managed collection metadata pinning is idempotent and bound before creator plan/origination", () => {
  assert.match(routes, /drops\/:dropId\/public-contract-metadata/);
  assert.match(routes, /upload\.single\("cover"\)/);
  assert.match(service, /pinManagedMacaroniV35PublicContractMetadata/);
  assert.match(service, /public_contract_metadata/);
  assert.match(service, /requestDigest/);
  assert.match(service, /Creator plan contract metadata URI must equal the managed URI bound to this setup/);
});

test("hosted secure publish uses a strict non-secret public configuration allowlist", () => {
  const output = sanitizeMacaroniConfigForPublish({
    contractVersion: "macaroni-secure-v35",
    contract: "KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG",
    profile: { id: "macaroni-secure-v35", collectorUnpredictable: true },
    network: "mainnet",
    service: { provider: "wtfos_managed", secretKey: "must-not-survive" },
    tokens: [{ id: 0, displayId: 1, quantity: 2, metadata: "ipfs://private" }],
    entropyPreimage: "must-not-survive",
  }, "https://example.wtf");
  assert.equal("entropyPreimage" in output, false);
  assert.equal("secretKey" in (output.service as Record<string, unknown>), false);
  assert.deepEqual(output.tokens, [{ id: 0, displayId: 1, quantity: 2 }]);
  assert.equal((output.service as Record<string, unknown>).publicStatusUrl,
    "https://example.wtf/api/macaroni/v35/status/mainnet/KT1XvNYseNDJJ6Kw27qhSEDF8ys8JhDopzfG");
});

test("versioned asset keyring decrypts staged CAR manifests and signed bytes after rotation", () => {
  const previous = {
    keyring: process.env.MACARONI_V35_ASSET_KEYRING_JSON,
    active: process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION,
    legacyKey: process.env.MACARONI_V35_ASSET_ENCRYPTION_KEY,
    legacyVersion: process.env.MACARONI_V35_ASSET_KEY_VERSION,
  };
  try {
    delete process.env.MACARONI_V35_ASSET_ENCRYPTION_KEY;
    delete process.env.MACARONI_V35_ASSET_KEY_VERSION;
    process.env.MACARONI_V35_ASSET_KEYRING_JSON = JSON.stringify({
      v1: "first-managed-asset-key-material-with-more-than-thirty-two-characters",
    });
    process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION = "v1";
    const staged = encryptMacaroniV35PrivatePayload({ cid: "private-cid", carSha256: "a".repeat(64) });
    process.env.MACARONI_V35_ASSET_KEYRING_JSON = JSON.stringify({
      v1: "first-managed-asset-key-material-with-more-than-thirty-two-characters",
      v2: "second-managed-asset-key-material-with-more-than-thirty-two-characters",
    });
    process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION = "v2";
    assert.deepEqual(decryptMacaroniV35PrivatePayload(staged), {
      cid: "private-cid",
      carSha256: "a".repeat(64),
    });
    const signed = encryptMacaroniV35PrivatePayload({ signedBytes: "03deadbeef", operationHash: "op" });
    assert.deepEqual(decryptMacaroniV35PrivatePayload(signed), {
      signedBytes: "03deadbeef",
      operationHash: "op",
    });
    process.env.MACARONI_V35_ASSET_KEYRING_JSON = JSON.stringify({
      v2: "second-managed-asset-key-material-with-more-than-thirty-two-characters",
    });
    assert.throws(() => decryptMacaroniV35PrivatePayload(staged), /v1 is unavailable/);
  } finally {
    if (previous.keyring == null) delete process.env.MACARONI_V35_ASSET_KEYRING_JSON;
    else process.env.MACARONI_V35_ASSET_KEYRING_JSON = previous.keyring;
    if (previous.active == null) delete process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION;
    else process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION = previous.active;
    if (previous.legacyKey == null) delete process.env.MACARONI_V35_ASSET_ENCRYPTION_KEY;
    else process.env.MACARONI_V35_ASSET_ENCRYPTION_KEY = previous.legacyKey;
    if (previous.legacyVersion == null) delete process.env.MACARONI_V35_ASSET_KEY_VERSION;
    else process.env.MACARONI_V35_ASSET_KEY_VERSION = previous.legacyVersion;
  }
});
