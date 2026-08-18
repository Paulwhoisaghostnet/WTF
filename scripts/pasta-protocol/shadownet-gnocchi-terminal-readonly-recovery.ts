#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { TezosToolkit } from "@taquito/taquito";
import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { CID } from "multiformats/cid";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  installPastaUiLiveBrowserProxy,
  PastaUiLiveBridgeError,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveAction,
  type PastaUiLiveBridgeRequest,
} from "./pasta-ui-live-bridge-kit";
import {
  assertMichelsonScriptCodeIdentity,
  hashMichelsonScriptCode,
} from "./pasta-michelson-script-identity";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  type CapturePastaProofStageResult,
  type PastaProofPageMonitor,
  type RequiredDomEvidence,
} from "./pasta-proof-screenshot-kit";
import {
  createHttpGetReader,
  declareReadOnlyReader,
  readWithBoundedRetry,
  type ReadOnlyFetch,
} from "./pasta-readonly-retry";
import { projectGnocchiStorage } from "./shadownet-gnocchi-ui-live";
import {
  deterministicJsonBytes,
  hexToUtf8,
  normalizeBase,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
} from "./shadownet-proof-kit";

export const GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG =
  "PASTA_SHADOWNET_GNOCCHI_TERMINAL_RECOVERY_EXECUTE";
export const GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
export const GNOCCHI_TERMINAL_RECOVERY_RUN_ID = "pasta-alpha-proof-20260808t181046z-v2";
export const GNOCCHI_TERMINAL_RECOVERY_CONTRACT = "KT1Pr5GJoiQY8EZeQjmZ4bBy6NDHCLwvFGhv";
export const GNOCCHI_TERMINAL_RECOVERY_CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
export const GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
export const GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";
export const GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION = "UI-LIVE-READ-ONLY-TERMINAL-RECOVERY";
export const GNOCCHI_TERMINAL_RECOVERY_RECEIPT_PATH =
  "artifacts/gnocchi-terminal-readonly-recovery.json";

const APP_ROOT_PATH = "/creation-tools/gnocchi/index.html";
const STATIC_ROOT = path.join(root, "public");
const CONTRACT_ARTIFACT_PATH = path.join(
  STATIC_ROOT,
  "creation-tools",
  "gnocchi",
  "contract",
  "pasta-open-edition.contract.json",
);
const PREFIX_INVENTORY_SHA256 = "3ac30737a32e58ea015a8aee4de67e878bcd928b7d5517d6062afe19e7d943db";
const PREFIX_FILE_COUNT = 35;
const CONTRACT_ARTIFACT_SHA256 = "0c484c641c15a71c4bd4454b4bf40b6c1a9b016b42e0c5055faf19b4e5241998";
const DEFAULT_PUBLIC_IPFS_GATEWAY = "https://ipfs.fileship.xyz/ipfs";
const INDEPENDENT_PUBLIC_IPFS_GATEWAY = "https://dweb.link/ipfs";
const SHA256_RE = /^[0-9a-f]{64}$/;

type JsonObject = Record<string, any>;
type Actor = "collectorOne" | "collectorTwo";

export type GnocchiTerminalExpectedOperation = {
  action: "originate" | "call";
  hash: string;
  level: number;
  timestamp: string;
  counter: number;
  sender: string;
  entrypoint?: "create_open_edition" | "open_mint" | "set_sale_active";
  amount?: number;
  tokenId?: number;
  creatorReserve?: number;
  active?: boolean;
  metadataUri?: string;
};

export const GNOCCHI_TERMINAL_OPERATION_PLAN: readonly GnocchiTerminalExpectedOperation[] = Object.freeze([
  {
    action: "originate",
    hash: "oouBPx7EvSx68gAxRa8qjQCAyDwSHc2rMBSesJKBDFBUuDAB6ak",
    level: 4_534_424,
    timestamp: "2026-08-08T18:11:03Z",
    counter: 23_831_641,
    sender: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
  },
  {
    action: "call",
    hash: "oni2Fk5MD8TayB9P2BMtACee68vSU9TeQkiT7wrxix1VrnvBmnB",
    level: 4_534_426,
    timestamp: "2026-08-08T18:11:15Z",
    counter: 23_831_642,
    sender: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    entrypoint: "create_open_edition",
    amount: 0,
    tokenId: 0,
    creatorReserve: 2,
    metadataUri: "ipfs://bafkreiaaeb4wvvx2e5m5d4offio4ms3a4tjgjmqnjteza4noskyb4tun7q",
  },
  {
    action: "call",
    hash: "oo2ngVM6jfdorqhKoxJTzVDNAax5QqRzQpRq2q4VtzKuZPbhZ3p",
    level: 4_534_429,
    timestamp: "2026-08-08T18:11:33Z",
    counter: 23_831_643,
    sender: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    entrypoint: "create_open_edition",
    amount: 0,
    tokenId: 1,
    creatorReserve: 2,
    metadataUri: "ipfs://bafkreicf7m4acaanwrvg7x6kh63c624j2hk3r45qpepsyp2epqwrgqbn4e",
  },
  {
    action: "call",
    hash: "oo4vwoXDmMNoNDB6p1tz2vq1CwSv6oe8PfNQqUKNoBZwUFST5jK",
    level: 4_534_431,
    timestamp: "2026-08-08T18:11:45Z",
    counter: 23_831_644,
    sender: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    entrypoint: "create_open_edition",
    amount: 0,
    tokenId: 2,
    creatorReserve: 1,
    metadataUri: "ipfs://bafkreibzia7uzggmd6w3vxfk4osdqy5nda3znywpkrtxzt5dpu7x6omdxa",
  },
  {
    action: "call",
    hash: "ooKF7c2jsp9ZyYAkKnQvJEujxgzakvoUqnDf1w8XM75tUQsgS57",
    level: 4_534_434,
    timestamp: "2026-08-08T18:12:03Z",
    counter: 23_833_876,
    sender: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    entrypoint: "open_mint",
    amount: 1,
    tokenId: 0,
  },
  {
    action: "call",
    hash: "ooFNa7TBD8mx76H3WrSTWq4drQuywCQPGb2kbHYFZPqi59EaCWc",
    level: 4_534_437,
    timestamp: "2026-08-08T18:12:21Z",
    counter: 23_833_877,
    sender: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    entrypoint: "open_mint",
    amount: 1,
    tokenId: 1,
  },
  {
    action: "call",
    hash: "opM7R6Me3RffvE55Esfu3PJpzgk1PYj2QVfUYuDGo2rvAMyQfZf",
    level: 4_534_439,
    timestamp: "2026-08-08T18:12:33Z",
    counter: 23_833_878,
    sender: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    entrypoint: "open_mint",
    amount: 1,
    tokenId: 2,
  },
  {
    action: "call",
    hash: "oooYNWJxi9HYS5ptWAZC7hSztsmFvdHGcX9JAxc777FbNXjnhRt",
    level: 4_534_442,
    timestamp: "2026-08-08T18:12:51Z",
    counter: 23_831_645,
    sender: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    entrypoint: "set_sale_active",
    amount: 0,
    tokenId: 1,
    active: false,
  },
  {
    action: "call",
    hash: "ooXj1GxhwKu8kdA4tVDjQahN2orLpPjU7iAKdfYc7JBXtX12tMx",
    level: 4_534_445,
    timestamp: "2026-08-08T18:13:09Z",
    counter: 23_831_646,
    sender: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    entrypoint: "set_sale_active",
    amount: 0,
    tokenId: 1,
    active: true,
  },
  {
    action: "call",
    hash: "onsrQWjx8bMdECGWG7xv87CTPKo8mKdR66t9uPAEgnwUunQJfEx",
    level: 4_534_447,
    timestamp: "2026-08-08T18:13:21Z",
    counter: 25_689_649,
    sender: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
    entrypoint: "open_mint",
    amount: 1,
    tokenId: 0,
  },
  {
    action: "call",
    hash: "oo6BJCnzmx15fFqMAeeegVXvCWCQEhCvQJ6FoBJ2ChrNA9xP2cn",
    level: 4_534_449,
    timestamp: "2026-08-08T18:13:33Z",
    counter: 25_689_650,
    sender: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
    entrypoint: "open_mint",
    amount: 1,
    tokenId: 1,
  },
  {
    action: "call",
    hash: "op4z4WcYWFvEKKVkFpisZGjumqm6jDr8dkdNFTsiqYXmta5hdmo",
    level: 4_534_452,
    timestamp: "2026-08-08T18:13:51Z",
    counter: 25_689_651,
    sender: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
    entrypoint: "open_mint",
    amount: 1,
    tokenId: 2,
  },
]);

