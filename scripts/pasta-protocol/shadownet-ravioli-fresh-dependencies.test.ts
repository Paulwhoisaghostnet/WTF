import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import {
  FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH,
  FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH,
  FRESH_GNOCCHI_RECEIPT_PATH,
  FRESH_RAVIOLI_CHAIN_ID,
  FRESH_RAVIOLI_DEPENDENCY_SCHEMA,
  FRESH_ROTINI_CONTRACT_ARTIFACT_PATH,
  FRESH_ROTINI_RECEIPT_PATH,
  GNOCCHI_PORTABLE_SUPPLEMENT_STAGES,
  GNOCCHI_TERMINAL_LIFECYCLE_STAGES,
  RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL,
  RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL,
  RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL,
  RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL,
  RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL,
  loadFreshRavioliDependencies,
  recheckFreshRavioliDependencies,
  recheckRavioliDependenciesForCurrentV2Resume,
  recheckRavioliDependenciesForCurrentV3Restart,
  recheckRavioliDependenciesForCurrentOp14Resume,
  recheckRavioliDependenciesForCurrentOp20Resume,
  recheckRavioliDependenciesForCurrentOp55Resume,
  recheckRavioliDependenciesForCurrentOp63Resume,
  recheckRavioliDependenciesForCurrentV6Resume,
  recheckRavioliDependenciesForMode0Replay,
  type FreshGnocchiLiveSnapshot,
  type FreshRavioliDependencies,
  type FreshRotiniLiveSnapshot,
} from "./shadownet-ravioli-fresh-dependencies";
import {
  GNOCCHI_TERMINAL_RECOVERY_CREATOR,
  GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
} from "./shadownet-gnocchi-terminal-readonly-recovery";
import { deterministicJsonBytes } from "./shadownet-proof-kit";

type JsonObject = Record<string, any>;

const RUN_ID = "pasta-fresh-proof-test";
const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const GNOCCHI = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
const ROTINI = "KT1LUc15yfskvtWfKvYt9oFgXt24TnWx1P8T";
const RAVIOLI_ROUTER = "KT1TuPCh4gR19w7kdrYVv5jVF9VrKJU6z5rj";
const GNOCCHI_ADAPTER = "KT1SanxZmBUoQP4Td3JTLVnhoWV43zq9tUqN";
const ROTINI_ADAPTER = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
const OTHER_CREATOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const RAVIOLI_OPERATOR_APPLIED_LEVEL = 4_311_759;
const RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL = 4_312_347;
const RAVIOLI_MINTER_APPLIED_LEVEL = 4_312_400;
const RAVIOLI_RESERVATION_APPLIED_LEVEL = 4_312_450;
const RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL = 4_312_500;
const RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL = 4_312_550;
const RAVIOLI_OP55_MODE0_APPLIED_LEVEL = 4_535_185;
const RAVIOLI_OP55_MODE1_APPLIED_LEVEL = 4_535_199;
const RAVIOLI_OP55_MINTER_APPLIED_LEVEL = 4_549_843;
const RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL = 4_550_611;
const RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL = 4_550_625;
const RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL = 4_550_631;
const RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL = 4_550_637;
const GNOCCHI_ORIGIN = "ooqQerwmFGorWABitNHN2fHYiTszK9VYB7UJhaRSciFp1pBEXKD";
const ROTINI_ORIGIN = "ooKJG9hGCG2hyVmANRqww5Jq3U4jE91xduirtwK61Biov5CQrWd";
const RECOVERED_GNOCCHI_HASHES = [
  GNOCCHI_ORIGIN,
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

const CURRENT_V2_SOURCE_ROOT = path.resolve(
  "artifacts/pasta-protocol-proof-runs",
  GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
);

type Fixture = {
  tempRoot: string;
  runRoot: string;
  gnocchiManifestPath: string;
  gnocchiReceiptPath: string;
  rotiniManifestPath: string;
  rotiniReceiptPath: string;
  gnocchiMediaPath: string;
};

type CurrentV2Fixture = {
  tempRoot: string;
  runRoot: string;
  gnocchiRoot: string;
  gnocchiManifestPath: string;
  gnocchiReceiptPath: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJson(filePath: string, value: unknown): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const bytes = jsonBytes(value);
  await writeFile(filePath, bytes);
  return sha256(bytes);
}

async function copyCurrentV2Fixture(t: TestContext): Promise<CurrentV2Fixture> {
  const sourceManifest = path.join(CURRENT_V2_SOURCE_ROOT, "gnocchi", "manifest.json");
  await assert.doesNotReject(readFile(sourceManifest), `current v2 proof fixture is missing at ${sourceManifest}`);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pasta-ravioli-current-v2-loader-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });
  const runRoot = path.join(tempRoot, GNOCCHI_TERMINAL_RECOVERY_RUN_ID);
  await mkdir(runRoot, { recursive: true });
  await Promise.all(["gnocchi", "rotini"].map((app) =>
    cp(path.join(CURRENT_V2_SOURCE_ROOT, app), path.join(runRoot, app), {
      recursive: true,
      mode: fsConstants.COPYFILE_FICLONE,
    })
  ));
  const gnocchiRoot = path.join(runRoot, "gnocchi");
  return {
    tempRoot,
    runRoot,
    gnocchiRoot,
    gnocchiManifestPath: path.join(gnocchiRoot, "manifest.json"),
    gnocchiReceiptPath: path.join(gnocchiRoot, FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH),
  };
}

async function loadCurrentV2Fixture(fixture: CurrentV2Fixture): Promise<FreshRavioliDependencies> {
  return loadFreshRavioliDependencies({
    runRoot: fixture.runRoot,
    expectedRunId: GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
    expectedCreator: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
  });
}

function terminalSummary(terminalReceipt: JsonObject, receiptSha256: string): JsonObject {
  return {
    receiptSha256,
    prefix: terminalReceipt.prefix,
    operationGraph: terminalReceipt.operationGraph,
    terminalState: terminalReceipt.terminalState,
    bridge: terminalReceipt.bridge,
    unchanged: terminalReceipt.unchanged,
    recoveredScreenshotOrdinals: [18, 19],
    replayedAppliedOperations: 0,
  };
}

async function mutateCurrentV2TerminalReceipt(
  fixture: CurrentV2Fixture,
  mutate: (terminalReceipt: JsonObject) => void,
): Promise<void> {
  const manifest = await readJson(fixture.gnocchiManifestPath);
  const finalReceipt = await readJson(fixture.gnocchiReceiptPath);
  const terminalPath = path.join(fixture.gnocchiRoot, "artifacts/gnocchi-terminal-readonly-recovery.json");
  const reconciliationPath = path.join(fixture.gnocchiRoot, "artifacts/gnocchi-chain-reconciliation-snapshot.json");
  const terminalReceipt = await readJson(terminalPath);
  const reconciliation = await readJson(reconciliationPath);
  mutate(terminalReceipt);
  const terminalSha256 = await writeJson(terminalPath, terminalReceipt);
  const summary = terminalSummary(terminalReceipt, terminalSha256);
  finalReceipt.terminalRecovery = summary;
  reconciliation.terminalRecovery = summary;
  const reconciliationSha256 = await writeJson(reconciliationPath, reconciliation);
  finalReceipt.chainReconciliation.sha256 = reconciliationSha256;
  const finalReceiptSha256 = await writeJson(fixture.gnocchiReceiptPath, finalReceipt);
  const terminalBinding = manifest.artifacts.find((artifact: JsonObject) =>
    artifact.path === "artifacts/gnocchi-terminal-readonly-recovery.json"
  );
  const reconciliationBinding = manifest.artifacts.find((artifact: JsonObject) =>
    artifact.path === "artifacts/gnocchi-chain-reconciliation-snapshot.json"
  );
  const finalReceiptBinding = manifest.artifacts.find((artifact: JsonObject) =>
    artifact.path === FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH
  );
  assert.ok(terminalBinding && reconciliationBinding && finalReceiptBinding);
  terminalBinding.sha256 = terminalSha256;
  reconciliationBinding.sha256 = reconciliationSha256;
  finalReceiptBinding.sha256 = finalReceiptSha256;
  await writeJson(fixture.gnocchiManifestPath, manifest);
}

async function mutateCurrentV2BoundArtifact(input: {
  fixture: CurrentV2Fixture;
  relativePath: string;
  mutate: (value: JsonObject) => void;
}): Promise<void> {
  const artifactPath = path.join(input.fixture.gnocchiRoot, input.relativePath);
  const value = await readJson(artifactPath);
  input.mutate(value);
  const digest = await writeJson(artifactPath, value);
  await mutateManifest(input.fixture.gnocchiManifestPath, (manifest) => {
    const binding = manifest.artifacts.find((artifact: JsonObject) => artifact.path === input.relativePath);
    assert.ok(binding);
    binding.sha256 = digest;
    if ("retrievedSha256" in binding) binding.retrievedSha256 = digest;
  });
}

function ipfs(label: string): string {
  return `ipfs://bafkrei${label.replace(/[^a-z0-9]/g, "")}fixture`;
}

async function writeArtifact(input: {
  appRoot: string;
  id: string;
  kind: string;
  relativePath: string;
  value: unknown;
  ipfsUri?: string;
  fileName?: string;
  actor?: string;
  durability?: "package-only";
}): Promise<JsonObject> {
  const bytes = input.value instanceof Uint8Array ? input.value : jsonBytes(input.value);
  await mkdir(path.dirname(path.join(input.appRoot, input.relativePath)), { recursive: true });
  await writeFile(path.join(input.appRoot, input.relativePath), bytes);
  const digest = sha256(bytes);
  return {
    id: input.id,
    kind: input.kind,
    path: input.relativePath,
    sha256: digest,
    retrievedSha256: digest,
    ...(input.ipfsUri ? {
      ipfsUri: input.ipfsUri,
      gatewayUrl: `https://proof.invalid/ipfs/${input.ipfsUri.slice("ipfs://".length)}`,
    } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.durability ? { durability: input.durability } : {}),
  };
}

