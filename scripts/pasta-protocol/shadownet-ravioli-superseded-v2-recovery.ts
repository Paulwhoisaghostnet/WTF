#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validateOperation, ValidationResult } from "@taquito/utils";

import {
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveBridgeRequest,
  type PastaUiLivePreparedOperation,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  loadSignerSet,
  normalizeBase,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
} from "./shadownet-proof-kit";

type JsonObject = Record<string, any>;

export const RAVIOLI_SUPERSEDED_RECOVERY_EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_EXECUTE";
export const RAVIOLI_SUPERSEDED_RECOVERY_RECONCILE_FLAG = "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_RECONCILE";
export const RAVIOLI_SUPERSEDED_RECOVERY_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
export const RAVIOLI_SUPERSEDED_RECOVERY_RUN_ID = "pasta-alpha-proof-20260722b";
export const RAVIOLI_SUPERSEDED_RECOVERY_DIRECTORY = "ravioli-superseded-v2-20260722b-operator-recovery";

export const RAVIOLI_SUPERSEDED_RECOVERY_CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
export const RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI = "KT1Qzue6Uxojgsf2SxhVk5sqv1T3BGB9Ba69";
export const RAVIOLI_SUPERSEDED_RECOVERY_ROUTER = "KT1TuPCh4gR19w7kdrYVv5jVF9VrKJU6z5rj";
export const RAVIOLI_SUPERSEDED_RECOVERY_TOKEN_ID = 0;

export const RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH =
  "onomEQKxKWZCsMwgNM7eV1fQKv1A1wwMGoZU3E9yuPdnhUAcbqg";
export const RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH =
  "onqJpabnVoKeZkgSaygd5j5D7f6G3zGQD3qYwkFwwY3u4d7KvbR";
export const RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_COUNTER = 23_831_496;
export const RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER = 23_831_497;
export const RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER = 23_831_498;
export const RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_LEVEL = 4_311_756;
export const RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL = 4_311_759;

const EXPECTED_ROUTER_TYPE_HASH = 1_585_074_295;
const EXPECTED_ROUTER_CODE_HASH = -1_375_758_085;
const EXPECTED_GNOCCHI_TYPE_HASH = 1_978_761_748;
const EXPECTED_GNOCCHI_CODE_HASH = 1_417_659_735;
const EXPECTED_TARGET_OPERATOR_HASH = "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY1H";
const RECOVERY_OPERATION_RESERVE_MUTEZ = 1_000_000;
const RECOVERY_FEE_HEADROOM_MUTEZ = 100;
const MAX_GAS_LIMIT = 100_000;
const MAX_STORAGE_LIMIT = 5_000;
const MAX_FEE_MUTEZ = 25_000;