const EXPECTED_CONTENT = Object.freeze([
  {
    id: "token-0-media",
    fileName: "token-0-media.png",
    cid: "bafkreig7u6ezb4ddbgb6l47lwqpkcvkw2zjeu7ldhrq6gtefe5qk3klz6y",
    sha256: "dfa78990f0630983e5f3ebb41ea15556d6524a7d633c61e34c852760ada979f6",
    byteLength: 85,
  },
  {
    id: "collection-metadata",
    fileName: "collection-metadata.json",
    cid: "bafkreifxeguva4tys2vvlor2mjy2iie6fnpjp4ar4xfncf6srlw2ncweqi",
    sha256: "b721a950727896ab55ba3a6271a4209e2b5e97f011e5cad117d28aeda68ac482",
    byteLength: 194,
  },
  {
    id: "token-0-metadata",
    fileName: "token-0-metadata.json",
    cid: "bafkreiaaeb4wvvx2e5m5d4offio4ms3a4tjgjmqnjteza4noskyb4tun7q",
    sha256: "0020796ad6fa2759d1f1c52a1dc64b60e4d264b20d4cc99071ae92b01e4e8dfc",
    byteLength: 696,
  },
  {
    id: "token-1-media",
    fileName: "token-1-media.png",
    cid: "bafkreiexq2vjztzy3l545ludufwbtnndpz52exph7a5ssohcuuz3ocyp2a",
    sha256: "9786aa9ccf38dafbceae83a16c19b5a37e7ba25de7f83b2938e2a533b70b0fd0",
    byteLength: 85,
  },
  {
    id: "token-1-metadata",
    fileName: "token-1-metadata.json",
    cid: "bafkreicf7m4acaanwrvg7x6kh63c624j2hk3r45qpepsyp2epqwrgqbn4e",
    sha256: "45fb3801000db46a6fdfca3fb62f6b89d1d5b8f3b0791f2c3f447c2d13402de1",
    byteLength: 690,
  },
  {
    id: "token-2-media",
    fileName: "token-2-media.png",
    cid: "bafkreiceangf2r25tps6whwpiixeqglcjdqij5ocmeszym4mdmjvmkytrq",
    sha256: "44034c5d475d9be5eb1ecf422e48196248e084f5c261259c338c1b13562b138c",
    byteLength: 85,
  },
  {
    id: "token-2-metadata",
    fileName: "token-2-metadata.json",
    cid: "bafkreibzia7uzggmd6w3vxfk4osdqy5nda3znywpkrtxzt5dpu7x6omdxa",
    sha256: "39403f4c98cc1fadbadcaae3a43863ad183796e2cf54677ccfa37d3f7f3983b8",
    byteLength: 690,
  },
]);

const READ_ONLY_BRIDGE_ACTIONS = new Set<PastaUiLiveAction>([
  "balance",
  "chain_check",
  "connect",
  "contract_at",
  "read_storage",
]);

export type GnocchiTerminalImmutableSnapshot = {
  operationGraphSha256: string;
  contractStateSha256: string;
  scriptSha256: string;
  supplies: readonly number[];
  actorCounters: Record<string, number>;
  actorPendingOperations: readonly unknown[];
};

type ActorPage = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  monitor: PastaProofPageMonitor;
};

type BridgeAudit = {
  actor: Actor;
  requestedActions: string[];
  delegatedActions: string[];
  writeActionRequests: number;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): any[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
}

function safeInteger(value: unknown, label: string): number {
  const converted = typeof value === "object" && value && "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  assert.ok(Number.isSafeInteger(converted) && converted >= 0, `${label} must be a non-negative safe integer`);
  return converted;
}

function expectedTokenMetadataUris(): string[] {
  return EXPECTED_CONTENT
    .filter((content) => /^token-[0-2]-metadata$/.test(content.id))
    .map((content) => `ipfs://${content.cid}`);
}

async function durableWriteNewOrIdentical(filePath: string, bytes: Uint8Array): Promise<void> {
  const details = await lstat(filePath).catch(() => undefined);
  if (details) {
    assert.ok(details.isFile() && !details.isSymbolicLink(), `${filePath} must remain a regular file`);
    assert.deepEqual(await readFile(filePath), Buffer.from(bytes), `${filePath} differs from authenticated recovery bytes`);
    return;
  }
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function listRegularFiles(rootPath: string, relative = ""): Promise<string[]> {
  const directory = path.join(rootPath, relative);
  const names = (await readdir(directory)).sort();
  const output: string[] = [];
  for (const name of names) {
    const childRelative = relative ? `${relative}/${name}` : name;
    const details = await lstat(path.join(rootPath, childRelative));
    assert.equal(details.isSymbolicLink(), false, `${childRelative} must not be a symlink`);
    if (details.isDirectory()) output.push(...await listRegularFiles(rootPath, childRelative));
    else {
      assert.ok(details.isFile(), `${childRelative} must be a regular file`);
      output.push(childRelative);
    }
  }
  return output;
}

export function isGnocchiTerminalPrefixFile(filePath: string): boolean {
  return filePath === "artifacts/gnocchi-current-contract-code.json" ||
    /^artifacts\/screenshot-(?:00[1-9]|01[0-7])-[a-z0-9-]+\.json$/.test(filePath) ||
    /^screenshots\/(?:00[1-9]|01[0-7])-[a-z0-9-]+\.png$/.test(filePath);
}

async function validatePrefixInventory(appRoot: string, exactFreshInventory: boolean): Promise<JsonObject> {
  const allFiles = await listRegularFiles(appRoot);
  const prefixFiles = allFiles.filter(isGnocchiTerminalPrefixFile);
  assert.equal(prefixFiles.length, PREFIX_FILE_COUNT, "Gnocchi terminal prefix file count drift");
  if (exactFreshInventory) assert.deepEqual(allFiles, prefixFiles, "Gnocchi terminal recovery fresh inventory drift");
  const records = [];
  for (const filePath of prefixFiles.sort()) {
    const bytes = await readFile(path.join(appRoot, filePath));
    records.push({ path: filePath, byteLength: bytes.byteLength, sha256: sha256(bytes) });
  }
  const inventorySha256 = sha256(deterministicJsonBytes(records));
  assert.equal(inventorySha256, PREFIX_INVENTORY_SHA256, "Gnocchi terminal prefix inventory hash drift");
  assert.equal(records[0]?.path, "artifacts/gnocchi-current-contract-code.json");
  assert.equal(records[0]?.sha256, CONTRACT_ARTIFACT_SHA256);
  return { records, inventorySha256 };
}

async function fetchBytes(fetchImpl: ReadOnlyFetch, url: string, label: string): Promise<Uint8Array> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      fetchImpl,
      redirect: "follow",
      parse: async (response) => new Uint8Array(await response.arrayBuffer()),
    }),
  });
}

