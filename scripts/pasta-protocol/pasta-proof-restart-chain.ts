import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { validateAddress, validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";

import type { PastaUiLivePinProof } from "./pasta-ui-live-bridge-kit";
import {
  createHttpGetReader,
  readWithBoundedRetry,
  type ReadOnlyFetch,
} from "./pasta-readonly-retry";
import {
  normalizeBase,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";
import type {
  PastaProofRestartActor,
  PastaProofRestartResolution,
  PastaProofRestartStep,
} from "./pasta-proof-restart-journal";

type JsonObject = Record<string, any>;

export type PastaProofRestartPendingOperation = Readonly<{
  step: PastaProofRestartStep;
  phase: "PREPARED" | "SUBMITTED";
  operationSequence: number;
  descriptor: unknown;
  descriptorSha256: string;
  operationHash?: string;
  contractAddress?: string;
  expectedCounter: number;
}>;

export type PastaProofRestartActorLane = Readonly<{
  rpcUrl: string;
  counter: number;
  activeOperationHashes: readonly string[];
  rejectedOperationHashes: readonly string[];
}>;

export type PastaProofRestartActorState = Readonly<{
  signerAddress: string;
  primary: PastaProofRestartActorLane;
  fallback: PastaProofRestartActorLane;
}>;

const ACTIVE_MEMPOOL_BUCKETS = Object.freeze(["applied", "validated", "branch_delayed", "unprocessed"]);
const REJECTED_MEMPOOL_BUCKETS = Object.freeze(["branch_refused", "refused", "outdated"]);
const TERMINAL_REJECTED_TZKT_STATUSES = new Set(["backtracked", "failed", "skipped"]);
const CID_PATTERN = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function operationFromMempoolEntry(value: unknown): { hash?: string; operation?: JsonObject } {
  if (Array.isArray(value)) {
    const operation = value.find((item) => item && typeof item === "object" && !Array.isArray(item)) as JsonObject | undefined;
    const hash = value.find((item) => typeof item === "string" && /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(item)) as string | undefined;
    return { hash: hash ?? (typeof operation?.hash === "string" ? operation.hash : undefined), operation };
  }
  if (value && typeof value === "object") {
    const operation = value as JsonObject;
    return { hash: typeof operation.hash === "string" ? operation.hash : undefined, operation };
  }
  return {};
}

function signerMempoolHashes(value: unknown, signerAddress: string, buckets: readonly string[]): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const mempool = value as JsonObject;
  const hashes = new Set<string>();
  for (const bucket of buckets) {
    const entries = Array.isArray(mempool[bucket]) ? mempool[bucket] : [];
    for (const entry of entries) {
      const { hash, operation } = operationFromMempoolEntry(entry);
      if (!operation || !Array.isArray(operation.contents)) continue;
      if (operation.contents.some((content: JsonObject) => content?.source === signerAddress)) {
        hashes.add(hash || "UNKNOWN");
      }
    }
  }
  return [...hashes].sort();
}

async function readJson(
  label: string,
  url: string,
  fetchImpl: ReadOnlyFetch,
): Promise<unknown> {
  return readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      fetchImpl,
      parse: (response) => response.json(),
    }),
  });
}