export const RAVIOLI_SUPERSEDED_ROUTER_BIG_MAPS = {
  adapter_allowances: { id: 29_365, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  asset_allowances: { id: 29_366, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  ledger: { id: 29_367, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  metadata: { id: 29_368, activeKeyCount: 1, sha256: "31a270e7e33ee6562020b757e9dcb10d57789d2ac07b26bc3ab0fad313c0f750" },
  minted: { id: 29_369, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  minters: { id: 29_370, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  opened: { id: 29_371, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  opened_by: { id: 29_372, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  operators: { id: 29_373, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  packs: { id: 29_374, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  recipe_commitments: { id: 29_375, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  sales: { id: 29_376, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  token_metadata: { id: 29_377, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  total_supply: { id: 29_378, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
} as const;

export const RAVIOLI_SUPERSEDED_GNOCCHI_PROTECTED_BIG_MAPS = {
  ledger: { id: 29_223, activeKeyCount: 9, sha256: "f1e5d267dcf6136eeb6adb12739df7ebebee18b1cf76213d37ee43e4a1cb4110" },
  metadata: { id: 29_224, activeKeyCount: 1, sha256: "816a3088f444d5f670f2df95e231ffbc1bc3ce499b92818cf23f20a7394fcb44" },
  minters: { id: 29_225, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  policy_locked: { id: 29_227, activeKeyCount: 3, sha256: "ceafdd8889b9c4af23058de739a4d44b2bd18c8e70493b1637fd47b1d0e86b9a" },
  reserved_mints: { id: 29_228, activeKeyCount: 0, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  sales: { id: 29_229, activeKeyCount: 3, sha256: "aea0d4cbec26d3cc09f0fe2a75e13053d382fcbadb7d19c185eac4478204c5e0" },
  token_metadata: { id: 29_230, activeKeyCount: 3, sha256: "91b051dc186e97ad664d6ee01ed15898cae998e0b2bf20bf3ad33820efcbdedf" },
  total_minted: { id: 29_231, activeKeyCount: 3, sha256: "3449bace3fa554b52e15d98e46d73be3751998b8d189baf29bb6b5ec912dc9f8" },
  total_reserved: { id: 29_232, activeKeyCount: 3, sha256: "c1407a15db71a8a7d95145c1b7a69250f6f3c068932a8836e9d6e1a58d83ba9a" },
  total_supply: { id: 29_233, activeKeyCount: 3, sha256: "3449bace3fa554b52e15d98e46d73be3751998b8d189baf29bb6b5ec912dc9f8" },
} as const;

export type RavioliSupersededMapFingerprint = {
  id: number;
  activeKeyCount: number;
  sha256: string;
};

export type RavioliSupersededOperatorKey = {
  owner: string;
  operator: string;
  tokenId: number;
};

export type RavioliSupersededOperatorRecord = {
  active: boolean;
  hash: string;
  key: RavioliSupersededOperatorKey;
  firstLevel: number;
  lastLevel: number;
  updates: number;
};

export const RAVIOLI_SUPERSEDED_NON_TARGET_OPERATORS: readonly RavioliSupersededOperatorRecord[] = [] as const;

export type RavioliSupersededRecoveryCall = {
  contractAddress: typeof RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI;
  entrypoint: "update_operators";
  payload: Array<{
    remove_operator: {
      owner: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
      operator: typeof RAVIOLI_SUPERSEDED_RECOVERY_ROUTER;
      token_id: 0;
    };
  }>;
};

export type RavioliSupersededRecoverySendOptions = {
  amount: 0;
  mutez: true;
  fee: number;
  gasLimit: number;
  storageLimit: number;
};

export type RavioliSupersededRecoveryEstimate = {
  call: RavioliSupersededRecoveryCall;
  gasLimit: number;
  storageLimit: number;
  suggestedFeeMutez: number;
  minimalFeeMutez: number;
  burnFeeMutez: number;
  sendOptions: RavioliSupersededRecoverySendOptions;
};

export type RavioliSupersededRecoveryOperation = {
  hash: string;
  counter: typeof RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER;
  level: number;
  timestamp: string;
  explorerUrl: string;
  call: RavioliSupersededRecoveryCall;
};

export type RavioliSupersededCauseEvidence = {
  origination: {
    hash: typeof RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH;
    counter: typeof RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_COUNTER;
    level: typeof RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_LEVEL;
    timestamp: string;
    sender: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
    originatedContract: typeof RAVIOLI_SUPERSEDED_RECOVERY_ROUTER;
    kind: "asset";
    typeHash: number;
    codeHash: number;
    tzips: ["fa2"];
  };
  operatorAddition: {
    hash: typeof RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH;
    counter: typeof RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER;
    level: typeof RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL;
    timestamp: string;
    sender: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
    call: {
      contractAddress: typeof RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI;
      entrypoint: "update_operators";
      payload: Array<{
        add_operator: {
          owner: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
          operator: typeof RAVIOLI_SUPERSEDED_RECOVERY_ROUTER;
          token_id: 0;
        };
      }>;
    };
  };
};

export type RavioliSupersededRecoveryState = {
  level: number;
  router: {
    address: typeof RAVIOLI_SUPERSEDED_RECOVERY_ROUTER;
    kind: "asset";
    tzips: ["fa2"];
    typeHash: number;
    codeHash: number;
    creator: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
    administrator: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
    pendingAdministrator: null;
    nextTokenId: number;
    indexFacts: {
      numTransactions: number;
      tokensCount: number;
      activeTokensCount: number;
      tokenBalancesCount: number;
      tokenTransfersCount: number;
    };
    bigMaps: Record<keyof typeof RAVIOLI_SUPERSEDED_ROUTER_BIG_MAPS, RavioliSupersededMapFingerprint>;
  };
  gnocchi: {
    address: typeof RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI;
    kind: "asset";
    tzips: ["fa2"];
    typeHash: number;
    codeHash: number;
    creator: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
    administrator: typeof RAVIOLI_SUPERSEDED_RECOVERY_CREATOR;
    pendingAdministrator: null;
    nextTokenId: number;
    operatorBigMapId: number;
    targetOperator: RavioliSupersededOperatorRecord;
    nonTargetOperators: RavioliSupersededOperatorRecord[];
    protectedBigMaps: Record<keyof typeof RAVIOLI_SUPERSEDED_GNOCCHI_PROTECTED_BIG_MAPS, RavioliSupersededMapFingerprint>;
  };
};

export type RavioliSupersededLaneSnapshot = {
  rpcUrl: string;
  counter: number;
  balanceMutez: number;
  headLevel: number;
  activeOperationCount: 0;
};

type JsonArtifact = { value: JsonObject; bytes: Uint8Array; sha256: string };

export type RavioliSupersededRecoveryCheckpointHashes = {
  preparedSha256: string;
  submittedSha256: string;
  appliedSha256: string;
};

export type RavioliSupersededRecoveryCheckpoint = {
  schema: "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-checkpoint@1";
  phase: "PREPARED" | "SUBMITTED" | "APPLIED";
  checkpointSequence: 1 | 2 | 3;
  timestampUtc: string;
  preflightSha256: string;
  intentSha256: string;
  previousRecordSha256: string;
  bridgeOperation: JsonObject;
  operationHash?: string;
  operation?: RavioliSupersededRecoveryOperation;
};

export type RavioliSupersededRecoveryReconciliationIo = {
  readPreflight(recoveryRoot: string): Promise<JsonArtifact>;
  readIntent(recoveryRoot: string): Promise<JsonArtifact>;
  readCheckpoints(recoveryRoot: string): Promise<JsonArtifact[]>;
  readProgress(recoveryRoot: string): Promise<JsonObject | undefined>;
  readCauseOperations(): Promise<RavioliSupersededCauseEvidence>;
  readOperationRows(): Promise<JsonObject[]>;
  readState(): Promise<RavioliSupersededRecoveryState>;
  readLane(rpcUrl: string): Promise<RavioliSupersededLaneSnapshot>;
  writeReceipt(recoveryRoot: string, receipt: JsonObject): Promise<string>;
  now(): string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactSha256(value: unknown, label: string): string {
  const text = String(value || "");
  assert.match(text, /^[0-9a-f]{64}$/, `${label} must be a lowercase SHA-256 digest`);
  return text;
}

function checkpointBridgeOperation(
  operation: PastaUiLivePreparedOperation | PastaUiLiveSubmittedOperation,
  estimate: RavioliSupersededRecoveryEstimate,
): JsonObject {
  assert.equal(operation.action, "call", "recovery checkpoint action drift");
  assert.equal(operation.chainId, SHADOWNET_CHAIN_ID, "recovery checkpoint chain drift");
  assert.equal(operation.signerAddress, RAVIOLI_SUPERSEDED_RECOVERY_CREATOR, "recovery checkpoint signer drift");
  assert.equal(operation.contractAddress, RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI, "recovery checkpoint target drift");
  assert.deepEqual(operation.entrypoints, ["update_operators"], "recovery checkpoint entrypoint drift");
  assert.equal(operation.operationSequence, 1, "recovery checkpoint operation sequence drift");
  assert.deepEqual(canonical(operation.descriptor), canonical({
    kind: "call",
    call: ravioliSupersededRecoveryCall(),
    sendOptions: estimate.sendOptions,
  }), "recovery checkpoint descriptor differs from the estimated one-key removal");
  return canonical(operation) as JsonObject;
}

export function buildRavioliSupersededRecoveryCheckpoint(input: {
  phase: RavioliSupersededRecoveryCheckpoint["phase"];
  timestampUtc: string;
  preflightSha256: string;
  intentSha256: string;
  previousRecordSha256: string;
  estimate: RavioliSupersededRecoveryEstimate;
  bridgeOperation: PastaUiLivePreparedOperation | PastaUiLiveSubmittedOperation;
  operation?: RavioliSupersededRecoveryOperation;
}): RavioliSupersededRecoveryCheckpoint {
  const phaseSequence = { PREPARED: 1, SUBMITTED: 2, APPLIED: 3 } as const;
  const bridgeOperation = checkpointBridgeOperation(input.bridgeOperation, input.estimate);
  const checkpoint: RavioliSupersededRecoveryCheckpoint = {
    schema: "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-checkpoint@1",
    phase: input.phase,
    checkpointSequence: phaseSequence[input.phase],
    timestampUtc: validIso(input.timestampUtc, "recovery checkpoint time"),
    preflightSha256: exactSha256(input.preflightSha256, "checkpoint preflight SHA-256"),
    intentSha256: exactSha256(input.intentSha256, "checkpoint intent SHA-256"),
    previousRecordSha256: exactSha256(input.previousRecordSha256, "checkpoint previous-record SHA-256"),
    bridgeOperation,
  };
  if (input.phase === "PREPARED") {
    assert.equal((input.bridgeOperation as JsonObject).status, "PREPARED", "prepared checkpoint requires a PREPARED bridge operation");
    assert.equal(input.operation, undefined, "prepared checkpoint cannot contain applied operation evidence");
    assert.equal((input.bridgeOperation as JsonObject).operationHash, undefined, "prepared checkpoint cannot contain an operation hash");
  } else {
    assert.equal((input.bridgeOperation as JsonObject).status, "SUBMITTED", `${input.phase} checkpoint requires a SUBMITTED bridge operation`);
    const operationHash = String((input.bridgeOperation as JsonObject).operationHash || "");
    assert.equal(validateOperation(operationHash), ValidationResult.VALID, "checkpoint operation hash is invalid");
    checkpoint.operationHash = operationHash;
    if (input.phase === "APPLIED") {
      assert.ok(input.operation, "applied checkpoint requires exact TzKT operation evidence");
      assert.equal(input.operation.hash, operationHash, "applied checkpoint operation hash drift");
      checkpoint.operation = input.operation;
    } else {
      assert.equal(input.operation, undefined, "submitted checkpoint cannot contain applied operation evidence");
    }
  }
  return checkpoint;
}

export function validateRavioliSupersededRecoveryCheckpoint(
  checkpoint: RavioliSupersededRecoveryCheckpoint,
  expected: {
    phase: RavioliSupersededRecoveryCheckpoint["phase"];
    preflightSha256: string;
    intentSha256: string;
    previousRecordSha256: string;
    estimate: RavioliSupersededRecoveryEstimate;
  },
): void {
  assert.equal(checkpoint.schema, "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-checkpoint@1");
  assert.equal(checkpoint.phase, expected.phase, "recovery checkpoint phase drift");
  assert.equal(checkpoint.checkpointSequence, ({ PREPARED: 1, SUBMITTED: 2, APPLIED: 3 } as const)[expected.phase], "recovery checkpoint sequence drift");
  validIso(checkpoint.timestampUtc, "recovery checkpoint time");
  assert.equal(checkpoint.preflightSha256, exactSha256(expected.preflightSha256, "expected preflight SHA-256"), "recovery checkpoint preflight SHA-256 drift");
  assert.equal(checkpoint.intentSha256, exactSha256(expected.intentSha256, "expected intent SHA-256"), "recovery checkpoint intent SHA-256 drift");
  assert.equal(
    checkpoint.previousRecordSha256,
    exactSha256(expected.previousRecordSha256, "expected previous-record SHA-256"),
    "recovery checkpoint previous-record SHA-256 drift",
  );
  checkpointBridgeOperation(checkpoint.bridgeOperation as PastaUiLivePreparedOperation | PastaUiLiveSubmittedOperation, expected.estimate);
  if (expected.phase === "PREPARED") {
    assert.equal(checkpoint.operationHash, undefined);
    assert.equal(checkpoint.operation, undefined);
  } else {
    assert.equal(validateOperation(String(checkpoint.operationHash || "")), ValidationResult.VALID);
    if (expected.phase === "APPLIED") {
      assert.ok(checkpoint.operation);
      assert.equal(checkpoint.operation.hash, checkpoint.operationHash);
      assertExactRecoveryCall(checkpoint.operation.call);
    } else {
      assert.equal(checkpoint.operation, undefined);
    }
  }
}

export function validateRavioliSupersededRecoveryCheckpointChain(
  artifacts: JsonArtifact[],
  expected: {
    preflightSha256: string;
    intentSha256: string;
    estimate: RavioliSupersededRecoveryEstimate;
    operation: RavioliSupersededRecoveryOperation;
  },
): RavioliSupersededRecoveryCheckpointHashes {
  assert.equal(artifacts.length, 3, "recovery requires exactly PREPARED, SUBMITTED, and APPLIED checkpoints");
  for (const [index, artifact] of artifacts.entries()) {
    assert.equal(artifact.sha256, sha256(artifact.bytes), `checkpoint ${index + 1} digest does not match its bytes`);
    assert.deepEqual(artifact.value, JSON.parse(Buffer.from(artifact.bytes).toString("utf8")), `checkpoint ${index + 1} parsed bytes drift`);
  }
  const [preparedArtifact, submittedArtifact, appliedArtifact] = artifacts;
  validateRavioliSupersededRecoveryCheckpoint(
    preparedArtifact.value as RavioliSupersededRecoveryCheckpoint,
    {
      phase: "PREPARED",
      preflightSha256: expected.preflightSha256,
      intentSha256: expected.intentSha256,
      previousRecordSha256: expected.intentSha256,
      estimate: expected.estimate,
    },
  );
  validateRavioliSupersededRecoveryCheckpoint(
    submittedArtifact.value as RavioliSupersededRecoveryCheckpoint,
    {
      phase: "SUBMITTED",
      preflightSha256: expected.preflightSha256,
      intentSha256: expected.intentSha256,
      previousRecordSha256: preparedArtifact.sha256,
      estimate: expected.estimate,
    },
  );
  validateRavioliSupersededRecoveryCheckpoint(
    appliedArtifact.value as RavioliSupersededRecoveryCheckpoint,
    {
      phase: "APPLIED",
      preflightSha256: expected.preflightSha256,
      intentSha256: expected.intentSha256,
      previousRecordSha256: submittedArtifact.sha256,
      estimate: expected.estimate,
    },
  );
  const submitted = submittedArtifact.value as RavioliSupersededRecoveryCheckpoint;
  const applied = appliedArtifact.value as RavioliSupersededRecoveryCheckpoint;
  assert.equal(submitted.operationHash, expected.operation.hash, "SUBMITTED checkpoint hash differs from TzKT operation");
  assert.deepEqual(applied.operation, expected.operation, "APPLIED checkpoint differs from TzKT operation");
  return {
    preparedSha256: preparedArtifact.sha256,
    submittedSha256: submittedArtifact.sha256,
    appliedSha256: appliedArtifact.sha256,
  };
}

async function writeNewDurableJson(filePath: string, value: unknown): Promise<JsonArtifact> {
  const bytes = deterministicJsonBytes(value);
  const file = await open(filePath, "wx", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  return { value: value as JsonObject, bytes, sha256: sha256(bytes) };
}

function safeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed) && parsed >= 0, `${label} must be a non-negative safe integer`);
  return parsed;
}

function validIso(value: unknown, label: string): string {
  const text = String(value || "");
  assert.ok(Number.isFinite(Date.parse(text)), `${label} must be an ISO timestamp`);
  return text;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return value;
}

function exactNetwork(value: JsonObject, label: string): void {
  assert.equal(value.network?.name, "shadownet", `${label} network must be Shadownet`);
  assert.equal(value.network?.chainId, SHADOWNET_CHAIN_ID, `${label} chain id drift`);
  assert.ok(
    [normalizeBase(SHADOWNET_RPC_PRIMARY), normalizeBase(SHADOWNET_RPC_FALLBACK)].includes(
      normalizeBase(String(value.network?.rpcUrl || "")),
    ),
    `${label} RPC is not a configured Shadownet endpoint`,
  );
}

function assertRunRoot(environment: Record<string, string | undefined>, mode: "execution" | "reconciliation"): string {
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", `superseded-v2 recovery ${mode} only permits Shadownet`);
  const runRoot = environment[RAVIOLI_SUPERSEDED_RECOVERY_OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${RAVIOLI_SUPERSEDED_RECOVERY_OUTPUT_ENV} must point to the accepted Pasta proof run`);
  assert.equal(path.basename(path.resolve(runRoot)), RAVIOLI_SUPERSEDED_RECOVERY_RUN_ID, `superseded-v2 recovery ${mode} requires the exact accepted run`);
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_ROUTER",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_GNOCCHI",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_CREATOR",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_TOKEN_ID",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_V2_RECOVERY_RESUME",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_RECOVERY_ROUTER",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_RECOVERY_CREATOR",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_RECOVERY_TOKEN_ID",
    "PASTA_SHADOWNET_RAVIOLI_SUPERSEDED_RECOVERY_RESUME",
  ]) {
    assert.ok(!environment[forbidden]?.trim(), `superseded-v2 recovery forbids override ${forbidden}`);
  }
  return runRoot;
}

export function assertRavioliSupersededRecoveryExecutionAllowed(environment: Record<string, string | undefined>): string {
  assert.equal(environment[RAVIOLI_SUPERSEDED_RECOVERY_EXECUTE_FLAG], "1", `explicit ${RAVIOLI_SUPERSEDED_RECOVERY_EXECUTE_FLAG}=1 is required`);
  assert.ok(!environment[RAVIOLI_SUPERSEDED_RECOVERY_RECONCILE_FLAG]?.trim(), "execution forbids the reconciliation flag");
  return assertRunRoot(environment, "execution");
}

export function assertRavioliSupersededRecoveryReconciliationAllowed(environment: Record<string, string | undefined>): string {
  assert.equal(environment[RAVIOLI_SUPERSEDED_RECOVERY_RECONCILE_FLAG], "1", `explicit ${RAVIOLI_SUPERSEDED_RECOVERY_RECONCILE_FLAG}=1 is required`);
  assert.ok(!environment[RAVIOLI_SUPERSEDED_RECOVERY_EXECUTE_FLAG]?.trim(), "read-only reconciliation forbids the execution flag");
  return assertRunRoot(environment, "reconciliation");
}

function targetOperatorKey(): RavioliSupersededOperatorKey {
  return {
    owner: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
    operator: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
    tokenId: RAVIOLI_SUPERSEDED_RECOVERY_TOKEN_ID,
  };
}

export function ravioliSupersededRecoveryCall(): RavioliSupersededRecoveryCall {
  return {
    contractAddress: RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI,
    entrypoint: "update_operators",
    payload: [{
      remove_operator: {
        owner: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
        operator: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
        token_id: RAVIOLI_SUPERSEDED_RECOVERY_TOKEN_ID,
      },
    }],
  };
}

function assertExactRecoveryCall(actual: unknown): void {
  assert.deepEqual(canonical(actual), canonical(ravioliSupersededRecoveryCall()), "superseded-v2 recovery call differs from the exact one-key removal plan");
}

export function ravioliSupersededRecoverySendOptions(estimate: JsonObject): RavioliSupersededRecoverySendOptions {
  const gasLimit = safeInteger(estimate.gasLimit, "superseded-v2 recovery estimated gas");
  const storageLimit = safeInteger(estimate.storageLimit, "superseded-v2 recovery estimated storage");
  const suggestedFeeMutez = safeInteger(estimate.suggestedFeeMutez, "superseded-v2 recovery suggested fee");
  const minimalFeeMutez = safeInteger(estimate.minimalFeeMutez, "superseded-v2 recovery minimal fee");
  assert.ok(gasLimit > 0 && gasLimit <= MAX_GAS_LIMIT, "superseded-v2 recovery gas exceeds policy");
  assert.ok(storageLimit <= MAX_STORAGE_LIMIT, "superseded-v2 recovery storage exceeds policy");
  const fee = Math.max(suggestedFeeMutez, minimalFeeMutez) + RECOVERY_FEE_HEADROOM_MUTEZ;
  assert.ok(fee <= MAX_FEE_MUTEZ, "superseded-v2 recovery fee exceeds policy");
  return { amount: 0, mutez: true, fee, gasLimit, storageLimit };
}

function assertMapSet(
  actual: Record<string, RavioliSupersededMapFingerprint>,
  expected: Record<string, RavioliSupersededMapFingerprint>,
  label: string,
): void {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label} big-map names drift`);
  for (const [name, spec] of Object.entries(expected)) {
    const candidate = actual[name];
    assert.ok(candidate, `${label} is missing ${name}`);
    assert.equal(candidate.id, spec.id, `${label} ${name} id drift`);
    assert.equal(candidate.activeKeyCount, spec.activeKeyCount, `${label} ${name} active-key count drift`);
    assert.equal(candidate.sha256, spec.sha256, `${label} ${name} state fingerprint drift`);
  }
}

function sortedOperators(records: readonly RavioliSupersededOperatorRecord[]): RavioliSupersededOperatorRecord[] {
  return [...records].sort((left, right) => {
    const leftKey = `${left.key.owner}:${left.key.operator}:${left.key.tokenId}`;
    const rightKey = `${right.key.owner}:${right.key.operator}:${right.key.tokenId}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function assertRavioliSupersededRecoveryState(
  state: RavioliSupersededRecoveryState,
  phase: "before" | "after",
): void {
  assert.ok(Number.isSafeInteger(state.level) && state.level >= RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL, `${phase} state level is invalid`);
  assert.deepEqual(state.router, {
    ...state.router,
    address: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
    kind: "asset",
    tzips: ["fa2"],
    typeHash: EXPECTED_ROUTER_TYPE_HASH,
    codeHash: EXPECTED_ROUTER_CODE_HASH,
    creator: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
    administrator: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
    pendingAdministrator: null,
    nextTokenId: 0,
    indexFacts: {
      numTransactions: 0,
      tokensCount: 0,
      activeTokensCount: 0,
      tokenBalancesCount: 0,
      tokenTransfersCount: 0,
    },
  }, `${phase} orphan router identity or empty-state facts drift`);
  assertMapSet(state.router.bigMaps, RAVIOLI_SUPERSEDED_ROUTER_BIG_MAPS, `${phase} orphan router`);

  assert.equal(state.gnocchi.address, RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI, `${phase} Gnocchi address drift`);
  assert.equal(state.gnocchi.kind, "asset", `${phase} Gnocchi kind drift`);
  assert.deepEqual(state.gnocchi.tzips, ["fa2"], `${phase} Gnocchi TZIP drift`);
  assert.equal(state.gnocchi.typeHash, EXPECTED_GNOCCHI_TYPE_HASH, `${phase} Gnocchi type hash drift`);
  assert.equal(state.gnocchi.codeHash, EXPECTED_GNOCCHI_CODE_HASH, `${phase} Gnocchi code hash drift`);
  assert.equal(state.gnocchi.creator, RAVIOLI_SUPERSEDED_RECOVERY_CREATOR, `${phase} Gnocchi creator drift`);
  assert.equal(state.gnocchi.administrator, RAVIOLI_SUPERSEDED_RECOVERY_CREATOR, `${phase} Gnocchi administrator drift`);
  assert.equal(state.gnocchi.pendingAdministrator, null, `${phase} Gnocchi pending administrator drift`);
  assert.equal(state.gnocchi.nextTokenId, 3, `${phase} Gnocchi next token id drift`);
  assert.equal(state.gnocchi.operatorBigMapId, 29_226, `${phase} Gnocchi operator big-map id drift`);
  assertMapSet(state.gnocchi.protectedBigMaps, RAVIOLI_SUPERSEDED_GNOCCHI_PROTECTED_BIG_MAPS, `${phase} Gnocchi protected state`);
  assert.deepEqual(
    sortedOperators(state.gnocchi.nonTargetOperators),
    sortedOperators(RAVIOLI_SUPERSEDED_NON_TARGET_OPERATORS),
    `${phase} unrelated Gnocchi operators drift`,
  );

  const target = state.gnocchi.targetOperator;
  assert.equal(target.hash, EXPECTED_TARGET_OPERATOR_HASH, `${phase} target operator expression hash drift`);
  assert.deepEqual(target.key, targetOperatorKey(), `${phase} target operator key drift`);
  assert.equal(target.firstLevel, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL, `${phase} target operator first level drift`);
  if (phase === "before") {
    assert.equal(target.active, true, "superseded-v2 target operator is not active before recovery");
    assert.equal(target.lastLevel, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL, "superseded-v2 target operator changed after its exact addition");
    assert.equal(target.updates, 1, "superseded-v2 target operator update count drift before recovery");
  } else {
    assert.equal(target.active, false, "superseded-v2 target operator remains active after recovery");
    assert.ok(target.lastLevel > RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL, "target operator tombstone predates recovery");
    assert.equal(target.updates, 2, "target operator tombstone must contain exactly the add and remove updates");
  }
}

function stateWithoutLevel(state: RavioliSupersededRecoveryState): Omit<RavioliSupersededRecoveryState, "level"> {
  const { level: _level, ...rest } = state;
  return rest;
}

export function assertRavioliSupersededRecoveryPreSubmitUnchanged(
  before: RavioliSupersededRecoveryState,
  current: RavioliSupersededRecoveryState,
): void {
  assertRavioliSupersededRecoveryState(before, "before");
  assertRavioliSupersededRecoveryState(current, "before");
  assert.deepEqual(stateWithoutLevel(current), stateWithoutLevel(before), "superseded-v2 state changed between durable preflight and intent");
  assert.ok(current.level >= before.level, "pre-submit state level predates preflight");
}

export function assertRavioliSupersededRecoveryTransition(
  before: RavioliSupersededRecoveryState,
  after: RavioliSupersededRecoveryState,
  operation: RavioliSupersededRecoveryOperation,
): void {
  assertRavioliSupersededRecoveryState(before, "before");
  assertRavioliSupersededRecoveryState(after, "after");
  assert.deepEqual(after.router, before.router, "recovery mutated the empty orphan router");
  assert.deepEqual(after.gnocchi.protectedBigMaps, before.gnocchi.protectedBigMaps, "recovery changed protected Gnocchi state");
  assert.deepEqual(
    sortedOperators(after.gnocchi.nonTargetOperators),
    sortedOperators(before.gnocchi.nonTargetOperators),
    "recovery changed an unrelated Gnocchi operator",
  );
  for (const field of ["address", "kind", "tzips", "typeHash", "codeHash", "creator", "administrator", "pendingAdministrator", "nextTokenId", "operatorBigMapId"] as const) {
    assert.deepEqual(after.gnocchi[field], before.gnocchi[field], `recovery changed Gnocchi ${field}`);
  }
  assert.equal(after.gnocchi.targetOperator.hash, before.gnocchi.targetOperator.hash, "target operator expression changed");
  assert.deepEqual(after.gnocchi.targetOperator.key, before.gnocchi.targetOperator.key, "target operator key changed");
  assert.equal(after.gnocchi.targetOperator.firstLevel, before.gnocchi.targetOperator.firstLevel, "target operator first level changed");
  assert.equal(after.gnocchi.targetOperator.lastLevel, operation.level, "target operator tombstone does not bind the recovery operation level");
  assert.ok(after.level >= operation.level, "post-state predates the recovery operation");
}

export function validateRavioliSupersededCauseOperations(
  originationRows: unknown,
  operatorRows: unknown,
): RavioliSupersededCauseEvidence {
  assert.ok(Array.isArray(originationRows), "TzKT origination evidence must be an array");
  assert.ok(Array.isArray(operatorRows), "TzKT operator-add evidence must be an array");
  const originMatches = originationRows.filter((row: JsonObject) =>
    row?.hash === RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH &&
    row?.status === "applied" &&
    row?.sender?.address === RAVIOLI_SUPERSEDED_RECOVERY_CREATOR &&
    row?.originatedContract?.address === RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
  );
  assert.equal(originMatches.length, 1, "TzKT lacks the exact orphan-router origination");
  const origin = originMatches[0];
  assert.equal(safeInteger(origin.counter, "orphan-router origination counter"), RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_COUNTER);
  assert.equal(safeInteger(origin.level, "orphan-router origination level"), RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_LEVEL);
  assert.equal(origin.originatedContract.kind, "asset");
  assert.equal(Number(origin.originatedContract.typeHash), EXPECTED_ROUTER_TYPE_HASH);
  assert.equal(Number(origin.originatedContract.codeHash), EXPECTED_ROUTER_CODE_HASH);
  assert.deepEqual((origin.originatedContract.tzips || []).map((value: unknown) => String(value).toLowerCase()), ["fa2"]);

  const addMatches = operatorRows.filter((row: JsonObject) =>
    row?.hash === RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH &&
    row?.status === "applied" &&
    row?.sender?.address === RAVIOLI_SUPERSEDED_RECOVERY_CREATOR &&
    row?.target?.address === RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI &&
    row?.parameter?.entrypoint === "update_operators",
  );
  assert.equal(addMatches.length, 1, "TzKT lacks the exact dangling-operator addition");
  const addition = addMatches[0];
  assert.equal(safeInteger(addition.counter, "operator-add counter"), RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER);
  assert.equal(safeInteger(addition.level, "operator-add level"), RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL);
  assert.equal(safeInteger(addition.amount, "operator-add tez amount"), 0);
  assert.equal(addition.hasInternals, false, "operator-add operation unexpectedly has internals");
  assert.deepEqual(canonical(addition.parameter.value), canonical([{
    add_operator: {
      owner: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
      operator: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
      token_id: 0,
    },
  }]), "dangling-operator addition payload drift");

  return {
    origination: {
      hash: RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH,
      counter: RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_COUNTER,
      level: RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_LEVEL,
      timestamp: validIso(origin.timestamp, "orphan-router origination timestamp"),
      sender: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
      originatedContract: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
      kind: "asset",
      typeHash: EXPECTED_ROUTER_TYPE_HASH,
      codeHash: EXPECTED_ROUTER_CODE_HASH,
      tzips: ["fa2"],
    },
    operatorAddition: {
      hash: RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH,
      counter: RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER,
      level: RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL,
      timestamp: validIso(addition.timestamp, "operator-add timestamp"),
      sender: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
      call: {
        contractAddress: RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI,
        entrypoint: "update_operators",
        payload: [{ add_operator: { owner: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR, operator: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER, token_id: 0 } }],
      },
    },
  };
}

export function validateRavioliSupersededRecoveryOperation(
  rows: unknown,
  operationHash?: string,
): RavioliSupersededRecoveryOperation {
  assert.ok(Array.isArray(rows), "TzKT superseded-v2 recovery response must be an array");
  const hash = operationHash || String((rows as JsonObject[]).find((row) => Number(row?.counter) === RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER)?.hash || "");
  assert.equal(validateOperation(hash), ValidationResult.VALID, "superseded-v2 recovery operation hash is invalid");
  const matches = rows.filter((row: JsonObject) =>
    row?.hash === hash &&
    row?.status === "applied" &&
    row?.sender?.address === RAVIOLI_SUPERSEDED_RECOVERY_CREATOR &&
    row?.target?.address === RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI &&
    row?.parameter?.entrypoint === "update_operators" &&
    Number(row?.counter) === RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
  );
  assert.equal(matches.length, 1, "TzKT lacks the exact applied superseded-v2 recovery operation");
  const row = matches[0];
  assert.equal(safeInteger(row.amount, "superseded-v2 recovery tez amount"), 0, "superseded-v2 recovery unexpectedly transferred tez");
  assert.equal(row.hasInternals, false, "superseded-v2 recovery unexpectedly created internal operations");
  assertExactRecoveryCall({
    contractAddress: row.target.address,
    entrypoint: row.parameter.entrypoint,
    payload: row.parameter.value,
  });
  const level = safeInteger(row.level, "superseded-v2 recovery operation level");
  assert.ok(level > RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL, "superseded-v2 recovery operation predates the dangling authorization");
  return {
    hash,
    counter: RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
    level,
    timestamp: validIso(row.timestamp, "superseded-v2 recovery operation timestamp"),
    explorerUrl: `https://shadownet.tzkt.io/${hash}`,
    call: ravioliSupersededRecoveryCall(),
  };
}

function assertLane(snapshot: RavioliSupersededLaneSnapshot, expectedCounter: number, label: string): void {
  assert.ok([normalizeBase(SHADOWNET_RPC_PRIMARY), normalizeBase(SHADOWNET_RPC_FALLBACK)].includes(normalizeBase(snapshot.rpcUrl)), `${label} RPC URL drift`);
  assert.equal(snapshot.counter, expectedCounter, `${label} creator counter drift`);
  assert.ok(Number.isSafeInteger(snapshot.balanceMutez) && snapshot.balanceMutez >= 0, `${label} balance is invalid`);
  assert.ok(Number.isSafeInteger(snapshot.headLevel) && snapshot.headLevel >= RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL, `${label} head level is invalid`);
  assert.equal(snapshot.activeOperationCount, 0, `${label} creator mempool is not clear`);
}

function assertDualLanes(input: JsonObject, expectedCounter: number, label: string): void {
  assertLane(input.primary, expectedCounter, `${label} primary lane`);
  assertLane(input.fallback, expectedCounter, `${label} fallback lane`);
  assert.notEqual(normalizeBase(input.primary.rpcUrl), normalizeBase(input.fallback.rpcUrl), `${label} requires two distinct RPCs`);
  assert.equal(input.primary.counter, input.fallback.counter, `${label} RPC counters disagree`);
}

export function buildRavioliSupersededRecoveryPreflight(input: {
  createdAt: string;
  rpcUrl: string;
  cause: RavioliSupersededCauseEvidence;
  before: RavioliSupersededRecoveryState;
  lanes: { primary: RavioliSupersededLaneSnapshot; fallback: RavioliSupersededLaneSnapshot };
}): JsonObject {
  assertRavioliSupersededRecoveryState(input.before, "before");
  assertDualLanes(input.lanes, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "preflight");
  return {
    schema: "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-preflight@1",
    status: "PREFLIGHT-PASSED-NOT-YET-AUTHORIZED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    createdAt: validIso(input.createdAt, "preflight creation time"),
    reason: "Remove only the orphan Ravioli router's dangling Gnocchi token-0 operator authorization; do not resume or mutate the empty router.",
    causeOperations: input.cause,
    before: input.before,
    lanes: input.lanes,
    exactRecoveryPlan: [ravioliSupersededRecoveryCall()],
    expectedSubmissionCounter: RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
  };
}

export function validateRavioliSupersededRecoveryPreflight(preflight: JsonObject): JsonObject {
  assert.equal(preflight.schema, "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-preflight@1", "preflight schema drift");
  assert.equal(preflight.status, "PREFLIGHT-PASSED-NOT-YET-AUTHORIZED", "preflight status drift");
  exactNetwork(preflight, "preflight");
  validIso(preflight.createdAt, "preflight creation time");
  assert.deepEqual(preflight.exactRecoveryPlan, [ravioliSupersededRecoveryCall()], "preflight recovery plan drift");
  assert.equal(preflight.expectedSubmissionCounter, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "preflight submission counter drift");
  assertRavioliSupersededRecoveryState(preflight.before as RavioliSupersededRecoveryState, "before");
  assertDualLanes(preflight.lanes, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "preflight");
  assert.equal(preflight.causeOperations?.origination?.hash, RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH);
  assert.equal(preflight.causeOperations?.operatorAddition?.hash, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH);
  return preflight;
}

export function buildRavioliSupersededRecoveryIntent(input: {
  createdAt: string;
  rpcUrl: string;
  preflightSha256: string;
  before: RavioliSupersededRecoveryState;
  preSubmit: RavioliSupersededRecoveryState;
  lanes: { primary: RavioliSupersededLaneSnapshot; fallback: RavioliSupersededLaneSnapshot };
  estimate: RavioliSupersededRecoveryEstimate;
}): JsonObject {
  assert.match(input.preflightSha256, /^[0-9a-f]{64}$/);
  assertRavioliSupersededRecoveryPreSubmitUnchanged(input.before, input.preSubmit);
  assertDualLanes(input.lanes, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "intent");
  assertExactRecoveryCall(input.estimate.call);
  assert.deepEqual(input.estimate.sendOptions, ravioliSupersededRecoverySendOptions(input.estimate), "intent estimate is not bound to exact send options");
  assert.ok(input.estimate.sendOptions.fee + input.estimate.burnFeeMutez <= RECOVERY_OPERATION_RESERVE_MUTEZ, "intent estimated recovery cost exceeds reserve");
  return {
    schema: "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-intent@1",
    status: "AUTHORIZED-NOT-YET-SUBMITTED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    createdAt: validIso(input.createdAt, "intent creation time"),
    preflightSha256: input.preflightSha256,
    before: input.before,
    preSubmit: input.preSubmit,
    lanes: input.lanes,
    estimate: input.estimate,
    exactCallPlan: [ravioliSupersededRecoveryCall()],
    expectedSubmissionCounter: RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
  };
}

export function validateRavioliSupersededRecoveryIntent(intent: JsonObject, preflight: JsonObject, preflightSha256: string): JsonObject {
  assert.equal(intent.schema, "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-intent@1", "intent schema drift");
  assert.equal(intent.status, "AUTHORIZED-NOT-YET-SUBMITTED", "intent status drift");
  exactNetwork(intent, "intent");
  validIso(intent.createdAt, "intent creation time");
  assert.equal(intent.preflightSha256, preflightSha256, "intent preflight SHA-256 drift");
  assert.deepEqual(intent.before, preflight.before, "intent pre-state differs from durable preflight");
  assertRavioliSupersededRecoveryPreSubmitUnchanged(intent.before, intent.preSubmit);
  assertDualLanes(intent.lanes, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "intent");
  assert.deepEqual(intent.exactCallPlan, [ravioliSupersededRecoveryCall()], "intent call plan drift");
  assert.equal(intent.expectedSubmissionCounter, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "intent submission counter drift");
  assertExactRecoveryCall(intent.estimate?.call);
  assert.deepEqual(intent.estimate?.sendOptions, ravioliSupersededRecoverySendOptions(intent.estimate || {}), "intent send options drift");
  return intent;
}

export function validateRavioliSupersededRecoveryProgress(
  progress: JsonObject,
  preflightSha256: string,
  intentSha256: string,
  operation: RavioliSupersededRecoveryOperation,
  checkpoints?: RavioliSupersededRecoveryCheckpointHashes,
): void {
  assert.equal(progress.schema, "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-progress@1", "progress schema drift");
  assert.equal(progress.status, "APPLIED", "progress status drift");
  assert.equal(progress.preflightSha256, preflightSha256, "progress preflight SHA-256 drift");
  assert.equal(progress.intentSha256, intentSha256, "progress intent SHA-256 drift");
  if (checkpoints !== undefined) {
    assert.deepEqual(progress.checkpoints, checkpoints, "progress checkpoint hash chain drift");
  }
  assert.deepEqual(progress.operation, operation, "progress operation differs from exact TzKT evidence");
}

export function buildRavioliSupersededRecoveryReceipt(input: {
  completedAt: string;
  preflight: JsonObject;
  preflightSha256: string;
  intent: JsonObject;
  intentSha256: string;
  operation: RavioliSupersededRecoveryOperation;
  after: RavioliSupersededRecoveryState;
  lanesAfter: { primary: RavioliSupersededLaneSnapshot; fallback: RavioliSupersededLaneSnapshot };
}): JsonObject {
  validateRavioliSupersededRecoveryPreflight(input.preflight);
  validateRavioliSupersededRecoveryIntent(input.intent, input.preflight, input.preflightSha256);
  assert.match(input.intentSha256, /^[0-9a-f]{64}$/);
  assertRavioliSupersededRecoveryTransition(input.preflight.before, input.after, input.operation);
  assertDualLanes(input.lanesAfter, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "receipt terminal");
  return {
    schema: "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery@1",
    classification: "CHAIN-LIVE-EXACT-OPERATOR-RECOVERY",
    status: "PASSED",
    network: input.intent.network,
    startedAt: input.intent.createdAt,
    completedAt: validIso(input.completedAt, "receipt completion time"),
    preflightSha256: input.preflightSha256,
    intentSha256: input.intentSha256,
    causeOperations: input.preflight.causeOperations,
    before: input.preflight.before,
    preSubmit: input.intent.preSubmit,
    estimate: input.intent.estimate,
    operation: input.operation,
    after: input.after,
    lanes: { before: input.preflight.lanes, after: input.lanesAfter },
    links: {
      router: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_ROUTER}`,
      gnocchi: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI}`,
      origination: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH}`,
      operatorAddition: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH}`,
      recovery: input.operation.explorerUrl,
    },
    invariants: {
      exactRemovedOperator: targetOperatorKey(),
      otherOperatorsMutated: false,
      gnocchiProtectedStateMutated: false,
      orphanRouterMutated: false,
      orphanRouterPackCount: 0,
      callCount: 1,
      entrypoint: "update_operators",
      internalOperationCount: 0,
      terminalCounter: RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
    },
  };
}

export function validateRavioliSupersededRecoveryReceipt(
  receipt: JsonObject,
  preflight: JsonObject,
  preflightSha256: string,
  intent: JsonObject,
  intentSha256: string,
): void {
  assert.equal(receipt.schema, "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery@1", "receipt schema drift");
  assert.equal(receipt.classification, "CHAIN-LIVE-EXACT-OPERATOR-RECOVERY", "receipt classification drift");
  assert.equal(receipt.status, "PASSED", "receipt is not passed");
  exactNetwork(receipt, "receipt");
  assert.equal(receipt.preflightSha256, preflightSha256, "receipt preflight SHA-256 drift");
  assert.equal(receipt.intentSha256, intentSha256, "receipt intent SHA-256 drift");
  assert.deepEqual(receipt.causeOperations, preflight.causeOperations, "receipt cause evidence drift");
  assert.deepEqual(receipt.before, preflight.before, "receipt pre-state drift");
  assert.deepEqual(receipt.preSubmit, intent.preSubmit, "receipt pre-submit state drift");
  assert.deepEqual(receipt.estimate, intent.estimate, "receipt estimate drift");
  const startedAt = Date.parse(validIso(receipt.startedAt, "receipt start time"));
  const completedAt = Date.parse(validIso(receipt.completedAt, "receipt completion time"));
  const operationAt = Date.parse(validIso(receipt.operation?.timestamp, "receipt operation time"));
  assert.ok(completedAt >= startedAt, "receipt completion predates intent");
  assert.ok(operationAt >= startedAt && operationAt <= completedAt, "receipt operation time falls outside recovery window");
  assert.equal(receipt.operation?.counter, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "receipt operation counter drift");
  assertExactRecoveryCall(receipt.operation?.call);
  assertRavioliSupersededRecoveryTransition(receipt.before, receipt.after, receipt.operation);
  assertDualLanes(receipt.lanes?.before, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "receipt preflight");
  assertDualLanes(receipt.lanes?.after, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "receipt terminal");
  assert.deepEqual(receipt.links, {
    router: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_ROUTER}`,
    gnocchi: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI}`,
    origination: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH}`,
    operatorAddition: `https://shadownet.tzkt.io/${RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH}`,
    recovery: receipt.operation.explorerUrl,
  }, "receipt explorer links drift");
  assert.deepEqual(receipt.invariants, {
    exactRemovedOperator: targetOperatorKey(),
    otherOperatorsMutated: false,
    gnocchiProtectedStateMutated: false,
    orphanRouterMutated: false,
    orphanRouterPackCount: 0,
    callCount: 1,
    entrypoint: "update_operators",
    internalOperationCount: 0,
    terminalCounter: RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
  }, "receipt invariants drift");
}

async function fetchJson(url: string): Promise<any> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "wtfos-pasta-ravioli-superseded-v2-20260722b-operator-recovery" } });
      assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

function fingerprintRows(id: number, rows: unknown, label: string): RavioliSupersededMapFingerprint {
  assert.ok(Array.isArray(rows), `${label} rows must be an array`);
  const canonicalRows = rows.map((row: JsonObject) => ({ key: row.key, value: row.value }));
  canonicalRows.sort((left, right) => {
    const leftKey = JSON.stringify(left.key);
    const rightKey = JSON.stringify(right.key);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return { id, activeKeyCount: canonicalRows.length, sha256: sha256(deterministicJsonBytes(canonicalRows)) };
}

async function readBigMapSet(
  specs: Record<string, { id: number }>,
): Promise<Record<string, RavioliSupersededMapFingerprint>> {
  const result: Record<string, RavioliSupersededMapFingerprint> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const rows = await fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${spec.id}/keys?active=true&limit=10000`);
    result[name] = fingerprintRows(spec.id, rows, name);
  }
  return result;
}

function normalizeOperatorRow(row: JsonObject): RavioliSupersededOperatorRecord {
  assert.ok(row && typeof row === "object", "operator row is missing");
  return {
    active: row.active === true,
    hash: String(row.hash || ""),
    key: {
      owner: String(row.key?.owner || ""),
      operator: String(row.key?.operator || ""),
      tokenId: safeInteger(row.key?.token_id, "operator token id"),
    },
    firstLevel: safeInteger(row.firstLevel, "operator first level"),
    lastLevel: safeInteger(row.lastLevel, "operator last level"),
    updates: safeInteger(row.updates, "operator update count"),
  };
}

async function readRavioliSupersededRecoveryState(): Promise<RavioliSupersededRecoveryState> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [head, routerContract, routerStorage, gnocchiContract, gnocchiStorage] = await Promise.all([
    fetchJson(`${base}/head`),
    fetchJson(`${base}/contracts/${RAVIOLI_SUPERSEDED_RECOVERY_ROUTER}`),
    fetchJson(`${base}/contracts/${RAVIOLI_SUPERSEDED_RECOVERY_ROUTER}/storage`),
    fetchJson(`${base}/contracts/${RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI}`),
    fetchJson(`${base}/contracts/${RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI}/storage`),
  ]);
  for (const [name, spec] of Object.entries(RAVIOLI_SUPERSEDED_ROUTER_BIG_MAPS)) {
    assert.equal(safeInteger(routerStorage?.[name], `router ${name} big-map id`), spec.id);
  }
  for (const [name, spec] of Object.entries(RAVIOLI_SUPERSEDED_GNOCCHI_PROTECTED_BIG_MAPS)) {
    assert.equal(safeInteger(gnocchiStorage?.[name], `Gnocchi ${name} big-map id`), spec.id);
  }
  assert.equal(safeInteger(gnocchiStorage?.operators, "Gnocchi operators big-map id"), 29_226);
  const [routerBigMaps, protectedBigMaps, activeOperatorRows, targetOperatorRow] = await Promise.all([
    readBigMapSet(RAVIOLI_SUPERSEDED_ROUTER_BIG_MAPS),
    readBigMapSet(RAVIOLI_SUPERSEDED_GNOCCHI_PROTECTED_BIG_MAPS),
    fetchJson(`${base}/bigmaps/29226/keys?active=true&limit=10000`),
    fetchJson(`${base}/bigmaps/29226/keys/${EXPECTED_TARGET_OPERATOR_HASH}`),
  ]);
  assert.ok(Array.isArray(activeOperatorRows), "active Gnocchi operators must be an array");
  const operators = activeOperatorRows.map(normalizeOperatorRow);
  const target = normalizeOperatorRow(targetOperatorRow);
  const nonTargetOperators = operators.filter((record) => record.hash !== EXPECTED_TARGET_OPERATOR_HASH);
  assert.equal(
    operators.some((record) => record.hash === EXPECTED_TARGET_OPERATOR_HASH),
    target.active,
    "active operator list and exact target-key record disagree",
  );
  return {
    level: safeInteger(head?.level, "TzKT head level"),
    router: {
      address: RAVIOLI_SUPERSEDED_RECOVERY_ROUTER,
      kind: routerContract?.kind,
      tzips: (routerContract?.tzips || []).map((value: unknown) => String(value).toLowerCase()),
      typeHash: Number(routerContract?.typeHash),
      codeHash: Number(routerContract?.codeHash),
      creator: routerContract?.creator?.address,
      administrator: routerStorage?.administrator,
      pendingAdministrator: routerStorage?.pending_administrator,
      nextTokenId: safeInteger(routerStorage?.next_token_id, "router next token id"),
      indexFacts: {
        numTransactions: safeInteger(routerContract?.numTransactions, "router transaction count"),
        tokensCount: safeInteger(routerContract?.tokensCount, "router token count"),
        activeTokensCount: safeInteger(routerContract?.activeTokensCount, "router active token count"),
        tokenBalancesCount: safeInteger(routerContract?.tokenBalancesCount, "router token-balance count"),
        tokenTransfersCount: safeInteger(routerContract?.tokenTransfersCount, "router token-transfer count"),
      },
      bigMaps: routerBigMaps as RavioliSupersededRecoveryState["router"]["bigMaps"],
    },
    gnocchi: {
      address: RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI,
      kind: gnocchiContract?.kind,
      tzips: (gnocchiContract?.tzips || []).map((value: unknown) => String(value).toLowerCase()),
      typeHash: Number(gnocchiContract?.typeHash),
      codeHash: Number(gnocchiContract?.codeHash),
      creator: gnocchiContract?.creator?.address,
      administrator: gnocchiStorage?.administrator,
      pendingAdministrator: gnocchiStorage?.pending_administrator,
      nextTokenId: safeInteger(gnocchiStorage?.next_token_id, "Gnocchi next token id"),
      operatorBigMapId: 29_226,
      targetOperator: target,
      nonTargetOperators,
      protectedBigMaps: protectedBigMaps as RavioliSupersededRecoveryState["gnocchi"]["protectedBigMaps"],
    },
  };
}

async function pollRavioliSupersededAfterState(): Promise<RavioliSupersededRecoveryState> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const state = await readRavioliSupersededRecoveryState();
      assertRavioliSupersededRecoveryState(state, "after");
      return state;
    } catch (error) {
      lastError = error;
      if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 4_000));
    }
  }
  throw new Error(`superseded-v2 recovery terminal state did not converge: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function readLane(rpcUrl: string): Promise<RavioliSupersededLaneSnapshot> {
  const base = normalizeBase(rpcUrl);
  const [chainIdResponse, counterResponse, balanceResponse, header, mempool] = await Promise.all([
    fetch(`${base}/chains/main/chain_id`, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${base}/chains/main/blocks/head/context/contracts/${RAVIOLI_SUPERSEDED_RECOVERY_CREATOR}/counter`, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${base}/chains/main/blocks/head/context/contracts/${RAVIOLI_SUPERSEDED_RECOVERY_CREATOR}/balance`, { signal: AbortSignal.timeout(30_000) }),
    fetchJson(`${base}/chains/main/blocks/head/header`),
    fetchJson(`${base}/chains/main/mempool/pending_operations`),
  ]);
  assert.ok(chainIdResponse.ok && counterResponse.ok && balanceResponse.ok, `${rpcUrl} lane read failed`);
  assert.equal(JSON.parse(await chainIdResponse.text()), SHADOWNET_CHAIN_ID, `${rpcUrl} chain id drift`);
  const liveBuckets = ["applied", "validated", "branch_delayed", "unprocessed"];
  const active = liveBuckets.flatMap((bucket) => Array.isArray(mempool?.[bucket]) ? mempool[bucket] : [])
    .map((entry: JsonObject | [string, JsonObject]) => Array.isArray(entry) ? entry[1] : entry)
    .filter((operation: JsonObject) => operation?.contents?.some((content: JsonObject) => content?.source === RAVIOLI_SUPERSEDED_RECOVERY_CREATOR));
  assert.equal(active.length, 0, `${rpcUrl} has an active creator operation in the mempool`);
  return {
    rpcUrl: normalizeBase(rpcUrl),
    counter: safeInteger(JSON.parse(await counterResponse.text()), `${rpcUrl} creator counter`),
    balanceMutez: safeInteger(JSON.parse(await balanceResponse.text()), `${rpcUrl} creator balance`),
    headLevel: safeInteger(header?.level, `${rpcUrl} head level`),
    activeOperationCount: 0,
  };
}

async function readCauseOperations(): Promise<RavioliSupersededCauseEvidence> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [originationRows, operatorRows] = await Promise.all([
    fetchJson(`${base}/operations/originations/${RAVIOLI_SUPERSEDED_RECOVERY_ORIGINATION_HASH}`),
    fetchJson(`${base}/operations/transactions/${RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_HASH}`),
  ]);
  return validateRavioliSupersededCauseOperations(originationRows, operatorRows);
}

async function readJsonArtifact(filePath: string): Promise<JsonArtifact> {
  const file = await stat(filePath);
  assert.ok(file.isFile(), `${filePath} is not a regular file`);
  const bytes = await readFile(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
}

async function readOptionalProgress(recoveryRoot: string): Promise<JsonObject | undefined> {
  try {
    return (await readJsonArtifact(path.join(recoveryRoot, "recovery-progress.json"))).value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readRecoveryCheckpoints(recoveryRoot: string): Promise<JsonArtifact[]> {
  const checkpointRoot = path.join(recoveryRoot, "checkpoints");
  return Promise.all([
    readJsonArtifact(path.join(checkpointRoot, "000001-prepared.json")),
    readJsonArtifact(path.join(checkpointRoot, "000002-submitted.json")),
    readJsonArtifact(path.join(checkpointRoot, "000003-applied.json")),
  ]);
}

async function readRecoveryOperationRows(): Promise<JsonObject[]> {
  const query = new URLSearchParams({
    sender: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
    target: RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI,
    entrypoint: "update_operators",
    "level.ge": String(RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_LEVEL),
    "sort.asc": "id",
    limit: "100",
  });
  const rows = await fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?${query.toString()}`);
  assert.ok(Array.isArray(rows), "TzKT superseded-v2 recovery candidates must be an array");
  return rows;
}

async function writeReconciledReceipt(recoveryRoot: string, receipt: JsonObject): Promise<string> {
  const artifactRoot = path.join(recoveryRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  const receiptPath = path.join(artifactRoot, "ravioli-superseded-v2-20260722b-operator-recovery.json");
  await writeFile(receiptPath, deterministicJsonBytes(receipt), { flag: "wx" });
  return receiptPath;
}

const DEFAULT_RECONCILIATION_IO: RavioliSupersededRecoveryReconciliationIo = {
  readPreflight: (recoveryRoot) => readJsonArtifact(path.join(recoveryRoot, "recovery-preflight.json")),
  readIntent: (recoveryRoot) => readJsonArtifact(path.join(recoveryRoot, "recovery-intent.json")),
  readCheckpoints: readRecoveryCheckpoints,
  readProgress: readOptionalProgress,
  readCauseOperations,
  readOperationRows: readRecoveryOperationRows,
  readState: readRavioliSupersededRecoveryState,
  readLane,
  writeReceipt: writeReconciledReceipt,
  now: () => new Date().toISOString(),
};

function bridgeRequest(
  action: "estimate_call" | "call",
  id: string,
  sendOptions: RavioliSupersededRecoverySendOptions | { amount: 0; mutez: true },
): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action,
    payload: { call: ravioliSupersededRecoveryCall(), sendOptions },
  };
}

export async function executeRavioliSupersededRecoveryCall(input: {
  session: Pick<TaquitoPastaUiLiveSession, "handle">;
  beforeSubmit(estimate: RavioliSupersededRecoveryEstimate): Promise<void>;
}): Promise<RavioliSupersededRecoveryEstimate> {
  const response = await input.session.handle(bridgeRequest(
    "estimate_call",
    "superseded-v2-recovery-estimate",
    { amount: 0, mutez: true },
  )) as JsonObject;
  assert.equal(response.contractAddress, RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI, "superseded-v2 estimate target drift");
  assert.equal(response.entrypoint, "update_operators", "superseded-v2 estimate entrypoint drift");
  const estimate = {
    call: ravioliSupersededRecoveryCall(),
    gasLimit: safeInteger(response.estimate?.gasLimit, "superseded-v2 recovery estimate gas"),
    storageLimit: safeInteger(response.estimate?.storageLimit, "superseded-v2 recovery estimate storage"),
    suggestedFeeMutez: safeInteger(response.estimate?.suggestedFeeMutez, "superseded-v2 recovery estimate suggested fee"),
    minimalFeeMutez: safeInteger(response.estimate?.minimalFeeMutez, "superseded-v2 recovery estimate minimal fee"),
    burnFeeMutez: safeInteger(response.estimate?.burnFeeMutez, "superseded-v2 recovery estimate burn fee"),
    sendOptions: ravioliSupersededRecoverySendOptions(response.estimate),
  } satisfies RavioliSupersededRecoveryEstimate;
  await input.beforeSubmit(estimate);
  await input.session.handle(bridgeRequest("call", "superseded-v2-recovery-call", estimate.sendOptions));
  return estimate;
}

async function verifyAppliedRecoveryOperation(operationHash: string): Promise<RavioliSupersededRecoveryOperation> {
  const rows = await pollJson(
    `Ravioli superseded-v2 recovery ${operationHash}`,
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(operationHash)}`,
    (value) => Array.isArray(value) && value.some((row: JsonObject) =>
      row?.hash === operationHash && row?.status === "applied" && Number(row?.counter) === RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER,
    ),
  );
  return validateRavioliSupersededRecoveryOperation(rows, operationHash);
}

async function requireFreshRecoveryRoot(runRoot: string): Promise<string> {
  const recoveryRoot = path.join(path.resolve(runRoot), RAVIOLI_SUPERSEDED_RECOVERY_DIRECTORY);
  try {
    await stat(recoveryRoot);
    assert.fail(`superseded-v2 recovery directory already exists: ${recoveryRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return recoveryRoot;
}

export async function runRavioliSupersededRecoveryReconciliation(options: {
  environment?: Record<string, string | undefined>;
  io?: RavioliSupersededRecoveryReconciliationIo;
} = {}): Promise<JsonObject> {
  const environment = options.environment ?? process.env;
  const io = options.io ?? DEFAULT_RECONCILIATION_IO;
  const runRoot = path.resolve(assertRavioliSupersededRecoveryReconciliationAllowed(environment));
  const recoveryRoot = path.join(runRoot, RAVIOLI_SUPERSEDED_RECOVERY_DIRECTORY);
  const [preflightArtifact, intentArtifact, checkpoints, progress, currentCause, rows, after, primary, fallback] = await Promise.all([
    io.readPreflight(recoveryRoot),
    io.readIntent(recoveryRoot),
    io.readCheckpoints(recoveryRoot),
    io.readProgress(recoveryRoot),
    io.readCauseOperations(),
    io.readOperationRows(),
    io.readState(),
    io.readLane(SHADOWNET_RPC_PRIMARY),
    io.readLane(SHADOWNET_RPC_FALLBACK),
  ]);
  assert.equal(preflightArtifact.sha256, sha256(preflightArtifact.bytes), "preflight artifact digest does not match its bytes");
  assert.equal(intentArtifact.sha256, sha256(intentArtifact.bytes), "intent artifact digest does not match its bytes");
  const preflight = validateRavioliSupersededRecoveryPreflight(preflightArtifact.value);
  const intent = validateRavioliSupersededRecoveryIntent(intentArtifact.value, preflight, preflightArtifact.sha256);
  assert.deepEqual(currentCause, preflight.causeOperations, "original partial-attempt operation evidence changed");
  const operation = validateRavioliSupersededRecoveryOperation(rows);
  const checkpointHashes = validateRavioliSupersededRecoveryCheckpointChain(checkpoints, {
    preflightSha256: preflightArtifact.sha256,
    intentSha256: intentArtifact.sha256,
    estimate: intent.estimate as RavioliSupersededRecoveryEstimate,
    operation,
  });
  if (progress !== undefined) {
    validateRavioliSupersededRecoveryProgress(
      progress,
      preflightArtifact.sha256,
      intentArtifact.sha256,
      operation,
      checkpointHashes,
    );
  }
  assertRavioliSupersededRecoveryTransition(preflight.before, after, operation);
  const lanesAfter = { primary, fallback };
  assertDualLanes(lanesAfter, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "reconciliation terminal");
  const receipt = buildRavioliSupersededRecoveryReceipt({
    completedAt: io.now(),
    preflight,
    preflightSha256: preflightArtifact.sha256,
    intent,
    intentSha256: intentArtifact.sha256,
    operation,
    after,
    lanesAfter,
  });
  validateRavioliSupersededRecoveryReceipt(receipt, preflight, preflightArtifact.sha256, intent, intentArtifact.sha256);
  const receiptPath = await io.writeReceipt(recoveryRoot, receipt);
  process.stdout.write(`${JSON.stringify({ status: "PASSED", mode: "READ-ONLY-RECONCILIATION", receiptPath, operation }, null, 2)}\n`);
  return receipt;
}

export async function runRavioliSupersededRecovery(): Promise<JsonObject> {
  const runRoot = path.resolve(assertRavioliSupersededRecoveryExecutionAllowed(process.env));
  const recoveryRoot = await requireFreshRecoveryRoot(runRoot);
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const [cause, before, primaryBefore, fallbackBefore] = await Promise.all([
    readCauseOperations(),
    readRavioliSupersededRecoveryState(),
    readLane(SHADOWNET_RPC_PRIMARY),
    readLane(SHADOWNET_RPC_FALLBACK),
  ]);
  assertRavioliSupersededRecoveryState(before, "before");
  const lanesBefore = { primary: primaryBefore, fallback: fallbackBefore };
  assertDualLanes(lanesBefore, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "execution preflight");
  assert.ok(primaryBefore.balanceMutez >= RECOVERY_OPERATION_RESERVE_MUTEZ, "creator balance is below the exact recovery reserve");
  const preflight = buildRavioliSupersededRecoveryPreflight({
    createdAt: new Date().toISOString(),
    rpcUrl: rpc.rpcUrl,
    cause,
    before,
    lanes: lanesBefore,
  });
  validateRavioliSupersededRecoveryPreflight(preflight);
  await mkdir(recoveryRoot, { recursive: false });
  const preflightBytes = deterministicJsonBytes(preflight);
  const preflightSha256 = sha256(preflightBytes);
  await writeNewDurableJson(path.join(recoveryRoot, "recovery-preflight.json"), preflight);
  const checkpointRoot = path.join(recoveryRoot, "checkpoints");
  await mkdir(checkpointRoot, { recursive: false });

  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-superseded-v2-20260722b-operator-recovery.sock",
    authToken: "local-pasta-shadownet-ravioli-superseded-v2-20260722b-operator-recovery",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-superseded-v2-20260722b-operator-recovery-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  assert.equal(signerSet.creator.address, RAVIOLI_SUPERSEDED_RECOVERY_CREATOR, "recovery signer is not the exact creator");
  const tezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Ravioli exact superseded-v2 recovery startup");

  let validatedCalls = 0;
  let operationEvidence: RavioliSupersededRecoveryOperation | undefined;
  let intent: JsonObject | undefined;
  let intentSha256 = "";
  let preparedBridgeOperation: PastaUiLivePreparedOperation | undefined;
  let submittedBridgeOperation: PastaUiLiveSubmittedOperation | undefined;
  let preparedCheckpointSha256 = "";
  let submittedCheckpointSha256 = "";
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: RAVIOLI_SUPERSEDED_RECOVERY_CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI]),
    allowedEntrypoints: new Set(["update_operators"]),
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => { throw new Error("superseded-v2 recovery cannot pin"); },
    validateOrigination: () => { throw new Error("superseded-v2 recovery cannot originate"); },
    validateCall: (call) => {
      assert.equal(validatedCalls, 0, "superseded-v2 recovery refuses a second call");
      assertExactRecoveryCall(call);
      validatedCalls += 1;
    },
    beforeOperationSubmit: async (operation) => {
      assert.ok(intent && intentSha256, "durable recovery intent must precede PREPARED");
      assert.equal(preparedBridgeOperation, undefined, "recovery refuses a second PREPARED checkpoint");
      const checkpoint = buildRavioliSupersededRecoveryCheckpoint({
        phase: "PREPARED",
        timestampUtc: operation.timestampUtc,
        preflightSha256,
        intentSha256,
        previousRecordSha256: intentSha256,
        estimate: intent.estimate as RavioliSupersededRecoveryEstimate,
        bridgeOperation: operation,
      });
      const artifact = await writeNewDurableJson(path.join(checkpointRoot, "000001-prepared.json"), checkpoint);
      preparedBridgeOperation = operation;
      preparedCheckpointSha256 = artifact.sha256;
    },
    onOperationSubmitted: async (operation) => {
      assert.ok(intent && preparedBridgeOperation && preparedCheckpointSha256, "PREPARED checkpoint must precede SUBMITTED");
      assert.equal(submittedBridgeOperation, undefined, "recovery refuses a second SUBMITTED checkpoint");
      const checkpoint = buildRavioliSupersededRecoveryCheckpoint({
        phase: "SUBMITTED",
        timestampUtc: operation.timestampUtc,
        preflightSha256,
        intentSha256,
        previousRecordSha256: preparedCheckpointSha256,
        estimate: intent.estimate as RavioliSupersededRecoveryEstimate,
        bridgeOperation: operation,
      });
      const artifact = await writeNewDurableJson(path.join(checkpointRoot, "000002-submitted.json"), checkpoint);
      submittedBridgeOperation = operation;
      submittedCheckpointSha256 = artifact.sha256;
    },
    assertOperationApplied: async ({ action, operationHash, contractAddress, entrypoints }) => {
      assert.equal(action, "call");
      assert.equal(contractAddress, RAVIOLI_SUPERSEDED_RECOVERY_GNOCCHI);
      assert.deepEqual(entrypoints, ["update_operators"]);
      assert.ok(intent && intentSha256, "durable intent must precede operation verification");
      assert.ok(submittedBridgeOperation && submittedCheckpointSha256, "SUBMITTED checkpoint must precede APPLIED verification");
      assert.equal(submittedBridgeOperation.operationHash, operationHash, "submitted operation hash drift");
      operationEvidence = await verifyAppliedRecoveryOperation(operationHash);
      const checkpoint = buildRavioliSupersededRecoveryCheckpoint({
        phase: "APPLIED",
        timestampUtc: operationEvidence.timestamp,
        preflightSha256,
        intentSha256,
        previousRecordSha256: submittedCheckpointSha256,
        estimate: intent.estimate as RavioliSupersededRecoveryEstimate,
        bridgeOperation: submittedBridgeOperation,
        operation: operationEvidence,
      });
      const appliedArtifact = await writeNewDurableJson(path.join(checkpointRoot, "000003-applied.json"), checkpoint);
      await writeNewDurableJson(path.join(recoveryRoot, "recovery-progress.json"), {
        schema: "pastaprotocol-ravioli-superseded-v2-20260722b-operator-recovery-progress@1",
        status: "APPLIED",
        preflightSha256,
        intentSha256,
        checkpoints: {
          preparedSha256: preparedCheckpointSha256,
          submittedSha256: submittedCheckpointSha256,
          appliedSha256: appliedArtifact.sha256,
        },
        operation: operationEvidence,
      });
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: primaryBefore.balanceMutez,
    requiredBalanceMutez: RECOVERY_OPERATION_RESERVE_MUTEZ,
    estimatedOriginationMutez: 0,
    operationReserveMutez: RECOVERY_OPERATION_RESERVE_MUTEZ,
  });

  const estimate = await executeRavioliSupersededRecoveryCall({
    session,
    beforeSubmit: async (acceptedEstimate) => {
      const [preSubmit, primary, fallback] = await Promise.all([
        readRavioliSupersededRecoveryState(),
        readLane(SHADOWNET_RPC_PRIMARY),
        readLane(SHADOWNET_RPC_FALLBACK),
      ]);
      assertRavioliSupersededRecoveryPreSubmitUnchanged(before, preSubmit);
      const lanes = { primary, fallback };
      assertDualLanes(lanes, RAVIOLI_SUPERSEDED_RECOVERY_OPERATOR_ADD_COUNTER, "execution intent");
      intent = buildRavioliSupersededRecoveryIntent({
        createdAt: new Date().toISOString(),
        rpcUrl: rpc.rpcUrl,
        preflightSha256,
        before,
        preSubmit,
        lanes,
        estimate: acceptedEstimate,
      });
      const intentBytes = deterministicJsonBytes(intent);
      intentSha256 = sha256(intentBytes);
      await writeNewDurableJson(path.join(recoveryRoot, "recovery-intent.json"), intent);
    },
  });
  assert.ok(intent && intentSha256, "superseded-v2 recovery intent was not persisted");
  assert.equal(validatedCalls, 1, "superseded-v2 recovery did not validate exactly one call");
  assert.ok(operationEvidence, "superseded-v2 recovery lacks exact applied operation evidence");
  assert.ok(preparedCheckpointSha256 && submittedCheckpointSha256, "recovery lacks PREPARED or SUBMITTED evidence");
  assert.deepEqual(estimate, intent.estimate, "submitted estimate differs from durable intent");

  const after = await pollRavioliSupersededAfterState();
  assertRavioliSupersededRecoveryTransition(before, after, operationEvidence);
  const [primaryAfter, fallbackAfter] = await Promise.all([
    readLane(SHADOWNET_RPC_PRIMARY),
    readLane(SHADOWNET_RPC_FALLBACK),
  ]);
  const lanesAfter = { primary: primaryAfter, fallback: fallbackAfter };
  assertDualLanes(lanesAfter, RAVIOLI_SUPERSEDED_RECOVERY_OPERATION_COUNTER, "execution terminal");
  const [persistedPreflight, persistedIntent] = await Promise.all([
    readJsonArtifact(path.join(recoveryRoot, "recovery-preflight.json")),
    readJsonArtifact(path.join(recoveryRoot, "recovery-intent.json")),
  ]);
  assert.equal(persistedPreflight.sha256, preflightSha256, "preflight changed after submission");
  assert.equal(persistedIntent.sha256, intentSha256, "intent changed after submission");
  const receipt = buildRavioliSupersededRecoveryReceipt({
    completedAt: new Date().toISOString(),
    preflight,
    preflightSha256,
    intent,
    intentSha256,
    operation: operationEvidence,
    after,
    lanesAfter,
  });
  validateRavioliSupersededRecoveryReceipt(receipt, preflight, preflightSha256, intent, intentSha256);
  const artifactRoot = path.join(recoveryRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: false });
  const receiptPath = path.join(artifactRoot, "ravioli-superseded-v2-20260722b-operator-recovery.json");
  await writeNewDurableJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({ status: "PASSED", receiptPath, operation: operationEvidence }, null, 2)}\n`);
  return receipt;
}

async function main(): Promise<void> {
  try {
    if (process.env[RAVIOLI_SUPERSEDED_RECOVERY_RECONCILE_FLAG] !== undefined) {
      await runRavioliSupersededRecoveryReconciliation();
    } else {
      await runRavioliSupersededRecovery();
    }
  } catch (error) {
    if (error instanceof ProofBlocked) {
      process.stderr.write(`BLOCKED: ${error.message}\n${error.lines.join("\n")}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
