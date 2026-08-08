import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { validateAddress, validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";

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
  ravioliUiLiveDescriptorSha256,
  type RavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  ipfsGatewayUrl,
  SHADOWNET_CHAIN_ID,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

type JsonRecord = Record<string, any>;

const APP_FILE_COUNT = 91;
const APP_INVENTORY_SHA256 = "020f410a3724a5194420af167a19225469682007518f199c96340a0ff47c55bd";

const SCREENSHOTS = Object.freeze([
  Object.freeze({ stem: "001-compose-five-atomic-pack-modes-same-run-dependencies-entered", pngSha256: "7206321ea02469bf6944c52b510c8b74e870863705c7b68363079f8d6253f454", sidecarSha256: "ef5e2a0efc4729d3c697f28f6f2356f597c8534b1ab26cd14cbd58dd5cd000d0" }),
  Object.freeze({ stem: "002-compose-five-atomic-pack-modes-creator-connected-on-shadownet", pngSha256: "9f82939f9d9d104d1aeebec0a32e7e1c1105e05274423ce4d763b208f0db4342", sidecarSha256: "b06266ad6d2f30606f27b0a8c800af4d8aa43ad3745de29aa0e6abdaf6144d46" }),
  Object.freeze({ stem: "003-limited-edition-expiry-deconfliction-le-wrapper-outliving-child-rejected-before-pins-or-writes", pngSha256: "2a967749cd17adff551b13ea851591aff5131b2703c2b713ff53cf25f58b7b1b", sidecarSha256: "260cb388118c261b25c27302bff8e5d3520fc9561bc2849ffd01e96d3cecad1a" }),
  Object.freeze({ stem: "004-compose-five-atomic-pack-modes-deterministic-vault-configured", pngSha256: "cf990f03632ee003f2fad9ce0fa9b181b36b7ee553b62b3cec6a0542eb9f96b3", sidecarSha256: "51abacd7bcbd200cc912123c046863033ae51b382a1e66c9950e151b3922f7a6" }),
  Object.freeze({ stem: "005-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued", pngSha256: "e345653faad495d3561d9bbb7c1254b35722b02b346bc38a3566f5f4efcc4ef1", sidecarSha256: "da02775699333c6e1daa6e46aeb1845a08e65d7a8449f3c05a7dfaec365ed944" }),
  Object.freeze({ stem: "006-compose-five-atomic-pack-modes-blind-funded-pool-configured", pngSha256: "35696c4288c35536331c057d7ddb95fed98b51347faac56385415b6f1b88be15", sidecarSha256: "85c6217a999fa593718ce1817914dcc31e059d6150b1144483a7adf5f3aaec23" }),
  Object.freeze({ stem: "007-compose-five-atomic-pack-modes-blind-funded-pool-funded-and-issued", pngSha256: "d5e8df9881e101e216d672dfac2f13590246f68bca38ee10226e93eda189abf7", sidecarSha256: "6b6060fb0d4f57bc684b78390f29f7681678b25bb06a787aaff819304cebcc23" }),
  Object.freeze({ stem: "008-buy-and-atomically-open-five-pack-modes-collector-one-bought-blind-funded-pool", pngSha256: "901bb7a33d1b80ea16552f01da5d15876dca74a6b16ee0c1d82786be0d0f0b76", sidecarSha256: "08f917c6b60b2bbb6e28f12c421537087748879b35dae181fc95272694a068e9" }),
  Object.freeze({ stem: "009-buy-and-atomically-open-five-pack-modes-collector-two-bought-blind-funded-pool", pngSha256: "7fa1bc86946dbe9e306726181b8041509dd0eee235c6d3762218fea5e14654f4", sidecarSha256: "2051e9a94bc3c060ff98e0f20f7a1fa3ea62d1a42498618bb34c80e81bbfc2a1" }),
]);

const OPEN_KITS = Object.freeze([
  Object.freeze({ tokenId: 0, fileName: "ravioli-open-kit-0.json", sha256: "b9598bf63a2a82fa823806a8618ce16508f60d7236bede263a14f3ed7f76411f", byteLength: 1_035 }),
  Object.freeze({ tokenId: 1, fileName: "ravioli-open-kit-1.json", sha256: "bd59d030b066ce2a476627318da1ea9085310a8c86eb6fe57a7bb46abbe4f370", byteLength: 2_075 }),
]);

const PINS = Object.freeze([
  Object.freeze({ pinSequence: 1, eventIndex: 1, fileName: "ravioli-wrapper-0.png", mimeType: "image/png", byteLength: 93, sha256: "d138c518e98db00ab6c0f0aa33c929c7af05523be706082e9c60ea3c769751c8", cid: "bafkreigrhdcrr2mnwaflnqhqviz4skohv4cveo7hayec5hda5i6hnf2rza" }),
  Object.freeze({ pinSequence: 2, eventIndex: 2, fileName: "pasta-ravioli-blind-controller-contract.json", mimeType: "application/json", byteLength: 248, sha256: "a887a8321d84d4f97566e5fb791d1a6d9d79b8ee5c5adfe70cf21d10811677a0", cid: "bafkreifiq6udehme2t4xkzxf7n4r2gtntv43r3s4llp6odhsduiicftxua" }),
  Object.freeze({ pinSequence: 3, eventIndex: 3, fileName: "collection.json", mimeType: "application/json", byteLength: 292, sha256: "3e30879781f55dd5f41a4bf43d6bb00c3ec6659ca3f5c278962d479e00f99460", cid: "bafkreib6gcdzpapvlxk7igsl6q6wxmamh3dglhfd6xbhrfrni6pab6muma" }),
  Object.freeze({ pinSequence: 4, eventIndex: 13, fileName: "ravioli-pack-manifest.json", mimeType: "application/json", byteLength: 1_138, sha256: "79c79f4d2d8cf005c8bd5957656e00d726d6d72e827f06defc6e45f213683d61", cid: "bafkreidzy6pu2lmm6ac4rpkzk5sw4agxe3lnolucp4dn57doixzbg2b5me" }),
  Object.freeze({ pinSequence: 5, eventIndex: 15, fileName: "ravioli-public-reveal-0.json", mimeType: "application/json", byteLength: 1_115, sha256: "93cef61e48555628cd28cfd1d4a9dcad409cd211bcf740285bbbaebd4149b25c", cid: "bafkreietz33b4scvkyum2kgp2hkktxfniconeen465acqw53v26ucsnslq" }),
  Object.freeze({ pinSequence: 6, eventIndex: 16, fileName: "token.json", mimeType: "application/json", byteLength: 1_363, sha256: "b8a74f099dbb04b596fe771b8e2364a91175d786d704c6378a59a3c8c8328d5d", cid: "bafkreifyu5hqthn3as2zn7txdohcgzfjcf25pbwxatddpcszupemqmunlu" }),
  Object.freeze({ pinSequence: 7, eventIndex: 32, fileName: "ravioli-wrapper-1.png", mimeType: "image/png", byteLength: 93, sha256: "6e5aa8c0aa33281820959970ece335173b3781fdf2f4d575e864ebb2bb076762", cid: "bafkreidolkumbkrtfamcbfmzodwognixhm3yd7ps6tkxl2de5ozlwb3hmi" }),
  Object.freeze({ pinSequence: 8, eventIndex: 36, fileName: "ravioli-pack-manifest.json", mimeType: "application/json", byteLength: 1_047, sha256: "a610e862f35808c702f41c320d2be54b817def0b6a5f458acab56623602915a0", cid: "bafkreifgcdugf42ybddqf5a4gigsxzklqf666c3kl5cyvsvvmyrwakivua" }),
  Object.freeze({ pinSequence: 9, eventIndex: 37, fileName: "ravioli-sealed-reveal-1.json", mimeType: "application/json", byteLength: 2_533, sha256: "8e1c3f4bfb52221da65626122c79f6f52e6b4fdc2cc8fae9667802af2602219e", cid: "bafkreieodq7ux62seio2mvrgciwht5xvfzvu7xbmzd5osztyakxsmarbty" }),
  Object.freeze({ pinSequence: 10, eventIndex: 38, fileName: "token.json", mimeType: "application/json", byteLength: 1_758, sha256: "68a9edecf8390b39b608cc48c607d317adf11961655261d248b0203a723752fa", cid: "bafkreidivhw6z6bzbm43mcgmjddapuyxvxyrsylfkjq5esfqea5hen2s7i" }),
]);

export const RAVIOLI_CURRENT_V5_RESUME_IDENTITY = Object.freeze({
  runId: "pasta-alpha-proof-20260724t015728z",
  journalId: "28fd890cb0a8a136cebad8cb8280184da8f65d70a4f3777e15daa65320dbbb10",
  intentSha256: "f5c76b550d088eb7b3839b007986e5c3450d8d56515c30a3ebbaf29b4aee5b19",
  matrixSha256: "01de13af9bc190f1480ebc40457e30daee3ef9b4bcdeaffbaec11486c3b59a0a",
  finalEventSha256: "201fc0332c3df1b0d48e15125f20df5196af36a661e449e615c736af19ddf1a8",
  eventCount: 59,
  pinCount: 10,
  operationCount: 16,
  fileCount: APP_FILE_COUNT,
  inventorySha256: APP_INVENTORY_SHA256,
  creatorAddress: "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM",
  collectorOneAddress: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
  collectorTwoAddress: "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
  controllerAddress: "KT1RCkFPpuUTQyLRP2Ux4KKPgTXwFhwnHVLn",
  routerAddress: "KT1L316ZdN8BEmDLcjNEtgXi8hMQ1Qz4aQkU",
  gnocchiAddress: "KT19dHuzHkqzvC3CgobLoTLbars792TFm87j",
  rotiniAddress: "KT1RKvz9b2b3fnDMMn1jN492Qk4EVAPCmXNj",
  mode0OperatorAppliedLevel: 4_322_869,
  mode1OperatorAppliedLevel: 4_322_883,
  screenshots: SCREENSHOTS,
  openKits: OPEN_KITS,
  pins: PINS,
});

export type RavioliCurrentV5OperationRecord = Readonly<{
  identity: {
    globalOrdinal: number;
    actor: "creator" | "collector1" | "collector2";
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

export type RavioliCurrentV5PinRecord = Readonly<{
  bytes: Uint8Array;
  value?: JsonRecord;
  proof: PastaUiLivePinProof;
}>;

export type RavioliCurrentV5Resume = Readonly<{
  appRoot: string;
  journalRoot: string;
  controllerAddress: string;
  routerAddress: string;
  fileCount: number;
  journalPins: readonly RavioliCurrentV5PinRecord[];
  activePins: readonly RavioliCurrentV5PinRecord[];
  operations: readonly RavioliCurrentV5OperationRecord[];
  writeReceipts: readonly PastaUiLivePublicReceipt[];
  openKits: readonly {
    tokenId: number;
    fileName: string;
    relativePath: string;
    bytes: Uint8Array;
    value: JsonRecord;
    sha256: string;
  }[];
  identity: typeof RAVIOLI_CURRENT_V5_RESUME_IDENTITY;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exactFile(filePath: string, expectedSha256?: string, expectedBytes?: number): Promise<Uint8Array> {
  const info = await lstat(filePath);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `${filePath} is not a real file`);
  const bytes = await readFile(filePath);
  if (expectedBytes !== undefined) assert.equal(bytes.byteLength, expectedBytes, `${filePath} length drift`);
  if (expectedSha256) assert.equal(sha256(bytes), expectedSha256, `${filePath} digest drift`);
  return Uint8Array.from(bytes);
}

async function canonicalJsonFile(filePath: string): Promise<{ value: JsonRecord; bytes: Uint8Array; sha256: string }> {
  const bytes = await exactFile(filePath);
  const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${filePath} is not a JSON object`);
  assert.equal(
    Buffer.compare(Buffer.from(bytes), Buffer.from(deterministicJsonBytes(value))),
    0,
    `${filePath} is not canonical JSON`,
  );
  return { value, bytes, sha256: sha256(bytes) };
}

async function exactDirectory(directory: string, expectedNames: readonly string[]): Promise<void> {
  const info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), `${directory} is not a real directory`);
  assert.deepEqual((await readdir(directory)).sort(), [...expectedNames].sort(), `${directory} inventory drift`);
}

async function inventory(root: string): Promise<{ count: number; sha256: string }> {
  const rows: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const info = await lstat(directory);
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), `${directory} is not a real directory`);
    for (const name of (await readdir(directory)).sort()) {
      const candidate = path.join(directory, name);
      const child = await lstat(candidate);
      assert.equal(child.isSymbolicLink(), false, `${candidate} is a symbolic link`);
      if (child.isDirectory()) await walk(candidate);
      else {
        assert.ok(child.isFile(), `${candidate} is not a regular file`);
        const bytes = await readFile(candidate);
        rows.push(`${path.relative(root, candidate)}\0${bytes.byteLength}\0${sha256(bytes)}`);
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

export async function loadRavioliCurrentV5Resume(input: {
  journal: RavioliUiLiveJournal;
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  expected: {
    creatorAddress: string;
    collectorOneAddress: string;
    collectorTwoAddress: string;
    dependencyAddresses: { gnocchi: string; rotini: string };
    dependencyHashes: Record<string, string>;
    artifactHashes: Record<string, string>;
  };
}): Promise<RavioliCurrentV5Resume> {
  const identity = RAVIOLI_CURRENT_V5_RESUME_IDENTITY;
  assert.equal(input.journal.isFinalized(), false, "current-v5 boundary is already finalized");
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
  const eventNames = (await readdir(eventRoot)).sort();
  assert.equal(eventNames.length, identity.eventCount);
  await Promise.all([
    exactDirectory(appRoot, ["artifacts", "screenshots"]),
    exactDirectory(artifactsRoot, [
      "journal",
      "open-kits",
      "pins",
      ...SCREENSHOTS.map((entry) => `screenshot-${entry.stem}.json`),
    ]),
    exactDirectory(journalRoot, ["events", "intent.json", "pins"]),
    exactDirectory(pinRoot, PINS.map((entry) => `${String(entry.pinSequence).padStart(6, "0")}.bin`)),
    exactDirectory(openKitRoot, ["open-kit-capture-progress.json", ...OPEN_KITS.map((entry) => entry.fileName)]),
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
    assert.equal(value.previousRecordSha256, index === 0 ? identity.intentSha256 : events[index - 1]!.sha256);
    assert.equal(
      name,
      `${String(index + 1).padStart(6, "0")}-${String(value.phase).toLowerCase()}-${value.actor}.json`,
    );
    events.push(event);
  }
  assert.equal(events.at(-1)?.sha256, identity.finalEventSha256);

  const journalPins: RavioliCurrentV5PinRecord[] = [];
  for (const expected of PINS) {
    const event = events[expected.eventIndex - 1]!.value;
    assert.equal(event.phase, "PIN");
    assert.equal(event.pinSequence, expected.pinSequence);
    assert.deepEqual(event.artifact, {
      byteLength: expected.byteLength,
      fileName: expected.fileName,
      mimeType: expected.mimeType,
      path: `pins/${String(expected.pinSequence).padStart(6, "0")}.bin`,
      sha256: expected.sha256,
    });
    const uri = `ipfs://${expected.cid}`;
    assert.equal(event.metadata.cid, expected.cid);
    assert.equal(event.metadata.uri, uri);
    assert.equal(event.metadata.publicGatewayUrl, ipfsGatewayUrl(input.ipfs.publicGatewayUrl, expected.cid));
    const bytes = await exactFile(
      path.join(pinRoot, `${String(expected.pinSequence).padStart(6, "0")}.bin`),
      expected.sha256,
      expected.byteLength,
    );
    let value: JsonRecord | undefined;
    if (expected.mimeType === "application/json") {
      value = JSON.parse(Buffer.from(bytes).toString("utf8"));
      assert.equal(
        Buffer.compare(Buffer.from(bytes), Buffer.from(deterministicJsonBytes(value))),
        0,
        `pin ${expected.pinSequence} is not canonical JSON`,
      );
    }
    const proof: PastaUiLivePinProof = {
      cid: expected.cid,
      uri,
      fileName: expected.fileName,
      mimeType: expected.mimeType,
      byteLength: expected.byteLength,
      sha256: expected.sha256,
      localGatewayUrl: ipfsGatewayUrl(input.ipfs.localGatewayUrl, expected.cid),
      publicGatewayUrl: ipfsGatewayUrl(input.ipfs.publicGatewayUrl, expected.cid),
      publicGatewayVerified: true,
      verificationAttempts: 1,
    };
    journalPins.push(Object.freeze({
      bytes,
      ...(value ? { value } : {}),
      proof,
    }));
  }

  const operations: RavioliCurrentV5OperationRecord[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const prepared = events[index]!.value;
    if (prepared.phase !== "PREPARED") continue;
    const submitted = events[index + 1]!.value;
    const applied = events[index + 2]!.value;
    assert.equal(submitted.phase, "SUBMITTED");
    assert.equal(applied.phase, "APPLIED");
    assert.equal(prepared.globalOrdinal, operations.length + 1);
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

  for (const screenshot of SCREENSHOTS) {
    await Promise.all([
      exactFile(path.join(screenshotRoot, `${screenshot.stem}.png`), screenshot.pngSha256),
      exactFile(path.join(artifactsRoot, `screenshot-${screenshot.stem}.json`), screenshot.sidecarSha256),
    ]);
  }
  const openKits = [];
  for (const expected of OPEN_KITS) {
    const bytes = await exactFile(path.join(openKitRoot, expected.fileName), expected.sha256, expected.byteLength);
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
    "16fe35736193daed25f4d830cb123d0a0bfa9a693dd4e18b2aed1e0530842869",
    781,
  );
  assert.deepEqual(await inventory(appRoot), {
    count: identity.fileCount,
    sha256: identity.inventorySha256,
  });

  return Object.freeze({
    appRoot,
    journalRoot,
    controllerAddress: identity.controllerAddress,
    routerAddress: identity.routerAddress,
    fileCount: identity.fileCount,
    journalPins: Object.freeze(journalPins),
    activePins: Object.freeze([...journalPins]),
    operations: Object.freeze(operations),
    writeReceipts: Object.freeze(operations.map((operation) => operation.receipt)),
    openKits: Object.freeze(openKits),
    identity,
  });
}
