#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";
import { chromium, type Browser, type Page } from "playwright";

import {
  availableActions,
  detectPastaContract,
  extractRelationshipMetadata,
  type PastaContractAdapter,
} from "../../shared/pasta-protocol/index";
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
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_TZKT_API,
  signerEnv,
} from "./shadownet-proof-kit";

const EXECUTE_FLAG = "PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MANAGEMENT_RESERVE_MUTEZ = 300_000;
const SIBLING_APPS = [
  "ch-ease",
  "macaroni",
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
] as const;
const CONTRACT_APPS = SIBLING_APPS.filter((app) => app !== "ch-ease") as ContractApp[];

export type ContractApp = Exclude<(typeof SIBLING_APPS)[number], "ch-ease">;

type ValidatedArtifact = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  ipfsUri?: string;
  gatewayUrl?: string;
  retrievedSha256?: string;
};

type ValidatedSiblingManifest = {
  app: (typeof SIBLING_APPS)[number];
  runId: string;
  network: { name: "shadownet"; chainId: string; rpcUrl: string };
  artifacts: ValidatedArtifact[];
  contracts: Array<{ address: string; kind: string; explorerUrl: string }>;
  tokens: Array<{ id: string; contractAddress: string; tokenId: string; explorerUrl: string }>;
};

export type ColanderContractSnapshot = {
  app: ContractApp;
  address: string;
  manifestKind: string;
  explorerUrl: string;
  entrypoints: string[];
  adapterKind: string;
  adapterLabel: string;
  actionIds: string[];
  actionLabels: string[];
  administrator: string | null;
  pendingAdministrator: string | null;
  nextTokenId: number | null;
  tokenCount: number | null;
  revisionCount: number | null;
  currentRevision: number | null;
  metadataHex: string;
  metadataUri: string;
  metadataArtifactId: string;
  metadataArtifactPath: string;
  metadataSha256: string;
  metadataGatewayUrl: string;
  relationship: Record<string, unknown> | null;
};

type TargetCandidate = {
  address: string;
  adapterKind: string;
  actionIds: string[];
};

type BrowserBridgeRequest = {
  action: "connect" | "chain_check" | "contract_read" | "contract_call";
  contractAddress?: string;
  entrypoint?: string;
  payload?: unknown;
};

type WrittenArtifact = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
};

type HarnessServer = {
  origin: string;
  child: ChildProcess;
  close(): Promise<void>;
};

const EXPECTED_ADAPTER: Record<ContractApp, string> = {
  macaroni: "blind_mint_collection",
  spaghetti: "standard_collection",
  gnocchi: "open_edition_collection",
  ravioli: "bundle_collection",
  rotini: "generative_collection",
  penne: "distribution",
  lasagna: "exhibition",
};

const REQUIRED_ACTION: Record<ContractApp, string> = {
  macaroni: "set_pause",
  spaghetti: "mint",
  gnocchi: "open_mint",
  ravioli: "open_pack",
  rotini: "reserve_iteration",
  penne: "claim",
  lasagna: "set_current_revision",
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") {
    const candidate = value as { toNumber?: () => number; toFixed?: () => string; toString?: () => string };
    if (typeof candidate.toNumber === "function") return candidate.toNumber();
    if (typeof candidate.toFixed === "function") return Number(candidate.toFixed());
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function asAddress(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function assertColanderUiLiveExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Colander UI-live execute flag is required", [
      `Set \`${EXECUTE_FLAG}=1\` only after every earlier app has completed in the same fresh proof run.`,
      "Colander signs one real, narrowly allowlisted Shadownet management operation; it never originates a contract or token.",
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Colander UI-live runner only permits Shadownet", [
      "Unset `TEZOS_NETWORK` or set it to `shadownet`; mainnet execution is refused.",
    ]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [
      `Set \`${OUTPUT_ENV}\` to the aggregate proof-run root.`,
    ]);
  }
  for (const key of [
    "PASTA_SHADOWNET_COLANDER_UI_LIVE_CONTRACT",
    "PASTA_SHADOWNET_COLANDER_UI_LIVE_RESUME",
    "PASTA_SHADOWNET_COLANDER_EXISTING_CONTRACT",
  ]) {
    if (environment[key]?.trim()) {
      block("Colander aggregate proof may not resume or substitute a contract", [
        `Unset \`${key}\`; this lane must discover contracts from the fresh same-run sibling manifests.`,
      ]);
    }
  }
}

