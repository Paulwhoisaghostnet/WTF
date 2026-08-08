import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";

import {
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
  type PastaUiLiveOperationDescriptor,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA,
  RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA,
  RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION,
  openRavioliUiLiveJournal,
  ravioliUiLiveDescriptorSha256,
  type RavioliUiLiveCounterAdvanceInput,
  type RavioliUiLiveCounterAdvanceOperation,
  type RavioliUiLiveJournal,
  type RavioliUiLiveJournalActor,
} from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  ipfsGatewayUrl,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

type JsonRecord = Record<string, any>;

const PRE_RECOVERY_FILE_COUNT = 127;
const PRE_RECOVERY_INVENTORY_SHA256 =
  "2ed31db5cff1d9fc8cccce623c87256e515d111861844ddcfbb14ba04502afd2";
const RECOVERY_EVENT_NAME = "000086-counter_advance-creator.json";
const PLAN_EXTENSION_EVENT_NAME = "000087-plan_extension-creator.json";
const RECOVERY_RECORDED_AT = "2026-07-24T20:16:00.000Z";
const PRIVATE_SNAPSHOT_MANIFEST_SHA256 =
  "acc9baa7e70df0140f0acc9c69866d33c50e109021a4a3773c0238c1967e02f4";

const SCREENSHOTS = Object.freeze([
  Object.freeze({ stem: "001-compose-five-atomic-pack-modes-same-run-dependencies-entered", pngSha256: "a6d77ab2ce06d704144b2340f1530582cff5c54c6d75f6621c2a15b75f8e6161", sidecarSha256: "8ae43c7bd7420e06435877007c4dfe2965f37d6b6cba5a9699b2009b7942f2a7" }),
  Object.freeze({ stem: "002-compose-five-atomic-pack-modes-creator-connected-on-shadownet", pngSha256: "111de2b24f0cb9bb8b1edcbf26b7a51aa28a7670b8b1fcfc3632d3f1ac9d997d", sidecarSha256: "f63a03fc8068c45eb760659db31f55ef3836c8029fa70c6ef72e779df06f537f" }),
  Object.freeze({ stem: "003-limited-edition-expiry-deconfliction-le-wrapper-outliving-child-rejected-before-pins-or-writes", pngSha256: "98fd4bee39be95f83e461228479970af009f389657e4e180842a0c1bfcc67323", sidecarSha256: "07ba036808dbaf9faf0def8daaea87b068157294aa741840302511afb8852377" }),
  Object.freeze({ stem: "004-compose-five-atomic-pack-modes-deterministic-vault-configured", pngSha256: "cf990f03632ee003f2fad9ce0fa9b181b36b7ee553b62b3cec6a0542eb9f96b3", sidecarSha256: "c8326980406a15e107a903c6ea32e417089d8561a60634f393eeb9cd395544a1" }),
  Object.freeze({ stem: "005-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued", pngSha256: "b2ee0757e218db8048f0e039db3b8269f3537cdf388f610db77ad8cab66a0539", sidecarSha256: "491cbc45de1532ab9c5e343f39d317c9a8b08d7e4523be448d2588a0a10a8f34" }),
  Object.freeze({ stem: "006-compose-five-atomic-pack-modes-blind-funded-pool-configured", pngSha256: "c73a90e76ddadcf5391e24a059dd1d753a7878c853db1babd8c03b60b9197996", sidecarSha256: "60340d62466a5d58b5a79154439184c1682c502772a3ba99f13846953a1ae7d4" }),
  Object.freeze({ stem: "007-compose-five-atomic-pack-modes-blind-funded-pool-funded-and-issued", pngSha256: "b7f70ee87f7a950b5d9b8ffa4f97e4b1556c46916126bf9cf0b027e20450a09e", sidecarSha256: "923a0a3f07677b370077432aea6c11a7ea3df6e6abb3ddf04954f668e420f092" }),
  Object.freeze({ stem: "008-buy-and-atomically-open-five-pack-modes-collector-one-bought-blind-funded-pool", pngSha256: "a3ab7ccac2d508b34207e2506333468235b234fc960c20ca5dec3a46790592d5", sidecarSha256: "940e471dad00e9b8f97477eeb94cb6c89653ceb8abee8080e479b7e79b96afe9" }),
  Object.freeze({ stem: "009-buy-and-atomically-open-five-pack-modes-collector-two-bought-blind-funded-pool", pngSha256: "4c88c3dcc88b394530bea48138220799c2cd0cebdc53caa70a13c20868a2e1b8", sidecarSha256: "6343bd432f12b6eb2730db6537241710630392f379f3eed9bda131ef748ecae2" }),
  Object.freeze({ stem: "010-blind-claim-preserving-wrapper-transfer-collector-one-transferred-an-unopened-blind-claim", pngSha256: "6435526b6de3a4dcd7c976ea28d9ccc75e9ed7e527fad881da087d583af50be1", sidecarSha256: "aacbfc6e3ca1869a89283d82ba81cb638b867187c886a23b7533dd15e544f096" }),
  Object.freeze({ stem: "011-compose-five-atomic-pack-modes-blind-allocated-mint-configured", pngSha256: "2673a5c15797bd880812697f68fd1b9a62d691d1e68b82cb5a567ffd64fa5be3", sidecarSha256: "9189a02095bdb78f1dc255ae065e0fff39576f7ad7774b9ad9c53ba2b89f47e3" }),
]);

