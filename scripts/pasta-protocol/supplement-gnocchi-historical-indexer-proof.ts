#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  ValidationResult,
  validateAddress,
  validateContractAddress,
  validateOperation,
} from "@taquito/utils";

import { validateAppManifest } from "./assemble-proof-package.mjs";
import {
  deterministicJsonBytes,
  fetchJson,
  normalizeBase,
  pinIpfsProofJson,
  resolveIpfsProofConfig,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_TZKT_API,
  type IpfsPinnedProof,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_GNOCCHI_HISTORICAL_PROOF_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const USER_AGENT = "wtfos-pasta-gnocchi-historical-proof";
const MAX_BALANCE_ROWS = 10_000;
const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_NAT = /^(?:0|[1-9][0-9]*)$/;

export const GNOCCHI_HISTORICAL_INDEXER_SCHEMA =
  "pastaprotocol-gnocchi-historical-indexer-proof@1";
export const GNOCCHI_HISTORICAL_ARTIFACT_ID = "gnocchi-proof-time-indexer-snapshot";
export const GNOCCHI_HISTORICAL_ARTIFACT_PATH =
  "artifacts/gnocchi-proof-time-indexer-snapshot.json";

type ManifestOperation = {
  hash: string;
  kind: string;
  contractAddress: string;
  entrypoint?: string;
  status: string;
};

type ManifestToken = {
  id: string;
  contractAddress: string;
  tokenId: string;
  [key: string]: unknown;
};

type GnocchiManifest = {
  schema: string;
  app: string;
  role: string;
  runId: string;
  capturedAt: string;
  network: { name: string; chainId: string; rpcUrl: string };
  operations: ManifestOperation[];
  tokens: ManifestToken[];
  artifacts: Array<Record<string, unknown>>;
  capabilities: Array<{
    id: string;
    evidence: {
      artifacts: string[];
      tokens: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type TzktProofFetchResult = {
  status: number;
  json: unknown;
  text: string;
};

export type TzktProofFetch = (url: string) => Promise<TzktProofFetchResult>;

type RequestProof = {
  method: "GET";
  url: string;
  sha256: string;
};

type ResponseProof = {
  status: number;
  byteCount: number;
  rawSha256: string;
  canonicalSha256: string;
};

type NormalizedBalance = {
  account: string;
  balance: string;
};

type TokenState = {
  balances: NormalizedBalance[];
  totalSupply: string;
  holdersCount: number;
};

type AcceptedOperationProof = {
  hash: string;
  kind: string;
  contractAddress: string;
  entrypoint: string | null;
  status: "applied";
  level: number;
  request: RequestProof;
  response: ResponseProof;
};

type TokenHistoricalProof = {
  tokenId: string;
  proofState: TokenState;
  historicalRequest: {
    request: RequestProof;
    response: ResponseProof;
  };
  currentComparison: {
    state: TokenState;
    request: RequestProof;
    response: ResponseProof;
    mutationDetected: boolean;
    changes: Array<{ account: string; proofBalance: string; currentBalance: string }>;
  };
};

export type GnocchiHistoricalIndexerArtifact = {
  schema: typeof GNOCCHI_HISTORICAL_INDEXER_SCHEMA;
  app: "gnocchi";
  network: {
    name: "shadownet";
    chainId: typeof SHADOWNET_CHAIN_ID;
    tzktApiBase: string;
  };
  sourceManifest: {
    runId: string;
    capturedAt: string;
    preSupplementSha256: string;
    acceptedOperationsSha256: string;
    tokenIdentitiesSha256: string;
  };
  contractAddress: string;
  proofLevel: number;
  terminalAcceptedOperation: {
    hash: string;
    level: number;
  };
  acceptedOperations: AcceptedOperationProof[];
  tokens: TokenHistoricalProof[];
};

type HistoricalArtifactManifestRecord = {
  id: string;
  kind: "historical-indexer-snapshot";
  path: string;
  sha256: string;
  ipfsUri: string;
  gatewayUrl: string;
  retrievedSha256: string;
};

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safePositiveLevel(value: unknown, label: string): number {
  const level = Number(value);
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return level;
}

function canonicalNat(value: unknown, label: string): string {
  const text = String(value ?? "");
  if (!CANONICAL_NAT.test(text)) throw new Error(`${label} must be a canonical nat string`);
  return text;
}

function requestProof(url: string): RequestProof {
  const method = "GET" as const;
  return {
    method,
    url,
    sha256: sha256Hex(`${method}\n${url}\n`),
  };
}

function responseProof(response: TzktProofFetchResult): ResponseProof {
  return {
    status: response.status,
    byteCount: Buffer.byteLength(response.text, "utf8"),
    rawSha256: sha256Hex(response.text),
    canonicalSha256: sha256Hex(deterministicJsonBytes(response.json)),
  };
}

async function requireJson(
  fetcher: TzktProofFetch,
  url: string,
  label: string,
): Promise<{ json: unknown; request: RequestProof; response: ResponseProof }> {
  const result = await fetcher(url);
  if (!Number.isSafeInteger(result.status) || result.status < 200 || result.status >= 300) {
    throw new Error(`${label} failed with HTTP ${result.status}: ${result.text.slice(0, 300)}`);
  }
  if (result.json === null || result.json === undefined) {
    throw new Error(`${label} returned no JSON`);
  }
  return {
    json: result.json,
    request: requestProof(url),
    response: responseProof(result),
  };
}

function operationTarget(record: any): string | null {
  return record?.type === "origination"
    ? record?.originatedContract?.address ?? null
    : record?.target?.address ?? null;
}

function operationEntrypoint(record: any): string | null {
  return record?.parameter?.entrypoint ?? null;
}

function operationMatches(record: any, operation: ManifestOperation): boolean {
  if (record?.hash !== operation.hash || record?.status !== "applied") return false;
  if (operationTarget(record) !== operation.contractAddress) return false;
  if (operation.kind === "origination") {
    return record?.type === "origination" && operationEntrypoint(record) === null;
  }
  return record?.type === "transaction" && operationEntrypoint(record) === operation.entrypoint;
}

function normalizeBalances(
  json: unknown,
  contractAddress: string,
  tokenId: string,
  label: string,
): TokenState {
  if (!Array.isArray(json)) throw new Error(`${label} must return a JSON array`);
  if (json.length >= MAX_BALANCE_ROWS) {
    throw new Error(`${label} reached the ${MAX_BALANCE_ROWS}-row proof limit; pagination is required`);
  }
  const balances = new Map<string, bigint>();
  for (let index = 0; index < json.length; index += 1) {
    const row = json[index] as any;
    const account = String(row?.account?.address ?? "");
    if (validateAddress(account) !== ValidationResult.VALID) {
      throw new Error(`${label}[${index}] has invalid account ${account}`);
    }
    if (row?.token?.contract?.address !== contractAddress || String(row?.token?.tokenId) !== tokenId) {
      throw new Error(`${label}[${index}] identifies the wrong contract/token`);
    }
    const balanceText = canonicalNat(row?.balance, `${label}[${index}].balance`);
    const balance = BigInt(balanceText);
    if (balance === 0n) continue;
    if (balances.has(account)) throw new Error(`${label} repeats account ${account}`);
    balances.set(account, balance);
  }
  const normalized = [...balances]
    .map(([account, balance]) => ({ account, balance: balance.toString() }))
    .sort((left, right) => compareText(left.account, right.account));
  const totalSupply = normalized
    .reduce((sum, entry) => sum + BigInt(entry.balance), 0n)
    .toString();
  return {
    balances: normalized,
    totalSupply,
    holdersCount: normalized.length,
  };
}

function balanceChanges(
  proof: TokenState,
  current: TokenState,
): Array<{ account: string; proofBalance: string; currentBalance: string }> {
  const proofByAccount = new Map(proof.balances.map((entry) => [entry.account, entry.balance]));
  const currentByAccount = new Map(current.balances.map((entry) => [entry.account, entry.balance]));
  return [...new Set([...proofByAccount.keys(), ...currentByAccount.keys()])]
    .sort(compareText)
    .flatMap((account) => {
      const proofBalance = proofByAccount.get(account) ?? "0";
      const currentBalance = currentByAccount.get(account) ?? "0";
      return proofBalance === currentBalance ? [] : [{ account, proofBalance, currentBalance }];
    });
}

function validateManifestInput(manifest: GnocchiManifest): void {
  if (manifest.schema !== "pastaprotocol-app-proof@1" || manifest.app !== "gnocchi") {
    throw new Error("historical supplement requires a Gnocchi pastaprotocol-app-proof@1 manifest");
  }
  if (manifest.network?.name !== "shadownet" || manifest.network?.chainId !== SHADOWNET_CHAIN_ID) {
    throw new Error(`Gnocchi manifest must target Shadownet ${SHADOWNET_CHAIN_ID}`);
  }
  if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) {
    throw new Error("Gnocchi manifest must contain accepted operations");
  }
  if (!Array.isArray(manifest.tokens) || manifest.tokens.length === 0) {
    throw new Error("Gnocchi manifest must contain token identities");
  }
  const contractAddresses = new Set(manifest.tokens.map((token) => token.contractAddress));
  if (contractAddresses.size !== 1) throw new Error("Gnocchi historical proof requires one token contract");
  const contractAddress = [...contractAddresses][0];
  if (validateContractAddress(contractAddress) !== ValidationResult.VALID) {
    throw new Error(`Gnocchi token contract is invalid: ${contractAddress}`);
  }
  for (const operation of manifest.operations) {
    if (validateOperation(operation.hash) !== ValidationResult.VALID) {
      throw new Error(`Gnocchi operation hash is invalid: ${operation.hash}`);
    }
    if (operation.status !== "applied" || operation.contractAddress !== contractAddress) {
      throw new Error(`Gnocchi accepted operation ${operation.hash} has inconsistent status/contract`);
    }
    if (operation.kind !== "origination" && !operation.entrypoint) {
      throw new Error(`Gnocchi accepted operation ${operation.hash} is missing its entrypoint`);
    }
  }
  for (const token of manifest.tokens) {
    if (!CANONICAL_NAT.test(token.tokenId)) {
      throw new Error(`Gnocchi token id must be canonical: ${token.tokenId}`);
    }
  }
}

export async function buildGnocchiHistoricalIndexerArtifact(input: {
  manifest: GnocchiManifest;
  sourceManifestSha256: string;
  tzktApiBase?: string;
  fetcher: TzktProofFetch;
}): Promise<GnocchiHistoricalIndexerArtifact> {
  validateManifestInput(input.manifest);
  if (!SHA256.test(input.sourceManifestSha256)) {
    throw new Error("sourceManifestSha256 must be a lowercase SHA-256 digest");
  }
  const tzktApiBase = normalizeBase(input.tzktApiBase || SHADOWNET_TZKT_API);
  const tzktApiUrl = new URL(tzktApiBase);
  if (tzktApiUrl.protocol !== "https:" || tzktApiUrl.hostname !== "api.shadownet.tzkt.io") {
    throw new Error("historical supplement requires the official Shadownet TzKT HTTPS API");
  }
  const contractAddress = input.manifest.tokens[0].contractAddress;
  const acceptedOperations: AcceptedOperationProof[] = [];
  for (const operation of input.manifest.operations) {
    const url = `${tzktApiBase}/operations/${encodeURIComponent(operation.hash)}`;
    const fetched = await requireJson(input.fetcher, url, `accepted operation ${operation.hash}`);
    const records = Array.isArray(fetched.json) ? fetched.json : [];
    const match = records.find((record) => operationMatches(record, operation)) as any;
    if (!match) {
      throw new Error(`no applied TzKT record matching accepted operation ${operation.hash}`);
    }
    acceptedOperations.push({
      hash: operation.hash,
      kind: operation.kind,
      contractAddress: operation.contractAddress,
      entrypoint: operation.entrypoint ?? null,
      status: "applied",
      level: safePositiveLevel(match.level, `operation ${operation.hash} level`),
      request: fetched.request,
      response: fetched.response,
    });
  }
  const proofLevel = Math.max(...acceptedOperations.map((operation) => operation.level));
  const terminalAcceptedOperation = [...acceptedOperations]
    .reverse()
    .find((operation) => operation.level === proofLevel)!;

  const tokens: TokenHistoricalProof[] = [];
  const sortedTokens = [...input.manifest.tokens].sort((left, right) => {
    const leftId = BigInt(left.tokenId);
    const rightId = BigInt(right.tokenId);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  for (const token of sortedTokens) {
    const historicalUrl = new URL(`${tzktApiBase}/tokens/historical_balances/${proofLevel}`);
    historicalUrl.searchParams.set("token.contract", contractAddress);
    historicalUrl.searchParams.set("token.tokenId", token.tokenId);
    historicalUrl.searchParams.set("limit", String(MAX_BALANCE_ROWS));
    const historical = await requireJson(
      input.fetcher,
      historicalUrl.toString(),
      `historical balances for token ${token.tokenId}`,
    );
    const proofState = normalizeBalances(
      historical.json,
      contractAddress,
      token.tokenId,
      `historical balances for token ${token.tokenId}`,
    );

    const currentUrl = new URL(`${tzktApiBase}/tokens/balances`);
    currentUrl.searchParams.set("token.contract", contractAddress);
    currentUrl.searchParams.set("token.tokenId", token.tokenId);
    currentUrl.searchParams.set("balance.gt", "0");
    currentUrl.searchParams.set("limit", String(MAX_BALANCE_ROWS));
    const current = await requireJson(
      input.fetcher,
      currentUrl.toString(),
      `current balances for token ${token.tokenId}`,
    );
    const currentState = normalizeBalances(
      current.json,
      contractAddress,
      token.tokenId,
      `current balances for token ${token.tokenId}`,
    );
    const changes = balanceChanges(proofState, currentState);
    tokens.push({
      tokenId: token.tokenId,
      proofState,
      historicalRequest: {
        request: historical.request,
        response: historical.response,
      },
      currentComparison: {
        state: currentState,
        request: current.request,
        response: current.response,
        mutationDetected: changes.length > 0,
        changes,
      },
    });
  }

  return {
    schema: GNOCCHI_HISTORICAL_INDEXER_SCHEMA,
    app: "gnocchi",
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      tzktApiBase,
    },
    sourceManifest: {
      runId: input.manifest.runId,
      capturedAt: input.manifest.capturedAt,
      preSupplementSha256: input.sourceManifestSha256,
      acceptedOperationsSha256: sha256Hex(deterministicJsonBytes(input.manifest.operations)),
      tokenIdentitiesSha256: sha256Hex(deterministicJsonBytes(
        input.manifest.tokens.map((token) => ({
          id: token.id,
          contractAddress: token.contractAddress,
          tokenId: token.tokenId,
        })),
      )),
    },
    contractAddress,
    proofLevel,
    terminalAcceptedOperation: {
      hash: terminalAcceptedOperation.hash,
      level: proofLevel,
    },
    acceptedOperations,
    tokens,
  };
}

export function applyHistoricalSnapshotToManifest(
  manifest: GnocchiManifest,
  artifact: GnocchiHistoricalIndexerArtifact,
  artifactRecord: HistoricalArtifactManifestRecord,
): GnocchiManifest {
  validateManifestInput(manifest);
  if (artifact.schema !== GNOCCHI_HISTORICAL_INDEXER_SCHEMA || artifact.app !== "gnocchi") {
    throw new Error("invalid Gnocchi historical indexer artifact");
  }
  if (manifest.artifacts.some((entry) => entry.id === artifactRecord.id)) {
    throw new Error(`manifest already contains historical artifact ${artifactRecord.id}`);
  }
  const snapshotByToken = new Map(artifact.tokens.map((token) => [token.tokenId, token]));
  const updated = structuredClone(manifest);
  updated.artifacts.push(artifactRecord);
  updated.tokens = updated.tokens.map((token) => {
    const snapshot = snapshotByToken.get(token.tokenId);
    if (!snapshot) throw new Error(`historical artifact omits token ${token.tokenId}`);
    return {
      ...token,
      historicalStateArtifactId: artifactRecord.id,
      proofLevel: artifact.proofLevel,
      proofTotalSupply: snapshot.proofState.totalSupply,
      proofHoldersCount: snapshot.proofState.holdersCount,
    };
  });
  const tokenIds = new Set(updated.tokens.map((token) => token.id));
  const owningCapability = updated.capabilities.find((capability) =>
    [...tokenIds].every((tokenId) => capability.evidence.tokens.includes(tokenId)));
  if (!owningCapability) {
    throw new Error("no Gnocchi capability covers every token in the historical snapshot");
  }
  if (!owningCapability.evidence.artifacts.includes(artifactRecord.id)) {
    owningCapability.evidence.artifacts.push(artifactRecord.id);
  }
  return updated;
}

export function assertGnocchiHistoricalSupplementAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    throw new Error(`explicit historical supplement flag ${EXECUTE_FLAG}=1 is required`);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    throw new Error("Gnocchi historical supplement only permits Shadownet");
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    throw new Error(`${OUTPUT_ENV} must identify the aggregate Pasta proof-run root`);
  }
}

async function defaultFetcher(url: string): Promise<TzktProofFetchResult> {
  return fetchJson(url, USER_AGENT);
}

export async function supplementGnocchiHistoricalIndexerProof(input: {
  runRoot: string;
  tzktApiBase?: string;
  fetcher?: TzktProofFetch;
  pinJson?: (value: unknown) => Promise<IpfsPinnedProof>;
}): Promise<{
  app: "gnocchi";
  proofLevel: number;
  artifactPath: string;
  artifactSha256: string;
  artifactCid: string;
  publicGatewayUrl: string;
  manifestPath: string;
  manifestSha256: string;
  validation: "PASSED";
}> {
  const runRoot = path.resolve(input.runRoot);
  const appRoot = path.join(runRoot, "gnocchi");
  const manifestPath = path.join(appRoot, "manifest.json");
  const artifactPath = path.join(appRoot, GNOCCHI_HISTORICAL_ARTIFACT_PATH);
  const originalManifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(originalManifestBytes.toString("utf8")) as GnocchiManifest;
  validateManifestInput(manifest);
  try {
    await stat(artifactPath);
    throw new Error(`refusing to overwrite existing historical proof ${artifactPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const artifact = await buildGnocchiHistoricalIndexerArtifact({
    manifest,
    sourceManifestSha256: sha256Hex(originalManifestBytes),
    tzktApiBase: input.tzktApiBase,
    fetcher: input.fetcher || defaultFetcher,
  });
  const artifactBytes = deterministicJsonBytes(artifact);
  const pin = input.pinJson
    ? await input.pinJson(artifact)
    : await pinIpfsProofJson({
        value: artifact,
        fileName: "gnocchi-proof-time-indexer-snapshot.json",
        options: resolveIpfsProofConfig(),
      });
  assert.equal(pin.publicGatewayVerified, true);
  assert.equal(pin.sha256, sha256Hex(artifactBytes), "pinned historical proof bytes differ from canonical artifact");
  const artifactRecord: HistoricalArtifactManifestRecord = {
    id: GNOCCHI_HISTORICAL_ARTIFACT_ID,
    kind: "historical-indexer-snapshot",
    path: GNOCCHI_HISTORICAL_ARTIFACT_PATH,
    sha256: pin.sha256,
    ipfsUri: pin.uri,
    gatewayUrl: pin.publicGatewayUrl,
    retrievedSha256: pin.sha256,
  };
  const updatedManifest = applyHistoricalSnapshotToManifest(manifest, artifact, artifactRecord);
  const updatedManifestBytes = Buffer.from(`${JSON.stringify(updatedManifest, null, 2)}\n`, "utf8");

  await mkdir(path.dirname(artifactPath), { recursive: true });
  try {
    await writeFile(artifactPath, artifactBytes);
    await writeFile(manifestPath, updatedManifestBytes);
    await validateAppManifest(runRoot, "gnocchi");
  } catch (error) {
    await writeFile(manifestPath, originalManifestBytes);
    await rm(artifactPath, { force: true });
    throw error;
  }

  return {
    app: "gnocchi",
    proofLevel: artifact.proofLevel,
    artifactPath,
    artifactSha256: pin.sha256,
    artifactCid: pin.cid,
    publicGatewayUrl: pin.publicGatewayUrl,
    manifestPath,
    manifestSha256: sha256Hex(updatedManifestBytes),
    validation: "PASSED",
  };
}

async function main(): Promise<void> {
  assertGnocchiHistoricalSupplementAllowed(process.env);
  const result = await supplementGnocchiHistoricalIndexerProof({
    runRoot: process.env[OUTPUT_ENV]!,
  });
  console.log(JSON.stringify(result, null, 2));
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCli) {
  main().catch((error) => {
    console.error(`[gnocchi-historical-proof] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