export async function readPastaProofRestartActorLane(input: {
  rpcUrl: string;
  signerAddress: string;
  fetchImpl?: ReadOnlyFetch;
}): Promise<PastaProofRestartActorLane> {
  assert.equal(validateAddress(input.signerAddress), ValidationResult.VALID, "restart signer address is invalid");
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = normalizeBase(input.rpcUrl);
  const [chainId, counterValue, mempool] = await Promise.all([
    readJson(`${base} restart chain id`, `${base}/chains/main/chain_id`, fetchImpl),
    readJson(
      `${base} restart signer counter`,
      `${base}/chains/main/blocks/head/context/contracts/${encodeURIComponent(input.signerAddress)}/counter`,
      fetchImpl,
    ),
    readJson(`${base} restart mempool`, `${base}/chains/main/mempool/pending_operations`, fetchImpl),
  ]);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${base} is not Shadownet`);
  const counter = Number(counterValue);
  assert.ok(Number.isSafeInteger(counter) && counter >= 0, `${base} returned an invalid signer counter`);
  return {
    rpcUrl: base,
    counter,
    activeOperationHashes: signerMempoolHashes(mempool, input.signerAddress, ACTIVE_MEMPOOL_BUCKETS),
    rejectedOperationHashes: signerMempoolHashes(mempool, input.signerAddress, REJECTED_MEMPOOL_BUCKETS),
  };
}

export async function readPastaProofRestartActorState(input: {
  signerAddress: string;
  primaryRpcUrl?: string;
  fallbackRpcUrl?: string;
  fetchImpl?: ReadOnlyFetch;
}): Promise<PastaProofRestartActorState> {
  const [primary, fallback] = await Promise.all([
    readPastaProofRestartActorLane({
      rpcUrl: input.primaryRpcUrl ?? SHADOWNET_RPC_PRIMARY,
      signerAddress: input.signerAddress,
      fetchImpl: input.fetchImpl,
    }),
    readPastaProofRestartActorLane({
      rpcUrl: input.fallbackRpcUrl ?? SHADOWNET_RPC_FALLBACK,
      signerAddress: input.signerAddress,
      fetchImpl: input.fetchImpl,
    }),
  ]);
  assert.equal(primary.counter, fallback.counter, `restart dual-RPC counters disagree for ${input.signerAddress}`);
  return { signerAddress: input.signerAddress, primary, fallback };
}

function assertNoActiveOperations(state: PastaProofRestartActorState, label: string): void {
  assert.deepEqual(state.primary.activeOperationHashes, [], `${label} primary RPC has an active signer operation`);
  assert.deepEqual(state.fallback.activeOperationHashes, [], `${label} fallback RPC has an active signer operation`);
}

export async function capturePastaProofRestartInitialCounters(input: {
  actors: Readonly<Record<string, string>>;
  fetchImpl?: ReadOnlyFetch;
}): Promise<Record<string, number>> {
  const entries = await Promise.all(Object.entries(input.actors).map(async ([actor, signerAddress]) => {
    const state = await readPastaProofRestartActorState({ signerAddress, fetchImpl: input.fetchImpl });
    assertNoActiveOperations(state, `${actor} initial restart boundary`);
    return [actor, state.primary.counter] as const;
  }));
  return Object.fromEntries(entries);
}

export async function authenticatePastaProofRestartInitialCounters(input: {
  counters: Readonly<Record<string, number>>;
  actors: Readonly<Record<string, string>>;
  plan: readonly PastaProofRestartStep[];
  fetchImpl?: ReadOnlyFetch;
}): Promise<void> {
  assert.deepEqual(Object.keys(input.counters).sort(), Object.keys(input.actors).sort(), "restart counter actor set differs");
  await Promise.all(Object.entries(input.actors).map(async ([actor, signerAddress]) => {
    const initial = input.counters[actor];
    assert.ok(Number.isSafeInteger(initial) && initial >= 0, `${actor} persisted restart counter is invalid`);
    assert.ok(input.plan.some((step) => step.actor === actor), `${actor} is not present in the authenticated restart plan`);
    const state = await readPastaProofRestartActorState({ signerAddress, fetchImpl: input.fetchImpl });
    const delta = state.primary.counter - initial;
    assert.ok(Number.isSafeInteger(delta) && delta >= 0, `${actor} live counter predates the persisted restart counter`);
  }));
}

export async function assertPastaProofRestartCounterBoundary(input: {
  signerAddress: string;
  expectedCounter: number;
  label: string;
  fetchImpl?: ReadOnlyFetch;
}): Promise<void> {
  assert.ok(Number.isSafeInteger(input.expectedCounter) && input.expectedCounter >= 0, "restart expected counter is invalid");
  const state = await readPastaProofRestartActorState({ signerAddress: input.signerAddress, fetchImpl: input.fetchImpl });
  assert.equal(state.primary.counter, input.expectedCounter, `${input.label} signer counter differs`);
  assertNoActiveOperations(state, input.label);
}

function canonicalInteger(value: string): string | undefined {
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(value)) return undefined;
  try {
    return BigInt(value).toString();
  } catch {
    return undefined;
  }
}

export function projectPastaProofRestartValue(value: unknown): unknown {
  if (typeof value === "number") {
    assert.ok(Number.isSafeInteger(value), "restart payload number must be a safe integer");
    return { __integer: String(value) };
  }
  if (typeof value === "bigint") return { __integer: value.toString() };
  if (typeof value === "string") {
    const integer = canonicalInteger(value);
    return integer === undefined ? value : { __integer: integer };
  }
  if (value === null || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(projectPastaProofRestartValue);
  const record = objectValue(value, "restart payload value");
  if (Array.isArray(record.__map)) {
    const output: Record<string, unknown> = {};
    for (const entry of record.__map) {
      assert.ok(Array.isArray(entry) && entry.length === 2, "restart projected map entry is invalid");
      assert.equal(typeof entry[0], "string", "restart projected map key must be a string");
      assert.ok(!Object.prototype.hasOwnProperty.call(output, entry[0]), "restart projected map key is duplicated");
      output[entry[0]] = projectPastaProofRestartValue(entry[1]);
    }
    return Object.fromEntries(Object.entries(output).sort(([left], [right]) => left.localeCompare(right)));
  }
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, projectPastaProofRestartValue(item)]),
  );
}

export function projectPastaProofRestartScript(value: unknown): unknown[] {
  assert.ok(Array.isArray(value) && value.length > 0, "restart Michelson script must contain sections");
  return value
    .map(projectPastaProofRestartValue)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function assertPastaProofRestartTransaction(input: {
  row: unknown;
  pending: PastaProofRestartPendingOperation;
  signerAddress: string;
}): { contractAddress: string; entrypoints: string[] } {
  const row = objectValue(input.row, "restart TzKT transaction");
  assert.equal(row.type, "transaction", "restart operation is not a transaction");
  assert.equal(row.status, "applied", "restart transaction is not applied");
  assert.equal(row.sender?.address, input.signerAddress, "restart transaction signer differs");
  assert.equal(Number(row.counter), input.pending.expectedCounter, "restart transaction counter differs");
  assert.ok(Number.isSafeInteger(Number(row.level)) && Number(row.level) > 0, "restart transaction level is invalid");
  assert.ok(typeof row.timestamp === "string" && Number.isFinite(Date.parse(row.timestamp)), "restart transaction timestamp is invalid");

  const descriptor = objectValue(input.pending.descriptor, "restart transaction descriptor");
  const calls = descriptor.kind === "call"
    ? [objectValue(descriptor.call, "restart call descriptor")]
    : descriptor.kind === "batch" && Array.isArray(descriptor.calls)
      ? descriptor.calls.map((call: unknown) => objectValue(call, "restart batch call descriptor"))
      : [];
  assert.equal(calls.length, 1, "restart proof transaction must contain exactly one semantic contract call");
  const call = calls[0];
  assert.equal(validateContractAddress(String(call.contractAddress || "")), ValidationResult.VALID, "restart call contract is invalid");
  assert.equal(row.target?.address, call.contractAddress, "restart transaction target differs");
  assert.equal(row.parameter?.entrypoint, call.entrypoint, "restart transaction entrypoint differs");
  assert.deepEqual(
    projectPastaProofRestartValue(row.parameter?.value),
    projectPastaProofRestartValue(call.payload),
    "restart transaction payload differs",
  );

  let expectedAmountMutez = 0;
  if (descriptor.kind === "call") {
    const sendOptions = objectValue(descriptor.sendOptions ?? {}, "restart call send options");
    if (sendOptions.amount !== undefined) {
      assert.equal(sendOptions.mutez, true, "restart paid call must express its amount in mutez");
      expectedAmountMutez = Number(sendOptions.amount);
      assert.ok(Number.isSafeInteger(expectedAmountMutez) && expectedAmountMutez >= 0, "restart paid-call amount is invalid");
    }
  }
  assert.equal(Number(row.amount || 0), expectedAmountMutez, "restart transaction mutez amount differs");
  return { contractAddress: String(call.contractAddress), entrypoints: [String(call.entrypoint)] };
}

export function assertPastaProofRestartOrigination(input: {
  row: unknown;
  pending: PastaProofRestartPendingOperation;
  signerAddress: string;
}): { contractAddress: string; entrypoints: [] } {
  const row = objectValue(input.row, "restart TzKT origination");
  assert.equal(input.pending.step.action, "originate", "restart pending step is not an origination");
  assert.equal(row.type, "origination", "restart operation is not an origination");
  assert.equal(row.status, "applied", "restart origination is not applied");
  assert.equal(row.sender?.address, input.signerAddress, "restart origination signer differs");
  assert.equal(Number(row.counter), input.pending.expectedCounter, "restart origination counter differs");
  assert.ok(Number.isSafeInteger(Number(row.level)) && Number(row.level) > 0, "restart origination level is invalid");
  assert.ok(typeof row.timestamp === "string" && Number.isFinite(Date.parse(row.timestamp)), "restart origination timestamp is invalid");
  const operationHash = String(row.hash || "");
  assert.equal(validateOperation(operationHash), ValidationResult.VALID, "restart origination hash is invalid");
  if (input.pending.operationHash) {
    assert.equal(operationHash, input.pending.operationHash, "restart origination hash differs from SUBMITTED");
  }
  const contractAddress = String(row.originatedContract?.address || "");
  assert.equal(validateContractAddress(contractAddress), ValidationResult.VALID, "restart origination KT1 is invalid");
  const descriptor = objectValue(input.pending.descriptor, "restart origination descriptor");
  assert.equal(descriptor.kind, "originate", "restart origination descriptor kind differs");
  return { contractAddress, entrypoints: [] };
}

export async function reconcilePastaProofRestartOperation(input: {
  label: string;
  pending: PastaProofRestartPendingOperation;
  signerAddress: string;
  validateApplied(row: unknown): Promise<{ contractAddress: string; entrypoints: string[] }>;
  actorState?: PastaProofRestartActorState;
  fetchImpl?: ReadOnlyFetch;
  tzktApiUrl?: string;
}): Promise<PastaProofRestartResolution> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const family = input.pending.step.action === "originate" ? "originations" : "transactions";
  const operationBase = `${normalizeBase(input.tzktApiUrl ?? SHADOWNET_TZKT_API)}/operations/${family}`;
  const url = input.pending.operationHash
    ? `${operationBase}/${encodeURIComponent(input.pending.operationHash)}`
    : `${operationBase}?sender=${encodeURIComponent(input.signerAddress)}&counter=${input.pending.expectedCounter}&limit=10`;
  const [rowsValue, state] = await Promise.all([
    readJson(`${input.label} indexed manager operation`, url, fetchImpl),
    input.actorState
      ? Promise.resolve(input.actorState)
      : readPastaProofRestartActorState({ signerAddress: input.signerAddress, fetchImpl }),
  ]);
  assert.equal(state.signerAddress, input.signerAddress, `${input.label} actor-state signer differs`);
  assert.ok(Array.isArray(rowsValue), `${input.label} TzKT counter response must be an array`);
  const rows = rowsValue as JsonObject[];
  const atCounter = rows.filter((row) =>
    row?.sender?.address === input.signerAddress && Number(row?.counter) === input.pending.expectedCounter);
  const exactHash = input.pending.operationHash
    ? atCounter.filter((row) => row?.hash === input.pending.operationHash)
    : atCounter;
  const applied = exactHash.filter((row) => row?.status === "applied");
  if (applied.length > 0) {
    assert.equal(applied.length, 1, `${input.label} indexed applied operation is ambiguous`);
    assertNoActiveOperations(state, `${input.label} applied boundary`);
    assert.ok(state.primary.counter >= input.pending.expectedCounter, `${input.label} applied counter is not visible on both RPCs`);
    const operationHash = String(applied[0].hash || "");
    assert.equal(validateOperation(operationHash), ValidationResult.VALID, `${input.label} operation hash is invalid`);
    const validated = await input.validateApplied(applied[0]);
    assert.equal(validateContractAddress(validated.contractAddress), ValidationResult.VALID, `${input.label} contract address is invalid`);
    return {
      status: "applied",
      operationHash,
      contractAddress: validated.contractAddress,
      timestampUtc: String(applied[0].timestamp),
      entrypoints: validated.entrypoints,
    };
  }

  if (input.pending.operationHash) {
    const rejected = exactHash.filter((row) => TERMINAL_REJECTED_TZKT_STATUSES.has(String(row?.status || "")));
    const active = state.primary.activeOperationHashes.includes(input.pending.operationHash) ||
      state.fallback.activeOperationHashes.includes(input.pending.operationHash);
    if (rejected.length > 0 && !active) {
      assert.equal(rejected.length, 1, `${input.label} rejected operation is ambiguous`);
      return {
        status: "rejected",
        operationHash: input.pending.operationHash,
        reason: String(rejected[0].status),
        counterConsumed: state.primary.counter >= input.pending.expectedCounter,
      };
    }
    if (active) throw new Error(`${input.label} submitted operation is still active in the Shadownet mempool`);
    const primaryRejected = state.primary.rejectedOperationHashes.includes(input.pending.operationHash);
    const fallbackRejected = state.fallback.rejectedOperationHashes.includes(input.pending.operationHash);
    if (primaryRejected || fallbackRejected) {
      assert.equal(primaryRejected, fallbackRejected, `${input.label} RPC lanes disagree on terminal rejection`);
      return {
        status: "rejected",
        operationHash: input.pending.operationHash,
        reason: "dual-rpc-terminal-mempool-rejection",
        counterConsumed: false,
      };
    }
  }

  if (state.primary.activeOperationHashes.length || state.fallback.activeOperationHashes.length) {
    throw new Error(`${input.label} signer has an unresolved active manager operation`);
  }
  if (state.primary.counter < input.pending.expectedCounter) return { status: "absent" };
  throw new Error(`${input.label} manager counter is consumed without exact indexed operation evidence`);
}

function kuboApiUrl(apiUrl: string, method: string): URL {
  const url = new URL(apiUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath.endsWith("/api/v0") ? basePath : `${basePath}/api/v0`}/${method}`.replace(/\/{2,}/g, "/");
  return url;
}