const OPEN_KITS = Object.freeze([
  Object.freeze({ tokenId: 0, fileName: "ravioli-open-kit-0.json", sha256: "b23ddbc3d9dd15836c82b2f9c1c58483c4653388963496be5a7077aed46fbcf8", byteLength: 1_035 }),
  Object.freeze({ tokenId: 1, fileName: "ravioli-open-kit-1.json", sha256: "b59395b7f31a10a623319e6b9a6b5252e8202b982eec873a1855e9d880ed6fdd", byteLength: 1_782 }),
  Object.freeze({ tokenId: 2, fileName: "ravioli-open-kit-2.json", sha256: "0a7fce5169ea8ce41b848e973ad9bedf8f17ec895a99bdc6127f03fb409dce41", byteLength: 1_599 }),
]);

const PRIVATE_RECORDS = Object.freeze([
  Object.freeze({ sha256: "2c590fab851aa0726adff1c7e3f16b93c553d3c5a079403185cf8252ad5e5f9b", byteLength: 16_461, tokenId: 0 }),
  Object.freeze({ sha256: "2c590fab851aa0726adff1c7e3f16b93c553d3c5a079403185cf8252ad5e5f9b", byteLength: 16_461, tokenId: 0 }),
  Object.freeze({ sha256: "9827b2f00450b49d00f98e48384d73c17e074f9ec267e645a63ff9ab296a8629", byteLength: 12_555, tokenId: 1 }),
  Object.freeze({ sha256: "9827b2f00450b49d00f98e48384d73c17e074f9ec267e645a63ff9ab296a8629", byteLength: 12_555, tokenId: 1 }),
  Object.freeze({ sha256: "59acdf0d470564a0a9e90464aa2d94e9c96e462f8ff892f00f7e7c4e879033c3", byteLength: 15_640, tokenId: 2 }),
  Object.freeze({ sha256: "59acdf0d470564a0a9e90464aa2d94e9c96e462f8ff892f00f7e7c4e879033c3", byteLength: 15_640, tokenId: 2 }),
]);

const EXTERNAL_OPERATIONS = Object.freeze([
  Object.freeze({
    actor: "creator" as const,
    action: "originate" as const,
    operationHash: "ooEt4xX1dDLdnwKfUEr8eVN34vgXzzAwtRBQ23scdBVx23iP5fC",
    counter: 23_831_582,
    level: 4_331_128,
    timestamp: "2026-07-24T20:14:33.000Z",
    entrypoints: Object.freeze([] as string[]),
  }),
  Object.freeze({
    actor: "creator" as const,
    action: "call" as const,
    operationHash: "opBtLfhynMdLnFNd3HBEmASnBqxfUoHK6dXhbmqp1cyTQaMhu3J",
    counter: 23_831_583,
    level: 4_331_131,
    timestamp: "2026-07-24T20:14:54.000Z",
    entrypoints: Object.freeze(["add_tokens_v2"]),
  }),
  Object.freeze({
    actor: "creator" as const,
    action: "call" as const,
    operationHash: "oojGxauezeco6LiTaT3rJaS33RJHR3mhzsa2vdsqL3Lq7PaLtmp",
    counter: 23_831_584,
    level: 4_331_132,
    timestamp: "2026-07-24T20:15:06.000Z",
    entrypoints: Object.freeze(["set_stages"]),
  }),
  Object.freeze({
    actor: "collector1" as const,
    action: "call" as const,
    operationHash: "opNNNSiJDzu2zvcWAUXYhuXWFB1RBXA2GncKrt2AHiAWvxuxHsB",
    counter: 23_833_860,
    level: 4_331_137,
    timestamp: "2026-07-24T20:15:39.000Z",
    entrypoints: Object.freeze(["mint"]),
  }),
]);

