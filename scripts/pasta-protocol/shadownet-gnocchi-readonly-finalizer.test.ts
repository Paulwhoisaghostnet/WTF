import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertGnocchiReadonlyFinalizationAllowed,
  validateGnocchiRecoveryBoundary,
  validateRecoveredGnocchiOperations,
} from "./shadownet-gnocchi-readonly-finalizer";

const CONTRACT = "KT1Qzue6Uxojgsf2SxhVk5sqv1T3BGB9Ba69";
const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const COLLECTOR_ONE = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const COLLECTOR_TWO = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";
const HASHES = [
  "onogoAfpz5tyZudYN8dr8jB8RMCgSKSbRrWAZxRJug7hDZzdLom",
  "op9L6geJgtwBntnqrCsWVgZyuD1N1ZyXMM7C9JFnw6HuCeMQcwC",
  "ooK1TLaafTnpDY6oCv3iKjaHEghGeU7Y45cMj3FkdJ5D2rP8qvh",
  "oojMFtWBSYZBdks18QERsP6dVyYYdRLuLgGuLBGy9k5Ukw7Xhw2",
  "ooT6QEr4aZcLvABRGHadX6oaSvk18oxc4mmDW8cyP5Q87xEARUa",
  "ooshAQpb6asa9FnBqzt1Gqs3F3prB75B4ocpFqff2rpi9WvpPU2",
  "opD1eGcL2K2ZWV6h9oBMYdRwe6veUM5RUKUY3sfEtY9fojkCVZL",
  "opRJLTaimxgzVGH3dBmHVX4YMqzcczZgJgUs7S3EHmXYbUeP8DL",
  "opai5vVFepCpVa7Ehz8sezSA25VbuUMMXE8vE9ZjQWsCdFSWHHf",
  "ooaTSvoXEDsG8an4qdFPcmZ7XBCvvSByKMGAsma4A7HrRJmgJPc",
  "oo33n4HtqBStDhNqzGXd7ZKXnxLvsP2mXibJ82VYepGT4XWputf",
  "ooqfSTLWt17kcE5bBQbZB34sbqTqLByQWdfPdYPjNTbUPykSvQ4",
] as const;

const CONTENT_FILES = [
  "token-0-media.png",
  "collection-metadata.json",
  "token-0-metadata.json",
  "token-1-media.png",
  "token-1-metadata.json",
  "token-2-media.png",
  "token-2-metadata.json",
] as const;

function recoveryBoundaryFixture(input: {
  recoveredOperations: number;
  preservedScreenshots: number;
  recoveredContent: number;
  interruptionCode?: string;
}) {
  const liveOperations = HASHES.length - input.recoveredOperations;
  const preservedScreenshotOrdinals = Array.from({ length: input.preservedScreenshots }, (_, index) => index + 1);
  const continuationScreenshotOrdinals = Array.from(
    { length: 19 - input.preservedScreenshots },
    (_, index) => input.preservedScreenshots + index + 1,
  );
  const content = CONTENT_FILES.map((fileName, index) => ({
    id: fileName.replace(/\.[^.]+$/, ""),
    fileName,
    cid: `bafy-gnocchi-boundary-${index + 1}`,
    sha256: (index + 1).toString(16).padStart(64, "0"),
    byteLength: index + 1,
  }));
  const recoveredContent = content.slice(0, input.recoveredContent);
  const expectedNewPins = content.slice(input.recoveredContent);
  const prefixOperations = HASHES.slice(0, input.recoveredOperations).map((hash) => ({ hash }));
  const liveOperationOrdinals = Array.from({ length: liveOperations }, (_, index) => input.recoveredOperations + index + 1);
  const remainingOperationMatrix = liveOperationOrdinals.map((globalOrdinal) => ({ globalOrdinal }));
  const eventCount = continuationScreenshotOrdinals.length + expectedNewPins.length * 2 + liveOperations * 3 + 2;
  const phases = {
    SCREENSHOT_ACCEPTED: continuationScreenshotOrdinals.length,
    ...(expectedNewPins.length > 0
      ? { PIN_PREPARED: expectedNewPins.length, PIN_CONFIRMED: expectedNewPins.length }
      : {}),
    PREPARED: liveOperations,
    SUBMITTED: liveOperations,
    APPLIED: liveOperations,
    EXPECTED_REJECTION: 2,
  };
  const interruption = {
    code: input.interruptionCode || "POST_CONFIRMATION_READ_STORAGE_HTTP_500",
    stage: `before-screenshot-${input.preservedScreenshots + 1}`,
  };
  const final = {
    events: eventCount,
    pins: expectedNewPins.length,
    recoveredOperations: input.recoveredOperations,
    liveOperations,
  };
  const intent = {
    interruption: {
      ...interruption,
      chainMutationApplied: true,
      ordinaryRerunForbidden: true,
    },
    recoveredPrefix: {
      operations: prefixOperations,
      content: recoveredContent,
      files: [
        { path: "artifacts/gnocchi-current-contract-code.json" },
        ...preservedScreenshotOrdinals.map((ordinal) => ({
          path: `artifacts/screenshot-${String(ordinal).padStart(3, "0")}-stage.json`,
        })),
        ...preservedScreenshotOrdinals.map((ordinal) => ({
          path: `screenshots/${String(ordinal).padStart(3, "0")}-stage.png`,
        })),
      ],
    },
    remainingOperationMatrix,
    expectedNewPins,
  };
  const receipt = {
    interruption: {
      ...interruption,
      recoveredWithoutReplayingAppliedPrefix: true,
    },
    prefix: {
      recoveredOperations: prefixOperations,
      recoveredContent,
      preservedScreenshots: preservedScreenshotOrdinals,
    },
    continuation: {
      liveOperationOrdinals,
      newContent: expectedNewPins,
      appendedScreenshots: continuationScreenshotOrdinals.map((ordinal) => ({
        path: `screenshots/${String(ordinal).padStart(3, "0")}-stage.png`,
      })),
    },
    checkpoint: final,
  };
  return {
    operationHashes: HASHES,
    intent,
    final,
    receipt,
    eventCount,
    phases,
    appliedHashes: HASHES.slice(input.recoveredOperations),
    screenshotOrdinals: continuationScreenshotOrdinals,
    rejectionReasons: ["this sale is paused", "not enough supply left"],
    pinFiles: expectedNewPins.map((item, index) =>
      `pins/${String(index + 1).padStart(3, "0")}-${item.fileName}`
    ),
  };
}

