#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  buildCollectionPackage,
  validateCheasePackage,
} from "../../shared/pasta-protocol/index";
import {
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveAppliedOperationAssertion,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
} from "./pasta-ui-live-bridge-kit";
import {
  PastaProofRestartJournal,
  readPastaProofRestartRpcSnapshot,
  type PastaProofRestartActor,
  type PastaProofRestartRpcSnapshot,
  type PastaProofRestartStep,
} from "./pasta-proof-restart-journal";
import {
  assertPastaProofRestartOrigination,
  assertPastaProofRestartTransaction,
  reconcilePastaProofRestartOperation,
} from "./pasta-proof-restart-chain";
import { assertMichelsonScriptCodeIdentity } from "./pasta-michelson-script-identity";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  type CapturePastaProofStageResult,
  type RequiredDomEvidence,
} from "./pasta-proof-screenshot-kit";
import {
  assertShadownet,
  block,
  buildToolkit,
  deterministicJsonBytes,
  hexToUtf8,
  loadSignerPair,
  normalizeBase,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_SHADOWNET_LASAGNA_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const CREATOR_OPERATION_RESERVE_MUTEZ = 2_500_000;
const CURATOR_OPERATION_RESERVE_MUTEZ = 1_000_000;
const HANDOFF_KEY = "wtfos.pasta.handoff.v1:lasagna-ui-live-proof";
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const STATIC_ROOT = path.join(root, "public");
const CONTRACT_ARTIFACT_PATH = path.join(
  STATIC_ROOT,
  "creation-tools",
  "lasagna",
  "contract",
  "pasta-exhibition.contract.json",
);
const PUBLIC_SITE_SCRIPT_PATH = path.join(
  STATIC_ROOT,
  "creation-tools",
  "lasagna",
  "js",
  "site.js",
);
const RESTART_CHECKPOINT_PATH = "artifacts/lasagna-restart-checkpoint.json";
const REFERENCE_APPS = ["macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne"] as const;
const LASAGNA_RESTART_PLAN: readonly PastaProofRestartStep[] = Object.freeze([
  { id: "registry-metadata-pin", actor: "creator", kind: "pin", fileName: "exhibition.json" },
  { id: "originate-registry", actor: "creator", kind: "operation", action: "originate" },
  { id: "add-curator", actor: "creator", kind: "operation", action: "call", entrypoint: "add_curator" },
  { id: "revision-zero-pin", actor: "curator", kind: "pin", fileName: "revision.json" },
  { id: "publish-revision-zero", actor: "curator", kind: "operation", action: "call", entrypoint: "publish_revision" },
  { id: "revision-one-pin", actor: "creator", kind: "pin", fileName: "revision.json" },
  { id: "publish-revision-one", actor: "creator", kind: "operation", action: "call", entrypoint: "publish_revision" },
  { id: "set-current-zero", actor: "curator", kind: "operation", action: "call", entrypoint: "set_current_revision" },
  { id: "remove-curator", actor: "creator", kind: "operation", action: "call", entrypoint: "remove_curator" },
]);

type ReferenceApp = (typeof REFERENCE_APPS)[number];

export type LasagnaReferenceToken = {
  app: ReferenceApp;
  contract: string;
  token_id: number;
  tokenRecordId: string;
  explorerUrl: string;
  artifactUri: string;
};

type Actor = "creator" | "curator";

type PinnedMetadataRecord = {
  actor: Actor;
  value: unknown;
  proof: PastaUiLivePinProof;
};

type WrittenArtifact = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  ipfsUri?: string;
  gatewayUrl?: string;
  retrievedSha256?: string;
};

type OperationReceipt = PastaUiLivePublicReceipt & {
  action: "originate" | "call" | "batch";
  operationHash: string;
  signerAddress: string;
  contractAddress: string;
};

type RevisionState = {
  id: number;
  curator: string;
  metadataUri: string;
  items: Array<{ contract: string; token_id: number }>;
};

type ExhibitionFinalState = {
  administrator: string;
  pendingAdministrator: null;
  revisionCount: 2;
  currentRevision: 0;
  curatorActive: false;
  revisions: [RevisionState, RevisionState];
};

type LasagnaUiLiveResult = {
  manifestPath: string;
  receiptPath: string;
  contractAddress: string;
  operationHashes: string[];
  screenshots: CapturePastaProofStageResult[];
};

export function assertLasagnaUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Lasagna UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this lane pins durable exhibition metadata and signs real Shadownet registry operations with creator and curator keyring wallets.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Lasagna UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to the aggregate proof-run root before executing this lane.`,
    ]);
  }
  for (const key of [
    "PASTA_SHADOWNET_LASAGNA_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_LASAGNA_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_LASAGNA_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Lasagna UI-live proof is fresh-origination only", [
        `Unset \`${key}\`; proof runs may not resume or attach to an existing registry.`,
      ]);
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const extra = "errors" in error
      ? JSON.stringify((error as Error & { errors?: unknown }).errors ?? "")
      : "";
    return `${error.message} ${extra}`.trim();
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function projectLasagnaTzktValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectLasagnaTzktValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, projectLasagnaTzktValue(item)]),
    );
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) return Number(value);
  return value;
}

export function assertLasagnaRestartScriptIdentity(actualCode: unknown, expectedCode: unknown): string {
  return assertMichelsonScriptCodeIdentity(
    actualCode,
    expectedCode,
    "Lasagna restart originated code differs",
  );
}

function lasagnaRestartActorAddress(
  addresses: Readonly<Record<Actor, string>>,
  actor: PastaProofRestartActor,
): string {
  if (actor === "creator" || actor === "curator") return addresses[actor];
  throw new Error(`Lasagna restart plan contains unsupported actor ${actor}`);
}

async function readLasagnaRestartRpcPair(
  addresses: Readonly<Record<Actor, string>>,
): Promise<readonly [PastaProofRestartRpcSnapshot, PastaProofRestartRpcSnapshot]> {
  const actors = { creator: addresses.creator, curator: addresses.curator };
  const snapshots = await Promise.all([
    readPastaProofRestartRpcSnapshot(SHADOWNET_RPC_PRIMARY, actors),
    readPastaProofRestartRpcSnapshot(SHADOWNET_RPC_FALLBACK, actors),
  ]) as [PastaProofRestartRpcSnapshot, PastaProofRestartRpcSnapshot];
  for (const actor of ["creator", "curator"] as const) {
    assert.equal(
      snapshots[0].counters[actor],
      snapshots[1].counters[actor],
      `Lasagna ${actor} counter differs across approved Shadownet RPCs`,
    );
  }
  return snapshots;
}

async function assertLasagnaRestartCounterBoundary(
  restartJournal: PastaProofRestartJournal,
  addresses: Readonly<Record<Actor, string>>,
  actor: Actor,
): Promise<void> {
  const snapshots = await readLasagnaRestartRpcPair(addresses);
  assert.equal(
    snapshots[0].counters[actor],
    restartJournal.expectedCurrentCounter(actor),
    `Lasagna ${actor} manager counter changed outside the authenticated restart journal`,
  );
  assert.equal(
    snapshots.flatMap((snapshot) => snapshot.activeManagerOperations).filter((operation) =>
      operation.source === addresses[actor]).length,
    0,
    `Lasagna ${actor} has an active manager operation before PREPARED`,
  );
}

export function lasagnaRawSha256Cid(bytes: Uint8Array): string {
  const cidBytes = Buffer.concat([
    Buffer.from([0x01, 0x55, 0x12, 0x20]),
    createHash("sha256").update(bytes).digest(),
  ]);
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let accumulator = 0;
  let encoded = "";
  for (const byte of cidBytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(accumulator >>> bits) & 31];
    }
    accumulator &= (1 << bits) - 1;
  }
  if (bits > 0) encoded += alphabet[(accumulator << (5 - bits)) & 31];
  return `b${encoded}`;
}

async function reconcileLasagnaPendingPin(
  restartJournal: PastaProofRestartJournal,
  ipfs: IpfsProofConfig,
): Promise<void> {
  await restartJournal.reconcilePin(async (pending) => {
    const cid = lasagnaRawSha256Cid(pending.bytes);
    const publicGatewayUrl = `${normalizeBase(ipfs.publicGatewayUrl)}/${cid}`;
    const localGatewayUrl = `${normalizeBase(ipfs.localGatewayUrl)}/${cid}`;
    const response = await fetch(publicGatewayUrl, {
      cache: "no-store",
      headers: { accept: pending.mimeType, "user-agent": "wtfos-pasta-lasagna-restart" },
      signal: AbortSignal.timeout(ipfs.requestTimeoutMs),
    });
    if (response.status === 404 || response.status === 410) return { status: "absent" as const };
    if (!response.ok) throw new Error(`Lasagna restart IPFS lookup returned HTTP ${response.status}`);
    const received = new Uint8Array(await response.arrayBuffer());
    assert.equal(received.byteLength, pending.bytes.byteLength, "Lasagna restart IPFS byte length differs");
    assert.equal(sha256(received), pending.sha256, "Lasagna restart IPFS bytes differ");
    return {
      status: "present" as const,
      proof: {
        cid,
        uri: `ipfs://${cid}`,
        fileName: pending.fileName,
        mimeType: pending.mimeType,
        byteLength: pending.bytes.byteLength,
        sha256: pending.sha256,
        localGatewayUrl,
        publicGatewayUrl,
        publicGatewayVerified: true as const,
        verificationAttempts: 1,
      },
    };
  });
}

