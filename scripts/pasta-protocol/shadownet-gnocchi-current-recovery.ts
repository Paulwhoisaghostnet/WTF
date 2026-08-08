#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { CID } from "multiformats/cid";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  decodePastaUiLiveValue,
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  PastaUiLiveBridgeError,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLivePinProof,
  type PastaUiLivePreparedOperation,
  type PastaUiLivePublicReceipt,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
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
  readWithBoundedRetry,
} from "./pasta-readonly-retry";
import {
  createMirroredSessionHandler,
  GnocchiUiStateMirror,
  GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
  GNOCCHI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
  projectGnocchiStorage,
  verifyGnocchiTzktOperationApplied,
} from "./shadownet-gnocchi-ui-live";
import { validateRecoveredGnocchiOperations } from "./shadownet-gnocchi-readonly-finalizer";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  hexToUtf8,
  loadSignerSet,
  normalizeBase,
  probeRpcChainId,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsProofConfig,
  type PlatformWallet,
} from "./shadownet-proof-kit";

export const GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG =
  "PASTA_SHADOWNET_GNOCCHI_CURRENT_RECOVERY_EXECUTE";
export const GNOCCHI_CURRENT_RECOVERY_RETIRED_CODE = "GNOCCHI_CURRENT_RECOVERY_RETIRED";
export const GNOCCHI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG =
  "PASTA_SHADOWNET_GNOCCHI_CURRENT_RECOVERY_PREFLIGHT_ONLY";
export const GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
export const GNOCCHI_CURRENT_RECOVERY_RUN_ID = "pasta-alpha-proof-20260808t140453z";
export const GNOCCHI_CURRENT_RECOVERY_CONTRACT = "KT1KGB1PRsJw58fgZPGRjoj4ZHNsFR7SuEzv";
export const GNOCCHI_CURRENT_RECOVERY_CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
export const GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
export const GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";

const RETIRED_RECOVERY_RUN_ID = "pasta-alpha-proof-20260724t015728z";
const RETIRED_RECOVERY_CONTRACT = "KT19dHuzHkqzvC3CgobLoTLbars792TFm87j";

const CONTRACT_ARTIFACT_PATH = path.join(
  root,
  "public",
  "creation-tools",
  "gnocchi",
  "contract",
  "pasta-open-edition.contract.json",
);
const STATIC_ROOT = path.join(root, "public");
const APP_PATH = "/creation-tools/gnocchi/index.html";
const CHECKPOINT_RELATIVE_ROOT = "artifacts/gnocchi-current-recovery";
const TERMINAL_RELATIVE_PATH = `${CHECKPOINT_RELATIVE_ROOT}/terminal-chain.json`;
const RECOVERY_RECEIPT_RELATIVE_PATH = "artifacts/gnocchi-current-recovery-final.json";
const TIMED_START = "2026-08-08T14:54:00.000Z";
const TIMED_END = "9999-12-31T23:58:00.000Z";
const MINIMUM_REMAINING_WINDOW_MS = 2 * 60 * 60 * 1_000;
const PRICE_MUTEZ = 1;
const LIMITED_SUPPLY = 4;
const LIMITED_CREATOR_RESERVE = 1;
const FOREVER_CREATOR_RESERVE = 2;
const SHA256_RE = /^[0-9a-f]{64}$/;

type Actor = "creator" | "collectorOne" | "collectorTwo";
type JsonObject = Record<string, any>;

type ActorPage = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  monitor: PastaProofPageMonitor;
};

type ActorSession = {
  wallet: PlatformWallet;
  tezos: TezosToolkit;
  session: TaquitoPastaUiLiveSession;
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
};

type ExpectedOperation = {
  globalOrdinal: number;
  actor: Actor;
  operationSequence: number;
  entrypoint: "create_open_edition" | "open_mint" | "set_sale_active";
};

type ExpectedContent = {
  id: string;
  fileName: string;
  cid: string;
  sha256: string;
  byteLength: number;
};

const PREFIX_OPERATIONS = Object.freeze([
  {
    action: "originate",
    hash: "oofWGjRT74v12NtecafggNhbSqGGdYa55pdBji5Fd9NDub5orA3",
    counter: 23_831_594,
    level: 4_532_471,
    sender: GNOCCHI_CURRENT_RECOVERY_CREATOR,
  },
  {
    action: "create_open_edition",
    hash: "oocd9QbxGkoreGfhJoc6kqVjuGCmeTgMBNKUZc1zL1EL3CJuSoy",
    counter: 23_831_595,
    level: 4_532_473,
    sender: GNOCCHI_CURRENT_RECOVERY_CREATOR,
    tokenId: 0,
  },
  {
    action: "create_open_edition",
    hash: "ooTPLe8MH2WBFXoZzUrpdvr7o146adwM4SKZ4tKkdF9PeRv7rjp",
    counter: 23_831_596,
    level: 4_532_475,
    sender: GNOCCHI_CURRENT_RECOVERY_CREATOR,
    tokenId: 1,
  },
  {
    action: "create_open_edition",
    hash: "op1eRD6oequAk5dxizwCVzrfnNgG1S7ZMo4HLva8YZF7osKHyMm",
    counter: 23_831_597,
    level: 4_532_477,
    sender: GNOCCHI_CURRENT_RECOVERY_CREATOR,
    tokenId: 2,
  },
  {
    action: "open_mint",
    hash: "oo4sZTJJ1Qd151e6y118AUQ5Z5sLXARquM57nmr8KmPTsY4TPNn",
    counter: 23_833_863,
    level: 4_532_481,
    sender: GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE,
    tokenId: 0,
  },
  {
    action: "open_mint",
    hash: "opZWxqw97DXPpZafdrTXZ31n54mzefUUv27PKGkiQB221ULj7am",
    counter: 23_833_864,
    level: 4_532_483,
    sender: GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE,
    tokenId: 1,
  },
] as const);

const EXPECTED_OPERATIONS: readonly ExpectedOperation[] = Object.freeze([
  { globalOrdinal: 7, actor: "collectorOne", operationSequence: 3, entrypoint: "open_mint" },
  { globalOrdinal: 8, actor: "creator", operationSequence: 5, entrypoint: "set_sale_active" },
  { globalOrdinal: 9, actor: "creator", operationSequence: 6, entrypoint: "set_sale_active" },
  { globalOrdinal: 10, actor: "collectorTwo", operationSequence: 1, entrypoint: "open_mint" },
  { globalOrdinal: 11, actor: "collectorTwo", operationSequence: 2, entrypoint: "open_mint" },
  { globalOrdinal: 12, actor: "collectorTwo", operationSequence: 3, entrypoint: "open_mint" },
]);

const PREFIX_CONTENT: readonly ExpectedContent[] = Object.freeze([
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

const NEW_CONTENT: readonly ExpectedContent[] = Object.freeze([]);

const PREFIX_FILES = Object.freeze({
  "artifacts/gnocchi-current-contract-code.json":
    "0c484c641c15a71c4bd4454b4bf40b6c1a9b016b42e0c5055faf19b4e5241998",
  "artifacts/screenshot-001-publish-three-edition-policies-timed-oe-configured.json":
    "1b6be9b7117b8bac14a035f51fb3bf7b08c5594ddf3f9d0fb78c81550194f95a",
  "artifacts/screenshot-002-publish-three-edition-policies-creator-connected-on-shadownet.json":
    "7aa431f6417ec0a55e3b25751e390c5012bff7c5b6d39860f2623fce0ec600dd",
  "artifacts/screenshot-003-publish-three-edition-policies-media-and-metadata-pinned.json":
    "5e784c656231b07a9b357586e4756d9951e9ea3d65e16a7e616a1e9219983469",
  "artifacts/screenshot-004-publish-three-edition-policies-collection-originated.json":
    "0a1eacee18db63017d8e1be65d4de2ed23d7124d9b807b388a5a7ea7d5eeeeb6",
  "artifacts/screenshot-005-publish-three-edition-policies-timed-oe-token-zero-live.json":
    "bac67187ea3adbd9baeaab4fd32df5ebeb618967c1cfc99a79319a0f032270e6",
  "artifacts/screenshot-006-publish-three-edition-policies-existing-collection-verified-for-second-edition.json":
    "e73da291df273ca9a7965f486499aafd77ef6fdb4edf3584f20dba490d5abbe6",
  "artifacts/screenshot-007-publish-three-edition-policies-forever-oe-token-one-live.json":
    "4dcbd2fa55be682f3bf7f40b61911518de2e92f5b149e9b834d308045868a823",
  "artifacts/screenshot-008-publish-three-edition-policies-all-three-policies-live-in-one-collection.json":
    "247adacc1e2414ec4efa34ed8960b7b75b0ab0f35ec9cabbe8adf1c499e9e99e",
  "artifacts/screenshot-009-independent-collector-mints-collector-one-connected.json":
    "a1ec51ed127f687e76f189e91e86f687547895770f78e7a6952f449e87768ffb",
  "artifacts/screenshot-010-independent-collector-mints-collector-one-minted-token-0.json":
    "8f7421f586287162c3bdcd68289a3c76cae4c1176fe5b5c43019d614269bc25c",
  "screenshots/001-publish-three-edition-policies-timed-oe-configured.png":
    "230c3f3da9e6e5b84dd1bc2fa93ca7a24f0b95d9c527d97200c67e5e73bee8c4",
  "screenshots/002-publish-three-edition-policies-creator-connected-on-shadownet.png":
    "3eb5eb43dd12d2a8b8b66a61025f1b96bf8842a9d5ec21a78ae5320534718de2",
  "screenshots/003-publish-three-edition-policies-media-and-metadata-pinned.png":
    "21f2c19094e2ab766e0332fd8897274b9bc8d2572375b74e74e1912073cf5a7e",
  "screenshots/004-publish-three-edition-policies-collection-originated.png":
    "4b1572b7eee59979ec4cf244e31a38e4282023aafd4d70ecc710a53a1f379c20",
  "screenshots/005-publish-three-edition-policies-timed-oe-token-zero-live.png":
    "7244de756fbb94ced1f3955df929986bad23306d867b6e2f254694e230bec513",
  "screenshots/006-publish-three-edition-policies-existing-collection-verified-for-second-edition.png":
    "d0687892d744c2a70c7113adef1f34a01d8e97441d5522afd98b2cf02c11a03d",
  "screenshots/007-publish-three-edition-policies-forever-oe-token-one-live.png":
    "700dafa080faa1187497acd8331bec92eea4d611573992ad63c08951e87884d4",
  "screenshots/008-publish-three-edition-policies-all-three-policies-live-in-one-collection.png":
    "9ecffbd2f7583b174e05ab0d30521dba250b0ac5b75ed8b3c9e55b8e9afd14ee",
  "screenshots/009-independent-collector-mints-collector-one-connected.png":
    "22f974e8d25754833d38ab0c7894d03c18e1eb16f7aec024b1e41ab6b691ab1d",
  "screenshots/010-independent-collector-mints-collector-one-minted-token-0.png":
    "8502ad016ae7d004c3065efa33e6b9c98c383e081f5b87a219f62dcb80381ae6",
});

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function safeInteger(value: unknown, label: string): number {
  const converted = typeof value === "object" && value && "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  assert.ok(Number.isSafeInteger(converted) && converted >= 0, `${label} must be a non-negative safe integer`);
  return converted;
}

async function durableWriteExclusive(filePath: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fetchBytes(url: string, label: string): Promise<Uint8Array> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      redirect: "follow",
      parse: async (response) => new Uint8Array(await response.arrayBuffer()),
    }),
  }, {
    maxAttempts: 5,
    deadlineMs: 45_000,
    baseDelayMs: 250,
    maxDelayMs: 4_000,
  });
}