function operationFixture() {
  const entrypoints = [
    "create_open_edition", "create_open_edition", "create_open_edition",
    "open_mint", "open_mint", "open_mint",
    "set_sale_active", "set_sale_active",
    "open_mint", "open_mint", "open_mint",
  ];
  const senders = [
    CREATOR, CREATOR, CREATOR,
    COLLECTOR_ONE, COLLECTOR_ONE, COLLECTOR_ONE,
    CREATOR, CREATOR,
    COLLECTOR_TWO, COLLECTOR_TWO, COLLECTOR_TWO,
  ];
  return {
    originations: [{
      hash: HASHES[0],
      status: "applied",
      level: 4310129,
      timestamp: "2026-07-23T01:10:12Z",
      sender: { address: CREATOR },
      originatedContract: { address: CONTRACT },
    }],
    transactions: entrypoints.map((entrypoint, index) => ({
      hash: HASHES[index + 1],
      status: "applied",
      level: 4310132 + index * 4,
      timestamp: new Date(Date.parse("2026-07-23T01:10:30Z") + index * 24_000).toISOString(),
      sender: { address: senders[index] },
      target: { address: CONTRACT },
      parameter: { entrypoint, value: { int: String(index) } },
      amount: entrypoint === "open_mint" ? 1 : 0,
      counter: 1000 + index,
    })),
  };
}

test("read-only finalizer is explicitly gated to an existing Shadownet proof root", () => {
  assert.throws(() => assertGnocchiReadonlyFinalizationAllowed({}), /GNOCCHI_READONLY_FINALIZE/);
  assert.throws(() => assertGnocchiReadonlyFinalizationAllowed({
    PASTA_SHADOWNET_GNOCCHI_READONLY_FINALIZE: "1",
    PASTA_PROOF_RUN_DIR: "/proof",
    TEZOS_NETWORK: "mainnet",
  }), /Shadownet/);
  assert.doesNotThrow(() => assertGnocchiReadonlyFinalizationAllowed({
    PASTA_SHADOWNET_GNOCCHI_READONLY_FINALIZE: "1",
    PASTA_PROOF_RUN_DIR: "/proof",
    TEZOS_NETWORK: "shadownet",
  }));
});

test("recovered operations require the exact origination, action order, and two three-mint collectors", () => {
  const fixture = operationFixture();
  const evidence = validateRecoveredGnocchiOperations({ contractAddress: CONTRACT, ...fixture });
  assert.equal(evidence.creator, CREATOR);
  assert.equal(evidence.collectorOne, COLLECTOR_ONE);
  assert.equal(evidence.collectorTwo, COLLECTOR_TWO);
  assert.deepEqual(evidence.operationHashes, HASHES);
  assert.equal(evidence.indexedReceipts.length, 12);
  assert.equal(evidence.manifestOperations.filter((operation) => operation.kind === "mint").length, 6);
  assert.equal(evidence.terminalOperationHash, HASHES[11]);
});