async function fetchJson(fetchImpl: ReadOnlyFetch, url: string, label: string): Promise<any> {
  const bytes = await fetchBytes(fetchImpl, url, label);
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertRawContent(content: typeof EXPECTED_CONTENT[number], bytes: Uint8Array): void {
  assert.equal(bytes.byteLength, content.byteLength, `${content.id} byte length drift`);
  assert.equal(sha256(bytes), content.sha256, `${content.id} SHA-256 drift`);
  const cid = CID.parse(content.cid);
  assert.equal(cid.version, 1);
  assert.equal(cid.code, 0x55);
  assert.equal(cid.multihash.code, 0x12);
  assert.equal(Buffer.from(cid.multihash.digest).toString("hex"), content.sha256);
}

export function assertGnocchiTerminalRecoveryAllowed(
  environment: Record<string, string | undefined>,
): string {
  assert.equal(
    environment[GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG],
    "1",
    `${GNOCCHI_TERMINAL_RECOVERY_EXECUTE_FLAG}=1 is required`,
  );
  assert.equal(
    (environment.TEZOS_NETWORK || "shadownet").toLowerCase(),
    "shadownet",
    "Gnocchi terminal recovery only permits Shadownet",
  );
  const configuredRoot = environment[GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV]?.trim();
  assert.ok(configuredRoot, `${GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV} is required`);
  const runRoot = path.resolve(configuredRoot);
  assert.equal(path.basename(runRoot), GNOCCHI_TERMINAL_RECOVERY_RUN_ID, "Gnocchi terminal recovery run id drift");
  return runRoot;
}

export function validateGnocchiTerminalOperationGraph(input: {
  originations: unknown;
  transactions: unknown;
}): {
  contractAddress: string;
  operationHashes: string[];
  operationGraphSha256: string;
  terminalOperationHash: string;
} {
  const originations = arrayValue(input.originations, "Gnocchi terminal originations");
  assert.equal(originations.length, 1, "Gnocchi terminal recovery requires exactly one origination");
  const transactions = arrayValue(input.transactions, "Gnocchi terminal transactions")
    .map((value, index) => objectValue(value, `Gnocchi terminal transaction ${index + 1}`))
    .sort((left, right) => safeInteger(left.level, "transaction level") - safeInteger(right.level, "transaction level"));
  assert.equal(transactions.length, 11, "Gnocchi terminal recovery requires exactly 11 applied transactions");
  const actual = [objectValue(originations[0], "Gnocchi terminal origination"), ...transactions];
  const normalized = [];
  for (const [index, expected] of GNOCCHI_TERMINAL_OPERATION_PLAN.entries()) {
    const operation = actual[index];
    assert.equal(operation.status, "applied", `Gnocchi terminal operation ${index + 1} status drift`);
    assert.equal(operation.hash, expected.hash, `Gnocchi terminal operation ${index + 1} hash drift`);
    assert.equal(validateOperation(String(operation.hash || "")), ValidationResult.VALID);
    assert.equal(operation.level, expected.level, `Gnocchi terminal operation ${index + 1} level drift`);
    assert.equal(operation.counter, expected.counter, `Gnocchi terminal operation ${index + 1} counter drift`);
    assert.equal(operation.timestamp, expected.timestamp, `Gnocchi terminal operation ${index + 1} timestamp drift`);
    assert.equal(operation.sender?.address, expected.sender, `Gnocchi terminal operation ${index + 1} sender drift`);
    if (expected.action === "originate") {
      assert.equal(operation.originatedContract?.address, GNOCCHI_TERMINAL_RECOVERY_CONTRACT);
      normalized.push({ ...expected, contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT });
      continue;
    }
    assert.equal(operation.target?.address, GNOCCHI_TERMINAL_RECOVERY_CONTRACT);
    assert.equal(operation.parameter?.entrypoint, expected.entrypoint, `Gnocchi terminal operation ${index + 1} entrypoint drift`);
    assert.equal(safeInteger(operation.amount, `Gnocchi terminal operation ${index + 1} amount`), expected.amount);
    const payload = objectValue(operation.parameter?.value, `Gnocchi terminal operation ${index + 1} payload`);
    if (expected.entrypoint === "open_mint") {
      assert.equal(safeInteger(payload.token_id, "mint token id"), expected.tokenId);
      assert.equal(safeInteger(payload.amount, "mint amount"), 1);
    } else if (expected.entrypoint === "set_sale_active") {
      assert.equal(safeInteger(payload.token_id, "managed token id"), 1);
      assert.equal(payload.active, expected.active);
    } else {
      assert.equal(safeInteger(payload.creator_reserve, "creator reserve"), expected.creatorReserve);
      assert.equal(payload.lock_policy, true);
      assert.equal(hexToUtf8(String(payload.token_info?.[""] || "")), expected.metadataUri);
      const sale = objectValue(payload.sale, "Gnocchi terminal sale");
      assert.equal(sale.active, true);
      assert.equal(sale.treasury, GNOCCHI_TERMINAL_RECOVERY_CREATOR);
      assert.equal(safeInteger(sale.base_price, "base price"), 1);
      assert.equal(safeInteger(sale.increment, "increment"), 0);
      assert.equal(safeInteger(sale.step_size, "step size"), 1);
      assert.equal(sale.min_price, null);
      assert.equal(sale.max_price, null);
      if (expected.tokenId === 1) {
        assert.equal(sale.start, null);
        assert.equal(sale.end, null);
        assert.equal(sale.max_supply, null);
      } else {
        assert.equal(sale.start, "2026-08-08T18:09:00Z");
        assert.equal(sale.end, "9999-12-31T23:58:00Z");
        if (expected.tokenId === 2) assert.equal(safeInteger(sale.max_supply, "LE max supply"), 4);
        else assert.equal(sale.max_supply, null);
      }
    }
    normalized.push({ ...expected, contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT });
  }
  const operationHashes = normalized.map((operation) => operation.hash);
  assert.equal(new Set(operationHashes).size, 12, "Gnocchi terminal operation hashes must be unique");
  return {
    contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
    operationHashes,
    operationGraphSha256: sha256(deterministicJsonBytes(normalized)),
    terminalOperationHash: operationHashes[operationHashes.length - 1],
  };
}

function activeRows(value: unknown, label: string, count: number): JsonObject[] {
  const rows = arrayValue(value, label).map((row, index) => objectValue(row, `${label} ${index + 1}`));
  assert.equal(rows.length, count, `${label} row count drift`);
  for (const row of rows) assert.equal(row.active, true, `${label} contains an inactive row`);
  return rows;
}

function rowsByToken(value: unknown, label: string): Map<number, JsonObject> {
  const output = new Map<number, JsonObject>();
  for (const row of activeRows(value, label, 3)) {
    const tokenId = safeInteger(row.key, `${label} token id`);
    assert.ok(tokenId <= 2 && !output.has(tokenId), `${label} token key drift`);
    output.set(tokenId, row);
  }
  return output;
}

async function readIndexedTerminalState(fetchImpl: ReadOnlyFetch): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = GNOCCHI_TERMINAL_RECOVERY_CONTRACT;
  const encoded = encodeURIComponent(contract);
  const contractRecord = objectValue(
    await fetchJson(fetchImpl, `${base}/contracts/${encoded}`, "Gnocchi terminal indexed contract"),
    "Gnocchi terminal indexed contract",
  );
  assert.equal(contractRecord.address, contract);
  assert.equal(contractRecord.kind, "asset");
  assert.ok(arrayValue(contractRecord.tzips, "Gnocchi terminal TZIPs").includes("fa2"));
  const storage = objectValue(
    await fetchJson(fetchImpl, `${base}/contracts/${encoded}/storage`, "Gnocchi terminal indexed storage"),
    "Gnocchi terminal indexed storage",
  );
  const code = await fetchJson(fetchImpl, `${base}/contracts/${encoded}/code`, "Gnocchi terminal indexed code");
  const originations = await fetchJson(
    fetchImpl,
    `${base}/operations/originations?originatedContract=${encoded}&status=applied&limit=10`,
    "Gnocchi terminal indexed origination",
  );
  const transactions = await fetchJson(
    fetchImpl,
    `${base}/operations/transactions?target=${encoded}&status=applied&limit=100`,
    "Gnocchi terminal indexed transactions",
  );
  const operationGraph = validateGnocchiTerminalOperationGraph({ originations, transactions });
  assert.equal(storage.administrator, GNOCCHI_TERMINAL_RECOVERY_CREATOR);
  assert.equal(safeInteger(storage.next_token_id, "terminal next token id"), 3);
  const mapNames = [
    "ledger",
    "metadata",
    "minters",
    "operators",
    "policy_locked",
    "reserved_mints",
    "sales",
    "token_metadata",
    "total_minted",
    "total_reserved",
    "total_supply",
  ] as const;
  const maps: Record<string, JsonObject[]> = {};
  for (const name of mapNames) {
    const id = safeInteger(storage[name], `Gnocchi terminal ${name} map id`);
    maps[name] = await fetchJson(fetchImpl, `${base}/bigmaps/${id}/keys?active=true&limit=100`, `Gnocchi terminal ${name}`);
  }
  assert.equal(maps.minters.length, 0);
  assert.equal(maps.operators.length, 0);
  assert.equal(maps.reserved_mints.length, 0);
  const supplies = rowsByToken(maps.total_supply, "Gnocchi terminal total supply");
  const minted = rowsByToken(maps.total_minted, "Gnocchi terminal total minted");
  const reserved = rowsByToken(maps.total_reserved, "Gnocchi terminal total reserved");
  const policies = rowsByToken(maps.policy_locked, "Gnocchi terminal policy lock");
  const sales = rowsByToken(maps.sales, "Gnocchi terminal sales");
  const tokenMetadata = rowsByToken(maps.token_metadata, "Gnocchi terminal token metadata");
  const expectedSupplies = [4, 4, 3];
  for (const tokenId of [0, 1, 2]) {
    assert.equal(safeInteger(supplies.get(tokenId)?.value, `token ${tokenId} supply`), expectedSupplies[tokenId]);
    assert.equal(safeInteger(minted.get(tokenId)?.value, `token ${tokenId} minted`), expectedSupplies[tokenId]);
    assert.equal(safeInteger(reserved.get(tokenId)?.value, `token ${tokenId} reserved`), 0);
    assert.equal(policies.get(tokenId)?.value, true);
    assert.equal(sales.get(tokenId)?.value?.active, true);
    assert.equal(
      hexToUtf8(String(tokenMetadata.get(tokenId)?.value?.token_info?.[""] || "")),
      expectedTokenMetadataUris()[tokenId],
    );
  }
  assert.equal(sales.get(0)?.value?.max_supply, null);
  assert.equal(sales.get(1)?.value?.start, null);
  assert.equal(sales.get(1)?.value?.end, null);
  assert.equal(sales.get(1)?.value?.max_supply, null);
  assert.equal(safeInteger(sales.get(2)?.value?.max_supply, "terminal LE max supply"), 4);
  const metadataRows = activeRows(maps.metadata, "Gnocchi terminal collection metadata", 1);
  assert.equal(metadataRows[0].key, "");
  assert.equal(hexToUtf8(String(metadataRows[0].value)), `ipfs://${EXPECTED_CONTENT[1].cid}`);
  const ledgerRows = activeRows(maps.ledger, "Gnocchi terminal ledger", 9);
  const expectedBalances = new Map([
    [GNOCCHI_TERMINAL_RECOVERY_CREATOR, [2, 2, 1]],
    [GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE, [1, 1, 1]],
    [GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO, [1, 1, 1]],
  ]);
  for (const [owner, balances] of expectedBalances) {
    for (const tokenId of [0, 1, 2]) {
      const matches = ledgerRows.filter((row) =>
        row.key?.owner === owner && safeInteger(row.key?.token_id, "ledger token id") === tokenId
      );
      assert.equal(matches.length, 1, `${owner} token ${tokenId} ledger row drift`);
      assert.equal(safeInteger(matches[0].value, `${owner} token ${tokenId} balance`), balances[tokenId]);
    }
  }
  const tokens = arrayValue(
    await fetchJson(fetchImpl, `${base}/tokens?contract=${encoded}&limit=20`, "Gnocchi terminal indexed tokens"),
    "Gnocchi terminal indexed tokens",
  ).sort((left, right) => safeInteger(left.tokenId, "token id") - safeInteger(right.tokenId, "token id"));
  assert.equal(tokens.length, 3);
  tokens.forEach((token, tokenId) => {
    assert.equal(safeInteger(token.tokenId, "token id"), tokenId);
    assert.equal(safeInteger(token.totalSupply, `indexed token ${tokenId} supply`), expectedSupplies[tokenId]);
  });
  const artifact = JSON.parse(await readFile(CONTRACT_ARTIFACT_PATH, "utf8"));
  const artifactCodeSha256 = hashMichelsonScriptCode(artifact);
  const indexedCodeSha256 = assertMichelsonScriptCodeIdentity(
    code,
    artifact,
    "Gnocchi terminal indexed code differs from the current artifact",
  );
  assert.equal(indexedCodeSha256, artifactCodeSha256);
  const stableMaps = Object.fromEntries(Object.entries(maps).map(([name, rows]) => [
    name,
    rows.map((row) => ({
      active: row.active,
      key: row.key,
      value: row.value,
      firstLevel: row.firstLevel,
      lastLevel: row.lastLevel,
      updates: row.updates,
    })),
  ]));
  return {
    operationGraph,
    operationGraphSha256: operationGraph.operationGraphSha256,
    contractStateSha256: sha256(deterministicJsonBytes({ storage, maps: stableMaps, tokens })),
    indexedCodeSha256,
    supplies: expectedSupplies,
    storage,
    maps,
  };
}