async function fetchJson(url: string, label: string): Promise<any> {
  const bytes = await fetchBytes(url, label);
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

function assertRawSha256Cid(content: ExpectedContent, bytes: Uint8Array): void {
  assert.equal(bytes.byteLength, content.byteLength, `${content.id} byte length drift`);
  assert.equal(sha256(bytes), content.sha256, `${content.id} SHA-256 drift`);
  const cid = CID.parse(content.cid);
  assert.equal(cid.version, 1, `${content.id} CID must be CIDv1`);
  assert.equal(cid.code, 0x55, `${content.id} CID must use raw codec`);
  assert.equal(cid.multihash.code, 0x12, `${content.id} CID must use SHA-256`);
  assert.equal(Buffer.from(cid.multihash.digest).toString("hex"), content.sha256, `${content.id} CID digest drift`);
}

async function listRegularFiles(rootPath: string, relative = ""): Promise<string[]> {
  const directory = path.join(rootPath, relative);
  const names = (await readdir(directory)).sort();
  const output: string[] = [];
  for (const name of names) {
    const childRelative = relative ? `${relative}/${name}` : name;
    const details = await lstat(path.join(rootPath, childRelative));
    assert.equal(details.isSymbolicLink(), false, `${childRelative} must not be a symlink`);
    if (details.isDirectory()) {
      output.push(...await listRegularFiles(rootPath, childRelative));
    } else {
      assert.ok(details.isFile(), `${childRelative} must be a regular file`);
      output.push(childRelative);
    }
  }
  return output;
}

async function validatePrefixInventory(appRoot: string): Promise<{
  files: Array<{ path: string; byteLength: number; sha256: string }>;
  inventorySha256: string;
}>;
async function validatePrefixInventory(appRoot: string, allowAuthenticatedContinuation: true): Promise<{
  files: Array<{ path: string; byteLength: number; sha256: string }>;
  inventorySha256: string;
}>;
async function validatePrefixInventory(appRoot: string, allowAuthenticatedContinuation = false): Promise<{
  files: Array<{ path: string; byteLength: number; sha256: string }>;
  inventorySha256: string;
}> {
  const files = await listRegularFiles(appRoot);
  const expectedFiles = Object.keys(PREFIX_FILES).sort();
  if (!allowAuthenticatedContinuation) {
    assert.deepEqual(files, expectedFiles, "Gnocchi partial prefix file inventory drift");
  } else {
    for (const expected of expectedFiles) {
      assert.ok(files.includes(expected), `Gnocchi resumed prefix lacks ${expected}`);
    }
  }
  const records = [];
  for (const relativePath of expectedFiles) {
    const bytes = await readFile(path.join(appRoot, relativePath));
    const digest = sha256(bytes);
    assert.equal(digest, PREFIX_FILES[relativePath as keyof typeof PREFIX_FILES], `${relativePath} hash drift`);
    records.push({ path: relativePath, byteLength: bytes.byteLength, sha256: digest });
  }
  return {
    files: records,
    inventorySha256: sha256(deterministicJsonBytes(records)),
  };
}

async function readRpcIdentity(rpcUrl: string): Promise<JsonObject> {
  const base = normalizeBase(rpcUrl);
  const chainId = await fetchJson(`${base}/chains/main/chain_id`, `${rpcUrl} chain id`);
  const storage = await fetchJson(
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_CURRENT_RECOVERY_CONTRACT}/storage`,
    `${rpcUrl} Gnocchi storage`,
  );
  const script = await fetchJson(
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_CURRENT_RECOVERY_CONTRACT}/script`,
    `${rpcUrl} Gnocchi script`,
  );
  const creatorCounter = await fetchJson(
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_CURRENT_RECOVERY_CREATOR}/counter`,
    `${rpcUrl} creator counter`,
  );
  const collectorOneCounter = await fetchJson(
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE}/counter`,
    `${rpcUrl} collector-one counter`,
  );
  const collectorTwoCounter = await fetchJson(
    `${base}/chains/main/blocks/head/context/contracts/${GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO}/counter`,
    `${rpcUrl} collector-two counter`,
  );
  const mempool = await fetchJson(`${base}/chains/main/mempool/pending_operations`, `${rpcUrl} mempool`);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${rpcUrl} is not Shadownet`);
  const actorAddresses = new Set([
    GNOCCHI_CURRENT_RECOVERY_CREATOR,
    GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE,
    GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO,
  ]);
  const pending = Object.values(objectValue(mempool, `${rpcUrl} mempool`))
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((operation: any) => actorAddresses.has(String(operation?.contents?.[0]?.source || "")));
  assert.equal(pending.length, 0, `${rpcUrl} has an actor operation in its mempool`);
  return {
    rpcUrl,
    chainId,
    storageSha256: sha256(deterministicJsonBytes(storage)),
    scriptSha256: sha256(deterministicJsonBytes(script)),
    counters: {
      creator: safeInteger(creatorCounter, `${rpcUrl} creator counter`),
      collectorOne: safeInteger(collectorOneCounter, `${rpcUrl} collector-one counter`),
      collectorTwo: safeInteger(collectorTwoCounter, `${rpcUrl} collector-two counter`),
    },
  };
}

async function readPrefixContent(ipfs: IpfsProofConfig): Promise<Array<ExpectedContent & {
  bytes: Uint8Array;
  sources: string[];
}>> {
  const publicBase = normalizeBase(ipfs.publicGatewayUrl);
  const independentPublicBase = "https://dweb.link/ipfs";
  const output = [];
  for (const content of PREFIX_CONTENT) {
    const sources = [
      `${publicBase}/${content.cid}`,
      `${independentPublicBase}/${content.cid}`,
    ];
    const [primary, independent] = await Promise.all([
      fetchBytes(sources[0], `${content.id} primary public IPFS bytes`),
      fetchBytes(sources[1], `${content.id} independent public IPFS bytes`),
    ]);
    assertRawSha256Cid(content, primary);
    assertRawSha256Cid(content, independent);
    assert.deepEqual(primary, independent, `${content.id} differs across public gateways`);
    output.push({ ...content, bytes: primary, sources });
  }
  return output;
}

async function readIndexedBoundary(resumedOperationHashes: readonly string[] = []): Promise<JsonObject> {
  assert.ok(
    resumedOperationHashes.length === 0 ||
      (resumedOperationHashes.length >= 3 && resumedOperationHashes.length <= EXPECTED_OPERATIONS.length),
    "Gnocchi recovery only recognizes the pristine prefix or a safe post-reopen checkpoint",
  );
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const encoded = encodeURIComponent(GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  const originations = await fetchJson(
    `${base}/operations/originations?originatedContract=${encoded}&status=applied&limit=10`,
    "Gnocchi recovery indexed origination",
  );
  const transactions = await fetchJson(
    `${base}/operations/transactions?target=${encoded}&status=applied&limit=100`,
    "Gnocchi recovery indexed transactions",
  );
  const storage = await fetchJson(`${base}/contracts/${encoded}/storage`, "Gnocchi recovery indexed storage");
  assert.ok(Array.isArray(originations) && originations.length === 1);
  assert.ok(Array.isArray(transactions) && transactions.length === PREFIX_OPERATIONS.length - 1 + resumedOperationHashes.length);
  const origin = originations[0];
  assert.equal(origin.hash, PREFIX_OPERATIONS[0].hash);
  assert.equal(origin.counter, PREFIX_OPERATIONS[0].counter);
  assert.equal(origin.level, PREFIX_OPERATIONS[0].level);
  assert.equal(origin.sender?.address, GNOCCHI_CURRENT_RECOVERY_CREATOR);
  assert.equal(origin.originatedContract?.address, GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  const orderedTransactions = [...transactions].sort((left, right) => Number(left.level) - Number(right.level));
  for (const [index, operation] of orderedTransactions.entries()) {
    const prefixExpected = PREFIX_OPERATIONS[index + 1];
    const continuationIndex = index - (PREFIX_OPERATIONS.length - 1);
    const continuationExpected = continuationIndex >= 0 ? EXPECTED_OPERATIONS[continuationIndex] : undefined;
    const expectedActor = continuationExpected?.actor === "creator"
      ? GNOCCHI_CURRENT_RECOVERY_CREATOR
      : continuationExpected?.actor === "collectorOne"
        ? GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE
        : GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO;
    const expectedEntrypoint = continuationExpected?.entrypoint || prefixExpected.action;
    assert.equal(operation.hash, continuationExpected ? resumedOperationHashes[continuationIndex] : prefixExpected.hash);
    if (!continuationExpected) {
      assert.equal(operation.counter, prefixExpected.counter);
      assert.equal(operation.level, prefixExpected.level);
    }
    assert.equal(operation.sender?.address, continuationExpected ? expectedActor : prefixExpected.sender);
    assert.equal(operation.target?.address, GNOCCHI_CURRENT_RECOVERY_CONTRACT);
    assert.equal(operation.parameter?.entrypoint, expectedEntrypoint);
    if (!continuationExpected) {
      assert.notEqual(prefixExpected.action, "originate");
      assert.ok("tokenId" in prefixExpected);
      const expectedTokenId = prefixExpected.tokenId;
      if (prefixExpected.action === "create_open_edition") {
        assert.equal(
          Number(operation.parameter?.value?.creator_reserve),
          expectedTokenId === 2 ? LIMITED_CREATOR_RESERVE : FOREVER_CREATOR_RESERVE,
        );
        assert.equal(operation.parameter?.value?.lock_policy, true);
      } else {
        assert.equal(Number(operation.parameter?.value?.token_id), expectedTokenId);
        assert.equal(Number(operation.parameter?.value?.amount), 1);
        assert.equal(Number(operation.amount), PRICE_MUTEZ);
      }
    } else if (continuationExpected.entrypoint === "open_mint") {
      const expectedTokenId = continuationExpected.globalOrdinal === 7
        ? 2
        : continuationExpected.globalOrdinal - 10;
      assert.ok(expectedTokenId >= 0 && expectedTokenId <= 2);
      assert.equal(Number(operation.parameter?.value?.token_id), expectedTokenId);
      assert.equal(Number(operation.parameter?.value?.amount), 1);
      assert.equal(Number(operation.amount), PRICE_MUTEZ);
    } else {
      assert.ok(continuationExpected.globalOrdinal === 8 || continuationExpected.globalOrdinal === 9);
      assert.equal(Number(operation.parameter?.value?.token_id), 1);
      assert.equal(operation.parameter?.value?.active, continuationExpected.globalOrdinal === 9);
      assert.equal(Number(operation.amount), 0);
    }
  }
  assert.equal(safeInteger(storage.next_token_id, "indexed next_token_id"), 3);
  assert.equal(storage.administrator, GNOCCHI_CURRENT_RECOVERY_CREATOR);
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
  ];
  const mapEntries: Array<[string, unknown]> = [];
  for (const name of mapNames) {
    const id = safeInteger(storage[name], `indexed ${name} big-map`);
    const rows = await fetchJson(`${base}/bigmaps/${id}/keys?active=true&limit=100`, `Gnocchi ${name}`);
    mapEntries.push([name, rows]);
  }
  const mapRows = Object.fromEntries(mapEntries);
  const rowsByToken = (name: string): Map<number, any> => new Map(
    (mapRows[name] as any[]).map((row) => [Number(row.key?.token_id ?? row.key), row]),
  );
  const sales = rowsByToken("sales");
  const supplies = rowsByToken("total_supply");
  const minted = rowsByToken("total_minted");
  const reserved = rowsByToken("total_reserved");
  const locks = rowsByToken("policy_locked");
  assert.deepEqual([...sales.keys()].sort(), [0, 1, 2]);
  const collectorTwoMints = Math.max(0, resumedOperationHashes.length - 3);
  const resumedSupplies = [
    3 + (collectorTwoMints >= 1 ? 1 : 0),
    3 + (collectorTwoMints >= 2 ? 1 : 0),
    2 + (collectorTwoMints >= 3 ? 1 : 0),
  ];
  const expectedSupplies = resumedOperationHashes.length === 0 ? [3, 3, 1] : resumedSupplies;
  for (const tokenId of [0, 1, 2]) {
    const expectedSupply = expectedSupplies[tokenId];
    assert.equal(Number(supplies.get(tokenId)?.value), expectedSupply);
    assert.equal(Number(minted.get(tokenId)?.value), expectedSupply);
    assert.equal(Number(reserved.get(tokenId)?.value), 0);
    assert.equal(locks.get(tokenId)?.value, true);
    assert.equal(sales.get(tokenId)?.value?.active, true);
  }
  assert.equal(new Date(sales.get(0)?.value?.start).toISOString(), TIMED_START);
  assert.equal(new Date(sales.get(0)?.value?.end).toISOString(), TIMED_END);
  assert.equal(sales.get(0)?.value?.max_supply, null);
  assert.equal(sales.get(1)?.value?.start, null);
  assert.equal(sales.get(1)?.value?.end, null);
  assert.equal(sales.get(1)?.value?.max_supply, null);
  assert.equal(new Date(sales.get(2)?.value?.start).toISOString(), TIMED_START);
  assert.equal(new Date(sales.get(2)?.value?.end).toISOString(), TIMED_END);
  assert.equal(Number(sales.get(2)?.value?.max_supply), LIMITED_SUPPLY);
  assert.equal((mapRows.minters as any[]).length, 0);
  assert.equal((mapRows.operators as any[]).length, 0);
  assert.equal((mapRows.reserved_mints as any[]).length, 0);
  const ledger = mapRows.ledger as any[];
  assert.equal(ledger.length, resumedOperationHashes.length === 0 ? 5 : 6 + collectorTwoMints);
  for (const [tokenId, expectedBalance] of [[0, 2], [1, 2], [2, 1]] as const) {
    const entries = ledger.filter((row) =>
      row.key?.owner === GNOCCHI_CURRENT_RECOVERY_CREATOR &&
      Number(row.key?.token_id) === tokenId &&
      Number(row.value) === expectedBalance
    );
    assert.equal(entries.length, 1, `creator token ${tokenId} balance drift`);
  }
  for (const tokenId of [0, 1]) {
    const entries = ledger.filter((row) =>
      row.key?.owner === GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE &&
      Number(row.key?.token_id) === tokenId &&
      Number(row.value) === 1
    );
    assert.equal(entries.length, 1, `collector-one token ${tokenId} balance drift`);
  }
  if (resumedOperationHashes.length >= 3) {
    const tokenTwoEntries = ledger.filter((row) =>
      row.key?.owner === GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE &&
      Number(row.key?.token_id) === 2 &&
      Number(row.value) === 1
    );
    assert.equal(tokenTwoEntries.length, 1, "collector-one token 2 balance drift");
  }
  if (resumedOperationHashes.length > 3) {
    for (let tokenId = 0; tokenId < collectorTwoMints; tokenId += 1) {
      const entries = ledger.filter((row) =>
        row.key?.owner === GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO &&
        Number(row.key?.token_id) === tokenId &&
        Number(row.value) === 1
      );
      assert.equal(entries.length, 1, `collector-two token ${tokenId} balance drift`);
    }
  } else {
    assert.equal(
      ledger.some((row) => row.key?.owner === GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO),
      false,
      "collector two must not have a prefix balance",
    );
  }
  return {
    originations,
    transactions: orderedTransactions,
    storage,
    mapRows,
    digest: sha256(deterministicJsonBytes({ originations, transactions: orderedTransactions, storage, mapRows })),
  };
}

export function assertGnocchiCurrentRecoveryAllowed(
  environment: Record<string, string | undefined>,
): string {
  assert.equal(environment[GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG], "1", `${GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG}=1 is required`);
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "Gnocchi recovery only permits Shadownet");
  const configuredRoot = environment[GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV]?.trim();
  assert.ok(configuredRoot, `${GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV} is required`);
  const runRoot = path.resolve(configuredRoot);
  const runId = path.basename(runRoot);
  if (runId === RETIRED_RECOVERY_RUN_ID) {
    throw new Error(
      `${GNOCCHI_CURRENT_RECOVERY_RETIRED_CODE}: ${RETIRED_RECOVERY_CONTRACT} completed its 46-event checkpoint and may never be replayed`,
    );
  }
  assert.equal(runId, GNOCCHI_CURRENT_RECOVERY_RUN_ID, "Gnocchi recovery run id drift");
  return runRoot;
}

class RecoveryCheckpoint {
  private eventIndex = 0;
  private previousSha256: string;
  private completedOperations = 0;
  private completedPins = 0;
  private pendingOperation: {
    actor: Actor;
    expected: ExpectedOperation;
    descriptorSha256: string;
    operationHash?: string;
  } | null = null;
  private pendingPin: {
    expected: ExpectedContent;
    bytes: Uint8Array;
    sha256: string;
  } | null = null;

  private constructor(
    readonly rootPath: string,
    readonly checkpointId: string,
    readonly intentSha256: string,
  ) {
    this.previousSha256 = intentSha256;
  }

  static async create(appRoot: string, intentInput: JsonObject): Promise<RecoveryCheckpoint> {
    const rootPath = path.join(appRoot, CHECKPOINT_RELATIVE_ROOT);
    await mkdir(rootPath);
    await mkdir(path.join(rootPath, "events"));
    await mkdir(path.join(rootPath, "pins"));
    const intentSeed = {
      schema: "pastaprotocol-gnocchi-current-recovery-intent@1",
      status: "IMMUTABLE",
      ...intentInput,
      recoveredPrefix: {
        operations: PREFIX_OPERATIONS,
        files: intentInput.prefix.files,
        content: intentInput.prefix.content,
      },
      remainingOperationMatrix: EXPECTED_OPERATIONS,
      expectedNewPins: NEW_CONTENT,
    };
    const checkpointId = sha256(deterministicJsonBytes(intentSeed));
    const intent = { ...intentSeed, checkpointId };
    const bytes = deterministicJsonBytes(intent);
    const intentSha256 = sha256(bytes);
    await durableWriteExclusive(path.join(rootPath, "intent.json"), bytes);
    return new RecoveryCheckpoint(rootPath, checkpointId, intentSha256);
  }

  static async loadExactPostReopenResume(appRoot: string): Promise<{
    checkpoint: RecoveryCheckpoint;
    appliedOperationHashes: string[];
    priorScreenshots: JsonObject[];
    rejectionReasons: string[];
  }> {
    const rootPath = path.join(appRoot, CHECKPOINT_RELATIVE_ROOT);
    const canonicalPhases = [
      "screenshot-accepted", "prepared", "submitted", "applied", "screenshot-accepted",
      "prepared", "submitted", "applied", "screenshot-accepted", "expected-rejection",
      "screenshot-accepted", "prepared", "submitted", "applied", "screenshot-accepted",
      "prepared", "submitted", "applied", "screenshot-accepted",
      "prepared", "submitted", "applied", "screenshot-accepted",
      "prepared", "submitted", "applied", "screenshot-accepted",
      "expected-rejection", "screenshot-accepted",
    ] as const;
    const checkpointFiles = await listRegularFiles(rootPath);
    const actualEventNames = checkpointFiles.filter((name) => name.startsWith("events/"));
    const safeEventCounts = new Set([14, 15, 18, 19, 22, 23, 26, 27, 28, 29]);
    assert.ok(safeEventCounts.has(actualEventNames.length), "Gnocchi checkpoint stopped at an ambiguous or unsupported event boundary");
    const expectedEventNames = Array.from({ length: actualEventNames.length }, (_, index) => {
      const ordinal = String(index + 1).padStart(6, "0");
      return `events/${ordinal}-${canonicalPhases[index]}.json`;
    });
    assert.deepEqual(
      checkpointFiles,
      ["intent.json", ...expectedEventNames].sort(),
      "Gnocchi resumable checkpoint inventory drift",
    );

    const intentBytes = await readFile(path.join(rootPath, "intent.json"));
    const intent = objectValue(JSON.parse(intentBytes.toString("utf8")), "Gnocchi recovery intent");
    assert.equal(intent.schema, "pastaprotocol-gnocchi-current-recovery-intent@1");
    assert.equal(intent.status, "IMMUTABLE");
    assert.equal(intent.runId, GNOCCHI_CURRENT_RECOVERY_RUN_ID);
    assert.equal(intent.contract?.address, GNOCCHI_CURRENT_RECOVERY_CONTRACT);
    assert.equal(intent.interruption?.code, "POST_CONFIRMATION_SCREENSHOT_RESOURCE_HTTP_500");
    assert.equal(intent.interruption?.ordinaryRerunForbidden, true);
    assert.deepEqual(intent.remainingOperationMatrix, EXPECTED_OPERATIONS);
    assert.deepEqual(intent.expectedNewPins, NEW_CONTENT);
    const checkpointId = String(intent.checkpointId || "");
    assert.match(checkpointId, SHA256_RE);
    const { checkpointId: _checkpointId, ...intentSeed } = intent;
    assert.equal(sha256(deterministicJsonBytes(intentSeed)), checkpointId, "Gnocchi recovery intent id drift");
    const prefix = await validatePrefixInventory(appRoot, true);
    assert.deepEqual(intent.recoveredPrefix?.operations, PREFIX_OPERATIONS);
    assert.deepEqual(intent.recoveredPrefix?.files, prefix.files);
    const recoveredContent = Array.isArray(intent.recoveredPrefix?.content) ? intent.recoveredPrefix.content : [];
    assert.equal(recoveredContent.length, PREFIX_CONTENT.length);
    for (const [index, expected] of PREFIX_CONTENT.entries()) {
      const actual = objectValue(recoveredContent[index], `Gnocchi recovered content ${index + 1}`);
      for (const field of ["id", "fileName", "cid", "sha256", "byteLength"] as const) {
        assert.equal(actual[field], expected[field], `Gnocchi recovered content ${index + 1} ${field} drift`);
      }
      const localBytes = await readFile(path.join(appRoot, "artifacts", expected.fileName));
      assertRawSha256Cid(expected, localBytes);
    }

    const events: JsonObject[] = [];
    let previousRecordSha256 = sha256(intentBytes);
    for (const [index, name] of expectedEventNames.entries()) {
      const bytes = await readFile(path.join(rootPath, name));
      const event = objectValue(JSON.parse(bytes.toString("utf8")), `Gnocchi recovery event ${index + 1}`);
      assert.equal(event.schema, "pastaprotocol-gnocchi-current-recovery-event@1");
      assert.equal(event.checkpointId, checkpointId);
      assert.equal(event.eventIndex, index + 1);
      assert.equal(event.previousRecordSha256, previousRecordSha256);
      previousRecordSha256 = sha256(bytes);
      events.push(event);
    }
    assert.deepEqual(
      events.map((event) => String(event.phase).toLowerCase().replace(/_/g, "-")),
      canonicalPhases.slice(0, events.length),
    );

    const operationTriples = [[1, 2, 3], [5, 6, 7], [11, 12, 13], [15, 16, 17], [19, 20, 21], [23, 24, 25]] as const;
    const completedOperationTriples = operationTriples.filter(([, , appliedIndex]) => appliedIndex < events.length);
    const appliedOperationHashes: string[] = [];
    for (const [operationIndex, [preparedIndex, submittedIndex, appliedIndex]] of completedOperationTriples.entries()) {
      const expected = EXPECTED_OPERATIONS[operationIndex];
      const prepared = events[preparedIndex];
      const submitted = events[submittedIndex];
      const applied = events[appliedIndex];
      for (const event of [prepared, submitted, applied]) {
        assert.equal(event.globalOrdinal, expected.globalOrdinal);
        assert.equal(event.actor, expected.actor);
        assert.equal(event.operationSequence, expected.operationSequence);
        assert.equal(event.entrypoint, expected.entrypoint);
        assert.match(String(event.descriptorSha256 || ""), SHA256_RE);
      }
      assert.equal(submitted.descriptorSha256, prepared.descriptorSha256);
      assert.equal(applied.descriptorSha256, prepared.descriptorSha256);
      assert.equal(validateOperation(String(submitted.operationHash || "")), ValidationResult.VALID);
      assert.equal(applied.operationHash, submitted.operationHash);
      assert.equal(applied.receipt?.operationHash, submitted.operationHash);
      assert.equal(applied.receipt?.contractAddress, GNOCCHI_CURRENT_RECOVERY_CONTRACT);
      const expectedSigner = expected.actor === "creator"
        ? GNOCCHI_CURRENT_RECOVERY_CREATOR
        : expected.actor === "collectorOne"
          ? GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE
          : GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO;
      assert.equal(applied.receipt?.signerAddress, expectedSigner);
      assert.deepEqual(applied.receipt?.entrypoints, [expected.entrypoint]);
      appliedOperationHashes.push(String(applied.operationHash));
    }

    const rejectionReasons: string[] = [];
    const pausedRejection = events[9];
    assert.equal(pausedRejection.actor, "collectorTwo");
    assert.equal(pausedRejection.tokenId, 1);
    assert.equal(pausedRejection.amount, 1);
    assert.equal(pausedRejection.reason, "this sale is paused");
    assert.equal(pausedRejection.transactionCountBefore, pausedRejection.transactionCountAfter);
    rejectionReasons.push(String(pausedRejection.reason));
    if (events.length >= 28) {
      const capRejection = events[27];
      assert.equal(capRejection.actor, "collectorOne");
      assert.equal(capRejection.tokenId, 2);
      assert.equal(capRejection.amount, 2);
      assert.equal(capRejection.reason, "not enough supply left");
      assert.equal(capRejection.transactionCountBefore, capRejection.transactionCountAfter);
      rejectionReasons.push(String(capRejection.reason));
    }

    const screenshotEvents = events.filter((event) => event.phase === "SCREENSHOT_ACCEPTED");
    assert.deepEqual(
      screenshotEvents.map((event) => event.stageOrdinal),
      Array.from({ length: screenshotEvents.length }, (_, index) => index + 11),
    );
    const priorScreenshots: JsonObject[] = [];
    const continuationFiles: string[] = [];
    for (const event of screenshotEvents) {
      const pngPath = String(event.pngPath || "");
      const sidecarPath = String(event.sidecarPath || "");
      assert.match(pngPath, /^screenshots\/01[1-9]-[a-z0-9-]+\.png$/);
      assert.match(sidecarPath, /^artifacts\/screenshot-01[1-9]-[a-z0-9-]+\.json$/);
      const [pngBytes, sidecarBytes] = await Promise.all([
        readFile(path.join(appRoot, pngPath)),
        readFile(path.join(appRoot, sidecarPath)),
      ]);
      assert.equal(sha256(pngBytes), event.pngSha256);
      assert.equal(sha256(sidecarBytes), event.sidecarSha256);
      const sidecar = objectValue(JSON.parse(sidecarBytes.toString("utf8")), `Gnocchi screenshot ${event.stageOrdinal} sidecar`);
      assert.equal(sidecar.schema, "pastaprotocol-screenshot-evidence@1");
      assert.equal(sidecar.app, "gnocchi");
      assert.equal(sidecar.stageOrdinal, event.stageOrdinal);
      assert.equal(sidecar.stageName, event.stageName);
      assert.equal(sidecar.sha256, event.pngSha256);
      priorScreenshots.push({
        caption: `gnocchi: ${sidecar.capability} — ${sidecar.stageName}`,
        path: pngPath,
        sha256: event.pngSha256,
        stage: path.basename(pngPath, ".png"),
      });
      continuationFiles.push(pngPath, sidecarPath);
    }

    const completeExpectedInventory = [
      ...Object.keys(PREFIX_FILES),
      ...PREFIX_CONTENT.map((content) => `artifacts/${content.fileName}`),
      ...continuationFiles,
      `${CHECKPOINT_RELATIVE_ROOT}/intent.json`,
      ...expectedEventNames.map((name) => `${CHECKPOINT_RELATIVE_ROOT}/${name}`),
    ].sort();
    assert.deepEqual(await listRegularFiles(appRoot), completeExpectedInventory, "Gnocchi resumable app inventory drift");

    const checkpoint = new RecoveryCheckpoint(rootPath, checkpointId, sha256(intentBytes));
    checkpoint.eventIndex = events.length;
    checkpoint.previousSha256 = previousRecordSha256;
    checkpoint.completedOperations = completedOperationTriples.length;
    checkpoint.completedPins = 0;
    return { checkpoint, appliedOperationHashes, priorScreenshots, rejectionReasons };
  }

  private async append(phase: string, payload: JsonObject): Promise<string> {
    const eventIndex = this.eventIndex + 1;
    const event = {
      schema: "pastaprotocol-gnocchi-current-recovery-event@1",
      checkpointId: this.checkpointId,
      eventIndex,
      phase,
      previousRecordSha256: this.previousSha256,
      timestampUtc: new Date().toISOString(),
      ...payload,
    };
    const bytes = deterministicJsonBytes(event);
    const digest = sha256(bytes);
    const name = `${String(eventIndex).padStart(6, "0")}-${phase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    await durableWriteExclusive(path.join(this.rootPath, "events", name), bytes);
    this.eventIndex = eventIndex;
    this.previousSha256 = digest;
    return digest;
  }

  async beforePin(input: {
    value?: unknown;
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
  }): Promise<void> {
    assert.equal(this.pendingPin, null, "a Gnocchi recovery pin is already pending");
    const expected = NEW_CONTENT[this.completedPins];
    assert.ok(expected, "Gnocchi recovery attempted an unexpected additional pin");
    const expectedUiFileName = this.completedPins === 0 ? "gnocchi-limited-edition.png" : "token.json";
    assert.equal(input.fileName, expectedUiFileName, "Gnocchi recovery pin filename drift");
    assertRawSha256Cid(expected, input.bytes);
    const pinRelativePath = `${String(this.completedPins + 1).padStart(3, "0")}-${expected.fileName}`;
    await durableWriteExclusive(path.join(this.rootPath, "pins", pinRelativePath), input.bytes);
    await this.append("PIN_PREPARED", {
      pinSequence: this.completedPins + 1,
      id: expected.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      byteLength: input.bytes.byteLength,
      sha256: expected.sha256,
      savedPath: `pins/${pinRelativePath}`,
    });
    this.pendingPin = { expected, bytes: Uint8Array.from(input.bytes), sha256: expected.sha256 };
  }

  async onPin(input: { value?: unknown; bytes?: Uint8Array; proof: PastaUiLivePinProof }): Promise<void> {
    const pending = this.pendingPin;
    assert.ok(pending, "Gnocchi recovery received a pin proof without a prepared pin");
    assert.equal(input.proof.cid, pending.expected.cid);
    assert.equal(input.proof.uri, `ipfs://${pending.expected.cid}`);
    assert.equal(input.proof.sha256, pending.sha256);
    assert.equal(input.proof.byteLength, pending.expected.byteLength);
    await this.append("PIN_CONFIRMED", {
      pinSequence: this.completedPins + 1,
      id: pending.expected.id,
      proof: input.proof,
    });
    this.completedPins += 1;
    this.pendingPin = null;
  }

  callbacks(actor: Actor): Pick<
    ConstructorParameters<typeof TaquitoPastaUiLiveSession>[0],
    "beforeOperationSubmit" | "onOperationSubmitted" | "onReceipt"
  > {
    return {
      beforeOperationSubmit: (operation) => this.beforeOperationSubmit(actor, operation),
      onOperationSubmitted: (operation) => this.onOperationSubmitted(actor, operation),
      onReceipt: (receipt) => this.onReceipt(actor, receipt),
    };
  }

  private async beforeOperationSubmit(actor: Actor, operation: PastaUiLivePreparedOperation): Promise<void> {
    assert.equal(this.pendingOperation, null, "a Gnocchi recovery operation is already pending");
    const expected = EXPECTED_OPERATIONS[this.completedOperations];
    assert.ok(expected, "Gnocchi recovery attempted an unexpected additional operation");
    assert.equal(actor, expected.actor, "Gnocchi recovery actor order drift");
    assert.equal(operation.action, "call");
    assert.equal(operation.operationSequence, expected.operationSequence);
    assert.deepEqual(operation.entrypoints, [expected.entrypoint]);
    assert.equal(operation.contractAddress, GNOCCHI_CURRENT_RECOVERY_CONTRACT);
    const descriptorSha256 = hashJsonForBridge(operation.descriptor);
    await this.append("PREPARED", {
      globalOrdinal: expected.globalOrdinal,
      actor,
      operationSequence: expected.operationSequence,
      entrypoint: expected.entrypoint,
      descriptorSha256,
    });
    this.pendingOperation = { actor, expected, descriptorSha256 };
  }

  private async onOperationSubmitted(actor: Actor, operation: PastaUiLiveSubmittedOperation): Promise<void> {
    const pending = this.pendingOperation;
    assert.ok(pending, "Gnocchi recovery received SUBMITTED without PREPARED");
    assert.equal(actor, pending.actor);
    assert.equal(operation.operationSequence, pending.expected.operationSequence);
    assert.deepEqual(operation.entrypoints, [pending.expected.entrypoint]);
    assert.equal(validateOperation(operation.operationHash), ValidationResult.VALID);
    await this.append("SUBMITTED", {
      globalOrdinal: pending.expected.globalOrdinal,
      actor,
      operationSequence: pending.expected.operationSequence,
      entrypoint: pending.expected.entrypoint,
      descriptorSha256: pending.descriptorSha256,
      operationHash: operation.operationHash,
    });
    pending.operationHash = operation.operationHash;
  }

  private async onReceipt(actor: Actor, receipt: PastaUiLivePublicReceipt): Promise<void> {
    if (!receipt.operationHash) return;
    const pending = this.pendingOperation;
    assert.ok(pending?.operationHash, "Gnocchi recovery received APPLIED without SUBMITTED");
    assert.equal(actor, pending.actor);
    assert.equal(receipt.operationHash, pending.operationHash);
    assert.deepEqual(receipt.entrypoints, [pending.expected.entrypoint]);
    await this.append("APPLIED", {
      globalOrdinal: pending.expected.globalOrdinal,
      actor,
      operationSequence: pending.expected.operationSequence,
      entrypoint: pending.expected.entrypoint,
      descriptorSha256: pending.descriptorSha256,
      operationHash: pending.operationHash,
      receipt,
    });
    this.completedOperations += 1;
    this.pendingOperation = null;
  }

  async screenshot(capture: CapturePastaProofStageResult): Promise<void> {
    await this.append("SCREENSHOT_ACCEPTED", {
      stageOrdinal: capture.sidecar.stageOrdinal,
      stageName: capture.sidecar.stageName,
      pngPath: capture.manifestScreenshot.path,
      pngSha256: capture.manifestScreenshot.sha256,
      sidecarPath: capture.manifestSidecarArtifact.path,
      sidecarSha256: capture.manifestSidecarArtifact.sha256,
    });
  }

  async expectedRejection(input: {
    actor: Actor;
    tokenId: number;
    amount: number;
    reason: string;
    transactionCountBefore: number;
    transactionCountAfter: number;
  }): Promise<void> {
    assert.equal(input.transactionCountAfter, input.transactionCountBefore);
    assert.equal(this.pendingOperation, null, "expected rejection reached a signer boundary");
    await this.append("EXPECTED_REJECTION", input);
  }

  async finalize(terminalSha256: string): Promise<JsonObject> {
    assert.equal(this.completedPins, NEW_CONTENT.length, "Gnocchi recovery pin matrix incomplete");
    assert.equal(this.completedOperations, EXPECTED_OPERATIONS.length, "Gnocchi recovery operation matrix incomplete");
    assert.equal(this.pendingPin, null);
    assert.equal(this.pendingOperation, null);
    assert.match(terminalSha256, SHA256_RE);
    const final = {
      schema: "pastaprotocol-gnocchi-current-recovery-checkpoint-final@1",
      status: "FINALIZED",
      checkpointId: this.checkpointId,
      intentSha256: this.intentSha256,
      terminalSha256,
      events: this.eventIndex,
      pins: this.completedPins,
      recoveredOperations: PREFIX_OPERATIONS.length,
      liveOperations: this.completedOperations,
      finalRecordSha256: this.previousSha256,
      finalizedAt: new Date().toISOString(),
    };
    const bytes = deterministicJsonBytes(final);
    await durableWriteExclusive(path.join(this.rootPath, "final.json"), bytes);
    return { ...final, finalArtifactSha256: sha256(bytes) };
  }
}