function manifestToken(input: {
  app: "gnocchi" | "rotini";
  contractAddress: string;
  tokenId: number;
  metadataArtifact: JsonObject;
  mediaArtifact: JsonObject;
}): JsonObject {
  return {
    id: `${input.app}-token-${input.tokenId}`,
    contractAddress: input.contractAddress,
    tokenId: String(input.tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${input.contractAddress}/tokens/${input.tokenId}`,
    metadataArtifactId: input.metadataArtifact.id,
    mediaArtifactId: input.mediaArtifact.id,
    metadataUri: input.metadataArtifact.ipfsUri,
    artifactUri: input.mediaArtifact.ipfsUri,
  };
}

async function createFixture(t: TestContext): Promise<Fixture> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pasta-ravioli-fresh-loader-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });
  const runRoot = path.join(tempRoot, RUN_ID);
  const gnocchiRoot = path.join(runRoot, "gnocchi");
  const rotiniRoot = path.join(runRoot, "rotini");
  await Promise.all([mkdir(gnocchiRoot, { recursive: true }), mkdir(rotiniRoot, { recursive: true })]);
  const [gnocchiScriptBytes, rotiniScriptBytes] = await Promise.all([
    readFile(FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH),
    readFile(FRESH_ROTINI_CONTRACT_ARTIFACT_PATH),
  ]);
  const gnocchiScriptSha256 = sha256(gnocchiScriptBytes);
  const rotiniScriptSha256 = sha256(rotiniScriptBytes);
  const gnocchiScriptCodeSha256 = "a".repeat(64);
  const rotiniScriptCodeSha256 = "b".repeat(64);

  const gnocchiPins: JsonObject[] = [];
  const gnocchiTokens: JsonObject[] = [];
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    const artifactUri = ipfs(`gnocchiartifact${tokenId}`);
    const metadataUri = ipfs(`gnocchimetadata${tokenId}`);
    const media = await writeArtifact({
      appRoot: gnocchiRoot,
      id: `token-${tokenId}-media`,
      kind: "token-media",
      relativePath: `artifacts/token-${tokenId}-media.png`,
      value: Buffer.from(`gnocchi-media-${tokenId}`),
      ipfsUri: artifactUri,
    });
    const metadata = await writeArtifact({
      appRoot: gnocchiRoot,
      id: `token-${tokenId}-metadata`,
      kind: "token-metadata",
      relativePath: `artifacts/token-${tokenId}-metadata.json`,
      value: { name: `Gnocchi ${tokenId}`, artifactUri },
      ipfsUri: metadataUri,
    });
    gnocchiPins.push(media, metadata);
    gnocchiTokens.push(manifestToken({ app: "gnocchi", contractAddress: GNOCCHI, tokenId, metadataArtifact: metadata, mediaArtifact: media }));
  }
  const collection = await writeArtifact({
    appRoot: gnocchiRoot,
    id: "collection-metadata",
    kind: "collection-metadata",
    relativePath: "artifacts/collection-metadata.json",
    value: { name: "Fresh Gnocchi fixture" },
    ipfsUri: ipfs("gnocchicollection"),
  });
  gnocchiPins.push(collection);
  const gnocchiCodeArtifact = await writeArtifact({
    appRoot: gnocchiRoot,
    id: "gnocchi-current-contract-code",
    kind: "contract-code",
    relativePath: "artifacts/gnocchi-current-contract-code.json",
    value: gnocchiScriptBytes,
  });
  const gnocchiReceipt: JsonObject = {
    schema: "pastaprotocol-gnocchi-ui-live-run@1",
    classification: "UI-LIVE",
    network: "shadownet",
    chainId: FRESH_RAVIOLI_CHAIN_ID,
    actors: {
      creator: CREATOR,
      collectorOne: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
      collectorTwo: "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
    },
    contract: {
      address: GNOCCHI,
      explorerUrl: `https://shadownet.tzkt.io/${GNOCCHI}`,
      scriptSha256: gnocchiScriptSha256,
    },
    receipts: [{
      action: "originate",
      operationHash: GNOCCHI_ORIGIN,
      contractAddress: GNOCCHI,
      signerAddress: CREATOR,
      chainId: FRESH_RAVIOLI_CHAIN_ID,
    }],
    pins: gnocchiPins,
    indexed: { indexedTokenMetadataUris: gnocchiTokens.map((token) => token.metadataUri) },
    ravioliDependency: {
      schema: "pastaprotocol-gnocchi-ravioli-dependency@1",
      contractAddress: GNOCCHI,
      administrator: CREATOR,
      script: {
        artifactPath: "artifacts/gnocchi-current-contract-code.json",
        artifactSha256: gnocchiScriptSha256,
        artifactCodeSha256: gnocchiScriptCodeSha256,
        onChainCodeSha256: gnocchiScriptCodeSha256,
        exactMatch: true,
      },
      limitedEdition: {
        tokenId: 2,
        metadataUri: gnocchiTokens[2].metadataUri,
        policy: {
          active: true,
          start: "2026-07-22T11:00:00.000Z",
          end: "2026-07-29T12:00:00.000Z",
          maxSupply: 4,
          policyLocked: true,
        },
        baseline: { totalSupply: 3, totalMinted: 3, totalReserved: 0, remainingMintable: 1 },
        allocation: {
          availableAmount: 1,
          ravioliWrapperMustBeLimitedEdition: true,
          wrapperSaleEndMustBeNoLaterThan: "2026-07-29T12:00:00.000Z",
          recommendedRavioliSaleEnd: "2026-07-29T11:00:00.000Z",
        },
      },
    },
  };
  const gnocchiReceiptPath = path.join(gnocchiRoot, FRESH_GNOCCHI_RECEIPT_PATH);
  const gnocchiReceiptSha256 = await writeJson(gnocchiReceiptPath, gnocchiReceipt);
  const gnocchiReceiptArtifact = {
    id: "ui-live-run-receipt",
    kind: "run-receipt",
    path: FRESH_GNOCCHI_RECEIPT_PATH,
    sha256: gnocchiReceiptSha256,
  };
  const gnocchiManifest: JsonObject = {
    schema: "pastaprotocol-app-proof@1",
    app: "gnocchi",
    role: "token-publisher",
    runId: RUN_ID,
    network: { name: "shadownet", chainId: FRESH_RAVIOLI_CHAIN_ID },
    artifacts: [...gnocchiPins, gnocchiCodeArtifact, gnocchiReceiptArtifact],
    contracts: [{ address: GNOCCHI, kind: "open-edition-collection" }],
    operations: [{ kind: "origination", hash: GNOCCHI_ORIGIN, contractAddress: GNOCCHI, status: "applied" }],
    tokens: gnocchiTokens,
  };
  const gnocchiManifestPath = path.join(gnocchiRoot, "manifest.json");
  await writeJson(gnocchiManifestPath, gnocchiManifest);

  const rotiniPins: JsonObject[] = [];
  const rotiniTokens: JsonObject[] = [];
  const modes = ["png", "gif", "zip"] as const;
  for (let tokenId = 0; tokenId < 3; tokenId += 1) {
    const artifactUri = ipfs(`rotiniartifact${tokenId}`);
    const metadataUri = ipfs(`rotinimetadata${tokenId}`);
    const media = await writeArtifact({
      appRoot: rotiniRoot,
      id: `pin-${tokenId}-token-media`,
      kind: "token-media",
      relativePath: `artifacts/pins/rotini-${tokenId}.${modes[tokenId]}`,
      value: Buffer.from(`rotini-media-${tokenId}`),
      ipfsUri: artifactUri,
      fileName: `rotini-${tokenId}.${modes[tokenId]}`,
      actor: "collector",
    });
    const metadata = await writeArtifact({
      appRoot: rotiniRoot,
      id: `pin-${tokenId}-token-metadata`,
      kind: "token-metadata",
      relativePath: `artifacts/pins/rotini-${tokenId}.json`,
      value: { name: `Rotini ${tokenId}`, artifactUri },
      ipfsUri: metadataUri,
      fileName: `rotini-${tokenId}.json`,
      actor: "collector",
    });
    rotiniPins.push(media, metadata);
    rotiniTokens.push(manifestToken({ app: "rotini", contractAddress: ROTINI, tokenId, metadataArtifact: metadata, mediaArtifact: media }));
  }
  const rotiniProjects = modes.map((mode, projectId) => ({
    projectId,
    outputMode: mode,
    mimeType: projectId === 0 ? "image/png" : projectId === 1 ? "image/gif" : "application/zip",
    priceMutez: projectId === 0 ? 0 : 1,
    maxSupply: 4,
    minted: 1,
    reserved: 0,
    remainingReservable: 3,
    ravioliPackCompatible: projectId === 0,
  }));
  const tzktEvidence: JsonObject = {
    schema: "pastaprotocol-rotini-tzkt-index@1",
    contractAddress: ROTINI,
    storage: { nextProjectId: 3, nextTokenId: 3 },
    projects: rotiniProjects.map((project) => ({
      key: project.projectId,
      value: {
        active: true,
        price: project.priceMutez,
        max_supply: project.maxSupply,
        minted: project.minted,
        reserved: project.reserved,
      },
    })),
    ravioliCompatibility: {
      projectId: 0,
      outputMode: "png",
      priceMutez: 0,
      maxSupply: 4,
      minted: 1,
      reserved: 0,
      remainingReservable: 3,
    },
  };
  const tzktPath = "artifacts/rotini-ui-live-tzkt-index.json";
  const tzktSha256 = await writeJson(path.join(rotiniRoot, tzktPath), tzktEvidence);
  const tzktArtifact = {
    id: "rotini-ui-live-tzkt-index",
    kind: "indexer-evidence",
    path: tzktPath,
    sha256: tzktSha256,
  };
  const rotiniCodeArtifact = await writeArtifact({
    appRoot: rotiniRoot,
    id: "rotini-current-contract-code",
    kind: "contract-code",
    relativePath: "artifacts/rotini-current-contract-code.json",
    value: rotiniScriptBytes,
  });
  const rotiniReceipt: JsonObject = {
    schema: "pastaprotocol-rotini-ui-live-run@1",
    classification: "UI-LIVE",
    network: { name: "shadownet", chainId: FRESH_RAVIOLI_CHAIN_ID },
    actors: { creator: CREATOR, collector: "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej", independent: true },
    contract: {
      address: ROTINI,
      explorerUrl: `https://shadownet.tzkt.io/${ROTINI}`,
      scriptSha256: rotiniScriptSha256,
    },
    projects: rotiniProjects,
    tokens: rotiniTokens,
    bridgeReceipts: {
      creator: [{
        action: "originate",
        operationHash: ROTINI_ORIGIN,
        contractAddress: ROTINI,
        signerAddress: CREATOR,
        chainId: FRESH_RAVIOLI_CHAIN_ID,
      }],
      collector: [],
    },
    pins: rotiniPins,
    tzktEvidence: { path: tzktPath, sha256: tzktSha256 },
    ravioliDependency: {
      schema: "pastaprotocol-rotini-ravioli-dependency@1",
      contractAddress: ROTINI,
      administrator: CREATOR,
      script: {
        artifactPath: "artifacts/rotini-current-contract-code.json",
        artifactSha256: rotiniScriptSha256,
        artifactCodeSha256: rotiniScriptCodeSha256,
        onChainCodeSha256: rotiniScriptCodeSha256,
        exactMatch: true,
      },
      project: { projectId: 0, active: true, outputMode: "png", priceMutez: 0, maxSupply: 4 },
      baseline: { minted: 1, reserved: 0, remainingReservable: 3, nextTokenId: 3, existingTokenIds: [0, 1, 2] },
      generatedAtOpen: { availableActions: 3, requiresActionIndex: true },
    },
  };
  const rotiniReceiptPath = path.join(rotiniRoot, FRESH_ROTINI_RECEIPT_PATH);
  const rotiniReceiptSha256 = await writeJson(rotiniReceiptPath, rotiniReceipt);
  const rotiniReceiptArtifact = {
    id: "rotini-ui-live-run",
    kind: "proof-receipt",
    path: FRESH_ROTINI_RECEIPT_PATH,
    sha256: rotiniReceiptSha256,
  };
  const rotiniManifest: JsonObject = {
    schema: "pastaprotocol-app-proof@1",
    app: "rotini",
    role: "token-publisher",
    runId: RUN_ID,
    network: { name: "shadownet", chainId: FRESH_RAVIOLI_CHAIN_ID },
    artifacts: [...rotiniPins, rotiniCodeArtifact, tzktArtifact, rotiniReceiptArtifact],
    contracts: [{ address: ROTINI, kind: "generative-collection" }],
    operations: [{ kind: "origination", hash: ROTINI_ORIGIN, contractAddress: ROTINI, status: "applied" }],
    tokens: rotiniTokens,
  };
  const rotiniManifestPath = path.join(rotiniRoot, "manifest.json");
  await writeJson(rotiniManifestPath, rotiniManifest);

  return {
    tempRoot,
    runRoot,
    gnocchiManifestPath,
    gnocchiReceiptPath,
    rotiniManifestPath,
    rotiniReceiptPath,
    gnocchiMediaPath: path.join(gnocchiRoot, "artifacts/token-0-media.png"),
  };
}

async function convertGnocchiFixtureToRecovered(fixture: Fixture): Promise<void> {
  const gnocchiRoot = path.join(fixture.runRoot, "gnocchi");
  const nativeReceipt = await readJson(fixture.gnocchiReceiptPath);
  const manifest = await readJson(fixture.gnocchiManifestPath);
  const screenshots: JsonObject[] = [];
  const sidecarReferences: JsonObject[] = [];
  const sidecarArtifacts: JsonObject[] = [];
  for (let index = 0; index < 19; index += 1) {
    const ordinal = index + 1;
    const stage = `${String(ordinal).padStart(3, "0")}-recovered-stage-${ordinal}`;
    const screenshotPath = `screenshots/${stage}.png`;
    const screenshotBytes = Buffer.from(`recovered-screenshot-${ordinal}`);
    await mkdir(path.join(gnocchiRoot, "screenshots"), { recursive: true });
    await writeFile(path.join(gnocchiRoot, screenshotPath), screenshotBytes);
    const screenshot = {
      caption: `gnocchi: recovered fixture — Stage ${ordinal}`,
      path: screenshotPath,
      sha256: sha256(screenshotBytes),
      stage,
    };
    const sidecar = {
      schema: "pastaprotocol-screenshot-evidence@1",
      app: "gnocchi",
      capability: "recovered fixture",
      stageOrdinal: ordinal,
      stageName: `Stage ${ordinal}`,
      classification: "UI-LIVE",
      sha256: screenshot.sha256,
      byteCount: screenshotBytes.byteLength,
      timestampUtc: new Date(Date.parse("2026-07-23T01:10:00.000Z") + index * 1_000).toISOString(),
      domEvidence: [{ selector: "#fixture", matchCount: 1, selectedIndex: 0, text: `stage ${ordinal}` }],
    };
    const sidecarArtifact = await writeArtifact({
      appRoot: gnocchiRoot,
      id: `screenshot-sidecar-${stage}`,
      kind: "screenshot-sidecar",
      relativePath: `artifacts/screenshot-${stage}.json`,
      value: sidecar,
    });
    screenshots.push(screenshot);
    sidecarReferences.push({
      id: sidecarArtifact.id,
      kind: sidecarArtifact.kind,
      path: sidecarArtifact.path,
      sha256: sidecarArtifact.sha256,
    });
    sidecarArtifacts.push(sidecarArtifact);
  }

  const entrypoints: Array<string | undefined> = [
    undefined,
    "create_open_edition", "create_open_edition", "create_open_edition",
    "open_mint", "open_mint", "open_mint",
    "set_sale_active", "set_sale_active",
    "open_mint", "open_mint", "open_mint",
  ];
  const indexedOperationReceipts = entrypoints.map((entrypoint, index) => {
    const signerAddress = index === 0 || (index >= 1 && index <= 3) || (index >= 7 && index <= 8)
      ? CREATOR
      : index <= 6
        ? nativeReceipt.actors.collectorOne
        : nativeReceipt.actors.collectorTwo;
    return {
      schema: "pastaprotocol-indexed-operation-receipt@1",
      source: "tzkt",
      action: index === 0 ? "originate" : "call",
      chainId: FRESH_RAVIOLI_CHAIN_ID,
      signerAddress,
      timestampUtc: new Date(Date.parse("2026-07-23T01:10:00.000Z") + index * 30_000).toISOString(),
      operationHash: RECOVERED_GNOCCHI_HASHES[index],
      contractAddress: GNOCCHI,
      status: "applied",
      level: 4310129 + index * 4,
      counter: index === 0 ? null : 1_000 + index,
      ...(entrypoint ? { entrypoints: [entrypoint] } : {}),
    };
  });
  const manifestOperations = indexedOperationReceipts.map((receipt) => {
    const entrypoint = receipt.entrypoints?.[0];
    return {
      kind: receipt.action === "originate"
        ? "origination"
        : entrypoint === "create_open_edition"
          ? "create"
          : entrypoint === "open_mint"
            ? "mint"
            : "manage",
      hash: receipt.operationHash,
      contractAddress: GNOCCHI,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
    };
  });
  const reconciliation = {
    schema: "pastaprotocol-gnocchi-chain-reconciliation@1",
    classification: "UI-LIVE-READ-ONLY-FINALIZATION",
    status: "RECOVERED",
    runId: RUN_ID,
    contract: { address: GNOCCHI },
    operations: indexedOperationReceipts,
  };
  const reconciliationArtifact = await writeArtifact({
    appRoot: gnocchiRoot,
    id: "gnocchi-chain-reconciliation-snapshot",
    kind: "chain-reconciliation-snapshot",
    relativePath: "artifacts/gnocchi-chain-reconciliation-snapshot.json",
    value: reconciliation,
  });
  const recoveredReceipt: JsonObject = {
    schema: "pastaprotocol-gnocchi-ui-live-finalized@1",
    classification: "UI-LIVE-READ-ONLY-FINALIZATION",
    status: "RECOVERED",
    runId: RUN_ID,
    network: "shadownet",
    chainId: FRESH_RAVIOLI_CHAIN_ID,
    actors: nativeReceipt.actors,
    contract: nativeReceipt.contract,
    originalBridgeReceiptStream: { available: false, synthesized: false, reason: "fixture" },
    fundingEvidence: { available: false, synthesized: false },
    sideEffects: { signerMaterialLoaded: false, chainWrites: 0, ipfsWrites: 0, httpMethods: ["GET"] },
    indexedOperationReceipts,
    contentArtifacts: nativeReceipt.pins,
    indexed: nativeReceipt.indexed,
    ravioliDependency: nativeReceipt.ravioliDependency,
    screenshots,
    screenshotSidecars: sidecarReferences,
    chainReconciliation: {
      id: reconciliationArtifact.id,
      kind: reconciliationArtifact.kind,
      path: reconciliationArtifact.path,
      sha256: reconciliationArtifact.sha256,
    },
  };
  const recoveredReceiptPath = path.join(gnocchiRoot, FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH);
  const recoveredReceiptSha256 = await writeJson(recoveredReceiptPath, recoveredReceipt);
  await unlink(fixture.gnocchiReceiptPath);
  manifest.classification = "UI-LIVE-READ-ONLY-FINALIZATION";
  manifest.screenshots = screenshots;
  manifest.operations = manifestOperations;
  manifest.artifacts = manifest.artifacts.filter((artifact: JsonObject) => artifact.id !== "ui-live-run-receipt");
  manifest.artifacts.push(
    reconciliationArtifact,
    {
      id: "ui-live-readonly-finalization",
      kind: "readonly-finalization-receipt",
      path: FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH,
      sha256: recoveredReceiptSha256,
    },
    ...sidecarArtifacts,
  );
  await writeJson(fixture.gnocchiManifestPath, manifest);
  fixture.gnocchiReceiptPath = recoveredReceiptPath;
}