async function requireFreshAppDirectory(runRoot: string): Promise<{ appRoot: string; runId: string }> {
  const resolvedRunRoot = path.resolve(runRoot);
  const runId = path.basename(resolvedRunRoot);
  if (!SAFE_RUN_ID.test(runId)) {
    block("Colander proof run directory must end in a safe run id", [
      "Use a final directory name containing only lowercase letters, digits, dots, underscores, and hyphens.",
    ]);
  }
  const appRoot = path.join(resolvedRunRoot, "colander");
  try {
    await stat(appRoot);
    block("Colander proof output directory already exists", [
      `Refusing to overwrite \`${appRoot}\`; use a fresh aggregate proof run.`,
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { appRoot, runId };
}

async function loadSiblingManifests(
  runRoot: string,
  runId: string,
): Promise<Map<(typeof SIBLING_APPS)[number], ValidatedSiblingManifest>> {
  const assemblerUrl = pathToFileURL(path.join(root, "scripts/pasta-protocol/assemble-proof-package.mjs")).href;
  const assembler = await import(assemblerUrl) as {
    validateAppManifest(rootDirectory: string, app: string): Promise<ValidatedSiblingManifest>;
  };
  const manifests = new Map<(typeof SIBLING_APPS)[number], ValidatedSiblingManifest>();
  for (const app of SIBLING_APPS) {
    let validated: ValidatedSiblingManifest;
    try {
      validated = await assembler.validateAppManifest(runRoot, app);
    } catch (error) {
      block("Colander requires every earlier app proof in the same run", [
        `The \`${app}\` proof is missing or invalid: ${errorText(error)}.`,
        "Complete CH-EASE, Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna before Colander.",
      ]);
    }
    assert.equal(validated.runId, runId, `${app} run id differs from aggregate directory`);
    assert.equal(validated.network.name, "shadownet", `${app} proof is not Shadownet`);
    assert.equal(validated.network.chainId, SHADOWNET_CHAIN_ID, `${app} proof chain id differs`);
    if (app === "ch-ease") assert.equal(validated.contracts.length, 0, "CH-EASE must remain preparation-only");
    else assert.ok(validated.contracts.length > 0, `${app} proof has no contract to discover`);
    manifests.set(app, validated);
  }
  return manifests;
}

async function validateCompletedColanderManifest(runRoot: string): Promise<void> {
  const assemblerUrl = pathToFileURL(path.join(root, "scripts/pasta-protocol/assemble-proof-package.mjs")).href;
  const assembler = await import(assemblerUrl) as {
    validateAppManifest(rootDirectory: string, app: string): Promise<unknown>;
  };
  await assembler.validateAppManifest(runRoot, "colander");
}

export function selectColanderTarget(app: ContractApp, candidates: TargetCandidate[]): TargetCandidate {
  const matching = candidates.filter((candidate) => candidate.adapterKind === EXPECTED_ADAPTER[app]);
  if (matching.length === 0) {
    throw new Error(`${app} has no contract detected as ${EXPECTED_ADAPTER[app]}`);
  }
  const action = REQUIRED_ACTION[app];
  const capable = matching.filter((candidate) => candidate.actionIds.includes(action));
  if (capable.length === 0) throw new Error(`${app} has no ${EXPECTED_ADAPTER[app]} contract exposing ${action}`);
  capable.sort((left, right) => left.address.localeCompare(right.address));
  return capable[0];
}

async function contractReadCandidate(
  tezos: ReturnType<typeof buildToolkit>,
  address: string,
): Promise<{ address: string; adapter: PastaContractAdapter | null; entrypoints: string[]; actionIds: string[] }> {
  assert.equal(validateContractAddress(address), ValidationResult.VALID, `invalid sibling contract ${address}`);
  const contract = await tezos.contract.at(address);
  const entrypoints = Object.keys((contract as any).entrypoints?.entrypoints ?? {}).sort();
  const adapter = detectPastaContract(entrypoints);
  return {
    address,
    adapter,
    entrypoints,
    actionIds: adapter ? availableActions(adapter, entrypoints).map((action) => action.id) : [],
  };
}

async function resolveTargetSnapshots(
  runRoot: string,
  manifests: Map<(typeof SIBLING_APPS)[number], ValidatedSiblingManifest>,
  tezos: ReturnType<typeof buildToolkit>,
): Promise<ColanderContractSnapshot[]> {
  const output: ColanderContractSnapshot[] = [];
  for (const app of CONTRACT_APPS) {
    const manifest = manifests.get(app);
    assert.ok(manifest, `missing validated ${app} manifest`);
    const liveCandidates = [];
    for (const contract of manifest.contracts) {
      const candidate = await contractReadCandidate(tezos, contract.address);
      liveCandidates.push({
        address: candidate.address,
        adapterKind: candidate.adapter?.kind ?? "",
        actionIds: candidate.actionIds,
        live: candidate,
        manifestContract: contract,
      });
    }
    const selected = selectColanderTarget(app, liveCandidates);
    const selectedWithLive = liveCandidates.find((candidate) => candidate.address === selected.address);
    assert.ok(selectedWithLive?.live.adapter, `${app} selected adapter disappeared`);
    const contract = await tezos.contract.at(selected.address);
    const storage: any = await contract.storage();
    assert.ok(storage?.metadata && typeof storage.metadata.get === "function", `${app} contract has no readable metadata map`);
    const metadataRaw = await storage.metadata.get("");
    assert.equal(typeof metadataRaw, "string", `${app} contract metadata root is not bytes`);
    const metadataUri = hexToUtf8(metadataRaw);
    assert.ok(metadataUri.startsWith("ipfs://"), `${app} contract metadata root is not a pinned IPFS URI`);
    const metadataArtifact = manifest.artifacts.find((artifact) => artifact.ipfsUri === metadataUri);
    assert.ok(metadataArtifact, `${app} manifest does not package its exact on-chain contract metadata ${metadataUri}`);
    assert.ok(metadataArtifact.gatewayUrl, `${app} contract metadata artifact has no public gateway URL`);
    const metadataBytes = await readFile(path.join(runRoot, app, metadataArtifact.path));
    assert.equal(sha256(metadataBytes), metadataArtifact.sha256, `${app} local metadata artifact digest differs`);
    assert.equal(metadataArtifact.retrievedSha256, metadataArtifact.sha256, `${app} public metadata retrieval digest differs`);
    const metadataJson = JSON.parse(metadataBytes.toString("utf8")) as Record<string, unknown>;
    const relationship = extractRelationshipMetadata(metadataJson) as Record<string, unknown> | undefined;
    const actions = availableActions(selectedWithLive.live.adapter, selectedWithLive.live.entrypoints);
    assert.ok(actions.some((action) => action.id === REQUIRED_ACTION[app]), `${app} required action disappeared`);
    output.push({
      app,
      address: selected.address,
      manifestKind: selectedWithLive.manifestContract.kind,
      explorerUrl: selectedWithLive.manifestContract.explorerUrl,
      entrypoints: selectedWithLive.live.entrypoints,
      adapterKind: selectedWithLive.live.adapter.kind,
      adapterLabel: selectedWithLive.live.adapter.label,
      actionIds: actions.map((action) => action.id),
      actionLabels: actions.map((action) => action.label),
      administrator: asAddress(storage.administrator),
      pendingAdministrator: asAddress(storage.pending_administrator),
      nextTokenId: asNumber(storage.next_token_id),
      tokenCount: asNumber(storage.token_count),
      revisionCount: asNumber(storage.revision_count),
      currentRevision: asNumber(storage.current_revision),
      metadataHex: metadataRaw,
      metadataUri,
      metadataArtifactId: metadataArtifact.id,
      metadataArtifactPath: `${app}/${metadataArtifact.path}`,
      metadataSha256: metadataArtifact.sha256,
      metadataGatewayUrl: metadataArtifact.gatewayUrl,
      relationship: relationship ?? null,
    });
  }
  assert.equal(output.length, CONTRACT_APPS.length);
  return output;
}

export function assertColanderManagementRequest(
  request: BrowserBridgeRequest,
  lasagnaAddress: string,
): void {
  if (request.action !== "contract_call") throw new Error("management validator requires a contract_call request");
  if (request.contractAddress !== lasagnaAddress) throw new Error("Colander management target is not the same-run Lasagna contract");
  if (request.entrypoint !== "set_current_revision") throw new Error("Colander management entrypoint is not allowlisted");
  if (Number(request.payload) !== 0 || String(request.payload) !== "0") {
    throw new Error("Colander proof only permits the idempotent set_current_revision(0) payload");
  }
}

export function buildColanderUiLiveProxySource(account: string): string {
  const config = JSON.stringify({ account, chainId: SHADOWNET_CHAIN_ID }).replace(/</g, "\\u003c");
  return `(() => {
    "use strict";
    const config = ${config};
    const bridge = (request) => window.__colanderNodeBridge(request);
    function contractProxy(snapshot) {
      return {
        address: snapshot.address,
        entrypoints: { entrypoints: Object.fromEntries(snapshot.entrypoints.map((name) => [name, {}])) },
        async storage() {
          return {
            administrator: snapshot.administrator,
            pending_administrator: snapshot.pendingAdministrator,
            next_token_id: snapshot.nextTokenId,
            token_count: snapshot.tokenCount,
            revision_count: snapshot.revisionCount,
            current_revision: snapshot.currentRevision,
            metadata: { async get(key) { return key === "" ? snapshot.metadataHex : undefined; } },
          };
        },
        methodsObject: new Proxy({}, {
          get(_target, entrypoint) {
            if (typeof entrypoint !== "string") return undefined;
            return (payload) => ({
              async send() {
                const result = await bridge({
                  action: "contract_call",
                  contractAddress: snapshot.address,
                  entrypoint,
                  payload,
                });
                return {
                  hash: result.operationHash,
                  async confirmation() { return result.confirmationLevel || 1; },
                };
              },
            });
          },
        }),
      };
    }
    async function contractAt(contractAddress) {
      return contractProxy(await bridge({ action: "contract_read", contractAddress }));
    }
    const toolkit = {
      rpc: { async getChainId() { return (await bridge({ action: "chain_check" })).chainId; } },
      contract: { at: contractAt },
      wallet: { at: contractAt },
    };
    window.localStorage.setItem("wtf:network", "shadownet");
    window.localStorage.removeItem("wtfos.pasta.colander.workspace.v1");
    window.__wtfColanderTezosHarness = {
      async connectWallet() {
        const result = await bridge({ action: "connect" });
        return { address: result.address, providerName: "octez.connect" };
      },
      async getActiveAccount() {
        return { address: config.account, providerName: "octez.connect" };
      },
      async getTezos() { return toolkit; },
      async assertNetworkReadyForSend(address) {
        const result = await bridge({ action: "chain_check" });
        if (address !== config.account || result.chainId !== config.chainId) {
          throw new Error("Colander proof wallet or Shadownet chain changed before signing");
        }
      },
    };
  })();`;
}

export function buildColanderRoleManifest(input: {
  runId: string;
  capturedAt: string;
  rpcUrl: string;
  screenshots: unknown[];
  artifacts: unknown[];
  operations: unknown[];
  roleEvidence: unknown[];
  capabilities: unknown[];
}): Record<string, unknown> {
  return {
    schema: "pastaprotocol-app-proof@1",
    app: "colander",
    role: "management",
    runId: input.runId,
    capturedAt: input.capturedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    screenshots: input.screenshots,
    artifacts: input.artifacts,
    contracts: [],
    operations: input.operations,
    tokens: [],
    roleEvidence: input.roleEvidence,
    capabilities: input.capabilities,
  };
}

async function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal || code})`));
    });
  });
}

async function startHarness(): Promise<HarnessServer> {
  const port = await freeLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, "tests/playwright/harness.mjs")], {
    cwd: root,
    env: { ...process.env, HARNESS_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout?.on("data", (chunk) => { logs = `${logs}${String(chunk)}`.slice(-8_000); });
  child.stderr?.on("data", (chunk) => { logs = `${logs}${String(chunk)}`.slice(-8_000); });
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`browser harness exited early (${child.exitCode}): ${logs}`);
    try {
      const response = await fetch(`${origin}/__test/state`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return {
          origin,
          child,
          async close() {
            if (child.exitCode !== null) return;
            child.kill("SIGTERM");
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                child.kill("SIGKILL");
                resolve();
              }, 5_000);
              child.once("exit", () => { clearTimeout(timer); resolve(); });
            });
          },
        };
      }
    } catch {
      // Harness is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`browser harness did not become ready: ${logs}`);
}

async function writeJsonArtifact(
  appRoot: string,
  id: string,
  kind: string,
  fileName: string,
  value: unknown,
): Promise<WrittenArtifact> {
  const bytes = deterministicJsonBytes(value);
  const relativePath = `artifacts/${fileName}`;
  await writeFile(path.join(appRoot, relativePath), bytes);
  return { id, kind, path: relativePath, sha256: sha256(bytes) };
}

async function captureStage(input: {
  page: Page;
  monitor: ReturnType<typeof monitorPastaProofPage>;
  appRoot: string;
  ordinal: number;
  capability: string;
  stageName: string;
  requiredEvidence: RequiredDomEvidence[];
  scrollSelector?: string;
}): Promise<CapturePastaProofStageResult> {
  if (input.scrollSelector) await input.page.locator(input.scrollSelector).first().scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page: input.page,
    monitor: input.monitor,
    outputRoot: path.dirname(input.appRoot),
    app: "colander",
    capability: input.capability,
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.requiredEvidence,
    waitForLoadState: "none",
    timeoutMs: 60_000,
  });
}

export async function verifyColanderTzktEvidence(input: {
  snapshots: ColanderContractSnapshot[];
  operationHash: string;
  creatorAddress: string;
  lasagnaAddress: string;
  pollOptions?: { attempts?: number; delayMs?: number; userAgent?: string };
}): Promise<Record<string, unknown>> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contracts = [];
  for (const snapshot of input.snapshots) {
    const indexed = await pollJson(
      `Colander-discovered ${snapshot.app} contract`,
      `${base}/contracts/${encodeURIComponent(snapshot.address)}`,
      (value) => value?.address === snapshot.address,
      input.pollOptions,
    );
    contracts.push({
      app: snapshot.app,
      address: indexed.address,
      kind: indexed.kind,
      firstActivity: indexed.firstActivity,
      lastActivity: indexed.lastActivity,
    });
  }
  const indexedOperation = await pollJson(
    "Colander applied Lasagna management operation",
    `${base}/operations/transactions/${encodeURIComponent(input.operationHash)}`,
    (value) => value?.status === "applied" || (Array.isArray(value) && value.some((entry) => entry?.status === "applied")),
    input.pollOptions,
  );
  const operation = Array.isArray(indexedOperation)
    ? indexedOperation.find((entry) => entry?.status === "applied")
    : indexedOperation;
  assert.equal(operation?.sender?.address, input.creatorAddress, "TzKT management sender differs");
  assert.equal(operation?.target?.address, input.lasagnaAddress, "TzKT management target differs");
  assert.equal(operation?.parameter?.entrypoint, "set_current_revision", "TzKT management entrypoint differs");
  assert.equal(Number(operation?.parameter?.value), 0, "TzKT management payload differs");
  return {
    schema: "pastaprotocol-colander-tzkt-index@1",
    contracts,
    managementOperation: {
      hash: input.operationHash,
      status: operation.status,
      sender: operation.sender?.address,
      target: operation.target?.address,
      entrypoint: operation.parameter?.entrypoint,
      value: operation.parameter?.value,
      level: operation.level,
      explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
    },
  };
}

export async function runColanderUiLive(): Promise<{
  manifestPath: string;
  operationHash: string;
  screenshots: CapturePastaProofStageResult[];
}> {
  assertColanderUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV]!);
  const { appRoot, runId } = await requireFreshAppDirectory(runRoot);
  const manifests = await loadSiblingManifests(runRoot, runId);
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signers = await loadSignerPair(await signerEnv(rpc.rpcUrl));
  const tezos = buildToolkit(signers.creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Colander UI-live preflight");
  const snapshots = await resolveTargetSnapshots(runRoot, manifests, tezos);
  const lasagna = snapshots.find((snapshot) => snapshot.app === "lasagna");
  assert.ok(lasagna, "same-run Lasagna target is missing");
  assert.equal(lasagna.administrator, signers.creator.address, "creator signer is not Lasagna administrator");
  assert.ok((lasagna.revisionCount ?? 0) > 0, "Lasagna has no revision for a safe current-pointer management proof");
  const lasagnaContract = await tezos.contract.at(lasagna.address);
  const managementMethod = lasagnaContract.methodsObject.set_current_revision(0);
  const estimate = await tezos.estimate.transfer(managementMethod.toTransferParams());
  const estimatedMutez = Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez);
  const creatorBalanceMutez = Number((await tezos.tz.getBalance(signers.creator.address)).toString());
  const requiredBalanceMutez = estimatedMutez + MANAGEMENT_RESERVE_MUTEZ;
  if (!Number.isSafeInteger(creatorBalanceMutez) || creatorBalanceMutez < requiredBalanceMutez) {
    block("Colander creator wallet cannot safely submit its management proof", [
      `Wallet \`${signers.creator.address}\` has \`${creatorBalanceMutez}\` mutez.`,
      `Estimated fee/burn plus reserve requires \`${requiredBalanceMutez}\` mutez.`,
    ]);
  }

  await runCommand(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build"]);
  await mkdir(path.join(appRoot, "screenshots"), { recursive: true });
  await mkdir(path.join(appRoot, "artifacts"), { recursive: true });

  const snapshotByAddress = new Map(snapshots.map((snapshot) => [snapshot.address, snapshot]));
  const bridgeLog: Array<Record<string, unknown>> = [];
  let managementOperationHash = "";
  const bridge = async (requestValue: unknown): Promise<unknown> => {
    assert.ok(requestValue && typeof requestValue === "object" && !Array.isArray(requestValue), "browser bridge request must be an object");
    const request = requestValue as BrowserBridgeRequest;
    if (request.action === "connect" || request.action === "chain_check") {
      await assertShadownet(tezos, `Colander browser ${request.action}`);
      bridgeLog.push({ action: request.action, address: signers.creator.address, chainId: SHADOWNET_CHAIN_ID });
      return { address: signers.creator.address, chainId: SHADOWNET_CHAIN_ID };
    }
    if (request.action === "contract_read") {
      const snapshot = snapshotByAddress.get(String(request.contractAddress || ""));
      if (!snapshot) throw new Error("browser requested a contract outside this aggregate proof run");
      bridgeLog.push({ action: request.action, contractAddress: snapshot.address, app: snapshot.app });
      return snapshot;
    }
    assertColanderManagementRequest(request, lasagna.address);
    if (managementOperationHash) throw new Error("Colander proof permits exactly one management operation");
    await assertShadownet(tezos, "immediately before Colander management send");
    const liveAdmin = asAddress((await lasagnaContract.storage() as any).administrator);
    assert.equal(liveAdmin, signers.creator.address, "Lasagna administrator changed before signing");
    const operation = await lasagnaContract.methodsObject.set_current_revision(0).send();
    await operation.confirmation(1);
    managementOperationHash = operation.hash;
    bridgeLog.push({
      action: request.action,
      contractAddress: lasagna.address,
      entrypoint: request.entrypoint,
      payload: request.payload,
      operationHash: operation.hash,
    });
    return { operationHash: operation.hash, confirmationLevel: 1 };
  };

  let browser: Browser | null = null;
  let harness: HarnessServer | null = null;
  const screenshots: CapturePastaProofStageResult[] = [];
  let handoffUrl = "";
  let projectArtifact: WrittenArtifact | null = null;
  try {
    harness = await startHarness();
    const roleResponse = await fetch(`${harness.origin}/__test/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userRole: "admin" }),
    });
    assert.ok(roleResponse.ok, "browser harness rejected admin proof role");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: PASTA_PROOF_VIEWPORT, acceptDownloads: true });
    const page = await context.newPage();
    await page.exposeFunction("__colanderNodeBridge", bridge);
    await page.addInitScript({ content: buildColanderUiLiveProxySource(signers.creator.address) });
    const metadataResponses = new Map<string, Buffer>();
    for (const snapshot of snapshots) {
      const bytes = await readFile(path.join(runRoot, snapshot.metadataArtifactPath));
      metadataResponses.set(`https://ipfs.fileship.xyz/${snapshot.metadataUri.slice("ipfs://".length)}`, bytes);
    }
    await page.route("https://ipfs.fileship.xyz/**", async (route) => {
      const bytes = metadataResponses.get(route.request().url());
      if (!bytes) return route.continue();
      await route.fulfill({ status: 200, contentType: "application/json", body: bytes });
    });
    const monitor = monitorPastaProofPage(page);
    await page.goto(`${harness.origin}/tools/colander`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const surface = page.locator('[data-testid="colander-app"]');
    await surface.waitFor({ state: "visible", timeout: 60_000 });
    await surface.getByRole("button", { name: "Connect wallet" }).click();
    await surface.locator('[data-colander-region="status"]').filter({ hasText: "Connected" }).waitFor({ timeout: 30_000 });

    const proofTitle = `Pasta Proof ${runId}`;
    const renamedTitle = `Pasta Shadownet Suite ${runId}`;
    await surface.getByTestId("colander-project-title").fill(proofTitle);
    await surface.getByTestId("colander-project-tool").selectOption("spaghetti");
    await surface.getByTestId("colander-create-project").click();
    const manager = surface.getByTestId("colander-project-manager");
    await manager.getByLabel("Project title").fill(renamedTitle);
    await manager.getByRole("button", { name: "Save name" }).click();
    screenshots.push(await captureStage({
      page,
      monitor,
      appRoot,
      ordinal: 1,
      capability: "central project workspace",
      stageName: "connected project created and renamed",
      scrollSelector: '[data-testid="colander-workspace"]',
      requiredEvidence: [
        { selector: '[data-testid="colander-app"]', expectedText: "COLANDER" },
        { selector: '[data-testid="colander-workspace"]', expectedText: renamedTitle },
        { selector: '[data-colander-region="status"]', expectedText: `Renamed project to ${renamedTitle}` },
      ],
    }));

    await manager.getByRole("button", { name: "Duplicate as new project" }).click();
    await surface.locator('[data-colander-region="status"]').filter({ hasText: "Created independent copy" }).waitFor();
    await surface.getByTestId("colander-project-manager").getByRole("button", { name: "Archive project" }).click();
    const archived = surface.getByTestId("colander-archived-projects");
    await archived.getByRole("button", { name: "Restore project" }).click();
    await surface.getByTestId("colander-project-manager").getByRole("button", { name: "Archive project" }).click();
    await archived.getByRole("button", { name: "Delete permanently" }).click();
    await archived.getByRole("button", { name: "Confirm permanent delete" }).click();
    screenshots.push(await captureStage({
      page,
      monitor,
      appRoot,
      ordinal: 2,
      capability: "central project workspace",
      stageName: "duplicate archive restore and delete complete",
      scrollSelector: '[data-testid="colander-workspace"]',
      requiredEvidence: [
        { selector: '[data-testid="colander-workspace"]', expectedText: renamedTitle },
        { selector: '[data-colander-region="status"]', expectedText: "Permanently deleted" },
      ],
    }));

    const popupPromise = page.waitForEvent("popup");
    await page.locator('[data-colander-tool="macaroni"]').getByRole("button").click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    handoffUrl = popup.url();
    assert.ok(handoffUrl.includes("/tools/macaroni?"), "Colander did not route to Macaroni");
    assert.ok(handoffUrl.includes("handoff=colander-workspace"), "Colander handoff context is missing");
    assert.ok(handoffUrl.includes(`projectTitle=${encodeURIComponent(renamedTitle).replace(/%20/g, "+")}`) || new URL(handoffUrl).searchParams.get("projectTitle") === renamedTitle);
    await popup.close();
    screenshots.push(await captureStage({
      page,
      monitor,
      appRoot,
      ordinal: 3,
      capability: "specialized app routing",
      stageName: "macaroni handoff routed with project context",
      scrollSelector: '[data-colander-tool="macaroni"]',
      requiredEvidence: [
        { selector: '[data-colander-tool="macaroni"]', expectedText: "Macaroni" },
        { selector: '[data-testid="colander-workspace"]', expectedText: renamedTitle },
      ],
    }));

    let ordinal = 4;
    for (const snapshot of snapshots) {
      await surface.getByTestId("colander-address").fill(snapshot.address);
      await surface.getByRole("button", { name: "Open contract" }).click();
      const fact = surface.locator('[data-colander-region="fact-row"]').filter({ hasText: snapshot.address });
      await fact.waitFor({ state: "visible", timeout: 60_000 });
      await surface.locator(`[data-colander-action="${REQUIRED_ACTION[snapshot.app]}"]`).scrollIntoViewIfNeeded();
      await surface.locator('[data-colander-region="status"]').filter({ hasText: snapshot.adapterLabel }).waitFor();
      const remembered = surface.getByTestId("colander-remembered-contracts").locator("span").filter({ hasText: snapshot.address });
      await remembered.waitFor({ state: "visible" });
      if (snapshot.app === "macaroni") {
        assert.match(await remembered.innerText(), /Resume in Macaroni/);
        assert.doesNotMatch(await remembered.innerText(), /Resume in Spaghetti/);
      }
      screenshots.push(await captureStage({
        page,
        monitor,
        appRoot,
        ordinal: ordinal++,
        capability: "same run contract discovery",
        stageName: `${snapshot.app} contract detected and routed`,
        scrollSelector: `[data-colander-action="${REQUIRED_ACTION[snapshot.app]}"]`,
        requiredEvidence: [
          { selector: '[data-colander-region="body"]', expectedText: snapshot.adapterLabel },
          { selector: '[data-colander-region="fact-row"]', expectedText: snapshot.address },
          { selector: `[data-colander-action="${REQUIRED_ACTION[snapshot.app]}"]`, expectedText: snapshot.actionLabels[snapshot.actionIds.indexOf(REQUIRED_ACTION[snapshot.app])] },
          { selector: `a[href="https://shadownet.tzkt.io/${snapshot.address}"]`, expectedText: "explorer" },
        ],
      }));
    }

    const managementAction = surface.locator('[data-colander-action="set_current_revision"]');
    await managementAction.getByRole("button", { name: "Use" }).click();
    const form = surface.locator('[data-colander-action-form="set_current_revision"]');
    await form.getByLabel("Revision #").fill("0");
    screenshots.push(await captureStage({
      page,
      monitor,
      appRoot,
      ordinal: ordinal++,
      capability: "authorized contract management",
      stageName: "lasagna revision management ready to sign",
      scrollSelector: '[data-colander-action-form="set_current_revision"]',
      requiredEvidence: [
        { selector: '[data-colander-action="set_current_revision"]', expectedText: "Set current revision" },
        { selector: '[data-colander-action-form="set_current_revision"]', expectedText: "Submit Set current revision" },
        { selector: '[data-colander-region="fact-row"]', expectedText: lasagna.address },
      ],
    }));
    await form.getByRole("button", { name: "Submit Set current revision" }).click();
    await surface.locator('[data-colander-region="status"]').filter({ hasText: "Set current revision confirmed ✓" }).waitFor({ timeout: 180_000 });
    assert.equal(validateOperation(managementOperationHash), ValidationResult.VALID, "browser did not produce a valid operation hash");
    screenshots.push(await captureStage({
      page,
      monitor,
      appRoot,
      ordinal: ordinal++,
      capability: "authorized contract management",
      stageName: "lasagna revision management confirmed",
      scrollSelector: '[data-colander-region="status"]',
      requiredEvidence: [
        { selector: '[data-colander-region="status"]', expectedText: "Set current revision confirmed ✓" },
        { selector: '[data-colander-region="body"]', expectedText: lasagna.address },
      ],
    }));

    const downloadPromise = page.waitForEvent("download");
    await surface.getByRole("button", { name: "Export active" }).click();
    const download = await downloadPromise;
    const projectRelativePath = "artifacts/colander-project.pasta.json";
    await download.saveAs(path.join(appRoot, projectRelativePath));
    const projectBytes = await readFile(path.join(appRoot, projectRelativePath));
    const project = JSON.parse(projectBytes.toString("utf8")) as any;
    assert.equal(project.schema, "pasta-project@1");
    for (const snapshot of snapshots) assert.ok(project.contracts.includes(snapshot.address), `${snapshot.app} contract missing from exported project`);
    assert.equal(project.contractRecords.find((record: any) => record.address === snapshots.find((snapshot) => snapshot.app === "macaroni")?.address)?.toolId, "macaroni");
    projectArtifact = {
      id: "colander-project-export",
      kind: "project-manifest",
      path: projectRelativePath,
      sha256: sha256(projectBytes),
    };
    await surface.locator('input[type="file"][accept*="application/json"]').setInputFiles(path.join(appRoot, projectRelativePath));
    await surface.locator('[data-colander-region="status"]').filter({ hasText: `Imported ${renamedTitle}` }).waitFor();
    screenshots.push(await captureStage({
      page,
      monitor,
      appRoot,
      ordinal: ordinal++,
      capability: "portable aggregate management",
      stageName: "project exported and imported with contracts",
      scrollSelector: '[data-testid="colander-remembered-contracts"]',
      requiredEvidence: [
        { selector: '[data-testid="colander-remembered-contracts"]', expectedText: lasagna.address },
        { selector: '[data-testid="colander-remembered-contracts"]', expectedText: "Resume in Macaroni" },
        { selector: '[data-colander-region="status"]', expectedText: `Imported ${renamedTitle}` },
      ],
    }));
    monitor.dispose();
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (harness) await harness.close().catch(() => undefined);
  }
  assert.ok(projectArtifact, "browser did not export the aggregate project");
  assert.ok(managementOperationHash, "browser did not submit the management operation");

  const afterStorage: any = await (await tezos.contract.at(lasagna.address)).storage();
  assert.equal(asNumber(afterStorage.current_revision), 0, "Lasagna current revision did not settle at 0");
  const tzktEvidence = await verifyColanderTzktEvidence({
    snapshots,
    operationHash: managementOperationHash,
    creatorAddress: signers.creator.address,
    lasagnaAddress: lasagna.address,
  });

  const handoffArtifact = await writeJsonArtifact(appRoot, "colander-handoff-receipt", "handoff-receipt", "colander-handoff-receipt.json", {
    schema: "pastaprotocol-colander-handoff@1",
    sourceApp: "colander",
    targetApp: "macaroni",
    url: handoffUrl,
    projectTitle: `Pasta Shadownet Suite ${runId}`,
    network: "shadownet",
  });
  const discoveryArtifact = await writeJsonArtifact(appRoot, "colander-discovery-index", "discovery-index", "colander-discovery-index.json", {
    schema: "pastaprotocol-colander-discovery@1",
    runId,
    chainId: SHADOWNET_CHAIN_ID,
    targets: snapshots.map((snapshot) => ({
      app: snapshot.app,
      address: snapshot.address,
      explorerUrl: snapshot.explorerUrl,
      adapterKind: snapshot.adapterKind,
      adapterLabel: snapshot.adapterLabel,
      entrypoints: snapshot.entrypoints,
      actions: snapshot.actionIds,
      metadataUri: snapshot.metadataUri,
      metadataGatewayUrl: snapshot.metadataGatewayUrl,
      metadataArtifactId: snapshot.metadataArtifactId,
      metadataSha256: snapshot.metadataSha256,
      relationship: snapshot.relationship,
    })),
  });
  const managementArtifact = await writeJsonArtifact(appRoot, "colander-management-receipt", "management-receipt", "colander-management-receipt.json", {
    schema: "pastaprotocol-colander-management@1",
    status: "applied",
    actor: signers.creator.address,
    contractAddress: lasagna.address,
    entrypoint: "set_current_revision",
    payload: 0,
    operationHash: managementOperationHash,
    explorerUrl: `https://shadownet.tzkt.io/${managementOperationHash}`,
    beforeCurrentRevision: lasagna.currentRevision,
    afterCurrentRevision: 0,
  });
  const tzktBytes = deterministicJsonBytes(tzktEvidence);
  const tzktRelativePath = "artifacts/colander-tzkt-index.json";
  await writeFile(path.join(appRoot, tzktRelativePath), tzktBytes);
  const tzktArtifact: WrittenArtifact = {
    id: "colander-tzkt-index",
    kind: "indexer-evidence",
    path: tzktRelativePath,
    sha256: sha256(tzktBytes),
  };
  const completedAt = new Date().toISOString();
  const runArtifact = await writeJsonArtifact(appRoot, "colander-ui-live-run", "proof-receipt", "colander-ui-live-run.json", {
    schema: "pastaprotocol-colander-ui-live@1",
    classification: "UI-LIVE",
    runId,
    startedAfterSiblingProofs: [...manifests.keys()],
    completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    actor: signers.creator.address,
    funding: { balanceMutez: creatorBalanceMutez, estimatedMutez, requiredBalanceMutez },
    discoveredContracts: snapshots.map(({ app, address, adapterKind }) => ({ app, address, adapterKind })),
    managementOperation: managementOperationHash,
    browserBridgeLog: bridgeLog,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
  });

  const sidecarArtifacts = screenshots.map((capture) => capture.manifestSidecarArtifact);
  const allArtifacts = [
    projectArtifact,
    handoffArtifact,
    discoveryArtifact,
    managementArtifact,
    tzktArtifact,
    runArtifact,
    ...sidecarArtifacts,
  ];
  const screenshotStages = screenshots.map((capture) => capture.manifestScreenshot.stage);
  const discoveryStages = screenshots.slice(3, 3 + snapshots.length).map((capture) => capture.manifestScreenshot.stage);
  const managementStages = screenshots.slice(3 + snapshots.length, 5 + snapshots.length).map((capture) => capture.manifestScreenshot.stage);
  const workspaceStages = screenshots.filter((capture) => !discoveryStages.includes(capture.manifestScreenshot.stage) && !managementStages.includes(capture.manifestScreenshot.stage)).map((capture) => capture.manifestScreenshot.stage);
  const workspaceSidecars = screenshots.filter((capture) => workspaceStages.includes(capture.manifestScreenshot.stage)).map((capture) => capture.manifestSidecarArtifact.id);
  const discoverySidecars = screenshots.filter((capture) => discoveryStages.includes(capture.manifestScreenshot.stage)).map((capture) => capture.manifestSidecarArtifact.id);
  const managementSidecars = screenshots.filter((capture) => managementStages.includes(capture.manifestScreenshot.stage)).map((capture) => capture.manifestSidecarArtifact.id);
  const operation = {
    kind: "manage",
    hash: managementOperationHash,
    contractAddress: lasagna.address,
    entrypoint: "set_current_revision",
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${managementOperationHash}`,
  };
  const roleEvidence = [
    {
      kind: "contract-discovery",
      contractAddress: snapshots.find((snapshot) => snapshot.app === "spaghetti")!.address,
      url: snapshots.find((snapshot) => snapshot.app === "spaghetti")!.explorerUrl,
    },
    {
      kind: "management-action",
      artifactId: managementArtifact.id,
      contractAddress: lasagna.address,
      operationHash: managementOperationHash,
      url: `https://shadownet.tzkt.io/${managementOperationHash}`,
    },
  ];
  const capabilities = [
      {
        id: "central-local-first-project-workspace",
        description: "Use the actual Colander React application to connect on Shadownet, create and rename a project, duplicate/archive/restore/delete safely, route context to Macaroni, and export/import a portable aggregate project containing every discovered contract.",
        evidence: {
          screenshots: workspaceStages,
          artifacts: [projectArtifact.id, handoffArtifact.id, runArtifact.id, ...workspaceSidecars],
          contracts: [],
          operations: [],
          tokens: [],
          roleEvidence: [],
          urls: [handoffUrl],
        },
      },
      {
        id: "same-run-suite-contract-discovery",
        description: "Open and adapter-detect one fresh same-run contract from Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna through the actual Colander manager while preserving each owner-app route and exact pinned metadata link.",
        evidence: {
          screenshots: discoveryStages,
          artifacts: [discoveryArtifact.id, tzktArtifact.id, ...discoverySidecars],
          contracts: [],
          operations: [],
          tokens: [],
          roleEvidence: ["contract-discovery"],
          urls: [
            ...snapshots.map((snapshot) => snapshot.explorerUrl),
            ...snapshots.map((snapshot) => snapshot.metadataGatewayUrl),
          ],
        },
      },
      {
        id: "authorized-lasagna-management",
        description: "Use Colander's rendered Lasagna adapter form, creator wallet preflight, and actual browser send path to apply one idempotent set_current_revision(0) operation, preserve the visible confirmation after refresh, and independently verify the applied transaction through TzKT.",
        evidence: {
          screenshots: managementStages,
          artifacts: [managementArtifact.id, ...managementSidecars],
          contracts: [],
          operations: [managementOperationHash],
          tokens: [],
          roleEvidence: ["management-action"],
          urls: [`https://shadownet.tzkt.io/${managementOperationHash}`],
        },
      },
    ];
  const manifest = buildColanderRoleManifest({
    runId,
    capturedAt: completedAt,
    rpcUrl: rpc.rpcUrl,
    screenshots: screenshots.map((capture) => capture.manifestScreenshot),
    artifacts: allArtifacts,
    operations: [operation],
    roleEvidence,
    capabilities,
  });
  assert.deepEqual(manifest.contracts, [], "Colander must not claim a contract");
  assert.deepEqual(manifest.tokens, [], "Colander must not claim a token");
  assert.equal(new Set(capabilities.flatMap((capability) => capability.evidence.screenshots)).size, screenshotStages.length);
  assert.equal(new Set(capabilities.flatMap((capability) => capability.evidence.artifacts)).size, allArtifacts.length);
  const manifestPath = path.join(appRoot, "manifest.json");
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
  await validateCompletedColanderManifest(runRoot);
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    role: "management",
    manifestPath,
    operationHash: managementOperationHash,
    discoveredContracts: snapshots.map(({ app, address }) => ({ app, address })),
  }, null, 2)}\n`);
  return { manifestPath, operationHash: managementOperationHash, screenshots };
}

async function main(): Promise<void> {
  try {
    await runColanderUiLive();
  } catch (error) {
    if (error instanceof ProofBlocked) {
      process.stderr.write(`${JSON.stringify({ status: "BLOCKED", reason: error.message, details: error.lines }, null, 2)}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${JSON.stringify({ status: "FAILED", reason: errorText(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main();
}