function decodedCallPayload(request: any): {
  contractAddress: string;
  entrypoint: string;
  payload: JsonObject;
  sendOptions: JsonObject;
} | null {
  if (request.action !== "call") return null;
  const decoded = decodePastaUiLiveValue(request.payload) as JsonObject;
  const call = objectValue(decoded.call, "Gnocchi recovery call");
  return {
    contractAddress: String(call.contractAddress),
    entrypoint: String(call.entrypoint),
    payload: objectValue(call.payload, "Gnocchi recovery call payload"),
    sendOptions: objectValue(decoded.sendOptions || {}, "Gnocchi recovery send options"),
  };
}

function validateCreatorCall(input: {
  entrypoint: string;
  payload: unknown;
}): void {
  const payload = objectValue(input.payload, "creator payload");
  assert.equal(input.entrypoint, "set_sale_active");
  assert.equal(safeInteger(payload.token_id, "managed token id"), 1);
  assert.equal(typeof payload.active, "boolean");
}

function validateCollectorCall(input: {
  contractAddress: string;
  entrypoint: string;
  payload: unknown;
  sendOptions?: unknown;
}): void {
  assert.equal(input.contractAddress, GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  assert.equal(input.entrypoint, "open_mint");
  const payload = objectValue(input.payload, "collector payload");
  assert.ok([0, 1, 2].includes(safeInteger(payload.token_id, "collector token id")));
  assert.equal(safeInteger(payload.amount, "collector amount"), 1);
  if (input.sendOptions !== undefined) {
    const options = objectValue(input.sendOptions, "collector send options");
    assert.equal(safeInteger(options.amount, "collector payment"), PRICE_MUTEZ);
    assert.equal(options.mutez, true);
  }
}

async function openActorPage(
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>,
): Promise<ActorPage> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  let context: BrowserContext | null = null;
  let monitor: PastaProofPageMonitor | null = null;
  try {
    context = await browser.newContext({
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
    await page.goto(`${bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE");
    return { browser, context, page, monitor };
  } catch (error) {
    monitor?.dispose();
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function closeActorPage(actor: ActorPage | null): Promise<void> {
  if (!actor) return;
  actor.monitor.dispose();
  await actor.browser.close();
}

async function configureBase(page: Page, kuboApiUrl: string): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#oeSymbol", "GNUI");
  await page.fill("#basePrice", "0.000001");
  await page.fill("#increment", "0");
  await page.fill("#stepSize", "1");
  await page.fill("#minPrice", "");
  await page.fill("#maxPrice", "");
  await page.check("#lockPolicy");
}

async function connectActor(page: Page, address: string): Promise<void> {
  await page.click("#btnConnect");
  await waitForText(page, "#log", `connected ${address} on shadownet`);
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 300_000): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ selector: selected, expected: text }) => document.querySelector(selected)?.textContent?.includes(text),
    { selector, expected },
    { timeout },
  );
}

async function captureStage(input: {
  actor: ActorPage;
  runRoot: string;
  checkpoint: RecoveryCheckpoint;
  ordinal: number;
  capability: string;
  stageName: string;
  focusSelector: string;
  evidence: RequiredDomEvidence[];
}): Promise<CapturePastaProofStageResult> {
  await input.actor.page.locator(input.focusSelector).first().scrollIntoViewIfNeeded();
  const capture = await capturePastaProofStage({
    page: input.actor.page,
    monitor: input.actor.monitor,
    outputRoot: input.runRoot,
    app: "gnocchi",
    capability: input.capability,
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.evidence,
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
  await input.checkpoint.screenshot(capture);
  return capture;
}

async function selectExistingCollection(page: Page): Promise<void> {
  await page.selectOption("#publishTarget", "existing");
  await page.fill("#existingCollectionKt", GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  await page.click("#btnVerifyCollection");
  await waitForText(page, "#publishTargetStatus", "next edition will be token #3");
}

async function loadMintPolicy(page: Page, tokenId: number, expected: string): Promise<void> {
  await page.fill("#mintKt", GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  await page.fill("#mintTokenId", String(tokenId));
  await page.click("#btnLoadPrice");
  await waitForText(page, "#mintInfo", expected);
  const text = (await page.locator("#mintInfo").textContent()) || "";
  assert.doesNotMatch(text, /NaN|Invalid Date|\[object Object\]/);
}

async function mintToken(page: Page, tokenId: number, expected: string): Promise<void> {
  await loadMintPolicy(page, tokenId, expected);
  const previous = (await page.locator("#log").textContent()) || "";
  const priorMints = previous.split("minted ✓").length - 1;
  await page.fill("#mintAmount", "1");
  await page.click("#btnMint");
  await page.waitForFunction(
    ({ count }) => ((document.getElementById("log")?.textContent || "").split("minted ✓").length - 1) > count,
    { count: priorMints },
    { timeout: 300_000 },
  );
  await page.waitForFunction(() => !document.getElementById("btnMint")?.hasAttribute("disabled"));
}

async function targetTransactionCount(): Promise<number> {
  const rows = await fetchJson(
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?target=${GNOCCHI_CURRENT_RECOVERY_CONTRACT}&status=applied&limit=100`,
    "Gnocchi recovery target transaction count",
  );
  assert.ok(Array.isArray(rows));
  return rows.length;
}

async function saveContentExclusive(appRoot: string, content: ExpectedContent, bytes: Uint8Array): Promise<void> {
  assertRawSha256Cid(content, bytes);
  await durableWriteExclusive(path.join(appRoot, "artifacts", content.fileName), bytes);
}

async function hydrateMirror(
  tezos: TezosToolkit,
  prefixContent: Array<ExpectedContent & { bytes: Uint8Array }>,
  completedRecoveryOperations = 0,
): Promise<{ mirror: GnocchiUiStateMirror; collectionMetadataUri: string; artifactUris: string[] }> {
  const contract = await tezos.contract.at(GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  const storage = await contract.storage() as JsonObject;
  const metadataEncoded = await storage.metadata.get("");
  const collectionMetadataUri = hexToUtf8(String(metadataEncoded));
  assert.equal(collectionMetadataUri, `ipfs://${PREFIX_CONTENT[1].cid}`);
  const mirror = new GnocchiUiStateMirror();
  mirror.initialize({
    administrator: GNOCCHI_CURRENT_RECOVERY_CREATOR,
    contractAddress: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
    collectionMetadataUri,
  });
  const artifactUris: string[] = [];
  const expectedCreatorReserve = [FOREVER_CREATOR_RESERVE, FOREVER_CREATOR_RESERVE, LIMITED_CREATOR_RESERVE];
  const chainSupplies: number[] = [];
  const chainMinted: number[] = [];
  for (const tokenId of [0, 1, 2]) {
    const tokenMetadata = await storage.token_metadata.get(String(tokenId));
    const sale = await storage.sales.get(String(tokenId));
    const totalSupply = await storage.total_supply.get(String(tokenId));
    const totalMinted = await storage.total_minted.get(String(tokenId));
    const policyLocked = await storage.policy_locked.get(String(tokenId));
    const metadataUri = hexToUtf8(String(tokenMetadata?.token_info?.get?.("") ?? tokenMetadata?.token_info?.[""]));
    const expectedMetadata = PREFIX_CONTENT.find((content) => content.id === `token-${tokenId}-metadata`);
    assert.ok(expectedMetadata);
    assert.equal(metadataUri, `ipfs://${expectedMetadata.cid}`);
    const metadataContent = prefixContent.find((content) => content.id === `token-${tokenId}-metadata`);
    assert.ok(metadataContent);
    const metadataValue = objectValue(JSON.parse(Buffer.from(metadataContent.bytes).toString("utf8")), `token ${tokenId} metadata`);
    const artifactUri = String(metadataValue.artifactUri || "");
    const expectedMedia = PREFIX_CONTENT.find((content) => content.id === `token-${tokenId}-media`);
    assert.ok(expectedMedia);
    assert.equal(artifactUri, `ipfs://${expectedMedia.cid}`);
    artifactUris[tokenId] = artifactUri;
    const info = new MichelsonMap<string, string>();
    info.set("", utf8ToHex(metadataUri));
    mirror.applySuccessfulCall("create_open_edition", {
      token_info: info,
      sale,
      creator_reserve: expectedCreatorReserve[tokenId],
      lock_policy: policyLocked === true,
    });
    chainSupplies[tokenId] = safeInteger(totalSupply, `token ${tokenId} total supply`);
    chainMinted[tokenId] = safeInteger(totalMinted, `token ${tokenId} total minted`);
    mirror.setArtifactUri(tokenId, artifactUri);
  }
  for (const tokenId of [0, 1]) {
    mirror.applySuccessfulCall("open_mint", { token_id: tokenId, amount: 1 });
  }
  if (completedRecoveryOperations >= 1) {
    mirror.applySuccessfulCall("open_mint", { token_id: 2, amount: 1 });
  }
  const collectorTwoMints = Math.max(0, completedRecoveryOperations - 3);
  for (let tokenId = 0; tokenId < collectorTwoMints; tokenId += 1) {
    mirror.applySuccessfulCall("open_mint", { token_id: tokenId, amount: 1 });
  }
  for (const tokenId of [0, 1, 2]) {
    const snapshot = mirror.tokenSnapshots()[tokenId];
    assert.equal(snapshot.currentSupply, chainSupplies[tokenId], `token ${tokenId} mirrored supply drift`);
    assert.equal(snapshot.totalMinted, chainMinted[tokenId], `token ${tokenId} mirrored minted drift`);
  }
  return { mirror, collectionMetadataUri, artifactUris };
}

async function terminalChainEvidence(): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const encoded = encodeURIComponent(GNOCCHI_CURRENT_RECOVERY_CONTRACT);
  const [originations, transactions, storage] = await Promise.all([
    fetchJson(
      `${base}/operations/originations?originatedContract=${encoded}&status=applied&limit=10`,
      "terminal Gnocchi origination",
    ),
    fetchJson(
      `${base}/operations/transactions?target=${encoded}&status=applied&limit=100`,
      "terminal Gnocchi transactions",
    ),
    fetchJson(`${base}/contracts/${encoded}/storage`, "terminal Gnocchi storage"),
  ]);
  const operations = validateRecoveredGnocchiOperations({
    contractAddress: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
    originations,
    transactions,
  });
  assert.equal(safeInteger(storage.next_token_id, "terminal next token id"), 3);
  const evidence = {
    schema: "pastaprotocol-gnocchi-current-recovery-terminal-chain@1",
    observedAt: new Date().toISOString(),
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    contract: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
    originations,
    transactions,
    storage,
    operationHashes: operations.operationHashes,
  };
  return { evidence, sha256: sha256(deterministicJsonBytes(evidence)) };
}

export async function runGnocchiCurrentRecovery(): Promise<JsonObject> {
  const runRoot = assertGnocchiCurrentRecoveryAllowed(process.env);
  const appRoot = path.join(runRoot, "gnocchi");
  assert.equal(validateContractAddress(GNOCCHI_CURRENT_RECOVERY_CONTRACT), ValidationResult.VALID);
  for (const address of [
    GNOCCHI_CURRENT_RECOVERY_CREATOR,
    GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE,
    GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO,
  ]) assert.equal(validateAddress(address), ValidationResult.VALID);
  assert.ok(Date.parse(TIMED_END) - Date.now() >= MINIMUM_REMAINING_WINDOW_MS, "Gnocchi timed proof window is too close to expiry");

  const checkpointIntentPath = path.join(appRoot, CHECKPOINT_RELATIVE_ROOT, "intent.json");
  const hasCheckpoint = Boolean(await lstat(checkpointIntentPath).catch(() => undefined));
  const resumeState = hasCheckpoint
    ? await RecoveryCheckpoint.loadExactPostReopenResume(appRoot)
    : undefined;
  const prefix = hasCheckpoint
    ? await validatePrefixInventory(appRoot, true)
    : await validatePrefixInventory(appRoot);
  const currentArtifactBytes = await readFile(CONTRACT_ARTIFACT_PATH);
  assert.equal(sha256(currentArtifactBytes), PREFIX_FILES["artifacts/gnocchi-current-contract-code.json"]);
  const ipfs = resolveIpfsProofConfig();
  const primaryRpc = await readRpcIdentity(SHADOWNET_RPC_PRIMARY);
  const fallbackRpc = await readRpcIdentity(SHADOWNET_RPC_FALLBACK);
  const indexedBoundary = await readIndexedBoundary(resumeState?.appliedOperationHashes || []);
  const prefixContent = await readPrefixContent(ipfs);
  assert.equal(primaryRpc.storageSha256, fallbackRpc.storageSha256, "configured RPC storage disagreement");
  assert.equal(primaryRpc.scriptSha256, fallbackRpc.scriptSha256, "configured RPC script disagreement");
  assert.deepEqual(primaryRpc.counters, fallbackRpc.counters, "configured RPC actor-counter disagreement");
  if (process.env[GNOCCHI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG] === "1") {
    return {
      status: "PREFLIGHT_PASSED",
      classification: resumeState ? "READ-ONLY-EXACT-POST-REOPEN-BOUNDARY" : "READ-ONLY-EXACT-BOUNDARY",
      runId: GNOCCHI_CURRENT_RECOVERY_RUN_ID,
      contractAddress: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
      prefixInventorySha256: prefix.inventorySha256,
      indexedBoundarySha256: indexedBoundary.digest,
      recoveredContent: prefixContent.map(({ bytes: _bytes, ...content }) => content),
      actorCounters: primaryRpc.counters,
      sideEffects: {
        signerMaterialLoaded: false,
        chainWrites: 0,
        ipfsWrites: 0,
        localWrites: 0,
      },
    };
  }

  const checkpoint = resumeState?.checkpoint || await RecoveryCheckpoint.create(appRoot, {
    runId: GNOCCHI_CURRENT_RECOVERY_RUN_ID,
    createdAt: new Date().toISOString(),
    interruption: {
      code: "POST_CONFIRMATION_SCREENSHOT_RESOURCE_HTTP_500",
      stage: "after-collector-one-token-one-before-screenshot-eleven",
      chainMutationApplied: true,
      ordinaryRerunForbidden: true,
    },
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcPrimary: primaryRpc,
      rpcFallback: fallbackRpc,
      tzktApi: normalizeBase(SHADOWNET_TZKT_API),
    },
    actors: {
      creator: GNOCCHI_CURRENT_RECOVERY_CREATOR,
      collectorOne: GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE,
      collectorTwo: GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO,
    },
    contract: {
      address: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
      currentArtifactSha256: sha256(currentArtifactBytes),
    },
    temporalPolicy: {
      start: TIMED_START,
      end: TIMED_END,
      minimumRemainingWindowMs: MINIMUM_REMAINING_WINDOW_MS,
    },
    prefix: {
      inventorySha256: prefix.inventorySha256,
      files: prefix.files,
      indexedBoundarySha256: indexedBoundary.digest,
      content: prefixContent.map(({ bytes: _bytes, ...content }) => content),
    },
  });

  if (!resumeState) {
    for (const content of prefixContent) await saveContentExclusive(appRoot, content, content.bytes);
  }

  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-gnocchi-current-recovery.sock",
    authToken: "local-pasta-shadownet-gnocchi-current-recovery",
    auditLog: "/tmp/wtf-pasta-shadownet-gnocchi-current-recovery-audit.log",
  });
  const signerSet = await loadSignerSet(env);
  assert.equal(signerSet.creator.address, GNOCCHI_CURRENT_RECOVERY_CREATOR);
  assert.equal(signerSet.collector.address, GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE);
  assert.equal(signerSet.collectorTwo.address, GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO);
  const creatorTezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  const collectorOneTezos = buildToolkit(signerSet.collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(signerSet.collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Gnocchi recovery creator startup"),
    assertShadownet(collectorOneTezos, "Gnocchi recovery collector-one startup"),
    assertShadownet(collectorTwoTezos, "Gnocchi recovery collector-two startup"),
  ]);
  const { mirror } = await hydrateMirror(
    creatorTezos,
    prefixContent,
    resumeState?.appliedOperationHashes.length || 0,
  );
  const creatorBalance = Number((await creatorTezos.tz.getBalance(GNOCCHI_CURRENT_RECOVERY_CREATOR)).toString());
  const collectorOneBalance = Number((await collectorOneTezos.tz.getBalance(GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE)).toString());
  const collectorTwoBalance = Number((await collectorTwoTezos.tz.getBalance(GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO)).toString());
  for (const [label, balance] of [
    ["creator", creatorBalance],
    ["collector one", collectorOneBalance],
    ["collector two", collectorTwoBalance],
  ] as const) assert.ok(balance >= 500_000, `Gnocchi recovery ${label} is underfunded`);

  const creatorCallbacks = checkpoint.callbacks("creator");
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: GNOCCHI_CURRENT_RECOVERY_CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([GNOCCHI_CURRENT_RECOVERY_CONTRACT]),
    allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    initialOperationSequence: resumeState ? 6 : 4,
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    assertOperationApplied: (assertion) => verifyGnocchiTzktOperationApplied({
      assertion,
      signerAddress: GNOCCHI_CURRENT_RECOVERY_CREATOR,
    }),
    pinJson: async () => { throw new PastaUiLiveBridgeError("Gnocchi recovery pinning is forbidden", 403); },
    pinBlob: async () => { throw new PastaUiLiveBridgeError("Gnocchi recovery pinning is forbidden", 403); },
    validateOrigination: async () => {
      throw new PastaUiLiveBridgeError("Gnocchi recovery origination is forbidden", 403);
    },
    validateCall: (input) => validateCreatorCall(input),
    projectStorage: projectGnocchiStorage,
    ...creatorCallbacks,
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: creatorBalance,
    requiredBalanceMutez: 500_000,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 500_000,
  });
  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createMirroredSessionHandler({ session: creatorSession, mirror, role: "creator" }),
  });

  const createCollectorSession = async (
    actor: "collectorOne" | "collectorTwo",
    wallet: PlatformWallet,
    tezos: TezosToolkit,
    balanceMutez: number,
  ): Promise<ActorSession> => {
    const callbacks = checkpoint.callbacks(actor);
    const session = new TaquitoPastaUiLiveSession({
      tezos,
      signerAddress: wallet.address,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([GNOCCHI_CURRENT_RECOVERY_CONTRACT]),
      allowedEntrypoints: GNOCCHI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
      initialOperationSequence: actor === "collectorOne"
        ? (resumeState ? 3 : 2)
        : Math.max(0, (resumeState?.appliedOperationHashes.length || 3) - 3),
      assertExpectedChain: async (stage) => {
        await assertShadownet(tezos, stage);
        return SHADOWNET_CHAIN_ID;
      },
      assertOperationApplied: (assertion) => verifyGnocchiTzktOperationApplied({
        assertion,
        signerAddress: wallet.address,
      }),
      pinJson: async () => { throw new PastaUiLiveBridgeError("collector pinning is disabled", 403); },
      validateOrigination: async () => { throw new PastaUiLiveBridgeError("collector origination is disabled", 403); },
      validateCall: (input) => validateCollectorCall({ ...input, sendOptions: undefined }),
      projectStorage: projectGnocchiStorage,
      ...callbacks,
    });
    session.authorizeAfterFundingPreflight({
      balanceMutez,
      requiredBalanceMutez: 500_000,
      estimatedOriginationMutez: 0,
      operationReserveMutez: 500_000,
    });
    const bridge = await startPastaUiLiveLoopbackServer({
      staticRoot: STATIC_ROOT,
      handleAction: async (request) => {
        const call = decodedCallPayload(request);
        if (call) validateCollectorCall(call);
        return createMirroredSessionHandler({ session, mirror, role: "collector" })(request);
      },
    });
    return { wallet, tezos, session, bridge };
  };

  let creatorActor: ActorPage | null = null;
  let collectorOneActor: ActorPage | null = null;
  let collectorTwoActor: ActorPage | null = null;
  let collectorOne: ActorSession | null = null;
  let collectorTwo: ActorSession | null = null;
  const captures: CapturePastaProofStageResult[] = [];
  const priorScreenshotOrdinals = new Set(
    (resumeState?.priorScreenshots || []).map((screenshot) => {
      const match = String(screenshot.path || "").match(/\/([0-9]{3})-/);
      assert.ok(match);
      return Number(match[1]);
    }),
  );
  const completedRecoveryOperations = resumeState?.appliedOperationHashes.length || 0;
  try {
    creatorActor = await openActorPage(creatorBridge);
    await configureBase(creatorActor.page, ipfs.apiUrl);
    await connectActor(creatorActor.page, GNOCCHI_CURRENT_RECOVERY_CREATOR);
    await selectExistingCollection(creatorActor.page);
    await creatorActor.page.fill("#mintKt", GNOCCHI_CURRENT_RECOVERY_CONTRACT);
    await creatorActor.page.click("#btnLoadCollectionEditions");
    await creatorActor.page.locator("#editionList .pp-token").nth(2).waitFor({ state: "visible" });

    collectorOne = await createCollectorSession(
      "collectorOne",
      signerSet.collector,
      collectorOneTezos,
      collectorOneBalance,
    );
    collectorTwo = await createCollectorSession(
      "collectorTwo",
      signerSet.collectorTwo,
      collectorTwoTezos,
      collectorTwoBalance,
    );
    if (!resumeState) {
      collectorOneActor = await openActorPage(collectorOne.bridge);
      await configureBase(collectorOneActor.page, ipfs.apiUrl);
      await connectActor(collectorOneActor.page, GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE);
      await loadMintPolicy(collectorOneActor.page, 1, "3 lifetime minted");
      captures.push(await captureStage({
      actor: collectorOneActor,
      runRoot,
      checkpoint,
      ordinal: 11,
      capability: "independent collector mints",
      stageName: "Collector one token one mint recovered from verified chain state",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#account", expectedText: GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE.slice(0, 7) },
        { selector: "#mintInfo", expectedText: "Forever OE" },
        { selector: "#mintInfo", expectedText: "3 lifetime minted" },
      ],
    }));
      await mintToken(collectorOneActor.page, 2, "Limited Edition");
      captures.push(await captureStage({
      actor: collectorOneActor,
      runRoot,
      checkpoint,
      ordinal: 12,
      capability: "independent collector mints",
      stageName: "Collector one minted token 2",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "Limited Edition" },
        { selector: "#log", expectedText: "minted ✓" },
      ],
    }));

      await loadMintPolicy(creatorActor.page, 1, "Forever OE");
      await creatorActor.page.click("#btnVaultEdition");
      await waitForText(creatorActor.page, "#log", "issuance vaulted ✓");
      await waitForText(creatorActor.page, "#mintInfo", "VAULTED — EXISTING TOKENS UNAFFECTED");
      captures.push(await captureStage({
      actor: creatorActor,
      runRoot,
      checkpoint,
      ordinal: 13,
      capability: "vault and reopen forever issuance",
      stageName: "Forever OE vaulted",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "VAULTED — EXISTING TOKENS UNAFFECTED" },
        { selector: "#log", expectedText: "issuance vaulted ✓" },
      ],
    }));

      collectorTwoActor = await openActorPage(collectorTwo.bridge);
      await configureBase(collectorTwoActor.page, ipfs.apiUrl);
      await connectActor(collectorTwoActor.page, GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO);
      await loadMintPolicy(collectorTwoActor.page, 1, "VAULTED — EXISTING TOKENS UNAFFECTED");
      const pausedBefore = await targetTransactionCount();
      await collectorTwoActor.page.click("#btnMint");
      await waitForText(collectorTwoActor.page, "#log", "mint failed: this sale is paused");
      const pausedAfter = await targetTransactionCount();
      await checkpoint.expectedRejection({
      actor: "collectorTwo",
      tokenId: 1,
      amount: 1,
      reason: "this sale is paused",
      transactionCountBefore: pausedBefore,
      transactionCountAfter: pausedAfter,
    });
      captures.push(await captureStage({
      actor: collectorTwoActor,
      runRoot,
      checkpoint,
      ordinal: 14,
      capability: "vault and reopen forever issuance",
      stageName: "Vaulted collector mint rejected",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "VAULTED — EXISTING TOKENS UNAFFECTED" },
        { selector: "#log", expectedText: "mint failed: this sale is paused" },
      ],
    }));

      await creatorActor.page.click("#btnUnvaultEdition");
      await waitForText(creatorActor.page, "#log", "issuance reopened ✓");
      await waitForText(creatorActor.page, "#mintInfo", "ISSUANCE OPEN");
      captures.push(await captureStage({
      actor: creatorActor,
      runRoot,
      checkpoint,
      ordinal: 15,
      capability: "vault and reopen forever issuance",
      stageName: "Forever OE reopened",
      focusSelector: "#mintInfo",
      evidence: [
        { selector: "#mintInfo", expectedText: "ISSUANCE OPEN" },
        { selector: "#log", expectedText: "issuance reopened ✓" },
      ],
      }));
    } else {
      if (!priorScreenshotOrdinals.has(15)) {
        await loadMintPolicy(creatorActor.page, 1, "ISSUANCE OPEN");
        captures.push(await captureStage({
          actor: creatorActor,
          runRoot,
          checkpoint,
          ordinal: 15,
          capability: "vault and reopen forever issuance",
          stageName: "Forever OE reopen recovered from verified chain state",
          focusSelector: "#mintInfo",
          evidence: [
            { selector: "#mintInfo", expectedText: "Forever OE" },
            { selector: "#mintInfo", expectedText: "ISSUANCE OPEN" },
          ],
        }));
      }
      collectorTwoActor = await openActorPage(collectorTwo.bridge);
      await configureBase(collectorTwoActor.page, ipfs.apiUrl);
      await connectActor(collectorTwoActor.page, GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO);
    }

    for (const [tokenId, policy] of [[0, "Timed OE"], [1, "Forever OE"], [2, "Limited Edition"]] as const) {
      const screenshotOrdinal = 16 + tokenId;
      if (priorScreenshotOrdinals.has(screenshotOrdinal)) continue;
      const completedCollectorTwoMints = Math.max(0, completedRecoveryOperations - 3);
      if (tokenId < completedCollectorTwoMints) {
        const expectedMinted = [4, 4, 3][tokenId];
        await loadMintPolicy(collectorTwoActor.page, tokenId, `${expectedMinted} lifetime minted`);
        captures.push(await captureStage({
          actor: collectorTwoActor,
          runRoot,
          checkpoint,
          ordinal: screenshotOrdinal,
          capability: "independent collector mints",
          stageName: `Collector two token ${tokenId} mint recovered from verified chain state`,
          focusSelector: "#mintInfo",
          evidence: [
            { selector: "#account", expectedText: GNOCCHI_CURRENT_RECOVERY_COLLECTOR_TWO.slice(0, 7) },
            { selector: "#mintInfo", expectedText: policy },
            { selector: "#mintInfo", expectedText: `${expectedMinted} lifetime minted` },
          ],
        }));
      } else {
        await mintToken(collectorTwoActor.page, tokenId, policy);
        captures.push(await captureStage({
          actor: collectorTwoActor,
          runRoot,
          checkpoint,
          ordinal: screenshotOrdinal,
          capability: "independent collector mints",
          stageName: `Collector two minted token ${tokenId}`,
          focusSelector: "#mintInfo",
          evidence: [
            { selector: "#mintInfo", expectedText: policy },
            { selector: "#log", expectedText: "minted ✓" },
          ],
        }));
      }
    }

    if (!priorScreenshotOrdinals.has(19)) {
      if (!collectorOneActor) {
        collectorOneActor = await openActorPage(collectorOne.bridge);
        await configureBase(collectorOneActor.page, ipfs.apiUrl);
        await connectActor(collectorOneActor.page, GNOCCHI_CURRENT_RECOVERY_COLLECTOR_ONE);
      }
      await loadMintPolicy(collectorOneActor.page, 2, "3 lifetime minted / 4 cap");
      const capBefore = await targetTransactionCount();
      await collectorOneActor.page.fill("#mintAmount", "2");
      await collectorOneActor.page.click("#btnMint");
      await waitForText(collectorOneActor.page, "#log", "mint failed: not enough supply left");
      const capAfter = await targetTransactionCount();
      if (!resumeState?.rejectionReasons.includes("not enough supply left")) {
        await checkpoint.expectedRejection({
          actor: "collectorOne",
          tokenId: 2,
          amount: 2,
          reason: "not enough supply left",
          transactionCountBefore: capBefore,
          transactionCountAfter: capAfter,
        });
      } else {
        assert.equal(capAfter, capBefore, "recovered cap rejection unexpectedly wrote a transaction");
      }
      captures.push(await captureStage({
        actor: collectorOneActor,
        runRoot,
        checkpoint,
        ordinal: 19,
        capability: "independent collector mints",
        stageName: "Limited edition cap enforced",
        focusSelector: "#mintInfo",
        evidence: [
          { selector: "#mintInfo", expectedText: "3 lifetime minted / 4 cap" },
          { selector: "#log", expectedText: "mint failed: not enough supply left" },
        ],
      }));
    }
  } finally {
    await Promise.all([
      closeActorPage(creatorActor),
      closeActorPage(collectorOneActor),
      closeActorPage(collectorTwoActor),
    ]);
    await Promise.all([
      creatorBridge.close(),
      collectorOne?.bridge.close() || Promise.resolve(),
      collectorTwo?.bridge.close() || Promise.resolve(),
    ]);
  }

  assert.equal(
    captures.length,
    resumeState ? 9 - priorScreenshotOrdinals.size : 9,
    resumeState
      ? "Gnocchi resumable continuation must complete screenshots eleven through nineteen"
      : "Gnocchi recovery must append screenshots eleven through nineteen",
  );
  const terminal = await terminalChainEvidence();
  await durableWriteExclusive(
    path.join(appRoot, TERMINAL_RELATIVE_PATH),
    deterministicJsonBytes(terminal.evidence),
  );
  const finalizedCheckpoint = await checkpoint.finalize(terminal.sha256);
  const receipt = {
    schema: "pastaprotocol-gnocchi-current-recovery@1",
    classification: "UI-LIVE-RECOVERED-CHECKPOINTED",
    status: "PASSED",
    runId: GNOCCHI_CURRENT_RECOVERY_RUN_ID,
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    interruption: {
      code: "POST_CONFIRMATION_SCREENSHOT_RESOURCE_HTTP_500",
      stage: "after-collector-one-token-one-before-screenshot-eleven",
      recoveredWithoutReplayingAppliedPrefix: true,
    },
    contract: {
      address: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
      explorerUrl: `https://shadownet.tzkt.io/${GNOCCHI_CURRENT_RECOVERY_CONTRACT}`,
    },
    prefix: {
      recoveredOperations: PREFIX_OPERATIONS,
      recoveredContent: PREFIX_CONTENT.map((content) => ({
        ...content,
        uri: `ipfs://${content.cid}`,
        provenance: "recovered-on-chain-reference",
      })),
      preservedScreenshots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
    continuation: {
      liveOperationOrdinals: EXPECTED_OPERATIONS.map((operation) => operation.globalOrdinal),
      newContent: [],
      appendedScreenshots: [
        ...(resumeState?.priorScreenshots || []),
        ...captures.map((capture) => capture.manifestScreenshot),
      ],
    },
    checkpoint: finalizedCheckpoint,
    terminalChain: {
      path: TERMINAL_RELATIVE_PATH,
      sha256: terminal.sha256,
      operationHashes: terminal.evidence.operationHashes,
    },
    completedAt: new Date().toISOString(),
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptPath = path.join(appRoot, RECOVERY_RECEIPT_RELATIVE_PATH);
  await durableWriteExclusive(receiptPath, receiptBytes);
  return {
    status: "PASSED",
    classification: receipt.classification,
    contractAddress: GNOCCHI_CURRENT_RECOVERY_CONTRACT,
    checkpointId: finalizedCheckpoint.checkpointId,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    terminalOperationHashes: terminal.evidence.operationHashes,
  };
}

async function main(): Promise<void> {
  try {
    const result = await runGnocchiCurrentRecovery();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