function pendingActorOperations(value: unknown): JsonObject[] {
  const actorAddresses = new Set([
    GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
  ]);
  const mempool = objectValue(value, "Gnocchi terminal mempool");
  const output: JsonObject[] = [];
  for (const [category, entries] of Object.entries(mempool)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const operation = Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
      if (!operation || typeof operation !== "object") continue;
      for (const content of Array.isArray((operation as JsonObject).contents) ? (operation as JsonObject).contents : []) {
        const source = String(content?.source || "");
        if (actorAddresses.has(source)) output.push({ category, hash: (operation as JsonObject).hash || null, source });
      }
    }
  }
  return output;
}

async function readRpcSnapshot(fetchImpl: ReadOnlyFetch, rpcUrl: string): Promise<JsonObject> {
  const base = normalizeBase(rpcUrl);
  const chainId = await fetchJson(fetchImpl, `${base}/chains/main/chain_id`, `${rpcUrl} chain id`);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${rpcUrl} is not Shadownet`);
  const headHash = await fetchJson(fetchImpl, `${base}/chains/main/blocks/head/hash`, `${rpcUrl} head hash`);
  const header = objectValue(
    await fetchJson(fetchImpl, `${base}/chains/main/blocks/head/header`, `${rpcUrl} head header`),
    `${rpcUrl} head header`,
  );
  const storage = await fetchJson(
    fetchImpl,
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_TERMINAL_RECOVERY_CONTRACT}/storage`,
    `${rpcUrl} Gnocchi terminal storage`,
  );
  const script = await fetchJson(
    fetchImpl,
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_TERMINAL_RECOVERY_CONTRACT}/script`,
    `${rpcUrl} Gnocchi terminal script`,
  );
  const actors = {
    creator: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    collectorOne: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    collectorTwo: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
  };
  const counters: Record<string, number> = {};
  for (const [role, address] of Object.entries(actors)) {
    counters[role] = safeInteger(
      await fetchJson(fetchImpl, `${base}/chains/main/blocks/head/context/contracts/${address}/counter`, `${rpcUrl} ${role} counter`),
      `${rpcUrl} ${role} counter`,
    );
  }
  const mempool = await fetchJson(fetchImpl, `${base}/chains/main/mempool/pending_operations`, `${rpcUrl} mempool`);
  const actorPendingOperations = pendingActorOperations(mempool);
  assert.equal(actorPendingOperations.length, 0, `${rpcUrl} actor mempool must be empty`);
  return {
    rpcUrl,
    chainId,
    head: { hash: headHash, level: safeInteger(header.level, `${rpcUrl} head level`), timestamp: header.timestamp },
    storageSha256: sha256(deterministicJsonBytes(storage)),
    scriptSha256: sha256(deterministicJsonBytes(script)),
    counters,
    actorPendingOperations,
  };
}

async function readImmutableSnapshot(fetchImpl: ReadOnlyFetch): Promise<GnocchiTerminalImmutableSnapshot & { rpc: JsonObject }> {
  const indexed = await readIndexedTerminalState(fetchImpl);
  const primary = await readRpcSnapshot(fetchImpl, SHADOWNET_RPC_PRIMARY);
  const fallback = await readRpcSnapshot(fetchImpl, SHADOWNET_RPC_FALLBACK);
  assert.equal(primary.storageSha256, fallback.storageSha256, "configured RPC storage disagreement");
  assert.equal(primary.scriptSha256, fallback.scriptSha256, "configured RPC script disagreement");
  assert.deepEqual(primary.counters, fallback.counters, "configured RPC actor-counter disagreement");
  return {
    operationGraphSha256: indexed.operationGraphSha256,
    contractStateSha256: indexed.contractStateSha256,
    scriptSha256: primary.scriptSha256,
    supplies: indexed.supplies,
    actorCounters: primary.counters,
    actorPendingOperations: [...primary.actorPendingOperations, ...fallback.actorPendingOperations],
    rpc: { primary, fallback },
  };
}

export function assertGnocchiTerminalSnapshotUnchanged(
  before: GnocchiTerminalImmutableSnapshot,
  after: GnocchiTerminalImmutableSnapshot,
): void {
  assert.deepEqual(before.supplies, [4, 4, 3], "Gnocchi terminal baseline must expose 4/4/3 supply");
  assert.deepEqual(after.supplies, [4, 4, 3], "Gnocchi terminal result must preserve 4/4/3 supply");
  assert.equal(before.actorPendingOperations.length, 0, "Gnocchi terminal baseline actor mempool is not empty");
  assert.equal(after.actorPendingOperations.length, 0, "Gnocchi terminal result actor mempool is not empty");
  assert.equal(after.operationGraphSha256, before.operationGraphSha256, "Gnocchi terminal operation graph changed");
  assert.equal(after.contractStateSha256, before.contractStateSha256, "Gnocchi terminal contract state changed");
  assert.equal(after.scriptSha256, before.scriptSha256, "Gnocchi terminal script changed");
  assert.deepEqual(after.actorCounters, before.actorCounters, "Gnocchi terminal actor counters changed");
}

export function createGnocchiTerminalReadOnlyBridgeHandler(input: {
  actor: Actor;
  delegate(request: PastaUiLiveBridgeRequest): Promise<unknown>;
}): {
  handleAction(request: PastaUiLiveBridgeRequest): Promise<unknown>;
  audit: BridgeAudit;
} {
  const audit: BridgeAudit = {
    actor: input.actor,
    requestedActions: [],
    delegatedActions: [],
    writeActionRequests: 0,
  };
  return {
    audit,
    handleAction: async (request) => {
      audit.requestedActions.push(request.action);
      if (!READ_ONLY_BRIDGE_ACTIONS.has(request.action)) {
        audit.writeActionRequests += 1;
        throw new PastaUiLiveBridgeError(
          `${request.action} is not allowed by terminal read-only recovery`,
          403,
        );
      }
      return readWithBoundedRetry({
        primary: declareReadOnlyReader(
          `Gnocchi terminal ${input.actor} ${request.action}`,
          async () => {
            audit.delegatedActions.push(request.action);
            return input.delegate(request);
          },
        ),
      });
    },
  };
}

async function materializePinnedContent(
  appRoot: string,
  fetchImpl: ReadOnlyFetch,
): Promise<JsonObject[]> {
  const publicGateway = normalizeBase(
    process.env.PASTA_SHADOWNET_IPFS_GATEWAY || DEFAULT_PUBLIC_IPFS_GATEWAY,
  );
  const independentGateway = normalizeBase(INDEPENDENT_PUBLIC_IPFS_GATEWAY);
  const artifacts = [];
  for (const content of EXPECTED_CONTENT) {
    const publicUrl = `${publicGateway}/${content.cid}`;
    const independentUrl = `${independentGateway}/${content.cid}`;
    const primary = await fetchBytes(fetchImpl, publicUrl, `${content.id} public IPFS bytes`);
    const independent = await fetchBytes(fetchImpl, independentUrl, `${content.id} independent IPFS bytes`);
    assertRawContent(content, primary);
    assertRawContent(content, independent);
    assert.deepEqual(primary, independent, `${content.id} public gateway disagreement`);
    const relativePath = `artifacts/${content.fileName}`;
    await durableWriteNewOrIdentical(path.join(appRoot, relativePath), primary);
    artifacts.push({
      id: content.id,
      path: relativePath,
      cid: content.cid,
      ipfsUri: `ipfs://${content.cid}`,
      sha256: content.sha256,
      byteLength: content.byteLength,
      sources: [publicUrl, independentUrl],
    });
  }
  return artifacts;
}

