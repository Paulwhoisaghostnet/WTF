import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeMacaroniV35WorkPayload,
  digestMacaroniV35OperationIntent,
  executeMacaroniV35LeasedWork,
  type MacaroniV35LeasedWork,
  type MacaroniV35WorkerRepository,
} from "./v35-worker";

function work(operationHash: string | null = null): MacaroniV35LeasedWork {
  return { id: 1, dropId: 2, workType: "settle_claim", semanticKey: "claim:7", payloadHash: "a".repeat(64), payload: { claimId: "7" }, state: "leased", attemptCount: 1, operationHash, leaseOwner: "worker" };
}

test("submitted work reconciles its durable hash without submitting again", async () => {
  const calls: string[] = [];
  const repository = Object.fromEntries([
    "createReadyAttempt", "persistSubmitted", "markConfirming", "markApplied", "markNeedsReconciliation", "markManualReview",
  ].map((name) => [name, async () => { calls.push(name); }])) as unknown as MacaroniV35WorkerRepository;
  const result = await executeMacaroniV35LeasedWork({
    work: work("o".repeat(51)),
    repository,
    handler: {
      buildIntent: async () => ({ requestId: "r", intent: "settle", network: "shadownet", signer: null, target: null, entrypoint: "settle_claims_v35", amountMutez: 0, expectedPostcondition: { claim: 7 }, parameters: { claimId: 7 } }),
      submit: async () => { calls.push("submit"); return { operationHash: "new" }; },
      reconcile: async () => { calls.push("reconcile"); return "applied"; },
    },
  });
  assert.equal(result.status, "applied");
  assert.deepEqual(calls, ["markConfirming", "reconcile", "markApplied"]);
});

test("linked retry request ids cannot change the semantic operation digest", () => {
  const intent = {
    requestId: "worker:drop:claim:settle",
    intent: "settle_claims_v35",
    network: "shadownet" as const,
    signer: "tz1Signer",
    target: "KT1Target",
    entrypoint: "settle_claims_v35",
    amountMutez: 0,
    expectedPostcondition: { claimId: "7", tokenId: 3 },
    parameters: { michelineDigest: "a".repeat(64) },
  };
  assert.equal(
    digestMacaroniV35OperationIntent(intent),
    digestMacaroniV35OperationIntent({ ...intent, requestId: `${intent.requestId}:r42` })
  );
  assert.notEqual(
    digestMacaroniV35OperationIntent(intent),
    digestMacaroniV35OperationIntent({
      ...intent,
      expectedPostcondition: { claimId: "7", tokenId: 4 },
    })
  );
});

test("new work persists the operation hash before confirmation", async () => {
  const calls: string[] = [];
  const repository = Object.fromEntries([
    "createReadyAttempt", "persistSubmitted", "markConfirming", "markApplied", "markNeedsReconciliation", "markManualReview",
  ].map((name) => [name, async () => { calls.push(name); }])) as unknown as MacaroniV35WorkerRepository;
  await executeMacaroniV35LeasedWork({
    work: work(), repository,
    handler: {
      buildIntent: async () => ({ requestId: "r", intent: "settle", network: "shadownet", signer: null, target: null, entrypoint: "settle_claims_v35", amountMutez: 0, expectedPostcondition: {}, parameters: {} }),
      submit: async () => { calls.push("submit"); return { operationHash: "o".repeat(51) }; },
      reconcile: async () => { calls.push("reconcile"); return "applied"; },
    },
  });
  assert.deepEqual(calls, ["createReadyAttempt", "submit", "persistSubmitted", "markConfirming", "reconcile", "markApplied"]);
});

test("queue payload policy rejects plaintext CIDs and secrets", () => {
  assert.throws(() => assertSafeMacaroniV35WorkPayload({ metadataUri: "ipfs://bafy..." }), /forbidden/);
  assert.throws(() => assertSafeMacaroniV35WorkPayload({ nested: { seedPreimage: "aa" } }), /forbidden/);
  assert.doesNotThrow(() => assertSafeMacaroniV35WorkPayload({ claimId: "7", encryptedAssetRef: "asset:9" }));
});
