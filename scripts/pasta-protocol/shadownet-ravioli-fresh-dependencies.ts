#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";
import {
  assertGnocchiTerminalSnapshotUnchanged,
  GNOCCHI_TERMINAL_OPERATION_PLAN,
  GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION,
  GNOCCHI_TERMINAL_RECOVERY_CONTRACT,
  GNOCCHI_TERMINAL_RECOVERY_CREATOR,
  GNOCCHI_TERMINAL_RECOVERY_RECEIPT_PATH,
  GNOCCHI_TERMINAL_RECOVERY_RUN_ID,
  type GnocchiTerminalImmutableSnapshot,
  validateGnocchiTerminalRecoveryReceipt,
} from "./shadownet-gnocchi-terminal-readonly-recovery";
import { openRotiniUiLiveCheckpoint } from "./shadownet-rotini-ui-live-checkpoint";
import {
  selectPortableSiteSubject,
  validatePortableSiteArchive,
} from "./supplement-portable-site-proofs";

export const FRESH_RAVIOLI_DEPENDENCY_SCHEMA = "pastaprotocol-ravioli-fresh-dependencies@1";
export const FRESH_RAVIOLI_NETWORK = "shadownet";
export const FRESH_RAVIOLI_CHAIN_ID = SHADOWNET_CHAIN_ID;
export const FRESH_GNOCCHI_RECEIPT_PATH = "artifacts/gnocchi-ui-live-run.json";
export const FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH = "artifacts/gnocchi-ui-readonly-finalization.json";
export const FRESH_ROTINI_RECEIPT_PATH = "artifacts/rotini-ui-live-run.json";
export const FRESH_ROTINI_RECOVERED_RECEIPT_PATH = "artifacts/rotini-ui-readonly-finalization.json";
const GNOCCHI_READ_ONLY_FINALIZATION_CLASSIFICATION = "UI-LIVE-READ-ONLY-FINALIZATION";
const GNOCCHI_CHECKPOINTED_RECOVERY_CLASSIFICATION = "UI-LIVE-RECOVERED-CHECKPOINTED";

export const GNOCCHI_TERMINAL_LIFECYCLE_STAGES = Object.freeze([
  "001-publish-three-edition-policies-timed-oe-configured",
  "002-publish-three-edition-policies-creator-connected-on-shadownet",
  "003-publish-three-edition-policies-media-and-metadata-pinned",
  "004-publish-three-edition-policies-collection-originated",
  "005-publish-three-edition-policies-timed-oe-token-zero-live",
  "006-publish-three-edition-policies-existing-collection-verified-for-second-edition",
  "007-publish-three-edition-policies-forever-oe-token-one-live",
  "008-publish-three-edition-policies-all-three-policies-live-in-one-collection",
  "009-independent-collector-mints-collector-one-connected",
  "010-independent-collector-mints-collector-one-minted-token-0",
  "011-independent-collector-mints-collector-one-minted-token-1",
  "012-independent-collector-mints-collector-one-minted-token-2",
  "013-vault-and-reopen-forever-issuance-forever-oe-vaulted",
  "014-vault-and-reopen-forever-issuance-vaulted-collector-mint-rejected",
  "015-vault-and-reopen-forever-issuance-forever-oe-reopened",
  "016-independent-collector-mints-collector-two-minted-token-0",
  "017-independent-collector-mints-collector-two-minted-token-1",
  "018-independent-collector-mints-collector-two-token-2-terminal-state-recovered-read-only",
  "019-independent-collector-mints-limited-edition-cap-enforced",
] as const);

export const GNOCCHI_PORTABLE_SUPPLEMENT_STAGES = Object.freeze([
  "901-portable-self-hosted-site-actual-studio-export-complete",
  "902-portable-self-hosted-site-extracted-page-live-independently",
] as const);

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH = path.join(
  REPO_ROOT,
  "public",
  "creation-tools",
  "gnocchi",
  "contract",
  "pasta-open-edition.contract.json",
);
export const FRESH_ROTINI_CONTRACT_ARTIFACT_PATH = path.join(
  REPO_ROOT,
  "public",
  "creation-tools",
  "rotini",
  "contract",
  "pasta-generative-collection.contract.json",
);

const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IPFS_URI = /^ipfs:\/\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/;

type JsonObject = Record<string, unknown>;
type GnocchiTokenId = 0 | 1 | 2;

export class FreshRavioliDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreshRavioliDependencyError";
  }
}

export type FreshDependencyArtifactEvidence = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  ipfsUri?: string;
};

export type FreshGnocchiTokenEvidence<TokenId extends GnocchiTokenId = GnocchiTokenId> = {
  tokenId: TokenId;
  metadataUri: string;
  artifactUri: string;
  metadataArtifact: FreshDependencyArtifactEvidence;
  mediaArtifact: FreshDependencyArtifactEvidence;
};

export type FreshRotiniProjectZeroEvidence = {
  projectId: 0;
  active: true;
  outputMode: "png";
  mimeType: "image/png";
  priceMutez: 0;
  maxSupply: 4;
  minted: 1;
  reserved: 0;
  remainingReservable: 3;
};

export type FreshGnocchiLimitedEditionEvidence = {
  tokenId: 2;
  active: true;
  start: string;
  end: string;
  maxSupply: 4;
  policyLocked: true;
  totalMinted: 3;
  totalReserved: 0;
  remainingMintable: 1;
  recommendedRavioliSaleEnd: string;
};

export type FreshRavioliDependencies = {
  schema: typeof FRESH_RAVIOLI_DEPENDENCY_SCHEMA;
  runRoot: string;
  runId: string;
  network: {
    name: typeof FRESH_RAVIOLI_NETWORK;
    chainId: typeof FRESH_RAVIOLI_CHAIN_ID;
  };
  creator: string;
  gnocchi: {
    contractAddress: string;
    scriptSha256: string;
    scriptCodeSha256: string;
    scriptArtifactPath: string;
    originationOperationHash: string;
    manifestPath: string;
    manifestSha256: string;
    receiptPath: string;
    receiptSha256: string;
    token2LimitedEdition: FreshGnocchiLimitedEditionEvidence;
    tokens: readonly [
      FreshGnocchiTokenEvidence<0>,
      FreshGnocchiTokenEvidence<1>,
      FreshGnocchiTokenEvidence<2>,
    ];
  };
  rotini: {
    contractAddress: string;
    scriptSha256: string;
    scriptCodeSha256: string;
    scriptArtifactPath: string;
    originationOperationHash: string;
    manifestPath: string;
    manifestSha256: string;
    receiptPath: string;
    receiptSha256: string;
    nextTokenId: 3;
    project0: FreshRotiniProjectZeroEvidence;
  };
};

export type FreshDependencyReadRequest = Readonly<{
  runId: string;
  chainId: typeof FRESH_RAVIOLI_CHAIN_ID;
  contractAddress: string;
  expectedScriptSha256: string;
  expectedScriptCodeSha256: string;
}>;

export type FreshGnocchiLiveSnapshot = {
  chainId: string;
  contractAddress: string;
  scriptSha256: string;
  scriptCodeSha256: string;
  administrator: string;
  nextTokenId: number;
  tokenMetadataUris: Readonly<Record<"0" | "1" | "2", string>>;
  creatorEscrowBalances: Readonly<Record<"0" | "1", number>>;
  recoveryRouterEscrowBalances?: Readonly<Record<"0", number> & Partial<Record<"1", number>>>;
  token2: {
    active: boolean;
    start: string;
    end: string;
    maxSupply: number | null;
    policyLocked: boolean;
    totalMinted: number;
    totalReserved: number;
  };
  activeOperators: readonly unknown[];
  authorizedMinters: readonly unknown[];
  reservedMints: readonly unknown[];
};

export type FreshRotiniLiveSnapshot = {
  chainId: string;
  contractAddress: string;
  scriptSha256: string;
  scriptCodeSha256: string;
  administrator: string;
  nextProjectId: number;
  nextTokenId: number;
  project0: {
    active: boolean;
    outputMode: string;
    priceMutez: number;
    maxSupply: number | null;
    minted: number;
    reserved: number;
  };
  activeOperators: readonly unknown[];
  authorizedPackMinters: readonly unknown[];
  openReservations: readonly unknown[];
  packReservations: readonly unknown[];
};

export type FreshRavioliDependencyReaders = {
  readGnocchi: (request: FreshDependencyReadRequest) => Promise<FreshGnocchiLiveSnapshot>;
  readRotini: (request: FreshDependencyReadRequest) => Promise<FreshRotiniLiveSnapshot>;
};

export type FreshRavioliDependencyLiveCheck = {
  schema: typeof FRESH_RAVIOLI_DEPENDENCY_SCHEMA;
  runId: string;
  checkedAt: string;
  gnocchi: FreshGnocchiLiveSnapshot;
  rotini: FreshRotiniLiveSnapshot;
};

export const RAVIOLI_MODE0_REPLAY_DEPENDENCY_CLASSIFICATION = "RAVIOLI-MODE0-MUTATION-REPLAY";
export const RAVIOLI_CURRENT_V2_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-V2-RESUME";
export const RAVIOLI_CURRENT_V3_RESTART_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-V3-RESTART";
export const RAVIOLI_CURRENT_OP14_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-OP14-RESUME";
export const RAVIOLI_CURRENT_OP20_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-OP20-RESUME";
export const RAVIOLI_CURRENT_V5_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-V5-RESUME";
export const RAVIOLI_CURRENT_V6_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-V6-RESUME";
export const RAVIOLI_CURRENT_OP55_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-OP55-RESUME";
export const RAVIOLI_CURRENT_OP63_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-OP63-RESUME";
export const RAVIOLI_CURRENT_OP67_RESUME_DEPENDENCY_CLASSIFICATION = "RAVIOLI-CURRENT-OP67-RESUME";
export const RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL = 4_579_174;
export const RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL = 4_579_176;
export const RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL = 4_579_178;
export const RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL = 4_550_641;
export const RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL = 4_579_185;

export type RavioliMode0ReplayRecovery = Readonly<{
  routerAddress: string;
  appliedLevel: number;
}>;

export type RavioliCurrentV3RestartRecovery = Readonly<{
  routerAddress: string;
  mode0AppliedLevel: number;
  mode1AppliedLevel: number;
}>;

export type RavioliCurrentV5ResumeRecovery = RavioliCurrentV3RestartRecovery;
export type RavioliCurrentOp14ResumeRecovery = RavioliCurrentV3RestartRecovery;
export type RavioliCurrentOp20ResumeRecovery = RavioliCurrentV3RestartRecovery & Readonly<{
  gnocchiAdapterAddress: string;
  minterAppliedLevel: number;
}>;

export type RavioliCurrentV6ResumeRecovery = RavioliCurrentV3RestartRecovery & Readonly<{
  gnocchiAdapterAddress: string;
  minterAppliedLevel: number;
  reservedMintAppliedLevel: number;
  rotiniReservation?: Readonly<{
    adapterAddress: string;
    packMinterAppliedLevel: number;
    reservationAppliedLevel: number;
  }>;
}>;

export type RavioliCurrentOp55ResumeRecovery = RavioliCurrentV3RestartRecovery & Readonly<{
  gnocchiAdapterAddress: string;
  rotiniAdapterAddress: string;
  minterAppliedLevel: number;
  minterSecondAppliedLevel: number;
  mode1SecondAppliedLevel: number;
  rotiniPackMinterAppliedLevel: number;
  rotiniPackMinterSecondAppliedLevel: number;
}>;

export type RavioliCurrentOp63ResumeRecovery = RavioliCurrentOp55ResumeRecovery & Readonly<{
  minterThirdAppliedLevel: number;
  allocationAppliedLevel: number;
  adapterRouterAppliedLevel: number;
  reservedMintFirstAppliedLevel: number;
  reservedMintAppliedLevel: number;
  adapterRecoveryAppliedLevel?: number;
}>;

export type RavioliMode0ReplayDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_MODE0_REPLAY_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operator";
    owner: string;
    operator: string;
    tokenId: 0;
    appliedLevel: number;
  }>;
};

export type RavioliCurrentV2DependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_V2_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operator-and-escrow";
    owner: string;
    operator: string;
    tokenId: 0;
    amount: 1;
    appliedLevel: number;
  }>;
};

export type RavioliCurrentV3RestartDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_V3_RESTART_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operators-and-escrow";
    owner: string;
    operator: string;
    tokenIds: readonly [0, 1];
    escrowTokenId: 0;
    escrowAmount: 1;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
  }>;
};

export type RavioliCurrentV5ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_V5_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operators-and-two-funded-pools";
    owner: string;
    operator: string;
    tokenIds: readonly [0, 1];
    creatorBalances: Readonly<{ "0": 0; "1": 0 }>;
    routerEscrowBalances: Readonly<{ "0": 2; "1": 2 }>;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
  }>;
};

export type RavioliCurrentOp14ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_OP14_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operators-and-current-funded-pools";
    owner: string;
    operator: string;
    tokenIds: readonly [0, 1];
    creatorBalances: Readonly<{ "0": 0; "1": 1 }>;
    routerEscrowBalances: Readonly<{ "0": 2; "1": 1 }>;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
  }>;
};

export type RavioliCurrentOp20ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_OP20_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operators-funded-pools-and-authorized-adapter";
    owner: string;
    operator: string;
    gnocchiAdapter: string;
    tokenIds: readonly [0, 1];
    creatorBalances: Readonly<{ "0": 0; "1": 1 }>;
    routerEscrowBalances: Readonly<{ "0": 2; "1": 1 }>;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
    minterAppliedLevel: number;
  }>;
};

export type RavioliCurrentV6ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_V6_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "gnocchi-fa2-operators-funded-pools-and-le-reservation";
    owner: string;
    operator: string;
    gnocchiAdapter: string;
    tokenIds: readonly [0, 1];
    creatorBalances: Readonly<{ "0": 0; "1": 1 }>;
    routerEscrowBalances: Readonly<{ "0": 2; "1": 1 }>;
    reservedTokenId: 2;
    reservedAmount: 1;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
    minterAppliedLevel: number;
    reservedMintAppliedLevel: number;
    rotiniReservation?: Readonly<{
      adapter: string;
      projectId: 0;
      reservedAmount: 2;
      packMinterAppliedLevel: number;
      reservationAppliedLevel: number;
    }>;
  }>;
};

export type RavioliCurrentOp55ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_OP55_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "five-mode-terminal-dependency-state";
    owner: string;
    operator: string;
    gnocchiAdapter: string;
    rotiniAdapter: string;
    creatorBalances: Readonly<{ "0": 0; "1": 0 }>;
    routerEscrowBalances: Readonly<{ "0": 0; "1": 0 }>;
    token2: Readonly<{ totalMinted: 4; totalReserved: 0 }>;
    rotini: Readonly<{
      nextTokenId: 6;
      projectId: 0;
      minted: 4;
      reserved: 0;
    }>;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
    minterAppliedLevel: number;
    rotiniPackMinterAppliedLevel: number;
    minterSecondAppliedLevel: number;
    rotiniPackMinterSecondAppliedLevel: number;
    mode1SecondAppliedLevel: number;
  }>;
};

export type RavioliCurrentOp63ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_OP63_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Readonly<{
    kind: "withheld-reveal-allocation-dependency-state";
    owner: string;
    operator: string;
    gnocchiAdapter: string;
    rotiniAdapter: string;
    creatorBalances: Readonly<{ "0": 0; "1": 0 }>;
    routerEscrowBalances: Readonly<{ "0": 0; "1": 0 }>;
    token2: Readonly<{ totalMinted: 4; totalReserved: 0 }>;
    reservedMint: Readonly<{ tokenId: 1; amount: 2 }>;
    rotini: Readonly<{
      nextTokenId: 6;
      projectId: 0;
      minted: 4;
      reserved: 0;
    }>;
    mode0AppliedLevel: number;
    mode1AppliedLevel: number;
    minterAppliedLevel: number;
    rotiniPackMinterAppliedLevel: number;
    minterSecondAppliedLevel: number;
    rotiniPackMinterSecondAppliedLevel: number;
    mode1SecondAppliedLevel: number;
    minterThirdAppliedLevel: number;
    allocationAppliedLevel: number;
    adapterRouterAppliedLevel: number;
    reservedMintFirstAppliedLevel: number;
    reservedMintAppliedLevel: number;
  }>;
};

export type RavioliCurrentOp67ResumeDependencyLiveCheck = FreshRavioliDependencyLiveCheck & {
  classification: typeof RAVIOLI_CURRENT_OP67_RESUME_DEPENDENCY_CLASSIFICATION;
  acceptedMutation: Omit<RavioliCurrentOp63ResumeDependencyLiveCheck["acceptedMutation"], "kind" | "reservedMint"> & Readonly<{
    kind: "withheld-reveal-released-dependency-state";
    reservedMint: Readonly<{ tokenId: 1; amount: 0 }>;
    adapterRecoveryAppliedLevel: number;
  }>;
};

type LoadedArtifact = {
  evidence: FreshDependencyArtifactEvidence;
  bytes: Uint8Array;
  raw: JsonObject;
};

type LoadedAppEvidence = {
  manifest: JsonObject;
  receipt: JsonObject;
  manifestPath: string;
  receiptPath: string;
  manifestSha256: string;
  receiptSha256: string;
  artifacts: Map<string, LoadedArtifact>;
};