async function convertGnocchiFixtureToCheckpointedRecovered(
  fixture: Fixture,
  profileName: "legacy" | "current" = "legacy",
): Promise<void> {
  await convertGnocchiFixtureToRecovered(fixture);
  const gnocchiRoot = path.join(fixture.runRoot, "gnocchi");
  const manifest = await readJson(fixture.gnocchiManifestPath);
  const recoveredReceipt = await readJson(fixture.gnocchiReceiptPath);
  const reconciliationBinding = manifest.artifacts.find(
    (artifact: JsonObject) => artifact.path === recoveredReceipt.chainReconciliation.path,
  );
  assert.ok(reconciliationBinding);
  const reconciliationPath = path.join(gnocchiRoot, reconciliationBinding.path);
  const reconciliation = await readJson(reconciliationPath);
  const operationHashes = recoveredReceipt.indexedOperationReceipts.map(
    (operation: JsonObject) => operation.operationHash,
  );
  const profile = profileName === "legacy"
    ? {
      interruption: {
        code: "POST_CONFIRMATION_READ_STORAGE_HTTP_500",
        stage: "after-token-one-before-screenshot-seven",
      },
      recoveredOperations: 3,
      liveOperations: 9,
      recoveredContentIds: new Set(["token-0-media", "collection-metadata", "token-0-metadata", "token-1-media", "token-1-metadata"]),
      nativeContentIds: ["token-2-media", "token-2-metadata"],
      screenshotStart: 7,
      phases: [
        "SCREENSHOT_ACCEPTED",
        "PIN_PREPARED", "PIN_CONFIRMED", "PIN_PREPARED", "PIN_CONFIRMED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "EXPECTED_REJECTION", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "EXPECTED_REJECTION", "SCREENSHOT_ACCEPTED",
      ],
    }
    : {
      interruption: {
        code: "POST_CONFIRMATION_SCREENSHOT_RESOURCE_HTTP_500",
        stage: "after-collector-one-token-one-before-screenshot-eleven",
      },
      recoveredOperations: 6,
      liveOperations: 6,
      recoveredContentIds: new Set([
        "token-0-media", "collection-metadata", "token-0-metadata", "token-1-media",
        "token-1-metadata", "token-2-media", "token-2-metadata",
      ]),
      nativeContentIds: [],
      screenshotStart: 11,
      phases: [
        "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "EXPECTED_REJECTION", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "PREPARED", "SUBMITTED", "APPLIED", "SCREENSHOT_ACCEPTED",
        "EXPECTED_REJECTION", "SCREENSHOT_ACCEPTED",
      ],
    };
  const interruption = profile.interruption;
  const intentSeed: JsonObject = {
    schema: "pastaprotocol-gnocchi-current-recovery-intent@1",
    status: "IMMUTABLE",
    runId: RUN_ID,
    network: {
      name: "shadownet",
      chainId: FRESH_RAVIOLI_CHAIN_ID,
    },
    contract: { address: GNOCCHI },
    interruption: {
      ...interruption,
      chainMutationApplied: true,
      ordinaryRerunForbidden: true,
    },
    prefix: { fixture: true },
    recoveredPrefix: { fixture: true },
    remainingOperationMatrix: [],
    expectedNewPins: [],
  };
  const checkpointId = sha256(deterministicJsonBytes(intentSeed));
  const intent = { ...intentSeed, checkpointId };
  const intentArtifact = await writeArtifact({
    appRoot: gnocchiRoot,
    id: `gnocchi-recovery-intent-${checkpointId.slice(0, 12)}`,
    kind: "durable-recovery-intent",
    relativePath: "artifacts/gnocchi-current-recovery/intent.json",
    value: intent,
    durability: "package-only",
  });

  const finalContent = recoveredReceipt.contentArtifacts as JsonObject[];
  const recoveredContent = finalContent.filter((record) => profile.recoveredContentIds.has(String(record.id))).map((record) => ({
    id: record.id,
    sha256: record.sha256,
    uri: record.ipfsUri,
    provenance: "recovered-on-chain-reference",
  }));
  const nativeContent = profile.nativeContentIds.map((id) => {
    const record = finalContent.find((candidate) => candidate.id === id);
    assert.ok(record);
    return {
    id: record.id,
    sha256: record.sha256,
    uri: record.ipfsUri,
    provenance: "native-ui-live-pin",
    };
  });
  const durablePinArtifacts: JsonObject[] = [];
  for (const [index, content] of nativeContent.entries()) {
    const finalRecord = finalContent.find((record) => record.id === content.id);
    assert.ok(finalRecord);
    const bytes = await readFile(path.join(gnocchiRoot, finalRecord.path));
    durablePinArtifacts.push(await writeArtifact({
      appRoot: gnocchiRoot,
      id: `gnocchi-recovery-pin-${index + 1}-${String(content.id)}`,
      kind: "durable-recovery-pin-bytes",
      relativePath: `artifacts/gnocchi-current-recovery/pins/00${index + 1}-${String(content.id)}${index === 0 ? ".png" : ".json"}`,
      value: bytes,
      durability: "package-only",
    }));
  }

  const phases = profile.phases;
  const eventArtifacts: JsonObject[] = [];
  let previousRecordSha256 = intentArtifact.sha256;
  let continuationIndex = 0;
  let screenshotOrdinal = profile.screenshotStart;
  let rejectionIndex = 0;
  for (const [index, phase] of phases.entries()) {
    const event: JsonObject = {
      schema: "pastaprotocol-gnocchi-current-recovery-event@1",
      checkpointId,
      eventIndex: index + 1,
      phase,
      previousRecordSha256,
      timestampUtc: new Date(Date.parse("2026-07-23T02:00:00.000Z") + index * 1_000).toISOString(),
    };
    if (phase === "SUBMITTED" || phase === "APPLIED") {
      event.operationHash = operationHashes[continuationIndex + profile.recoveredOperations];
      if (phase === "APPLIED") continuationIndex += 1;
    } else if (phase === "SCREENSHOT_ACCEPTED") {
      event.stageOrdinal = screenshotOrdinal;
      screenshotOrdinal += 1;
    } else if (phase === "EXPECTED_REJECTION") {
      const expected = rejectionIndex === 0
        ? { tokenId: 1, reason: "this sale is paused", transactionCount: 7 }
        : { tokenId: 2, reason: "not enough supply left", transactionCount: 11 };
      event.tokenId = expected.tokenId;
      event.reason = expected.reason;
      event.transactionCountBefore = expected.transactionCount;
      event.transactionCountAfter = expected.transactionCount;
      rejectionIndex += 1;
    }
    const slug = phase.toLowerCase().replaceAll("_", "-");
    const artifact = await writeArtifact({
      appRoot: gnocchiRoot,
      id: `gnocchi-recovery-event-${String(index + 1).padStart(6, "0")}`,
      kind: "durable-recovery-event",
      relativePath: `artifacts/gnocchi-current-recovery/events/${String(index + 1).padStart(6, "0")}-${slug}.json`,
      value: event,
      durability: "package-only",
    });
    eventArtifacts.push(artifact);
    previousRecordSha256 = artifact.sha256;
  }

  const terminal = {
    schema: "pastaprotocol-gnocchi-current-recovery-terminal-chain@1",
    network: "shadownet",
    chainId: FRESH_RAVIOLI_CHAIN_ID,
    contract: GNOCCHI,
    operationHashes,
  };
  const terminalArtifact = await writeArtifact({
    appRoot: gnocchiRoot,
    id: "gnocchi-recovery-terminal",
    kind: "chain-reconciliation-source",
    relativePath: "artifacts/gnocchi-current-recovery/terminal-chain.json",
    value: terminal,
    durability: "package-only",
  });
  const checkpointFinal = {
    schema: "pastaprotocol-gnocchi-current-recovery-checkpoint-final@1",
    status: "FINALIZED",
    checkpointId,
    events: phases.length,
    pins: nativeContent.length,
    recoveredOperations: profile.recoveredOperations,
    liveOperations: profile.liveOperations,
    finalRecordSha256: previousRecordSha256,
    intentSha256: intentArtifact.sha256,
    terminalSha256: terminalArtifact.sha256,
  };
  const checkpointArtifact = await writeArtifact({
    appRoot: gnocchiRoot,
    id: "gnocchi-recovery-final-checkpoint",
    kind: "durable-recovery-finalization",
    relativePath: "artifacts/gnocchi-current-recovery/final.json",
    value: checkpointFinal,
    durability: "package-only",
  });
  const recovery = {
    interruption: {
      ...interruption,
      recoveredWithoutReplayingAppliedPrefix: true,
    },
    checkpoint: {
      checkpointId,
      events: phases.length,
      pins: nativeContent.length,
      recoveredOperations: profile.recoveredOperations,
      liveOperations: profile.liveOperations,
      finalArtifactSha256: checkpointArtifact.sha256,
      finalRecordSha256: previousRecordSha256,
      intentSha256: intentArtifact.sha256,
      terminalSha256: terminalArtifact.sha256,
    },
    provenance: {
      replayedAppliedOperations: 0,
      recoveredContentObjects: recoveredContent.length,
      nativeContinuationContentObjects: nativeContent.length,
      recoveredPrefixOperations: operationHashes.slice(0, profile.recoveredOperations),
      nativeContinuationOperations: operationHashes.slice(profile.recoveredOperations),
    },
  };
  const recoveryReceipt = {
    schema: "pastaprotocol-gnocchi-current-recovery@1",
    classification: "UI-LIVE-RECOVERED-CHECKPOINTED",
    status: "PASSED",
    runId: RUN_ID,
    network: "shadownet",
    chainId: FRESH_RAVIOLI_CHAIN_ID,
    contract: { address: GNOCCHI },
    interruption: recovery.interruption,
    checkpoint: {
      ...recovery.checkpoint,
      schema: checkpointFinal.schema,
      status: checkpointFinal.status,
    },
    prefix: {
      recoveredOperations: operationHashes.slice(0, profile.recoveredOperations).map((hash: string) => ({ hash })),
      recoveredContent,
      ...(profileName === "current"
        ? { preservedScreenshots: Array.from({ length: profile.screenshotStart - 1 }, (_, index) => index + 1) }
        : {}),
    },
    continuation: {
      liveOperationOrdinals: Array.from(
        { length: profile.liveOperations },
        (_, index) => index + profile.recoveredOperations + 1,
      ),
      newContent: nativeContent,
    },
    terminalChain: {
      path: terminalArtifact.path,
      sha256: terminalArtifact.sha256,
      operationHashes,
    },
  };
  const recoveryReceiptArtifact = await writeArtifact({
    appRoot: gnocchiRoot,
    id: "gnocchi-recovery-receipt",
    kind: "ui-live-recovery-receipt",
    relativePath: "artifacts/gnocchi-current-recovery-final.json",
    value: recoveryReceipt,
    durability: "package-only",
  });

  reconciliation.classification = "UI-LIVE-RECOVERED-CHECKPOINTED";
  reconciliation.originalFailure = {
    code: interruption.code,
    stage: interruption.stage,
    bridgeReceiptStreamAvailable: false,
    bridgeReceiptStreamSynthesized: false,
  };
  reconciliation.recovery = recovery;
  const reconciliationSha256 = await writeJson(reconciliationPath, reconciliation);
  reconciliationBinding.sha256 = reconciliationSha256;
  if ("retrievedSha256" in reconciliationBinding) reconciliationBinding.retrievedSha256 = reconciliationSha256;
  recoveredReceipt.classification = "UI-LIVE-RECOVERED-CHECKPOINTED";
  recoveredReceipt.recovery = recovery;
  recoveredReceipt.chainReconciliation.sha256 = reconciliationSha256;
  const recoveredReceiptSha256 = await writeJson(fixture.gnocchiReceiptPath, recoveredReceipt);
  const recoveredReceiptBinding = manifest.artifacts.find(
    (artifact: JsonObject) => artifact.path === FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH,
  );
  assert.ok(recoveredReceiptBinding);
  recoveredReceiptBinding.sha256 = recoveredReceiptSha256;
  if ("retrievedSha256" in recoveredReceiptBinding) recoveredReceiptBinding.retrievedSha256 = recoveredReceiptSha256;
  manifest.classification = "UI-LIVE-RECOVERED-CHECKPOINTED";
  manifest.artifacts.push(
    recoveryReceiptArtifact,
    intentArtifact,
    ...eventArtifacts,
    ...durablePinArtifacts,
    checkpointArtifact,
    terminalArtifact,
  );
  await writeJson(fixture.gnocchiManifestPath, manifest);
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function mutateManifest(filePath: string, mutate: (manifest: JsonObject) => void): Promise<void> {
  const manifest = await readJson(filePath);
  mutate(manifest);
  await writeJson(filePath, manifest);
}

async function mutateReceipt(
  manifestPath: string,
  receiptPath: string,
  mutate: (receipt: JsonObject) => void,
): Promise<void> {
  const receipt = await readJson(receiptPath);
  mutate(receipt);
  const digest = await writeJson(receiptPath, receipt);
  await mutateManifest(manifestPath, (manifest) => {
    const binding = manifest.artifacts.find((artifact: JsonObject) =>
      path.basename(artifact.path) === path.basename(receiptPath)
    );
    assert.ok(binding);
    binding.sha256 = digest;
    if ("retrievedSha256" in binding) binding.retrievedSha256 = digest;
  });
}

async function mutateBoundJsonArtifact(input: {
  appRoot: string;
  manifestPath: string;
  relativePath: string;
  mutate: (value: JsonObject) => void;
}): Promise<void> {
  const artifactPath = path.join(input.appRoot, input.relativePath);
  const value = await readJson(artifactPath);
  input.mutate(value);
  const digest = await writeJson(artifactPath, value);
  await mutateManifest(input.manifestPath, (manifest) => {
    const binding = manifest.artifacts.find((artifact: JsonObject) => artifact.path === input.relativePath);
    assert.ok(binding, `missing manifest binding for ${input.relativePath}`);
    binding.sha256 = digest;
    if ("retrievedSha256" in binding) binding.retrievedSha256 = digest;
  });
}

async function relabelCheckpointedFixtureAsHistorical(fixture: Fixture): Promise<void> {
  const gnocchiRoot = path.join(fixture.runRoot, "gnocchi");
  const manifest = await readJson(fixture.gnocchiManifestPath);
  const receipt = await readJson(fixture.gnocchiReceiptPath);
  const reconciliationPath = path.join(gnocchiRoot, receipt.chainReconciliation.path);
  const reconciliation = await readJson(reconciliationPath);
  reconciliation.classification = "UI-LIVE-READ-ONLY-FINALIZATION";
  const reconciliationSha256 = await writeJson(reconciliationPath, reconciliation);
  receipt.classification = "UI-LIVE-READ-ONLY-FINALIZATION";
  receipt.chainReconciliation.sha256 = reconciliationSha256;
  const receiptSha256 = await writeJson(fixture.gnocchiReceiptPath, receipt);
  manifest.classification = "UI-LIVE-READ-ONLY-FINALIZATION";
  const reconciliationBinding = manifest.artifacts.find(
    (artifact: JsonObject) => artifact.path === receipt.chainReconciliation.path,
  );
  const receiptBinding = manifest.artifacts.find(
    (artifact: JsonObject) => artifact.path === FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH,
  );
  assert.ok(reconciliationBinding);
  assert.ok(receiptBinding);
  reconciliationBinding.sha256 = reconciliationSha256;
  if ("retrievedSha256" in reconciliationBinding) reconciliationBinding.retrievedSha256 = reconciliationSha256;
  receiptBinding.sha256 = receiptSha256;
  if ("retrievedSha256" in receiptBinding) receiptBinding.retrievedSha256 = receiptSha256;
  await writeJson(fixture.gnocchiManifestPath, manifest);
}

async function loadFixture(fixture: Fixture): Promise<FreshRavioliDependencies> {
  return loadFreshRavioliDependencies({
    runRoot: fixture.runRoot,
    expectedRunId: RUN_ID,
    expectedCreator: CREATOR,
  });
}

function liveSnapshots(evidence: FreshRavioliDependencies): {
  gnocchi: FreshGnocchiLiveSnapshot;
  rotini: FreshRotiniLiveSnapshot;
} {
  return {
    gnocchi: {
      chainId: FRESH_RAVIOLI_CHAIN_ID,
      contractAddress: evidence.gnocchi.contractAddress,
      scriptSha256: evidence.gnocchi.scriptSha256,
      scriptCodeSha256: evidence.gnocchi.scriptCodeSha256,
      administrator: evidence.creator,
      nextTokenId: 3,
      tokenMetadataUris: {
        "0": evidence.gnocchi.tokens[0].metadataUri,
        "1": evidence.gnocchi.tokens[1].metadataUri,
        "2": evidence.gnocchi.tokens[2].metadataUri,
      },
      creatorEscrowBalances: { "0": 2, "1": 2 },
      token2: {
        active: true,
        start: evidence.gnocchi.token2LimitedEdition.start,
        end: evidence.gnocchi.token2LimitedEdition.end,
        maxSupply: 4,
        policyLocked: true,
        totalMinted: 3,
        totalReserved: 0,
      },
      activeOperators: [],
      authorizedMinters: [],
      reservedMints: [],
    },
    rotini: {
      chainId: FRESH_RAVIOLI_CHAIN_ID,
      contractAddress: evidence.rotini.contractAddress,
      scriptSha256: evidence.rotini.scriptSha256,
      scriptCodeSha256: evidence.rotini.scriptCodeSha256,
      administrator: evidence.creator,
      nextProjectId: 3,
      nextTokenId: 3,
      project0: {
        active: true,
        outputMode: "png",
        priceMutez: 0,
        maxSupply: 4,
        minted: 1,
        reserved: 0,
      },
      activeOperators: [],
      authorizedPackMinters: [],
      openReservations: [],
      packReservations: [],
    },
  };
}

function mode0RecoveryOperatorRow(overrides: JsonObject = {}): JsonObject {
  return {
    id: 300_735,
    active: true,
    hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY1H",
    key: {
      owner: CREATOR,
      operator: RAVIOLI_ROUTER,
      token_id: "0",
    },
    value: {},
    firstLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    lastLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    updates: 1,
    ...overrides,
  };
}

function currentV3RecoveryOperatorRows(): JsonObject[] {
  return [
    mode0RecoveryOperatorRow({
      lastLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
      updates: 2,
    }),
    mode0RecoveryOperatorRow({
      id: 300_736,
      hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY2H",
      key: {
        owner: CREATOR,
        operator: RAVIOLI_ROUTER,
        token_id: "1",
      },
      firstLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
      lastLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
      updates: 1,
    }),
  ];
}

function currentV6MinterRow(overrides: JsonObject = {}): JsonObject {
  return {
    id: 300_737,
    active: true,
    hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY3H",
    key: GNOCCHI_ADAPTER,
    value: {},
    firstLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
    lastLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
    updates: 1,
    ...overrides,
  };
}

function currentV6ReservationRow(overrides: JsonObject = {}): JsonObject {
  return {
    id: 300_738,
    active: true,
    hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY4H",
    key: { owner: GNOCCHI_ADAPTER, token_id: "2" },
    value: "1",
    firstLevel: RAVIOLI_RESERVATION_APPLIED_LEVEL,
    lastLevel: RAVIOLI_RESERVATION_APPLIED_LEVEL,
    updates: 1,
    ...overrides,
  };
}

function currentRotiniPackMinterRow(overrides: JsonObject = {}): JsonObject {
  return {
    id: 300_739,
    active: true,
    hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY5H",
    key: ROTINI_ADAPTER,
    value: {},
    firstLevel: RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    lastLevel: RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    updates: 1,
    ...overrides,
  };
}

function currentRotiniPackReservationRow(overrides: JsonObject = {}): JsonObject {
  return {
    id: 300_740,
    active: true,
    hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY6H",
    key: { owner: ROTINI_ADAPTER, token_id: "0" },
    value: "2",
    firstLevel: RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL,
    lastLevel: RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL,
    updates: 2,
    ...overrides,
  };
}

function currentOp55OperatorRows(): JsonObject[] {
  return [
    mode0RecoveryOperatorRow({
      firstLevel: RAVIOLI_OP55_MODE0_APPLIED_LEVEL,
      lastLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
      updates: 2,
    }),
    mode0RecoveryOperatorRow({
      id: 300_741,
      hash: "expru5C4UJ16tkud9qEnqC9oH1F82RecdCSkzssAyNdaMH6tXVAY7H",
      key: {
        owner: CREATOR,
        operator: RAVIOLI_ROUTER,
        token_id: "1",
      },
      firstLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
      lastLevel: RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL,
      updates: 2,
    }),
  ];
}

function currentOp55MinterRow(overrides: JsonObject = {}): JsonObject {
  return currentV6MinterRow({
    firstLevel: RAVIOLI_OP55_MINTER_APPLIED_LEVEL,
    lastLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL,
    updates: 2,
    ...overrides,
  });
}

function currentOp63MinterRow(overrides: JsonObject = {}): JsonObject {
  return currentOp55MinterRow({
    lastLevel: RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL,
    updates: 3,
    ...overrides,
  });
}

function currentOp63ReservedMintRow(overrides: JsonObject = {}): JsonObject {
  return {
    id: 324_410,
    active: true,
    hash: "expruzyVX1ax9X3q8g36JTaYzYajziuSK37iX55aDsnPUUtjkjU27k",
    key: { owner: GNOCCHI_ADAPTER, token_id: "1" },
    value: "2",
    firstLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL,
    lastLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL,
    updates: 4,
    ...overrides,
  };
}

function currentOp55RotiniPackMinterRow(overrides: JsonObject = {}): JsonObject {
  return currentRotiniPackMinterRow({
    firstLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    lastLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    updates: 2,
    ...overrides,
  });
}

test("loads only exact same-run Gnocchi and Rotini UI-live evidence", async (t) => {
  const fixture = await createFixture(t);
  const loaded = await loadFixture(fixture);
  assert.equal(loaded.schema, FRESH_RAVIOLI_DEPENDENCY_SCHEMA);
  assert.equal(loaded.runRoot, await realpath(fixture.runRoot));
  assert.equal(loaded.creator, CREATOR);
  assert.deepEqual(loaded.gnocchi.tokens.map((token) => token.tokenId), [0, 1, 2]);
  assert.equal(loaded.gnocchi.tokens[2].metadataArtifact.kind, "token-metadata");
  assert.equal(loaded.gnocchi.tokens[2].mediaArtifact.kind, "token-media");
  assert.deepEqual(loaded.gnocchi.token2LimitedEdition, {
    tokenId: 2,
    active: true,
    start: "2026-07-22T11:00:00.000Z",
    end: "2026-07-29T12:00:00.000Z",
    maxSupply: 4,
    policyLocked: true,
    totalMinted: 3,
    totalReserved: 0,
    remainingMintable: 1,
    recommendedRavioliSaleEnd: "2026-07-29T11:00:00.000Z",
  });
  assert.deepEqual(loaded.rotini.project0, {
    projectId: 0,
    active: true,
    outputMode: "png",
    mimeType: "image/png",
    priceMutez: 0,
    maxSupply: 4,
    minted: 1,
    reserved: 0,
    remainingReservable: 3,
  });
  assert.equal(loaded.rotini.nextTokenId, 3);
  assert.match(loaded.gnocchi.scriptSha256, /^[0-9a-f]{64}$/);
  assert.match(loaded.rotini.scriptSha256, /^[0-9a-f]{64}$/);
});

test("loads a strict read-only-finalized Gnocchi proof without synthesizing native receipts or pins", async (t) => {
  const fixture = await createFixture(t);
  await convertGnocchiFixtureToRecovered(fixture);
  const loaded = await loadFixture(fixture);
  assert.equal(loaded.gnocchi.receiptPath, await realpath(fixture.gnocchiReceiptPath));
  assert.equal(loaded.gnocchi.originationOperationHash, RECOVERED_GNOCCHI_HASHES[0]);
  assert.equal(loaded.gnocchi.token2LimitedEdition.remainingMintable, 1);
});

test("loads the exact current v2 terminal-recovered Gnocchi proof with canonical lifecycle and portable evidence", async () => {
  const loaded = await loadFreshRavioliDependencies({
    runRoot: CURRENT_V2_SOURCE_ROOT,
    expectedRunId: GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
    expectedCreator: GNOCCHI_TERMINAL_RECOVERY_CREATOR,
  });
  assert.equal(loaded.runId, GNOCCHI_TERMINAL_RECOVERY_RUN_ID);
  assert.equal(loaded.gnocchi.contractAddress, "KT1Pr5GJoiQY8EZeQjmZ4bBy6NDHCLwvFGhv");
  assert.equal(loaded.gnocchi.originationOperationHash, "oouBPx7EvSx68gAxRa8qjQCAyDwSHc2rMBSesJKBDFBUuDAB6ak");
  assert.equal(loaded.gnocchi.token2LimitedEdition.remainingMintable, 1);
});

test("current v2 terminal and portable dependency evidence fails closed on mutation or inventory expansion", async (t) => {
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (fixture: CurrentV2Fixture) => Promise<void>;
  }> = [
    {
      name: "terminal bridge injection",
      expected: /injectedOperations|injected operations/,
      mutate: async (fixture) => mutateCurrentV2TerminalReceipt(
        fixture,
        (receipt) => { receipt.bridge.injectedOperations = 1; },
      ),
    },
    {
      name: "before/after actor-counter drift",
      expected: /actor counters changed/,
      mutate: async (fixture) => mutateCurrentV2TerminalReceipt(
        fixture,
        (receipt) => { receipt.after.actorCounters.collectorTwo += 1; },
      ),
    },
    {
      name: "replayed terminal operation",
      expected: /replayed operations must be 0/,
      mutate: async (fixture) => mutateCurrentV2TerminalReceipt(
        fixture,
        (receipt) => { receipt.operationGraph.replayedOperations = 1; },
      ),
    },
    {
      name: "portable stage copied into canonical lifecycle receipt",
      expected: /lifecycle receipt must bind exactly 19/,
      mutate: async (fixture) => {
        const manifest = await readJson(fixture.gnocchiManifestPath);
        await mutateReceipt(fixture.gnocchiManifestPath, fixture.gnocchiReceiptPath, (receipt) => {
          receipt.screenshots.push(manifest.screenshots[19]);
        });
      },
    },
    {
      name: "portable stages reordered",
      expected: /portable screenshot stages/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
        [manifest.screenshots[19], manifest.screenshots[20]] = [manifest.screenshots[20], manifest.screenshots[19]];
      }),
    },
    {
      name: "unexpected stage 903",
      expected: /must bind exactly 21 screenshots/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
        manifest.screenshots.push({
          caption: "unexpected",
          path: "screenshots/903-unexpected.png",
          sha256: "f".repeat(64),
          stage: "903-unexpected",
        });
      }),
    },
    {
      name: "portable report signer action",
      expected: /signer bridge actions must be 0/,
      mutate: async (fixture) => mutateCurrentV2BoundArtifact({
        fixture,
        relativePath: "artifacts/gnocchi-portable-self-hosted-site-proof.json",
        mutate: (report) => { report.independentRuntime.signerBridgeActions = 1; },
      }),
    },
    {
      name: "portable sidecar ordinal drift",
      expected: /sidecar 901 ordinal must be 901/,
      mutate: async (fixture) => mutateCurrentV2BoundArtifact({
        fixture,
        relativePath: `artifacts/screenshot-${GNOCCHI_PORTABLE_SUPPLEMENT_STAGES[0]}.json`,
        mutate: (sidecar) => { sidecar.stageOrdinal = 903; },
      }),
    },
    {
      name: "unexpected manifest artifact",
      expected: /manifest artifact inventory/,
      mutate: async (fixture) => {
        const relativePath = "artifacts/unexpected-terminal-addition.json";
        const digest = await writeJson(path.join(fixture.gnocchiRoot, relativePath), { unexpected: true });
        await mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
          manifest.artifacts.push({
            id: "unexpected-terminal-addition",
            kind: "unexpected",
            path: relativePath,
            sha256: digest,
          });
        });
      },
    },
    {
      name: "portable ZIP corruption",
      expected: /portable ZIP validation failed|unexpectedly small|not a ZIP/,
      mutate: async (fixture) => {
        const relativePath = "artifacts/gnocchi-portable-self-hosted-site.zip";
        const bytes = Buffer.from("PK-corrupt-portable-site");
        await writeFile(path.join(fixture.gnocchiRoot, relativePath), bytes);
        await mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
          const binding = manifest.artifacts.find((artifact: JsonObject) => artifact.path === relativePath);
          assert.ok(binding);
          binding.sha256 = sha256(bytes);
        });
      },
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async (subtest) => {
      const fixture = await copyCurrentV2Fixture(subtest);
      await current.mutate(fixture);
      await assert.rejects(loadCurrentV2Fixture(fixture), current.expected);
    });
  }
});