export const RAVIOLI_CURRENT_V6_RESUME_IDENTITY = Object.freeze({
  runId: "pasta-alpha-proof-20260724t053947z",
  journalId: "4805fc6016cc9129e74f6efb89316cb36bdefeb845633654a1c80e1ffb883df2",
  intentSha256: "190649f394f32f7462c53b7f4d1f0c6e1d8d62bf64484772cc2e7eb178bbaaa9",
  matrixSha256: "fe4211bcd32a84d2952469f0562ff23dba5c08f0c6bd723ee728cef9d2581594",
  boundaryFinalEventSha256: "e567766c2d627c5e39c34174c23b32b0b9dc6eef8b48fd6df9e37ebb33f1551e",
  recoveryId: "0be918c59bf067d7ceca97d9236a8243df1fcb09e4bb0cd35136465ee03c611d",
  boundaryEventCount: 85,
  recoveryEventCount: 86,
  pinCount: 15,
  operationCount: 23,
  recoveredFileCount: PRE_RECOVERY_FILE_COUNT + 1,
  creatorAddress: "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM",
  collectorOneAddress: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
  collectorTwoAddress: "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
  creatorBaseCounter: 23_831_561,
  collectorOneBaseCounter: 23_833_857,
  collectorTwoBaseCounter: 25_689_642,
  controllerAddress: "KT1MkUob58kMpcftRonntJpiiQiexNEzps2c",
  routerAddress: "KT1SQEXd1q5yWrwduDkC2SRoibnubP1Hq1Y5",
  gnocchiAdapterAddress: "KT1SanxZmBUoQP4Td3JTLVnhoWV43zq9tUqN",
  gnocchiAddress: "KT1DLiDDgvNFKeSdzvBsvBdQWZUhU5XYC5Qf",
  rotiniAddress: "KT1Ckw2WQ88vSzrVqeC2LnjmdspeFupTSpZt",
  recoveryContractAddress: "KT1WVXyTLXniTtPaH7AfRsbGVKoG6YLXrBxP",
  mode0OperatorAppliedLevel: 4_331_018,
  mode1OperatorAppliedLevel: 4_331_033,
  privateSnapshotManifestSha256: PRIVATE_SNAPSHOT_MANIFEST_SHA256,
  screenshots: SCREENSHOTS,
  openKits: OPEN_KITS,
  externalOperations: EXTERNAL_OPERATIONS,
});

export type RavioliCurrentV6OperationRecord = Readonly<{
  identity: {
    globalOrdinal: number;
    actor: RavioliUiLiveJournalActor;
    operationSequence: number;
    action: "originate" | "call";
    descriptorSha256: string;
    operationHash: string;
    signerAddress: string;
    contractAddress: string;
    entrypoints: string[];
    counter: number;
    level: number;
    timestamp: string;
  };
  descriptor: PastaUiLiveOperationDescriptor;
  receipt: PastaUiLivePublicReceipt;
}>;

export type RavioliCurrentV6PinRecord = Readonly<{
  bytes: Uint8Array;
  value?: JsonRecord;
  proof: PastaUiLivePinProof;
}>;

export type RavioliCurrentV6Resume = Readonly<{
  appRoot: string;
  journalRoot: string;
  controllerAddress: string;
  routerAddress: string;
  gnocchiAdapterAddress: string;
  fileCount: number;
  journalPins: readonly RavioliCurrentV6PinRecord[];
  activePins: readonly RavioliCurrentV6PinRecord[];
  operations: readonly RavioliCurrentV6OperationRecord[];
  writeReceipts: readonly PastaUiLivePublicReceipt[];
  openKits: readonly {
    tokenId: number;
    fileName: string;
    relativePath: string;
    bytes: Uint8Array;
    value: JsonRecord;
    sha256: string;
  }[];
  identity: typeof RAVIOLI_CURRENT_V6_RESUME_IDENTITY;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exactFile(filePath: string, expectedSha256?: string, expectedBytes?: number): Promise<Uint8Array> {
  const info = await lstat(filePath);
  assert.ok(info.isFile() && !info.isSymbolicLink(), "authenticated Ravioli boundary contains a non-file");
  const bytes = await readFile(filePath);
  if (expectedBytes !== undefined) assert.equal(bytes.byteLength, expectedBytes, "authenticated Ravioli file length drift");
  if (expectedSha256) assert.equal(sha256(bytes), expectedSha256, "authenticated Ravioli file digest drift");
  return Uint8Array.from(bytes);
}

async function canonicalJsonFile(filePath: string): Promise<{ value: JsonRecord; bytes: Uint8Array; sha256: string }> {
  const bytes = await exactFile(filePath);
  const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "authenticated Ravioli JSON is not an object");
  assert.equal(
    Buffer.compare(Buffer.from(bytes), Buffer.from(deterministicJsonBytes(value))),
    0,
    "authenticated Ravioli JSON is not canonical",
  );
  return { value, bytes, sha256: sha256(bytes) };
}

async function exactDirectory(directory: string, expectedNames: readonly string[]): Promise<void> {
  const info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), "authenticated Ravioli boundary contains a non-directory");
  assert.deepEqual((await readdir(directory)).sort(), [...expectedNames].sort(), "authenticated Ravioli directory inventory drift");
}

async function inventory(
  root: string,
  excluded = new Set<string>(),
): Promise<{ count: number; sha256: string }> {
  const rows: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const info = await lstat(directory);
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), "authenticated Ravioli inventory contains a non-directory");
    for (const name of (await readdir(directory)).sort()) {
      const candidate = path.join(directory, name);
      const child = await lstat(candidate);
      assert.equal(child.isSymbolicLink(), false, "authenticated Ravioli inventory contains a symbolic link");
      if (child.isDirectory()) await walk(candidate);
      else {
        assert.ok(child.isFile(), "authenticated Ravioli inventory contains a non-file");
        const relative = path.relative(root, candidate).split(path.sep).join("/");
        if (excluded.has(relative)) continue;
        const bytes = await readFile(candidate);
        rows.push(`${relative}\0${bytes.byteLength}\0${sha256(bytes)}`);
      }
    }
  };
  await walk(root);
  return {
    count: rows.length,
    sha256: sha256(Buffer.from(rows.join("\n"), "utf8")),
  };
}