function fail(message: string): never {
  throw new FreshRavioliDependencyError(message);
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function objectValue(value: unknown, label: string): JsonObject {
  requireValue(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): unknown[] {
  requireValue(Array.isArray(value), `${label} must be an array`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  requireValue(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function natValue(value: unknown, label: string): number {
  const converted = Number(value);
  requireValue(Number.isSafeInteger(converted) && converted >= 0, `${label} must be a non-negative safe integer`);
  return converted;
}

function exactValue<T>(actual: unknown, expected: T, label: string): T {
  requireValue(actual === expected, `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
  return expected;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireSha256(value: unknown, label: string): string {
  const hash = stringValue(value, label);
  requireValue(SHA256.test(hash), `${label} must be a lowercase SHA-256 digest`);
  return hash;
}

function requireIpfsUri(value: unknown, label: string): string {
  const uri = stringValue(value, label);
  requireValue(IPFS_URI.test(uri), `${label} must be a canonical ipfs:// URI`);
  return uri;
}

function requireContractAddress(value: unknown, label: string): string {
  const address = stringValue(value, label);
  requireValue(validateContractAddress(address) === ValidationResult.VALID, `${label} must be a valid originated contract address`);
  return address;
}

function requireImplicitAddress(value: unknown, label: string): string {
  const address = stringValue(value, label);
  requireValue(validateAddress(address) === ValidationResult.VALID && address.startsWith("tz"), `${label} must be a valid implicit address`);
  return address;
}

function requireOperationHash(value: unknown, label: string): string {
  const operationHash = stringValue(value, label);
  requireValue(validateOperation(operationHash) === ValidationResult.VALID, `${label} must be a valid Tezos operation hash`);
  return operationHash;
}

function parseJson(bytes: Uint8Array, label: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return objectValue(value, label);
}

function assertShadownet(value: JsonObject, label: string): void {
  if (typeof value.network === "string") {
    exactValue(value.network, FRESH_RAVIOLI_NETWORK, `${label} network`);
    exactValue(value.chainId, FRESH_RAVIOLI_CHAIN_ID, `${label} chain id`);
    return;
  }
  const network = objectValue(value.network, `${label} network`);
  exactValue(network.name, FRESH_RAVIOLI_NETWORK, `${label} network name`);
  exactValue(network.chainId, FRESH_RAVIOLI_CHAIN_ID, `${label} chain id`);
}

function safeRelativePath(value: unknown, label: string): string {
  const relative = stringValue(value, label);
  requireValue(!path.isAbsolute(relative), `${label} must be relative`);
  requireValue(!relative.includes("\\"), `${label} must use portable forward slashes`);
  requireValue(path.posix.normalize(relative) === relative, `${label} must be normalized and traversal-free`);
  requireValue(!relative.startsWith("../") && relative !== "..", `${label} must stay inside its app proof directory`);
  return relative;
}

async function readRegularFile(filePath: string, allowedRoot: string, label: string): Promise<Uint8Array> {
  let details;
  try {
    details = await lstat(filePath);
  } catch {
    fail(`${label} is missing at ${filePath}`);
  }
  requireValue(details.isFile() && !details.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const [rootRealPath, fileRealPath] = await Promise.all([realpath(allowedRoot), realpath(filePath)]);
  requireValue(
    fileRealPath === rootRealPath || fileRealPath.startsWith(`${rootRealPath}${path.sep}`),
    `${label} resolves outside ${allowedRoot}`,
  );
  return readFile(fileRealPath);
}

async function readJsonFile(filePath: string, allowedRoot: string, label: string): Promise<{ bytes: Uint8Array; value: JsonObject }> {
  const bytes = await readRegularFile(filePath, allowedRoot, label);
  return { bytes, value: parseJson(bytes, label) };
}

async function loadArtifacts(appRoot: string, manifest: JsonObject, label: string): Promise<Map<string, LoadedArtifact>> {
  const records = arrayValue(manifest.artifacts, `${label} manifest artifacts`);
  requireValue(records.length > 0, `${label} manifest must bind proof artifacts`);
  const output = new Map<string, LoadedArtifact>();
  const seenPaths = new Set<string>();
  for (const [index, rawValue] of records.entries()) {
    const raw = objectValue(rawValue, `${label} artifact ${index}`);
    const id = stringValue(raw.id, `${label} artifact ${index} id`);
    const kind = stringValue(raw.kind, `${label} artifact ${id} kind`);
    const relative = safeRelativePath(raw.path, `${label} artifact ${id} path`);
    const expectedHash = requireSha256(raw.sha256, `${label} artifact ${id} hash`);
    requireValue(!output.has(id), `${label} manifest contains duplicate artifact id ${id}`);
    requireValue(!seenPaths.has(relative), `${label} manifest contains duplicate artifact path ${relative}`);
    const bytes = await readRegularFile(path.join(appRoot, relative), appRoot, `${label} artifact ${id}`);
    exactValue(hashBytes(bytes), expectedHash, `${label} artifact ${id} byte hash`);
    if (raw.retrievedSha256 !== undefined) {
      exactValue(raw.retrievedSha256, expectedHash, `${label} artifact ${id} retrieved hash`);
    }
    const ipfsUri = raw.ipfsUri === undefined ? undefined : requireIpfsUri(raw.ipfsUri, `${label} artifact ${id} IPFS URI`);
    const evidence: FreshDependencyArtifactEvidence = {
      id,
      kind,
      path: relative,
      sha256: expectedHash,
      ...(ipfsUri ? { ipfsUri } : {}),
    };
    output.set(id, { evidence, bytes, raw });
    seenPaths.add(relative);
  }
  return output;
}

function artifactById(artifacts: Map<string, LoadedArtifact>, id: unknown, label: string): LoadedArtifact {
  const artifactId = stringValue(id, `${label} artifact id`);
  const artifact = artifacts.get(artifactId);
  requireValue(artifact, `${label} references missing manifest artifact ${artifactId}`);
  return artifact;
}

function artifactByPath(
  artifacts: Map<string, LoadedArtifact>,
  expectedPath: string,
  expectedKind: string,
  label: string,
): LoadedArtifact {
  const matches = Array.from(artifacts.values()).filter((artifact) => artifact.evidence.path === expectedPath);
  requireValue(matches.length === 1, `${label} must bind exactly one manifest artifact at ${expectedPath}`);
  exactValue(matches[0].evidence.kind, expectedKind, `${label} artifact kind`);
  return matches[0];
}

function recoveredGnocchiClassification(receipt: JsonObject, label: string): string {
  const classification = stringValue(receipt.classification, `${label} classification`);
  requireValue(
    classification === GNOCCHI_READ_ONLY_FINALIZATION_CLASSIFICATION ||
      classification === GNOCCHI_CHECKPOINTED_RECOVERY_CLASSIFICATION ||
      classification === GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION,
    `${label} classification must be ${GNOCCHI_READ_ONLY_FINALIZATION_CLASSIFICATION}, ${GNOCCHI_CHECKPOINTED_RECOVERY_CLASSIFICATION}, or ${GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION}; received ${JSON.stringify(classification)}`,
  );
  return classification;
}

function assertReceiptPins(receipt: JsonObject, artifacts: Map<string, LoadedArtifact>, label: string): void {
  const pins = arrayValue(receipt.pins, `${label} receipt pins`);
  requireValue(pins.length > 0, `${label} receipt must expose its pinned artifacts`);
  for (const [index, pinValue] of pins.entries()) {
    const pin = objectValue(pinValue, `${label} receipt pin ${index}`);
    const artifact = artifactById(artifacts, pin.id, `${label} receipt pin ${index}`);
    exactValue(pin.kind, artifact.evidence.kind, `${label} receipt pin ${artifact.evidence.id} kind`);
    exactValue(pin.path, artifact.evidence.path, `${label} receipt pin ${artifact.evidence.id} path`);
    exactValue(pin.sha256, artifact.evidence.sha256, `${label} receipt pin ${artifact.evidence.id} hash`);
    if (artifact.evidence.ipfsUri) {
      exactValue(pin.ipfsUri, artifact.evidence.ipfsUri, `${label} receipt pin ${artifact.evidence.id} IPFS URI`);
    }
  }
}

function assertReceiptContentArtifacts(
  receipt: JsonObject,
  artifacts: Map<string, LoadedArtifact>,
  label: string,
  expectedCount = 7,
): void {
  const content = arrayValue(receipt.contentArtifacts, `${label} recovered content artifacts`);
  requireValue(
    content.length === expectedCount,
    `${label} recovered receipt must expose exactly ${expectedCount} content artifacts`,
  );
  for (const [index, contentValue] of content.entries()) {
    const record = objectValue(contentValue, `${label} recovered content artifact ${index}`);
    const artifact = artifactById(artifacts, record.id, `${label} recovered content artifact ${index}`);
    exactValue(record.kind, artifact.evidence.kind, `${label} recovered content ${artifact.evidence.id} kind`);
    exactValue(record.path, artifact.evidence.path, `${label} recovered content ${artifact.evidence.id} path`);
    exactValue(record.sha256, artifact.evidence.sha256, `${label} recovered content ${artifact.evidence.id} hash`);
    exactValue(record.retrievedSha256, artifact.evidence.sha256, `${label} recovered content ${artifact.evidence.id} retrieved hash`);
    exactValue(record.ipfsUri, artifact.evidence.ipfsUri, `${label} recovered content ${artifact.evidence.id} IPFS URI`);
  }
}

const GNOCCHI_TERMINAL_CONTENT_IDS = Object.freeze([
  "token-0-media",
  "collection-metadata",
  "token-0-metadata",
  "token-1-media",
  "token-1-metadata",
  "token-2-media",
  "token-2-metadata",
] as const);

const GNOCCHI_TERMINAL_CORE_ARTIFACT_IDS = Object.freeze([
  ...GNOCCHI_TERMINAL_CONTENT_IDS,
  "gnocchi-current-contract-code",
  "gnocchi-terminal-readonly-recovery",
  "gnocchi-chain-reconciliation-snapshot",
  "ui-live-readonly-finalization",
  ...GNOCCHI_TERMINAL_LIFECYCLE_STAGES.map((stage) => `screenshot-sidecar-${stage}`),
  "gnocchi-proof-time-indexer-snapshot",
] as const);

const GNOCCHI_PORTABLE_ARTIFACT_IDS = Object.freeze([
  "gnocchi-portable-self-hosted-site",
  "gnocchi-portable-self-hosted-site-proof",
  ...GNOCCHI_PORTABLE_SUPPLEMENT_STAGES.map((stage) => `screenshot-sidecar-${stage}`),
] as const);

const GNOCCHI_TERMINAL_READ_ACTIONS = new Set([
  "balance",
  "chain_check",
  "connect",
  "contract_at",
  "read_storage",
]);

function exactJson(actual: unknown, expected: unknown, label: string): void {
  requireValue(isDeepStrictEqual(actual, expected), `${label} does not match its authenticated source`);
}

function externalValidation(label: string, validate: () => void): void {
  try {
    validate();
  } catch (error) {
    fail(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactStringArray(value: unknown, expected: readonly string[], label: string): void {
  const actual = arrayValue(value, label).map((entry, index) => stringValue(entry, `${label} ${index}`));
  exactJson(actual, [...expected], label);
}

function terminalSnapshot(
  value: unknown,
  supplies: readonly number[],
  label: string,
): GnocchiTerminalImmutableSnapshot {
  const raw = objectValue(value, label);
  const counters = objectValue(raw.actorCounters, `${label} actor counters`);
  const actorCounters: Record<string, number> = {};
  for (const actor of ["creator", "collectorOne", "collectorTwo"]) {
    actorCounters[actor] = natValue(counters[actor], `${label} ${actor} counter`);
  }
  return {
    operationGraphSha256: requireSha256(raw.operationGraphSha256, `${label} operation graph hash`),
    contractStateSha256: requireSha256(raw.contractStateSha256, `${label} contract-state hash`),
    scriptSha256: requireSha256(raw.scriptSha256, `${label} script hash`),
    supplies,
    actorCounters,
    actorPendingOperations: arrayValue(raw.actorPendingOperations, `${label} actor pending operations`),
  };
}

function validateTerminalRpcSnapshot(
  value: unknown,
  snapshot: GnocchiTerminalImmutableSnapshot,
  label: string,
): { storageSha256: string; scriptSha256: string; counters: Record<string, number> } {
  const rpc = objectValue(value, label);
  const expectedUrls = {
    primary: "https://tezos-shadownet.octez.io/",
    fallback: "https://tcinfra.net/rpc/tezos/shadownet",
  } as const;
  let storageSha256 = "";
  for (const endpoint of ["primary", "fallback"] as const) {
    const record = objectValue(rpc[endpoint], `${label} ${endpoint}`);
    exactValue(record.rpcUrl, expectedUrls[endpoint], `${label} ${endpoint} URL`);
    exactValue(record.chainId, FRESH_RAVIOLI_CHAIN_ID, `${label} ${endpoint} chain id`);
    exactValue(record.scriptSha256, snapshot.scriptSha256, `${label} ${endpoint} script hash`);
    const endpointStorageSha256 = requireSha256(record.storageSha256, `${label} ${endpoint} storage hash`);
    if (endpoint === "primary") storageSha256 = endpointStorageSha256;
    else exactValue(endpointStorageSha256, storageSha256, `${label} configured RPC storage agreement`);
    exactJson(record.counters, snapshot.actorCounters, `${label} ${endpoint} actor counters`);
    requireValue(
      arrayValue(record.actorPendingOperations, `${label} ${endpoint} pending operations`).length === 0,
      `${label} ${endpoint} actor mempool must be empty`,
    );
  }
  return { storageSha256, scriptSha256: snapshot.scriptSha256, counters: snapshot.actorCounters };
}

function validateTerminalBridge(value: unknown, label: string): void {
  const bridge = objectValue(value, label);
  exactValue(bridge.signerMaterialLoaded, false, `${label} signer-material flag`);
  exactValue(natValue(bridge.submittedOperations, `${label} submitted operations`), 0, `${label} submitted operations`);
  exactValue(natValue(bridge.injectedOperations, `${label} injected operations`), 0, `${label} injected operations`);
  exactValue(natValue(bridge.writeActionRequests, `${label} write requests`), 0, `${label} write requests`);
  const actors = arrayValue(bridge.actors, `${label} actor audits`).map((value, index) =>
    objectValue(value, `${label} actor audit ${index}`)
  );
  requireValue(actors.length === 2, `${label} must contain exactly two collector audits`);
  const actorNames = actors.map((actor, index) => stringValue(actor.actor, `${label} actor ${index}`)).sort();
  exactJson(actorNames, ["collectorOne", "collectorTwo"], `${label} actor identities`);
  for (const actor of actors) {
    const actorLabel = `${label} ${String(actor.actor)}`;
    exactValue(natValue(actor.submittedOperations, `${actorLabel} submitted operations`), 0, `${actorLabel} submitted operations`);
    exactValue(natValue(actor.injectedOperations, `${actorLabel} injected operations`), 0, `${actorLabel} injected operations`);
    exactValue(natValue(actor.writeActionRequests, `${actorLabel} write requests`), 0, `${actorLabel} write requests`);
    requireValue(
      arrayValue(actor.receiptOperationHashes, `${actorLabel} receipt operation hashes`).length === 0,
      `${actorLabel} must not contain an operation hash`,
    );
    for (const field of ["requestedActions", "delegatedActions"] as const) {
      const actions = arrayValue(actor[field], `${actorLabel} ${field}`);
      requireValue(actions.length > 0, `${actorLabel} ${field} must not be empty`);
      requireValue(
        actions.every((action) => typeof action === "string" && GNOCCHI_TERMINAL_READ_ACTIONS.has(action)),
        `${actorLabel} ${field} contains a write-shaped or unknown action`,
      );
    }
  }
}

function validateHistoricalGnocchiSnapshot(input: {
  artifact: LoadedArtifact;
  runId: string;
  contractAddress: string;
  operationHashes: readonly string[];
}): void {
  const snapshot = parseJson(input.artifact.bytes, "terminal Gnocchi historical indexer snapshot");
  exactValue(snapshot.schema, "pastaprotocol-gnocchi-historical-indexer-proof@1", "terminal Gnocchi historical snapshot schema");
  exactValue(snapshot.app, "gnocchi", "terminal Gnocchi historical snapshot app");
  exactValue(snapshot.contractAddress, input.contractAddress, "terminal Gnocchi historical snapshot contract");
  const network = objectValue(snapshot.network, "terminal Gnocchi historical snapshot network");
  exactValue(network.name, FRESH_RAVIOLI_NETWORK, "terminal Gnocchi historical snapshot network name");
  exactValue(network.chainId, FRESH_RAVIOLI_CHAIN_ID, "terminal Gnocchi historical snapshot chain id");
  exactValue(
    objectValue(snapshot.sourceManifest, "terminal Gnocchi historical snapshot source manifest").runId,
    input.runId,
    "terminal Gnocchi historical snapshot run id",
  );
  const accepted = arrayValue(snapshot.acceptedOperations, "terminal Gnocchi historical accepted operations")
    .map((value, index) => objectValue(value, `terminal Gnocchi historical operation ${index}`));
  requireValue(accepted.length === input.operationHashes.length, "terminal Gnocchi historical snapshot must bind all 12 operations");
  accepted.forEach((operation, index) => {
    exactValue(operation.hash, input.operationHashes[index], `terminal Gnocchi historical operation ${index} hash`);
    exactValue(operation.contractAddress, input.contractAddress, `terminal Gnocchi historical operation ${index} contract`);
    exactValue(operation.status, "applied", `terminal Gnocchi historical operation ${index} status`);
  });
  const terminal = objectValue(snapshot.terminalAcceptedOperation, "terminal Gnocchi historical terminal operation");
  exactValue(terminal.hash, input.operationHashes.at(-1), "terminal Gnocchi historical terminal operation hash");
  exactValue(
    natValue(terminal.level, "terminal Gnocchi historical terminal level"),
    GNOCCHI_TERMINAL_OPERATION_PLAN.at(-1)?.level,
    "terminal Gnocchi historical terminal level",
  );
}

async function loadAppEvidence(input: {
  runRoot: string;
  app: "gnocchi" | "rotini";
  receiptPath: string;
}): Promise<LoadedAppEvidence> {
  const appRoot = path.join(input.runRoot, input.app);
  const appDetails = await lstat(appRoot).catch(() => undefined);
  requireValue(
    appDetails?.isDirectory() && !appDetails.isSymbolicLink(),
    `${input.app} proof directory is missing, not a directory, or a symlink at ${appRoot}`,
  );
  const manifestPath = path.join(appRoot, "manifest.json");
  const receiptPath = path.join(appRoot, input.receiptPath);
  const [manifestFile, receiptFile] = await Promise.all([
    readJsonFile(manifestPath, appRoot, `${input.app} manifest`),
    readJsonFile(receiptPath, appRoot, `${input.app} UI-live receipt`),
  ]);
  const artifacts = await loadArtifacts(appRoot, manifestFile.value, input.app);
  const receiptArtifact = Array.from(artifacts.values()).filter(
    (artifact) => artifact.evidence.path === input.receiptPath,
  );
  requireValue(receiptArtifact.length === 1, `${input.app} manifest must bind exactly one ${input.receiptPath} artifact`);
  const recovered = input.receiptPath === FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH ||
    input.receiptPath === FRESH_ROTINI_RECOVERED_RECEIPT_PATH;
  exactValue(
    receiptArtifact[0].evidence.id,
    recovered
      ? "ui-live-readonly-finalization"
      : input.app === "rotini"
        ? "rotini-ui-live-run"
        : "ui-live-run-receipt",
    `${input.app} receipt artifact id`,
  );
  exactValue(
    receiptArtifact[0].evidence.kind,
    recovered
      ? "readonly-finalization-receipt"
      : input.app === "rotini"
        ? "proof-receipt"
        : "run-receipt",
    `${input.app} receipt artifact kind`,
  );
  exactValue(receiptArtifact[0].evidence.sha256, hashBytes(receiptFile.bytes), `${input.app} receipt manifest hash`);
  return {
    manifest: manifestFile.value,
    receipt: receiptFile.value,
    manifestPath,
    receiptPath,
    manifestSha256: hashBytes(manifestFile.bytes),
    receiptSha256: hashBytes(receiptFile.bytes),
    artifacts,
  };
}

async function resolveGnocchiReceiptPath(runRoot: string): Promise<string> {
  const candidates = [FRESH_GNOCCHI_RECEIPT_PATH, FRESH_GNOCCHI_RECOVERED_RECEIPT_PATH];
  const present: string[] = [];
  for (const candidate of candidates) {
    const details = await lstat(path.join(runRoot, "gnocchi", candidate)).catch(() => undefined);
    if (!details) continue;
    requireValue(details.isFile() && !details.isSymbolicLink(), `gnocchi receipt candidate ${candidate} must be a regular non-symlink file`);
    present.push(candidate);
  }
  requireValue(
    present.length === 1,
    `gnocchi proof must expose exactly one native or read-only-finalized receipt; received ${present.length}`,
  );
  return present[0];
}

async function resolveRotiniReceiptPath(runRoot: string): Promise<string> {
  const candidates = [FRESH_ROTINI_RECEIPT_PATH, FRESH_ROTINI_RECOVERED_RECEIPT_PATH];
  const present: string[] = [];
  for (const candidate of candidates) {
    const details = await lstat(path.join(runRoot, "rotini", candidate)).catch(() => undefined);
    if (!details) continue;
    requireValue(details.isFile() && !details.isSymbolicLink(), `rotini receipt candidate ${candidate} must be a regular non-symlink file`);
    present.push(candidate);
  }
  requireValue(
    present.length === 1,
    `rotini proof must expose exactly one native or read-only-finalized receipt; received ${present.length}`,
  );
  return present[0];
}

async function currentScriptIdentity(filePath: string, label: string): Promise<string> {
  const bytes = await readRegularFile(filePath, REPO_ROOT, `${label} compiled contract artifact`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    fail(`${label} compiled contract artifact is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  requireValue(Array.isArray(parsed) && parsed.length > 0, `${label} compiled contract artifact must be a non-empty Michelson script array`);
  return hashBytes(bytes);
}

function validateManifestHeader(manifest: JsonObject, app: "gnocchi" | "rotini", runId: string): void {
  exactValue(manifest.schema, "pastaprotocol-app-proof@1", `${app} manifest schema`);
  exactValue(manifest.app, app, `${app} manifest app`);
  exactValue(manifest.role, "token-publisher", `${app} manifest role`);
  exactValue(manifest.runId, runId, `${app} manifest run id`);
  assertShadownet(manifest, `${app} manifest`);
}

function manifestContract(manifest: JsonObject, expectedKind: string, label: string): string {
  const contracts = arrayValue(manifest.contracts, `${label} manifest contracts`);
  requireValue(contracts.length === 1, `${label} manifest must expose exactly one contract`);
  const contract = objectValue(contracts[0], `${label} manifest contract`);
  exactValue(contract.kind, expectedKind, `${label} manifest contract kind`);
  return requireContractAddress(contract.address, `${label} manifest contract address`);
}

function receiptContract(
  receipt: JsonObject,
  expectedAddress: string,
  expectedScriptSha256: string,
  label: string,
): string {
  const contract = objectValue(receipt.contract, `${label} receipt contract`);
  const address = requireContractAddress(contract.address, `${label} receipt contract address`);
  exactValue(address, expectedAddress, `${label} manifest/receipt contract identity`);
  const scriptSha256 = requireSha256(contract.scriptSha256, `${label} receipt contract script hash`);
  exactValue(scriptSha256, expectedScriptSha256, `${label} current compiled contract script identity`);
  return address;
}

function validateContractCodeArtifact(input: {
  app: "gnocchi" | "rotini";
  artifacts: Map<string, LoadedArtifact>;
  scriptSha256: string;
}): FreshDependencyArtifactEvidence {
  const expectedId = `${input.app}-current-contract-code`;
  const expectedPath = `artifacts/${input.app}-current-contract-code.json`;
  const artifact = artifactById(input.artifacts, expectedId, `${input.app} current contract code`);
  exactValue(artifact.evidence.kind, "contract-code", `${input.app} current contract code artifact kind`);
  exactValue(artifact.evidence.path, expectedPath, `${input.app} current contract code artifact path`);
  exactValue(artifact.evidence.sha256, input.scriptSha256, `${input.app} current contract code artifact byte identity`);
  return artifact.evidence;
}

function validateGnocchiDependencyReceipt(input: {
  receipt: JsonObject;
  contractAddress: string;
  creator: string;
  scriptSha256: string;
  token2MetadataUri: string;
}): { scriptCodeSha256: string; limitedEdition: FreshGnocchiLimitedEditionEvidence } {
  const dependency = objectValue(input.receipt.ravioliDependency, "gnocchi Ravioli dependency evidence");
  exactValue(dependency.schema, "pastaprotocol-gnocchi-ravioli-dependency@1", "gnocchi Ravioli dependency schema");
  exactValue(dependency.contractAddress, input.contractAddress, "gnocchi Ravioli dependency contract");
  exactValue(dependency.administrator, input.creator, "gnocchi Ravioli dependency administrator");
  const script = objectValue(dependency.script, "gnocchi Ravioli dependency script");
  exactValue(script.artifactPath, "artifacts/gnocchi-current-contract-code.json", "gnocchi dependency script artifact path");
  exactValue(script.artifactSha256, input.scriptSha256, "gnocchi dependency script artifact byte hash");
  const scriptCodeSha256 = requireSha256(script.artifactCodeSha256, "gnocchi dependency compiled code hash");
  exactValue(script.onChainCodeSha256, scriptCodeSha256, "gnocchi dependency on-chain code identity");
  exactValue(script.exactMatch, true, "gnocchi dependency exact script match flag");
  const limited = objectValue(dependency.limitedEdition, "gnocchi Ravioli limited-edition evidence");
  exactValue(natValue(limited.tokenId, "gnocchi Ravioli LE token id"), 2, "gnocchi Ravioli LE token id");
  exactValue(limited.metadataUri, input.token2MetadataUri, "gnocchi Ravioli LE metadata URI");
  const policy = objectValue(limited.policy, "gnocchi Ravioli LE policy");
  exactValue(policy.active, true, "gnocchi Ravioli LE active flag");
  const start = stringValue(policy.start, "gnocchi Ravioli LE start");
  const end = stringValue(policy.end, "gnocchi Ravioli LE end");
  requireValue(Number.isFinite(Date.parse(start)), "gnocchi Ravioli LE start must be a timestamp");
  requireValue(Number.isFinite(Date.parse(end)) && Date.parse(end) > Date.parse(start), "gnocchi Ravioli LE end must follow its start");
  exactValue(natValue(policy.maxSupply, "gnocchi Ravioli LE max supply"), 4, "gnocchi Ravioli LE max supply");
  exactValue(policy.policyLocked, true, "gnocchi Ravioli LE policy lock");
  const baseline = objectValue(limited.baseline, "gnocchi Ravioli LE baseline");
  exactValue(natValue(baseline.totalSupply, "gnocchi Ravioli LE total supply"), 3, "gnocchi Ravioli LE total supply");
  exactValue(natValue(baseline.totalMinted, "gnocchi Ravioli LE total minted"), 3, "gnocchi Ravioli LE total minted");
  exactValue(natValue(baseline.totalReserved, "gnocchi Ravioli LE total reserved"), 0, "gnocchi Ravioli LE total reserved");
  exactValue(natValue(baseline.remainingMintable, "gnocchi Ravioli LE remaining capacity"), 1, "gnocchi Ravioli LE remaining capacity");
  const allocation = objectValue(limited.allocation, "gnocchi Ravioli LE allocation policy");
  exactValue(natValue(allocation.availableAmount, "gnocchi Ravioli LE allocation amount"), 1, "gnocchi Ravioli LE allocation amount");
  exactValue(allocation.ravioliWrapperMustBeLimitedEdition, true, "gnocchi Ravioli wrapper LE requirement");
  exactValue(allocation.wrapperSaleEndMustBeNoLaterThan, end, "gnocchi Ravioli child/wrapper expiry boundary");
  const recommendedEnd = stringValue(allocation.recommendedRavioliSaleEnd, "gnocchi recommended Ravioli sale end");
  requireValue(
    Number.isFinite(Date.parse(recommendedEnd)) && Date.parse(recommendedEnd) < Date.parse(end),
    "gnocchi recommended Ravioli sale end must precede the child LE expiry",
  );
  return {
    scriptCodeSha256,
    limitedEdition: {
      tokenId: 2,
      active: true,
      start,
      end,
      maxSupply: 4,
      policyLocked: true,
      totalMinted: 3,
      totalReserved: 0,
      remainingMintable: 1,
      recommendedRavioliSaleEnd: recommendedEnd,
    },
  };
}

function validateRotiniDependencyReceipt(input: {
  receipt: JsonObject;
  contractAddress: string;
  creator: string;
  scriptSha256: string;
}): string {
  const dependency = objectValue(input.receipt.ravioliDependency, "rotini Ravioli dependency evidence");
  exactValue(dependency.schema, "pastaprotocol-rotini-ravioli-dependency@1", "rotini Ravioli dependency schema");
  exactValue(dependency.contractAddress, input.contractAddress, "rotini Ravioli dependency contract");
  exactValue(dependency.administrator, input.creator, "rotini Ravioli dependency administrator");
  const script = objectValue(dependency.script, "rotini Ravioli dependency script");
  exactValue(script.artifactPath, "artifacts/rotini-current-contract-code.json", "rotini dependency script artifact path");
  exactValue(script.artifactSha256, input.scriptSha256, "rotini dependency script artifact byte hash");
  const scriptCodeSha256 = requireSha256(script.artifactCodeSha256, "rotini dependency compiled code hash");
  exactValue(script.onChainCodeSha256, scriptCodeSha256, "rotini dependency on-chain code identity");
  exactValue(script.exactMatch, true, "rotini dependency exact script match flag");
  const project = objectValue(dependency.project, "rotini Ravioli project evidence");
  exactValue(natValue(project.projectId, "rotini Ravioli project id"), 0, "rotini Ravioli project id");
  exactValue(project.active, true, "rotini Ravioli project active flag");
  exactValue(project.outputMode, "png", "rotini Ravioli project output mode");
  exactValue(natValue(project.priceMutez, "rotini Ravioli project price"), 0, "rotini Ravioli project price");
  exactValue(natValue(project.maxSupply, "rotini Ravioli project max supply"), 4, "rotini Ravioli project max supply");
  const baseline = objectValue(dependency.baseline, "rotini Ravioli project baseline");
  exactValue(natValue(baseline.minted, "rotini Ravioli project minted"), 1, "rotini Ravioli project minted");
  exactValue(natValue(baseline.reserved, "rotini Ravioli project reserved"), 0, "rotini Ravioli project reserved");
  exactValue(natValue(baseline.remainingReservable, "rotini Ravioli project remaining capacity"), 3, "rotini Ravioli project remaining capacity");
  exactValue(natValue(baseline.nextTokenId, "rotini Ravioli next token id"), 3, "rotini Ravioli next token id");
  const existingTokenIds = arrayValue(baseline.existingTokenIds, "rotini Ravioli existing token ids");
  requireValue(
    existingTokenIds.length === 3 && existingTokenIds.every((tokenId, index) => natValue(tokenId, "rotini existing token id") === index),
    "rotini Ravioli baseline must bind exactly existing token ids 0, 1, and 2",
  );
  const generated = objectValue(dependency.generatedAtOpen, "rotini generated-at-open evidence");
  exactValue(natValue(generated.availableActions, "rotini generated-at-open capacity"), 3, "rotini generated-at-open capacity");
  exactValue(generated.requiresActionIndex, true, "rotini generated-at-open action-index requirement");
  return scriptCodeSha256;
}

function receiptOriginEntries(receipt: JsonObject, app: "gnocchi" | "rotini"): JsonObject[] {
  if (app === "rotini") {
    if (receipt.schema === "pastaprotocol-rotini-ui-live-finalized@1") {
      return arrayValue(receipt.indexedOperationReceipts, "rotini recovered indexed operation receipts").map((value, index) =>
        objectValue(value, `rotini recovered operation receipt ${index}`)
      );
    }
    const bridgeReceipts = objectValue(receipt.bridgeReceipts, "rotini bridge receipts");
    return arrayValue(bridgeReceipts.creator, "rotini creator bridge receipts").map((value, index) =>
      objectValue(value, `rotini creator bridge receipt ${index}`)
    );
  }
  if (receipt.schema === "pastaprotocol-gnocchi-ui-live-finalized@1") {
    return arrayValue(receipt.indexedOperationReceipts, "gnocchi recovered indexed operation receipts").map((value, index) =>
      objectValue(value, `gnocchi recovered operation receipt ${index}`)
    );
  }
  return arrayValue(receipt.receipts, "gnocchi bridge receipts").map((value, index) =>
    objectValue(value, `gnocchi bridge receipt ${index}`)
  );
}

function validateOrigination(input: {
  app: "gnocchi" | "rotini";
  manifest: JsonObject;
  receipt: JsonObject;
  contractAddress: string;
  creator: string;
}): string {
  const operations = arrayValue(input.manifest.operations, `${input.app} manifest operations`).map((value, index) =>
    objectValue(value, `${input.app} operation ${index}`)
  );
  const originations = operations.filter((operation) => operation.kind === "origination");
  requireValue(originations.length === 1, `${input.app} manifest must expose exactly one origination`);
  const origin = originations[0];
  exactValue(origin.status, "applied", `${input.app} origination status`);
  exactValue(origin.contractAddress, input.contractAddress, `${input.app} origination contract address`);
  const operationHash = requireOperationHash(origin.hash, `${input.app} origination operation hash`);

  const receiptOriginations = receiptOriginEntries(input.receipt, input.app).filter((entry) => entry.action === "originate");
  requireValue(receiptOriginations.length === 1, `${input.app} receipt must expose exactly one origination`);
  const receiptOrigin = receiptOriginations[0];
  exactValue(receiptOrigin.operationHash, operationHash, `${input.app} receipt origination hash`);
  exactValue(receiptOrigin.contractAddress, input.contractAddress, `${input.app} receipt origination contract`);
  exactValue(receiptOrigin.signerAddress, input.creator, `${input.app} receipt origination signer`);
  exactValue(receiptOrigin.chainId, FRESH_RAVIOLI_CHAIN_ID, `${input.app} receipt origination chain id`);
  return operationHash;
}

async function validateTerminalPortableSupplement(input: {
  manifest: JsonObject;
  artifacts: Map<string, LoadedArtifact>;
  appRoot: string;
  runId: string;
  contractAddress: string;
  manifestScreenshots: JsonObject[];
  capabilities: JsonObject[];
}): Promise<void> {
  requireValue(
    input.manifestScreenshots.length === GNOCCHI_TERMINAL_LIFECYCLE_STAGES.length + GNOCCHI_PORTABLE_SUPPLEMENT_STAGES.length,
    "terminal Gnocchi manifest must contain exactly lifecycle stages 001-019 followed by portable stages 901/902",
  );
  const portableScreenshots = input.manifestScreenshots.slice(GNOCCHI_TERMINAL_LIFECYCLE_STAGES.length);
  exactStringArray(
    portableScreenshots.map((screenshot) => screenshot.stage),
    GNOCCHI_PORTABLE_SUPPLEMENT_STAGES,
    "terminal Gnocchi portable screenshot stages",
  );

  let subject;
  try {
    subject = selectPortableSiteSubject(input.manifest, "gnocchi");
  } catch (error) {
    fail(`terminal Gnocchi portable subject failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  exactValue(subject.runId, input.runId, "terminal Gnocchi portable subject run id");
  exactValue(subject.contract.address, input.contractAddress, "terminal Gnocchi portable subject contract");
  requireValue(subject.token !== null, "terminal Gnocchi portable subject must bind token 0");
  exactValue(subject.token.tokenId, "0", "terminal Gnocchi portable subject token id");

  const zipArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-portable-self-hosted-site.zip",
    "self-hosted-site-package",
    "terminal Gnocchi portable ZIP",
  );
  exactValue(zipArtifact.evidence.id, GNOCCHI_PORTABLE_ARTIFACT_IDS[0], "terminal Gnocchi portable ZIP id");
  const reportArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-portable-self-hosted-site-proof.json",
    "self-hosted-site-proof",
    "terminal Gnocchi portable report",
  );
  exactValue(reportArtifact.evidence.id, GNOCCHI_PORTABLE_ARTIFACT_IDS[1], "terminal Gnocchi portable report id");

  let archive: ReturnType<typeof validatePortableSiteArchive>;
  try {
    archive = validatePortableSiteArchive(zipArtifact.bytes, subject);
  } catch (error) {
    fail(`terminal Gnocchi portable ZIP validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  exactValue(archive.sha256, zipArtifact.evidence.sha256, "terminal Gnocchi portable ZIP hash");

  const report = parseJson(reportArtifact.bytes, "terminal Gnocchi portable report");
  exactValue(report.schema, "pastaprotocol-portable-site-proof@1", "terminal Gnocchi portable report schema");
  exactValue(report.classification, "UI-LIVE", "terminal Gnocchi portable report classification");
  exactValue(report.app, "gnocchi", "terminal Gnocchi portable report app");
  exactValue(report.runId, input.runId, "terminal Gnocchi portable report run id");
  const reportNetwork = objectValue(report.network, "terminal Gnocchi portable report network");
  exactValue(reportNetwork.name, FRESH_RAVIOLI_NETWORK, "terminal Gnocchi portable report network name");
  exactValue(reportNetwork.chainId, FRESH_RAVIOLI_CHAIN_ID, "terminal Gnocchi portable report chain id");
  exactJson(report.subject, { contract: subject.contract, token: subject.token }, "terminal Gnocchi portable report subject");
  exactJson(report.studio, {
    path: "/creation-tools/gnocchi/index.html",
    exportControl: "#btnExportSite",
    downloadedFileName: "gnocchi-site.zip",
  }, "terminal Gnocchi portable Studio evidence");
  const reportArchive = objectValue(report.archive, "terminal Gnocchi portable report archive");
  exactValue(reportArchive.path, zipArtifact.evidence.path, "terminal Gnocchi portable report ZIP path");
  exactValue(reportArchive.sha256, zipArtifact.evidence.sha256, "terminal Gnocchi portable report ZIP hash");
  exactJson(reportArchive.entries, archive.entries, "terminal Gnocchi portable report entry inventory");
  exactJson(reportArchive.config, archive.config, "terminal Gnocchi portable report config");
  exactStringArray(report.screenshots, GNOCCHI_PORTABLE_SUPPLEMENT_STAGES, "terminal Gnocchi portable report screenshots");

  const runtime = objectValue(report.independentRuntime, "terminal Gnocchi independent portable runtime");
  exactValue(runtime.servedFromExtractedArchive, true, "terminal Gnocchi extracted-archive serving flag");
  exactValue(runtime.reusedStudioOrigin, false, "terminal Gnocchi Studio-origin reuse flag");
  exactValue(runtime.sourceApplicationFilesRequested, false, "terminal Gnocchi source-application request flag");
  for (const [field, label] of [
    ["objktRequests", "Objkt requests"],
    ["teiaRequests", "Teia requests"],
    ["wtfosRequests", "wtfOS requests"],
    ["signerBridgeActions", "signer bridge actions"],
  ] as const) {
    exactValue(natValue(runtime[field], `terminal Gnocchi portable ${label}`), 0, `terminal Gnocchi portable ${label}`);
  }
  exactValue(runtime.appLabel, "Gnocchi · Pasta Protocol", "terminal Gnocchi portable app label");
  exactValue(runtime.contract, input.contractAddress, "terminal Gnocchi portable runtime contract");
  exactValue(runtime.itemId, "0", "terminal Gnocchi portable runtime token id");
  exactValue(runtime.status, "On-chain state loaded.", "terminal Gnocchi portable runtime status");
  stringValue(runtime.chainState, "terminal Gnocchi portable chain state");
  exactStringArray(
    runtime.localRequestedPaths,
    archive.entries.map((entry) => entry.path),
    "terminal Gnocchi portable local request inventory",
  );
  requireValue(
    arrayValue(runtime.forbiddenRemoteHosts, "terminal Gnocchi portable forbidden hosts").length === 0,
    "terminal Gnocchi portable runtime contacted a forbidden host",
  );
  const forbiddenHost = /(^|\.)(?:objkt\.com|objkt\.one|teia\.art|wtfos\.app|wtfos\.me)$/i;
  arrayValue(runtime.remoteOrigins, "terminal Gnocchi portable remote origins").forEach((origin, index) => {
    const parsed = new URL(stringValue(origin, `terminal Gnocchi portable remote origin ${index}`));
    requireValue(!forbiddenHost.test(parsed.hostname), `terminal Gnocchi portable remote origin ${parsed.hostname} is forbidden`);
  });

  const portableSidecars: string[] = [];
  for (const [index, expectedStage] of GNOCCHI_PORTABLE_SUPPLEMENT_STAGES.entries()) {
    const screenshot = portableScreenshots[index];
    const ordinal = 901 + index;
    exactValue(screenshot.path, `screenshots/${expectedStage}.png`, `terminal Gnocchi portable screenshot ${ordinal} path`);
    const screenshotBytes = await readRegularFile(
      path.join(input.appRoot, stringValue(screenshot.path, `terminal Gnocchi portable screenshot ${ordinal} path`)),
      input.appRoot,
      `terminal Gnocchi portable screenshot ${ordinal}`,
    );
    const screenshotHash = requireSha256(screenshot.sha256, `terminal Gnocchi portable screenshot ${ordinal} hash`);
    exactValue(hashBytes(screenshotBytes), screenshotHash, `terminal Gnocchi portable screenshot ${ordinal} byte hash`);
    const sidecarId = `screenshot-sidecar-${expectedStage}`;
    portableSidecars.push(sidecarId);
    const sidecarArtifact = artifactById(input.artifacts, sidecarId, `terminal Gnocchi portable sidecar ${ordinal}`);
    exactValue(sidecarArtifact.evidence.kind, "screenshot-sidecar", `terminal Gnocchi portable sidecar ${ordinal} kind`);
    exactValue(
      sidecarArtifact.evidence.path,
      `artifacts/screenshot-${expectedStage}.json`,
      `terminal Gnocchi portable sidecar ${ordinal} path`,
    );
    const sidecar = parseJson(sidecarArtifact.bytes, `terminal Gnocchi portable sidecar ${ordinal}`);
    exactValue(sidecar.schema, "pastaprotocol-screenshot-evidence@1", `terminal Gnocchi portable sidecar ${ordinal} schema`);
    exactValue(sidecar.app, "gnocchi", `terminal Gnocchi portable sidecar ${ordinal} app`);
    exactValue(sidecar.classification, "UI-LIVE", `terminal Gnocchi portable sidecar ${ordinal} classification`);
    exactValue(sidecar.capability, "portable self-hosted site", `terminal Gnocchi portable sidecar ${ordinal} capability`);
    exactValue(natValue(sidecar.stageOrdinal, `terminal Gnocchi portable sidecar ${ordinal} ordinal`), ordinal, `terminal Gnocchi portable sidecar ${ordinal} ordinal`);
    exactValue(
      sidecar.stageName,
      index === 0 ? "actual studio export complete" : "extracted page live independently",
      `terminal Gnocchi portable sidecar ${ordinal} stage name`,
    );
    exactValue(sidecar.sha256, screenshotHash, `terminal Gnocchi portable sidecar ${ordinal} screenshot hash`);
    exactValue(
      natValue(sidecar.byteCount, `terminal Gnocchi portable sidecar ${ordinal} byte count`),
      screenshotBytes.byteLength,
      `terminal Gnocchi portable sidecar ${ordinal} byte count`,
    );
    const viewport = objectValue(sidecar.viewport, `terminal Gnocchi portable sidecar ${ordinal} viewport`);
    exactJson(viewport, { width: 1440, height: 900, deviceScaleFactor: 1 }, `terminal Gnocchi portable sidecar ${ordinal} viewport`);
    const sidecarUrl = new URL(stringValue(sidecar.url, `terminal Gnocchi portable sidecar ${ordinal} URL`));
    exactValue(sidecarUrl.hostname, "127.0.0.1", `terminal Gnocchi portable sidecar ${ordinal} host`);
    exactValue(
      sidecarUrl.pathname,
      index === 0 ? "/creation-tools/gnocchi/index.html" : "/index.html",
      `terminal Gnocchi portable sidecar ${ordinal} page path`,
    );
    const requiredSelectors = index === 0
      ? ["#btnExportSite", "#exportSiteStatus"]
      : ["#appLabel", "#contract", "#itemId", "#status"];
    const domEvidence = arrayValue(sidecar.domEvidence, `terminal Gnocchi portable sidecar ${ordinal} DOM evidence`)
      .map((value, domIndex) => objectValue(value, `terminal Gnocchi portable sidecar ${ordinal} DOM evidence ${domIndex}`));
    exactStringArray(domEvidence.map((record) => record.selector), requiredSelectors, `terminal Gnocchi portable sidecar ${ordinal} DOM selectors`);
    domEvidence.forEach((record, domIndex) => {
      exactValue(natValue(record.matchCount, `terminal Gnocchi portable DOM match ${domIndex}`), 1, `terminal Gnocchi portable DOM match ${domIndex}`);
      exactValue(natValue(record.selectedIndex, `terminal Gnocchi portable DOM selection ${domIndex}`), 0, `terminal Gnocchi portable DOM selection ${domIndex}`);
      stringValue(record.text, `terminal Gnocchi portable DOM text ${domIndex}`);
    });
  }

  const portableCapability = input.capabilities[1];
  exactValue(portableCapability.id, "portable-self-hosted-site", "terminal Gnocchi portable capability id");
  const portableEvidence = objectValue(portableCapability.evidence, "terminal Gnocchi portable capability evidence");
  exactStringArray(portableEvidence.screenshots, GNOCCHI_PORTABLE_SUPPLEMENT_STAGES, "terminal Gnocchi portable capability screenshots");
  exactStringArray(portableEvidence.artifacts, [
    zipArtifact.evidence.id,
    reportArtifact.evidence.id,
    ...portableSidecars,
  ], "terminal Gnocchi portable capability artifacts");
  exactStringArray(portableEvidence.contracts, [input.contractAddress], "terminal Gnocchi portable capability contracts");
  exactStringArray(portableEvidence.tokens, ["gnocchi-token-0"], "terminal Gnocchi portable capability tokens");
  exactStringArray(portableEvidence.urls, [subject.token.explorerUrl], "terminal Gnocchi portable capability URLs");
  requireValue(arrayValue(portableEvidence.operations, "terminal Gnocchi portable capability operations").length === 0, "terminal Gnocchi portable capability must not claim an operation");
  requireValue(arrayValue(portableEvidence.roleEvidence, "terminal Gnocchi portable role evidence").length === 0, "terminal Gnocchi portable capability must not claim role evidence");
}

async function validateTerminalGnocchiRecovery(input: {
  receipt: JsonObject;
  manifest: JsonObject;
  artifacts: Map<string, LoadedArtifact>;
  appRoot: string;
  runId: string;
  contractAddress: string;
  creator: string;
  operations: JsonObject[];
  reconciliation: JsonObject;
  receiptScreenshots: JsonObject[];
  manifestScreenshots: JsonObject[];
}): Promise<void> {
  exactValue(input.runId, GNOCCHI_TERMINAL_RECOVERY_RUN_ID, "terminal Gnocchi run id");
  exactValue(input.contractAddress, GNOCCHI_TERMINAL_RECOVERY_CONTRACT, "terminal Gnocchi contract");
  exactValue(input.creator, GNOCCHI_TERMINAL_RECOVERY_CREATOR, "terminal Gnocchi creator");
  exactValue(
    objectValue(input.receipt.actors, "terminal Gnocchi actors").collectorOne,
    "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej",
    "terminal Gnocchi collector one",
  );
  exactValue(
    objectValue(input.receipt.actors, "terminal Gnocchi actors").collectorTwo,
    "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
    "terminal Gnocchi collector two",
  );

  const operationHashes = GNOCCHI_TERMINAL_OPERATION_PLAN.map(({ hash }) => hash);
  input.operations.forEach((operation, index) => {
    const expected = GNOCCHI_TERMINAL_OPERATION_PLAN[index];
    exactValue(operation.operationHash, expected.hash, `terminal Gnocchi operation ${index} hash`);
    exactValue(natValue(operation.level, `terminal Gnocchi operation ${index} level`), expected.level, `terminal Gnocchi operation ${index} level`);
    exactValue(natValue(operation.counter, `terminal Gnocchi operation ${index} counter`), expected.counter, `terminal Gnocchi operation ${index} counter`);
    exactValue(operation.timestampUtc, expected.timestamp, `terminal Gnocchi operation ${index} timestamp`);
    exactValue(operation.signerAddress, expected.sender, `terminal Gnocchi operation ${index} signer`);
    exactValue(operation.action, expected.action, `terminal Gnocchi operation ${index} action`);
    if (expected.entrypoint === undefined) {
      requireValue(
        operation.entrypoints === undefined || operation.entrypoints === null,
        "terminal Gnocchi origination must not expose an entrypoint",
      );
    } else {
      exactJson(operation.entrypoints, [expected.entrypoint], `terminal Gnocchi operation ${index} entrypoint`);
    }
  });

  exactStringArray(
    input.receiptScreenshots.map((screenshot) => screenshot.stage),
    GNOCCHI_TERMINAL_LIFECYCLE_STAGES,
    "terminal Gnocchi lifecycle receipt stages",
  );
  for (const [index, stage] of GNOCCHI_TERMINAL_LIFECYCLE_STAGES.entries()) {
    exactValue(input.receiptScreenshots[index].path, `screenshots/${stage}.png`, `terminal Gnocchi lifecycle screenshot ${index + 1} path`);
  }

  const terminalArtifact = artifactByPath(
    input.artifacts,
    GNOCCHI_TERMINAL_RECOVERY_RECEIPT_PATH,
    "ui-live-terminal-readonly-recovery-receipt",
    "terminal Gnocchi recovery receipt",
  );
  exactValue(terminalArtifact.evidence.id, "gnocchi-terminal-readonly-recovery", "terminal Gnocchi recovery artifact id");
  exactValue(terminalArtifact.raw.durability, "package-only", "terminal Gnocchi recovery artifact durability");
  const terminalReceipt = parseJson(terminalArtifact.bytes, "terminal Gnocchi recovery receipt");
  validateTerminalBridge(terminalReceipt.bridge, "terminal Gnocchi bridge audit");
  externalValidation("terminal Gnocchi recovery receipt", () => {
    validateGnocchiTerminalRecoveryReceipt({
      receipt: terminalReceipt,
      runId: input.runId,
      contractAddress: input.contractAddress,
      operationHashes,
    });
  });

  const operationGraph = objectValue(terminalReceipt.operationGraph, "terminal Gnocchi operation graph");
  const expectedOperationGraphSha256 = hashBytes(deterministicJsonBytes(
    GNOCCHI_TERMINAL_OPERATION_PLAN.map((operation) => ({ ...operation, contractAddress: input.contractAddress })),
  ));
  exactValue(operationGraph.operationGraphSha256, expectedOperationGraphSha256, "terminal Gnocchi operation-graph hash");
  exactValue(operationGraph.terminalOperationAlreadyApplied, true, "terminal Gnocchi terminal-operation applied flag");
  exactValue(natValue(operationGraph.replayedOperations, "terminal Gnocchi replayed operations"), 0, "terminal Gnocchi replayed operations");

  const terminalState = objectValue(terminalReceipt.terminalState, "terminal Gnocchi terminal state");
  const supplies = arrayValue(terminalState.supplies, "terminal Gnocchi terminal supplies")
    .map((value, index) => natValue(value, `terminal Gnocchi terminal supply ${index}`));
  exactJson(supplies, [4, 4, 3], "terminal Gnocchi terminal supplies");
  const before = terminalSnapshot(terminalReceipt.before, supplies, "terminal Gnocchi before snapshot");
  const after = terminalSnapshot(terminalReceipt.after, supplies, "terminal Gnocchi after snapshot");
  externalValidation("terminal Gnocchi zero-write before/after proof", () => {
    assertGnocchiTerminalSnapshotUnchanged(before, after);
  });
  exactValue(before.operationGraphSha256, expectedOperationGraphSha256, "terminal Gnocchi before operation-graph hash");
  exactValue(after.operationGraphSha256, expectedOperationGraphSha256, "terminal Gnocchi after operation-graph hash");
  const beforeRpc = validateTerminalRpcSnapshot(
    objectValue(terminalReceipt.before, "terminal Gnocchi before snapshot").rpc,
    before,
    "terminal Gnocchi before RPC evidence",
  );
  const afterRpc = validateTerminalRpcSnapshot(
    objectValue(terminalReceipt.after, "terminal Gnocchi after snapshot").rpc,
    after,
    "terminal Gnocchi after RPC evidence",
  );
  exactJson(afterRpc, beforeRpc, "terminal Gnocchi before/after RPC state");

  const terminalContent = arrayValue(terminalReceipt.contentArtifacts, "terminal Gnocchi content artifacts")
    .map((value, index) => objectValue(value, `terminal Gnocchi content artifact ${index}`));
  requireValue(terminalContent.length === GNOCCHI_TERMINAL_CONTENT_IDS.length, "terminal Gnocchi receipt must bind exactly seven content artifacts");
  terminalContent.forEach((record, index) => {
    const id = GNOCCHI_TERMINAL_CONTENT_IDS[index];
    exactValue(record.id, id, `terminal Gnocchi content artifact ${index} id`);
    const packaged = artifactById(input.artifacts, id, `terminal Gnocchi content artifact ${index}`);
    exactValue(record.path, packaged.evidence.path, `terminal Gnocchi content artifact ${id} path`);
    exactValue(record.sha256, packaged.evidence.sha256, `terminal Gnocchi content artifact ${id} hash`);
    exactValue(record.ipfsUri, packaged.evidence.ipfsUri, `terminal Gnocchi content artifact ${id} URI`);
    exactValue(record.ipfsUri, `ipfs://${stringValue(record.cid, `terminal Gnocchi content artifact ${id} CID`)}`, `terminal Gnocchi content artifact ${id} CID binding`);
    exactValue(
      natValue(record.byteLength, `terminal Gnocchi content artifact ${id} byte length`),
      packaged.bytes.byteLength,
      `terminal Gnocchi content artifact ${id} byte length`,
    );
  });

  const terminalScreenshots = arrayValue(terminalReceipt.screenshots, "terminal Gnocchi recovery screenshots")
    .map((value, index) => objectValue(value, `terminal Gnocchi recovery screenshot ${index}`));
  for (const [index, ordinal] of [18, 19].entries()) {
    const terminalScreenshot = terminalScreenshots[index];
    const lifecycleScreenshot = input.receiptScreenshots[ordinal - 1];
    exactValue(terminalScreenshot.path, lifecycleScreenshot.path, `terminal Gnocchi recovered screenshot ${ordinal} path`);
    exactValue(terminalScreenshot.sha256, lifecycleScreenshot.sha256, `terminal Gnocchi recovered screenshot ${ordinal} hash`);
    const sidecarStage = GNOCCHI_TERMINAL_LIFECYCLE_STAGES[ordinal - 1];
    const sidecar = artifactById(input.artifacts, `screenshot-sidecar-${sidecarStage}`, `terminal Gnocchi recovered sidecar ${ordinal}`);
    exactValue(terminalScreenshot.sidecarPath, sidecar.evidence.path, `terminal Gnocchi recovered sidecar ${ordinal} path`);
    exactValue(terminalScreenshot.sidecarSha256, sidecar.evidence.sha256, `terminal Gnocchi recovered sidecar ${ordinal} hash`);
  }

  const expectedTerminalSummary = {
    receiptSha256: terminalArtifact.evidence.sha256,
    prefix: terminalReceipt.prefix,
    operationGraph: terminalReceipt.operationGraph,
    terminalState: terminalReceipt.terminalState,
    bridge: terminalReceipt.bridge,
    unchanged: terminalReceipt.unchanged,
    recoveredScreenshotOrdinals: [18, 19],
    replayedAppliedOperations: 0,
  };
  exactJson(input.receipt.terminalRecovery, expectedTerminalSummary, "terminal Gnocchi finalization summary");
  exactJson(input.reconciliation.terminalRecovery, expectedTerminalSummary, "terminal Gnocchi reconciliation summary");

  const reconciliationNetwork = input.reconciliation.network;
  exactValue(reconciliationNetwork, FRESH_RAVIOLI_NETWORK, "terminal Gnocchi reconciliation network");
  exactValue(input.reconciliation.chainId, FRESH_RAVIOLI_CHAIN_ID, "terminal Gnocchi reconciliation chain id");
  exactJson(input.reconciliation.actors, input.receipt.actors, "terminal Gnocchi reconciliation actors");
  const originalFailure = objectValue(input.reconciliation.originalFailure, "terminal Gnocchi original failure");
  exactJson(originalFailure, {
    code: "POST_CONFIRMATION_TERMINAL_SCREENSHOT_MISSING",
    stage: "after-collector-two-token-two-mint-before-terminal-screenshot",
    chainMutationApplied: true,
    ordinaryRerunForbidden: true,
    bridgeReceiptStreamAvailable: false,
    bridgeReceiptStreamSynthesized: false,
  }, "terminal Gnocchi original failure");
  const reconciliationSideEffects = objectValue(input.reconciliation.sideEffects, "terminal Gnocchi reconciliation side effects");
  exactValue(reconciliationSideEffects.signerMaterialLoaded, false, "terminal Gnocchi reconciliation signer-material flag");
  exactValue(natValue(reconciliationSideEffects.chainWrites, "terminal Gnocchi reconciliation chain writes"), 0, "terminal Gnocchi reconciliation chain writes");
  exactValue(natValue(reconciliationSideEffects.ipfsWrites, "terminal Gnocchi reconciliation IPFS writes"), 0, "terminal Gnocchi reconciliation IPFS writes");
  exactStringArray(reconciliationSideEffects.httpMethods, ["GET"], "terminal Gnocchi reconciliation HTTP methods");
  exactJson(input.reconciliation.operations, input.operations, "terminal Gnocchi reconciliation operation graph");

  const historicalArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-proof-time-indexer-snapshot.json",
    "historical-indexer-snapshot",
    "terminal Gnocchi historical indexer snapshot",
  );
  exactValue(historicalArtifact.evidence.id, "gnocchi-proof-time-indexer-snapshot", "terminal Gnocchi historical snapshot id");
  validateHistoricalGnocchiSnapshot({
    artifact: historicalArtifact,
    runId: input.runId,
    contractAddress: input.contractAddress,
    operationHashes,
  });

  const expectedArtifactIds = [...GNOCCHI_TERMINAL_CORE_ARTIFACT_IDS, ...GNOCCHI_PORTABLE_ARTIFACT_IDS];
  exactJson(Array.from(input.artifacts.keys()), expectedArtifactIds, "terminal Gnocchi manifest artifact inventory");
  const capabilities = arrayValue(input.manifest.capabilities, "terminal Gnocchi capabilities")
    .map((value, index) => objectValue(value, `terminal Gnocchi capability ${index}`));
  requireValue(capabilities.length === 2, "terminal Gnocchi manifest must contain exactly lifecycle and portable capabilities");
  exactValue(capabilities[0].id, "three-policy-collector-and-lifecycle-proof", "terminal Gnocchi lifecycle capability id");
  const lifecycleEvidence = objectValue(capabilities[0].evidence, "terminal Gnocchi lifecycle capability evidence");
  exactStringArray(lifecycleEvidence.artifacts, GNOCCHI_TERMINAL_CORE_ARTIFACT_IDS, "terminal Gnocchi lifecycle capability artifacts");
  exactStringArray(lifecycleEvidence.contracts, [input.contractAddress], "terminal Gnocchi lifecycle capability contracts");
  exactStringArray(lifecycleEvidence.operations, operationHashes, "terminal Gnocchi lifecycle capability operations");
  exactStringArray(lifecycleEvidence.screenshots, GNOCCHI_TERMINAL_LIFECYCLE_STAGES, "terminal Gnocchi lifecycle capability screenshots");
  exactStringArray(lifecycleEvidence.tokens, ["gnocchi-token-0", "gnocchi-token-1", "gnocchi-token-2"], "terminal Gnocchi lifecycle capability tokens");
  requireValue(arrayValue(lifecycleEvidence.roleEvidence, "terminal Gnocchi lifecycle role evidence").length === 0, "terminal Gnocchi lifecycle capability must not claim role evidence");

  await validateTerminalPortableSupplement({
    manifest: input.manifest,
    artifacts: input.artifacts,
    appRoot: input.appRoot,
    runId: input.runId,
    contractAddress: input.contractAddress,
    manifestScreenshots: input.manifestScreenshots,
    capabilities,
  });
}

async function validateRecoveredGnocchiReceipt(input: {
  receipt: JsonObject;
  manifest: JsonObject;
  artifacts: Map<string, LoadedArtifact>;
  appRoot: string;
  runId: string;
  contractAddress: string;
  creator: string;
}): Promise<void> {
  exactValue(input.receipt.schema, "pastaprotocol-gnocchi-ui-live-finalized@1", "recovered Gnocchi receipt schema");
  const classification = recoveredGnocchiClassification(input.receipt, "recovered Gnocchi");
  exactValue(input.manifest.classification, classification, "recovered Gnocchi manifest classification");
  exactValue(input.receipt.status, "RECOVERED", "recovered Gnocchi status");
  exactValue(input.receipt.runId, input.runId, "recovered Gnocchi run id");
  requireValue(!("receipts" in input.receipt), "recovered Gnocchi receipt must not synthesize native bridge receipts");
  requireValue(!("pins" in input.receipt), "recovered Gnocchi receipt must not synthesize native pin receipts");
  requireValue(!("funding" in input.receipt), "recovered Gnocchi receipt must not synthesize native funding authorization");
  const bridge = objectValue(input.receipt.originalBridgeReceiptStream, "recovered Gnocchi bridge-stream disclosure");
  exactValue(bridge.available, false, "recovered Gnocchi bridge stream availability");
  exactValue(bridge.synthesized, false, "recovered Gnocchi bridge stream synthesis flag");
  const funding = objectValue(input.receipt.fundingEvidence, "recovered Gnocchi funding disclosure");
  exactValue(funding.available, false, "recovered Gnocchi funding evidence availability");
  exactValue(funding.synthesized, false, "recovered Gnocchi funding evidence synthesis flag");
  const sideEffects = objectValue(input.receipt.sideEffects, "recovered Gnocchi side effects");
  exactValue(sideEffects.signerMaterialLoaded, false, "recovered Gnocchi signer-material flag");
  exactValue(natValue(sideEffects.chainWrites, "recovered Gnocchi chain writes"), 0, "recovered Gnocchi chain writes");
  exactValue(natValue(sideEffects.ipfsWrites, "recovered Gnocchi IPFS writes"), 0, "recovered Gnocchi IPFS writes");
  const methods = arrayValue(sideEffects.httpMethods, "recovered Gnocchi HTTP methods");
  requireValue(methods.length === 1 && methods[0] === "GET", "recovered Gnocchi finalizer must use only GET requests");

  assertReceiptContentArtifacts(input.receipt, input.artifacts, "gnocchi");
  const operations = arrayValue(input.receipt.indexedOperationReceipts, "recovered Gnocchi operations")
    .map((value, index) => objectValue(value, `recovered Gnocchi operation ${index}`));
  requireValue(operations.length === 12, "recovered Gnocchi receipt must bind exactly 12 applied operations");
  const expectedEntrypoints: Array<string | undefined> = [
    undefined,
    "create_open_edition", "create_open_edition", "create_open_edition",
    "open_mint", "open_mint", "open_mint",
    "set_sale_active", "set_sale_active",
    "open_mint", "open_mint", "open_mint",
  ];
  const manifestOperations = arrayValue(input.manifest.operations, "recovered Gnocchi manifest operations")
    .map((value, index) => objectValue(value, `recovered Gnocchi manifest operation ${index}`));
  requireValue(manifestOperations.length === operations.length, "recovered Gnocchi manifest/receipt operation count mismatch");
  const actors = objectValue(input.receipt.actors, "recovered Gnocchi actors");
  exactValue(actors.creator, input.creator, "recovered Gnocchi creator");
  const collectorOne = requireImplicitAddress(actors.collectorOne, "recovered Gnocchi collector one");
  const collectorTwo = requireImplicitAddress(actors.collectorTwo, "recovered Gnocchi collector two");
  requireValue(collectorOne !== collectorTwo && collectorOne !== input.creator && collectorTwo !== input.creator, "recovered Gnocchi actors must be independent");
  let priorLevel = -1;
  const hashes = new Set<string>();
  for (const [index, operation] of operations.entries()) {
    exactValue(operation.schema, "pastaprotocol-indexed-operation-receipt@1", `recovered Gnocchi operation ${index} schema`);
    exactValue(operation.source, "tzkt", `recovered Gnocchi operation ${index} source`);
    exactValue(operation.status, "applied", `recovered Gnocchi operation ${index} status`);
    exactValue(operation.chainId, FRESH_RAVIOLI_CHAIN_ID, `recovered Gnocchi operation ${index} chain id`);
    exactValue(operation.contractAddress, input.contractAddress, `recovered Gnocchi operation ${index} contract`);
    const hash = requireOperationHash(operation.operationHash, `recovered Gnocchi operation ${index} hash`);
    requireValue(!hashes.has(hash), `recovered Gnocchi operation ${index} hash must be unique`);
    hashes.add(hash);
    const level = natValue(operation.level, `recovered Gnocchi operation ${index} level`);
    requireValue(level > priorLevel, `recovered Gnocchi operation ${index} levels must be strictly increasing`);
    priorLevel = level;
    const expectedEntrypoint = expectedEntrypoints[index];
    if (expectedEntrypoint === undefined) {
      exactValue(operation.action, "originate", "recovered Gnocchi first operation action");
      requireValue(
        operation.entrypoints === undefined ||
          (classification === GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION && operation.entrypoints === null),
        "recovered Gnocchi origination must not expose an entrypoint",
      );
      exactValue(operation.signerAddress, input.creator, "recovered Gnocchi origination signer");
    } else {
      exactValue(operation.action, "call", `recovered Gnocchi operation ${index} action`);
      const entrypoints = arrayValue(operation.entrypoints, `recovered Gnocchi operation ${index} entrypoints`);
      requireValue(entrypoints.length === 1 && entrypoints[0] === expectedEntrypoint, `recovered Gnocchi operation ${index} entrypoint order drift`);
      if (expectedEntrypoint !== "open_mint") {
        exactValue(operation.signerAddress, input.creator, `recovered Gnocchi creator operation ${index} signer`);
      } else {
        const expectedCollector = index <= 6 ? collectorOne : collectorTwo;
        exactValue(operation.signerAddress, expectedCollector, `recovered Gnocchi mint operation ${index} signer`);
      }
    }
    exactValue(manifestOperations[index].hash, hash, `recovered Gnocchi manifest operation ${index} hash`);
    exactValue(manifestOperations[index].status, "applied", `recovered Gnocchi manifest operation ${index} status`);
    exactValue(manifestOperations[index].contractAddress, input.contractAddress, `recovered Gnocchi manifest operation ${index} contract`);
  }

  const receiptScreenshots = arrayValue(input.receipt.screenshots, "recovered Gnocchi receipt screenshots");
  const manifestScreenshots = arrayValue(input.manifest.screenshots, "recovered Gnocchi manifest screenshots");
  const sidecars = arrayValue(input.receipt.screenshotSidecars, "recovered Gnocchi screenshot sidecars");
  requireValue(
    receiptScreenshots.length === 19 && sidecars.length === 19,
    "recovered Gnocchi lifecycle receipt must bind exactly 19 screenshots and sidecars",
  );
  requireValue(
    manifestScreenshots.length === (classification === GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION ? 21 : 19),
    classification === GNOCCHI_TERMINAL_RECOVERY_CLASSIFICATION
      ? "terminal Gnocchi manifest must bind exactly 21 screenshots (001-019 plus 901/902)"
      : "recovered Gnocchi manifest must bind exactly 19 screenshots",
  );
  for (let index = 0; index < 19; index += 1) {
    const receiptScreenshot = objectValue(receiptScreenshots[index], `recovered Gnocchi receipt screenshot ${index}`);
    const manifestScreenshot = objectValue(manifestScreenshots[index], `recovered Gnocchi manifest screenshot ${index}`);
    exactValue(JSON.stringify(receiptScreenshot), JSON.stringify(manifestScreenshot), `recovered Gnocchi screenshot ${index} manifest/receipt identity`);
    const screenshotPath = safeRelativePath(receiptScreenshot.path, `recovered Gnocchi screenshot ${index} path`);
    const screenshotBytes = await readRegularFile(path.join(input.appRoot, screenshotPath), input.appRoot, `recovered Gnocchi screenshot ${index}`);
    exactValue(hashBytes(screenshotBytes), requireSha256(receiptScreenshot.sha256, `recovered Gnocchi screenshot ${index} hash`), `recovered Gnocchi screenshot ${index} byte hash`);
    const sidecarReference = objectValue(sidecars[index], `recovered Gnocchi sidecar ${index}`);
    const sidecarArtifact = artifactById(input.artifacts, sidecarReference.id, `recovered Gnocchi sidecar ${index}`);
    exactValue(sidecarReference.path, sidecarArtifact.evidence.path, `recovered Gnocchi sidecar ${index} path`);
    exactValue(sidecarReference.sha256, sidecarArtifact.evidence.sha256, `recovered Gnocchi sidecar ${index} hash`);
    const sidecar = parseJson(sidecarArtifact.bytes, `recovered Gnocchi sidecar ${index}`);
    exactValue(sidecar.schema, "pastaprotocol-screenshot-evidence@1", `recovered Gnocchi sidecar ${index} schema`);
    exactValue(sidecar.app, "gnocchi", `recovered Gnocchi sidecar ${index} app`);
    exactValue(sidecar.classification, "UI-LIVE", `recovered Gnocchi sidecar ${index} classification`);
    exactValue(natValue(sidecar.stageOrdinal, `recovered Gnocchi sidecar ${index} ordinal`), index + 1, `recovered Gnocchi sidecar ${index} ordinal`);
    exactValue(sidecar.sha256, receiptScreenshot.sha256, `recovered Gnocchi sidecar ${index} screenshot hash`);
    exactValue(
      natValue(sidecar.byteCount, `recovered Gnocchi sidecar ${index} byte count`),
      screenshotBytes.byteLength,
      `recovered Gnocchi sidecar ${index} byte count`,
    );
  }

  const reconciliationReference = objectValue(input.receipt.chainReconciliation, "recovered Gnocchi chain reconciliation reference");
  const reconciliationArtifact = artifactById(input.artifacts, reconciliationReference.id, "recovered Gnocchi chain reconciliation");
  exactValue(reconciliationArtifact.evidence.kind, "chain-reconciliation-snapshot", "recovered Gnocchi reconciliation kind");
  exactValue(reconciliationReference.path, reconciliationArtifact.evidence.path, "recovered Gnocchi reconciliation path");
  exactValue(reconciliationReference.sha256, reconciliationArtifact.evidence.sha256, "recovered Gnocchi reconciliation hash");
  const reconciliation = parseJson(reconciliationArtifact.bytes, "recovered Gnocchi reconciliation snapshot");
  exactValue(reconciliation.schema, "pastaprotocol-gnocchi-chain-reconciliation@1", "recovered Gnocchi reconciliation schema");
  exactValue(reconciliation.classification, classification, "recovered Gnocchi reconciliation classification");
  exactValue(reconciliation.status, "RECOVERED", "recovered Gnocchi reconciliation status");
  exactValue(reconciliation.runId, input.runId, "recovered Gnocchi reconciliation run id");
  exactValue(objectValue(reconciliation.contract, "recovered Gnocchi reconciliation contract").address, input.contractAddress, "recovered Gnocchi reconciliation contract address");
  const reconciliationOperations = arrayValue(reconciliation.operations, "recovered Gnocchi reconciliation operations");
  requireValue(reconciliationOperations.length === 12, "recovered Gnocchi reconciliation must bind 12 operations");
  reconciliationOperations.forEach((operationValue, index) => {
    const operation = objectValue(operationValue, `recovered Gnocchi reconciliation operation ${index}`);
    exactValue(operation.operationHash, operations[index].operationHash, `recovered Gnocchi reconciliation operation ${index} hash`);
  });

  if (classification === GNOCCHI_CHECKPOINTED_RECOVERY_CLASSIFICATION) {
    validateCheckpointedGnocchiRecovery({
      receipt: input.receipt,
      reconciliation,
      artifacts: input.artifacts,
      runId: input.runId,
      contractAddress: input.contractAddress,
      operations,
    });
  } else if (classification === GNOCCHI_READ_ONLY_FINALIZATION_CLASSIFICATION) {
    requireValue(
      !("recovery" in input.receipt),
      "historical read-only Gnocchi finalization must not carry checkpointed recovery evidence",
    );
    requireValue(
      !("recovery" in reconciliation),
      "historical read-only Gnocchi reconciliation must not carry checkpointed recovery evidence",
    );
    const checkpointArtifacts = Array.from(input.artifacts.values()).filter((artifact) =>
      artifact.evidence.path.startsWith("artifacts/gnocchi-current-recovery/") ||
      artifact.evidence.path === "artifacts/gnocchi-current-recovery-final.json" ||
      artifact.evidence.kind.startsWith("durable-recovery-") ||
      artifact.evidence.kind === "ui-live-recovery-receipt" ||
      artifact.evidence.kind === "chain-reconciliation-source"
    );
    requireValue(
      checkpointArtifacts.length === 0,
      "historical read-only Gnocchi finalization must not disguise checkpointed recovery artifacts",
    );
  } else {
    await validateTerminalGnocchiRecovery({
      receipt: input.receipt,
      manifest: input.manifest,
      artifacts: input.artifacts,
      appRoot: input.appRoot,
      runId: input.runId,
      contractAddress: input.contractAddress,
      creator: input.creator,
      operations,
      reconciliation,
      receiptScreenshots: receiptScreenshots.map((value, index) =>
        objectValue(value, `terminal Gnocchi receipt screenshot ${index}`)
      ),
      manifestScreenshots: manifestScreenshots.map((value, index) =>
        objectValue(value, `terminal Gnocchi manifest screenshot ${index}`)
      ),
    });
  }
}

function validateCheckpointedGnocchiRecovery(input: {
  receipt: JsonObject;
  reconciliation: JsonObject;
  artifacts: Map<string, LoadedArtifact>;
  runId: string;
  contractAddress: string;
  operations: JsonObject[];
}): void {
  const recovery = objectValue(input.receipt.recovery, "checkpointed Gnocchi recovery");
  const interruption = objectValue(recovery.interruption, "checkpointed Gnocchi interruption");
  const interruptionCode = stringValue(interruption.code, "checkpointed Gnocchi interruption code");
  const interruptionStage = stringValue(interruption.stage, "checkpointed Gnocchi interruption stage");
  const recoveryProfiles = [
    {
      id: "three-operation-prefix",
      code: "POST_CONFIRMATION_READ_STORAGE_HTTP_500",
      stage: "after-token-one-before-screenshot-seven",
      events: 46,
      pins: 2,
      recoveredOperations: 3,
      liveOperations: 9,
      recoveredContentObjects: 5,
      nativeContentObjects: 2,
      screenshotStart: 7,
      phaseCounts: {
        APPLIED: 9,
        EXPECTED_REJECTION: 2,
        PIN_CONFIRMED: 2,
        PIN_PREPARED: 2,
        PREPARED: 9,
        SCREENSHOT_ACCEPTED: 13,
        SUBMITTED: 9,
      },
      nativeContent: [
        {
          id: "token-2-media",
          path: "artifacts/gnocchi-current-recovery/pins/001-token-2-media.png",
        },
        {
          id: "token-2-metadata",
          path: "artifacts/gnocchi-current-recovery/pins/002-token-2-metadata.json",
        },
      ],
      requireScreenshotPartitions: false,
    },
    {
      id: "six-operation-prefix",
      code: "POST_CONFIRMATION_SCREENSHOT_RESOURCE_HTTP_500",
      stage: "after-collector-one-token-one-before-screenshot-eleven",
      events: 29,
      pins: 0,
      recoveredOperations: 6,
      liveOperations: 6,
      recoveredContentObjects: 7,
      nativeContentObjects: 0,
      screenshotStart: 11,
      phaseCounts: {
        APPLIED: 6,
        EXPECTED_REJECTION: 2,
        PREPARED: 6,
        SCREENSHOT_ACCEPTED: 9,
        SUBMITTED: 6,
      },
      nativeContent: [],
      requireScreenshotPartitions: true,
    },
  ] as const;
  const profile = recoveryProfiles.find(
    (candidate) => candidate.code === interruptionCode && candidate.stage === interruptionStage,
  );
  requireValue(
    profile,
    `checkpointed Gnocchi interruption ${JSON.stringify({ code: interruptionCode, stage: interruptionStage })} must match an authenticated recovery profile`,
  );
  exactValue(
    interruption.recoveredWithoutReplayingAppliedPrefix,
    true,
    "checkpointed Gnocchi no-prefix-replay guarantee",
  );

  const checkpoint = objectValue(recovery.checkpoint, "checkpointed Gnocchi checkpoint");
  const checkpointId = requireSha256(checkpoint.checkpointId, "checkpointed Gnocchi checkpoint id");
  const finalArtifactSha256 = requireSha256(
    checkpoint.finalArtifactSha256,
    "checkpointed Gnocchi final checkpoint artifact hash",
  );
  const finalRecordSha256 = requireSha256(
    checkpoint.finalRecordSha256,
    "checkpointed Gnocchi final record hash",
  );
  const intentSha256 = requireSha256(checkpoint.intentSha256, "checkpointed Gnocchi intent hash");
  const terminalSha256 = requireSha256(checkpoint.terminalSha256, "checkpointed Gnocchi terminal-chain hash");
  exactValue(natValue(checkpoint.events, "checkpointed Gnocchi event count"), profile.events, "checkpointed Gnocchi event count");
  exactValue(natValue(checkpoint.pins, "checkpointed Gnocchi pin count"), profile.pins, "checkpointed Gnocchi pin count");
  exactValue(
    natValue(checkpoint.recoveredOperations, "checkpointed Gnocchi recovered operation count"),
    profile.recoveredOperations,
    "checkpointed Gnocchi recovered operation count",
  );
  exactValue(
    natValue(checkpoint.liveOperations, "checkpointed Gnocchi live operation count"),
    profile.liveOperations,
    "checkpointed Gnocchi live operation count",
  );

  const provenance = objectValue(recovery.provenance, "checkpointed Gnocchi provenance");
  exactValue(
    natValue(provenance.replayedAppliedOperations, "checkpointed Gnocchi replayed operation count"),
    0,
    "checkpointed Gnocchi replayed operation count",
  );
  exactValue(
    natValue(provenance.recoveredContentObjects, "checkpointed Gnocchi recovered content count"),
    profile.recoveredContentObjects,
    "checkpointed Gnocchi recovered content count",
  );
  exactValue(
    natValue(provenance.nativeContinuationContentObjects, "checkpointed Gnocchi native content count"),
    profile.nativeContentObjects,
    "checkpointed Gnocchi native content count",
  );
  const operationHashes = input.operations.map((operation, index) =>
    requireOperationHash(operation.operationHash, `checkpointed Gnocchi operation ${index} hash`)
  );
  const recoveredPrefixOperations = arrayValue(
    provenance.recoveredPrefixOperations,
    "checkpointed Gnocchi recovered prefix operations",
  );
  const nativeContinuationOperations = arrayValue(
    provenance.nativeContinuationOperations,
    "checkpointed Gnocchi native continuation operations",
  );
  requireValue(
    recoveredPrefixOperations.length === profile.recoveredOperations,
    `checkpointed Gnocchi provenance must bind exactly ${profile.recoveredOperations} recovered prefix operations`,
  );
  requireValue(
    nativeContinuationOperations.length === profile.liveOperations,
    `checkpointed Gnocchi provenance must bind exactly ${profile.liveOperations} native continuation operations`,
  );
  recoveredPrefixOperations.forEach((hash, index) => {
    exactValue(hash, operationHashes[index], `checkpointed Gnocchi recovered prefix operation ${index} hash`);
  });
  nativeContinuationOperations.forEach((hash, index) => {
    exactValue(hash, operationHashes[index + profile.recoveredOperations], `checkpointed Gnocchi native continuation operation ${index} hash`);
  });

  const recoveryReceiptArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-current-recovery-final.json",
    "ui-live-recovery-receipt",
    "checkpointed Gnocchi recovery receipt",
  );
  const checkpointArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-current-recovery/final.json",
    "durable-recovery-finalization",
    "checkpointed Gnocchi final checkpoint",
  );
  const intentArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-current-recovery/intent.json",
    "durable-recovery-intent",
    "checkpointed Gnocchi recovery intent",
  );
  const terminalArtifact = artifactByPath(
    input.artifacts,
    "artifacts/gnocchi-current-recovery/terminal-chain.json",
    "chain-reconciliation-source",
    "checkpointed Gnocchi terminal chain",
  );
  [
    recoveryReceiptArtifact,
    checkpointArtifact,
    intentArtifact,
    terminalArtifact,
  ].forEach((artifact) => {
    exactValue(artifact.raw.durability, "package-only", `checkpointed Gnocchi ${artifact.evidence.path} durability`);
  });
  exactValue(checkpointArtifact.evidence.sha256, finalArtifactSha256, "checkpointed Gnocchi final artifact binding");
  exactValue(intentArtifact.evidence.sha256, intentSha256, "checkpointed Gnocchi intent artifact binding");
  exactValue(terminalArtifact.evidence.sha256, terminalSha256, "checkpointed Gnocchi terminal artifact binding");

  const eventArtifacts = Array.from(input.artifacts.values())
    .filter((artifact) => artifact.evidence.kind === "durable-recovery-event")
    .sort((left, right) => left.evidence.path.localeCompare(right.evidence.path));
  requireValue(
    eventArtifacts.length === profile.events,
    `checkpointed Gnocchi manifest must bind exactly ${profile.events} durable recovery events`,
  );
  const phaseCounts = new Map<string, number>();
  const appliedHashes: string[] = [];
  const submittedHashes: string[] = [];
  const screenshotOrdinals: number[] = [];
  const rejectionEvents: JsonObject[] = [];
  let previousRecordSha256 = intentSha256;
  eventArtifacts.forEach((artifact, index) => {
    const ordinal = String(index + 1).padStart(6, "0");
    exactValue(artifact.raw.durability, "package-only", `checkpointed Gnocchi event ${index + 1} durability`);
    requireValue(
      artifact.evidence.path.startsWith(`artifacts/gnocchi-current-recovery/events/${ordinal}-`),
      `checkpointed Gnocchi event ${index + 1} path must preserve journal ordinal ${ordinal}`,
    );
    const event = parseJson(artifact.bytes, `checkpointed Gnocchi event ${index + 1}`);
    exactValue(event.schema, "pastaprotocol-gnocchi-current-recovery-event@1", `checkpointed Gnocchi event ${index + 1} schema`);
    exactValue(event.checkpointId, checkpointId, `checkpointed Gnocchi event ${index + 1} checkpoint id`);
    exactValue(natValue(event.eventIndex, `checkpointed Gnocchi event ${index + 1} index`), index + 1, `checkpointed Gnocchi event ${index + 1} index`);
    exactValue(
      event.previousRecordSha256,
      previousRecordSha256,
      `checkpointed Gnocchi event ${index + 1} hash-chain predecessor`,
    );
    previousRecordSha256 = artifact.evidence.sha256;
    const phase = stringValue(event.phase, `checkpointed Gnocchi event ${index + 1} phase`);
    phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
    if (phase === "APPLIED") {
      appliedHashes.push(requireOperationHash(event.operationHash, `checkpointed Gnocchi applied event ${index + 1} hash`));
    } else if (phase === "SUBMITTED") {
      submittedHashes.push(requireOperationHash(event.operationHash, `checkpointed Gnocchi submitted event ${index + 1} hash`));
    } else if (phase === "SCREENSHOT_ACCEPTED") {
      screenshotOrdinals.push(natValue(event.stageOrdinal, `checkpointed Gnocchi screenshot event ${index + 1} ordinal`));
    } else if (phase === "EXPECTED_REJECTION") {
      rejectionEvents.push(event);
    }
  });
  const expectedPhaseCounts: Readonly<Record<string, number>> = profile.phaseCounts;
  requireValue(
    phaseCounts.size === Object.keys(expectedPhaseCounts).length,
    "checkpointed Gnocchi journal contains an unexpected phase",
  );
  Object.entries(expectedPhaseCounts).forEach(([phase, count]) => {
    exactValue(phaseCounts.get(phase), count, `checkpointed Gnocchi ${phase} event count`);
  });
  appliedHashes.forEach((hash, index) => {
    exactValue(hash, operationHashes[index + profile.recoveredOperations], `checkpointed Gnocchi applied continuation ${index} hash`);
    exactValue(submittedHashes[index], hash, `checkpointed Gnocchi submitted/applied continuation ${index} hash`);
  });
  requireValue(
    screenshotOrdinals.length === 20 - profile.screenshotStart &&
      screenshotOrdinals.every((ordinal, index) => ordinal === index + profile.screenshotStart),
    `checkpointed Gnocchi screenshot journal ordinals must be exactly ${profile.screenshotStart} through 19`,
  );
  const expectedRejections = [
    { tokenId: 1, reason: "this sale is paused" },
    { tokenId: 2, reason: "not enough supply left" },
  ] as const;
  rejectionEvents.forEach((event, index) => {
    exactValue(natValue(event.tokenId, `checkpointed Gnocchi rejection ${index} token id`), expectedRejections[index].tokenId, `checkpointed Gnocchi rejection ${index} token id`);
    exactValue(event.reason, expectedRejections[index].reason, `checkpointed Gnocchi rejection ${index} reason`);
    const before = natValue(event.transactionCountBefore, `checkpointed Gnocchi rejection ${index} transaction count before`);
    exactValue(
      natValue(event.transactionCountAfter, `checkpointed Gnocchi rejection ${index} transaction count after`),
      before,
      `checkpointed Gnocchi rejection ${index} no-write invariant`,
    );
  });
  exactValue(
    previousRecordSha256,
    finalRecordSha256,
    "checkpointed Gnocchi final journal record binding",
  );

  const recoveryReceipt = parseJson(recoveryReceiptArtifact.bytes, "checkpointed Gnocchi recovery receipt");
  exactValue(recoveryReceipt.schema, "pastaprotocol-gnocchi-current-recovery@1", "checkpointed Gnocchi recovery receipt schema");
  exactValue(
    recoveryReceipt.classification,
    GNOCCHI_CHECKPOINTED_RECOVERY_CLASSIFICATION,
    "checkpointed Gnocchi recovery receipt classification",
  );
  exactValue(recoveryReceipt.status, "PASSED", "checkpointed Gnocchi recovery receipt status");
  exactValue(recoveryReceipt.runId, input.runId, "checkpointed Gnocchi recovery receipt run id");
  exactValue(recoveryReceipt.network, FRESH_RAVIOLI_NETWORK, "checkpointed Gnocchi recovery receipt network");
  exactValue(recoveryReceipt.chainId, FRESH_RAVIOLI_CHAIN_ID, "checkpointed Gnocchi recovery receipt chain id");
  exactValue(
    objectValue(recoveryReceipt.contract, "checkpointed Gnocchi recovery receipt contract").address,
    input.contractAddress,
    "checkpointed Gnocchi recovery receipt contract address",
  );
  ["receipts", "bridgeReceipts", "pins", "funding"].forEach((field) => {
    requireValue(
      !(field in recoveryReceipt),
      `checkpointed Gnocchi recovery receipt must not synthesize ${field}`,
    );
  });
  const recoveryReceiptInterruption = objectValue(
    recoveryReceipt.interruption,
    "checkpointed Gnocchi recovery receipt interruption",
  );
  exactValue(
    recoveryReceiptInterruption.code,
    interruption.code,
    "checkpointed Gnocchi recovery receipt interruption code",
  );
  exactValue(
    recoveryReceiptInterruption.stage,
    interruption.stage,
    "checkpointed Gnocchi recovery receipt interruption stage",
  );
  exactValue(
    recoveryReceiptInterruption.recoveredWithoutReplayingAppliedPrefix,
    true,
    "checkpointed Gnocchi recovery receipt no-prefix-replay guarantee",
  );
  const recoveryReceiptCheckpoint = objectValue(
    recoveryReceipt.checkpoint,
    "checkpointed Gnocchi recovery receipt checkpoint",
  );
  exactValue(recoveryReceiptCheckpoint.checkpointId, checkpointId, "checkpointed Gnocchi recovery checkpoint id binding");
  exactValue(recoveryReceiptCheckpoint.finalArtifactSha256, finalArtifactSha256, "checkpointed Gnocchi recovery final hash binding");
  exactValue(recoveryReceiptCheckpoint.finalRecordSha256, finalRecordSha256, "checkpointed Gnocchi recovery final-record binding");
  exactValue(recoveryReceiptCheckpoint.intentSha256, intentSha256, "checkpointed Gnocchi recovery intent binding");
  exactValue(recoveryReceiptCheckpoint.terminalSha256, terminalSha256, "checkpointed Gnocchi recovery terminal binding");
  exactValue(natValue(recoveryReceiptCheckpoint.events, "checkpointed Gnocchi receipt event count"), profile.events, "checkpointed Gnocchi receipt event count");
  exactValue(natValue(recoveryReceiptCheckpoint.pins, "checkpointed Gnocchi receipt pin count"), profile.pins, "checkpointed Gnocchi receipt pin count");
  exactValue(natValue(recoveryReceiptCheckpoint.recoveredOperations, "checkpointed Gnocchi receipt recovered operation count"), profile.recoveredOperations, "checkpointed Gnocchi receipt recovered operation count");
  exactValue(natValue(recoveryReceiptCheckpoint.liveOperations, "checkpointed Gnocchi receipt live operation count"), profile.liveOperations, "checkpointed Gnocchi receipt live operation count");
  const recoveryPrefix = objectValue(recoveryReceipt.prefix, "checkpointed Gnocchi recovery prefix");
  const recoveryPrefixOperations = arrayValue(
    recoveryPrefix.recoveredOperations,
    "checkpointed Gnocchi recovery receipt prefix operations",
  );
  requireValue(
    recoveryPrefixOperations.length === profile.recoveredOperations,
    `checkpointed Gnocchi recovery receipt must expose ${profile.recoveredOperations} prefix operations`,
  );
  recoveryPrefixOperations.forEach((operationValue, index) => {
    const operation = objectValue(operationValue, `checkpointed Gnocchi recovery receipt prefix operation ${index}`);
    exactValue(operation.hash, operationHashes[index], `checkpointed Gnocchi recovery receipt prefix operation ${index} hash`);
  });
  const recoveredContent = arrayValue(
    recoveryPrefix.recoveredContent,
    "checkpointed Gnocchi recovery receipt recovered content",
  ).map((value, index) => objectValue(value, `checkpointed Gnocchi recovered content ${index}`));
  exactValue(recoveredContent.length, profile.recoveredContentObjects, "checkpointed Gnocchi recovery receipt recovered content count");
  if (profile.requireScreenshotPartitions) {
    const preservedScreenshots = arrayValue(
      recoveryPrefix.preservedScreenshots,
      "checkpointed Gnocchi preserved screenshot ordinals",
    );
    requireValue(
      preservedScreenshots.length === profile.screenshotStart - 1 &&
        preservedScreenshots.every(
          (ordinal, index) => natValue(ordinal, `checkpointed Gnocchi preserved screenshot ordinal ${index}`) === index + 1,
        ),
      `checkpointed Gnocchi preserved screenshot ordinals must be exactly 1 through ${profile.screenshotStart - 1}`,
    );
  }
  const recoveryContinuation = objectValue(recoveryReceipt.continuation, "checkpointed Gnocchi recovery continuation");
  const liveOrdinals = arrayValue(
    recoveryContinuation.liveOperationOrdinals,
    "checkpointed Gnocchi recovery live operation ordinals",
  );
  requireValue(
    liveOrdinals.length === profile.liveOperations &&
      liveOrdinals.every(
        (ordinal, index) =>
          natValue(ordinal, `checkpointed Gnocchi live ordinal ${index}`) === index + profile.recoveredOperations + 1,
      ),
    `checkpointed Gnocchi recovery live operation ordinals must be exactly ${profile.recoveredOperations + 1} through 12`,
  );
  const nativeContent = arrayValue(
    recoveryContinuation.newContent,
    "checkpointed Gnocchi recovery receipt native content",
  ).map((value, index) => objectValue(value, `checkpointed Gnocchi native content ${index}`));
  exactValue(nativeContent.length, profile.nativeContentObjects, "checkpointed Gnocchi recovery receipt native content count");
  const finalContent = arrayValue(
    input.receipt.contentArtifacts,
    "checkpointed Gnocchi final content artifacts",
  ).map((value, index) => objectValue(value, `checkpointed Gnocchi final content artifact ${index}`));
  const finalContentById = new Map(finalContent.map((record) => [
    stringValue(record.id, "checkpointed Gnocchi final content id"),
    record,
  ]));
  [...recoveredContent, ...nativeContent].forEach((record, index) => {
    const id = stringValue(record.id, `checkpointed Gnocchi recovery content ${index} id`);
    const finalRecord = finalContentById.get(id);
    requireValue(finalRecord, `checkpointed Gnocchi recovery content ${id} must exist in finalized content`);
    exactValue(record.sha256, finalRecord.sha256, `checkpointed Gnocchi recovery content ${id} hash`);
    exactValue(record.uri, finalRecord.ipfsUri, `checkpointed Gnocchi recovery content ${id} URI`);
    exactValue(
      record.provenance,
      index < profile.recoveredContentObjects ? "recovered-on-chain-reference" : "native-ui-live-pin",
      `checkpointed Gnocchi recovery content ${id} provenance`,
    );
  });
  profile.nativeContent.forEach((expected, index) => {
    const durablePin = artifactByPath(
      input.artifacts,
      expected.path,
      "durable-recovery-pin-bytes",
      `checkpointed Gnocchi ${expected.id} durable pin`,
    );
    exactValue(durablePin.raw.durability, "package-only", `checkpointed Gnocchi ${expected.id} durable pin durability`);
    exactValue(durablePin.evidence.sha256, nativeContent[index].sha256, `checkpointed Gnocchi ${expected.id} durable pin hash`);
    exactValue(nativeContent[index].id, expected.id, `checkpointed Gnocchi native content ${index} id`);
  });
  const recoveryTerminal = objectValue(recoveryReceipt.terminalChain, "checkpointed Gnocchi recovery terminal chain");
  exactValue(recoveryTerminal.path, terminalArtifact.evidence.path, "checkpointed Gnocchi recovery terminal path");
  exactValue(recoveryTerminal.sha256, terminalSha256, "checkpointed Gnocchi recovery terminal hash");
  const recoveryTerminalHashes = arrayValue(
    recoveryTerminal.operationHashes,
    "checkpointed Gnocchi recovery terminal operation hashes",
  );
  requireValue(recoveryTerminalHashes.length === operationHashes.length, "checkpointed Gnocchi recovery terminal operation count mismatch");
  recoveryTerminalHashes.forEach((hash, index) => {
    exactValue(hash, operationHashes[index], `checkpointed Gnocchi recovery terminal operation ${index} hash`);
  });

  const checkpointFinal = parseJson(checkpointArtifact.bytes, "checkpointed Gnocchi final checkpoint");
  exactValue(checkpointFinal.schema, "pastaprotocol-gnocchi-current-recovery-checkpoint-final@1", "checkpointed Gnocchi final checkpoint schema");
  exactValue(checkpointFinal.status, "FINALIZED", "checkpointed Gnocchi final checkpoint status");
  exactValue(checkpointFinal.checkpointId, checkpointId, "checkpointed Gnocchi final checkpoint id");
  exactValue(checkpointFinal.finalRecordSha256, finalRecordSha256, "checkpointed Gnocchi final checkpoint record hash");
  exactValue(checkpointFinal.intentSha256, intentSha256, "checkpointed Gnocchi final checkpoint intent hash");
  exactValue(checkpointFinal.terminalSha256, terminalSha256, "checkpointed Gnocchi final checkpoint terminal hash");
  exactValue(natValue(checkpointFinal.events, "checkpointed Gnocchi final event count"), profile.events, "checkpointed Gnocchi final event count");
  exactValue(natValue(checkpointFinal.pins, "checkpointed Gnocchi final pin count"), profile.pins, "checkpointed Gnocchi final pin count");
  exactValue(natValue(checkpointFinal.recoveredOperations, "checkpointed Gnocchi final recovered operation count"), profile.recoveredOperations, "checkpointed Gnocchi final recovered operation count");
  exactValue(natValue(checkpointFinal.liveOperations, "checkpointed Gnocchi final live operation count"), profile.liveOperations, "checkpointed Gnocchi final live operation count");

  const intent = parseJson(intentArtifact.bytes, "checkpointed Gnocchi recovery intent");
  exactValue(intent.schema, "pastaprotocol-gnocchi-current-recovery-intent@1", "checkpointed Gnocchi recovery intent schema");
  exactValue(intent.status, "IMMUTABLE", "checkpointed Gnocchi recovery intent status");
  exactValue(intent.runId, input.runId, "checkpointed Gnocchi recovery intent run id");
  exactValue(intent.checkpointId, checkpointId, "checkpointed Gnocchi recovery intent checkpoint id");
  const intentSeed = { ...intent };
  delete intentSeed.checkpointId;
  exactValue(
    hashBytes(deterministicJsonBytes(intentSeed)),
    checkpointId,
    "checkpointed Gnocchi checkpoint id deterministic intent identity",
  );
  const intentNetwork = objectValue(intent.network, "checkpointed Gnocchi recovery intent network");
  exactValue(intentNetwork.name, FRESH_RAVIOLI_NETWORK, "checkpointed Gnocchi recovery intent network name");
  exactValue(intentNetwork.chainId, FRESH_RAVIOLI_CHAIN_ID, "checkpointed Gnocchi recovery intent chain id");
  exactValue(
    objectValue(intent.contract, "checkpointed Gnocchi recovery intent contract").address,
    input.contractAddress,
    "checkpointed Gnocchi recovery intent contract address",
  );
  const intentInterruption = objectValue(intent.interruption, "checkpointed Gnocchi recovery intent interruption");
  exactValue(intentInterruption.code, interruption.code, "checkpointed Gnocchi recovery intent interruption code");
  exactValue(intentInterruption.stage, interruption.stage, "checkpointed Gnocchi recovery intent interruption stage");
  exactValue(intentInterruption.chainMutationApplied, true, "checkpointed Gnocchi recovery intent mutation boundary");
  exactValue(intentInterruption.ordinaryRerunForbidden, true, "checkpointed Gnocchi recovery intent rerun guard");

  const terminal = parseJson(terminalArtifact.bytes, "checkpointed Gnocchi terminal chain");
  exactValue(terminal.schema, "pastaprotocol-gnocchi-current-recovery-terminal-chain@1", "checkpointed Gnocchi terminal schema");
  exactValue(terminal.network, FRESH_RAVIOLI_NETWORK, "checkpointed Gnocchi terminal network");
  exactValue(terminal.chainId, FRESH_RAVIOLI_CHAIN_ID, "checkpointed Gnocchi terminal chain id");
  exactValue(terminal.contract, input.contractAddress, "checkpointed Gnocchi terminal contract");
  const terminalHashes = arrayValue(terminal.operationHashes, "checkpointed Gnocchi terminal operation hashes");
  requireValue(terminalHashes.length === operationHashes.length, "checkpointed Gnocchi terminal operation count mismatch");
  terminalHashes.forEach((hash, index) => {
    exactValue(hash, operationHashes[index], `checkpointed Gnocchi terminal operation ${index} hash`);
  });

  const originalFailure = objectValue(input.reconciliation.originalFailure, "checkpointed Gnocchi original failure");
  exactValue(originalFailure.code, interruption.code, "checkpointed Gnocchi original failure code");
  exactValue(originalFailure.stage, interruption.stage, "checkpointed Gnocchi original failure stage");
  exactValue(originalFailure.bridgeReceiptStreamAvailable, false, "checkpointed Gnocchi original bridge availability");
  exactValue(originalFailure.bridgeReceiptStreamSynthesized, false, "checkpointed Gnocchi original bridge synthesis flag");
  const reconciliationRecovery = objectValue(input.reconciliation.recovery, "checkpointed Gnocchi reconciliation recovery");
  exactValue(
    JSON.stringify(reconciliationRecovery),
    JSON.stringify(recovery),
    "checkpointed Gnocchi receipt/reconciliation recovery identity",
  );
}

const RECOVERED_ROTINI_CONTENT = Object.freeze([
  ["pin-001-generator-preview", "generator-preview", "artifacts/pins/001-creator-rotini-collection-preview.png", "creator", "rotini-collection-preview.png", "image/png"],
  ["pin-002-generator-layer", "generator-layer", "artifacts/pins/002-creator-rotini-layer-1.png", "creator", "rotini-layer-1.png", "image/png"],
  ["pin-003-generator-layer", "generator-layer", "artifacts/pins/003-creator-rotini-layer-2.png", "creator", "rotini-layer-2.png", "image/png"],
  ["pin-004-generator-metadata", "generator-metadata", "artifacts/pins/004-creator-rotini-generator.json", "creator", "rotini-generator.json", "application/json"],
  ["pin-005-collection-metadata", "collection-metadata", "artifacts/pins/005-creator-collection.json", "creator", "collection.json", "application/json"],
  ["pin-006-generator-preview", "generator-preview", "artifacts/pins/006-creator-rotini-collection-preview.png", "creator", "rotini-collection-preview.png", "image/png"],
  ["pin-007-generator-layer", "generator-layer", "artifacts/pins/007-creator-rotini-layer-1.png", "creator", "rotini-layer-1.png", "image/png"],
  ["pin-008-generator-layer", "generator-layer", "artifacts/pins/008-creator-rotini-layer-2.png", "creator", "rotini-layer-2.png", "image/png"],
  ["pin-009-generator-metadata", "generator-metadata", "artifacts/pins/009-creator-rotini-generator.json", "creator", "rotini-generator.json", "application/json"],
  ["pin-010-generator-preview", "generator-preview", "artifacts/pins/010-creator-rotini-collection-preview.png", "creator", "rotini-collection-preview.png", "image/png"],
  ["pin-011-generator-layer", "generator-layer", "artifacts/pins/011-creator-rotini-layer-1.png", "creator", "rotini-layer-1.png", "image/png"],
  ["pin-012-generator-layer", "generator-layer", "artifacts/pins/012-creator-rotini-layer-2.png", "creator", "rotini-layer-2.png", "image/png"],
  ["pin-013-generator-metadata", "generator-metadata", "artifacts/pins/013-creator-rotini-generator.json", "creator", "rotini-generator.json", "application/json"],
  ["pin-014-token-media", "token-media", "artifacts/pins/014-collector-rotini-0.png", "collector", "rotini-0.png", "image/png"],
  ["pin-015-token-metadata", "token-metadata", "artifacts/pins/015-collector-rotini-0.json", "collector", "rotini-0.json", "application/json"],
  ["pin-016-token-media", "token-media", "artifacts/pins/016-collector-rotini-1.gif", "collector", "rotini-1.gif", "image/gif"],
  ["pin-017-token-metadata", "token-metadata", "artifacts/pins/017-collector-rotini-1.json", "collector", "rotini-1.json", "application/json"],
  ["pin-018-token-media", "token-media", "artifacts/pins/018-collector-rotini-2.zip", "collector", "rotini-2.zip", "application/zip"],
  ["pin-019-token-display", "token-display", "artifacts/pins/019-collector-rotini-2-cover.png", "collector", "rotini-2-cover.png", "image/png"],
  ["pin-020-token-metadata", "token-metadata", "artifacts/pins/020-collector-rotini-2.json", "collector", "rotini-2.json", "application/json"],
] as const);

async function validateRecoveredRotiniReceipt(input: {
  receipt: JsonObject;
  manifest: JsonObject;
  artifacts: Map<string, LoadedArtifact>;
  appRoot: string;
  runId: string;
  contractAddress: string;
  creator: string;
}): Promise<void> {
  exactValue(input.receipt.schema, "pastaprotocol-rotini-ui-live-finalized@1", "recovered Rotini receipt schema");
  exactValue(input.receipt.classification, "UI-LIVE-READ-ONLY-FINALIZATION", "recovered Rotini classification");
  exactValue(input.receipt.status, "RECOVERED", "recovered Rotini status");
  exactValue(input.receipt.runId, input.runId, "recovered Rotini run id");
  requireValue(!("bridgeReceipts" in input.receipt), "recovered Rotini receipt must not reconstruct native bridge receipts");
  requireValue(!("pins" in input.receipt), "recovered Rotini receipt must not reconstruct native pin receipts");
  requireValue(!("funding" in input.receipt), "recovered Rotini receipt must not synthesize native funding authorization");
  const bridge = objectValue(input.receipt.originalBridgeReceiptStream, "recovered Rotini bridge-stream disclosure");
  exactValue(bridge.available, false, "recovered Rotini bridge stream availability");
  exactValue(bridge.synthesized, false, "recovered Rotini bridge stream synthesis flag");
  const terminalInterruption = objectValue(input.receipt.terminalInterruption, "recovered Rotini terminal interruption disclosure");
  exactValue(
    terminalInterruption.classification,
    "TERMINAL_POST_WRITE_FAILURE_CAUSE_UNAVAILABLE",
    "recovered Rotini terminal interruption classification",
  );
  exactValue(terminalInterruption.exactCauseAvailable, false, "recovered Rotini exact interruption cause availability");
  exactValue(terminalInterruption.synthesized, false, "recovered Rotini interruption synthesis flag");
  const funding = objectValue(input.receipt.fundingEvidence, "recovered Rotini funding disclosure");
  exactValue(funding.available, false, "recovered Rotini funding evidence availability");
  exactValue(funding.synthesized, false, "recovered Rotini funding evidence synthesis flag");
  const sideEffects = objectValue(input.receipt.sideEffects, "recovered Rotini side effects");
  exactValue(sideEffects.signerMaterialLoaded, false, "recovered Rotini signer-material flag");
  exactValue(natValue(sideEffects.chainWrites, "recovered Rotini chain writes"), 0, "recovered Rotini chain writes");
  exactValue(natValue(sideEffects.ipfsWrites, "recovered Rotini IPFS writes"), 0, "recovered Rotini IPFS writes");
  const methods = arrayValue(sideEffects.httpMethods, "recovered Rotini HTTP methods");
  requireValue(methods.length === 1 && methods[0] === "GET", "recovered Rotini finalizer must use only GET requests");

  assertReceiptContentArtifacts(input.receipt, input.artifacts, "rotini", RECOVERED_ROTINI_CONTENT.length);
  const content = arrayValue(input.receipt.contentArtifacts, "recovered Rotini content artifacts")
    .map((value, index) => objectValue(value, `recovered Rotini content artifact ${index}`));
  RECOVERED_ROTINI_CONTENT.forEach(([id, kind, artifactPath, actor, fileName], index) => {
    const record = content[index];
    exactValue(record.id, id, `recovered Rotini content ${index} id`);
    exactValue(record.kind, kind, `recovered Rotini content ${id} kind`);
    exactValue(record.path, artifactPath, `recovered Rotini content ${id} path`);
    exactValue(record.actor, actor, `recovered Rotini content ${id} actor`);
    exactValue(record.fileName, fileName, `recovered Rotini content ${id} file name`);
  });

  const actors = objectValue(input.receipt.actors, "recovered Rotini actors");
  exactValue(actors.creator, input.creator, "recovered Rotini creator");
  const collector = requireImplicitAddress(actors.collector, "recovered Rotini collector");
  requireValue(collector !== input.creator, "recovered Rotini creator and collector must be independent");
  exactValue(actors.independent, true, "recovered Rotini independent-actor flag");
  const operations = arrayValue(input.receipt.indexedOperationReceipts, "recovered Rotini operations")
    .map((value, index) => objectValue(value, `recovered Rotini operation ${index}`));
  requireValue(operations.length === 10, "recovered Rotini receipt must bind exactly 10 applied operations");
  const expectedEntrypoints: Array<string | undefined> = [
    undefined,
    "create_project", "create_project", "create_project",
    "reserve_iteration", "finalize_iteration",
    "reserve_iteration", "finalize_iteration",
    "reserve_iteration", "finalize_iteration",
  ];
  const manifestOperations = arrayValue(input.manifest.operations, "recovered Rotini manifest operations")
    .map((value, index) => objectValue(value, `recovered Rotini manifest operation ${index}`));
  requireValue(manifestOperations.length === operations.length, "recovered Rotini manifest/receipt operation count mismatch");
  const hashes = new Set<string>();
  let priorLevel = -1;
  operations.forEach((operation, index) => {
    exactValue(operation.schema, "pastaprotocol-indexed-operation-receipt@1", `recovered Rotini operation ${index} schema`);
    exactValue(operation.source, "tzkt", `recovered Rotini operation ${index} source`);
    exactValue(operation.status, "applied", `recovered Rotini operation ${index} status`);
    exactValue(operation.chainId, FRESH_RAVIOLI_CHAIN_ID, `recovered Rotini operation ${index} chain id`);
    exactValue(operation.contractAddress, input.contractAddress, `recovered Rotini operation ${index} contract`);
    const hash = requireOperationHash(operation.operationHash, `recovered Rotini operation ${index} hash`);
    requireValue(!hashes.has(hash), `recovered Rotini operation ${index} hash must be unique`);
    hashes.add(hash);
    const level = natValue(operation.level, `recovered Rotini operation ${index} level`);
    requireValue(level >= priorLevel, `recovered Rotini operation ${index} levels must be monotonic`);
    priorLevel = level;
    const expectedEntrypoint = expectedEntrypoints[index];
    if (expectedEntrypoint === undefined) {
      exactValue(operation.action, "originate", "recovered Rotini first operation action");
      requireValue(operation.entrypoints === undefined, "recovered Rotini origination must not expose an entrypoint");
      exactValue(operation.signerAddress, input.creator, "recovered Rotini origination signer");
    } else {
      exactValue(operation.action, "call", `recovered Rotini operation ${index} action`);
      const entrypoints = arrayValue(operation.entrypoints, `recovered Rotini operation ${index} entrypoints`);
      requireValue(entrypoints.length === 1 && entrypoints[0] === expectedEntrypoint, `recovered Rotini operation ${index} entrypoint order drift`);
      exactValue(operation.signerAddress, index <= 3 ? input.creator : collector, `recovered Rotini operation ${index} signer`);
    }
    exactValue(manifestOperations[index].hash, hash, `recovered Rotini manifest operation ${index} hash`);
    exactValue(manifestOperations[index].status, "applied", `recovered Rotini manifest operation ${index} status`);
    exactValue(manifestOperations[index].contractAddress, input.contractAddress, `recovered Rotini manifest operation ${index} contract`);
  });

  const receiptScreenshots = arrayValue(input.receipt.screenshots, "recovered Rotini receipt screenshots");
  const manifestScreenshots = arrayValue(input.manifest.screenshots, "recovered Rotini manifest screenshots");
  const sidecars = arrayValue(input.receipt.screenshotSidecars, "recovered Rotini screenshot sidecars");
  requireValue(
    receiptScreenshots.length === 9 && manifestScreenshots.length === 9 && sidecars.length === 9,
    "recovered Rotini must bind exactly 9 screenshots and sidecars",
  );
  for (let index = 0; index < 9; index += 1) {
    const receiptScreenshot = objectValue(receiptScreenshots[index], `recovered Rotini receipt screenshot ${index}`);
    const manifestScreenshot = objectValue(manifestScreenshots[index], `recovered Rotini manifest screenshot ${index}`);
    exactValue(JSON.stringify(receiptScreenshot), JSON.stringify(manifestScreenshot), `recovered Rotini screenshot ${index} manifest/receipt identity`);
    const screenshotPath = safeRelativePath(receiptScreenshot.path, `recovered Rotini screenshot ${index} path`);
    const screenshotBytes = await readRegularFile(path.join(input.appRoot, screenshotPath), input.appRoot, `recovered Rotini screenshot ${index}`);
    exactValue(hashBytes(screenshotBytes), requireSha256(receiptScreenshot.sha256, `recovered Rotini screenshot ${index} hash`), `recovered Rotini screenshot ${index} byte hash`);
    const sidecarReference = objectValue(sidecars[index], `recovered Rotini sidecar ${index}`);
    const sidecarArtifact = artifactById(input.artifacts, sidecarReference.id, `recovered Rotini sidecar ${index}`);
    exactValue(sidecarReference.path, sidecarArtifact.evidence.path, `recovered Rotini sidecar ${index} path`);
    exactValue(sidecarReference.sha256, sidecarArtifact.evidence.sha256, `recovered Rotini sidecar ${index} hash`);
    const sidecar = parseJson(sidecarArtifact.bytes, `recovered Rotini sidecar ${index}`);
    exactValue(sidecar.schema, "pastaprotocol-screenshot-evidence@1", `recovered Rotini sidecar ${index} schema`);
    exactValue(sidecar.app, "rotini", `recovered Rotini sidecar ${index} app`);
    exactValue(sidecar.classification, "UI-LIVE", `recovered Rotini sidecar ${index} classification`);
    exactValue(natValue(sidecar.stageOrdinal, `recovered Rotini sidecar ${index} ordinal`), index + 1, `recovered Rotini sidecar ${index} ordinal`);
    exactValue(sidecar.sha256, receiptScreenshot.sha256, `recovered Rotini sidecar ${index} screenshot hash`);
  }

  const checkpointReference = objectValue(input.receipt.checkpoint, "recovered Rotini checkpoint reference");
  const checkpointIntent = artifactById(input.artifacts, checkpointReference.intentArtifactId, "recovered Rotini checkpoint intent");
  const checkpointFinal = artifactById(input.artifacts, checkpointReference.finalArtifactId, "recovered Rotini checkpoint finalization");
  exactValue(checkpointIntent.evidence.kind, "checkpoint-intent", "recovered Rotini checkpoint intent kind");
  exactValue(checkpointFinal.evidence.kind, "checkpoint-finalization", "recovered Rotini checkpoint final kind");
  const intent = parseJson(checkpointIntent.bytes, "recovered Rotini checkpoint intent");
  const finalization = parseJson(checkpointFinal.bytes, "recovered Rotini checkpoint finalization");
  exactValue(intent.schema, "pastaprotocol-rotini-ui-live-checkpoint-intent@1", "recovered Rotini checkpoint intent schema");
  exactValue(intent.runId, input.runId, "recovered Rotini checkpoint run id");
  const checkpointNetwork = objectValue(intent.network, "recovered Rotini checkpoint network");
  exactValue(checkpointNetwork.name, FRESH_RAVIOLI_NETWORK, "recovered Rotini checkpoint network name");
  exactValue(checkpointNetwork.chainId, FRESH_RAVIOLI_CHAIN_ID, "recovered Rotini checkpoint chain id");
  exactValue(objectValue(intent.actors, "recovered Rotini checkpoint actors").creator, input.creator, "recovered Rotini checkpoint creator");
  exactValue(objectValue(intent.actors, "recovered Rotini checkpoint actors").collector, collector, "recovered Rotini checkpoint collector");
  exactValue(finalization.schema, "pastaprotocol-rotini-ui-live-checkpoint-final@1", "recovered Rotini checkpoint final schema");
  exactValue(finalization.status, "FINALIZED", "recovered Rotini checkpoint final status");
  exactValue(finalization.checkpointId, intent.checkpointId, "recovered Rotini checkpoint final identity");
  exactValue(finalization.intentSha256, checkpointIntent.evidence.sha256, "recovered Rotini checkpoint intent hash binding");
  exactValue(checkpointReference.checkpointId, intent.checkpointId, "recovered Rotini receipt checkpoint identity");
  const counts = objectValue(finalization.counts, "recovered Rotini checkpoint counts");
  exactValue(natValue(counts.operations, "recovered Rotini checkpoint operation count"), 10, "recovered Rotini checkpoint operation count");
  exactValue(natValue(counts.pins, "recovered Rotini checkpoint pin count"), 20, "recovered Rotini checkpoint pin count");
  const strictCheckpoint = await openRotiniUiLiveCheckpoint(
    path.join(input.appRoot, "artifacts", "rotini-ui-live-checkpoint"),
  );
  const strictCheckpointEvidence = await strictCheckpoint.validatedEvidence();
  exactValue(strictCheckpointEvidence.checkpointId, intent.checkpointId, "recovered Rotini replayed checkpoint identity");
  exactValue(strictCheckpointEvidence.intentSha256, checkpointIntent.evidence.sha256, "recovered Rotini replayed checkpoint intent hash");
  exactValue(
    JSON.stringify(strictCheckpointEvidence.intent),
    JSON.stringify(intent),
    "recovered Rotini replayed checkpoint intent identity",
  );
  exactValue(strictCheckpointEvidence.summary.status, "FINALIZED", "recovered Rotini replayed checkpoint status");
  exactValue(
    natValue(strictCheckpointEvidence.summary.completedOperations, "recovered Rotini replayed operation count"),
    10,
    "recovered Rotini replayed operation count",
  );
  exactValue(
    natValue(strictCheckpointEvidence.summary.pins, "recovered Rotini replayed pin count"),
    20,
    "recovered Rotini replayed pin count",
  );
  requireValue(strictCheckpointEvidence.summary.pendingOperation === null, "recovered Rotini checkpoint must not have a pending operation");
  requireValue(strictCheckpointEvidence.summary.pendingPin === null, "recovered Rotini checkpoint must not have a pending pin");
  requireValue(
    strictCheckpointEvidence.summary.pendingPinReceipts.length === 0,
    "recovered Rotini checkpoint must not have pending pin receipts",
  );
  const strictFinalArtifacts = strictCheckpointEvidence.artifacts.filter((artifact) => artifact.path === "final.json");
  requireValue(strictFinalArtifacts.length === 1, "recovered Rotini checkpoint must expose exactly one strict final artifact");
  exactValue(strictFinalArtifacts[0].sha256, checkpointFinal.evidence.sha256, "recovered Rotini replayed checkpoint final hash");
  const checkpointRoot = path.join(input.appRoot, "artifacts", "rotini-ui-live-checkpoint");
  const confirmedEvents: JsonObject[] = [];
  for (const artifact of strictCheckpointEvidence.artifacts.filter((entry) => entry.path.startsWith("events/"))) {
    const eventBytes = await readRegularFile(
      path.join(checkpointRoot, artifact.path),
      checkpointRoot,
      `recovered Rotini checkpoint event ${artifact.path}`,
    );
    exactValue(hashBytes(eventBytes), artifact.sha256, `recovered Rotini checkpoint event ${artifact.path} hash`);
    const event = parseJson(eventBytes, `recovered Rotini checkpoint event ${artifact.path}`);
    if (event.phase === "CONFIRMED") confirmedEvents.push(event);
  }
  requireValue(confirmedEvents.length === operations.length, "recovered Rotini checkpoint/receipt confirmed-operation count mismatch");
  confirmedEvents.forEach((event, index) => {
    const indexed = operations[index];
    const checkpointReceipt = objectValue(event.receipt, `recovered Rotini checkpoint confirmed receipt ${index}`);
    exactValue(event.operationHash, indexed.operationHash, `recovered Rotini checkpoint operation ${index} hash`);
    exactValue(checkpointReceipt.operationHash, indexed.operationHash, `recovered Rotini checkpoint receipt ${index} hash`);
    exactValue(checkpointReceipt.action, indexed.action, `recovered Rotini checkpoint operation ${index} action`);
    exactValue(checkpointReceipt.chainId, indexed.chainId, `recovered Rotini checkpoint operation ${index} chain id`);
    exactValue(checkpointReceipt.signerAddress, indexed.signerAddress, `recovered Rotini checkpoint operation ${index} signer`);
    exactValue(checkpointReceipt.contractAddress, indexed.contractAddress, `recovered Rotini checkpoint operation ${index} contract`);
    exactValue(
      JSON.stringify(checkpointReceipt.entrypoints || []),
      JSON.stringify(indexed.entrypoints || []),
      `recovered Rotini checkpoint operation ${index} entrypoints`,
    );
  });
  for (const [index, [id, _kind, _artifactPath, actor, fileName, mimeType]] of RECOVERED_ROTINI_CONTENT.entries()) {
    const sequence = index + 1;
    const prefix = String(sequence).padStart(6, "0");
    const bytesInventory = strictCheckpointEvidence.artifacts.filter((artifact) => artifact.path === `pins/${prefix}.bin`);
    const proofInventory = strictCheckpointEvidence.artifacts.filter((artifact) => artifact.path === `pins/${prefix}.proof.json`);
    requireValue(bytesInventory.length === 1 && proofInventory.length === 1, `recovered Rotini checkpoint pin ${sequence} inventory mismatch`);
    const [checkpointBytes, proofBytes] = await Promise.all([
      readRegularFile(path.join(checkpointRoot, bytesInventory[0].path), checkpointRoot, `recovered Rotini checkpoint pin ${sequence} bytes`),
      readRegularFile(path.join(checkpointRoot, proofInventory[0].path), checkpointRoot, `recovered Rotini checkpoint pin ${sequence} proof`),
    ]);
    const checkpointHash = hashBytes(checkpointBytes);
    exactValue(checkpointHash, bytesInventory[0].sha256, `recovered Rotini checkpoint pin ${sequence} byte inventory hash`);
    exactValue(hashBytes(proofBytes), proofInventory[0].sha256, `recovered Rotini checkpoint pin ${sequence} proof inventory hash`);
    const durableProof = parseJson(proofBytes, `recovered Rotini checkpoint pin ${sequence} proof`);
    exactValue(durableProof.schema, "pastaprotocol-rotini-ui-live-checkpoint-pin-proof@1", `recovered Rotini checkpoint pin ${sequence} schema`);
    exactValue(natValue(durableProof.pinSequence, `recovered Rotini checkpoint pin ${sequence} sequence`), sequence, `recovered Rotini checkpoint pin ${sequence} sequence`);
    exactValue(durableProof.actor, actor, `recovered Rotini checkpoint pin ${sequence} actor`);
    const source = objectValue(durableProof.source, `recovered Rotini checkpoint pin ${sequence} source`);
    exactValue(source.fileName, fileName, `recovered Rotini checkpoint pin ${sequence} file name`);
    exactValue(source.mimeType, mimeType, `recovered Rotini checkpoint pin ${sequence} MIME type`);
    const byteReference = objectValue(durableProof.bytes, `recovered Rotini checkpoint pin ${sequence} bytes reference`);
    exactValue(byteReference.path, `pins/${prefix}.bin`, `recovered Rotini checkpoint pin ${sequence} byte path`);
    exactValue(byteReference.sha256, checkpointHash, `recovered Rotini checkpoint pin ${sequence} byte hash`);
    exactValue(natValue(byteReference.byteLength, `recovered Rotini checkpoint pin ${sequence} byte length`), checkpointBytes.byteLength, `recovered Rotini checkpoint pin ${sequence} byte length`);
    const externalProof = objectValue(durableProof.proof, `recovered Rotini checkpoint pin ${sequence} external proof`);
    exactValue(externalProof.sha256, checkpointHash, `recovered Rotini checkpoint pin ${sequence} external hash`);
    exactValue(natValue(externalProof.byteLength, `recovered Rotini checkpoint pin ${sequence} external byte length`), checkpointBytes.byteLength, `recovered Rotini checkpoint pin ${sequence} external byte length`);
    exactValue(externalProof.fileName, fileName, `recovered Rotini checkpoint pin ${sequence} external file name`);
    exactValue(externalProof.mimeType, mimeType, `recovered Rotini checkpoint pin ${sequence} external MIME type`);
    exactValue(externalProof.publicGatewayVerified, true, `recovered Rotini checkpoint pin ${sequence} public verification`);
    const contentRecord = content[index];
    exactValue(contentRecord.id, id, `recovered Rotini checkpoint pin ${sequence} content id`);
    exactValue(contentRecord.actor, actor, `recovered Rotini checkpoint pin ${sequence} content actor`);
    exactValue(contentRecord.fileName, fileName, `recovered Rotini checkpoint pin ${sequence} content file name`);
    exactValue(contentRecord.sha256, checkpointHash, `recovered Rotini checkpoint pin ${sequence} content hash`);
    exactValue(contentRecord.retrievedSha256, checkpointHash, `recovered Rotini checkpoint pin ${sequence} retrieved hash`);
    exactValue(contentRecord.ipfsUri, externalProof.uri, `recovered Rotini checkpoint pin ${sequence} content URI`);
    const packagedArtifact = artifactById(input.artifacts, id, `recovered Rotini checkpoint pin ${sequence} packaged artifact`);
    exactValue(packagedArtifact.evidence.sha256, checkpointHash, `recovered Rotini checkpoint pin ${sequence} packaged hash`);
    requireValue(
      Buffer.from(packagedArtifact.bytes).equals(Buffer.from(checkpointBytes)),
      `recovered Rotini checkpoint pin ${sequence} packaged bytes differ from the immutable checkpoint`,
    );
  }

  const reconciliationReference = objectValue(input.receipt.chainReconciliation, "recovered Rotini chain reconciliation reference");
  const reconciliationArtifact = artifactById(input.artifacts, reconciliationReference.id, "recovered Rotini chain reconciliation");
  exactValue(reconciliationArtifact.evidence.kind, "chain-reconciliation-snapshot", "recovered Rotini reconciliation kind");
  exactValue(reconciliationReference.path, reconciliationArtifact.evidence.path, "recovered Rotini reconciliation path");
  exactValue(reconciliationReference.sha256, reconciliationArtifact.evidence.sha256, "recovered Rotini reconciliation hash");
  const reconciliation = parseJson(reconciliationArtifact.bytes, "recovered Rotini reconciliation snapshot");
  exactValue(reconciliation.schema, "pastaprotocol-rotini-chain-reconciliation@1", "recovered Rotini reconciliation schema");
  exactValue(reconciliation.classification, "UI-LIVE-READ-ONLY-FINALIZATION", "recovered Rotini reconciliation classification");
  exactValue(reconciliation.status, "RECOVERED", "recovered Rotini reconciliation status");
  exactValue(reconciliation.runId, input.runId, "recovered Rotini reconciliation run id");
  exactValue(objectValue(reconciliation.contract, "recovered Rotini reconciliation contract").address, input.contractAddress, "recovered Rotini reconciliation contract address");
  const originalFailure = objectValue(reconciliation.originalFailure, "recovered Rotini original failure disclosure");
  exactValue(
    originalFailure.classification,
    "TERMINAL_POST_WRITE_FAILURE_CAUSE_UNAVAILABLE",
    "recovered Rotini original failure classification",
  );
  exactValue(originalFailure.exactCauseAvailable, false, "recovered Rotini original failure exact-cause availability");
  exactValue(originalFailure.synthesized, false, "recovered Rotini original failure synthesis flag");
  exactValue(originalFailure.bridgeReceiptStreamAvailable, false, "recovered Rotini bridge receipt availability");
  exactValue(originalFailure.bridgeReceiptStreamSynthesized, false, "recovered Rotini bridge receipt synthesis flag");
  const reconciliationOperations = arrayValue(reconciliation.operations, "recovered Rotini reconciliation operations");
  requireValue(reconciliationOperations.length === 10, "recovered Rotini reconciliation must bind 10 operations");
  reconciliationOperations.forEach((operationValue, index) => {
    const operation = objectValue(operationValue, `recovered Rotini reconciliation operation ${index}`);
    exactValue(operation.operationHash, operations[index].operationHash, `recovered Rotini reconciliation operation ${index} hash`);
  });
}

function validateTokenArtifact(input: {
  app: "gnocchi" | "rotini";
  token: JsonObject;
  tokenId: number;
  contractAddress: string;
  artifacts: Map<string, LoadedArtifact>;
}): {
  metadataUri: string;
  artifactUri: string;
  metadataArtifact: FreshDependencyArtifactEvidence;
  mediaArtifact: FreshDependencyArtifactEvidence;
} {
  exactValue(natValue(input.token.tokenId, `${input.app} token id`), input.tokenId, `${input.app} token id`);
  exactValue(input.token.contractAddress, input.contractAddress, `${input.app} token ${input.tokenId} contract`);
  const metadataUri = requireIpfsUri(input.token.metadataUri, `${input.app} token ${input.tokenId} metadata URI`);
  const artifactUri = requireIpfsUri(input.token.artifactUri, `${input.app} token ${input.tokenId} artifact URI`);
  const metadataArtifact = artifactById(input.artifacts, input.token.metadataArtifactId, `${input.app} token ${input.tokenId} metadata`);
  const mediaArtifact = artifactById(input.artifacts, input.token.mediaArtifactId, `${input.app} token ${input.tokenId} media`);
  exactValue(metadataArtifact.evidence.kind, "token-metadata", `${input.app} token ${input.tokenId} metadata artifact kind`);
  exactValue(mediaArtifact.evidence.kind, "token-media", `${input.app} token ${input.tokenId} media artifact kind`);
  exactValue(metadataArtifact.evidence.ipfsUri, metadataUri, `${input.app} token ${input.tokenId} metadata artifact URI`);
  exactValue(mediaArtifact.evidence.ipfsUri, artifactUri, `${input.app} token ${input.tokenId} media artifact URI`);
  const metadata = parseJson(metadataArtifact.bytes, `${input.app} token ${input.tokenId} metadata artifact`);
  exactValue(metadata.artifactUri, artifactUri, `${input.app} token ${input.tokenId} metadata artifact binding`);
  return {
    metadataUri,
    artifactUri,
    metadataArtifact: metadataArtifact.evidence,
    mediaArtifact: mediaArtifact.evidence,
  };
}

async function validateGnocchi(evidence: LoadedAppEvidence, runId: string): Promise<{
  creator: string;
  contractAddress: string;
  scriptSha256: string;
  scriptCodeSha256: string;
  originationOperationHash: string;
  token2LimitedEdition: FreshGnocchiLimitedEditionEvidence;
  tokens: FreshRavioliDependencies["gnocchi"]["tokens"];
}> {
  const { manifest, receipt, artifacts } = evidence;
  validateManifestHeader(manifest, "gnocchi", runId);
  const recovered = receipt.schema === "pastaprotocol-gnocchi-ui-live-finalized@1";
  if (recovered) {
    recoveredGnocchiClassification(receipt, "gnocchi recovered receipt");
  } else {
    exactValue(receipt.schema, "pastaprotocol-gnocchi-ui-live-run@1", "gnocchi native receipt schema");
    exactValue(receipt.classification, "UI-LIVE", "gnocchi native receipt classification");
  }
  assertShadownet(receipt, "gnocchi receipt");
  const creator = requireImplicitAddress(objectValue(receipt.actors, "gnocchi receipt actors").creator, "gnocchi creator");
  const contractAddress = manifestContract(manifest, "open-edition-collection", "gnocchi");
  const scriptSha256 = await currentScriptIdentity(FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH, "gnocchi");
  receiptContract(receipt, contractAddress, scriptSha256, "gnocchi");
  validateContractCodeArtifact({ app: "gnocchi", artifacts, scriptSha256 });
  if (recovered) {
    await validateRecoveredGnocchiReceipt({
      receipt,
      manifest,
      artifacts,
      appRoot: path.dirname(evidence.manifestPath),
      runId,
      contractAddress,
      creator,
    });
  } else {
    assertReceiptPins(receipt, artifacts, "gnocchi");
  }
  const originationOperationHash = validateOrigination({
    app: "gnocchi",
    manifest,
    receipt,
    contractAddress,
    creator,
  });

  const manifestTokens = arrayValue(manifest.tokens, "gnocchi manifest tokens")
    .map((value, index) => objectValue(value, `gnocchi token ${index}`))
    .sort((left, right) => natValue(left.tokenId, "gnocchi token id") - natValue(right.tokenId, "gnocchi token id"));
  requireValue(manifestTokens.length === 3, "gnocchi manifest must expose exactly tokens 0, 1, and 2");
  const token0 = validateTokenArtifact({ app: "gnocchi", token: manifestTokens[0], tokenId: 0, contractAddress, artifacts });
  const token1 = validateTokenArtifact({ app: "gnocchi", token: manifestTokens[1], tokenId: 1, contractAddress, artifacts });
  const token2 = validateTokenArtifact({ app: "gnocchi", token: manifestTokens[2], tokenId: 2, contractAddress, artifacts });
  const indexed = objectValue(receipt.indexed, "gnocchi indexed evidence");
  const indexedUris = arrayValue(indexed.indexedTokenMetadataUris, "gnocchi indexed token metadata URIs");
  requireValue(indexedUris.length === 3, "gnocchi indexed evidence must expose exactly three token metadata URIs");
  [token0, token1, token2].forEach((token, tokenId) => {
    exactValue(indexedUris[tokenId], token.metadataUri, `gnocchi indexed token ${tokenId} metadata URI`);
  });
  const dependencyReceipt = validateGnocchiDependencyReceipt({
    receipt,
    contractAddress,
    creator,
    scriptSha256,
    token2MetadataUri: token2.metadataUri,
  });
  return {
    creator,
    contractAddress,
    scriptSha256,
    scriptCodeSha256: dependencyReceipt.scriptCodeSha256,
    originationOperationHash,
    token2LimitedEdition: dependencyReceipt.limitedEdition,
    tokens: [
      { tokenId: 0, ...token0 },
      { tokenId: 1, ...token1 },
      { tokenId: 2, ...token2 },
    ],
  };
}

async function validateRotini(evidence: LoadedAppEvidence, runId: string): Promise<{
  creator: string;
  contractAddress: string;
  scriptSha256: string;
  scriptCodeSha256: string;
  originationOperationHash: string;
  project0: FreshRotiniProjectZeroEvidence;
}> {
  const { manifest, receipt, artifacts } = evidence;
  validateManifestHeader(manifest, "rotini", runId);
  const recovered = receipt.schema === "pastaprotocol-rotini-ui-live-finalized@1";
  if (recovered) {
    exactValue(receipt.classification, "UI-LIVE-READ-ONLY-FINALIZATION", "rotini recovered receipt classification");
  } else {
    exactValue(receipt.schema, "pastaprotocol-rotini-ui-live-run@1", "rotini receipt schema");
    exactValue(receipt.classification, "UI-LIVE", "rotini receipt classification");
  }
  assertShadownet(receipt, "rotini receipt");
  const creator = requireImplicitAddress(objectValue(receipt.actors, "rotini receipt actors").creator, "rotini creator");
  const contractAddress = manifestContract(manifest, "generative-collection", "rotini");
  const scriptSha256 = await currentScriptIdentity(FRESH_ROTINI_CONTRACT_ARTIFACT_PATH, "rotini");
  receiptContract(receipt, contractAddress, scriptSha256, "rotini");
  validateContractCodeArtifact({ app: "rotini", artifacts, scriptSha256 });
  if (recovered) {
    await validateRecoveredRotiniReceipt({
      receipt,
      manifest,
      artifacts,
      appRoot: path.dirname(evidence.manifestPath),
      runId,
      contractAddress,
      creator,
    });
  } else {
    assertReceiptPins(receipt, artifacts, "rotini");
  }
  const originationOperationHash = validateOrigination({
    app: "rotini",
    manifest,
    receipt,
    contractAddress,
    creator,
  });
  const manifestTokens = arrayValue(manifest.tokens, "rotini manifest tokens")
    .map((value, index) => objectValue(value, `rotini token ${index}`))
    .sort((left, right) => natValue(left.tokenId, "rotini token id") - natValue(right.tokenId, "rotini token id"));
  requireValue(manifestTokens.length === 3, "rotini manifest must expose exactly finalized tokens 0, 1, and 2");
  manifestTokens.forEach((token, tokenId) => {
    validateTokenArtifact({ app: "rotini", token, tokenId, contractAddress, artifacts });
  });
  const receiptTokens = arrayValue(receipt.tokens, "rotini receipt tokens")
    .map((value, index) => objectValue(value, `rotini receipt token ${index}`))
    .sort((left, right) => natValue(left.tokenId, "rotini receipt token id") - natValue(right.tokenId, "rotini receipt token id"));
  requireValue(receiptTokens.length === 3, "rotini receipt must expose exactly finalized tokens 0, 1, and 2");
  receiptTokens.forEach((token, tokenId) => {
    exactValue(natValue(token.tokenId, "rotini receipt token id"), tokenId, `rotini receipt token ${tokenId} id`);
    exactValue(token.contractAddress, contractAddress, `rotini receipt token ${tokenId} contract`);
    exactValue(token.metadataUri, manifestTokens[tokenId].metadataUri, `rotini receipt token ${tokenId} metadata URI`);
    exactValue(token.artifactUri, manifestTokens[tokenId].artifactUri, `rotini receipt token ${tokenId} artifact URI`);
  });

  const projects = arrayValue(receipt.projects, "rotini receipt projects")
    .map((value, index) => objectValue(value, `rotini receipt project ${index}`))
    .sort((left, right) => natValue(left.projectId, "rotini project id") - natValue(right.projectId, "rotini project id"));
  requireValue(projects.length === 3, "rotini receipt must expose exactly projects 0, 1, and 2");
  projects.forEach((project, projectId) => {
    exactValue(natValue(project.projectId, "rotini project id"), projectId, `rotini project ${projectId} id`);
  });
  const project0 = projects[0];
  exactValue(project0.outputMode, "png", "rotini project 0 output mode");
  exactValue(project0.mimeType, "image/png", "rotini project 0 MIME type");
  exactValue(natValue(project0.priceMutez, "rotini project 0 price"), 0, "rotini project 0 price");
  exactValue(natValue(project0.maxSupply, "rotini project 0 max supply"), 4, "rotini project 0 max supply");
  exactValue(natValue(project0.minted, "rotini project 0 minted"), 1, "rotini project 0 minted");
  exactValue(natValue(project0.reserved, "rotini project 0 reserved"), 0, "rotini project 0 reserved");
  exactValue(natValue(project0.remainingReservable, "rotini project 0 remaining capacity"), 3, "rotini project 0 remaining capacity");
  exactValue(project0.ravioliPackCompatible, true, "rotini project 0 Ravioli compatibility flag");

  const tzktReference = objectValue(receipt.tzktEvidence, "rotini receipt TzKT evidence reference");
  const tzktPath = safeRelativePath(tzktReference.path, "rotini TzKT evidence path");
  const tzktHash = requireSha256(tzktReference.sha256, "rotini TzKT evidence hash");
  const tzktArtifactMatches = Array.from(artifacts.values()).filter((artifact) => artifact.evidence.path === tzktPath);
  requireValue(tzktArtifactMatches.length === 1, "rotini manifest must bind exactly one referenced TzKT evidence artifact");
  exactValue(tzktArtifactMatches[0].evidence.sha256, tzktHash, "rotini TzKT evidence artifact hash");
  const tzkt = parseJson(tzktArtifactMatches[0].bytes, "rotini TzKT evidence artifact");
  exactValue(tzkt.schema, "pastaprotocol-rotini-tzkt-index@1", "rotini TzKT evidence schema");
  exactValue(tzkt.contractAddress, contractAddress, "rotini TzKT evidence contract");
  const indexedStorage = objectValue(tzkt.storage, "rotini TzKT storage evidence");
  exactValue(natValue(indexedStorage.nextProjectId, "rotini indexed next project id"), 3, "rotini indexed next project id");
  exactValue(natValue(indexedStorage.nextTokenId, "rotini indexed next token id"), 3, "rotini indexed next token id");
  const indexedProjects = arrayValue(tzkt.projects, "rotini indexed projects").map((value, index) =>
    objectValue(value, `rotini indexed project ${index}`)
  );
  const indexedProjectZeroMatches = indexedProjects.filter((entry) => natValue(entry.key, "rotini indexed project key") === 0);
  requireValue(indexedProjectZeroMatches.length === 1, "rotini indexed evidence must expose exactly one project 0");
  const indexedProject0 = objectValue(indexedProjectZeroMatches[0].value, "rotini indexed project 0");
  exactValue(indexedProject0.active, true, "rotini indexed project 0 active flag");
  exactValue(natValue(indexedProject0.price, "rotini indexed project 0 price"), 0, "rotini indexed project 0 price");
  exactValue(natValue(indexedProject0.max_supply, "rotini indexed project 0 max supply"), 4, "rotini indexed project 0 max supply");
  exactValue(natValue(indexedProject0.minted, "rotini indexed project 0 minted"), 1, "rotini indexed project 0 minted");
  exactValue(natValue(indexedProject0.reserved, "rotini indexed project 0 reserved"), 0, "rotini indexed project 0 reserved");
  const compatibility = objectValue(tzkt.ravioliCompatibility, "rotini indexed Ravioli compatibility");
  exactValue(natValue(compatibility.projectId, "rotini compatible project id"), 0, "rotini compatible project id");
  exactValue(compatibility.outputMode, "png", "rotini compatible output mode");
  exactValue(natValue(compatibility.priceMutez, "rotini compatible price"), 0, "rotini compatible price");
  exactValue(natValue(compatibility.maxSupply, "rotini compatible max supply"), 4, "rotini compatible max supply");
  exactValue(natValue(compatibility.minted, "rotini compatible minted"), 1, "rotini compatible minted");
  exactValue(natValue(compatibility.reserved, "rotini compatible reserved"), 0, "rotini compatible reserved");
  exactValue(natValue(compatibility.remainingReservable, "rotini compatible remaining capacity"), 3, "rotini compatible remaining capacity");
  const scriptCodeSha256 = validateRotiniDependencyReceipt({
    receipt,
    contractAddress,
    creator,
    scriptSha256,
  });

  return {
    creator,
    contractAddress,
    scriptSha256,
    scriptCodeSha256,
    originationOperationHash,
    project0: {
      projectId: 0,
      active: true,
      outputMode: "png",
      mimeType: "image/png",
      priceMutez: 0,
      maxSupply: 4,
      minted: 1,
      reserved: 0,
      remainingReservable: 3,
    },
  };
}

export async function loadFreshRavioliDependencies(input: {
  runRoot: string;
  expectedRunId: string;
  expectedCreator?: string;
}): Promise<FreshRavioliDependencies> {
  requireValue(SAFE_RUN_ID.test(input.expectedRunId), "expected fresh proof run id is unsafe or empty");
  const requestedRoot = path.resolve(input.runRoot);
  const rootDetails = await lstat(requestedRoot).catch(() => undefined);
  requireValue(rootDetails?.isDirectory() && !rootDetails.isSymbolicLink(), `fresh proof run root is missing or not a regular directory: ${requestedRoot}`);
  const runRoot = await realpath(requestedRoot);
  exactValue(path.basename(runRoot), input.expectedRunId, "fresh proof run root basename");

  const [gnocchiReceiptPath, rotiniReceiptPath] = await Promise.all([
    resolveGnocchiReceiptPath(runRoot),
    resolveRotiniReceiptPath(runRoot),
  ]);
  const [gnocchiEvidence, rotiniEvidence] = await Promise.all([
    loadAppEvidence({ runRoot, app: "gnocchi", receiptPath: gnocchiReceiptPath }),
    loadAppEvidence({ runRoot, app: "rotini", receiptPath: rotiniReceiptPath }),
  ]);
  const [gnocchi, rotini] = await Promise.all([
    validateGnocchi(gnocchiEvidence, input.expectedRunId),
    validateRotini(rotiniEvidence, input.expectedRunId),
  ]);
  exactValue(rotini.creator, gnocchi.creator, "fresh Gnocchi/Rotini creator identity");
  requireValue(gnocchi.contractAddress !== rotini.contractAddress, "fresh Gnocchi and Rotini contracts must be distinct");
  if (input.expectedCreator !== undefined) {
    const expectedCreator = requireImplicitAddress(input.expectedCreator, "expected fresh dependency creator");
    exactValue(gnocchi.creator, expectedCreator, "fresh dependency creator identity");
  }

  return {
    schema: FRESH_RAVIOLI_DEPENDENCY_SCHEMA,
    runRoot,
    runId: input.expectedRunId,
    network: { name: FRESH_RAVIOLI_NETWORK, chainId: FRESH_RAVIOLI_CHAIN_ID },
    creator: gnocchi.creator,
    gnocchi: {
      contractAddress: gnocchi.contractAddress,
      scriptSha256: gnocchi.scriptSha256,
      scriptCodeSha256: gnocchi.scriptCodeSha256,
      scriptArtifactPath: FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH,
      originationOperationHash: gnocchi.originationOperationHash,
      manifestPath: gnocchiEvidence.manifestPath,
      manifestSha256: gnocchiEvidence.manifestSha256,
      receiptPath: gnocchiEvidence.receiptPath,
      receiptSha256: gnocchiEvidence.receiptSha256,
      token2LimitedEdition: gnocchi.token2LimitedEdition,
      tokens: gnocchi.tokens,
    },
    rotini: {
      contractAddress: rotini.contractAddress,
      scriptSha256: rotini.scriptSha256,
      scriptCodeSha256: rotini.scriptCodeSha256,
      scriptArtifactPath: FRESH_ROTINI_CONTRACT_ARTIFACT_PATH,
      originationOperationHash: rotini.originationOperationHash,
      manifestPath: rotiniEvidence.manifestPath,
      manifestSha256: rotiniEvidence.manifestSha256,
      receiptPath: rotiniEvidence.receiptPath,
      receiptSha256: rotiniEvidence.receiptSha256,
      nextTokenId: 3,
      project0: rotini.project0,
    },
  };
}

function exactRecordKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  requireValue(
    actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]),
    `${label} must expose exactly keys ${sortedExpected.join(", ")}; received ${actual.join(", ")}`,
  );
}

function emptyEvidence(value: unknown, label: string): void {
  const entries = arrayValue(value, label);
  requireValue(entries.length === 0, `${label} must be empty before Ravioli reserves or authorizes anything`);
}

type GnocchiOperatorExpectation =
  | Readonly<{ kind: "fresh" }>
  | Readonly<{
      kind: "mode0-replay" | "current-v2";
      routerAddress: string;
      appliedLevel: number;
    }>
  | Readonly<{
      kind: "current-v3" | "current-op14" | "current-op20" | "current-v5" | "current-v6";
      routerAddress: string;
      mode0AppliedLevel: number;
      mode1AppliedLevel: number;
      gnocchiAdapterAddress?: string;
      minterAppliedLevel?: number;
      reservedMintAppliedLevel?: number;
    }>
  | Readonly<{
      kind: "current-op55";
      routerAddress: string;
      gnocchiAdapterAddress: string;
      mode0AppliedLevel: number;
      mode1AppliedLevel: number;
      minterAppliedLevel: number;
      minterSecondAppliedLevel: number;
      mode1SecondAppliedLevel: number;
    }>
  | Readonly<{
      kind: "current-op63";
      routerAddress: string;
      gnocchiAdapterAddress: string;
      mode0AppliedLevel: number;
      mode1AppliedLevel: number;
      minterAppliedLevel: number;
      minterSecondAppliedLevel: number;
      mode1SecondAppliedLevel: number;
      minterThirdAppliedLevel: number;
      reservedMintFirstAppliedLevel: number;
      reservedMintAppliedLevel: number;
      adapterRecoveryAppliedLevel?: number;
    }>;

const FRESH_GNOCCHI_OPERATOR_EXPECTATION: GnocchiOperatorExpectation = Object.freeze({ kind: "fresh" });

function validateExactMode0RecoveryOperator(
  evidence: FreshRavioliDependencies,
  value: unknown,
  expectation: Exclude<GnocchiOperatorExpectation, { kind: "fresh" }>,
): void {
  const entries = arrayValue(value, "live Gnocchi active operators");
  requireValue(
    entries.length === 1,
    `live Gnocchi active operators must contain exactly one journal-bound mode-0 operator; received ${entries.length}`,
  );
  const row = objectValue(entries[0], "live Gnocchi recovery operator row");
  exactValue(row.active, true, "live Gnocchi recovery operator active marker");
  const key = objectValue(row.key, "live Gnocchi recovery operator key");
  exactRecordKeys(key, ["owner", "operator", "token_id"], "live Gnocchi recovery operator key");
  exactValue(key.owner, evidence.creator, "live Gnocchi recovery operator owner");
  exactValue(key.operator, expectation.routerAddress, "live Gnocchi recovery operator contract");
  exactValue(
    natValue(key.token_id, "live Gnocchi recovery operator token id"),
    0,
    "live Gnocchi recovery operator token id",
  );
  const unitValue = objectValue(row.value, "live Gnocchi recovery operator unit value");
  exactRecordKeys(unitValue, [], "live Gnocchi recovery operator unit value");
  exactValue(
    natValue(row.firstLevel, "live Gnocchi recovery operator first applied level"),
    expectation.appliedLevel,
    "live Gnocchi recovery operator first applied level",
  );
  exactValue(
    natValue(row.lastLevel, "live Gnocchi recovery operator last applied level"),
    expectation.appliedLevel,
    "live Gnocchi recovery operator last applied level",
  );
  exactValue(
    natValue(row.updates, "live Gnocchi recovery operator update count"),
    1,
    "live Gnocchi recovery operator update count",
  );
}

function validateCurrentV3RecoveryOperators(
  evidence: FreshRavioliDependencies,
  value: unknown,
  expectation: Extract<GnocchiOperatorExpectation, { kind: "current-v3" | "current-op14" | "current-op20" | "current-v5" | "current-v6" }>,
): void {
  const entries = arrayValue(value, "live Gnocchi active operators");
  requireValue(
    entries.length === 2,
    `live Gnocchi active operators must contain exactly two journal-bound current-v3 operators; received ${entries.length}`,
  );
  const seenTokenIds = new Set<number>();
  const rows = new Map(entries.map((entry, index) => {
    const row = objectValue(entry, `live Gnocchi current-v3 operator row ${index}`);
    exactValue(row.active, true, `live Gnocchi current-v3 operator row ${index} active marker`);
    const key = objectValue(row.key, `live Gnocchi current-v3 operator row ${index} key`);
    exactRecordKeys(key, ["owner", "operator", "token_id"], `live Gnocchi current-v3 operator row ${index} key`);
    exactValue(key.owner, evidence.creator, `live Gnocchi current-v3 operator row ${index} owner`);
    exactValue(key.operator, expectation.routerAddress, `live Gnocchi current-v3 operator row ${index} contract`);
    const tokenId = natValue(key.token_id, `live Gnocchi current-v3 operator row ${index} token id`);
    requireValue(tokenId === 0 || tokenId === 1, `live Gnocchi current-v3 operator token id must be 0 or 1; received ${tokenId}`);
    requireValue(!seenTokenIds.has(tokenId), `live Gnocchi current-v3 operator token ${tokenId} is duplicated`);
    seenTokenIds.add(tokenId);
    const unitValue = objectValue(row.value, `live Gnocchi current-v3 operator row ${index} unit value`);
    exactRecordKeys(unitValue, [], `live Gnocchi current-v3 operator row ${index} unit value`);
    return [tokenId, row] as const;
  }));
  for (const tokenId of [0, 1] as const) {
    const row = rows.get(tokenId);
    requireValue(row, `live Gnocchi current-v3 operator token ${tokenId} is missing`);
    const expectedFirstLevel = tokenId === 0 ? expectation.mode0AppliedLevel : expectation.mode1AppliedLevel;
    const expectedUpdates = tokenId === 0 ? 2 : 1;
    exactValue(
      natValue(row.firstLevel, `live Gnocchi current-v3 operator token ${tokenId} first level`),
      expectedFirstLevel,
      `live Gnocchi current-v3 operator token ${tokenId} first level`,
    );
    exactValue(
      natValue(row.lastLevel, `live Gnocchi current-v3 operator token ${tokenId} last level`),
      expectation.mode1AppliedLevel,
      `live Gnocchi current-v3 operator token ${tokenId} last level`,
    );
    exactValue(
      natValue(row.updates, `live Gnocchi current-v3 operator token ${tokenId} update count`),
      expectedUpdates,
      `live Gnocchi current-v3 operator token ${tokenId} update count`,
    );
  }
}

function validateCurrentTerminalRecoveryOperators(
  evidence: FreshRavioliDependencies,
  value: unknown,
  expectation: Extract<GnocchiOperatorExpectation, { kind: "current-op55" | "current-op63" }>,
): void {
  const boundary = expectation.kind === "current-op63" ? "operation-63" : "operation-55";
  const entries = arrayValue(value, "live Gnocchi active operators");
  requireValue(
    entries.length === 2,
    `live Gnocchi ${boundary} active operators must contain exactly the two journal-bound pool operators; received ${entries.length}`,
  );
  const seenTokenIds = new Set<number>();
  const rows = new Map(entries.map((entry, index) => {
    const row = objectValue(entry, `live Gnocchi ${boundary} operator row ${index}`);
    exactValue(row.active, true, `live Gnocchi ${boundary} operator row ${index} active marker`);
    const key = objectValue(row.key, `live Gnocchi ${boundary} operator row ${index} key`);
    exactRecordKeys(key, ["owner", "operator", "token_id"], `live Gnocchi ${boundary} operator row ${index} key`);
    exactValue(key.owner, evidence.creator, `live Gnocchi ${boundary} operator row ${index} owner`);
    exactValue(key.operator, expectation.routerAddress, `live Gnocchi ${boundary} operator row ${index} contract`);
    const tokenId = natValue(key.token_id, `live Gnocchi ${boundary} operator row ${index} token id`);
    requireValue(tokenId === 0 || tokenId === 1, `live Gnocchi ${boundary} operator token id must be 0 or 1; received ${tokenId}`);
    requireValue(!seenTokenIds.has(tokenId), `live Gnocchi ${boundary} operator token ${tokenId} is duplicated`);
    seenTokenIds.add(tokenId);
    exactRecordKeys(
      objectValue(row.value, `live Gnocchi ${boundary} operator row ${index} unit value`),
      [],
      `live Gnocchi ${boundary} operator row ${index} unit value`,
    );
    return [tokenId, row] as const;
  }));

  const token0 = rows.get(0);
  requireValue(token0, `live Gnocchi ${boundary} operator token 0 is missing`);
  exactValue(
    natValue(token0.firstLevel, `live Gnocchi ${boundary} operator token 0 first level`),
    expectation.mode0AppliedLevel,
    `live Gnocchi ${boundary} operator token 0 first level`,
  );
  exactValue(
    natValue(token0.lastLevel, `live Gnocchi ${boundary} operator token 0 last level`),
    expectation.mode1AppliedLevel,
    `live Gnocchi ${boundary} operator token 0 last level`,
  );
  exactValue(
    natValue(token0.updates, `live Gnocchi ${boundary} operator token 0 updates`),
    2,
    `live Gnocchi ${boundary} operator token 0 updates`,
  );

  const token1 = rows.get(1);
  requireValue(token1, `live Gnocchi ${boundary} operator token 1 is missing`);
  exactValue(
    natValue(token1.firstLevel, `live Gnocchi ${boundary} operator token 1 first level`),
    expectation.mode1AppliedLevel,
    `live Gnocchi ${boundary} operator token 1 first level`,
  );
  exactValue(
    natValue(token1.lastLevel, `live Gnocchi ${boundary} operator token 1 last level`),
    expectation.mode1SecondAppliedLevel,
    `live Gnocchi ${boundary} operator token 1 last level`,
  );
  exactValue(
    natValue(token1.updates, `live Gnocchi ${boundary} operator token 1 updates`),
    2,
    `live Gnocchi ${boundary} operator token 1 updates`,
  );
}

function validateCurrentMinter(
  snapshot: FreshGnocchiLiveSnapshot,
  expectation: Extract<GnocchiOperatorExpectation, { kind: "current-op20" | "current-v6" }>,
): void {
  const adapter = requireContractAddress(
    expectation.gnocchiAdapterAddress,
    "Ravioli current Gnocchi adapter",
  );
  const minterLevel = natValue(
    expectation.minterAppliedLevel,
    "Ravioli current minter applied level",
  );
  requireValue(minterLevel > expectation.mode1AppliedLevel, "Ravioli current minter must follow funded-pool authorization");

  const minters = arrayValue(snapshot.authorizedMinters, "live Gnocchi authorized minters");
  requireValue(minters.length === 1, "live Gnocchi authorized minters must contain only the journal-bound adapter");
  const minter = objectValue(minters[0], "live Gnocchi current minter");
  exactValue(minter.active, true, "live Gnocchi current minter active marker");
  exactValue(minter.key, adapter, "live Gnocchi current minter key");
  exactRecordKeys(objectValue(minter.value, "live Gnocchi current minter value"), [], "live Gnocchi current minter value");
  exactValue(natValue(minter.firstLevel, "live Gnocchi current minter first level"), minterLevel, "live Gnocchi current minter first level");
  exactValue(natValue(minter.lastLevel, "live Gnocchi current minter last level"), minterLevel, "live Gnocchi current minter last level");
  exactValue(natValue(minter.updates, "live Gnocchi current minter updates"), 1, "live Gnocchi current minter updates");
}

function validateCurrentOp55Minter(
  snapshot: FreshGnocchiLiveSnapshot,
  expectation: Extract<GnocchiOperatorExpectation, { kind: "current-op55" }>,
): void {
  const minters = arrayValue(snapshot.authorizedMinters, "live Gnocchi authorized minters");
  requireValue(
    minters.length === 1,
    "live Gnocchi operation-55 authorized minters must contain only the journal-bound adapter",
  );
  const minter = objectValue(minters[0], "live Gnocchi operation-55 minter");
  exactValue(minter.active, true, "live Gnocchi operation-55 minter active marker");
  exactValue(minter.key, expectation.gnocchiAdapterAddress, "live Gnocchi operation-55 minter key");
  exactRecordKeys(
    objectValue(minter.value, "live Gnocchi operation-55 minter value"),
    [],
    "live Gnocchi operation-55 minter value",
  );
  exactValue(
    natValue(minter.firstLevel, "live Gnocchi operation-55 minter first level"),
    expectation.minterAppliedLevel,
    "live Gnocchi operation-55 minter first level",
  );
  exactValue(
    natValue(minter.lastLevel, "live Gnocchi operation-55 minter last level"),
    expectation.minterSecondAppliedLevel,
    "live Gnocchi operation-55 minter last level",
  );
  exactValue(
    natValue(minter.updates, "live Gnocchi operation-55 minter updates"),
    2,
    "live Gnocchi operation-55 minter updates",
  );
}

function validateCurrentOp63MinterAndReservation(
  snapshot: FreshGnocchiLiveSnapshot,
  expectation: Extract<GnocchiOperatorExpectation, { kind: "current-op63" }>,
): void {
  const minters = arrayValue(snapshot.authorizedMinters, "live Gnocchi authorized minters");
  requireValue(
    minters.length === 1,
    "live Gnocchi operation-63 authorized minters must contain only the journal-bound adapter",
  );
  const minter = objectValue(minters[0], "live Gnocchi operation-63 minter");
  exactValue(minter.active, true, "live Gnocchi operation-63 minter active marker");
  exactValue(minter.key, expectation.gnocchiAdapterAddress, "live Gnocchi operation-63 minter key");
  exactRecordKeys(
    objectValue(minter.value, "live Gnocchi operation-63 minter value"),
    [],
    "live Gnocchi operation-63 minter value",
  );
  exactValue(
    natValue(minter.firstLevel, "live Gnocchi operation-63 minter first level"),
    expectation.minterAppliedLevel,
    "live Gnocchi operation-63 minter first level",
  );
  exactValue(
    natValue(minter.lastLevel, "live Gnocchi operation-63 minter last level"),
    expectation.minterThirdAppliedLevel,
    "live Gnocchi operation-63 minter last level",
  );
  exactValue(
    natValue(minter.updates, "live Gnocchi operation-63 minter updates"),
    3,
    "live Gnocchi operation-63 minter updates",
  );

  const reservations = arrayValue(snapshot.reservedMints, "live Gnocchi reserved mints");
  if (expectation.adapterRecoveryAppliedLevel !== undefined) {
    requireValue(
      reservations.length === 0,
      "live Gnocchi operation-67 reserved mints must be empty after child-capacity recovery",
    );
    return;
  }
  requireValue(
    reservations.length === 1,
    "live Gnocchi operation-63 reserved mints must contain only the journal-bound token-1 allocation",
  );
  const reservation = objectValue(reservations[0], "live Gnocchi operation-63 reservation");
  exactValue(reservation.active, true, "live Gnocchi operation-63 reservation active marker");
  const key = objectValue(reservation.key, "live Gnocchi operation-63 reservation key");
  exactRecordKeys(key, ["owner", "token_id"], "live Gnocchi operation-63 reservation key");
  exactValue(key.owner, expectation.gnocchiAdapterAddress, "live Gnocchi operation-63 reservation owner");
  exactValue(
    natValue(key.token_id, "live Gnocchi operation-63 reservation token"),
    1,
    "live Gnocchi operation-63 reservation token",
  );
  exactValue(
    natValue(reservation.value, "live Gnocchi operation-63 reservation amount"),
    2,
    "live Gnocchi operation-63 reservation amount",
  );
  exactValue(
    natValue(reservation.firstLevel, "live Gnocchi operation-63 reservation first level"),
    expectation.reservedMintFirstAppliedLevel,
    "live Gnocchi operation-63 reservation first level",
  );
  exactValue(
    natValue(reservation.lastLevel, "live Gnocchi operation-63 reservation last level"),
    expectation.reservedMintAppliedLevel,
    "live Gnocchi operation-63 reservation last level",
  );
  exactValue(
    natValue(reservation.updates, "live Gnocchi operation-63 reservation updates"),
    4,
    "live Gnocchi operation-63 reservation updates",
  );
}

function validateCurrentV6MinterAndReservation(
  snapshot: FreshGnocchiLiveSnapshot,
  expectation: Extract<GnocchiOperatorExpectation, { kind: "current-v6" }>,
): void {
  validateCurrentMinter(snapshot, expectation);
  const adapter = requireContractAddress(
    expectation.gnocchiAdapterAddress,
    "Ravioli current-v6 Gnocchi adapter",
  );
  const reservationLevel = natValue(
    expectation.reservedMintAppliedLevel,
    "Ravioli current-v6 reservation applied level",
  );
  requireValue(reservationLevel > expectation.minterAppliedLevel!, "Ravioli current-v6 reservation must follow minter authorization");

  const reservations = arrayValue(snapshot.reservedMints, "live Gnocchi reserved mints");
  requireValue(reservations.length === 1, "live Gnocchi reserved mints must contain only the journal-bound LE reservation");
  const reservation = objectValue(reservations[0], "live Gnocchi current-v6 reservation");
  exactValue(reservation.active, true, "live Gnocchi current-v6 reservation active marker");
  const key = objectValue(reservation.key, "live Gnocchi current-v6 reservation key");
  exactRecordKeys(key, ["owner", "token_id"], "live Gnocchi current-v6 reservation key");
  exactValue(key.owner, adapter, "live Gnocchi current-v6 reservation owner");
  exactValue(natValue(key.token_id, "live Gnocchi current-v6 reservation token"), 2, "live Gnocchi current-v6 reservation token");
  exactValue(natValue(reservation.value, "live Gnocchi current-v6 reservation amount"), 1, "live Gnocchi current-v6 reservation amount");
  exactValue(natValue(reservation.firstLevel, "live Gnocchi current-v6 reservation first level"), reservationLevel, "live Gnocchi current-v6 reservation first level");
  exactValue(natValue(reservation.lastLevel, "live Gnocchi current-v6 reservation last level"), reservationLevel, "live Gnocchi current-v6 reservation last level");
  exactValue(natValue(reservation.updates, "live Gnocchi current-v6 reservation updates"), 1, "live Gnocchi current-v6 reservation updates");
}

function validateGnocchiLive(
  evidence: FreshRavioliDependencies,
  snapshot: FreshGnocchiLiveSnapshot,
  nowMs: number,
  operatorExpectation: GnocchiOperatorExpectation,
): void {
  exactValue(snapshot.chainId, FRESH_RAVIOLI_CHAIN_ID, "live Gnocchi chain id");
  exactValue(snapshot.contractAddress, evidence.gnocchi.contractAddress, "live Gnocchi contract identity");
  exactValue(snapshot.scriptSha256, evidence.gnocchi.scriptSha256, "live Gnocchi script identity");
  exactValue(snapshot.scriptCodeSha256, evidence.gnocchi.scriptCodeSha256, "live Gnocchi Michelson code identity");
  exactValue(snapshot.administrator, evidence.creator, "live Gnocchi administrator");
  exactValue(natValue(snapshot.nextTokenId, "live Gnocchi next token id"), 3, "live Gnocchi next token id");
  const metadataUris = objectValue(snapshot.tokenMetadataUris, "live Gnocchi token metadata URIs");
  exactRecordKeys(metadataUris, ["0", "1", "2"], "live Gnocchi token metadata URIs");
  evidence.gnocchi.tokens.forEach((token) => {
    exactValue(metadataUris[String(token.tokenId)], token.metadataUri, `live Gnocchi token ${token.tokenId} metadata URI`);
  });
  const balances = objectValue(snapshot.creatorEscrowBalances, "live Gnocchi creator escrow balances");
  exactRecordKeys(balances, ["0", "1"], "live Gnocchi creator escrow balances");
  exactValue(
    natValue(balances["0"], "live Gnocchi token 0 escrow balance"),
    operatorExpectation.kind === "current-op14" || operatorExpectation.kind === "current-op20" || operatorExpectation.kind === "current-v5" || operatorExpectation.kind === "current-v6" || operatorExpectation.kind === "current-op55" || operatorExpectation.kind === "current-op63"
      ? 0
      : operatorExpectation.kind === "current-v2" || operatorExpectation.kind === "current-v3"
        ? 1
        : 2,
    "live Gnocchi token 0 escrow balance",
  );
  exactValue(
    natValue(balances["1"], "live Gnocchi token 1 escrow balance"),
    operatorExpectation.kind === "current-v5" || operatorExpectation.kind === "current-op55" || operatorExpectation.kind === "current-op63"
      ? 0
      : operatorExpectation.kind === "current-op14" || operatorExpectation.kind === "current-op20" || operatorExpectation.kind === "current-v6"
        ? 1
        : 2,
    "live Gnocchi token 1 escrow balance",
  );
  if (
    operatorExpectation.kind === "current-v2"
    || operatorExpectation.kind === "current-v3"
    || operatorExpectation.kind === "current-op14"
    || operatorExpectation.kind === "current-op20"
    || operatorExpectation.kind === "current-v5"
    || operatorExpectation.kind === "current-v6"
    || operatorExpectation.kind === "current-op55"
    || operatorExpectation.kind === "current-op63"
  ) {
    const routerBalances = objectValue(
      snapshot.recoveryRouterEscrowBalances,
      "live Gnocchi recovery router escrow balances",
    );
    exactRecordKeys(
      routerBalances,
      operatorExpectation.kind === "current-v3"
        || operatorExpectation.kind === "current-op14"
        || operatorExpectation.kind === "current-op20"
        || operatorExpectation.kind === "current-v5"
        || operatorExpectation.kind === "current-v6"
        || operatorExpectation.kind === "current-op55"
        || operatorExpectation.kind === "current-op63"
        ? ["0", "1"]
        : ["0"],
      "live Gnocchi recovery router escrow balances",
    );
    exactValue(
      natValue(routerBalances["0"], "live Gnocchi recovery router token 0 escrow balance"),
      operatorExpectation.kind === "current-op55" || operatorExpectation.kind === "current-op63"
        ? 0
        : operatorExpectation.kind === "current-op14" || operatorExpectation.kind === "current-op20" || operatorExpectation.kind === "current-v5" || operatorExpectation.kind === "current-v6"
          ? 2
        : 1,
      "live Gnocchi recovery router token 0 escrow balance",
    );
    if (
      operatorExpectation.kind === "current-v3"
      || operatorExpectation.kind === "current-op14"
      || operatorExpectation.kind === "current-op20"
      || operatorExpectation.kind === "current-v5"
      || operatorExpectation.kind === "current-v6"
      || operatorExpectation.kind === "current-op55"
      || operatorExpectation.kind === "current-op63"
    ) {
      exactValue(
        natValue(routerBalances["1"], "live Gnocchi recovery router token 1 escrow balance"),
        operatorExpectation.kind === "current-op55" || operatorExpectation.kind === "current-op63"
          ? 0
          : operatorExpectation.kind === "current-v3"
          ? 0
          : operatorExpectation.kind === "current-op14" || operatorExpectation.kind === "current-op20" || operatorExpectation.kind === "current-v6"
            ? 1
          : operatorExpectation.kind === "current-v5"
            ? 2
            : 1,
        "live Gnocchi recovery router token 1 escrow balance",
      );
    }
  }
  exactValue(snapshot.token2.active, true, "live Gnocchi token 2 active flag");
  exactValue(snapshot.token2.policyLocked, true, "live Gnocchi token 2 policy lock");
  exactValue(snapshot.token2.maxSupply, 4, "live Gnocchi token 2 max supply");
  exactValue(
    natValue(snapshot.token2.totalMinted, "live Gnocchi token 2 total minted"),
    operatorExpectation.kind === "current-op55" || operatorExpectation.kind === "current-op63" ? 4 : 3,
    "live Gnocchi token 2 total minted",
  );
  exactValue(
    natValue(snapshot.token2.totalReserved, "live Gnocchi token 2 total reserved"),
    operatorExpectation.kind === "current-v6" ? 1 : 0,
    "live Gnocchi token 2 total reserved",
  );
  const startMs = Date.parse(snapshot.token2.start);
  const endMs = Date.parse(snapshot.token2.end);
  requireValue(Number.isFinite(startMs), "live Gnocchi token 2 start must be a valid timestamp");
  requireValue(Number.isFinite(endMs), "live Gnocchi token 2 end must be a valid timestamp");
  exactValue(startMs, Date.parse(evidence.gnocchi.token2LimitedEdition.start), "live Gnocchi token 2 committed start");
  exactValue(endMs, Date.parse(evidence.gnocchi.token2LimitedEdition.end), "live Gnocchi token 2 committed end");
  requireValue(startMs <= nowMs, "live Gnocchi token 2 sale has not started");
  requireValue(endMs > nowMs, "live Gnocchi token 2 sale is expired or has no remaining Ravioli window");
  requireValue(startMs < endMs, "live Gnocchi token 2 sale window is invalid");
  if (operatorExpectation.kind === "fresh") {
    emptyEvidence(snapshot.activeOperators, "live Gnocchi active operators");
  } else if (operatorExpectation.kind === "current-op55" || operatorExpectation.kind === "current-op63") {
    validateCurrentTerminalRecoveryOperators(evidence, snapshot.activeOperators, operatorExpectation);
  } else if (
    operatorExpectation.kind === "current-v3"
    || operatorExpectation.kind === "current-op14"
    || operatorExpectation.kind === "current-op20"
    || operatorExpectation.kind === "current-v5"
    || operatorExpectation.kind === "current-v6"
  ) {
    validateCurrentV3RecoveryOperators(evidence, snapshot.activeOperators, operatorExpectation);
  } else {
    validateExactMode0RecoveryOperator(evidence, snapshot.activeOperators, operatorExpectation);
  }
  if (operatorExpectation.kind === "current-op63") {
    validateCurrentOp63MinterAndReservation(snapshot, operatorExpectation);
  } else if (operatorExpectation.kind === "current-op55") {
    validateCurrentOp55Minter(snapshot, operatorExpectation);
    emptyEvidence(snapshot.reservedMints, "live Gnocchi reserved mints");
  } else if (operatorExpectation.kind === "current-v6") {
    validateCurrentV6MinterAndReservation(snapshot, operatorExpectation);
  } else if (operatorExpectation.kind === "current-op20") {
    validateCurrentMinter(snapshot, operatorExpectation);
    emptyEvidence(snapshot.reservedMints, "live Gnocchi reserved mints");
  } else {
    emptyEvidence(snapshot.authorizedMinters, "live Gnocchi authorized minters");
    emptyEvidence(snapshot.reservedMints, "live Gnocchi reserved mints");
  }
}

function validateCurrentRotiniReservation(
  snapshot: FreshRotiniLiveSnapshot,
  expectation: NonNullable<RavioliCurrentV6ResumeRecovery["rotiniReservation"]>,
): void {
  const adapter = requireContractAddress(
    expectation.adapterAddress,
    "Ravioli current Rotini adapter",
  );
  const packMinterLevel = natValue(
    expectation.packMinterAppliedLevel,
    "Ravioli current Rotini pack-minter applied level",
  );
  const reservationLevel = natValue(
    expectation.reservationAppliedLevel,
    "Ravioli current Rotini reservation applied level",
  );
  requireValue(
    reservationLevel > packMinterLevel,
    "Ravioli current Rotini reservation must follow pack-minter authorization",
  );

  const packMinters = arrayValue(
    snapshot.authorizedPackMinters,
    "live Rotini authorized pack minters",
  );
  requireValue(
    packMinters.length === 1,
    "live Rotini authorized pack minters must contain only the journal-bound adapter",
  );
  const packMinter = objectValue(packMinters[0], "live Rotini current pack minter");
  exactValue(packMinter.active, true, "live Rotini current pack minter active marker");
  exactValue(packMinter.key, adapter, "live Rotini current pack minter key");
  exactRecordKeys(
    objectValue(packMinter.value, "live Rotini current pack minter value"),
    [],
    "live Rotini current pack minter value",
  );
  exactValue(
    natValue(packMinter.firstLevel, "live Rotini current pack minter first level"),
    packMinterLevel,
    "live Rotini current pack minter first level",
  );
  exactValue(
    natValue(packMinter.lastLevel, "live Rotini current pack minter last level"),
    packMinterLevel,
    "live Rotini current pack minter last level",
  );
  exactValue(
    natValue(packMinter.updates, "live Rotini current pack minter updates"),
    1,
    "live Rotini current pack minter updates",
  );

  emptyEvidence(snapshot.openReservations, "live Rotini open reservations");
  const reservations = arrayValue(snapshot.packReservations, "live Rotini pack reservations");
  requireValue(
    reservations.length === 1,
    "live Rotini pack reservations must contain only the journal-bound project reservation",
  );
  const reservation = objectValue(reservations[0], "live Rotini current pack reservation");
  exactValue(reservation.active, true, "live Rotini current pack reservation active marker");
  const key = objectValue(reservation.key, "live Rotini current pack reservation key");
  exactRecordKeys(key, ["owner", "token_id"], "live Rotini current pack reservation key");
  exactValue(key.owner, adapter, "live Rotini current pack reservation owner");
  exactValue(
    natValue(key.token_id, "live Rotini current pack reservation project"),
    0,
    "live Rotini current pack reservation project",
  );
  exactValue(
    natValue(reservation.value, "live Rotini current pack reservation amount"),
    2,
    "live Rotini current pack reservation amount",
  );
  exactValue(
    natValue(reservation.firstLevel, "live Rotini current pack reservation first level"),
    reservationLevel,
    "live Rotini current pack reservation first level",
  );
  exactValue(
    natValue(reservation.lastLevel, "live Rotini current pack reservation last level"),
    reservationLevel,
    "live Rotini current pack reservation last level",
  );
  exactValue(
    natValue(reservation.updates, "live Rotini current pack reservation updates"),
    2,
    "live Rotini current pack reservation updates",
  );
}

type RavioliCurrentOp55RotiniExpectation = Readonly<{
  adapterAddress: string;
  packMinterAppliedLevel: number;
  packMinterSecondAppliedLevel: number;
}>;

function validateCurrentOp55Rotini(
  snapshot: FreshRotiniLiveSnapshot,
  expectation: RavioliCurrentOp55RotiniExpectation,
): void {
  const packMinters = arrayValue(
    snapshot.authorizedPackMinters,
    "live Rotini authorized pack minters",
  );
  requireValue(
    packMinters.length === 1,
    "live Rotini operation-55 authorized pack minters must contain only the journal-bound adapter",
  );
  const packMinter = objectValue(packMinters[0], "live Rotini operation-55 pack minter");
  exactValue(packMinter.active, true, "live Rotini operation-55 pack minter active marker");
  exactValue(packMinter.key, expectation.adapterAddress, "live Rotini operation-55 pack minter key");
  exactRecordKeys(
    objectValue(packMinter.value, "live Rotini operation-55 pack minter value"),
    [],
    "live Rotini operation-55 pack minter value",
  );
  exactValue(
    natValue(packMinter.firstLevel, "live Rotini operation-55 pack minter first level"),
    expectation.packMinterAppliedLevel,
    "live Rotini operation-55 pack minter first level",
  );
  exactValue(
    natValue(packMinter.lastLevel, "live Rotini operation-55 pack minter last level"),
    expectation.packMinterSecondAppliedLevel,
    "live Rotini operation-55 pack minter last level",
  );
  exactValue(
    natValue(packMinter.updates, "live Rotini operation-55 pack minter updates"),
    2,
    "live Rotini operation-55 pack minter updates",
  );
  emptyEvidence(snapshot.openReservations, "live Rotini open reservations");
  emptyEvidence(snapshot.packReservations, "live Rotini pack reservations");
}

function validateRotiniLive(
  evidence: FreshRavioliDependencies,
  snapshot: FreshRotiniLiveSnapshot,
  reservationExpectation?: RavioliCurrentV6ResumeRecovery["rotiniReservation"],
  operation55Expectation?: RavioliCurrentOp55RotiniExpectation,
): void {
  requireValue(
    !(reservationExpectation && operation55Expectation),
    "live Rotini dependency expectation cannot be both reserved and terminal",
  );
  exactValue(snapshot.chainId, FRESH_RAVIOLI_CHAIN_ID, "live Rotini chain id");
  exactValue(snapshot.contractAddress, evidence.rotini.contractAddress, "live Rotini contract identity");
  exactValue(snapshot.scriptSha256, evidence.rotini.scriptSha256, "live Rotini script identity");
  exactValue(snapshot.scriptCodeSha256, evidence.rotini.scriptCodeSha256, "live Rotini Michelson code identity");
  exactValue(snapshot.administrator, evidence.creator, "live Rotini administrator");
  exactValue(natValue(snapshot.nextProjectId, "live Rotini next project id"), 3, "live Rotini next project id");
  exactValue(
    natValue(snapshot.nextTokenId, "live Rotini next token id"),
    operation55Expectation ? 6 : 3,
    "live Rotini next token id",
  );
  exactValue(snapshot.project0.active, true, "live Rotini project 0 active flag");
  exactValue(snapshot.project0.outputMode, "png", "live Rotini project 0 output mode");
  exactValue(natValue(snapshot.project0.priceMutez, "live Rotini project 0 price"), 0, "live Rotini project 0 price");
  exactValue(snapshot.project0.maxSupply, 4, "live Rotini project 0 max supply");
  exactValue(
    natValue(snapshot.project0.minted, "live Rotini project 0 minted"),
    operation55Expectation ? 4 : 1,
    "live Rotini project 0 minted",
  );
  exactValue(
    natValue(snapshot.project0.reserved, "live Rotini project 0 reserved"),
    reservationExpectation ? 2 : 0,
    "live Rotini project 0 reserved",
  );
  emptyEvidence(snapshot.activeOperators, "live Rotini active operators");
  if (operation55Expectation) {
    validateCurrentOp55Rotini(snapshot, operation55Expectation);
  } else if (reservationExpectation) {
    validateCurrentRotiniReservation(snapshot, reservationExpectation);
  } else {
    emptyEvidence(snapshot.authorizedPackMinters, "live Rotini authorized pack minters");
    emptyEvidence(snapshot.openReservations, "live Rotini open reservations");
    emptyEvidence(snapshot.packReservations, "live Rotini pack reservations");
  }
}

async function recheckRavioliDependencies(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  operatorExpectation: GnocchiOperatorExpectation,
  options: {
    now?: Date | string | number;
    rotiniReservation?: RavioliCurrentV6ResumeRecovery["rotiniReservation"];
    rotiniOperation55?: RavioliCurrentOp55RotiniExpectation;
  },
): Promise<FreshRavioliDependencyLiveCheck> {
  exactValue(evidence.schema, FRESH_RAVIOLI_DEPENDENCY_SCHEMA, "fresh dependency evidence schema");
  exactValue(evidence.network.name, FRESH_RAVIOLI_NETWORK, "fresh dependency evidence network");
  exactValue(evidence.network.chainId, FRESH_RAVIOLI_CHAIN_ID, "fresh dependency evidence chain id");
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : options.now === undefined
      ? Date.now()
      : typeof options.now === "number"
        ? options.now
        : Date.parse(options.now);
  requireValue(Number.isFinite(nowMs), "fresh dependency live recheck time is invalid");
  const gnocchiRequest: FreshDependencyReadRequest = Object.freeze({
    runId: evidence.runId,
    chainId: FRESH_RAVIOLI_CHAIN_ID,
    contractAddress: evidence.gnocchi.contractAddress,
    expectedScriptSha256: evidence.gnocchi.scriptSha256,
    expectedScriptCodeSha256: evidence.gnocchi.scriptCodeSha256,
  });
  const rotiniRequest: FreshDependencyReadRequest = Object.freeze({
    runId: evidence.runId,
    chainId: FRESH_RAVIOLI_CHAIN_ID,
    contractAddress: evidence.rotini.contractAddress,
    expectedScriptSha256: evidence.rotini.scriptSha256,
    expectedScriptCodeSha256: evidence.rotini.scriptCodeSha256,
  });
  const [gnocchi, rotini] = await Promise.all([
    readers.readGnocchi(gnocchiRequest),
    readers.readRotini(rotiniRequest),
  ]);
  validateGnocchiLive(evidence, gnocchi, nowMs, operatorExpectation);
  validateRotiniLive(evidence, rotini, options.rotiniReservation, options.rotiniOperation55);
  return {
    schema: FRESH_RAVIOLI_DEPENDENCY_SCHEMA,
    runId: evidence.runId,
    checkedAt: new Date(nowMs).toISOString(),
    gnocchi,
    rotini,
  };
}

export async function recheckFreshRavioliDependencies(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  options: { now?: Date | string | number } = {},
): Promise<FreshRavioliDependencyLiveCheck> {
  return recheckRavioliDependencies(evidence, readers, FRESH_GNOCCHI_OPERATOR_EXPECTATION, options);
}

export async function recheckRavioliDependenciesForMode0Replay(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliMode0ReplayRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliMode0ReplayDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli mode-0 replay router",
  );
  requireValue(
    routerAddress !== evidence.gnocchi.contractAddress && routerAddress !== evidence.rotini.contractAddress,
    "Ravioli mode-0 replay router must be distinct from the Gnocchi and Rotini dependencies",
  );
  requireValue(
    Number.isSafeInteger(recovery.appliedLevel) && recovery.appliedLevel > 0,
    "Ravioli mode-0 replay operator applied level must be a positive safe integer",
  );
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "mode0-replay",
      routerAddress,
      appliedLevel: recovery.appliedLevel,
    },
    options,
  );
  return {
    ...checked,
    classification: RAVIOLI_MODE0_REPLAY_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operator",
      owner: evidence.creator,
      operator: routerAddress,
      tokenId: 0,
      appliedLevel: recovery.appliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentV2Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliMode0ReplayRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentV2DependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli current-v2 router",
  );
  requireValue(
    routerAddress !== evidence.gnocchi.contractAddress && routerAddress !== evidence.rotini.contractAddress,
    "Ravioli current-v2 router must be distinct from the Gnocchi and Rotini dependencies",
  );
  requireValue(
    Number.isSafeInteger(recovery.appliedLevel) && recovery.appliedLevel > 0,
    "Ravioli current-v2 operator applied level must be a positive safe integer",
  );
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-v2",
      routerAddress,
      appliedLevel: recovery.appliedLevel,
    },
    options,
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_V2_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operator-and-escrow",
      owner: evidence.creator,
      operator: routerAddress,
      tokenId: 0,
      amount: 1,
      appliedLevel: recovery.appliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentV3Restart(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentV3RestartRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentV3RestartDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli current-v3 router",
  );
  requireValue(
    routerAddress !== evidence.gnocchi.contractAddress && routerAddress !== evidence.rotini.contractAddress,
    "Ravioli current-v3 router must be distinct from the Gnocchi and Rotini dependencies",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode0AppliedLevel) && recovery.mode0AppliedLevel > 0,
    "Ravioli current-v3 mode-0 operator applied level must be a positive safe integer",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode1AppliedLevel)
      && recovery.mode1AppliedLevel > recovery.mode0AppliedLevel,
    "Ravioli current-v3 mode-1 operator applied level must follow its mode-0 operator",
  );
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-v3",
      routerAddress,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
    },
    options,
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_V3_RESTART_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operators-and-escrow",
      owner: evidence.creator,
      operator: routerAddress,
      tokenIds: Object.freeze([0, 1]) as readonly [0, 1],
      escrowTokenId: 0,
      escrowAmount: 1,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentV5Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentV5ResumeRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentV5ResumeDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli current-v5 router",
  );
  requireValue(
    routerAddress !== evidence.gnocchi.contractAddress && routerAddress !== evidence.rotini.contractAddress,
    "Ravioli current-v5 router must be distinct from the Gnocchi and Rotini dependencies",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode0AppliedLevel) && recovery.mode0AppliedLevel > 0,
    "Ravioli current-v5 mode-0 operator applied level must be a positive safe integer",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode1AppliedLevel)
      && recovery.mode1AppliedLevel > recovery.mode0AppliedLevel,
    "Ravioli current-v5 mode-1 operator applied level must follow its mode-0 operator",
  );
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-v5",
      routerAddress,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
    },
    options,
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_V5_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operators-and-two-funded-pools",
      owner: evidence.creator,
      operator: routerAddress,
      tokenIds: Object.freeze([0, 1]) as readonly [0, 1],
      creatorBalances: Object.freeze({ "0": 0, "1": 0 }) as Readonly<{ "0": 0; "1": 0 }>,
      routerEscrowBalances: Object.freeze({ "0": 2, "1": 2 }) as Readonly<{ "0": 2; "1": 2 }>,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentOp14Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentOp14ResumeRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentOp14ResumeDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli operation-14 router",
  );
  requireValue(
    routerAddress !== evidence.gnocchi.contractAddress && routerAddress !== evidence.rotini.contractAddress,
    "Ravioli operation-14 router must be distinct from the Gnocchi and Rotini dependencies",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode0AppliedLevel) && recovery.mode0AppliedLevel > 0,
    "Ravioli operation-14 mode-0 operator applied level must be a positive safe integer",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode1AppliedLevel)
      && recovery.mode1AppliedLevel > recovery.mode0AppliedLevel,
    "Ravioli operation-14 mode-1 operator applied level must follow its mode-0 operator",
  );
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-op14",
      routerAddress,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
    },
    options,
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_OP14_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operators-and-current-funded-pools",
      owner: evidence.creator,
      operator: routerAddress,
      tokenIds: Object.freeze([0, 1]) as readonly [0, 1],
      creatorBalances: Object.freeze({ "0": 0, "1": 1 }) as Readonly<{ "0": 0; "1": 1 }>,
      routerEscrowBalances: Object.freeze({ "0": 2, "1": 1 }) as Readonly<{ "0": 2; "1": 1 }>,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentOp20Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentOp20ResumeRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentOp20ResumeDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli operation-20 router",
  );
  const gnocchiAdapterAddress = requireContractAddress(
    recovery.gnocchiAdapterAddress,
    "Ravioli operation-20 Gnocchi adapter",
  );
  requireValue(
    new Set([
      evidence.gnocchi.contractAddress,
      evidence.rotini.contractAddress,
      routerAddress,
      gnocchiAdapterAddress,
    ]).size === 4,
    "Ravioli operation-20 contracts must be pairwise distinct",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode0AppliedLevel) && recovery.mode0AppliedLevel > 0,
    "Ravioli operation-20 mode-0 operator applied level must be a positive safe integer",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode1AppliedLevel)
      && recovery.mode1AppliedLevel > recovery.mode0AppliedLevel,
    "Ravioli operation-20 mode-1 operator applied level must follow its mode-0 operator",
  );
  requireValue(
    Number.isSafeInteger(recovery.minterAppliedLevel)
      && recovery.minterAppliedLevel > recovery.mode1AppliedLevel,
    "Ravioli operation-20 minter applied level must follow its mode-1 operator",
  );
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-op20",
      routerAddress,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
      gnocchiAdapterAddress,
      minterAppliedLevel: recovery.minterAppliedLevel,
    },
    options,
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_OP20_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operators-funded-pools-and-authorized-adapter",
      owner: evidence.creator,
      operator: routerAddress,
      gnocchiAdapter: gnocchiAdapterAddress,
      tokenIds: Object.freeze([0, 1]) as readonly [0, 1],
      creatorBalances: Object.freeze({ "0": 0, "1": 1 }) as Readonly<{ "0": 0; "1": 1 }>,
      routerEscrowBalances: Object.freeze({ "0": 2, "1": 1 }) as Readonly<{ "0": 2; "1": 1 }>,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
      minterAppliedLevel: recovery.minterAppliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentV6Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentV6ResumeRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentV6ResumeDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli current-v6 router",
  );
  const gnocchiAdapterAddress = requireContractAddress(
    recovery.gnocchiAdapterAddress,
    "Ravioli current-v6 Gnocchi adapter",
  );
  const rotiniReservation = recovery.rotiniReservation
    ? {
        adapterAddress: requireContractAddress(
          recovery.rotiniReservation.adapterAddress,
          "Ravioli current-v6 Rotini adapter",
        ),
        packMinterAppliedLevel: natValue(
          recovery.rotiniReservation.packMinterAppliedLevel,
          "Ravioli current-v6 Rotini pack-minter applied level",
        ),
        reservationAppliedLevel: natValue(
          recovery.rotiniReservation.reservationAppliedLevel,
          "Ravioli current-v6 Rotini reservation applied level",
        ),
      }
    : null;
  requireValue(
    new Set([
      evidence.gnocchi.contractAddress,
      evidence.rotini.contractAddress,
      routerAddress,
      gnocchiAdapterAddress,
      ...(rotiniReservation ? [rotiniReservation.adapterAddress] : []),
    ]).size === (rotiniReservation ? 5 : 4),
    "Ravioli current-v6 contracts must be pairwise distinct",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode0AppliedLevel) && recovery.mode0AppliedLevel > 0,
    "Ravioli current-v6 mode-0 operator applied level must be a positive safe integer",
  );
  requireValue(
    Number.isSafeInteger(recovery.mode1AppliedLevel)
      && recovery.mode1AppliedLevel > recovery.mode0AppliedLevel,
    "Ravioli current-v6 mode-1 operator applied level must follow its mode-0 operator",
  );
  requireValue(
    Number.isSafeInteger(recovery.minterAppliedLevel)
      && recovery.minterAppliedLevel > recovery.mode1AppliedLevel,
    "Ravioli current-v6 minter applied level must follow its mode-1 operator",
  );
  requireValue(
    Number.isSafeInteger(recovery.reservedMintAppliedLevel)
      && recovery.reservedMintAppliedLevel > recovery.minterAppliedLevel,
    "Ravioli current-v6 reservation applied level must follow its minter authorization",
  );
  if (rotiniReservation) {
    requireValue(
      rotiniReservation.packMinterAppliedLevel > recovery.reservedMintAppliedLevel,
      "Ravioli current-v6 Rotini pack-minter authorization must follow its Gnocchi reservation",
    );
    requireValue(
      rotiniReservation.reservationAppliedLevel > rotiniReservation.packMinterAppliedLevel,
      "Ravioli current-v6 Rotini reservation must follow its pack-minter authorization",
    );
  }
  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-v6",
      routerAddress,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
      gnocchiAdapterAddress,
      minterAppliedLevel: recovery.minterAppliedLevel,
      reservedMintAppliedLevel: recovery.reservedMintAppliedLevel,
    },
    {
      ...options,
      ...(rotiniReservation ? { rotiniReservation } : {}),
    },
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_V6_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "gnocchi-fa2-operators-funded-pools-and-le-reservation",
      owner: evidence.creator,
      operator: routerAddress,
      gnocchiAdapter: gnocchiAdapterAddress,
      tokenIds: Object.freeze([0, 1]) as readonly [0, 1],
      creatorBalances: Object.freeze({ "0": 0, "1": 1 }) as Readonly<{ "0": 0; "1": 1 }>,
      routerEscrowBalances: Object.freeze({ "0": 2, "1": 1 }) as Readonly<{ "0": 2; "1": 1 }>,
      reservedTokenId: 2,
      reservedAmount: 1,
      mode0AppliedLevel: recovery.mode0AppliedLevel,
      mode1AppliedLevel: recovery.mode1AppliedLevel,
      minterAppliedLevel: recovery.minterAppliedLevel,
      reservedMintAppliedLevel: recovery.reservedMintAppliedLevel,
      ...(rotiniReservation
        ? {
            rotiniReservation: Object.freeze({
              adapter: rotiniReservation.adapterAddress,
              projectId: 0 as const,
              reservedAmount: 2 as const,
              packMinterAppliedLevel: rotiniReservation.packMinterAppliedLevel,
              reservationAppliedLevel: rotiniReservation.reservationAppliedLevel,
            }),
          }
        : {}),
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentOp55Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentOp55ResumeRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentOp55ResumeDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli operation-55 router",
  );
  const gnocchiAdapterAddress = requireContractAddress(
    recovery.gnocchiAdapterAddress,
    "Ravioli operation-55 Gnocchi adapter",
  );
  const rotiniAdapterAddress = requireContractAddress(
    recovery.rotiniAdapterAddress,
    "Ravioli operation-55 Rotini adapter",
  );
  requireValue(
    new Set([
      evidence.gnocchi.contractAddress,
      evidence.rotini.contractAddress,
      routerAddress,
      gnocchiAdapterAddress,
      rotiniAdapterAddress,
    ]).size === 5,
    "Ravioli operation-55 contracts must be pairwise distinct",
  );

  const mode0AppliedLevel = natValue(
    recovery.mode0AppliedLevel,
    "Ravioli operation-55 mode-0 operator first applied level",
  );
  const mode1AppliedLevel = natValue(
    recovery.mode1AppliedLevel,
    "Ravioli operation-55 mode-1 operator first applied level",
  );
  const minterAppliedLevel = natValue(
    recovery.minterAppliedLevel,
    "Ravioli operation-55 Gnocchi minter first applied level",
  );
  const rotiniPackMinterAppliedLevel = natValue(
    recovery.rotiniPackMinterAppliedLevel,
    "Ravioli operation-55 Rotini pack-minter first applied level",
  );
  const minterSecondAppliedLevel = natValue(
    recovery.minterSecondAppliedLevel,
    "Ravioli operation-55 Gnocchi minter second applied level",
  );
  const rotiniPackMinterSecondAppliedLevel = natValue(
    recovery.rotiniPackMinterSecondAppliedLevel,
    "Ravioli operation-55 Rotini pack-minter second applied level",
  );
  const mode1SecondAppliedLevel = natValue(
    recovery.mode1SecondAppliedLevel,
    "Ravioli operation-55 mode-1 operator second applied level",
  );
  requireValue(
    mode0AppliedLevel > 0
      && mode1AppliedLevel > mode0AppliedLevel
      && minterAppliedLevel > mode1AppliedLevel
      && rotiniPackMinterAppliedLevel > minterAppliedLevel
      && minterSecondAppliedLevel > rotiniPackMinterAppliedLevel
      && rotiniPackMinterSecondAppliedLevel > minterSecondAppliedLevel
      && mode1SecondAppliedLevel > rotiniPackMinterSecondAppliedLevel,
    "Ravioli operation-55 dependency update levels must match the strictly ordered journal history",
  );

  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-op55",
      routerAddress,
      gnocchiAdapterAddress,
      mode0AppliedLevel,
      mode1AppliedLevel,
      minterAppliedLevel,
      minterSecondAppliedLevel,
      mode1SecondAppliedLevel,
    },
    {
      ...options,
      rotiniOperation55: {
        adapterAddress: rotiniAdapterAddress,
        packMinterAppliedLevel: rotiniPackMinterAppliedLevel,
        packMinterSecondAppliedLevel: rotiniPackMinterSecondAppliedLevel,
      },
    },
  );
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_OP55_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      kind: "five-mode-terminal-dependency-state",
      owner: evidence.creator,
      operator: routerAddress,
      gnocchiAdapter: gnocchiAdapterAddress,
      rotiniAdapter: rotiniAdapterAddress,
      creatorBalances: Object.freeze({ "0": 0, "1": 0 }) as Readonly<{ "0": 0; "1": 0 }>,
      routerEscrowBalances: Object.freeze({ "0": 0, "1": 0 }) as Readonly<{ "0": 0; "1": 0 }>,
      token2: Object.freeze({ totalMinted: 4, totalReserved: 0 }) as Readonly<{
        totalMinted: 4;
        totalReserved: 0;
      }>,
      rotini: Object.freeze({
        nextTokenId: 6,
        projectId: 0,
        minted: 4,
        reserved: 0,
      }) as Readonly<{
        nextTokenId: 6;
        projectId: 0;
        minted: 4;
        reserved: 0;
      }>,
      mode0AppliedLevel,
      mode1AppliedLevel,
      minterAppliedLevel,
      rotiniPackMinterAppliedLevel,
      minterSecondAppliedLevel,
      rotiniPackMinterSecondAppliedLevel,
      mode1SecondAppliedLevel,
    }),
  };
}