test("loads only an exact checkpointed Gnocchi recovery with a 46-event zero-replay continuation", async (t) => {
  const fixture = await createFixture(t);
  await convertGnocchiFixtureToCheckpointedRecovered(fixture);
  const loaded = await loadFixture(fixture);
  assert.equal(loaded.gnocchi.receiptPath, await realpath(fixture.gnocchiReceiptPath));
  assert.equal(loaded.gnocchi.originationOperationHash, RECOVERED_GNOCCHI_HASHES[0]);
  assert.equal(loaded.gnocchi.token2LimitedEdition.remainingMintable, 1);
});

test("loads the exact current Gnocchi six-operation recovery profile", async (t) => {
  const fixture = await createFixture(t);
  await convertGnocchiFixtureToCheckpointedRecovered(fixture, "current");
  const loaded = await loadFixture(fixture);
  assert.equal(loaded.gnocchi.receiptPath, await realpath(fixture.gnocchiReceiptPath));
  assert.equal(loaded.gnocchi.originationOperationHash, RECOVERED_GNOCCHI_HASHES[0]);
  assert.equal(loaded.gnocchi.token2LimitedEdition.remainingMintable, 1);
});

test("current Gnocchi recovery profile fails closed on mixed discriminator and derived partitions", async (t) => {
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (fixture: Fixture) => Promise<void>;
  }> = [
    {
      name: "legacy stage paired with current failure code",
      expected: /must match an authenticated recovery profile/,
      mutate: async (fixture) => mutateReceipt(
        fixture.gnocchiManifestPath,
        fixture.gnocchiReceiptPath,
        (receipt) => { receipt.recovery.interruption.stage = "after-token-one-before-screenshot-seven"; },
      ),
    },
    {
      name: "event-count partition drift",
      expected: /event count must be 29/,
      mutate: async (fixture) => mutateReceipt(
        fixture.gnocchiManifestPath,
        fixture.gnocchiReceiptPath,
        (receipt) => { receipt.recovery.checkpoint.events = 46; },
      ),
    },
    {
      name: "native-content partition drift",
      expected: /native content count must be 0/,
      mutate: async (fixture) => mutateReceipt(
        fixture.gnocchiManifestPath,
        fixture.gnocchiReceiptPath,
        (receipt) => { receipt.recovery.provenance.nativeContinuationContentObjects = 2; },
      ),
    },
    {
      name: "preserved-screenshot partition drift",
      expected: /preserved screenshot ordinals must be exactly 1 through 10/,
      mutate: async (fixture) => mutateBoundJsonArtifact({
        appRoot: path.join(fixture.runRoot, "gnocchi"),
        manifestPath: fixture.gnocchiManifestPath,
        relativePath: "artifacts/gnocchi-current-recovery-final.json",
        mutate: (receipt) => { receipt.prefix.preservedScreenshots.pop(); },
      }),
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async (subtest) => {
      const fixture = await createFixture(subtest);
      await convertGnocchiFixtureToCheckpointedRecovered(fixture, "current");
      await current.mutate(fixture);
      await assert.rejects(loadFixture(fixture), current.expected);
    });
  }
});