async function requireFreshAppOutputDirectory(
  runRoot: string,
): Promise<{ appRoot: string; runId: string; existing: boolean }> {
  const runId = path.basename(path.resolve(runRoot));
  if (!SAFE_RUN_ID.test(runId)) {
    block("Lasagna proof run directory must end in a safe run id", [
      "Use a final directory name containing only lowercase letters, digits, dots, underscores, and hyphens.",
    ]);
  }
  const appRoot = path.join(path.resolve(runRoot), "lasagna");
  try {
    const info = await stat(appRoot);
    if (!info.isDirectory()) throw new Error(`Lasagna output is not a directory: ${appRoot}`);
    return { appRoot, runId, existing: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { appRoot, runId, existing: false };
}

async function readContractArtifact(): Promise<unknown[]> {
  const code = JSON.parse(await readFile(CONTRACT_ARTIFACT_PATH, "utf8"));
  assert.ok(Array.isArray(code), "Lasagna contract artifact must be a Michelson JSON array");
  return code;
}

export async function loadLasagnaReferenceTokens(
  runRoot: string,
  runId: string,
): Promise<LasagnaReferenceToken[]> {
  const references: LasagnaReferenceToken[] = [];
  for (const app of REFERENCE_APPS) {
    const manifestPath = path.join(runRoot, app, "manifest.json");
    let manifest: any;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      block("Lasagna needs the fresh publisher proofs before it can curate them", [
        `Missing or invalid \`${manifestPath}\`: ${error instanceof Error ? error.message : String(error)}.`,
        "Run the six token-publisher UI-live lanes in this proof directory before Lasagna.",
      ]);
    }
    assert.equal(manifest?.schema, "pastaprotocol-app-proof@1", `${app} proof schema differs`);
    assert.equal(manifest?.app, app, `${app} manifest app differs`);
    assert.equal(manifest?.runId, runId, `${app} proof run id differs`);
    assert.equal(manifest?.network?.name, "shadownet", `${app} proof is not Shadownet`);
    assert.equal(manifest?.network?.chainId, SHADOWNET_CHAIN_ID, `${app} proof chain id differs`);
    assert.ok(Array.isArray(manifest?.tokens) && manifest.tokens.length > 0, `${app} proof has no token`);
    const token = manifest.tokens[0];
    assert.equal(validateContractAddress(token?.contractAddress), ValidationResult.VALID);
    assert.ok(
      Array.isArray(manifest?.contracts)
        && manifest.contracts.some((contract: { address?: unknown }) => contract?.address === token.contractAddress),
      `${app} token contract is not evidenced by its accepted manifest`,
    );
    const tokenId = Number(token?.tokenId);
    assert.ok(Number.isSafeInteger(tokenId) && tokenId >= 0, `${app} token id is invalid`);
    assert.equal(typeof token?.id, "string", `${app} token record id is missing`);
    assert.equal(typeof token?.artifactUri, "string", `${app} token artifact URI is missing`);
    assert.ok(String(token.artifactUri).startsWith("ipfs://"), `${app} token artifact is not IPFS`);
    const explorerUrl = new URL(String(token?.explorerUrl));
    assert.equal(explorerUrl.protocol, "https:");
    assert.equal(explorerUrl.hostname, "shadownet.tzkt.io");
    assert.ok(explorerUrl.pathname.includes(token.contractAddress));
    assert.ok(explorerUrl.pathname.includes(`/tokens/${tokenId}`));
    references.push({
      app,
      contract: token.contractAddress,
      token_id: tokenId,
      tokenRecordId: token.id,
      explorerUrl: explorerUrl.href,
      artifactUri: token.artifactUri,
    });
  }
  return references;
}

function buildReferencePackage(references: LasagnaReferenceToken[], runId: string) {
  assert.equal(references.length, REFERENCE_APPS.length);
  const pkg = buildCollectionPackage({
    targetApp: "lasagna",
    title: "Lasagna UI-LIVE Cross-Pasta Exhibition",
    description: "A fresh Shadownet exhibition of tokens produced by this Pasta Protocol proof run.",
    symbol: "LSGUI",
    relationship: {
      parent_contract: references[0].contract,
      collection_group: `${runId}-lasagna-exhibition`,
    },
    items: references.map((reference) => ({
      name: `${reference.app} proof token`,
      description: `Fresh ${reference.app} token curated by the Lasagna proof lane.`,
      artifactUri: reference.artifactUri,
      tokenMetadata: { contract: reference.contract, tokenId: reference.token_id },
      tags: ["lasagna", "ui-live", "shadownet", reference.app],
    })),
  });
  const validation = validateCheasePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  return pkg;
}

function buildOriginationStorage(administrator: string, metadataUri: string) {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(metadataUri));
  return {
    administrator,
    pending_administrator: null,
    metadata,
    curators: new MichelsonMap(),
    revisions: new MichelsonMap(),
    revision_count: 0,
    current_revision: null,
  };
}

function assertEmptyMichelsonMap(value: unknown, label: string): void {
  assert.ok(value instanceof MichelsonMap, `${label} must be a MichelsonMap`);
  assert.equal([...value.entries()].length, 0, `${label} must begin empty`);
}

function validateBrowserOrigination(
  input: { code: unknown; storage: unknown },
  expectedCodeHash: string,
  creatorAddress: string,
): string {
  assert.equal(hashJsonForBridge(input.code), expectedCodeHash, "browser requested an unexpected Lasagna artifact");
  assert.ok(input.storage && typeof input.storage === "object" && !Array.isArray(input.storage));
  const storage = input.storage as Record<string, unknown>;
  assert.equal(storage.administrator, creatorAddress);
  assert.equal(storage.pending_administrator, null);
  assert.equal(storage.revision_count, 0);
  assert.equal(storage.current_revision, null);
  assert.ok(storage.metadata instanceof MichelsonMap);
  const metadataEntries = [...storage.metadata.entries()];
  assert.equal(metadataEntries.length, 1);
  assert.equal(metadataEntries[0][0], "");
  const metadataUri = hexToUtf8(String(metadataEntries[0][1]));
  assert.ok(metadataUri.startsWith("ipfs://"), "Lasagna registry metadata must use IPFS");
  assertEmptyMichelsonMap(storage.curators, "curators");
  assertEmptyMichelsonMap(storage.revisions, "revisions");
  return metadataUri;
}

function sameItems(
  actual: unknown,
  expected: Array<{ contract: string; token_id: number }>,
): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return actual.every((item, index) =>
    item?.contract === expected[index].contract &&
    Number(item?.token_id) === expected[index].token_id);
}

function createCreatorCallValidator(
  curatorAddress: string,
  revisionOneItems: Array<{ contract: string; token_id: number }>,
  onRevisionUri: (uri: string) => void,
  initialPhase = 0,
): {
  validate(input: { contractAddress: string; entrypoint: string; payload: unknown }): void;
  assertComplete(): void;
} {
  const expectedEntrypoints = ["add_curator", "publish_revision", "remove_curator"];
  assert.ok(
    Number.isSafeInteger(initialPhase) && initialPhase >= 0 && initialPhase <= expectedEntrypoints.length,
    "Lasagna recovered creator call phase is invalid",
  );
  let phase = initialPhase;
  return {
    validate(input) {
      assert.equal(input.entrypoint, expectedEntrypoints[phase], `unexpected Lasagna creator call at phase ${phase + 1}`);
      if (input.entrypoint === "add_curator" || input.entrypoint === "remove_curator") {
        assert.equal(input.payload, curatorAddress);
      } else {
        assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
        const payload = input.payload as Record<string, unknown>;
        assert.ok(sameItems(payload.items, revisionOneItems), "creator revision items differ");
        const uri = hexToUtf8(String(payload.metadata_uri || ""));
        assert.ok(uri.startsWith("ipfs://"), "creator revision metadata must use IPFS");
        onRevisionUri(uri);
      }
      phase += 1;
    },
    assertComplete() {
      assert.equal(phase, expectedEntrypoints.length, "creator did not complete Lasagna curation sequence");
    },
  };
}