function requireAddress(value: unknown, contract = false): string {
  assert.equal(typeof value, "string");
  assert.equal(
    contract ? validateContractAddress(value as string) : validateAddress(value as string),
    ValidationResult.VALID,
  );
  return value as string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.ok(response.ok, `read-only Ravioli recovery request failed with HTTP ${response.status}`);
  return response.json();
}

function externalEvidence(
  operation: typeof EXTERNAL_OPERATIONS[number],
): RavioliUiLiveCounterAdvanceOperation {
  const identity = RAVIOLI_CURRENT_V6_RESUME_IDENTITY;
  return {
    action: operation.action,
    status: "applied",
    operationHash: operation.operationHash,
    counter: operation.counter,
    level: operation.level,
    timestamp: operation.timestamp,
    signerAddress: operation.actor === "creator"
      ? identity.creatorAddress
      : identity.collectorOneAddress,
    contractAddress: identity.recoveryContractAddress,
    entrypoints: [...operation.entrypoints],
    explorerUrl: `https://shadownet.tzkt.io/${operation.operationHash}`,
  };
}

function exactCounterAdvance(): RavioliUiLiveCounterAdvanceInput {
  const identity = RAVIOLI_CURRENT_V6_RESUME_IDENTITY;
  return {
    recoveryId: identity.recoveryId,
    semanticBoundary: identity.operationCount,
    recoveryContractAddress: identity.recoveryContractAddress,
    advances: [
      {
        actor: "creator",
        operations: EXTERNAL_OPERATIONS
          .filter((operation) => operation.actor === "creator")
          .map(externalEvidence),
      },
      {
        actor: "collector1",
        operations: EXTERNAL_OPERATIONS
          .filter((operation) => operation.actor === "collector1")
          .map(externalEvidence),
      },
    ],
    recordedAt: RECOVERY_RECORDED_AT,
  };
}

async function verifyExternalCounterBoundary(): Promise<void> {
  const identity = RAVIOLI_CURRENT_V6_RESUME_IDENTITY;
  for (const expected of EXTERNAL_OPERATIONS) {
    const rows = await fetchJson(
      `${normalizeBase(SHADOWNET_TZKT_API)}/operations/${encodeURIComponent(expected.operationHash)}`,
    );
    assert.ok(Array.isArray(rows), "TzKT counter-advance response is not an array");
    const signerAddress = expected.actor === "creator"
      ? identity.creatorAddress
      : identity.collectorOneAddress;
    const candidates = rows.filter((row: JsonRecord) =>
      row?.hash === expected.operationHash
      && row?.status === "applied"
      && row?.sender?.address === signerAddress
      && Number(row?.counter) === expected.counter
      && Number(row?.level) === expected.level
      && new Date(String(row?.timestamp || "")).toISOString() === expected.timestamp,
    );
    assert.equal(candidates.length, 1, "TzKT does not expose the exact counter-advance operation");
    const row = candidates[0]!;
    if (expected.action === "originate") {
      assert.equal(row?.type, "origination");
      assert.equal(row?.originatedContract?.address, identity.recoveryContractAddress);
    } else {
      assert.equal(row?.type, "transaction");
      assert.equal(row?.target?.address, identity.recoveryContractAddress);
      assert.equal(row?.parameter?.entrypoint, expected.entrypoints[0]);
    }
  }

  const expectedCounters = Object.freeze({
    [identity.creatorAddress]: identity.creatorBaseCounter + 20 + 3,
    [identity.collectorOneAddress]: identity.collectorOneBaseCounter + 2 + 1,
    [identity.collectorTwoAddress]: identity.collectorTwoBaseCounter + 1,
  });
  for (const rpcUrl of [SHADOWNET_RPC_PRIMARY, SHADOWNET_RPC_FALLBACK]) {
    const base = normalizeBase(rpcUrl);
    const mempool = await fetchJson(`${base}/chains/main/mempool/pending_operations`);
    const active = ["applied", "validated", "branch_delayed", "unprocessed"]
      .flatMap((bucket) => Array.isArray(mempool?.[bucket]) ? mempool[bucket] : [])
      .map((entry: JsonRecord | [string, JsonRecord]) => Array.isArray(entry) ? entry[1] : entry);
    for (const [address, expectedCounter] of Object.entries(expectedCounters)) {
      const counter = Number(await fetchJson(
        `${base}/chains/main/blocks/head/context/contracts/${encodeURIComponent(address)}/counter`,
      ));
      assert.equal(counter, expectedCounter, "dual-RPC signer counter moved beyond the exact Ravioli recovery boundary");
      assert.equal(
        active.filter((operation: JsonRecord) =>
          operation?.contents?.some((content: JsonRecord) => content?.source === address)
        ).length,
        0,
        "a Ravioli recovery signer has an active mempool operation",
      );
    }
  }
}