test("checkpointed Gnocchi recovery fails closed on downgrade, replay, journal, pin, intent, and disclosure drift", async (t) => {
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (fixture: Fixture) => Promise<void>;
  }> = [
    {
      name: "classification downgrade",
      expected: /must not carry checkpointed recovery evidence/,
      mutate: relabelCheckpointedFixtureAsHistorical,
    },
    {
      name: "replayed applied operation",
      expected: /replayed operation count must be 0/,
      mutate: async (fixture) => mutateReceipt(
        fixture.gnocchiManifestPath,
        fixture.gnocchiReceiptPath,
        (receipt) => { receipt.recovery.provenance.replayedAppliedOperations = 1; },
      ),
    },
    {
      name: "recovered prefix partition drift",
      expected: /recovered prefix operation 2 hash/,
      mutate: async (fixture) => mutateReceipt(
        fixture.gnocchiManifestPath,
        fixture.gnocchiReceiptPath,
        (receipt) => { receipt.recovery.provenance.recoveredPrefixOperations[2] = RECOVERED_GNOCCHI_HASHES[3]; },
      ),
    },
    {
      name: "intermediate journal predecessor drift",
      expected: /event 10 hash-chain predecessor/,
      mutate: async (fixture) => mutateBoundJsonArtifact({
        appRoot: path.join(fixture.runRoot, "gnocchi"),
        manifestPath: fixture.gnocchiManifestPath,
        relativePath: "artifacts/gnocchi-current-recovery/events/000010-screenshot-accepted.json",
        mutate: (event) => { event.previousRecordSha256 = "f".repeat(64); },
      }),
    },
    {
      name: "durable token media pin mismatch",
      expected: /token-2-media durable pin hash/,
      mutate: async (fixture) => {
        const appRoot = path.join(fixture.runRoot, "gnocchi");
        const relativePath = "artifacts/gnocchi-current-recovery/pins/001-token-2-media.png";
        const bytes = Buffer.from("tampered durable pin");
        await writeFile(path.join(appRoot, relativePath), bytes);
        await mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
          const binding = manifest.artifacts.find((artifact: JsonObject) => artifact.path === relativePath);
          assert.ok(binding);
          binding.sha256 = sha256(bytes);
          if ("retrievedSha256" in binding) binding.retrievedSha256 = binding.sha256;
        });
      },
    },
    {
      name: "intent checkpoint identity mismatch",
      expected: /intent artifact binding/,
      mutate: async (fixture) => mutateBoundJsonArtifact({
        appRoot: path.join(fixture.runRoot, "gnocchi"),
        manifestPath: fixture.gnocchiManifestPath,
        relativePath: "artifacts/gnocchi-current-recovery/intent.json",
        mutate: (intent) => { intent.checkpointId = "f".repeat(64); },
      }),
    },
    {
      name: "synthetic native recovery receipts",
      expected: /must not synthesize receipts/,
      mutate: async (fixture) => mutateBoundJsonArtifact({
        appRoot: path.join(fixture.runRoot, "gnocchi"),
        manifestPath: fixture.gnocchiManifestPath,
        relativePath: "artifacts/gnocchi-current-recovery-final.json",
        mutate: (receipt) => { receipt.receipts = []; },
      }),
    },
    {
      name: "recovery artifact durability drift",
      expected: /intent\.json durability must be "package-only"/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
        const artifact = manifest.artifacts.find(
          (record: JsonObject) => record.path === "artifacts/gnocchi-current-recovery/intent.json",
        );
        assert.ok(artifact);
        artifact.durability = "ephemeral";
      }),
    },
    {
      name: "missing terminal recovery artifact",
      expected: /terminal chain must bind exactly one manifest artifact/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
        manifest.artifacts = manifest.artifacts.filter(
          (record: JsonObject) => record.path !== "artifacts/gnocchi-current-recovery/terminal-chain.json",
        );
      }),
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async (subtest) => {
      const fixture = await createFixture(subtest);
      await convertGnocchiFixtureToCheckpointedRecovered(fixture);
      await current.mutate(fixture);
      await assert.rejects(loadFixture(fixture), current.expected);
    });
  }
});

test("read-only-finalized Gnocchi evidence fails closed on schema mixing, operation drift, and reconciliation drift", async (t) => {
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (receipt: JsonObject) => void;
  }> = [
    {
      name: "synthetic bridge receipts",
      expected: /must not synthesize native bridge receipts/,
      mutate: (receipt) => { receipt.receipts = []; },
    },
    {
      name: "synthetic pin receipts",
      expected: /must not synthesize native pin receipts/,
      mutate: (receipt) => { receipt.pins = []; },
    },
    {
      name: "operation signer drift",
      expected: /mint operation 4 signer/,
      mutate: (receipt) => { receipt.indexedOperationReceipts[4].signerAddress = CREATOR; },
    },
    {
      name: "reconciliation reference drift",
      expected: /reconciliation hash/,
      mutate: (receipt) => { receipt.chainReconciliation.sha256 = "f".repeat(64); },
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async (subtest) => {
      const fixture = await createFixture(subtest);
      await convertGnocchiFixtureToRecovered(fixture);
      await mutateReceipt(fixture.gnocchiManifestPath, fixture.gnocchiReceiptPath, current.mutate);
      await assert.rejects(loadFixture(fixture), current.expected);
    });
  }
});

test("fails closed on missing, cross-run, hash, contract, token, project, and script drift", async (t) => {
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (fixture: Fixture) => Promise<void>;
  }> = [
    {
      name: "missing receipt",
      expected: /gnocchi proof must expose exactly one native or read-only-finalized receipt; received 0/,
      mutate: async (fixture) => unlink(fixture.gnocchiReceiptPath),
    },
    {
      name: "wrong app",
      expected: /gnocchi manifest app must be "gnocchi"/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => { manifest.app = "rotini"; }),
    },
    {
      name: "wrong network",
      expected: /rotini receipt network name must be "shadownet"/,
      mutate: async (fixture) => mutateReceipt(fixture.rotiniManifestPath, fixture.rotiniReceiptPath, (receipt) => {
        receipt.network.name = "mainnet";
      }),
    },
    {
      name: "wrong run",
      expected: /gnocchi manifest run id must be/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => { manifest.runId = "another-run"; }),
    },
    {
      name: "wrong receipt hash",
      expected: /gnocchi artifact ui-live-run-receipt byte hash/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
        manifest.artifacts.find((artifact: JsonObject) => artifact.id === "ui-live-run-receipt").sha256 = "0".repeat(64);
      }),
    },
    {
      name: "corrupt artifact bytes",
      expected: /gnocchi artifact token-0-media byte hash/,
      mutate: async (fixture) => writeFile(fixture.gnocchiMediaPath, "corrupt"),
    },
    {
      name: "contract mismatch",
      expected: /gnocchi manifest\/receipt contract identity/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => {
        manifest.contracts[0].address = ROTINI;
        manifest.operations[0].contractAddress = ROTINI;
        manifest.tokens.forEach((token: JsonObject) => { token.contractAddress = ROTINI; });
      }),
    },
    {
      name: "missing token",
      expected: /gnocchi manifest must expose exactly tokens 0, 1, and 2/,
      mutate: async (fixture) => mutateManifest(fixture.gnocchiManifestPath, (manifest) => { manifest.tokens.pop(); }),
    },
    {
      name: "wrong project",
      expected: /rotini project 0 max supply must be 4/,
      mutate: async (fixture) => mutateReceipt(fixture.rotiniManifestPath, fixture.rotiniReceiptPath, (receipt) => {
        receipt.projects[0].maxSupply = 3;
      }),
    },
    {
      name: "wrong script identity",
      expected: /gnocchi current compiled contract script identity/,
      mutate: async (fixture) => mutateReceipt(fixture.gnocchiManifestPath, fixture.gnocchiReceiptPath, (receipt) => {
        receipt.contract.scriptSha256 = "f".repeat(64);
      }),
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async (subtest) => {
      const fixture = await createFixture(subtest);
      await current.mutate(fixture);
      await assert.rejects(loadFixture(fixture), current.expected);
    });
  }
});

test("signer-free live recheck validates the exact pre-Ravioli capacity and authorization baseline", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const snapshots = liveSnapshots(evidence);
  const requests: JsonObject[] = [];
  const checked = await recheckFreshRavioliDependencies(evidence, {
    readGnocchi: async (request) => {
      requests.push(request);
      assert.equal(Object.isFrozen(request), true);
      return snapshots.gnocchi;
    },
    readRotini: async (request) => {
      requests.push(request);
      assert.equal(Object.isFrozen(request), true);
      return snapshots.rotini;
    },
  }, { now: "2026-07-22T12:00:00.000Z" });
  assert.equal(checked.checkedAt, "2026-07-22T12:00:00.000Z");
  assert.deepEqual(requests.map((request) => request.contractAddress).sort(), [GNOCCHI, ROTINI].sort());
  assert.deepEqual(requests.map((request) => request.chainId), [FRESH_RAVIOLI_CHAIN_ID, FRESH_RAVIOLI_CHAIN_ID]);
  assert.deepEqual(checked.gnocchi.creatorEscrowBalances, { "0": 2, "1": 2 });
  assert.equal(checked.gnocchi.token2.maxSupply, 4);
  assert.equal(checked.rotini.project0.maxSupply, 4);
});

test("mode-0 replay recheck accepts only its journal-bound operator while the ordinary fresh API stays strict", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const snapshots = liveSnapshots(evidence);
  snapshots.gnocchi.activeOperators = [mode0RecoveryOperatorRow()];
  const readers = {
    readGnocchi: async () => snapshots.gnocchi,
    readRotini: async () => snapshots.rotini,
  };
  const checked = await recheckRavioliDependenciesForMode0Replay(
    evidence,
    readers,
    {
      routerAddress: RAVIOLI_ROUTER,
      appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    },
    { now: "2026-07-22T12:00:00.000Z" },
  );
  assert.equal(checked.classification, "RAVIOLI-MODE0-MUTATION-REPLAY");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "gnocchi-fa2-operator",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    tokenId: 0,
    appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
  });
  assert.deepEqual(checked.gnocchi.activeOperators, [mode0RecoveryOperatorRow()]);
  await assert.rejects(
    recheckFreshRavioliDependencies(evidence, readers, { now: "2026-07-22T12:00:00.000Z" }),
    /active operators must be empty/,
  );
});

test("current-v2 recheck accepts exactly the one-unit creator-to-router escrow delta", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const snapshots = liveSnapshots(evidence);
  snapshots.gnocchi.creatorEscrowBalances = { "0": 1, "1": 2 };
  snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 1 };
  snapshots.gnocchi.activeOperators = [mode0RecoveryOperatorRow()];
  const readers = {
    readGnocchi: async () => snapshots.gnocchi,
    readRotini: async () => snapshots.rotini,
  };
  const checked = await recheckRavioliDependenciesForCurrentV2Resume(
    evidence,
    readers,
    {
      routerAddress: RAVIOLI_ROUTER,
      appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    },
    { now: "2026-07-22T12:00:00.000Z" },
  );
  assert.equal(checked.classification, "RAVIOLI-CURRENT-V2-RESUME");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "gnocchi-fa2-operator-and-escrow",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    tokenId: 0,
    amount: 1,
    appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
  });
  snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 0 };
  await assert.rejects(
    recheckRavioliDependenciesForCurrentV2Resume(
      evidence,
      readers,
      {
        routerAddress: RAVIOLI_ROUTER,
        appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
      },
      { now: "2026-07-22T12:00:00.000Z" },
    ),
    /router token 0 escrow balance must be 1/,
  );
  await assert.rejects(
    recheckRavioliDependenciesForMode0Replay(
      evidence,
      readers,
      {
        routerAddress: RAVIOLI_ROUTER,
        appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
      },
      { now: "2026-07-22T12:00:00.000Z" },
    ),
    /token 0 escrow balance must be 2/,
  );
});

test("current-v3 restart accepts the exact two-operator history, token-0 escrow, and zero token-1 escrow", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const snapshots = liveSnapshots(evidence);
  snapshots.gnocchi.creatorEscrowBalances = { "0": 1, "1": 2 };
  snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 1, "1": 0 };
  snapshots.gnocchi.activeOperators = currentV3RecoveryOperatorRows();
  const readers = {
    readGnocchi: async () => snapshots.gnocchi,
    readRotini: async () => snapshots.rotini,
  };
  const checked = await recheckRavioliDependenciesForCurrentV3Restart(
    evidence,
    readers,
    {
      routerAddress: RAVIOLI_ROUTER,
      mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
      mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
    },
    { now: "2026-07-22T12:00:00.000Z" },
  );
  assert.equal(checked.classification, "RAVIOLI-CURRENT-V3-RESTART");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "gnocchi-fa2-operators-and-escrow",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    tokenIds: [0, 1],
    escrowTokenId: 0,
    escrowAmount: 1,
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
  });
  snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 1, "1": 1 };
  await assert.rejects(
    recheckRavioliDependenciesForCurrentV3Restart(
      evidence,
      readers,
      {
        routerAddress: RAVIOLI_ROUTER,
        mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
        mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
      },
      { now: "2026-07-22T12:00:00.000Z" },
    ),
    /router token 1 escrow balance must be 0/,
  );
  snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 1, "1": 0 };
  const driftedRows = currentV3RecoveryOperatorRows();
  snapshots.gnocchi.activeOperators = [
    { ...driftedRows[0], updates: 1 },
    driftedRows[1],
  ];
  await assert.rejects(
    recheckRavioliDependenciesForCurrentV3Restart(
      evidence,
      readers,
      {
        routerAddress: RAVIOLI_ROUTER,
        mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
        mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
      },
      { now: "2026-07-22T12:00:00.000Z" },
    ),
    /token 0 update count must be 2/,
  );
});

