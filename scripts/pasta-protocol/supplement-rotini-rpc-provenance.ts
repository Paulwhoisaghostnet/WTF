#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateAppManifest } from "./assemble-proof-package.mjs";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  deterministicJsonBytes,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
} from "./shadownet-proof-kit";

export const ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG =
  "PASTA_SHADOWNET_ROTINI_RPC_SUPPLEMENT_EXECUTE";
export const ROTINI_RPC_SUPPLEMENT_SCHEMA =
  "pastaprotocol-rotini-rpc-provenance@1";
export const ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID = "rotini-rpc-provenance";
export const ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH =
  "artifacts/rotini-rpc-provenance.json";

type JsonObject = Record<string, any>;
type FetchLike = typeof fetch;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeBase(value: string): string {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", "Rotini RPC provenance requires HTTPS endpoints");
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/+$/, "");
}

async function fetchRpcJson(
  fetchImpl: FetchLike,
  rpcUrl: string,
  rpcPath: string,
  label: string,
): Promise<any> {
  const response = await fetchImpl(`${normalizeBase(rpcUrl)}${rpcPath}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return response.json();
}

function safeProofLevel(reconciliation: JsonObject): number {
  const operations = Array.isArray(reconciliation.operations)
    ? reconciliation.operations
    : [];
  assert.ok(operations.length > 0, "Rotini reconciliation has no accepted operations");
  const levels = operations.map((operation: JsonObject) => Number(operation.level));
  assert.ok(
    levels.every((level: number) => Number.isSafeInteger(level) && level > 0),
    "Rotini reconciliation contains an invalid operation level",
  );
  return Math.max(...levels);
}

async function probeRpcEndpoint(input: {
  fetchImpl: FetchLike;
  rpcUrl: string;
  contractAddress: string;
  proofLevel: number;
}): Promise<JsonObject> {
  const encodedContract = encodeURIComponent(input.contractAddress);
  const encodedLevel = encodeURIComponent(String(input.proofLevel));
  const [chainId, blockHash, header, script] = await Promise.all([
    fetchRpcJson(input.fetchImpl, input.rpcUrl, "/chains/main/chain_id", "Rotini RPC chain id"),
    fetchRpcJson(input.fetchImpl, input.rpcUrl, `/chains/main/blocks/${encodedLevel}/hash`, "Rotini RPC block hash"),
    fetchRpcJson(input.fetchImpl, input.rpcUrl, `/chains/main/blocks/${encodedLevel}/header`, "Rotini RPC block header"),
    fetchRpcJson(
      input.fetchImpl,
      input.rpcUrl,
      `/chains/main/blocks/${encodedLevel}/context/contracts/${encodedContract}/script`,
      "Rotini RPC contract script",
    ),
  ]);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, "Rotini RPC endpoint is not Shadownet");
  assert.match(String(blockHash), /^B[1-9A-HJ-NP-Za-km-z]{20,}$/,
    "Rotini RPC block hash is invalid");
  assert.equal(Number(header?.level), input.proofLevel, "Rotini RPC header level drift");
  assert.ok(
    typeof header?.timestamp === "string" && Number.isFinite(Date.parse(header.timestamp)),
    "Rotini RPC header timestamp is invalid",
  );
  assert.ok(Array.isArray(script?.code), "Rotini RPC contract code is missing");
  assert.notEqual(script?.storage, undefined, "Rotini RPC contract storage is missing");
  return {
    url: `${normalizeBase(input.rpcUrl)}/`,
    chainId,
    proofLevel: input.proofLevel,
    blockHash: String(blockHash),
    blockTimestamp: String(header.timestamp),
    codeSha256: hashMichelsonScriptCode(script.code),
    storageSha256: sha256(deterministicJsonBytes(script.storage)),
  };
}

export async function buildRotiniRpcProvenance(input: {
  manifestBytes: Uint8Array;
  manifest: JsonObject;
  reconciliation: JsonObject;
  fetchImpl?: FetchLike;
  observedAt?: string;
  primaryRpcUrl?: string;
  fallbackRpcUrl?: string;
}): Promise<JsonObject> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const contractAddress = String(input.reconciliation?.contract?.address || "");
  assert.match(contractAddress, /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/,
    "Rotini reconciliation contract address is invalid");
  assert.equal(input.reconciliation.chainId, SHADOWNET_CHAIN_ID,
    "Rotini reconciliation is not Shadownet");
  assert.equal(input.manifest.app, "rotini", "Rotini RPC supplement received another app");
  assert.equal(input.manifest.network?.chainId, SHADOWNET_CHAIN_ID,
    "Rotini source manifest is not Shadownet");
  assert.equal(input.manifest.network?.rpcUrl, null,
    "Rotini source manifest must retain its explicit missing-RPC boundary");
  assert.ok(
    Array.isArray(input.manifest.contracts)
      && input.manifest.contracts.some((contract: JsonObject) => contract.address === contractAddress),
    "Rotini source manifest does not contain the reconciled contract",
  );
  const proofLevel = safeProofLevel(input.reconciliation);
  const [primary, fallback] = await Promise.all([
    probeRpcEndpoint({
      fetchImpl,
      rpcUrl: input.primaryRpcUrl ?? SHADOWNET_RPC_PRIMARY,
      contractAddress,
      proofLevel,
    }),
    probeRpcEndpoint({
      fetchImpl,
      rpcUrl: input.fallbackRpcUrl ?? SHADOWNET_RPC_FALLBACK,
      contractAddress,
      proofLevel,
    }),
  ]);
  assert.notEqual(new URL(primary.url).origin, new URL(fallback.url).origin,
    "Rotini RPC provenance requires independent endpoint origins");
  assert.equal(primary.blockHash, fallback.blockHash,
    "Rotini RPC endpoints disagree on the proof block hash");
  assert.equal(primary.blockTimestamp, fallback.blockTimestamp,
    "Rotini RPC endpoints disagree on the proof block timestamp");
  assert.equal(primary.codeSha256, fallback.codeSha256,
    "Rotini RPC endpoints disagree on contract code");
  assert.equal(primary.storageSha256, fallback.storageSha256,
    "Rotini RPC endpoints disagree on contract storage");
  assert.equal(
    primary.codeSha256,
    input.reconciliation?.contract?.artifactCodeSha256,
    "Rotini RPC code differs from the accepted compiler artifact",
  );
  const observedAt = input.observedAt ?? new Date().toISOString();
  assert.ok(Number.isFinite(Date.parse(observedAt)), "Rotini RPC observedAt is invalid");
  return {
    schema: ROTINI_RPC_SUPPLEMENT_SCHEMA,
    observedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    sourceManifest: {
      runId: input.manifest.runId,
      capturedAt: input.manifest.capturedAt,
      sha256: sha256(input.manifestBytes),
      rpcUrl: null,
    },
    contract: {
      address: contractAddress,
      proofLevel,
      artifactCodeSha256: input.reconciliation.contract.artifactCodeSha256,
    },
    endpoints: { primary, fallback },
    agreement: {
      sameChain: true,
      sameBlock: true,
      sameCode: true,
      sameStorage: true,
      exactArtifactCode: true,
    },
    safety: "Signer-free historical block probes authenticate the configured Shadownet RPC origin recorded in the recovered Rotini manifest; no token, contract, IPFS, or chain state is changed.",
  };
}

async function durableCreate(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function durableReplace(filePath: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${filePath}.next`;
  await rm(temporary, { force: true });
  await durableCreate(temporary, bytes);
  await rename(temporary, filePath);
  const directory = await open(path.dirname(filePath), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function supplementedManifest(
  manifest: JsonObject,
  artifactSha256: string,
  primaryRpcUrl: string,
  checkpointArtifacts: JsonObject[],
): JsonObject {
  assert.ok(Array.isArray(manifest.artifacts), "Rotini manifest artifacts are missing");
  assert.ok(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0,
    "Rotini manifest capabilities are missing");
  assert.equal(
    manifest.artifacts.some((artifact: JsonObject) => artifact.id === ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID),
    false,
    "Rotini manifest already contains a conflicting RPC supplement artifact",
  );
  const capabilities = manifest.capabilities.map((capability: JsonObject, index: number) => {
    if (index !== 0) return capability;
    const artifactIds = capability?.evidence?.artifacts;
    assert.ok(Array.isArray(artifactIds), "Rotini capability artifact evidence is missing");
    return {
      ...capability,
      evidence: {
        ...capability.evidence,
        artifacts: [
          ...artifactIds,
          ...checkpointArtifacts.map((artifact) => artifact.id),
          ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID,
        ],
      },
    };
  });
  return {
    ...manifest,
    network: { ...manifest.network, rpcUrl: `${normalizeBase(primaryRpcUrl)}/` },
    artifacts: [...manifest.artifacts, ...checkpointArtifacts, {
      id: ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID,
      kind: "rpc-provenance",
      path: ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH,
      sha256: artifactSha256,
      durability: "package-only",
    }],
    capabilities,
  };
}

async function undeclaredCheckpointArtifacts(
  appRoot: string,
  manifest: JsonObject,
): Promise<JsonObject[]> {
  const checkpointRoot = path.join(appRoot, "artifacts", "rotini-ui-live-checkpoint");
  const declared = new Set(
    (Array.isArray(manifest.artifacts) ? manifest.artifacts : [])
      .map((artifact: JsonObject) => String(artifact.path || "")),
  );
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      assert.equal(entry.isSymbolicLink(), false,
        "Rotini checkpoint supplement forbids symbolic links");
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        assert.equal(entry.isFile(), true,
          "Rotini checkpoint supplement accepts regular files only");
        files.push(absolute);
      }
    }
  };
  await visit(checkpointRoot);
  const artifacts: JsonObject[] = [];
  for (const absolute of files) {
    const relative = path.relative(appRoot, absolute).split(path.sep).join("/");
    if (declared.has(relative)) continue;
    const checkpointRelative = path.relative(checkpointRoot, absolute).split(path.sep).join("/");
    const id = `rotini-checkpoint-${checkpointRelative}`
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    assert.match(id, /^[a-z0-9][a-z0-9._-]{0,127}$/,
      `Rotini checkpoint artifact id is invalid for ${relative}`);
    const bytes = await readFile(absolute);
    assert.ok(bytes.length > 0, `Rotini checkpoint artifact is empty: ${relative}`);
    artifacts.push({
      id,
      kind: checkpointRelative.startsWith("events/")
        ? "durable-checkpoint-event"
        : checkpointRelative.endsWith(".proof.json")
          ? "durable-checkpoint-pin-proof"
          : "durable-checkpoint-pin-bytes",
      path: relative,
      sha256: sha256(bytes),
      durability: "checkpoint",
    });
  }
  return artifacts;
}