function createCuratorCallValidator(
  revisionZeroItems: Array<{ contract: string; token_id: number }>,
  onRevisionUri: (uri: string) => void,
  initialPhase = 0,
): {
  validate(input: { contractAddress: string; entrypoint: string; payload: unknown }): void;
  assertComplete(): void;
} {
  const expectedEntrypoints = ["publish_revision", "set_current_revision"];
  assert.ok(
    Number.isSafeInteger(initialPhase) && initialPhase >= 0 && initialPhase <= expectedEntrypoints.length,
    "Lasagna recovered curator call phase is invalid",
  );
  let phase = initialPhase;
  return {
    validate(input) {
      assert.equal(input.entrypoint, expectedEntrypoints[phase], `unexpected Lasagna curator call at phase ${phase + 1}`);
      if (input.entrypoint === "publish_revision") {
        assert.ok(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
        const payload = input.payload as Record<string, unknown>;
        assert.ok(sameItems(payload.items, revisionZeroItems), "curator revision items differ");
        const uri = hexToUtf8(String(payload.metadata_uri || ""));
        assert.ok(uri.startsWith("ipfs://"), "curator revision metadata must use IPFS");
        onRevisionUri(uri);
      } else {
        assert.equal(Number(input.payload), 0, "curator must roll current revision back to zero");
      }
      phase += 1;
    },
    assertComplete() {
      assert.equal(phase, expectedEntrypoints.length, "curator did not complete Lasagna curation sequence");
    },
  };
}

function nat(value: unknown, label: string): number {
  const text = value && typeof value === "object" && "toString" in value
    ? String((value as { toString(): string }).toString())
    : String(value ?? "0");
  const output = Number(text);
  assert.ok(Number.isSafeInteger(output) && output >= 0, `${label} is not a natural number`);
  return output;
}

async function mapGet(map: unknown, key: unknown): Promise<unknown> {
  assert.ok(map && typeof map === "object" && "get" in map && typeof (map as { get?: unknown }).get === "function");
  return (map as { get(key: unknown): unknown | Promise<unknown> }).get(key);
}

export async function projectLasagnaUiLiveStorage(rawStorage: unknown): Promise<{
  revision_count: number;
  current_revision: number | null;
  revisions: MichelsonMap<number, unknown>;
}> {
  assert.ok(
    rawStorage && typeof rawStorage === "object" && !Array.isArray(rawStorage),
    "Lasagna UI-live storage must be an object",
  );
  const storage = rawStorage as Record<string, unknown>;
  const revisionCount = nat(storage.revision_count, "Lasagna UI-live revision_count");
  const currentRevision = storage.current_revision == null
    ? null
    : nat(storage.current_revision, "Lasagna UI-live current_revision");
  const revisions = new MichelsonMap<number, unknown>();
  if (currentRevision !== null) {
    assert.ok(currentRevision < revisionCount, "Lasagna UI-live current revision is outside revision_count");
    const selectedRevision = await mapGet(storage.revisions, currentRevision);
    assert.ok(selectedRevision !== undefined && selectedRevision !== null, "Lasagna UI-live current revision is absent");
    revisions.set(currentRevision, selectedRevision);
  }
  return {
    revision_count: revisionCount,
    current_revision: currentRevision,
    revisions,
  };
}

export function createLasagnaUiLiveStorageProjector(
  replayPublicationRevisionId: number | null,
): (rawStorage: unknown) => Promise<{
  revision_count: number;
  current_revision: number | null;
  revisions: MichelsonMap<number, unknown>;
}> {
  assert.ok(
    replayPublicationRevisionId === null
      || (Number.isSafeInteger(replayPublicationRevisionId) && replayPublicationRevisionId >= 0),
    "Lasagna replay publication revision id is invalid",
  );
  let replaySnapshotPending = replayPublicationRevisionId !== null;
  return async (rawStorage) => {
    if (!replaySnapshotPending) return projectLasagnaUiLiveStorage(rawStorage);
    replaySnapshotPending = false;
    assert.ok(rawStorage && typeof rawStorage === "object" && !Array.isArray(rawStorage));
    const storage = rawStorage as Record<string, unknown>;
    const indexedRevisionCount = nat(storage.revision_count, "Lasagna replay revision_count");
    assert.ok(
      indexedRevisionCount > replayPublicationRevisionId!,
      "Lasagna replay publication is not present in current storage",
    );
    const previousRevision = replayPublicationRevisionId! === 0
      ? null
      : replayPublicationRevisionId! - 1;
    const revisions = new MichelsonMap<number, unknown>();
    if (previousRevision !== null) {
      const selectedRevision = await mapGet(storage.revisions, previousRevision);
      assert.ok(selectedRevision !== undefined && selectedRevision !== null, "Lasagna replay previous revision is absent");
      revisions.set(previousRevision, selectedRevision);
    }
    return {
      revision_count: replayPublicationRevisionId!,
      current_revision: previousRevision,
      revisions,
    };
  };
}

function normalizeRevision(value: unknown, id: number): RevisionState {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `revision ${id} is absent`);
  const revision = value as Record<string, unknown>;
  assert.equal(typeof revision.curator, "string");
  const metadataUri = hexToUtf8(String(revision.metadata_uri || ""));
  assert.ok(metadataUri.startsWith("ipfs://"));
  assert.ok(Array.isArray(revision.items));
  return {
    id,
    curator: revision.curator as string,
    metadataUri,
    items: (revision.items as Array<Record<string, unknown>>).map((item) => ({
      contract: String(item.contract),
      token_id: nat(item.token_id, `revision ${id} token id`),
    })),
  };
}

async function readAndAssertFinalState(
  tezos: TezosToolkit,
  contractAddress: string,
  creatorAddress: string,
  curatorAddress: string,
  revisionZeroItems: Array<{ contract: string; token_id: number }>,
  revisionOneItems: Array<{ contract: string; token_id: number }>,
  revisionZeroUri: string,
  revisionOneUri: string,
): Promise<ExhibitionFinalState> {
  await assertShadownet(tezos, "Lasagna final storage verification");
  const contract = await tezos.contract.at(contractAddress);
  const storage = await contract.storage() as Record<string, unknown>;
  const revisionCount = nat(storage.revision_count, "revision_count");
  const currentRevision = nat(storage.current_revision, "current_revision");
  const curatorEntry = await mapGet(storage.curators, curatorAddress);
  const revisionZero = normalizeRevision(await mapGet(storage.revisions, 0), 0);
  const revisionOne = normalizeRevision(await mapGet(storage.revisions, 1), 1);
  assert.equal(storage.administrator, creatorAddress);
  assert.equal(storage.pending_administrator, null);
  assert.equal(revisionCount, 2);
  assert.equal(currentRevision, 0);
  assert.equal(curatorEntry, undefined);
  assert.equal(revisionZero.curator, curatorAddress);
  assert.equal(revisionOne.curator, creatorAddress);
  assert.equal(revisionZero.metadataUri, revisionZeroUri);
  assert.equal(revisionOne.metadataUri, revisionOneUri);
  assert.ok(sameItems(revisionZero.items, revisionZeroItems));
  assert.ok(sameItems(revisionOne.items, revisionOneItems));
  return {
    administrator: creatorAddress,
    pendingAdministrator: null,
    revisionCount: 2,
    currentRevision: 0,
    curatorActive: false,
    revisions: [revisionZero, revisionOne],
  };
}

function validateReceiptIdentifiers(
  creatorReceipts: PastaUiLivePublicReceipt[],
  curatorReceipts: PastaUiLivePublicReceipt[],
  creatorAddress: string,
  curatorAddress: string,
): { contractAddress: string; operationReceipts: OperationReceipt[] } {
  const origination = creatorReceipts.find((receipt) => receipt.action === "originate");
  assert.ok(origination?.contractAddress, "Lasagna origination receipt is missing its KT1");
  assert.equal(validateContractAddress(origination.contractAddress), ValidationResult.VALID);
  const isOperationReceipt = (receipt: PastaUiLivePublicReceipt): receipt is OperationReceipt =>
    (receipt.action === "originate" || receipt.action === "call" || receipt.action === "batch")
    && typeof receipt.operationHash === "string"
    && typeof receipt.signerAddress === "string"
    && typeof receipt.contractAddress === "string";
  const creatorOperations = creatorReceipts.filter(isOperationReceipt);
  const curatorOperations = curatorReceipts.filter(isOperationReceipt);
  assert.deepEqual(
    creatorOperations.map((receipt) => receipt.entrypoints?.[0] || receipt.action),
    ["originate", "add_curator", "publish_revision", "remove_curator"],
  );
  assert.deepEqual(
    curatorOperations.map((receipt) => receipt.entrypoints?.[0]),
    ["publish_revision", "set_current_revision"],
  );
  for (const receipt of creatorOperations) {
    assert.equal(receipt.signerAddress, creatorAddress, "creator operation receipt has the wrong signer");
  }
  for (const receipt of curatorOperations) {
    assert.equal(receipt.signerAddress, curatorAddress, "curator operation receipt has the wrong signer");
  }
  const operationReceipts = [
    creatorOperations[0],
    creatorOperations[1],
    curatorOperations[0],
    creatorOperations[2],
    curatorOperations[1],
    creatorOperations[3],
  ];
  assert.equal(operationReceipts.length, 6);
  assert.equal(new Set(operationReceipts.map((receipt) => receipt.operationHash)).size, 6);
  for (const receipt of operationReceipts) {
    assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
    assert.equal(receipt.contractAddress, origination.contractAddress);
    assert.equal(validateOperation(receipt.operationHash), ValidationResult.VALID);
  }
  return { contractAddress: origination.contractAddress, operationReceipts };
}

async function writePinnedMetadataArtifacts(
  appRoot: string,
  records: PinnedMetadataRecord[],
): Promise<WrittenArtifact[]> {
  const creatorRecords = records.filter((record) => record.actor === "creator");
  const curatorRecords = records.filter((record) => record.actor === "curator");
  assert.equal(creatorRecords.length, 2, "creator must pin registry metadata and revision one");
  assert.equal(curatorRecords.length, 1, "curator must pin revision zero");
  assert.equal(creatorRecords[0].proof.fileName, "exhibition.json");
  assert.equal(creatorRecords[1].proof.fileName, "revision.json");
  assert.equal(curatorRecords[0].proof.fileName, "revision.json");
  const definitions = [
    {
      record: creatorRecords[0],
      id: "lasagna-registry-metadata",
      kind: "registry-metadata",
      path: "artifacts/lasagna-registry-metadata.json",
    },
    {
      record: curatorRecords[0],
      id: "lasagna-revision-0-metadata",
      kind: "exhibition-metadata",
      path: "artifacts/lasagna-revision-0-metadata.json",
    },
    {
      record: creatorRecords[1],
      id: "lasagna-revision-1-metadata",
      kind: "exhibition-metadata",
      path: "artifacts/lasagna-revision-1-metadata.json",
    },
  ];
  const artifacts: WrittenArtifact[] = [];
  for (const definition of definitions) {
    const bytes = deterministicJsonBytes(definition.record.value);
    assert.equal(sha256(bytes), definition.record.proof.sha256, `${definition.id} pin bytes differ`);
    assert.equal(definition.record.proof.publicGatewayVerified, true, `${definition.id} gateway is unverified`);
    await writeFile(path.join(appRoot, definition.path), bytes);
    artifacts.push({
      id: definition.id,
      kind: definition.kind,
      path: definition.path,
      sha256: definition.record.proof.sha256,
      ipfsUri: definition.record.proof.uri,
      gatewayUrl: definition.record.proof.publicGatewayUrl,
      retrievedSha256: definition.record.proof.sha256,
    });
  }
  return artifacts;
}