async function findExactPrivateSnapshot(root: string): Promise<string> {
  const rootInfo = await lstat(root);
  assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "private recovery root is not a real directory");
  assert.equal(rootInfo.mode & 0o077, 0, "private recovery root grants group or world access");
  const matches: string[] = [];
  let visited = 0;
  const walk = async (directory: string, depth: number): Promise<void> => {
    assert.ok(depth <= 8, "private recovery hierarchy exceeds its depth limit");
    for (const name of await readdir(directory)) {
      visited += 1;
      assert.ok(visited <= 512, "private recovery hierarchy exceeds its entry limit");
      const candidate = path.join(directory, name);
      const info = await lstat(candidate);
      assert.equal(info.isSymbolicLink(), false, "private recovery hierarchy contains a symbolic link");
      if (info.isDirectory()) await walk(candidate, depth + 1);
      else if (info.isFile() && name === "manifest.json") {
        const bytes = await readFile(candidate);
        if (sha256(bytes) === PRIVATE_SNAPSHOT_MANIFEST_SHA256) matches.push(candidate);
      }
    }
  };
  await walk(root, 0);
  assert.equal(matches.length, 1, "the exact private recovery snapshot is not uniquely present");
  return matches[0]!;
}

async function verifyExactPrivateSnapshot(root: string): Promise<void> {
  const manifestPath = await findExactPrivateSnapshot(root);
  const manifestBytes = await exactFile(manifestPath, PRIVATE_SNAPSHOT_MANIFEST_SHA256);
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8")) as JsonRecord;
  assert.equal(manifest.schema, "pastaprotocol-ravioli-private-recovery-snapshot@1");
  assert.ok(Array.isArray(manifest.records));
  assert.equal(manifest.records.length, PRIVATE_RECORDS.length);
  const snapshotRoot = path.dirname(manifestPath);
  const recordNames = manifest.records.map((record: JsonRecord) => {
    const file = String(record.file || "");
    assert.match(file, /^records\/[A-Za-z0-9._-]+\.json$/);
    return path.basename(file);
  });
  await exactDirectory(snapshotRoot, ["manifest.json", "records"]);
  await exactDirectory(path.join(snapshotRoot, "records"), recordNames);
  const expectedRecords = [...PRIVATE_RECORDS].sort((left, right) =>
    left.tokenId - right.tokenId || left.sha256.localeCompare(right.sha256)
  );
  const observed = [];
  for (const record of manifest.records as JsonRecord[]) {
    assert.match(String(record.file || ""), /^records\/[A-Za-z0-9._-]+\.json$/);
    const bytes = await exactFile(
      path.join(snapshotRoot, String(record.file)),
      String(record.sha256),
      Number(record.byteLength),
    );
    const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as JsonRecord;
    assert.equal(value.schema, "pasta-ravioli-publish-recovery@1");
    assert.equal(value.status, "COMPLETE");
    assert.equal(value.network, "shadownet");
    assert.equal(value.account, RAVIOLI_CURRENT_V6_RESUME_IDENTITY.creatorAddress);
    assert.equal(value.contract, RAVIOLI_CURRENT_V6_RESUME_IDENTITY.routerAddress);
    assert.equal(value?.kit?.schema, "pasta-ravioli-open-kit@3");
    assert.equal(value?.kit?.contract, RAVIOLI_CURRENT_V6_RESUME_IDENTITY.routerAddress);
    assert.equal(Number(value.tokenId), Number(value?.kit?.tokenId));
    observed.push({
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      tokenId: Number(value.tokenId),
    });
  }
  observed.sort((left, right) => left.tokenId - right.tokenId || left.sha256.localeCompare(right.sha256));
  assert.deepEqual(observed, expectedRecords, "private recovery records drifted from the exact failure snapshot");
}