async function validateCandidate(
  runRoot: string,
  appRoot: string,
  candidateBytes: Uint8Array,
): Promise<void> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "rotini-rpc-supplement-"));
  try {
    const temporaryApp = path.join(temporaryRoot, "rotini");
    await cp(appRoot, temporaryApp, { recursive: true, force: false, errorOnExist: true });
    await durableReplace(path.join(temporaryApp, "manifest.json"), candidateBytes);
    await validateAppManifest(temporaryRoot, "rotini");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  assert.ok(path.isAbsolute(runRoot));
}

export async function applyRotiniRpcSupplement(input: {
  runRoot: string;
  fetchImpl?: FetchLike;
  observedAt?: string;
  primaryRpcUrl?: string;
  fallbackRpcUrl?: string;
}): Promise<JsonObject> {
  const runRoot = path.resolve(input.runRoot);
  const appRoot = path.join(runRoot, "rotini");
  const manifestPath = path.join(appRoot, "manifest.json");
  const artifactPath = path.join(appRoot, ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const existingArtifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((artifact: JsonObject) => artifact.id === ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID)
    : null;
  if (existingArtifact) {
    assert.equal(manifest.network?.rpcUrl, `${normalizeBase(input.primaryRpcUrl ?? SHADOWNET_RPC_PRIMARY)}/`);
    const bytes = await readFile(artifactPath);
    assert.equal(sha256(bytes), existingArtifact.sha256,
      "Rotini RPC supplement artifact digest drift");
    const evidence = JSON.parse(bytes.toString("utf8"));
    assert.equal(evidence.schema, ROTINI_RPC_SUPPLEMENT_SCHEMA);
    await validateAppManifest(runRoot, "rotini");
    return { status: "ALREADY_SUPPLEMENTED", manifestPath, artifactPath, evidence };
  }
  const reconciliationPath = path.join(appRoot, "artifacts", "rotini-chain-reconciliation-snapshot.json");
  const reconciliation = JSON.parse((await readFile(reconciliationPath)).toString("utf8"));
  const evidence = await buildRotiniRpcProvenance({
    manifestBytes,
    manifest,
    reconciliation,
    fetchImpl: input.fetchImpl,
    observedAt: input.observedAt,
    primaryRpcUrl: input.primaryRpcUrl,
    fallbackRpcUrl: input.fallbackRpcUrl,
  });
  let evidenceBytes: Uint8Array;
  try {
    evidenceBytes = await readFile(artifactPath);
    const retained = JSON.parse(Buffer.from(evidenceBytes).toString("utf8"));
    assert.equal(retained.schema, ROTINI_RPC_SUPPLEMENT_SCHEMA,
      "retained Rotini RPC supplement schema drift");
    assert.equal(retained.sourceManifest?.sha256, sha256(manifestBytes),
      "retained Rotini RPC supplement belongs to another manifest boundary");
    assert.deepEqual(retained.contract, evidence.contract,
      "retained Rotini RPC supplement contract boundary drift");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    evidenceBytes = deterministicJsonBytes(evidence);
    await durableCreate(artifactPath, evidenceBytes);
  }
  const candidate = supplementedManifest(
    manifest,
    sha256(evidenceBytes),
    input.primaryRpcUrl ?? SHADOWNET_RPC_PRIMARY,
    await undeclaredCheckpointArtifacts(appRoot, manifest),
  );
  const candidateBytes = deterministicJsonBytes(candidate);
  await validateCandidate(runRoot, appRoot, candidateBytes);
  await durableReplace(manifestPath, candidateBytes);
  await validateAppManifest(runRoot, "rotini");
  return {
    status: "SUPPLEMENTED",
    manifestPath,
    artifactPath,
    rpcUrl: candidate.network.rpcUrl,
    proofLevel: evidence.contract.proofLevel,
    sourceManifestSha256: evidence.sourceManifest.sha256,
    artifactSha256: sha256(evidenceBytes),
  };
}

export function assertRotiniRpcSupplementAllowed(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  assert.equal(environment[ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG], "1",
    `${ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG}=1 is required for the local manifest supplement`);
  assert.equal(environment.TEZOS_NETWORK, "shadownet",
    "Rotini RPC supplement is Shadownet-only");
  const runRoot = String(environment.PASTA_PROOF_RUN_DIR || "").trim();
  assert.ok(runRoot, "PASTA_PROOF_RUN_DIR is required");
  return path.resolve(runRoot);
}

async function main(): Promise<void> {
  const runRoot = assertRotiniRpcSupplementAllowed(process.env);
  assert.ok((await stat(runRoot)).isDirectory(), "Pasta proof run root must be a directory");
  const result = await applyRotiniRpcSupplement({ runRoot });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