test("operation-14 resume accepts only the current two-pool funding state without later LE reservations", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const exactSnapshots = () => {
    const snapshots = liveSnapshots(evidence);
    snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 1 };
    snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 2, "1": 1 };
    snapshots.gnocchi.activeOperators = currentV3RecoveryOperatorRows();
    return snapshots;
  };
  const recovery = {
    routerAddress: RAVIOLI_ROUTER,
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
  };
  const snapshots = exactSnapshots();
  const checked = await recheckRavioliDependenciesForCurrentOp14Resume(
    evidence,
    {
      readGnocchi: async () => snapshots.gnocchi,
      readRotini: async () => snapshots.rotini,
    },
    recovery,
    { now: "2026-07-22T12:00:00.000Z" },
  );
  assert.equal(checked.classification, "RAVIOLI-CURRENT-OP14-RESUME");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "gnocchi-fa2-operators-and-current-funded-pools",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    tokenIds: [0, 1],
    creatorBalances: { "0": 0, "1": 1 },
    routerEscrowBalances: { "0": 2, "1": 1 },
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
  });

  for (const mutation of [
    (value: ReturnType<typeof exactSnapshots>) => {
      (value.gnocchi.creatorEscrowBalances as JsonObject)["1"] = 0;
    },
    (value: ReturnType<typeof exactSnapshots>) => {
      (value.gnocchi.recoveryRouterEscrowBalances as JsonObject)["1"] = 2;
    },
    (value: ReturnType<typeof exactSnapshots>) => {
      value.gnocchi.token2.totalReserved = 1;
    },
    (value: ReturnType<typeof exactSnapshots>) => {
      value.gnocchi.authorizedMinters = [currentV6MinterRow()];
    },
  ]) {
    const drifted = exactSnapshots();
    mutation(drifted);
    await assert.rejects(
      recheckRavioliDependenciesForCurrentOp14Resume(
        evidence,
        {
          readGnocchi: async () => drifted.gnocchi,
          readRotini: async () => drifted.rotini,
        },
        recovery,
        { now: "2026-07-22T12:00:00.000Z" },
      ),
    );
  }
});

test("operation-20 resume accepts only the authorized Gnocchi adapter before any LE capacity is reserved", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const recovery = {
    routerAddress: RAVIOLI_ROUTER,
    gnocchiAdapterAddress: GNOCCHI_ADAPTER,
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
  };
  const exactSnapshots = () => {
    const snapshots = liveSnapshots(evidence);
    snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 1 };
    snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 2, "1": 1 };
    snapshots.gnocchi.activeOperators = currentV3RecoveryOperatorRows();
    snapshots.gnocchi.authorizedMinters = [currentV6MinterRow()];
    return snapshots;
  };

  const snapshots = exactSnapshots();
  const checked = await recheckRavioliDependenciesForCurrentOp20Resume(
    evidence,
    {
      readGnocchi: async () => snapshots.gnocchi,
      readRotini: async () => snapshots.rotini,
    },
    recovery,
    { now: "2026-07-22T12:00:00.000Z" },
  );
  assert.equal(checked.classification, "RAVIOLI-CURRENT-OP20-RESUME");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "gnocchi-fa2-operators-funded-pools-and-authorized-adapter",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    gnocchiAdapter: GNOCCHI_ADAPTER,
    tokenIds: [0, 1],
    creatorBalances: { "0": 0, "1": 1 },
    routerEscrowBalances: { "0": 2, "1": 1 },
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
  });

  const drifts: Array<{
    label: string;
    error: RegExp;
    mutate(value: ReturnType<typeof exactSnapshots>): void;
  }> = [
    {
      label: "missing adapter authorization",
      error: /authorized minters must contain only the journal-bound adapter/,
      mutate: ({ gnocchi }) => { gnocchi.authorizedMinters = []; },
    },
    {
      label: "wrong authorized adapter",
      error: /current minter key/,
      mutate: ({ gnocchi }) => {
        gnocchi.authorizedMinters = [currentV6MinterRow({ key: ROTINI_ADAPTER })];
      },
    },
    {
      label: "additional adapter authorization",
      error: /authorized minters must contain only the journal-bound adapter/,
      mutate: ({ gnocchi }) => {
        gnocchi.authorizedMinters = [
          currentV6MinterRow(),
          currentV6MinterRow({ id: 300_741, key: ROTINI_ADAPTER }),
        ];
      },
    },
    {
      label: "reservation row already exists",
      error: /reserved mints must be empty/,
      mutate: ({ gnocchi }) => { gnocchi.reservedMints = [currentV6ReservationRow()]; },
    },
    {
      label: "token-2 capacity already reserved",
      error: /token 2 total reserved must be 0/,
      mutate: ({ gnocchi }) => { gnocchi.token2.totalReserved = 1; },
    },
  ];
  for (const drift of drifts) {
    const value = exactSnapshots();
    drift.mutate(value);
    await assert.rejects(
      recheckRavioliDependenciesForCurrentOp20Resume(
        evidence,
        {
          readGnocchi: async () => value.gnocchi,
          readRotini: async () => value.rotini,
        },
        recovery,
        { now: "2026-07-22T12:00:00.000Z" },
      ),
      drift.error,
      drift.label,
    );
  }
});

test("current-v6 resume accepts only the exact funded-pool balances and journal-bound LE reservation", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const recovery = {
    routerAddress: RAVIOLI_ROUTER,
    gnocchiAdapterAddress: GNOCCHI_ADAPTER,
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
    reservedMintAppliedLevel: RAVIOLI_RESERVATION_APPLIED_LEVEL,
  };
  const currentSnapshots = () => {
    const snapshots = liveSnapshots(evidence);
    snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 1 };
    snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 2, "1": 1 };
    snapshots.gnocchi.token2.totalReserved = 1;
    snapshots.gnocchi.activeOperators = currentV3RecoveryOperatorRows();
    snapshots.gnocchi.authorizedMinters = [currentV6MinterRow()];
    snapshots.gnocchi.reservedMints = [currentV6ReservationRow()];
    return snapshots;
  };
  const snapshots = currentSnapshots();
  const checked = await recheckRavioliDependenciesForCurrentV6Resume(
    evidence,
    {
      readGnocchi: async () => snapshots.gnocchi,
      readRotini: async () => snapshots.rotini,
    },
    recovery,
    { now: "2026-07-22T12:00:00.000Z" },
  );
  assert.equal(checked.classification, "RAVIOLI-CURRENT-V6-RESUME");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "gnocchi-fa2-operators-funded-pools-and-le-reservation",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    gnocchiAdapter: GNOCCHI_ADAPTER,
    tokenIds: [0, 1],
    creatorBalances: { "0": 0, "1": 1 },
    routerEscrowBalances: { "0": 2, "1": 1 },
    reservedTokenId: 2,
    reservedAmount: 1,
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
    reservedMintAppliedLevel: RAVIOLI_RESERVATION_APPLIED_LEVEL,
  });

  const drifts: Array<{ label: string; error: RegExp; mutate(value: ReturnType<typeof currentSnapshots>): void }> = [
    {
      label: "creator token-1 balance",
      error: /token 1 escrow balance must be 1/,
      mutate: ({ gnocchi }) => { (gnocchi.creatorEscrowBalances as JsonObject)["1"] = 0; },
    },
    {
      label: "router token-1 balance",
      error: /router token 1 escrow balance must be 1/,
      mutate: ({ gnocchi }) => { (gnocchi.recoveryRouterEscrowBalances as JsonObject)["1"] = 2; },
    },
    {
      label: "missing adapter authorization",
      error: /authorized minters must contain only/,
      mutate: ({ gnocchi }) => { gnocchi.authorizedMinters = []; },
    },
    {
      label: "wrong reservation owner",
      error: /reservation owner/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentV6ReservationRow({
          key: { owner: RAVIOLI_ROUTER, token_id: "2" },
        })];
      },
    },
    {
      label: "reservation history",
      error: /reservation updates/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentV6ReservationRow({ updates: 3 })];
      },
    },
  ];
  for (const drift of drifts) {
    const value = currentSnapshots();
    drift.mutate(value);
    await assert.rejects(
      recheckRavioliDependenciesForCurrentV6Resume(
        evidence,
        {
          readGnocchi: async () => value.gnocchi,
          readRotini: async () => value.rotini,
        },
        recovery,
        { now: "2026-07-22T12:00:00.000Z" },
      ),
      drift.error,
      drift.label,
    );
  }
});

test("current authenticated resume binds Rotini reservations to the exact semantic prefix", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const op23Recovery = {
    routerAddress: RAVIOLI_ROUTER,
    gnocchiAdapterAddress: GNOCCHI_ADAPTER,
    mode0AppliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_MODE1_OPERATOR_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_MINTER_APPLIED_LEVEL,
    reservedMintAppliedLevel: RAVIOLI_RESERVATION_APPLIED_LEVEL,
  };
  const op30Recovery = {
    ...op23Recovery,
    rotiniReservation: {
      adapterAddress: ROTINI_ADAPTER,
      packMinterAppliedLevel: RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL,
      reservationAppliedLevel: RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL,
    },
  };
  const snapshotsAt = (profile: "op23" | "op30") => {
    const snapshots = liveSnapshots(evidence);
    snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 1 };
    snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 2, "1": 1 };
    snapshots.gnocchi.token2.totalReserved = 1;
    snapshots.gnocchi.activeOperators = currentV3RecoveryOperatorRows();
    snapshots.gnocchi.authorizedMinters = [currentV6MinterRow()];
    snapshots.gnocchi.reservedMints = [currentV6ReservationRow()];
    if (profile === "op30") {
      snapshots.rotini.project0.reserved = 2;
      snapshots.rotini.authorizedPackMinters = [currentRotiniPackMinterRow()];
      snapshots.rotini.openReservations = [];
      snapshots.rotini.packReservations = [currentRotiniPackReservationRow()];
    }
    return snapshots;
  };
  const recheck = async (
    recovery: typeof op23Recovery | typeof op30Recovery,
    snapshots: ReturnType<typeof snapshotsAt>,
  ) => {
    return recheckRavioliDependenciesForCurrentV6Resume(
      evidence,
      {
        readGnocchi: async () => snapshots.gnocchi,
        readRotini: async () => snapshots.rotini,
      },
      recovery,
      { now: "2026-07-22T12:00:00.000Z" },
    );
  };

  const op23 = await recheck(op23Recovery, snapshotsAt("op23"));
  assert.equal(op23.rotini.project0.reserved, 0);
  await assert.rejects(
    recheck(op23Recovery, snapshotsAt("op30")),
    /live Rotini project 0 reserved must be 0/,
    "operation 23 accepted the operation-30 Rotini reservation state",
  );

  const op30 = await recheck(op30Recovery, snapshotsAt("op30"));
  assert.equal(op30.rotini.project0.reserved, 2);
  assert.deepEqual(op30.acceptedMutation.rotiniReservation, {
    adapter: ROTINI_ADAPTER,
    projectId: 0,
    reservedAmount: 2,
    packMinterAppliedLevel: RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    reservationAppliedLevel: RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL,
  });
  await assert.rejects(
    recheck(op30Recovery, snapshotsAt("op23")),
    /live Rotini project 0 reserved must be 2/,
    "operation 30 accepted the operation-23 Rotini reservation state",
  );

  const drifts: Array<{
    label: string;
    error: RegExp;
    mutate: (snapshots: ReturnType<typeof snapshotsAt>) => void;
  }> = [
    {
      label: "adjacent project reservation below",
      error: /live Rotini project 0 reserved must be 2/,
      mutate: ({ rotini }) => { rotini.project0.reserved = 1; },
    },
    {
      label: "adjacent project reservation above",
      error: /live Rotini project 0 reserved must be 2/,
      mutate: ({ rotini }) => { rotini.project0.reserved = 3; },
    },
    {
      label: "missing pack minter",
      error: /authorized pack minters must contain only the journal-bound adapter/,
      mutate: ({ rotini }) => { rotini.authorizedPackMinters = []; },
    },
    {
      label: "wrong pack minter",
      error: /current pack minter key/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentRotiniPackMinterRow({ key: GNOCCHI_ADAPTER })];
      },
    },
    {
      label: "inactive pack minter",
      error: /current pack minter active marker/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentRotiniPackMinterRow({ active: false })];
      },
    },
    {
      label: "non-unit pack minter value",
      error: /current pack minter value must expose exactly keys/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentRotiniPackMinterRow({ value: { extra: true } })];
      },
    },
    {
      label: "pack minter first-level history",
      error: /current pack minter first level/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentRotiniPackMinterRow({
          firstLevel: RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL - 1,
        })];
      },
    },
    {
      label: "pack minter last-level history",
      error: /current pack minter last level/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentRotiniPackMinterRow({
          lastLevel: RAVIOLI_ROTINI_PACK_MINTER_APPLIED_LEVEL + 1,
        })];
      },
    },
    {
      label: "pack minter update history",
      error: /current pack minter updates/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentRotiniPackMinterRow({ updates: 2 })];
      },
    },
    {
      label: "direct reservation still open",
      error: /live Rotini open reservations must be empty/,
      mutate: ({ rotini }) => { rotini.openReservations = [{ id: 300_741, active: true }]; },
    },
    {
      label: "missing pack reservation",
      error: /pack reservations must contain only the journal-bound project reservation/,
      mutate: ({ rotini }) => { rotini.packReservations = []; },
    },
    {
      label: "inactive pack reservation",
      error: /current pack reservation active marker/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({ active: false })];
      },
    },
    {
      label: "wrong pack reservation owner",
      error: /current pack reservation owner/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({
          key: { owner: RAVIOLI_ROUTER, token_id: "0" },
        })];
      },
    },
    {
      label: "wrong pack reservation project",
      error: /current pack reservation project must be 0/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({
          key: { owner: ROTINI_ADAPTER, token_id: "1" },
        })];
      },
    },
    {
      label: "adjacent pack reservation amount below",
      error: /current pack reservation amount must be 2/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({ value: "1" })];
      },
    },
    {
      label: "adjacent pack reservation amount above",
      error: /current pack reservation amount must be 2/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({ value: "3" })];
      },
    },
    {
      label: "pack reservation first-level history",
      error: /current pack reservation first level/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({
          firstLevel: RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL - 1,
        })];
      },
    },
    {
      label: "pack reservation last-level history",
      error: /current pack reservation last level/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({
          lastLevel: RAVIOLI_ROTINI_RESERVATION_APPLIED_LEVEL + 1,
        })];
      },
    },
    {
      label: "pack reservation update history below",
      error: /current pack reservation updates/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({ updates: 1 })];
      },
    },
    {
      label: "pack reservation update history above",
      error: /current pack reservation updates/,
      mutate: ({ rotini }) => {
        rotini.packReservations = [currentRotiniPackReservationRow({ updates: 3 })];
      },
    },
  ];
  for (const drift of drifts) {
    const snapshots = snapshotsAt("op30");
    drift.mutate(snapshots);
    await assert.rejects(
      recheck(op30Recovery, snapshots),
      drift.error,
      drift.label,
    );
  }
});