async function createReadOnlyActor(input: {
  actor: Actor;
  address: string;
}): Promise<{
  actor: ActorPage;
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
  session: TaquitoPastaUiLiveSession;
  audit: BridgeAudit;
  injectionAttempts(): number;
}> {
  const tezos = new TezosToolkit(SHADOWNET_RPC_PRIMARY);
  let injected = 0;
  tezos.setProvider({
    injector: {
      inject: async () => {
        injected += 1;
        throw new Error("terminal read-only recovery forbids operation injection");
      },
    } as never,
  });
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: input.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedEntrypoints: new Set(),
    assertExpectedChain: async () => {
      const chainId = await tezos.rpc.getChainId();
      assert.equal(chainId, SHADOWNET_CHAIN_ID);
      return chainId;
    },
    assertOperationApplied: async () => {
      throw new Error("terminal read-only recovery cannot verify a newly submitted operation");
    },
    pinJson: async () => { throw new PastaUiLiveBridgeError("terminal read-only recovery forbids pinning", 403); },
    validateOrigination: async () => { throw new PastaUiLiveBridgeError("terminal read-only recovery forbids origination", 403); },
    validateCall: async () => { throw new PastaUiLiveBridgeError("terminal read-only recovery forbids calls", 403); },
    projectStorage: projectGnocchiStorage,
  });
  session.authorizeReadOnlyContract({ contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT });
  const handler = createGnocchiTerminalReadOnlyBridgeHandler({
    actor: input.actor,
    delegate: (request) => session.handle(request),
  });
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: handler.handleAction,
  });
  let browser: Browser | null = null;
  let monitor: PastaProofPageMonitor | null = null;
  try {
    browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
    const context = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const page = await context.newPage();
    monitor = monitorPastaProofPage(page);
    await page.goto(`${bridge.origin}${APP_ROOT_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE");
    return {
      actor: { browser, context, page, monitor },
      bridge,
      session,
      audit: handler.audit,
      injectionAttempts: () => injected,
    };
  } catch (error) {
    monitor?.dispose();
    await browser?.close().catch(() => undefined);
    await bridge.close().catch(() => undefined);
    throw error;
  }
}

async function closeReadOnlyActor(input: Awaited<ReturnType<typeof createReadOnlyActor>> | null): Promise<void> {
  if (!input) return;
  input.actor.monitor.dispose();
  await input.actor.browser.close();
  await input.bridge.close();
}

async function waitForText(page: Page, selector: string, expected: string): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    ({ selector: selected, expected: text }) => document.querySelector(selected)?.textContent?.includes(text),
    { selector, expected },
    { timeout: 30_000 },
  );
}

async function connectAndLoadTokenTwo(page: Page, address: string): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.click("#btnConnect");
  await waitForText(page, "#log", `connected ${address} on shadownet`);
  await page.fill("#mintKt", GNOCCHI_TERMINAL_RECOVERY_CONTRACT);
  await page.fill("#mintTokenId", "2");
  await page.click("#btnLoadPrice");
  await page.waitForFunction(() => {
    const info = document.querySelector("#mintInfo")?.textContent || "";
    const notice = document.querySelector("#ppNotice")?.textContent || "";
    return info.includes("3 lifetime minted / 4 cap") || notice.startsWith("Could not load price:");
  }, undefined, { timeout: 30_000 });
  const { text, notice } = await page.evaluate(() => ({
    text: document.querySelector("#mintInfo")?.textContent || "",
    notice: document.querySelector("#ppNotice")?.textContent || "",
  }));
  assert.match(text, /3 lifetime minted \/ 4 cap/, `Gnocchi token policy load failed: ${notice}`);
  assert.match(text, /Limited Edition/);
  assert.match(text, /POLICY LOCKED/);
  assert.doesNotMatch(text, /NaN|Invalid Date|\[object Object\]/);
}

async function captureStage(input: {
  actor: ActorPage;
  runRoot: string;
  ordinal: number;
  stageName: string;
  evidence: RequiredDomEvidence[];
}): Promise<CapturePastaProofStageResult> {
  await input.actor.page.locator("#mintInfo").scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page: input.actor.page,
    monitor: input.actor.monitor,
    outputRoot: input.runRoot,
    app: "gnocchi",
    capability: "independent collector mints",
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.evidence,
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

function bridgeAuditSummary(
  actor: Awaited<ReturnType<typeof createReadOnlyActor>>,
): JsonObject {
  const receipts = actor.session.getReceipts();
  const receiptOperationHashes = receipts.flatMap((receipt) => receipt.operationHash ? [receipt.operationHash] : []);
  assert.equal(actor.audit.writeActionRequests, 0, `${actor.audit.actor} requested a write-shaped bridge action`);
  assert.equal(actor.injectionAttempts(), 0, `${actor.audit.actor} reached the injector`);
  assert.equal(receiptOperationHashes.length, 0, `${actor.audit.actor} produced a submitted-operation receipt`);
  assert.ok(actor.audit.requestedActions.length > 0, `${actor.audit.actor} bridge audit is empty`);
  assert.ok(actor.audit.requestedActions.every((action) => READ_ONLY_BRIDGE_ACTIONS.has(action as PastaUiLiveAction)));
  return {
    actor: actor.audit.actor,
    requestedActions: actor.audit.requestedActions,
    delegatedActions: actor.audit.delegatedActions,
    writeActionRequests: actor.audit.writeActionRequests,
    receiptActions: receipts.map((receipt) => receipt.action),
    receiptOperationHashes,
    submittedOperations: 0,
    injectedOperations: actor.injectionAttempts(),
  };
}

export function validateGnocchiTerminalRecoveryReceipt(input: {
  receipt: unknown;
  runId: string;
  contractAddress: string;
  operationHashes: readonly string[];
}): JsonObject {
  const receipt = objectValue(input.receipt, "Gnocchi terminal recovery receipt");
  assert.equal(receipt.schema, "pastaprotocol-gnocchi-terminal-readonly-recovery@1");
  assert.equal(receipt.classification, GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION);
  assert.equal(receipt.status, "PASSED");
  assert.equal(receipt.runId, input.runId);
  assert.equal(receipt.network, "shadownet");
  assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
  assert.equal(receipt.contract?.address, input.contractAddress);
  assert.equal(receipt.prefix?.inventorySha256, PREFIX_INVENTORY_SHA256);
  assert.deepEqual(receipt.prefix?.preservedScreenshotOrdinals, Array.from({ length: 17 }, (_, index) => index + 1));
  assert.deepEqual(receipt.operationGraph?.operationHashes, [...input.operationHashes]);
  assert.equal(receipt.operationGraph?.terminalOperationHash, input.operationHashes.at(-1));
  assert.deepEqual(receipt.terminalState?.supplies, [4, 4, 3]);
  assert.equal(receipt.terminalState?.overCapRequest?.tokenId, 2);
  assert.equal(receipt.terminalState?.overCapRequest?.amount, 2);
  assert.equal(receipt.terminalState?.overCapRequest?.remaining, 1);
  assert.equal(receipt.terminalState?.overCapRequest?.reason, "not enough supply left");
  assert.deepEqual(
    arrayValue(receipt.screenshots, "Gnocchi terminal recovery screenshots").map((screenshot) => screenshot.stageOrdinal),
    [18, 19],
  );
  assert.equal(arrayValue(receipt.contentArtifacts, "Gnocchi terminal recovery content").length, 7);
  const bridge = objectValue(receipt.bridge, "Gnocchi terminal recovery bridge audit");
  assert.equal(bridge.signerMaterialLoaded, false);
  assert.equal(bridge.submittedOperations, 0);
  assert.equal(bridge.injectedOperations, 0);
  assert.equal(bridge.writeActionRequests, 0);
  for (const audit of arrayValue(bridge.actors, "Gnocchi terminal recovery actor audits")) {
    assert.equal(audit.writeActionRequests, 0);
    assert.equal(audit.submittedOperations, 0);
    assert.equal(audit.injectedOperations, 0);
    assert.ok(arrayValue(audit.requestedActions, "terminal requested actions")
      .every((action) => READ_ONLY_BRIDGE_ACTIONS.has(action)));
  }
  assert.equal(receipt.unchanged?.operationGraph, true);
  assert.equal(receipt.unchanged?.contractState, true);
  assert.equal(receipt.unchanged?.script, true);
  assert.equal(receipt.unchanged?.actorCounters, true);
  assert.equal(receipt.unchanged?.actorMempoolEmpty, true);
  return {
    classification: receipt.classification,
    prefix: receipt.prefix,
    operationGraph: receipt.operationGraph,
    terminalState: receipt.terminalState,
    bridge: receipt.bridge,
    unchanged: receipt.unchanged,
  };
}

async function validateExistingRecovery(appRoot: string): Promise<JsonObject | undefined> {
  const receiptPath = path.join(appRoot, GNOCCHI_TERMINAL_RECOVERY_RECEIPT_PATH);
  const details = await lstat(receiptPath).catch(() => undefined);
  if (!details) return undefined;
  assert.ok(details.isFile() && !details.isSymbolicLink());
  const receiptBytes = await readFile(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  validateGnocchiTerminalRecoveryReceipt({
    receipt,
    runId: GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
    contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
    operationHashes: GNOCCHI_TERMINAL_OPERATION_PLAN.map(({ hash }) => hash),
  });
  for (const screenshot of receipt.screenshots) {
    const png = await readFile(path.join(appRoot, screenshot.path));
    const sidecar = await readFile(path.join(appRoot, screenshot.sidecarPath));
    assert.equal(sha256(png), screenshot.sha256);
    assert.equal(sha256(sidecar), screenshot.sidecarSha256);
  }
  for (const content of receipt.contentArtifacts) {
    const bytes = await readFile(path.join(appRoot, content.path));
    assert.equal(sha256(bytes), content.sha256);
  }
  return {
    status: "PASSED",
    classification: receipt.classification,
    contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    alreadyRecovered: true,
  };
}

export async function runGnocchiTerminalReadOnlyRecovery(input: {
  runRoot?: string;
  fetchImpl?: ReadOnlyFetch;
} = {}): Promise<JsonObject> {
  const runRoot = input.runRoot
    ? assertGnocchiTerminalRecoveryAllowed({
      ...process.env,
      [GNOCCHI_TERMINAL_RECOVERY_OUTPUT_ENV]: input.runRoot,
    })
    : assertGnocchiTerminalRecoveryAllowed(process.env);
  const fetchImpl = input.fetchImpl || fetch;
  const appRoot = path.join(runRoot, "gnocchi");
  assert.equal(validateContractAddress(GNOCCHI_TERMINAL_RECOVERY_CONTRACT), ValidationResult.VALID);
  for (const address of [
    GNOCCHI_TERMINAL_RECOVERY_CREATOR,
    GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
  ]) assert.equal(validateAddress(address), ValidationResult.VALID);
  const existing = await validateExistingRecovery(appRoot);
  if (existing) return existing;
  const prefix = await validatePrefixInventory(appRoot, false);
  const allowedPreRecoveryFiles = new Set([
    ...prefix.records.map((record: JsonObject) => String(record.path)),
    ...EXPECTED_CONTENT.map((content) => `artifacts/${content.fileName}`),
  ]);
  for (const filePath of await listRegularFiles(appRoot)) {
    assert.ok(
      allowedPreRecoveryFiles.has(filePath),
      `Gnocchi terminal recovery found an unexpected pre-existing file: ${filePath}`,
    );
  }
  for (const relativePath of [
    "screenshots/018-",
    "screenshots/019-",
    "artifacts/screenshot-018-",
    "artifacts/screenshot-019-",
    GNOCCHI_TERMINAL_RECOVERY_RECEIPT_PATH,
  ]) {
    assert.equal(
      (await listRegularFiles(appRoot)).some((filePath) => filePath.startsWith(relativePath)),
      false,
      `${relativePath} already exists without a terminal recovery receipt`,
    );
  }
  const artifactBytes = await readFile(CONTRACT_ARTIFACT_PATH);
  assert.equal(sha256(artifactBytes), CONTRACT_ARTIFACT_SHA256);
  assert.deepEqual(
    await readFile(path.join(appRoot, "artifacts", "gnocchi-current-contract-code.json")),
    artifactBytes,
  );
  const before = await readImmutableSnapshot(fetchImpl);
  const contentArtifacts = await materializePinnedContent(appRoot, fetchImpl);

  let collectorTwo: Awaited<ReturnType<typeof createReadOnlyActor>> | null = null;
  let collectorOne: Awaited<ReturnType<typeof createReadOnlyActor>> | null = null;
  let screenshot18: CapturePastaProofStageResult | null = null;
  let screenshot19: CapturePastaProofStageResult | null = null;
  let collectorTwoAudit: JsonObject | null = null;
  let collectorOneAudit: JsonObject | null = null;
  try {
    collectorTwo = await createReadOnlyActor({
      actor: "collectorTwo",
      address: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO,
    });
    await connectAndLoadTokenTwo(collectorTwo.actor.page, GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO);
    screenshot18 = await captureStage({
      actor: collectorTwo.actor,
      runRoot,
      ordinal: 18,
      stageName: "Collector two token 2 terminal state recovered read-only",
      evidence: [
        { selector: "#account", expectedText: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_TWO.slice(0, 7) },
        { selector: "#mintInfo", expectedText: "Limited Edition" },
        { selector: "#mintInfo", expectedText: "3 lifetime minted / 4 cap" },
        { selector: "#mintInfo", expectedText: "POLICY LOCKED" },
      ],
    });
    collectorTwoAudit = bridgeAuditSummary(collectorTwo);

    collectorOne = await createReadOnlyActor({
      actor: "collectorOne",
      address: GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE,
    });
    await connectAndLoadTokenTwo(collectorOne.actor.page, GNOCCHI_TERMINAL_RECOVERY_COLLECTOR_ONE);
    await collectorOne.actor.page.fill("#mintAmount", "2");
    const requestedBefore = collectorOne.audit.requestedActions.length;
    await collectorOne.actor.page.click("#btnMint");
    await waitForText(collectorOne.actor.page, "#log", "mint failed: not enough supply left");
    const rejectionActions = collectorOne.audit.requestedActions.slice(requestedBefore);
    assert.ok(rejectionActions.length > 0, "over-cap rejection did not re-read live policy state");
    assert.ok(rejectionActions.every((action) => READ_ONLY_BRIDGE_ACTIONS.has(action as PastaUiLiveAction)));
    assert.equal(collectorOne.audit.writeActionRequests, 0);
    screenshot19 = await captureStage({
      actor: collectorOne.actor,
      runRoot,
      ordinal: 19,
      stageName: "Limited edition cap enforced",
      evidence: [
        { selector: "#mintInfo", expectedText: "3 lifetime minted / 4 cap" },
        { selector: "#log", expectedText: "mint failed: not enough supply left" },
      ],
    });
    collectorOneAudit = { ...bridgeAuditSummary(collectorOne), rejectionActions };
  } finally {
    await closeReadOnlyActor(collectorTwo);
    await closeReadOnlyActor(collectorOne);
  }
  assert.ok(screenshot18 && screenshot19 && collectorTwoAudit && collectorOneAudit);
  const after = await readImmutableSnapshot(fetchImpl);
  assertGnocchiTerminalSnapshotUnchanged(before, after);
  const actorAudits = [collectorTwoAudit, collectorOneAudit];
  const writeActionRequests = actorAudits.reduce((total, audit) => total + safeInteger(audit.writeActionRequests, "write action requests"), 0);
  const submittedOperations = actorAudits.reduce((total, audit) => total + safeInteger(audit.submittedOperations, "submitted operations"), 0);
  const injectedOperations = actorAudits.reduce((total, audit) => total + safeInteger(audit.injectedOperations, "injected operations"), 0);
  assert.equal(writeActionRequests, 0);
  assert.equal(submittedOperations, 0);
  assert.equal(injectedOperations, 0);
  const screenshots = [screenshot18, screenshot19].map((capture) => ({
    stageOrdinal: capture.sidecar.stageOrdinal,
    stageName: capture.sidecar.stageName,
    path: capture.manifestScreenshot.path,
    sha256: capture.manifestScreenshot.sha256,
    sidecarPath: capture.manifestSidecarArtifact.path,
    sidecarSha256: capture.manifestSidecarArtifact.sha256,
  }));
  const operationHashes = GNOCCHI_TERMINAL_OPERATION_PLAN.map(({ hash }) => hash);
  const receipt = {
    schema: "pastaprotocol-gnocchi-terminal-readonly-recovery@1",
    classification: GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION,
    status: "PASSED",
    runId: GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    recoveredAt: new Date().toISOString(),
    contract: {
      address: GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
      explorerUrl: `https://shadownet.tzkt.io/${GNOCCHI_TERMINAL_RECOVERY_CONTRACT}`,
    },
    prefix: {
      inventorySha256: prefix.inventorySha256,
      preservedScreenshotOrdinals: Array.from({ length: 17 }, (_, index) => index + 1),
    },
    operationGraph: {
      operationHashes,
      operationGraphSha256: before.operationGraphSha256,
      terminalOperationHash: operationHashes[operationHashes.length - 1],
      terminalOperationAlreadyApplied: true,
      replayedOperations: 0,
    },
    terminalState: {
      supplies: [4, 4, 3],
      overCapRequest: {
        tokenId: 2,
        amount: 2,
        remaining: 1,
        reason: "not enough supply left",
        rejectedBy: "actual Gnocchi UI policy loaded from live Shadownet storage",
      },
    },
    contentArtifacts,
    screenshots,
    bridge: {
      signerMaterialLoaded: false,
      actors: actorAudits,
      writeActionRequests,
      submittedOperations,
      injectedOperations,
    },
    before: {
      operationGraphSha256: before.operationGraphSha256,
      contractStateSha256: before.contractStateSha256,
      scriptSha256: before.scriptSha256,
      actorCounters: before.actorCounters,
      actorPendingOperations: before.actorPendingOperations,
      rpc: before.rpc,
    },
    after: {
      operationGraphSha256: after.operationGraphSha256,
      contractStateSha256: after.contractStateSha256,
      scriptSha256: after.scriptSha256,
      actorCounters: after.actorCounters,
      actorPendingOperations: after.actorPendingOperations,
      rpc: after.rpc,
    },
    unchanged: {
      operationGraph: true,
      contractState: true,
      script: true,
      actorCounters: true,
      actorMempoolEmpty: true,
    },
  };
  validateGnocchiTerminalRecoveryReceipt({
    receipt,
    runId: GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
    contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
    operationHashes,
  });
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptPath = path.join(appRoot, GNOCCHI_TERMINAL_RECOVERY_RECEIPT_PATH);
  await durableWriteNewOrIdentical(receiptPath, receiptBytes);
  return {
    status: "PASSED",
    classification: GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION,
    contractAddress: GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    operationHashes,
    screenshots: screenshots.map(({ path: screenshotPath }) => screenshotPath),
    sideEffects: {
      signerMaterialLoaded: false,
      submittedOperations,
      injectedOperations,
      chainStateChanged: false,
    },
  };
}

async function main(): Promise<void> {
  try {
    const result = await runGnocchiTerminalReadOnlyRecovery();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