test("recovered operations reject order, signer, status, count, amount, and duplicate drift", () => {
  const cases: Array<[string, (fixture: ReturnType<typeof operationFixture>) => void, RegExp]> = [
    ["entrypoint", (fixture) => { fixture.transactions[0].parameter.entrypoint = "open_mint"; }, /action order drift/],
    ["creator", (fixture) => { fixture.transactions[1].sender.address = COLLECTOR_ONE; }, /signer drift/],
    ["status", (fixture) => { fixture.transactions[2].status = "failed"; }, /must be applied/],
    ["count", (fixture) => { fixture.transactions.pop(); }, /exactly 11/],
    ["amount", (fixture) => { fixture.transactions[3].amount = 0; }, /0 !== 1/],
    ["duplicate", (fixture) => { fixture.transactions[1].hash = fixture.transactions[0].hash; }, /must be unique/],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = operationFixture();
    mutate(fixture);
    assert.throws(() => validateRecoveredGnocchiOperations({ contractAddress: CONTRACT, ...fixture }), expected, label);
  }
});

test("recovery boundary derives both the retired 3+9 checkpoint and current 6+6 checkpoint from authenticated documents", () => {
  const retired = validateGnocchiRecoveryBoundary(recoveryBoundaryFixture({
    recoveredOperations: 3,
    preservedScreenshots: 6,
    recoveredContent: 5,
  }));
  assert.deepEqual(retired, {
    recoveredOperations: 3,
    liveOperations: 9,
    recoveredContentObjects: 5,
    nativeContinuationContentObjects: 2,
    preservedScreenshotOrdinals: [1, 2, 3, 4, 5, 6],
    continuationScreenshotOrdinals: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  });

  const current = validateGnocchiRecoveryBoundary(recoveryBoundaryFixture({
    recoveredOperations: 6,
    preservedScreenshots: 10,
    recoveredContent: 7,
    interruptionCode: "POST_CONFIRMATION_SCREENSHOT_RESOURCE_HTTP_500",
  }));
  assert.deepEqual(current, {
    recoveredOperations: 6,
    liveOperations: 6,
    recoveredContentObjects: 7,
    nativeContinuationContentObjects: 0,
    preservedScreenshotOrdinals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    continuationScreenshotOrdinals: [11, 12, 13, 14, 15, 16, 17, 18, 19],
  });
});

test("recovery boundary fails closed on checkpoint count, pin, operation, or screenshot drift", () => {
  const cases: Array<[string, (fixture: ReturnType<typeof recoveryBoundaryFixture>) => void, RegExp]> = [
    ["event count", (fixture) => { fixture.final.events += 1; }, /29 !== 30|30 !== 29/],
    ["pin inventory", (fixture) => { fixture.pinFiles.push("pins/001-unexpected.png"); }, /pin file inventory/],
    ["operation split", (fixture) => { fixture.final.recoveredOperations -= 1; }, /operation split is incomplete/],
    ["screenshot sequence", (fixture) => { fixture.screenshotOrdinals[0] = 10; }, /SCREENSHOT_ACCEPTED events/],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = recoveryBoundaryFixture({ recoveredOperations: 6, preservedScreenshots: 10, recoveredContent: 7 });
    mutate(fixture);
    assert.throws(() => validateGnocchiRecoveryBoundary(fixture), expected, label);
  }
});

test("finalizer delegates every remote read to the opaque GET-only retry capability and has no write path", async () => {
  const source = await readFile(new URL("./shadownet-gnocchi-readonly-finalizer.ts", import.meta.url), "utf8");
  assert.match(source, /createHttpGetReader/);
  assert.match(source, /readWithBoundedRetry/);
  assert.equal(source.match(/createHttpGetReader\(/g)?.length, 1, "all HTTP reads must share one GET-only construction point");
  assert.doesNotMatch(source, /fetchImpl\s*\(/, "the finalizer must not invoke an injected transport outside the GET-only wrapper");
  assert.doesNotMatch(source, /declareReadOnlyReader/, "the finalizer must not bypass the stricter HTTP GET capability");
  assert.doesNotMatch(source, /function (?:wait|retryAfterMs)\b|for \(let attempt\b/, "the finalizer must not retain an ad hoc retry loop");
  assert.match(source, /signerMaterialLoaded: false/);
  assert.match(source, /chainWrites: 0/);
  assert.match(source, /ipfsWrites: 0/);
  assert.equal(
    source.match(/rpcUrl: SHADOWNET_RPC_PRIMARY/g)?.length,
    2,
    "receipt and strict app manifest must retain authoritative Shadownet RPC provenance",
  );
  assert.doesNotMatch(source, /rpcUrl: null/);
  assert.doesNotMatch(source, /buildToolkit|loadSigner|pinIpfsProof|\.contract\.transfer|\.originate\(|method: "(?:POST|PUT|PATCH|DELETE)"/);
});