test("operation-55 resume accepts only the exact five-mode terminal dependency state and update history", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const recovery = {
    routerAddress: RAVIOLI_ROUTER,
    gnocchiAdapterAddress: GNOCCHI_ADAPTER,
    rotiniAdapterAddress: ROTINI_ADAPTER,
    mode0AppliedLevel: RAVIOLI_OP55_MODE0_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_OP55_MINTER_APPLIED_LEVEL,
    rotiniPackMinterAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    minterSecondAppliedLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL,
    rotiniPackMinterSecondAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    mode1SecondAppliedLevel: RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL,
  };
  const terminalSnapshots = () => {
    const snapshots = liveSnapshots(evidence);
    snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 0 };
    snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 0, "1": 0 };
    snapshots.gnocchi.token2.totalMinted = 4;
    snapshots.gnocchi.token2.totalReserved = 0;
    snapshots.gnocchi.activeOperators = currentOp55OperatorRows();
    snapshots.gnocchi.authorizedMinters = [currentOp55MinterRow()];
    snapshots.gnocchi.reservedMints = [];
    snapshots.rotini.nextTokenId = 6;
    snapshots.rotini.project0.minted = 4;
    snapshots.rotini.project0.reserved = 0;
    snapshots.rotini.authorizedPackMinters = [currentOp55RotiniPackMinterRow()];
    snapshots.rotini.openReservations = [];
    snapshots.rotini.packReservations = [];
    return snapshots;
  };
  const recheck = (snapshots: ReturnType<typeof terminalSnapshots>, currentRecovery = recovery) =>
    recheckRavioliDependenciesForCurrentOp55Resume(
      evidence,
      {
        readGnocchi: async () => snapshots.gnocchi,
        readRotini: async () => snapshots.rotini,
      },
      currentRecovery,
      { now: "2026-07-22T12:00:00.000Z" },
    );

  const checked = await recheck(terminalSnapshots());
  assert.equal(checked.classification, "RAVIOLI-CURRENT-OP55-RESUME");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "five-mode-terminal-dependency-state",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    gnocchiAdapter: GNOCCHI_ADAPTER,
    rotiniAdapter: ROTINI_ADAPTER,
    creatorBalances: { "0": 0, "1": 0 },
    routerEscrowBalances: { "0": 0, "1": 0 },
    token2: { totalMinted: 4, totalReserved: 0 },
    rotini: { nextTokenId: 6, projectId: 0, minted: 4, reserved: 0 },
    mode0AppliedLevel: RAVIOLI_OP55_MODE0_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_OP55_MINTER_APPLIED_LEVEL,
    rotiniPackMinterAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    minterSecondAppliedLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL,
    rotiniPackMinterSecondAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    mode1SecondAppliedLevel: RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL,
  });

  const drifts: Array<{
    label: string;
    error: RegExp;
    mutate(snapshots: ReturnType<typeof terminalSnapshots>): void;
  }> = [
    {
      label: "creator token-1 balance adjacent above",
      error: /token 1 escrow balance must be 0/,
      mutate: ({ gnocchi }) => { (gnocchi.creatorEscrowBalances as JsonObject)["1"] = 1; },
    },
    {
      label: "router token-0 balance adjacent above",
      error: /router token 0 escrow balance must be 0/,
      mutate: ({ gnocchi }) => { (gnocchi.recoveryRouterEscrowBalances as JsonObject)["0"] = 1; },
    },
    {
      label: "token-2 mint not consumed",
      error: /token 2 total minted must be 4/,
      mutate: ({ gnocchi }) => { gnocchi.token2.totalMinted = 3; },
    },
    {
      label: "token-2 reservation remains",
      error: /token 2 total reserved must be 0/,
      mutate: ({ gnocchi }) => { gnocchi.token2.totalReserved = 1; },
    },
    {
      label: "token-0 operator first-level drift",
      error: /operator token 0 first level/,
      mutate: ({ gnocchi }) => {
        gnocchi.activeOperators = currentOp55OperatorRows();
        (gnocchi.activeOperators[0] as JsonObject).firstLevel = RAVIOLI_OP55_MODE0_APPLIED_LEVEL - 1;
      },
    },
    {
      label: "token-1 operator terminal update drift",
      error: /operator token 1 last level/,
      mutate: ({ gnocchi }) => {
        gnocchi.activeOperators = currentOp55OperatorRows();
        (gnocchi.activeOperators[1] as JsonObject).lastLevel = RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL - 1;
      },
    },
    {
      label: "Gnocchi minter terminal update drift",
      error: /operation-55 minter last level/,
      mutate: ({ gnocchi }) => {
        gnocchi.authorizedMinters = [currentOp55MinterRow({
          lastLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL - 1,
        })];
      },
    },
    {
      label: "Gnocchi minter update-count drift",
      error: /operation-55 minter updates/,
      mutate: ({ gnocchi }) => { gnocchi.authorizedMinters = [currentOp55MinterRow({ updates: 1 })]; },
    },
    {
      label: "Gnocchi reserved mint remains",
      error: /reserved mints must be empty/,
      mutate: ({ gnocchi }) => { gnocchi.reservedMints = [currentV6ReservationRow()]; },
    },
    {
      label: "Rotini next token adjacent below",
      error: /next token id must be 6/,
      mutate: ({ rotini }) => { rotini.nextTokenId = 5; },
    },
    {
      label: "Rotini project mint adjacent below",
      error: /project 0 minted must be 4/,
      mutate: ({ rotini }) => { rotini.project0.minted = 3; },
    },
    {
      label: "Rotini project reservation remains",
      error: /project 0 reserved must be 0/,
      mutate: ({ rotini }) => { rotini.project0.reserved = 1; },
    },
    {
      label: "Rotini pack-minter terminal update drift",
      error: /operation-55 pack minter last level/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentOp55RotiniPackMinterRow({
          lastLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL - 1,
        })];
      },
    },
    {
      label: "Rotini pack-minter update-count drift",
      error: /operation-55 pack minter updates/,
      mutate: ({ rotini }) => {
        rotini.authorizedPackMinters = [currentOp55RotiniPackMinterRow({ updates: 1 })];
      },
    },
    {
      label: "Rotini pack reservation remains",
      error: /pack reservations must be empty/,
      mutate: ({ rotini }) => { rotini.packReservations = [currentRotiniPackReservationRow()]; },
    },
  ];
  for (const drift of drifts) {
    const snapshots = terminalSnapshots();
    drift.mutate(snapshots);
    await assert.rejects(recheck(snapshots), drift.error, drift.label);
  }

  await assert.rejects(
    recheck(terminalSnapshots(), {
      ...recovery,
      mode1SecondAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    }),
    /update levels must match the strictly ordered journal history/,
    "operation-55 accepted an adjacent out-of-order recovery boundary",
  );
});

test("operation-63 resume accepts only the exact withheld-reveal allocation dependency state", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const recovery = {
    routerAddress: RAVIOLI_ROUTER,
    gnocchiAdapterAddress: GNOCCHI_ADAPTER,
    rotiniAdapterAddress: ROTINI_ADAPTER,
    mode0AppliedLevel: RAVIOLI_OP55_MODE0_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_OP55_MINTER_APPLIED_LEVEL,
    rotiniPackMinterAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    minterSecondAppliedLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL,
    rotiniPackMinterSecondAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    mode1SecondAppliedLevel: RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL,
    minterThirdAppliedLevel: RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL,
    allocationAppliedLevel: RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL,
    adapterRouterAppliedLevel: RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL,
    reservedMintFirstAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL,
    reservedMintAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL,
  };
  const operation63Snapshots = () => {
    const snapshots = liveSnapshots(evidence);
    snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 0 };
    snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 0, "1": 0 };
    snapshots.gnocchi.token2.totalMinted = 4;
    snapshots.gnocchi.token2.totalReserved = 0;
    snapshots.gnocchi.activeOperators = currentOp55OperatorRows();
    snapshots.gnocchi.authorizedMinters = [currentOp63MinterRow()];
    snapshots.gnocchi.reservedMints = [currentOp63ReservedMintRow()];
    snapshots.rotini.nextTokenId = 6;
    snapshots.rotini.project0.minted = 4;
    snapshots.rotini.project0.reserved = 0;
    snapshots.rotini.authorizedPackMinters = [currentOp55RotiniPackMinterRow()];
    snapshots.rotini.openReservations = [];
    snapshots.rotini.packReservations = [];
    return snapshots;
  };
  const recheck = (
    snapshots: ReturnType<typeof operation63Snapshots>,
    currentRecovery = recovery,
  ) => recheckRavioliDependenciesForCurrentOp63Resume(
    evidence,
    {
      readGnocchi: async () => snapshots.gnocchi,
      readRotini: async () => snapshots.rotini,
    },
    currentRecovery,
    { now: "2026-07-22T12:00:00.000Z" },
  );

  const checked = await recheck(operation63Snapshots());
  assert.equal(checked.classification, "RAVIOLI-CURRENT-OP63-RESUME");
  assert.deepEqual(checked.acceptedMutation, {
    kind: "withheld-reveal-allocation-dependency-state",
    owner: CREATOR,
    operator: RAVIOLI_ROUTER,
    gnocchiAdapter: GNOCCHI_ADAPTER,
    rotiniAdapter: ROTINI_ADAPTER,
    creatorBalances: { "0": 0, "1": 0 },
    routerEscrowBalances: { "0": 0, "1": 0 },
    token2: { totalMinted: 4, totalReserved: 0 },
    reservedMint: { tokenId: 1, amount: 2 },
    rotini: { nextTokenId: 6, projectId: 0, minted: 4, reserved: 0 },
    mode0AppliedLevel: RAVIOLI_OP55_MODE0_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_OP55_MINTER_APPLIED_LEVEL,
    rotiniPackMinterAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    minterSecondAppliedLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL,
    rotiniPackMinterSecondAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    mode1SecondAppliedLevel: RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL,
    minterThirdAppliedLevel: RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL,
    allocationAppliedLevel: RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL,
    adapterRouterAppliedLevel: RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL,
    reservedMintFirstAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL,
    reservedMintAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL,
  });

  const drifts: Array<{
    label: string;
    error: RegExp;
    mutate(snapshots: ReturnType<typeof operation63Snapshots>): void;
  }> = [
    {
      label: "operation-55 operator history changed",
      error: /operation-63 operator token 1 updates/,
      mutate: ({ gnocchi }) => {
        gnocchi.activeOperators = currentOp55OperatorRows();
        (gnocchi.activeOperators[1] as JsonObject).updates = 3;
      },
    },
    {
      label: "additional active minter",
      error: /operation-63 authorized minters must contain only/,
      mutate: ({ gnocchi }) => {
        gnocchi.authorizedMinters = [currentOp63MinterRow(), currentOp63MinterRow({ id: 324_411 })];
      },
    },
    {
      label: "minter role inactive",
      error: /operation-63 minter active marker/,
      mutate: ({ gnocchi }) => { gnocchi.authorizedMinters = [currentOp63MinterRow({ active: false })]; },
    },
    {
      label: "minter last level before operation 56",
      error: /operation-63 minter last level/,
      mutate: ({ gnocchi }) => {
        gnocchi.authorizedMinters = [currentOp63MinterRow({
          lastLevel: RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL - 1,
        })];
      },
    },
    {
      label: "minter update count remains at operation 55",
      error: /operation-63 minter updates/,
      mutate: ({ gnocchi }) => { gnocchi.authorizedMinters = [currentOp63MinterRow({ updates: 2 })]; },
    },
    {
      label: "additional reserved mint",
      error: /operation-63 reserved mints must contain only/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentOp63ReservedMintRow(), currentOp63ReservedMintRow({ id: 324_412 })];
      },
    },
    {
      label: "reserved mint inactive",
      error: /operation-63 reservation active marker/,
      mutate: ({ gnocchi }) => { gnocchi.reservedMints = [currentOp63ReservedMintRow({ active: false })]; },
    },
    {
      label: "reserved mint wrong owner",
      error: /operation-63 reservation owner/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentOp63ReservedMintRow({ key: { owner: ROTINI_ADAPTER, token_id: "1" } })];
      },
    },
    {
      label: "reserved mint wrong token",
      error: /operation-63 reservation token/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentOp63ReservedMintRow({ key: { owner: GNOCCHI_ADAPTER, token_id: "2" } })];
      },
    },
    {
      label: "reserved mint amount below two recipes",
      error: /operation-63 reservation amount/,
      mutate: ({ gnocchi }) => { gnocchi.reservedMints = [currentOp63ReservedMintRow({ value: "1" })]; },
    },
    {
      label: "reserved mint historical first level changed",
      error: /operation-63 reservation first level/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentOp63ReservedMintRow({
          firstLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL + 1,
        })];
      },
    },
    {
      label: "reserved mint terminal level is not operation 61",
      error: /operation-63 reservation last level/,
      mutate: ({ gnocchi }) => {
        gnocchi.reservedMints = [currentOp63ReservedMintRow({
          lastLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL - 1,
        })];
      },
    },
    {
      label: "reserved mint update history changed",
      error: /operation-63 reservation updates/,
      mutate: ({ gnocchi }) => { gnocchi.reservedMints = [currentOp63ReservedMintRow({ updates: 3 })]; },
    },
    {
      label: "token-2 terminal state changed",
      error: /token 2 total reserved must be 0/,
      mutate: ({ gnocchi }) => { gnocchi.token2.totalReserved = 1; },
    },
    {
      label: "Rotini terminal state changed",
      error: /project 0 reserved must be 0/,
      mutate: ({ rotini }) => { rotini.project0.reserved = 1; },
    },
  ];
  for (const drift of drifts) {
    const snapshots = operation63Snapshots();
    drift.mutate(snapshots);
    await assert.rejects(recheck(snapshots), drift.error, drift.label);
  }

  const recoveryDrifts: Array<{
    label: string;
    error: RegExp;
    mutation: Partial<typeof recovery>;
  }> = [
    {
      label: "operation-56 minter level drift",
      error: /minter third applied level must be 4579174/,
      mutation: { minterThirdAppliedLevel: RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL + 1 },
    },
    {
      label: "operation-57 allocation level drift",
      error: /adapter allocation applied level must be 4579176/,
      mutation: { allocationAppliedLevel: RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL + 1 },
    },
    {
      label: "operation-58 router level drift",
      error: /adapter router applied level must be 4579178/,
      mutation: { adapterRouterAppliedLevel: RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL + 1 },
    },
    {
      label: "operation-61 reservation level drift",
      error: /reserved mint terminal applied level must be 4579185/,
      mutation: { reservedMintAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL + 1 },
    },
  ];
  for (const drift of recoveryDrifts) {
    await assert.rejects(
      recheck(operation63Snapshots(), { ...recovery, ...drift.mutation }),
      drift.error,
      drift.label,
    );
  }
});