const LASAGNA_UI_FAILURE_PREFIXES = [
  "connect failed:",
  "deploy failed:",
  "publish failed:",
  "curator op failed:",
  "set current failed:",
] as const;

async function waitForLog(page: Page, expected: string, timeout = 300_000): Promise<void> {
  await page.locator("#log").waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ text, failurePrefixes }) => {
      const log = document.getElementById("log")?.textContent || "";
      return log.includes(text) || failurePrefixes.some((prefix) => log.includes(prefix));
    },
    { text: expected, failurePrefixes: LASAGNA_UI_FAILURE_PREFIXES },
    { timeout },
  );
  const log = await page.locator("#log").innerText();
  if (!log.includes(expected)) {
    throw new Error(
      `Lasagna Studio failed while waiting for ${JSON.stringify(expected)}; log=${log.slice(-1_500)}`,
    );
  }
}

async function captureStudioStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  capability: string,
  stageName: string,
  expectedLog: string,
  focusSelector = "#log",
  extraEvidence: RequiredDomEvidence[] = [],
): Promise<CapturePastaProofStageResult> {
  await page.locator(focusSelector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "lasagna",
    capability,
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "h1", name: "application", expectedText: "Lasagna" },
      { selector: "#log", name: "stage log", expectedText: expectedLog },
      ...extraEvidence,
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function capturePublicStage(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  contractAddress: string,
): Promise<CapturePastaProofStageResult> {
  await page.locator("#status").scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "lasagna",
    capability: "render current on-chain exhibition in the self-hosted public site",
    stageOrdinal: ordinal,
    stageName: "public exhibition loaded",
    classification: "UI-LIVE",
    requiredEvidence: [
      { selector: "#appLabel", name: "application", expectedText: "Lasagna" },
      { selector: "#contract", name: "registry contract", expectedText: contractAddress },
      { selector: "#itemId", name: "current revision", expectedText: "0" },
      { selector: "#chainState", name: "revision state", expectedText: "2 revisions · 2 works shown" },
      { selector: "#status", name: "load status", expectedText: "On-chain state loaded." },
      { selector: "#actionTitle", name: "public role", expectedText: "On-chain exhibition" },
    ],
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function createProofContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: true,
  });
}

type LasagnaTzktOperationRow = {
  type?: unknown;
  status?: unknown;
  hash?: unknown;
  sender?: { address?: unknown };
  target?: { address?: unknown };
  originatedContract?: { address?: unknown };
  parameter?: { entrypoint?: unknown };
  level?: unknown;
  timestamp?: unknown;
};

function lasagnaTzktOperationRows(value: unknown): LasagnaTzktOperationRow[] {
  const rows = Array.isArray(value) ? value : [value];
  assert.ok(
    rows.length > 0 && rows.every((row) => row && typeof row === "object" && !Array.isArray(row)),
    "TzKT operation response must contain operation objects",
  );
  return rows as LasagnaTzktOperationRow[];
}

export function assertLasagnaTzktOperationApplied(input: {
  rows: unknown;
  assertion: PastaUiLiveAppliedOperationAssertion;
  signerAddress: string;
}): LasagnaTzktOperationRow {
  assert.equal(
    validateOperation(input.assertion.operationHash),
    ValidationResult.VALID,
    "Lasagna operation hash is invalid",
  );
  assert.equal(
    validateAddress(input.signerAddress),
    ValidationResult.VALID,
    "Lasagna operation signer is invalid",
  );
  assert.notEqual(
    input.assertion.action,
    "batch",
    "Lasagna UI-live does not permit batch finality assertions",
  );
  assert.equal(
    validateContractAddress(input.assertion.contractAddress || ""),
    ValidationResult.VALID,
    "Lasagna operation contract address is invalid",
  );

  const signerRows = lasagnaTzktOperationRows(input.rows).filter((row) =>
    row.hash === input.assertion.operationHash &&
    row.sender?.address === input.signerAddress
  );
  assert.equal(
    signerRows.length,
    1,
    "TzKT must expose exactly one Lasagna operation for the exact hash and signer",
  );
  const operation = signerRows[0];
  assert.equal(operation.status, "applied", "Lasagna operation is not applied");
  assert.ok(
    Number.isSafeInteger(Number(operation.level)) && Number(operation.level) > 0,
    "Lasagna operation level is invalid",
  );
  assert.ok(
    typeof operation.timestamp === "string" &&
      Number.isFinite(Date.parse(operation.timestamp)),
    "Lasagna operation timestamp is invalid",
  );

  if (input.assertion.action === "originate") {
    assert.equal(operation.type, "origination", "Lasagna origination action differs from TzKT");
    assert.deepEqual(input.assertion.entrypoints, [], "Lasagna origination cannot claim entrypoints");
    assert.equal(
      operation.originatedContract?.address,
      input.assertion.contractAddress,
      "Lasagna originated address differs from TzKT",
    );
  } else {
    assert.equal(operation.type, "transaction", "Lasagna call action differs from TzKT");
    assert.equal(input.assertion.entrypoints.length, 1, "Lasagna call must claim exactly one entrypoint");
    assert.equal(
      operation.target?.address,
      input.assertion.contractAddress,
      "Lasagna call target differs from TzKT",
    );
    assert.equal(
      operation.parameter?.entrypoint,
      input.assertion.entrypoints[0],
      "Lasagna call entrypoint differs from TzKT",
    );
  }
  return operation;
}

async function verifyLasagnaTzktOperationApplied(input: {
  assertion: PastaUiLiveAppliedOperationAssertion;
  signerAddress: string;
}): Promise<void> {
  const endpoint = input.assertion.action === "originate" ? "originations" : "transactions";
  const url = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/${endpoint}/${encodeURIComponent(input.assertion.operationHash)}`;
  const rows = await pollJson(
    `Lasagna exact-hash ${input.assertion.action} finality`,
    url,
    (value) => {
      try {
        assertLasagnaTzktOperationApplied({ rows: value, ...input });
        return true;
      } catch {
        return false;
      }
    },
  );
  assertLasagnaTzktOperationApplied({ rows, ...input });
}

export async function verifyLasagnaTzktEvidence(input: {
  contractAddress: string;
  creatorAddress: string;
  curatorAddress: string;
  registryMetadataUri: string;
  revisionZeroMetadataUri: string;
  revisionOneMetadataUri: string;
  revisionZeroItems: Array<{ contract: string; token_id: number }>;
  revisionOneItems: Array<{ contract: string; token_id: number }>;
  operationReceipts: OperationReceipt[];
  pollOptions?: { attempts?: number; delayMs?: number; userAgent?: string };
}): Promise<Record<string, unknown>> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const poll = (label: string, url: string, predicate: (json: any) => boolean) =>
    pollJson(label, url, predicate, input.pollOptions);
  const contract = await poll(
    "Lasagna UI-live originated registry",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}`,
    (json) => json?.address === input.contractAddress,
  );
  const storage = await poll(
    "Lasagna UI-live final indexed storage",
    `${base}/contracts/${encodeURIComponent(input.contractAddress)}/storage`,
    (json) =>
      json?.administrator === input.creatorAddress &&
      json?.pending_administrator === null &&
      Number(json?.revision_count) === 2 &&
      Number(json?.current_revision) === 0 &&
      Number(json?.metadata) > 0 &&
      Number(json?.curators) > 0 &&
      Number(json?.revisions) > 0,
  );
  const registryMetadata = await poll(
    "Lasagna UI-live exact registry metadata URI",
    `${base}/bigmaps/${storage.metadata}/keys?active=true&limit=20`,
    (json) => Array.isArray(json) && json.some((entry) =>
      String(entry?.key ?? "") === "" &&
      hexToUtf8(String(entry?.value || "")) === input.registryMetadataUri),
  );
  const revisions = await poll(
    "Lasagna UI-live exact revision history",
    `${base}/bigmaps/${storage.revisions}/keys?active=true&limit=20`,
    (json) => {
      if (!Array.isArray(json)) return false;
      const revisionZero = json.find((entry) => Number(entry?.key) === 0)?.value;
      const revisionOne = json.find((entry) => Number(entry?.key) === 1)?.value;
      return revisionZero?.curator === input.curatorAddress &&
        revisionOne?.curator === input.creatorAddress &&
        hexToUtf8(String(revisionZero?.metadata_uri || "")) === input.revisionZeroMetadataUri &&
        hexToUtf8(String(revisionOne?.metadata_uri || "")) === input.revisionOneMetadataUri &&
        sameItems(revisionZero?.items, input.revisionZeroItems) &&
        sameItems(revisionOne?.items, input.revisionOneItems);
    },
  );
  const activeCurators = await poll(
    "Lasagna UI-live removed curator state",
    `${base}/bigmaps/${storage.curators}/keys?active=true&limit=20`,
    (json) => Array.isArray(json) && !json.some((entry) => entry?.key === input.curatorAddress),
  );

  const operations = [];
  for (const receipt of input.operationReceipts) {
    const family = receipt.action === "originate" ? "originations" : "transactions";
    const assertion: PastaUiLiveAppliedOperationAssertion = {
      action: receipt.action,
      operationHash: receipt.operationHash,
      contractAddress: receipt.contractAddress,
      entrypoints: receipt.entrypoints || [],
    };
    const indexed = await poll(
      `Lasagna UI-live ${family} ${receipt.operationHash}`,
      `${base}/operations/${family}/${encodeURIComponent(receipt.operationHash)}`,
      (json) => {
        try {
          assertLasagnaTzktOperationApplied({
            rows: json,
            assertion,
            signerAddress: receipt.signerAddress,
          });
          return true;
        } catch {
          return false;
        }
      },
    );
    const record = assertLasagnaTzktOperationApplied({
      rows: indexed,
      assertion,
      signerAddress: receipt.signerAddress,
    });
    const targetAddress = record?.target?.address || record?.originatedContract?.address;
    operations.push({
      hash: receipt.operationHash,
      status: record?.status,
      type: record?.type,
      sender: record?.sender?.address,
      target: targetAddress,
      entrypoint: record?.parameter?.entrypoint || null,
      level: record?.level,
    });
  }

  return {
    schema: "pastaprotocol-lasagna-tzkt-index@1",
    contract: {
      address: contract.address,
      kind: contract.kind,
      firstActivity: contract.firstActivity,
      lastActivity: contract.lastActivity,
    },
    actors: {
      creator: input.creatorAddress,
      curator: input.curatorAddress,
      independent: input.creatorAddress !== input.curatorAddress,
    },
    storage: {
      administrator: storage.administrator,
      pendingAdministrator: storage.pending_administrator,
      revisionCount: Number(storage.revision_count),
      currentRevision: Number(storage.current_revision),
      metadataBigMap: Number(storage.metadata),
      curatorsBigMap: Number(storage.curators),
      revisionsBigMap: Number(storage.revisions),
    },
    registryMetadata: registryMetadata.map((entry: any) => ({ key: entry.key, value: entry.value })),
    revisions: revisions.map((entry: any) => ({ key: entry.key, value: entry.value })),
    activeCurators: activeCurators.map((entry: any) => ({ key: entry.key, value: entry.value })),
    operations,
  };
}