export async function loadRavioliCurrentV6Resume(input: {
  journal: RavioliUiLiveJournal;
  privateRecoveryRoot: string;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  allowAuthenticatedPostEvent86PlanExtension?: boolean;
  expected: {
    creatorAddress: string;
    collectorOneAddress: string;
    collectorTwoAddress: string;
    dependencyAddresses: { gnocchi: string; rotini: string };
    dependencyHashes: Record<string, string>;
    artifactHashes: Record<string, string>;
  };
}): Promise<RavioliCurrentV6Resume> {
  const identity = RAVIOLI_CURRENT_V6_RESUME_IDENTITY;
  assert.equal(input.journal.isFinalized(), false, "current-v6 boundary is already finalized");
  assert.equal(input.journal.getCompletedOperationCount(), identity.operationCount);
  assert.deepEqual(input.journal.intent.matrix, RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX);
  assert.equal(input.journal.intent.journalId, identity.journalId);
  assert.equal(input.journal.intent.matrixSha256, identity.matrixSha256);
  assert.deepEqual(input.journal.intent.dependencyAddresses, input.expected.dependencyAddresses);
  const { tzktBaseline, ...stableDependencyHashes } = input.journal.intent.dependencyHashes;
  assert.match(String(tzktBaseline || ""), /^[0-9a-f]{64}$/);
  assert.deepEqual(stableDependencyHashes, input.expected.dependencyHashes);
  assert.deepEqual(input.journal.intent.artifactHashes, input.expected.artifactHashes);
  assert.equal(input.expected.creatorAddress, identity.creatorAddress);
  assert.equal(input.expected.collectorOneAddress, identity.collectorOneAddress);
  assert.equal(input.expected.collectorTwoAddress, identity.collectorTwoAddress);
  assert.deepEqual(input.expected.dependencyAddresses, {
    gnocchi: identity.gnocchiAddress,
    rotini: identity.rotiniAddress,
  });
  assert.equal(input.journal.intent.actors.creator.counters.primary.counter, identity.creatorBaseCounter);
  assert.equal(input.journal.intent.actors.collector1.counters.primary.counter, identity.collectorOneBaseCounter);
  assert.equal(input.journal.intent.actors.collector2.counters.primary.counter, identity.collectorTwoBaseCounter);

  const journalRoot = path.resolve(input.journal.journalRoot);
  assert.equal(path.basename(journalRoot), "journal");
  const artifactsRoot = path.dirname(journalRoot);
  const appRoot = path.dirname(artifactsRoot);
  assert.equal(path.basename(appRoot), "ravioli");
  assert.equal(path.basename(path.dirname(appRoot)), identity.runId);

  const eventRoot = path.join(journalRoot, "events");
  const pinRoot = path.join(journalRoot, "pins");
  const openKitRoot = path.join(artifactsRoot, "open-kits");
  const screenshotRoot = path.join(appRoot, "screenshots");
  let eventNames = (await readdir(eventRoot)).sort();
  const atPlanExtensionBoundary =
    input.allowAuthenticatedPostEvent86PlanExtension === true
    && eventNames.length === identity.recoveryEventCount + 1;
  assert.ok(
    eventNames.length === identity.boundaryEventCount
      || eventNames.length === identity.recoveryEventCount
      || atPlanExtensionBoundary,
    "current-v6 event boundary is neither pristine nor recovered",
  );
  const alreadyRecovered = eventNames.length >= identity.recoveryEventCount;
  assert.equal(input.journal.hasCounterAdvance(), alreadyRecovered);
  assert.equal(
    input.journal.hasPlanExtension(),
    atPlanExtensionBoundary,
    "current-v6 plan-extension replay state drift",
  );
  assert.equal(input.journal.getCounterOffset("creator"), alreadyRecovered ? 3 : 0);
  assert.equal(input.journal.getCounterOffset("collector1"), alreadyRecovered ? 1 : 0);
  assert.equal(input.journal.getCounterOffset("collector2"), 0);

  await Promise.all([
    exactDirectory(appRoot, ["artifacts", "screenshots"]),
    exactDirectory(artifactsRoot, [
      "journal",
      "open-kits",
      "pins",
      ...SCREENSHOTS.map((entry) => `screenshot-${entry.stem}.json`),
    ]),
    exactDirectory(journalRoot, ["events", "intent.json", "pins"]),
    exactDirectory(
      pinRoot,
      Array.from({ length: identity.pinCount }, (_, index) =>
        `${String(index + 1).padStart(6, "0")}.bin`
      ),
    ),
    exactDirectory(openKitRoot, [
      "open-kit-capture-progress.json",
      ...OPEN_KITS.map((entry) => entry.fileName),
    ]),
    exactDirectory(path.join(artifactsRoot, "pins"), []),
    exactDirectory(screenshotRoot, SCREENSHOTS.map((entry) => `${entry.stem}.png`)),
  ]);

  const intent = await canonicalJsonFile(path.join(journalRoot, "intent.json"));
  assert.equal(intent.sha256, identity.intentSha256);
  assert.equal(intent.value.schema, RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA);
  assert.equal(intent.value.journalId, identity.journalId);
  assert.deepEqual(intent.value.matrix, RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX);

  const events = [];
  for (let index = 0; index < eventNames.length; index += 1) {
    const name = eventNames[index]!;
    const event = await canonicalJsonFile(path.join(eventRoot, name));
    const value = event.value;
    assert.equal(value.schema, RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA);
    assert.equal(value.journalId, identity.journalId);
    assert.equal(value.intentSha256, identity.intentSha256);
    assert.equal(value.eventIndex, index + 1);
    assert.equal(
      value.previousRecordSha256,
      index === 0 ? identity.intentSha256 : events[index - 1]!.sha256,
    );
    assert.equal(
      name,
      `${String(index + 1).padStart(6, "0")}-${String(value.phase).toLowerCase()}-${value.actor}.json`,
    );
    events.push(event);
  }
  assert.equal(events[identity.boundaryEventCount - 1]?.sha256, identity.boundaryFinalEventSha256);
  if (atPlanExtensionBoundary) {
    const extension = events[identity.recoveryEventCount]!.value;
    assert.equal(eventNames.at(-1), PLAN_EXTENSION_EVENT_NAME);
    assert.equal(extension.phase, "PLAN_EXTENSION");
    assert.equal(extension.actor, "creator");
    assert.equal(extension.eventIndex, identity.recoveryEventCount + 1);
    assert.equal(
      extension.previousRecordSha256,
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.requiredPreviousRecordSha256,
    );
    assert.equal(
      extension?.extension?.extensionId,
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.extensionId,
    );
    assert.equal(
      extension.effectiveOperationCount,
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.baseOperationCount
        + RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.operations.length,
    );
  }

  const excluded = new Set<string>();
  if (alreadyRecovered) {
    excluded.add(`artifacts/journal/events/${RECOVERY_EVENT_NAME}`);
  }
  if (atPlanExtensionBoundary) {
    excluded.add(`artifacts/journal/events/${PLAN_EXTENSION_EVENT_NAME}`);
  }
  assert.deepEqual(await inventory(appRoot, excluded), {
    count: PRE_RECOVERY_FILE_COUNT,
    sha256: PRE_RECOVERY_INVENTORY_SHA256,
  });

  const journalPins: RavioliCurrentV6PinRecord[] = [];
  for (const event of events) {
    if (event.value.phase !== "PIN") continue;
    const value = event.value;
    const pinSequence = Number(value.pinSequence);
    const artifact = value.artifact as JsonRecord;
    assert.equal(pinSequence, journalPins.length + 1);
    assert.equal(artifact.path, `pins/${String(pinSequence).padStart(6, "0")}.bin`);
    const bytes = await exactFile(
      path.join(journalRoot, String(artifact.path)),
      String(artifact.sha256),
      Number(artifact.byteLength),
    );
    let jsonValue: JsonRecord | undefined;
    if (artifact.mimeType === "application/json") {
      jsonValue = JSON.parse(Buffer.from(bytes).toString("utf8"));
      assert.equal(
        Buffer.compare(Buffer.from(bytes), Buffer.from(deterministicJsonBytes(jsonValue))),
        0,
        "current-v6 JSON pin is not canonical",
      );
    }
    const cid = String(value?.metadata?.cid || "");
    const uri = `ipfs://${cid}`;
    assert.equal(value?.metadata?.uri, uri);
    assert.equal(
      value?.metadata?.publicGatewayUrl,
      ipfsGatewayUrl(input.ipfs.publicGatewayUrl, cid),
    );
    journalPins.push(Object.freeze({
      bytes,
      ...(jsonValue ? { value: jsonValue } : {}),
      proof: {
        cid,
        uri,
        fileName: String(artifact.fileName),
        mimeType: String(artifact.mimeType),
        byteLength: Number(artifact.byteLength),
        sha256: String(artifact.sha256),
        localGatewayUrl: ipfsGatewayUrl(input.ipfs.localGatewayUrl, cid),
        publicGatewayUrl: ipfsGatewayUrl(input.ipfs.publicGatewayUrl, cid),
        publicGatewayVerified: true,
        verificationAttempts: 1,
      },
    }));
  }
  assert.equal(journalPins.length, identity.pinCount);

  const operations: RavioliCurrentV6OperationRecord[] = [];
  for (let index = 0; index < identity.boundaryEventCount; index += 1) {
    const prepared = events[index]!.value;
    if (prepared.phase !== "PREPARED") continue;
    const submitted = events[index + 1]!.value;
    const applied = events[index + 2]!.value;
    assert.equal(submitted.phase, "SUBMITTED");
    assert.equal(applied.phase, "APPLIED");
    const expected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[operations.length]!;
    assert.equal(prepared.globalOrdinal, expected.globalOrdinal);
    assert.equal(prepared.actor, expected.actor);
    assert.equal(prepared.operationSequence, expected.operationSequence);
    const operation = prepared.operation as JsonRecord;
    const descriptor = operation.descriptor as PastaUiLiveOperationDescriptor;
    assert.equal(ravioliUiLiveDescriptorSha256(descriptor), prepared.descriptorSha256);
    assert.equal(submitted.preparedRecordSha256, events[index]!.sha256);
    assert.equal(applied.submittedRecordSha256, events[index + 1]!.sha256);
    assert.equal(submitted.operationHash, applied.operationHash);
    assert.equal(validateOperation(applied.operationHash), ValidationResult.VALID);
    const evidence = applied.evidence as JsonRecord;
    assert.equal(evidence.operationHash, applied.operationHash);
    const signerAddress = requireAddress(evidence.signerAddress);
    const contractAddress = requireAddress(evidence.contractAddress, true);
    const entrypoints = [...evidence.entrypoints] as string[];
    const identityRecord = {
      globalOrdinal: expected.globalOrdinal,
      actor: expected.actor,
      operationSequence: expected.operationSequence,
      action: operation.action as "originate" | "call",
      descriptorSha256: prepared.descriptorSha256 as string,
      operationHash: applied.operationHash as string,
      signerAddress,
      contractAddress,
      entrypoints,
      counter: Number(evidence.counter),
      level: Number(evidence.level),
      timestamp: String(evidence.timestamp),
    };
    const receipt: PastaUiLivePublicReceipt = {
      schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
      sequence: expected.operationSequence,
      timestampUtc: identityRecord.timestamp,
      action: identityRecord.action,
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress,
      contractAddress,
      operationHash: identityRecord.operationHash,
      entrypoints,
    };
    operations.push(Object.freeze({ identity: identityRecord, descriptor, receipt }));
  }
  assert.equal(operations.length, identity.operationCount);
  assert.equal(operations[0]?.identity.contractAddress, identity.controllerAddress);
  assert.equal(operations[1]?.identity.contractAddress, identity.routerAddress);
  assert.equal(operations[16]?.identity.contractAddress, identity.gnocchiAdapterAddress);

  for (const screenshot of SCREENSHOTS) {
    await Promise.all([
      exactFile(path.join(screenshotRoot, `${screenshot.stem}.png`), screenshot.pngSha256),
      exactFile(
        path.join(artifactsRoot, `screenshot-${screenshot.stem}.json`),
        screenshot.sidecarSha256,
      ),
    ]);
  }
  const openKits = [];
  for (const expected of OPEN_KITS) {
    const bytes = await exactFile(
      path.join(openKitRoot, expected.fileName),
      expected.sha256,
      expected.byteLength,
    );
    const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
    assert.equal(value.schema, "pasta-ravioli-open-kit@3");
    assert.equal(value.network, "shadownet");
    assert.equal(value.contract, identity.routerAddress);
    assert.equal(Number(value.tokenId), expected.tokenId);
    openKits.push(Object.freeze({
      tokenId: expected.tokenId,
      fileName: expected.fileName,
      relativePath: `artifacts/open-kits/${expected.fileName}`,
      bytes,
      value,
      sha256: expected.sha256,
    }));
  }
  await exactFile(
    path.join(openKitRoot, "open-kit-capture-progress.json"),
    "7c2f02a3b3b19cfa716954249b7b0a0639889d569f25a149646d14e8428145a6",
    1_010,
  );
  await verifyExactPrivateSnapshot(input.privateRecoveryRoot);
  await verifyExternalCounterBoundary();

  if (!alreadyRecovered) {
    await input.journal.appendCounterAdvance(exactCounterAdvance());
    eventNames = (await readdir(eventRoot)).sort();
    assert.equal(eventNames.length, identity.recoveryEventCount);
    assert.equal(eventNames.at(-1), RECOVERY_EVENT_NAME);
  } else {
    const recovered = events[identity.recoveryEventCount - 1]!.value;
    assert.equal(recovered.phase, "COUNTER_ADVANCE");
    assert.equal(recovered.timestampUtc, RECOVERY_RECORDED_AT);
    const expected = exactCounterAdvance();
    assert.equal(recovered.recoveryId, expected.recoveryId);
    assert.equal(recovered.semanticBoundary, expected.semanticBoundary);
    assert.equal(recovered.recoveryContractAddress, expected.recoveryContractAddress);
    assert.deepEqual(recovered.advances, expected.advances.map((advance) => ({
      actor: advance.actor,
      advanceBy: advance.operations.length,
      operations: advance.operations,
    })));
  }
  assert.equal(input.journal.hasCounterAdvance(), true);
  assert.equal(input.journal.getCounterOffset("creator"), 3);
  assert.equal(input.journal.getCounterOffset("collector1"), 1);
  assert.equal(input.journal.getCounterOffset("collector2"), 0);

  return Object.freeze({
    appRoot,
    journalRoot,
    controllerAddress: identity.controllerAddress,
    routerAddress: identity.routerAddress,
    gnocchiAdapterAddress: identity.gnocchiAdapterAddress,
    fileCount: identity.recoveredFileCount + (atPlanExtensionBoundary ? 1 : 0),
    journalPins: Object.freeze(journalPins),
    activePins: Object.freeze([...journalPins]),
    operations: Object.freeze(operations),
    writeReceipts: Object.freeze(operations.map((operation) => operation.receipt)),
    openKits: Object.freeze(openKits),
    identity,
  });
}

export async function reopenRavioliCurrentV6Resume(input: {
  journalRoot: string;
  privateRecoveryRoot: string;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  expected: Parameters<typeof loadRavioliCurrentV6Resume>[0]["expected"];
}): Promise<{ journal: RavioliUiLiveJournal; resume: RavioliCurrentV6Resume }> {
  const journal = await openRavioliUiLiveJournal(input.journalRoot);
  const resume = await loadRavioliCurrentV6Resume({
    journal,
    privateRecoveryRoot: input.privateRecoveryRoot,
    ipfs: input.ipfs,
    expected: input.expected,
  });
  return { journal, resume };
}