function cidFromKuboResponse(text: string): string {
  for (const line of text.trim().split(/\r?\n/).reverse()) {
    if (!line.trim()) continue;
    try {
      const cid = String((JSON.parse(line) as { Hash?: unknown }).Hash ?? "").trim();
      if (CID_PATTERN.test(cid)) return cid;
    } catch {
      // Kubo streams newline-delimited JSON.
    }
  }
  throw new Error("Kubo only-hash response contains no valid CID");
}

function gatewayUrl(base: string, cid: string): string {
  return `${normalizeBase(base)}/${encodeURIComponent(cid)}`;
}

async function readExactGatewayBytes(
  url: string,
  expectedBytes: Uint8Array,
  fetchImpl: ReadOnlyFetch,
): Promise<"present" | "absent"> {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (response.status === 404) return "absent";
  assert.ok(response.ok, `IPFS recovery gateway ${url} failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.byteLength, expectedBytes.byteLength, `IPFS recovery gateway ${url} byte length differs`);
  assert.equal(sha256(bytes), sha256(expectedBytes), `IPFS recovery gateway ${url} bytes differ`);
  return "present";
}

export async function reconcilePastaProofRestartPin(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  sha256: string;
  ipfs: IpfsProofConfig;
  fetchImpl?: ReadOnlyFetch;
}): Promise<{ status: "absent" } | { status: "present"; proof: PastaUiLivePinProof }> {
  assert.equal(sha256(input.bytes), input.sha256, "restart PIN_PREPARED bytes differ from their authenticated digest");
  const fetchImpl = input.fetchImpl ?? fetch;
  const addUrl = kuboApiUrl(input.ipfs.apiUrl, "add");
  addUrl.searchParams.set("pin", "false");
  addUrl.searchParams.set("only-hash", "true");
  addUrl.searchParams.set("cid-version", "1");
  addUrl.searchParams.set("raw-leaves", "true");
  const body = new FormData();
  body.append("file", new Blob([Uint8Array.from(input.bytes).buffer], { type: input.mimeType }), input.fileName);
  const hashResponse = await fetchImpl(addUrl, { method: "POST", body });
  assert.ok(hashResponse.ok, `Kubo only-hash recovery failed with HTTP ${hashResponse.status}`);
  const cid = cidFromKuboResponse(await hashResponse.text());

  const pinUrl = kuboApiUrl(input.ipfs.apiUrl, "pin/ls");
  pinUrl.searchParams.set("arg", cid);
  pinUrl.searchParams.set("type", "recursive");
  const pinResponse = await fetchImpl(pinUrl, { method: "POST" });
  if (!pinResponse.ok) return { status: "absent" };
  const pinState = objectValue(await pinResponse.json(), "Kubo pin recovery response");
  assert.ok(pinState.Keys?.[cid], "Kubo pin recovery response does not bind the expected CID");

  const localGatewayUrl = gatewayUrl(input.ipfs.localGatewayUrl, cid);
  const publicGatewayUrl = gatewayUrl(input.ipfs.publicGatewayUrl, cid);
  const [local, publicResult] = await Promise.all([
    readExactGatewayBytes(localGatewayUrl, input.bytes, fetchImpl),
    readExactGatewayBytes(publicGatewayUrl, input.bytes, fetchImpl),
  ]);
  assert.equal(local, "present", "Kubo reports a pin whose local gateway bytes are absent");
  assert.equal(publicResult, "present", "prepared pin exists locally but public-gateway verification is unresolved");
  return {
    status: "present",
    proof: {
      cid,
      uri: `ipfs://${cid}`,
      fileName: input.fileName,
      mimeType: input.mimeType,
      byteLength: input.bytes.byteLength,
      sha256: input.sha256,
      localGatewayUrl,
      publicGatewayUrl,
      publicGatewayVerified: true,
      verificationAttempts: 1,
    },
  };
}

export function restartActorAddress(
  actors: Readonly<Record<string, string>>,
  actor: PastaProofRestartActor,
): string {
  const address = actors[actor];
  assert.equal(validateAddress(address || ""), ValidationResult.VALID, `restart actor ${actor} is not bound to a valid signer`);
  return address;
}