test("operation-67 terminal resume requires the released withheld Gnocchi reservation", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const snapshots = liveSnapshots(evidence);
  snapshots.gnocchi.creatorEscrowBalances = { "0": 0, "1": 0 };
  snapshots.gnocchi.recoveryRouterEscrowBalances = { "0": 0, "1": 0 };
  snapshots.gnocchi.token2.totalMinted = 4;
  snapshots.gnocchi.token2.totalReserved = 0;
  snapshots.gnocchi.activeOperators = currentOp55OperatorRows();
  snapshots.gnocchi.authorizedMinters = [currentOp63MinterRow()];
  snapshots.gnocchi.reservedMints = [];
  snapshots.rotini.nextTokenId = 6;
  snapshots.rotini.project0.minted = 4;
  snapshots.rotini.project0.reserved = 0;
  snapshots.rotini.authorizedPackMinters = [currentOp55RotiniPackMinterRow()];
  snapshots.rotini.openReservations = [];
  snapshots.rotini.packReservations = [];
  const adapterRecoveryAppliedLevel = RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL + 1;
  const recovery = {
    routerAddress: RAVIOLI_ROUTER,
    gnocchiAdapterAddress: GNOCCHI_ADAPTER,
    rotiniAdapterAddress: ROTINI_ADAPTER,
    mode0AppliedLevel: RAVIOLI_OP55_MODE0_APPLIED_LEVEL,
    mode1AppliedLevel: RAVIOLI_OP55_MODE1_APPLIED_LEVEL,
    minterAppliedLevel: RAVIOLI_OP55_MINTER_APPLIED_LEVEL,
    rotiniPackMinterAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_APPLIED_LEVEL,
    minterSecondAppliedLevel: RAVIOLI_OP55_MINTER_SECOND_APPLIED_LEVEL,
    rotiniPackMinterSecondAppliedLevel: RAVIOLI_OP55_ROTINI_PACK_MINTER_SECOND_APPLIED_LEVEL,
    mode1SecondAppliedLevel: RAVIOLI_OP55_MODE1_SECOND_APPLIED_LEVEL,
    minterThirdAppliedLevel: RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL,
    allocationAppliedLevel: RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL,
    adapterRouterAppliedLevel: RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL,
    reservedMintFirstAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL,
    reservedMintAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL,
    adapterRecoveryAppliedLevel,
  };
  const recheck = () => recheckRavioliDependenciesForCurrentOp63Resume(
    evidence,
    {
      readGnocchi: async () => snapshots.gnocchi,
      readRotini: async () => snapshots.rotini,
    },
    recovery,
    { now: "2026-07-22T12:00:00.000Z" },
  );
  const checked = await recheck();
  assert.equal(checked.classification, "RAVIOLI-CURRENT-OP67-RESUME");
  assert.deepEqual(checked.acceptedMutation.reservedMint, { tokenId: 1, amount: 0 });
  assert.equal(checked.acceptedMutation.adapterRecoveryAppliedLevel, adapterRecoveryAppliedLevel);

  snapshots.gnocchi.reservedMints = [currentOp63ReservedMintRow()];
  await assert.rejects(recheck(), /operation-67 reserved mints must be empty/);
  snapshots.gnocchi.reservedMints = [];
  const { adapterRecoveryAppliedLevel: _releasedAt, ...preRecovery } = recovery;
  await assert.rejects(
    recheckRavioliDependenciesForCurrentOp63Resume(
      evidence,
      {
        readGnocchi: async () => snapshots.gnocchi,
        readRotini: async () => snapshots.rotini,
      },
      preRecovery,
      { now: "2026-07-22T12:00:00.000Z" },
    ),
    /operation-63 reserved mints must contain only/,
  );
  await assert.rejects(
    recheckRavioliDependenciesForCurrentOp63Resume(
      evidence,
      {
        readGnocchi: async () => snapshots.gnocchi,
        readRotini: async () => snapshots.rotini,
      },
      { ...recovery, adapterRecoveryAppliedLevel: RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL },
      { now: "2026-07-22T12:00:00.000Z" },
    ),
    /dependency update levels must match the strictly ordered journal history/,
  );
});

test("mode-0 replay recheck rejects missing, additional, malformed, or historically changed operator evidence", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const cases: Array<{
    name: string;
    rows: JsonObject[];
    expected: RegExp;
  }> = [
    {
      name: "missing operator",
      rows: [],
      expected: /must contain exactly one journal-bound mode-0 operator/,
    },
    {
      name: "duplicate operator",
      rows: [mode0RecoveryOperatorRow(), mode0RecoveryOperatorRow({ id: 300_736 })],
      expected: /must contain exactly one journal-bound mode-0 operator/,
    },
    {
      name: "additional operator",
      rows: [
        mode0RecoveryOperatorRow(),
        mode0RecoveryOperatorRow({
          id: 300_736,
          key: { owner: CREATOR, operator: RAVIOLI_ROUTER, token_id: "1" },
        }),
      ],
      expected: /must contain exactly one journal-bound mode-0 operator/,
    },
    {
      name: "wrong owner",
      rows: [mode0RecoveryOperatorRow({
        key: { owner: OTHER_CREATOR, operator: RAVIOLI_ROUTER, token_id: "0" },
      })],
      expected: /operator owner/,
    },
    {
      name: "wrong router",
      rows: [mode0RecoveryOperatorRow({
        key: { owner: CREATOR, operator: GNOCCHI, token_id: "0" },
      })],
      expected: /operator contract/,
    },
    {
      name: "wrong token",
      rows: [mode0RecoveryOperatorRow({
        key: { owner: CREATOR, operator: RAVIOLI_ROUTER, token_id: "1" },
      })],
      expected: /operator token id/,
    },
    {
      name: "inactive tombstone",
      rows: [mode0RecoveryOperatorRow({ active: false })],
      expected: /active marker/,
    },
    {
      name: "extra Michelson key field",
      rows: [mode0RecoveryOperatorRow({
        key: { owner: CREATOR, operator: RAVIOLI_ROUTER, token_id: "0", unexpected: true },
      })],
      expected: /operator key must expose exactly keys/,
    },
    {
      name: "non-unit value",
      rows: [mode0RecoveryOperatorRow({ value: { unexpected: true } })],
      expected: /operator unit value must expose exactly keys/,
    },
    {
      name: "first level drift",
      rows: [mode0RecoveryOperatorRow({ firstLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL - 1 })],
      expected: /first applied level/,
    },
    {
      name: "last level drift",
      rows: [mode0RecoveryOperatorRow({ lastLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL + 1 })],
      expected: /last applied level/,
    },
    {
      name: "remove and re-add history",
      rows: [mode0RecoveryOperatorRow({ updates: 3 })],
      expected: /update count/,
    },
    {
      name: "malformed row",
      rows: [null as unknown as JsonObject],
      expected: /operator row must be an object/,
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async () => {
      const snapshots = liveSnapshots(evidence);
      snapshots.gnocchi.activeOperators = current.rows;
      await assert.rejects(
        recheckRavioliDependenciesForMode0Replay(
          evidence,
          {
            readGnocchi: async () => snapshots.gnocchi,
            readRotini: async () => snapshots.rotini,
          },
          {
            routerAddress: RAVIOLI_ROUTER,
            appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
          },
          { now: "2026-07-22T12:00:00.000Z" },
        ),
        current.expected,
      );
    });
  }
});

test("mode-0 replay recheck rejects an invalid recovery claim before accepting live state", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const snapshots = liveSnapshots(evidence);
  snapshots.gnocchi.activeOperators = [mode0RecoveryOperatorRow()];
  const readers = {
    readGnocchi: async () => snapshots.gnocchi,
    readRotini: async () => snapshots.rotini,
  };
  const cases = [
    {
      name: "invalid router",
      recovery: { routerAddress: "not-a-contract", appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL },
      expected: /router must be a valid originated contract address/,
    },
    {
      name: "Gnocchi as router",
      recovery: { routerAddress: GNOCCHI, appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL },
      expected: /router must be distinct from the Gnocchi and Rotini dependencies/,
    },
    {
      name: "Rotini as router",
      recovery: { routerAddress: ROTINI, appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL },
      expected: /router must be distinct from the Gnocchi and Rotini dependencies/,
    },
    {
      name: "zero applied level",
      recovery: { routerAddress: RAVIOLI_ROUTER, appliedLevel: 0 },
      expected: /applied level must be a positive safe integer/,
    },
    {
      name: "unsafe applied level",
      recovery: { routerAddress: RAVIOLI_ROUTER, appliedLevel: Number.MAX_SAFE_INTEGER + 1 },
      expected: /applied level must be a positive safe integer/,
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async () => {
      await assert.rejects(
        recheckRavioliDependenciesForMode0Replay(
          evidence,
          readers,
          current.recovery,
          { now: "2026-07-22T12:00:00.000Z" },
        ),
        current.expected,
      );
    });
  }
});

test("mode-0 replay recheck preserves every non-operator dependency guard", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (snapshots: ReturnType<typeof liveSnapshots>) => void;
  }> = [
    {
      name: "Gnocchi escrow drift",
      expected: /token 0 escrow balance must be 2/,
      mutate: ({ gnocchi }) => { (gnocchi.creatorEscrowBalances as JsonObject)["0"] = 1; },
    },
    {
      name: "Gnocchi sale drift",
      expected: /token 2 total reserved must be 0/,
      mutate: ({ gnocchi }) => { gnocchi.token2.totalReserved = 1; },
    },
    {
      name: "Gnocchi minter drift",
      expected: /authorized minters must be empty/,
      mutate: ({ gnocchi }) => { (gnocchi.authorizedMinters as unknown[]).push(RAVIOLI_ROUTER); },
    },
    {
      name: "Gnocchi reservation drift",
      expected: /reserved mints must be empty/,
      mutate: ({ gnocchi }) => { (gnocchi.reservedMints as unknown[]).push({ tokenId: 2 }); },
    },
    {
      name: "Rotini project drift",
      expected: /project 0 reserved must be 0/,
      mutate: ({ rotini }) => { rotini.project0.reserved = 1; },
    },
    {
      name: "Rotini authorization drift",
      expected: /authorized pack minters must be empty/,
      mutate: ({ rotini }) => { (rotini.authorizedPackMinters as unknown[]).push(RAVIOLI_ROUTER); },
    },
  ];
  for (const current of cases) {
    await t.test(current.name, async () => {
      const snapshots = liveSnapshots(evidence);
      snapshots.gnocchi.activeOperators = [mode0RecoveryOperatorRow()];
      current.mutate(snapshots);
      await assert.rejects(
        recheckRavioliDependenciesForMode0Replay(
          evidence,
          {
            readGnocchi: async () => snapshots.gnocchi,
            readRotini: async () => snapshots.rotini,
          },
          {
            routerAddress: RAVIOLI_ROUTER,
            appliedLevel: RAVIOLI_OPERATOR_APPLIED_LEVEL,
          },
          { now: "2026-07-22T12:00:00.000Z" },
        ),
        current.expected,
      );
    });
  }
});

test("live recheck rejects every stale capacity, timing, reservation, authorization, and script condition", async (t) => {
  const fixture = await createFixture(t);
  const evidence = await loadFixture(fixture);
  const cases: Array<{
    name: string;
    expected: RegExp;
    mutate: (snapshots: ReturnType<typeof liveSnapshots>) => void;
  }> = [
    { name: "Gnocchi script drift", expected: /live Gnocchi script identity/, mutate: ({ gnocchi }) => { gnocchi.scriptSha256 = "0".repeat(64); } },
    { name: "Gnocchi code drift", expected: /live Gnocchi Michelson code identity/, mutate: ({ gnocchi }) => { gnocchi.scriptCodeSha256 = "0".repeat(64); } },
    { name: "Gnocchi escrow depletion", expected: /token 0 escrow balance must be 2/, mutate: ({ gnocchi }) => { (gnocchi.creatorEscrowBalances as JsonObject)["0"] = 1; } },
    { name: "Gnocchi token inactive", expected: /token 2 active flag must be true/, mutate: ({ gnocchi }) => { gnocchi.token2.active = false; } },
    { name: "Gnocchi policy unlocked", expected: /token 2 policy lock must be true/, mutate: ({ gnocchi }) => { gnocchi.token2.policyLocked = false; } },
    { name: "Gnocchi wrong cap", expected: /token 2 max supply must be 4/, mutate: ({ gnocchi }) => { gnocchi.token2.maxSupply = 3; } },
    { name: "Gnocchi wrong minted", expected: /token 2 total minted must be 3/, mutate: ({ gnocchi }) => { gnocchi.token2.totalMinted = 2; } },
    { name: "Gnocchi reserved capacity", expected: /token 2 total reserved must be 0/, mutate: ({ gnocchi }) => { gnocchi.token2.totalReserved = 1; } },
    { name: "Gnocchi start drift", expected: /committed start/, mutate: ({ gnocchi }) => { gnocchi.token2.start = "2026-07-22T13:00:00.000Z"; } },
    { name: "Gnocchi end drift", expected: /committed end/, mutate: ({ gnocchi }) => { gnocchi.token2.end = "2026-07-22T12:00:00.000Z"; } },
    { name: "Gnocchi operator remains", expected: /active operators must be empty/, mutate: ({ gnocchi }) => { (gnocchi.activeOperators as unknown[]).push({ owner: CREATOR }); } },
    { name: "Gnocchi minter remains", expected: /authorized minters must be empty/, mutate: ({ gnocchi }) => { (gnocchi.authorizedMinters as unknown[]).push(ROTINI); } },
    { name: "Gnocchi reservation remains", expected: /reserved mints must be empty/, mutate: ({ gnocchi }) => { (gnocchi.reservedMints as unknown[]).push({ tokenId: 2 }); } },
    { name: "Rotini script drift", expected: /live Rotini script identity/, mutate: ({ rotini }) => { rotini.scriptSha256 = "0".repeat(64); } },
    { name: "Rotini code drift", expected: /live Rotini Michelson code identity/, mutate: ({ rotini }) => { rotini.scriptCodeSha256 = "0".repeat(64); } },
    { name: "Rotini wrong next token", expected: /next token id must be 3/, mutate: ({ rotini }) => { rotini.nextTokenId = 4; } },
    { name: "Rotini inactive project", expected: /project 0 active flag must be true/, mutate: ({ rotini }) => { rotini.project0.active = false; } },
    { name: "Rotini paid project", expected: /project 0 price must be 0/, mutate: ({ rotini }) => { rotini.project0.priceMutez = 1; } },
    { name: "Rotini wrong cap", expected: /project 0 max supply must be 4/, mutate: ({ rotini }) => { rotini.project0.maxSupply = 3; } },
    { name: "Rotini wrong minted", expected: /project 0 minted must be 1/, mutate: ({ rotini }) => { rotini.project0.minted = 2; } },
    { name: "Rotini reserved capacity", expected: /project 0 reserved must be 0/, mutate: ({ rotini }) => { rotini.project0.reserved = 1; } },
    { name: "Rotini operator remains", expected: /active operators must be empty/, mutate: ({ rotini }) => { (rotini.activeOperators as unknown[]).push({ owner: CREATOR }); } },
    { name: "Rotini pack minter remains", expected: /authorized pack minters must be empty/, mutate: ({ rotini }) => { (rotini.authorizedPackMinters as unknown[]).push(GNOCCHI); } },
    { name: "Rotini open reservation remains", expected: /open reservations must be empty/, mutate: ({ rotini }) => { (rotini.openReservations as unknown[]).push({ reservationId: 3 }); } },
    { name: "Rotini pack reservation remains", expected: /pack reservations must be empty/, mutate: ({ rotini }) => { (rotini.packReservations as unknown[]).push({ projectId: 0 }); } },
  ];
  for (const current of cases) {
    await t.test(current.name, async () => {
      const snapshots = liveSnapshots(evidence);
      current.mutate(snapshots);
      await assert.rejects(recheckFreshRavioliDependencies(evidence, {
        readGnocchi: async () => snapshots.gnocchi,
        readRotini: async () => snapshots.rotini,
      }, { now: "2026-07-22T12:00:00.000Z" }), current.expected);
    });
  }
  await t.test("Gnocchi committed sale expired", async () => {
    const snapshots = liveSnapshots(evidence);
    await assert.rejects(recheckFreshRavioliDependencies(evidence, {
      readGnocchi: async () => snapshots.gnocchi,
      readRotini: async () => snapshots.rotini,
    }, { now: evidence.gnocchi.token2LimitedEdition.end }), /sale is expired/);
  });
});