export async function runLasagnaUiLive(): Promise<LasagnaUiLiveResult> {
  assertLasagnaUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const { appRoot, runId, existing } = await requireFreshAppOutputDirectory(runRoot);
  const references = await loadLasagnaReferenceTokens(runRoot, runId);
  const handoffPackage = buildReferencePackage(references, runId);
  const revisionZeroItems = references.slice(0, 2).map(({ contract, token_id }) => ({ contract, token_id }));
  const revisionOneItems = references.slice(2).map(({ contract, token_id }) => ({ contract, token_id }));
  const ipfs: IpfsProofConfig = resolveIpfsProofConfig();
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const environment = await signerEnv(rpc.rpcUrl);
  const { creator, creatorSigner, collector: curator, collectorSigner: curatorSigner } =
    await loadSignerPair(environment);
  assert.notEqual(creator.address, curator.address, "Lasagna proof requires separate creator and curator signers");
  assert.equal(validateAddress(creator.address), ValidationResult.VALID);
  assert.equal(validateAddress(curator.address), ValidationResult.VALID);
  const creatorTezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  const curatorTezos = buildToolkit(curatorSigner, rpc.rpcUrl);
  await assertShadownet(creatorTezos, "Lasagna creator startup");
  await assertShadownet(curatorTezos, "Lasagna curator startup");

  const code = await readContractArtifact();
  const placeholderMetadataUri = "ipfs://bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
  let estimate: { suggestedFeeMutez: number | string; burnFeeMutez: number | string };
  try {
    estimate = await creatorTezos.estimate.originate({
      code,
      storage: buildOriginationStorage(creator.address, placeholderMetadataUri),
    } as never) as unknown as typeof estimate;
  } catch (error) {
    if (/subtraction_underflow|balance_too_low|cannot pay|insufficient balance/i.test(errorText(error))) {
      block("Lasagna UI-live creator is underfunded during the no-write origination estimate", [
        `Creator: \`${creator.address}\`.`,
        "The RPC simulation rejected the estimate for insufficient tez. No metadata was pinned and no chain write was attempted.",
      ]);
    }
    throw error;
  }
  const estimatedOriginationMutez = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
  assert.ok(Number.isSafeInteger(estimatedOriginationMutez) && estimatedOriginationMutez >= 0);
  const requiredCreatorBalanceMutez = estimatedOriginationMutez + CREATOR_OPERATION_RESERVE_MUTEZ;
  const [creatorBalanceValue, curatorBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(creator.address),
    curatorTezos.tz.getBalance(curator.address),
  ]);
  const creatorBalanceMutez = Number(creatorBalanceValue.toString());
  const curatorBalanceMutez = Number(curatorBalanceValue.toString());
  if (!Number.isSafeInteger(creatorBalanceMutez) || creatorBalanceMutez < requiredCreatorBalanceMutez) {
    block("Lasagna UI-live creator is underfunded before any pin or chain write", [
      `Creator \`${creator.address}\` has \`${creatorBalanceValue.toString()}\` mutez.`,
      `Estimated origination plus creator operation reserve requires at least \`${requiredCreatorBalanceMutez}\` mutez.`,
      "No exhibition metadata was pinned and no chain write was attempted.",
    ]);
  }
  if (!Number.isSafeInteger(curatorBalanceMutez) || curatorBalanceMutez < CURATOR_OPERATION_RESERVE_MUTEZ) {
    block("Lasagna UI-live curator is underfunded before any pin or chain write", [
      `Curator \`${curator.address}\` has \`${curatorBalanceValue.toString()}\` mutez.`,
      `The independent publish and current-revision lane requires at least \`${CURATOR_OPERATION_RESERVE_MUTEZ}\` mutez.`,
      "No exhibition metadata was pinned and no chain write was attempted.",
    ]);
  }

  const handoffBytes = deterministicJsonBytes(handoffPackage);
  const restartIntent = {
    contractArtifactSha256: sha256(await readFile(CONTRACT_ARTIFACT_PATH)),
    contractCodeSha256: hashJsonForBridge(code),
    referencePackageSha256: sha256(handoffBytes),
  };
  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });
  const checkpointPath = path.join(appRoot, RESTART_CHECKPOINT_PATH);
  const actorAddresses: Record<Actor, string> = { creator: creator.address, curator: curator.address };
  const initialRpcPair = await readLasagnaRestartRpcPair(actorAddresses);
  const authenticateInitialCounters = (counters: Readonly<Record<string, number>>): void => {
    for (const actor of ["creator", "curator"] as const) {
      const current = initialRpcPair[0].counters[actor];
      assert.ok(Number.isSafeInteger(counters[actor]), `Lasagna ${actor} persisted counter is invalid`);
      assert.ok(current >= counters[actor], `Lasagna ${actor} persisted counter is ahead of both approved RPCs`);
    }
  };
  const restartJournal = existing
    ? await PastaProofRestartJournal.open(checkpointPath, {
        app: "lasagna",
        runId,
        actors: actorAddresses,
        plan: LASAGNA_RESTART_PLAN,
        intent: restartIntent,
        authenticateInitialCounters,
      })
    : await PastaProofRestartJournal.create({
        filePath: checkpointPath,
        app: "lasagna",
        runId,
        actors: actorAddresses,
        initialCounters: {
          creator: initialRpcPair[0].counters.creator,
          curator: initialRpcPair[0].counters.curator,
        },
        plan: LASAGNA_RESTART_PLAN,
        intent: restartIntent,
      });

  const expectedCodeHash = hashJsonForBridge(code);
  await reconcileLasagnaPendingPin(restartJournal, ipfs);

  for (const applied of restartJournal.appliedOperations()) {
    const signerAddress = lasagnaRestartActorAddress(actorAddresses, applied.step.actor);
    const family = applied.step.action === "originate" ? "originations" : "transactions";
    const rows = await pollJson(
      `Lasagna restart applied prefix ${applied.receipt.operationHash}`,
      `${normalizeBase(SHADOWNET_TZKT_API)}/operations/${family}/${encodeURIComponent(applied.receipt.operationHash!)}`,
      (value) => {
        try {
          const row = assertLasagnaTzktOperationApplied({
            rows: value,
            assertion: {
              action: applied.step.action!,
              operationHash: applied.receipt.operationHash!,
              contractAddress: applied.receipt.contractAddress,
              entrypoints: applied.receipt.entrypoints ?? [],
            },
            signerAddress,
          }) as any;
          return Number(row?.counter) === applied.expectedCounter;
        } catch {
          return false;
        }
      },
    );
    const row = assertLasagnaTzktOperationApplied({
      rows,
      assertion: {
        action: applied.step.action!,
        operationHash: applied.receipt.operationHash!,
        contractAddress: applied.receipt.contractAddress,
        entrypoints: applied.receipt.entrypoints ?? [],
      },
      signerAddress,
    }) as any;
    assert.equal(Number(row?.counter), applied.expectedCounter, "Lasagna restart applied counter differs");
    if (applied.step.action === "call") {
      const call = (applied.descriptor as any)?.call;
      assert.deepEqual(
        projectLasagnaTzktValue(row?.parameter?.value),
        projectLasagnaTzktValue(call?.payload),
        "Lasagna restart applied payload differs",
      );
    } else {
      const script = await creatorTezos.rpc.getScript(applied.receipt.contractAddress!);
      assertLasagnaRestartScriptIdentity(script.code, code);
    }
  }

  await restartJournal.reconcile((pending) => {
    const signerAddress = lasagnaRestartActorAddress(actorAddresses, pending.step.actor);
    return reconcilePastaProofRestartOperation({
      label: `Lasagna restart ${pending.step.id}`,
      pending,
      signerAddress,
      validateApplied: async (row) => {
        if (pending.step.action === "originate") {
          const validated = assertPastaProofRestartOrigination({ row, pending, signerAddress });
          const script = await creatorTezos.rpc.getScript(validated.contractAddress);
          assertLasagnaRestartScriptIdentity(script.code, code);
          return validated;
        }
        return assertPastaProofRestartTransaction({ row, pending, signerAddress });
      },
    });
  });
  const reconciledRpcPair = await readLasagnaRestartRpcPair(actorAddresses);
  for (const actor of ["creator", "curator"] as const) {
    assert.equal(
      reconciledRpcPair[0].counters[actor],
      restartJournal.expectedCurrentCounter(actor),
      `Lasagna ${actor} counter boundary differs after restart reconciliation`,
    );
    assert.equal(
      reconciledRpcPair.flatMap((snapshot) => snapshot.activeManagerOperations).filter((operation) =>
        operation.source === actorAddresses[actor]).length,
      0,
      `Lasagna ${actor} still has an active manager operation after restart reconciliation`,
    );
  }

  const handoffRelativePath = "artifacts/lasagna-reference-handoff.json";
  await writeFile(path.join(appRoot, handoffRelativePath), handoffBytes);
  const handoffArtifact: WrittenArtifact = {
    id: "lasagna-reference-handoff",
    kind: "prepared-reference-package",
    path: handoffRelativePath,
    sha256: sha256(handoffBytes),
  };

  const pinnedMetadata: PinnedMetadataRecord[] = restartJournal.pinRecords().map((record) => ({
    actor: record.actor === "creator" || record.actor === "curator"
      ? record.actor
      : (() => { throw new Error("Lasagna restart pin actor differs"); })(),
    value: record.value,
    proof: record.proof,
  }));
  let requestedRegistryMetadataUri = pinnedMetadata.find((record) =>
    record.actor === "creator" && record.proof.fileName === "exhibition.json")?.proof.uri ?? "";
  let requestedRevisionZeroUri = pinnedMetadata.find((record) =>
    record.actor === "curator" && record.proof.fileName === "revision.json")?.proof.uri ?? "";
  let requestedRevisionOneUri = pinnedMetadata.find((record) =>
    record.actor === "creator" && record.proof.fileName === "revision.json")?.proof.uri ?? "";
  const appliedAtBrowserStart = restartJournal.appliedOperations();
  const completedCreatorCalls = appliedAtBrowserStart.filter((operation) =>
    operation.step.actor === "creator" && operation.step.action === "call").length;
  const completedCuratorCalls = appliedAtBrowserStart.filter((operation) =>
    operation.step.actor === "curator" && operation.step.action === "call").length;
  const creatorPublicationWasApplied = appliedAtBrowserStart.some((operation) =>
    operation.step.actor === "creator" && operation.step.entrypoint === "publish_revision");
  const curatorPublicationWasApplied = appliedAtBrowserStart.some((operation) =>
    operation.step.actor === "curator" && operation.step.entrypoint === "publish_revision");
  const creatorStorageProjector = createLasagnaUiLiveStorageProjector(
    creatorPublicationWasApplied ? 1 : null,
  );
  const curatorStorageProjector = createLasagnaUiLiveStorageProjector(
    curatorPublicationWasApplied ? 0 : null,
  );
  const creatorCallValidator = createCreatorCallValidator(
    curator.address,
    revisionOneItems,
    (uri) => { requestedRevisionOneUri = uri; },
    completedCreatorCalls,
  );
  const curatorCallValidator = createCuratorCallValidator(
    revisionZeroItems,
    (uri) => { requestedRevisionZeroUri = uri; },
    completedCuratorCalls,
  );
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    ...(restartJournal.contractAddress()
      ? { allowedContractAddresses: new Set([restartJournal.contractAddress()!]) }
      : {}),
    allowedEntrypoints: new Set(["add_curator", "publish_revision", "remove_curator"]),
    initialOperationSequence: restartJournal.completedOperationCount("creator"),
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    assertOperationApplied: (assertion) => verifyLasagnaTzktOperationApplied({
      assertion,
      signerAddress: creator.address,
    }),
    beforeOperationSubmit: async (operation) => {
      await assertLasagnaRestartCounterBoundary(restartJournal, actorAddresses, "creator");
      await restartJournal.beforeOperationSubmit("creator", operation);
    },
    onOperationSubmitted: (operation) => restartJournal.onOperationSubmitted("creator", operation),
    beforePin: (input) => restartJournal.beforePin("creator", input),
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    validateOrigination: (input) => {
      requestedRegistryMetadataUri = validateBrowserOrigination(
        input,
        expectedCodeHash,
        creator.address,
      );
    },
    validateCall: creatorCallValidator.validate,
    projectStorage: creatorStorageProjector,
    onPin: async ({ value, proof }) => {
      await restartJournal.onPin("creator", { proof });
      if (value !== undefined) pinnedMetadata.push({ actor: "creator", value, proof });
    },
    onReceipt: (receipt) => restartJournal.onReceipt("creator", receipt),
  });
  creatorSession.authorizeAfterFundingPreflight({
    balanceMutez: creatorBalanceMutez,
    requiredBalanceMutez: requiredCreatorBalanceMutez,
    estimatedOriginationMutez,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  });

  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: (request) => restartJournal.replayOrHandle("creator", request, () => creatorSession.handle(request)),
  });
  let curatorBridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  let curatorSession: TaquitoPastaUiLiveSession | null = null;
  let browser: Browser | null = null;
  let creatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let curatorMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  let publicMonitor: ReturnType<typeof monitorPastaProofPage> | null = null;
  const screenshots: CapturePastaProofStageResult[] = [];
  const startedAt = new Date().toISOString();
  let finalState: ExhibitionFinalState | null = null;
  let siteZipArtifact: WrittenArtifact | null = null;
  try {
    browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
    const creatorContext = await createProofContext(browser);
    await creatorContext.addInitScript({
      content: `sessionStorage.setItem(${JSON.stringify(HANDOFF_KEY)}, ${JSON.stringify(JSON.stringify(handoffPackage)).replace(/</g, "\\u003c")});`,
    });
    const creatorPage = await creatorContext.newPage();
    creatorMonitor = monitorPastaProofPage(creatorPage);
    const creatorUrl = `${creatorBridge.origin}/creation-tools/lasagna/index.html?handoff=chease-package&handoffKey=${encodeURIComponent(HANDOFF_KEY)}`;
    await creatorPage.goto(creatorUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await creatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(creatorPage, creatorBridge, "UI-LIVE");
    await creatorPage.selectOption("#network", "shadownet");
    await creatorPage.selectOption("#pinProvider", "node");
    await creatorPage.fill("#pinNode", ipfs.apiUrl);
    await creatorPage.fill("#exStatement", "Initial cross-Pasta exhibition assembled through the actual Lasagna studio.");
    await waitForLog(creatorPage, "from CH-EASE handoff", 30_000);
    await creatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "6");
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      1,
      "consume fresh publisher references from CH-EASE",
      "handoff configured",
      "from CH-EASE handoff",
      "#refs",
      [{ selector: "#sumCount", name: "reference count", expectedText: "6" }],
    ));

    await creatorPage.click("[data-draft-save]");
    await creatorPage.waitForFunction(() => document.querySelector("[data-draft-status]")?.textContent?.startsWith("Saved"));
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      2,
      "save a recoverable local exhibition draft",
      "draft saved",
      "from CH-EASE handoff",
      "[data-draft-status]",
      [{ selector: "[data-draft-status]", name: "draft state", expectedText: "Saved" }],
    ));

    await creatorPage.click("#btnConnect", { noWaitAfter: true });
    await waitForLog(creatorPage, `connected ${creator.address} on shadownet`);
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      3,
      "connect the registry creator",
      "creator connected",
      `connected ${creator.address} on shadownet`,
      "#account",
      [{ selector: "#account", name: "creator account", expectedText: creator.address.slice(0, 7) }],
    ));

    await creatorPage.click("#btnDeploy");
    await waitForLog(creatorPage, "originating exhibition contract");
    await creatorPage.waitForFunction(() => (window as any).__pastaUiLiveBridge?.pins?.length >= 1);
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      4,
      "pin durable registry metadata",
      "registry metadata pinned",
      "originating exhibition contract",
    ));
    await waitForLog(creatorPage, "exhibition deployed:");
    const origination = restartJournal.operationReceipts().find((receipt) => receipt.action === "originate");
    assert.ok(origination?.contractAddress && origination.operationHash);
    const contractAddress = origination.contractAddress;
    assert.equal(await creatorPage.locator("#contractKt").inputValue(), contractAddress);
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      5,
      "originate a fresh exhibition registry",
      "registry originated",
      `exhibition deployed: ${contractAddress}`,
      "#contractKt",
    ));

    await creatorPage.click("[data-contract-verify]");
    await creatorPage.waitForFunction(
      (address) => document.querySelector("[data-contract-status]")?.textContent?.includes(`Verified ${address}`),
      contractAddress,
    );
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      6,
      "remember and verify the registry on chain",
      "registry verified",
      `exhibition deployed: ${contractAddress}`,
      "[data-contract-status]",
      [
        { selector: "[data-contract-address]", name: "remembered registry", expectedText: contractAddress },
        { selector: "[data-contract-status]", name: "verification state", expectedText: `Verified ${contractAddress}` },
      ],
    ));

    await creatorPage.fill("#curatorAddr", curator.address);
    await creatorPage.click("#btnAddCurator");
    await waitForLog(creatorPage, "curator added ✓");
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      7,
      "grant an independent curator",
      "curator added",
      "curator added ✓",
      "#curatorAddr",
    ));

    curatorSession = new TaquitoPastaUiLiveSession({
      tezos: curatorTezos,
      signerAddress: curator.address,
      expectedChainId: SHADOWNET_CHAIN_ID,
      allowedContractAddresses: new Set([contractAddress]),
      allowedEntrypoints: new Set(["publish_revision", "set_current_revision"]),
      initialOperationSequence: restartJournal.completedOperationCount("curator"),
      assertExpectedChain: async (stage) => {
        await assertShadownet(curatorTezos, stage);
        return SHADOWNET_CHAIN_ID;
      },
      assertOperationApplied: (assertion) => verifyLasagnaTzktOperationApplied({
        assertion,
        signerAddress: curator.address,
      }),
      beforeOperationSubmit: async (operation) => {
        await assertLasagnaRestartCounterBoundary(restartJournal, actorAddresses, "curator");
        await restartJournal.beforeOperationSubmit("curator", operation);
      },
      onOperationSubmitted: (operation) => restartJournal.onOperationSubmitted("curator", operation),
      beforePin: (input) => restartJournal.beforePin("curator", input),
      pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
      validateOrigination: () => {
        throw new Error("Lasagna curator session cannot originate contracts");
      },
      validateCall: curatorCallValidator.validate,
      projectStorage: curatorStorageProjector,
      onPin: async ({ value, proof }) => {
        await restartJournal.onPin("curator", { proof });
        if (value !== undefined) pinnedMetadata.push({ actor: "curator", value, proof });
      },
      onReceipt: (receipt) => restartJournal.onReceipt("curator", receipt),
    });
    curatorSession.authorizeAfterFundingPreflight({
      balanceMutez: curatorBalanceMutez,
      requiredBalanceMutez: CURATOR_OPERATION_RESERVE_MUTEZ,
      estimatedOriginationMutez: 0,
      operationReserveMutez: CURATOR_OPERATION_RESERVE_MUTEZ,
    });
    curatorBridge = await startPastaUiLiveLoopbackServer({
      staticRoot: STATIC_ROOT,
      handleAction: (request) => restartJournal.replayOrHandle("curator", request, () => curatorSession!.handle(request)),
    });
    const curatorContext = await createProofContext(browser);
    const curatorPage = await curatorContext.newPage();
    curatorMonitor = monitorPastaProofPage(curatorPage);
    await curatorPage.goto(`${curatorBridge.origin}/creation-tools/lasagna/index.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await curatorPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(curatorPage, curatorBridge, "UI-LIVE");
    await curatorPage.selectOption("#network", "shadownet");
    await curatorPage.selectOption("#pinProvider", "node");
    await curatorPage.fill("#pinNode", ipfs.apiUrl);
    await curatorPage.setInputFiles("#importPkg", {
      name: "lasagna-reference-handoff.json",
      mimeType: "application/json",
      buffer: Buffer.from(handoffBytes),
    });
    await waitForLog(curatorPage, "from CH-EASE file", 30_000);
    await curatorPage.fill("#refs", revisionZeroItems.map((item) => `${item.contract}, ${item.token_id}`).join("\n"));
    await curatorPage.click("#btnParse");
    await curatorPage.fill("#exStatement", "Independent curator publication of the first two fresh proof tokens.");
    await curatorPage.fill("#contractKt", contractAddress);
    await curatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "2");
    screenshots.push(await captureStudioStage(
      curatorPage,
      curatorMonitor,
      runRoot,
      8,
      "import a portable CH-EASE package for independent curation",
      "curator package imported",
      "from CH-EASE file",
      "#refs",
      [{ selector: "#sumCount", name: "revision zero references", expectedText: "2" }],
    ));

    await curatorPage.click("#btnConnect", { noWaitAfter: true });
    await waitForLog(curatorPage, `connected ${curator.address} on shadownet`);
    screenshots.push(await captureStudioStage(
      curatorPage,
      curatorMonitor,
      runRoot,
      9,
      "connect the independent curator",
      "curator connected",
      `connected ${curator.address} on shadownet`,
      "#account",
      [{ selector: "#account", name: "curator account", expectedText: curator.address.slice(0, 7) }],
    ));

    await curatorPage.click("#btnPublish");
    await waitForLog(curatorPage, "revision #0 published ✓");
    screenshots.push(await captureStudioStage(
      curatorPage,
      curatorMonitor,
      runRoot,
      10,
      "pin and publish append-only revision zero",
      "revision zero published",
      "revision #0 published ✓",
    ));

    const revisionOneCsv = Buffer.from(
      revisionOneItems.map((item) => `${item.contract}, ${item.token_id}`).join("\n"),
      "utf8",
    );
    await creatorPage.setInputFiles("#importRefs", {
      name: "lasagna-revision-one.csv",
      mimeType: "text/csv",
      buffer: revisionOneCsv,
    });
    await creatorPage.waitForFunction(() => document.getElementById("sumCount")?.textContent === "4");
    await creatorPage.fill("#exStatement", "Administrator publication of the remaining four fresh Pasta proof tokens.");
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      11,
      "import an ordered reference list for revision one",
      "revision one imported",
      "curator added ✓",
      "#refs",
      [{ selector: "#sumCount", name: "revision one references", expectedText: "4" }],
    ));

    await creatorPage.click("#btnPublish");
    await waitForLog(creatorPage, "revision #1 published ✓");
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      12,
      "pin and publish append-only revision one",
      "revision one published",
      "revision #1 published ✓",
    ));

    await curatorPage.fill("#currentRid", "0");
    await curatorPage.click("#btnSetCurrent");
    await waitForLog(curatorPage, "current revision set to #0 ✓");
    screenshots.push(await captureStudioStage(
      curatorPage,
      curatorMonitor,
      runRoot,
      13,
      "move the public current pointer to an earlier revision",
      "current revision rolled back",
      "current revision set to #0 ✓",
      "#currentRid",
    ));

    await creatorPage.click("#btnRemoveCurator");
    await waitForLog(creatorPage, "curator removed ✓");
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      14,
      "remove the independent curator after publication",
      "curator removed",
      "curator removed ✓",
      "#curatorAddr",
    ));

    const zipRelativePath = "artifacts/lasagna-self-hosted-site.zip";
    const downloadPromise = creatorPage.waitForEvent("download", { timeout: 30_000 });
    await creatorPage.click("#btnExportSite");
    const download = await downloadPromise;
    const zipPath = path.join(appRoot, zipRelativePath);
    await download.saveAs(zipPath);
    const zipBytes = await readFile(zipPath);
    assert.ok(zipBytes.length > 1000, "Lasagna exported site zip is unexpectedly small");
    assert.equal(zipBytes.subarray(0, 2).toString("ascii"), "PK", "Lasagna site export is not a ZIP");
    await creatorPage.waitForFunction(() => document.getElementById("exportSiteStatus")?.textContent?.includes("Downloaded site zip"));
    siteZipArtifact = {
      id: "lasagna-self-hosted-site",
      kind: "self-hosted-site-package",
      path: zipRelativePath,
      sha256: sha256(zipBytes),
    };
    screenshots.push(await captureStudioStage(
      creatorPage,
      creatorMonitor,
      runRoot,
      15,
      "export the portable self-hosted exhibition page",
      "self-hosted site exported",
      "curator removed ✓",
      "#exportSiteStatus",
      [{ selector: "#exportSiteStatus", name: "export state", expectedText: "Downloaded site zip" }],
    ));

    creatorCallValidator.assertComplete();
    curatorCallValidator.assertComplete();
    finalState = await readAndAssertFinalState(
      creatorTezos,
      contractAddress,
      creator.address,
      curator.address,
      revisionZeroItems,
      revisionOneItems,
      requestedRevisionZeroUri,
      requestedRevisionOneUri,
    );

    const publicPage = await creatorContext.newPage();
    publicMonitor = monitorPastaProofPage(publicPage);
    const publicConfig = {
      app: "lasagna",
      label: "Lasagna",
      title: "Lasagna UI-LIVE Cross-Pasta Exhibition",
      description: "Current on-chain revision rendered by the portable Lasagna public site.",
      contract: contractAddress,
      tokenId: 0,
      network: "shadownet",
      ipfsGateway: `${normalizeBase(ipfs.publicGatewayUrl)}/`,
    };
    await publicPage.route("**/pasta.config.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `window.PASTA_SITE_CONFIG = ${JSON.stringify(publicConfig)};`,
      });
    });
    await publicPage.route("**/js/site.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "// deferred by proof runner" });
    });
    await publicPage.goto(`${creatorBridge.origin}/creation-tools/lasagna/site.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await publicPage.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ));
    await installPastaUiLiveBrowserProxy(publicPage, creatorBridge, "UI-LIVE");
    await publicPage.addScriptTag({ content: await readFile(PUBLIC_SITE_SCRIPT_PATH, "utf8") });
    await publicPage.waitForFunction(() => document.getElementById("status")?.textContent === "On-chain state loaded.", null, {
      timeout: 60_000,
    });
    screenshots.push(await capturePublicStage(
      publicPage,
      publicMonitor,
      runRoot,
      16,
      contractAddress,
    ));
  } finally {
    creatorMonitor?.dispose();
    curatorMonitor?.dispose();
    publicMonitor?.dispose();
    await browser?.close();
    await curatorBridge?.close();
    await creatorBridge.close();
  }

  assert.ok(curatorSession, "curator session was not created");
  assert.ok(finalState, "final Lasagna registry state was not verified");
  assert.ok(siteZipArtifact, "Lasagna self-hosted site export was not captured");
  const journalOperationReceipts = restartJournal.operationReceipts();
  const creatorReceipts = journalOperationReceipts.filter((receipt) => receipt.signerAddress === creator.address);
  const curatorReceipts = journalOperationReceipts.filter((receipt) => receipt.signerAddress === curator.address);
  const identifiers = validateReceiptIdentifiers(
    creatorReceipts,
    curatorReceipts,
    creator.address,
    curator.address,
  );
  const metadataArtifacts = await writePinnedMetadataArtifacts(appRoot, pinnedMetadata);
  const registryMetadataArtifact = metadataArtifacts.find((artifact) => artifact.id === "lasagna-registry-metadata");
  const revisionZeroArtifact = metadataArtifacts.find((artifact) => artifact.id === "lasagna-revision-0-metadata");
  const revisionOneArtifact = metadataArtifacts.find((artifact) => artifact.id === "lasagna-revision-1-metadata");
  assert.ok(registryMetadataArtifact?.ipfsUri);
  assert.ok(revisionZeroArtifact?.ipfsUri);
  assert.ok(revisionOneArtifact?.ipfsUri);
  assert.equal(requestedRegistryMetadataUri, registryMetadataArtifact.ipfsUri);
  assert.equal(requestedRevisionZeroUri, revisionZeroArtifact.ipfsUri);
  assert.equal(requestedRevisionOneUri, revisionOneArtifact.ipfsUri);

  const tzktEvidence = await verifyLasagnaTzktEvidence({
    contractAddress: identifiers.contractAddress,
    creatorAddress: creator.address,
    curatorAddress: curator.address,
    registryMetadataUri: registryMetadataArtifact.ipfsUri,
    revisionZeroMetadataUri: revisionZeroArtifact.ipfsUri,
    revisionOneMetadataUri: revisionOneArtifact.ipfsUri,
    revisionZeroItems,
    revisionOneItems,
    operationReceipts: identifiers.operationReceipts,
  });
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/lasagna-ui-live-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);

  const operations = identifiers.operationReceipts.map((operationReceipt) => {
    const entrypoint = operationReceipt.entrypoints?.[0];
    const kind = operationReceipt.action === "originate"
      ? "origination"
      : entrypoint === "publish_revision"
        ? "publish"
        : "manage";
    return {
      kind,
      hash: operationReceipt.operationHash,
      contractAddress: identifiers.contractAddress,
      ...(entrypoint ? { entrypoint } : {}),
      status: "applied",
      explorerUrl: `https://shadownet.tzkt.io/${operationReceipt.operationHash}`,
    };
  });
  const publicationOperation = operations.find((operation) =>
    operation.entrypoint === "publish_revision" && operation.hash === identifiers.operationReceipts[2].operationHash);
  assert.ok(publicationOperation, "Lasagna revision-zero publication operation is missing");
  assert.equal(restartJournal.isComplete(), true, "Lasagna restart journal is not terminal");
  const restartCheckpointBytes = await readFile(path.join(appRoot, RESTART_CHECKPOINT_PATH));
  const restartCheckpointArtifact: WrittenArtifact = {
    id: "lasagna-restart-checkpoint",
    kind: "restart-checkpoint",
    path: RESTART_CHECKPOINT_PATH,
    sha256: sha256(restartCheckpointBytes),
  };
  const completedAt = new Date().toISOString();
  const receipt = {
    schema: "pastaprotocol-lasagna-ui-live-run@1",
    classification: "UI-LIVE",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    startedAt,
    completedAt,
    actors: {
      creator: creator.address,
      curator: curator.address,
      independent: creator.address !== curator.address,
    },
    funding: {
      creator: creatorSession.getFundingAuthorization(),
      curator: curatorSession.getFundingAuthorization(),
    },
    contract: {
      address: identifiers.contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
    },
    references,
    operations,
    bridgeReceipts: { creator: creatorReceipts, curator: curatorReceipts },
    finalState,
    pins: metadataArtifacts,
    selfHostedSite: siteZipArtifact,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidence: { path: tzktRelativePath, sha256: sha256(tzktBytes) },
    restartSafety: {
      checkpoint: restartCheckpointArtifact,
      exactSemanticReplay: true,
      terminalCountersAuthenticated: true,
    },
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/lasagna-ui-live-run.json";
  const receiptPath = path.join(appRoot, receiptRelativePath);
  await writeFile(receiptPath, receiptBytes);

  const localArtifacts: WrittenArtifact[] = [
    handoffArtifact,
    siteZipArtifact,
    ...screenshots.map((capture) => capture.manifestSidecarArtifact),
    restartCheckpointArtifact,
    {
      id: "lasagna-ui-live-tzkt-index",
      kind: "indexer-evidence",
      path: tzktRelativePath,
      sha256: sha256(tzktBytes),
    },
    {
      id: "lasagna-ui-live-run",
      kind: "proof-receipt",
      path: receiptRelativePath,
      sha256: sha256(receiptBytes),
    },
  ];
  const allArtifacts = [...metadataArtifacts, ...localArtifacts];
  const roleEvidence = [{
    kind: "exhibition-publication",
    artifactId: revisionZeroArtifact.id,
    contractAddress: identifiers.contractAddress,
    operationHash: publicationOperation.hash,
    url: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
  }];
  const screenshotStages = screenshots.map((capture) => capture.manifestScreenshot.stage);
  const sidecarIds = screenshots.map((capture) => capture.manifestSidecarArtifact.id);
  const capabilities = [
    {
      id: "prepare-ordered-cross-pasta-exhibition",
      description: "Use the actual Lasagna studio to consume a CH-EASE handoff containing six fresh publisher tokens, validate ordered references, and save a recoverable local draft.",
      evidence: {
        screenshots: screenshotStages.slice(0, 2),
        artifacts: [handoffArtifact.id, ...sidecarIds.slice(0, 2)],
        contracts: [],
        operations: [],
        tokens: [],
        roleEvidence: [],
        urls: references.map((reference) => reference.explorerUrl),
      },
    },
    {
      id: "originate-verify-and-delegate-registry",
      description: "Use the actual Lasagna studio to pin registry metadata, originate a fresh non-FA2 exhibition registry, verify its remembered contract state, and add an independent curator.",
      evidence: {
        screenshots: screenshotStages.slice(2, 7),
        artifacts: [registryMetadataArtifact.id, ...sidecarIds.slice(2, 7)],
        contracts: [identifiers.contractAddress],
        operations: operations.slice(0, 2).map((operation) => operation.hash),
        tokens: [],
        roleEvidence: [],
        urls: [
          `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
          registryMetadataArtifact.gatewayUrl,
        ],
      },
    },
    {
      id: "publish-append-only-curator-and-admin-revisions",
      description: "Use independent curator and administrator sessions in the actual Lasagna studio to import portable references, pin two exact manifests, and publish two ordered append-only exhibition revisions.",
      evidence: {
        screenshots: screenshotStages.slice(7, 12),
        artifacts: [
          revisionZeroArtifact.id,
          revisionOneArtifact.id,
          ...sidecarIds.slice(7, 12),
        ],
        contracts: [identifiers.contractAddress],
        operations: [operations[2].hash, operations[3].hash],
        tokens: [],
        roleEvidence: ["exhibition-publication"],
        urls: [
          revisionZeroArtifact.gatewayUrl,
          revisionOneArtifact.gatewayUrl,
          ...references.map((reference) => reference.explorerUrl),
        ],
      },
    },
    {
      id: "select-current-remove-curator-and-self-host",
      description: "Move the current pointer back to revision zero, remove the curator, export the portable site, render the current registry through the actual public exhibition UI, and independently verify final storage plus every operation through TzKT.",
      evidence: {
        screenshots: screenshotStages.slice(12),
        artifacts: [
          siteZipArtifact.id,
          restartCheckpointArtifact.id,
          ...sidecarIds.slice(12),
          "lasagna-ui-live-tzkt-index",
          "lasagna-ui-live-run",
        ],
        contracts: [identifiers.contractAddress],
        operations: operations.slice(4).map((operation) => operation.hash),
        tokens: [],
        roleEvidence: [],
        urls: [`https://shadownet.tzkt.io/${identifiers.contractAddress}`],
      },
    },
  ];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "lasagna",
    role: "exhibition-registry",
    runId,
    capturedAt: completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    references,
    capabilities,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    contracts: [{
      address: identifiers.contractAddress,
      kind: "exhibition-registry",
      explorerUrl: `https://shadownet.tzkt.io/${identifiers.contractAddress}`,
    }],
    operations,
    tokens: [],
    roleEvidence,
  };
  const referenced = {
    screenshots: new Set(capabilities.flatMap((capability) => capability.evidence.screenshots)),
    artifacts: new Set(capabilities.flatMap((capability) => capability.evidence.artifacts)),
    contracts: new Set(capabilities.flatMap((capability) => capability.evidence.contracts)),
    operations: new Set(capabilities.flatMap((capability) => capability.evidence.operations)),
    tokens: new Set(capabilities.flatMap((capability) => capability.evidence.tokens)),
    roleEvidence: new Set(capabilities.flatMap((capability) => capability.evidence.roleEvidence)),
  };
  assert.deepEqual([...referenced.screenshots].sort(), screenshotStages.sort());
  assert.deepEqual([...referenced.artifacts].sort(), allArtifacts.map((artifact) => artifact.id).sort());
  assert.deepEqual([...referenced.contracts], [identifiers.contractAddress]);
  assert.deepEqual([...referenced.operations], operations.map((operation) => operation.hash));
  assert.deepEqual([...referenced.tokens], []);
  assert.deepEqual([...referenced.roleEvidence], ["exhibition-publication"]);
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  const operationHashes = operations.map((operation) => operation.hash);
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    contractAddress: identifiers.contractAddress,
    operationHashes,
    manifestPath,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
  }, null, 2)}\n`);
  return {
    manifestPath,
    receiptPath,
    contractAddress: identifiers.contractAddress,
    operationHashes,
    screenshots,
  };
}

async function main(): Promise<void> {
  try {
    await runLasagnaUiLive();
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