export async function recheckRavioliDependenciesForCurrentOp63Resume(
  evidence: FreshRavioliDependencies,
  readers: FreshRavioliDependencyReaders,
  recovery: RavioliCurrentOp63ResumeRecovery,
  options: { now?: Date | string | number } = {},
): Promise<RavioliCurrentOp63ResumeDependencyLiveCheck | RavioliCurrentOp67ResumeDependencyLiveCheck> {
  const routerAddress = requireContractAddress(
    recovery.routerAddress,
    "Ravioli operation-63 router",
  );
  const gnocchiAdapterAddress = requireContractAddress(
    recovery.gnocchiAdapterAddress,
    "Ravioli operation-63 Gnocchi adapter",
  );
  const rotiniAdapterAddress = requireContractAddress(
    recovery.rotiniAdapterAddress,
    "Ravioli operation-63 Rotini adapter",
  );
  requireValue(
    new Set([
      evidence.gnocchi.contractAddress,
      evidence.rotini.contractAddress,
      routerAddress,
      gnocchiAdapterAddress,
      rotiniAdapterAddress,
    ]).size === 5,
    "Ravioli operation-63 contracts must be pairwise distinct",
  );

  const mode0AppliedLevel = natValue(
    recovery.mode0AppliedLevel,
    "Ravioli operation-63 mode-0 operator first applied level",
  );
  const mode1AppliedLevel = natValue(
    recovery.mode1AppliedLevel,
    "Ravioli operation-63 mode-1 operator first applied level",
  );
  const minterAppliedLevel = natValue(
    recovery.minterAppliedLevel,
    "Ravioli operation-63 Gnocchi minter first applied level",
  );
  const rotiniPackMinterAppliedLevel = natValue(
    recovery.rotiniPackMinterAppliedLevel,
    "Ravioli operation-63 Rotini pack-minter first applied level",
  );
  const minterSecondAppliedLevel = natValue(
    recovery.minterSecondAppliedLevel,
    "Ravioli operation-63 Gnocchi minter second applied level",
  );
  const rotiniPackMinterSecondAppliedLevel = natValue(
    recovery.rotiniPackMinterSecondAppliedLevel,
    "Ravioli operation-63 Rotini pack-minter second applied level",
  );
  const mode1SecondAppliedLevel = natValue(
    recovery.mode1SecondAppliedLevel,
    "Ravioli operation-63 mode-1 operator second applied level",
  );
  const minterThirdAppliedLevel = natValue(
    recovery.minterThirdAppliedLevel,
    "Ravioli operation-63 Gnocchi minter third applied level",
  );
  const allocationAppliedLevel = natValue(
    recovery.allocationAppliedLevel,
    "Ravioli operation-63 adapter allocation applied level",
  );
  const adapterRouterAppliedLevel = natValue(
    recovery.adapterRouterAppliedLevel,
    "Ravioli operation-63 adapter router applied level",
  );
  const reservedMintFirstAppliedLevel = natValue(
    recovery.reservedMintFirstAppliedLevel,
    "Ravioli operation-63 reserved mint first applied level",
  );
  const reservedMintAppliedLevel = natValue(
    recovery.reservedMintAppliedLevel,
    "Ravioli operation-63 reserved mint terminal applied level",
  );
  const adapterRecoveryAppliedLevel = recovery.adapterRecoveryAppliedLevel === undefined
    ? null
    : natValue(
        recovery.adapterRecoveryAppliedLevel,
        "Ravioli operation-67 adapter recovery applied level",
      );
  exactValue(
    minterThirdAppliedLevel,
    RAVIOLI_CURRENT_OP63_MINTER_THIRD_APPLIED_LEVEL,
    "Ravioli operation-63 Gnocchi minter third applied level",
  );
  exactValue(
    allocationAppliedLevel,
    RAVIOLI_CURRENT_OP63_ALLOCATION_APPLIED_LEVEL,
    "Ravioli operation-63 adapter allocation applied level",
  );
  exactValue(
    adapterRouterAppliedLevel,
    RAVIOLI_CURRENT_OP63_ADAPTER_ROUTER_APPLIED_LEVEL,
    "Ravioli operation-63 adapter router applied level",
  );
  exactValue(
    reservedMintFirstAppliedLevel,
    RAVIOLI_CURRENT_OP63_RESERVED_MINT_FIRST_APPLIED_LEVEL,
    "Ravioli operation-63 reserved mint first applied level",
  );
  exactValue(
    reservedMintAppliedLevel,
    RAVIOLI_CURRENT_OP63_RESERVED_MINT_APPLIED_LEVEL,
    "Ravioli operation-63 reserved mint terminal applied level",
  );
  requireValue(
    mode0AppliedLevel > 0
      && mode1AppliedLevel > mode0AppliedLevel
      && minterAppliedLevel > mode1AppliedLevel
      && rotiniPackMinterAppliedLevel > minterAppliedLevel
      && minterSecondAppliedLevel > rotiniPackMinterAppliedLevel
      && rotiniPackMinterSecondAppliedLevel > minterSecondAppliedLevel
      && mode1SecondAppliedLevel > rotiniPackMinterSecondAppliedLevel
      && reservedMintFirstAppliedLevel > mode1SecondAppliedLevel
      && minterThirdAppliedLevel > reservedMintFirstAppliedLevel
      && allocationAppliedLevel > minterThirdAppliedLevel
      && adapterRouterAppliedLevel > allocationAppliedLevel
      && reservedMintAppliedLevel > adapterRouterAppliedLevel
      && (adapterRecoveryAppliedLevel === null || adapterRecoveryAppliedLevel > reservedMintAppliedLevel),
    "Ravioli operation-63 dependency update levels must match the strictly ordered journal history",
  );

  const checked = await recheckRavioliDependencies(
    evidence,
    readers,
    {
      kind: "current-op63",
      routerAddress,
      gnocchiAdapterAddress,
      mode0AppliedLevel,
      mode1AppliedLevel,
      minterAppliedLevel,
      minterSecondAppliedLevel,
      mode1SecondAppliedLevel,
      minterThirdAppliedLevel,
      reservedMintFirstAppliedLevel,
      reservedMintAppliedLevel,
      ...(adapterRecoveryAppliedLevel === null ? {} : { adapterRecoveryAppliedLevel }),
    },
    {
      ...options,
      rotiniOperation55: {
        adapterAddress: rotiniAdapterAddress,
        packMinterAppliedLevel: rotiniPackMinterAppliedLevel,
        packMinterSecondAppliedLevel: rotiniPackMinterSecondAppliedLevel,
      },
    },
  );
  const sharedAcceptedMutation = {
    owner: evidence.creator,
    operator: routerAddress,
    gnocchiAdapter: gnocchiAdapterAddress,
    rotiniAdapter: rotiniAdapterAddress,
    creatorBalances: Object.freeze({ "0": 0, "1": 0 }) as Readonly<{ "0": 0; "1": 0 }>,
    routerEscrowBalances: Object.freeze({ "0": 0, "1": 0 }) as Readonly<{ "0": 0; "1": 0 }>,
    token2: Object.freeze({ totalMinted: 4, totalReserved: 0 }) as Readonly<{
      totalMinted: 4;
      totalReserved: 0;
    }>,
    rotini: Object.freeze({
      nextTokenId: 6,
      projectId: 0,
      minted: 4,
      reserved: 0,
    }) as Readonly<{
      nextTokenId: 6;
      projectId: 0;
      minted: 4;
      reserved: 0;
    }>,
    mode0AppliedLevel,
    mode1AppliedLevel,
    minterAppliedLevel,
    rotiniPackMinterAppliedLevel,
    minterSecondAppliedLevel,
    rotiniPackMinterSecondAppliedLevel,
    mode1SecondAppliedLevel,
    minterThirdAppliedLevel,
    allocationAppliedLevel,
    adapterRouterAppliedLevel,
    reservedMintFirstAppliedLevel,
    reservedMintAppliedLevel,
  } as const;
  if (adapterRecoveryAppliedLevel !== null) return {
    ...checked,
    classification: RAVIOLI_CURRENT_OP67_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      ...sharedAcceptedMutation,
      kind: "withheld-reveal-released-dependency-state" as const,
      reservedMint: Object.freeze({ tokenId: 1, amount: 0 }) as Readonly<{
        tokenId: 1;
        amount: 0;
      }>,
      adapterRecoveryAppliedLevel,
    }),
  };
  return {
    ...checked,
    classification: RAVIOLI_CURRENT_OP63_RESUME_DEPENDENCY_CLASSIFICATION,
    acceptedMutation: Object.freeze({
      ...sharedAcceptedMutation,
      kind: "withheld-reveal-allocation-dependency-state",
      reservedMint: Object.freeze({ tokenId: 1, amount: 2 }) as Readonly<{
        tokenId: 1;
        amount: 2;
      }>,
    }),
  };
}
