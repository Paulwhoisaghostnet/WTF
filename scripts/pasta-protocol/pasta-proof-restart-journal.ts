import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";

import { validateAddress, validateContractAddress, validateOperation, ValidationResult } from "@taquito/utils";

import type {
  PastaUiLiveBridgeRequest,
  PastaUiLivePinProof,
  PastaUiLivePreparedOperation,
  PastaUiLivePublicReceipt,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { decodePastaUiLiveValue, PASTA_UI_LIVE_RECEIPT_SCHEMA } from "./pasta-ui-live-bridge-kit";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

export const PASTA_PROOF_RESTART_SCHEMA = "pastaprotocol-proof-restart-journal@1";

export type PastaProofRestartActor = "creator" | "curator" | "collector";
export type PastaProofRestartStep = Readonly<{
  id: string;
  actor: PastaProofRestartActor;
  kind: "pin" | "operation";
  action?: "originate" | "call" | "batch";
  entrypoint?: string;
  entrypoints?: readonly string[];
  fileName?: string;
  transport?: "bridge" | "direct";
}>;

type Projected = null | boolean | number | string | Projected[] | { [key: string]: Projected };
type Phase = "PIN_PREPARED" | "PIN_APPLIED" | "PREPARED" | "SUBMITTED" | "APPLIED" | "ABANDONED";
type JournalEvent = {
  index: number;
  phase: Phase;
  stepId: string;
  actor: PastaProofRestartActor;
  timestampUtc: string;
  previousSha256: string;
  payload: Record<string, Projected>;
  sha256: string;
};
type JournalFile = {
  schema: typeof PASTA_PROOF_RESTART_SCHEMA;
  app: string;
  runId: string;
  chainId: string;
  createdAt: string;
  actors: Record<string, string>;
  initialCounters: Record<string, number>;
  intent: Projected;
  plan: readonly PastaProofRestartStep[];
  intentSha256: string;
  events: JournalEvent[];
};

export type PastaProofRestartResolution =
  | { status: "absent" }
  | { status: "rejected"; operationHash: string; reason: string; counterConsumed: boolean }
  | {
      status: "applied";
      operationHash: string;
      contractAddress: string;
      timestampUtc: string;
      entrypoints: string[];
    };

export type PastaProofRestartActiveManagerOperation = Readonly<{
  bucket: "applied" | "validated" | "branch_delayed" | "unprocessed" | "refused" | "branch_refused" | "outdated";
  hash: string;
  source: string;
  counter: number;
}>;

export type PastaProofRestartRpcSnapshot = Readonly<{
  rpcUrl: string;
  chainId: string;
  counters: Readonly<Record<string, number>>;
  activeManagerOperations: readonly PastaProofRestartActiveManagerOperation[];
  terminalManagerOperations: readonly PastaProofRestartActiveManagerOperation[];
}>;

type Pending = {
  step: PastaProofRestartStep;
  phase: "PREPARED" | "SUBMITTED";
  event: JournalEvent;
  operationSequence: number;
  expectedCounter: number;
  descriptor: Projected;
  descriptorSha256: string;
  operationHash?: string;
  contractAddress?: string;
};

const HASH_RE = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const RESTART_RPC_TIMEOUT_MS = Math.max(1_000, Number(process.env.PASTA_SHADOWNET_HTTP_TIMEOUT_MS || "15000"));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function iso(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} is not an ISO timestamp`);
  return value;
}

function project(value: unknown, ancestors = new Set<object>()): Projected {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("restart journal refuses a non-finite number");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (!value || typeof value !== "object") throw new Error(`restart journal refuses ${typeof value}`);
  if (ancestors.has(value)) throw new Error("restart journal refuses cyclic values");
  ancestors.add(value);
  try {
    const candidate = value as Record<string, unknown> & {
      entries?: () => Iterable<[unknown, unknown]>;
      set?: (...args: unknown[]) => unknown;
      toFixed?: () => string;
    };
    if (typeof candidate.toFixed === "function") return candidate.toFixed();
    if (typeof candidate.entries === "function" && typeof candidate.set === "function") {
      return { __map: Array.from(candidate.entries(), ([key, item]) => [project(key, ancestors), project(item, ancestors)]) };
    }
    if (Array.isArray(value)) return value.map((item) => project(item, ancestors));
    const output: Record<string, Projected> = {};
    for (const key of Object.keys(candidate).sort()) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("restart journal refuses a prohibited key");
      if (/^(?:authorization|mnemonic|password|private[_-]?key|secret|seed)$/i.test(key)) {
        throw new Error(`restart journal refuses credential field ${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value === "function") {
        throw new Error(`restart journal refuses non-data field ${key}`);
      }
      if (descriptor.value !== undefined) output[key] = project(descriptor.value, ancestors);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

async function atomicWrite(filePath: string, value: JournalFile): Promise<void> {
  const bytes = deterministicJsonBytes(value);
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  const directory = await open(path.dirname(filePath), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

function intentCore(input: Omit<JournalFile, "intentSha256" | "events">): Projected {
  return project(input);
}

function validatePlan(plan: readonly PastaProofRestartStep[]): void {
  if (plan.length === 0) throw new Error("restart journal plan is empty");
  const ids = new Set<string>();
  for (const step of plan) {
    if (!SAFE_ID.test(step.id) || ids.has(step.id)) throw new Error("restart journal step id is invalid or duplicated");
    ids.add(step.id);
    if (step.kind === "pin") {
      if (!step.fileName || step.action || step.entrypoint) throw new Error(`restart pin step ${step.id} is malformed`);
    } else if (
      !step.action
      || (step.action === "originate" && (Boolean(step.entrypoint) || Boolean(step.entrypoints)))
      || (step.action === "call" && (!step.entrypoint || Boolean(step.entrypoints)))
      || (step.action === "batch" && (Boolean(step.entrypoint) || !step.entrypoints?.length))
    ) {
      throw new Error(`restart operation step ${step.id} is malformed`);
    }
  }
}

function equalProjected(left: unknown, right: unknown): boolean {
  return JSON.stringify(project(left)) === JSON.stringify(project(right));
}

function requestOperationDescriptor(request: PastaUiLiveBridgeRequest): Projected | undefined {
  if (!request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) return undefined;
  const payload = request.payload as Record<string, unknown>;
  if (request.action === "originate") {
    return project({
      kind: "originate",
      code: decodePastaUiLiveValue(payload.code),
      storage: decodePastaUiLiveValue(payload.storage),
    });
  }
  if (request.action === "call") {
    return project({
      kind: "call",
      call: decodePastaUiLiveValue(payload.call),
      sendOptions: decodePastaUiLiveValue(payload.sendOptions ?? {}),
    });
  }
  if (request.action === "batch") {
    return project({ kind: "batch", calls: decodePastaUiLiveValue(payload.calls) });
  }
  return undefined;
}

function requestPinIdentity(request: PastaUiLiveBridgeRequest): { fileName: string; mimeType: string; sha256: string } | undefined {
  if (!request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) return undefined;
  const payload = request.payload as Record<string, unknown>;
  const fileName = String(payload.fileName ?? (request.action === "pin_json" ? "metadata.json" : "artifact.bin"));
  if (request.action === "pin_json") {
    const bytes = deterministicJsonBytes(decodePastaUiLiveValue(payload.value));
    return { fileName, mimeType: "application/json", sha256: sha256(bytes) };
  }
  if (request.action === "pin_blob" && typeof payload.dataBase64 === "string") {
    const bytes = Buffer.from(payload.dataBase64, "base64");
    return {
      fileName,
      mimeType: typeof payload.mimeType === "string" && payload.mimeType.trim()
        ? payload.mimeType.trim().slice(0, 200)
        : "application/octet-stream",
      sha256: sha256(bytes),
    };
  }
  return undefined;
}

function activeMempoolEntries(value: unknown): Array<Record<string, unknown>> {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value as Record<string, unknown>)
      : [];
  return entries.flatMap((entry) => {
    const candidate = Array.isArray(entry)
      ? entry.find((item) => item && typeof item === "object" && !Array.isArray(item) && Array.isArray((item as any).contents))
        ?? (entry.length === 2 ? entry[1] : undefined)
      : entry;
    return candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? [candidate as Record<string, unknown>]
      : [];
  });
}

async function fetchRestartJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "wtfos-pasta-proof-restart" },
    signal: AbortSignal.timeout(RESTART_RPC_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`restart RPC ${url} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`restart RPC ${url} returned invalid JSON`); }
}

export async function readPastaProofRestartRpcSnapshot(
  rpcUrl: string,
  actors: Readonly<Record<string, string>>,
): Promise<PastaProofRestartRpcSnapshot> {
  const base = rpcUrl.replace(/\/+$/, "");
  const actorEntries = Object.entries(actors);
  const uniqueAddresses = [...new Set(actorEntries.map(([, address]) => address))];
  const [chainId, mempool, ...counterValues] = await Promise.all([
    fetchRestartJson(`${base}/chains/main/chain_id`),
    fetchRestartJson(`${base}/chains/main/mempool/pending_operations`),
    ...uniqueAddresses.map((address) => fetchRestartJson(
      `${base}/chains/main/blocks/head/context/contracts/${encodeURIComponent(address)}/counter`,
    )),
  ]);
  if (chainId !== SHADOWNET_CHAIN_ID) throw new Error(`${rpcUrl} is not Shadownet`);
  const counterByAddress = new Map(uniqueAddresses.map((address, index) => {
    const counter = Number(counterValues[index]);
    if (!Number.isSafeInteger(counter) || counter < 0) throw new Error(`${rpcUrl} returned an invalid counter for ${address}`);
    return [address, counter] as const;
  }));
  const counters = Object.fromEntries(actorEntries.map(([actor, address]) => [actor, counterByAddress.get(address)!]));
  const relevantAddresses = new Set(uniqueAddresses);
  const activeManagerOperations: PastaProofRestartActiveManagerOperation[] = [];
  const terminalManagerOperations: PastaProofRestartActiveManagerOperation[] = [];
  const mempoolRecord = mempool && typeof mempool === "object" && !Array.isArray(mempool)
    ? mempool as Record<string, unknown>
    : {};
  for (const bucket of ["applied", "validated", "branch_delayed", "unprocessed", "refused", "branch_refused", "outdated"] as const) {
    for (const operation of activeMempoolEntries(mempoolRecord[bucket])) {
      const hash = String(operation.hash ?? "");
      const contents = Array.isArray(operation.contents) ? operation.contents : [];
      for (const content of contents) {
        if (!content || typeof content !== "object" || Array.isArray(content)) continue;
        const source = String((content as Record<string, unknown>).source ?? "");
        const counter = Number((content as Record<string, unknown>).counter);
        if (relevantAddresses.has(source) && Number.isSafeInteger(counter) && counter > 0) {
          const target = bucket === "refused" || bucket === "branch_refused" || bucket === "outdated"
            ? terminalManagerOperations
            : activeManagerOperations;
          target.push({ bucket, hash, source, counter });
        }
      }
    }
  }
  return { rpcUrl: base, chainId: String(chainId), counters, activeManagerOperations, terminalManagerOperations };
}

export class PastaProofRestartJournal {
  private queue: Promise<void> = Promise.resolve();
  private replayCursor = new Map<PastaProofRestartActor, number>();

  private constructor(readonly filePath: string, private state: JournalFile) {}

  static async create(input: {
    filePath: string;
    app: string;
    runId: string;
    actors: Record<string, string>;
    initialCounters: Record<string, number>;
    plan: readonly PastaProofRestartStep[];
    intent: Record<string, unknown>;
    createdAt?: string;
  }): Promise<PastaProofRestartJournal> {
    if (!SAFE_ID.test(input.runId)) throw new Error("restart journal run id is unsafe");
    if (!SAFE_ID.test(input.app)) throw new Error("restart journal app id is unsafe");
    validatePlan(input.plan);
    for (const step of input.plan) {
      if (!input.actors[step.actor]) throw new Error(`restart journal actor ${step.actor} is not bound`);
      if (validateAddress(input.actors[step.actor]) !== ValidationResult.VALID) {
        throw new Error(`restart journal actor ${step.actor} address is invalid`);
      }
      if (!Number.isSafeInteger(input.initialCounters[step.actor]) || input.initialCounters[step.actor] < 0) {
        throw new Error(`restart journal actor ${step.actor} counter is invalid`);
      }
    }
    await mkdir(path.dirname(input.filePath), { recursive: true });
    const info = await lstat(input.filePath).catch(() => undefined);
    if (info) throw new Error(`restart journal already exists: ${input.filePath}`);
    const base = {
      schema: PASTA_PROOF_RESTART_SCHEMA,
      app: input.app,
      runId: input.runId,
      chainId: SHADOWNET_CHAIN_ID,
      createdAt: iso(input.createdAt ?? new Date().toISOString(), "restart journal creation"),
      actors: input.actors,
      initialCounters: input.initialCounters,
      intent: project(input.intent),
      plan: input.plan,
    } as const;
    const state: JournalFile = { ...base, intentSha256: sha256(deterministicJsonBytes(intentCore(base))), events: [] };
    await atomicWrite(input.filePath, state);
    return new PastaProofRestartJournal(input.filePath, state);
  }

  static async open(filePath: string, expected: {
    app: string;
    runId: string;
    actors: Record<string, string>;
    plan: readonly PastaProofRestartStep[];
    intent: Record<string, unknown>;
    authenticateInitialCounters(counters: Readonly<Record<string, number>>): void | Promise<void>;
  }): Promise<PastaProofRestartJournal> {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("restart journal must be a regular non-symlink file");
    const bytes = await readFile(filePath);
    const state = JSON.parse(bytes.toString("utf8")) as JournalFile;
    if (!Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(state)))) throw new Error("restart journal is not canonical JSON");
    if (state.schema !== PASTA_PROOF_RESTART_SCHEMA || state.app !== expected.app || state.runId !== expected.runId || state.chainId !== SHADOWNET_CHAIN_ID) {
      throw new Error("restart journal identity differs");
    }
    validatePlan(state.plan);
    if (JSON.stringify(project(state.actors)) !== JSON.stringify(project(expected.actors))) throw new Error("restart journal actor identity differs");
    if (JSON.stringify(project(state.plan)) !== JSON.stringify(project(expected.plan))) throw new Error("restart journal semantic plan differs");
    if (JSON.stringify(state.intent) !== JSON.stringify(project(expected.intent))) throw new Error("restart journal authenticated intent differs");
    for (const [actor, counter] of Object.entries(state.initialCounters)) {
      if (!state.actors[actor] || !Number.isSafeInteger(counter) || counter < 0) throw new Error("restart journal initial counter binding is invalid");
    }
    for (const step of state.plan) {
      if (validateAddress(state.actors[step.actor] ?? "") !== ValidationResult.VALID) {
        throw new Error(`restart journal actor ${step.actor} address is invalid`);
      }
      if (!Number.isSafeInteger(state.initialCounters[step.actor])) {
        throw new Error(`restart journal actor ${step.actor} counter binding is missing`);
      }
    }
    await expected.authenticateInitialCounters(Object.freeze({ ...state.initialCounters }));
    const base = { schema: state.schema, app: state.app, runId: state.runId, chainId: state.chainId, createdAt: state.createdAt, actors: state.actors, initialCounters: state.initialCounters, intent: state.intent, plan: state.plan };
    if (sha256(deterministicJsonBytes(intentCore(base))) !== state.intentSha256) throw new Error("restart journal immutable intent hash differs");
    let previous = state.intentSha256;
    state.events.forEach((event, index) => {
      const { sha256: digest, ...unsigned } = event;
      if (event.index !== index + 1 || event.previousSha256 !== previous || !HASH_RE.test(digest)) throw new Error("restart journal event chain differs");
      if (sha256(deterministicJsonBytes(unsigned)) !== digest) throw new Error("restart journal event digest differs");
      previous = digest;
    });
    const journal = new PastaProofRestartJournal(filePath, state);
    journal.validatePrefix();
    return journal;
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async append(phase: Phase, step: PastaProofRestartStep, payload: Record<string, Projected>, timestampUtc = new Date().toISOString()): Promise<JournalEvent> {
    const unsigned = {
      index: this.state.events.length + 1,
      phase,
      stepId: step.id,
      actor: step.actor,
      timestampUtc: iso(timestampUtc, `${phase} timestamp`),
      previousSha256: this.state.events.at(-1)?.sha256 ?? this.state.intentSha256,
      payload,
    };
    const event: JournalEvent = { ...unsigned, sha256: sha256(deterministicJsonBytes(unsigned)) };
    this.state = { ...this.state, events: [...this.state.events, event] };
    await atomicWrite(this.filePath, this.state);
    return event;
  }

  private effectState(): Map<string, { prepared?: JournalEvent; submitted?: JournalEvent; applied?: JournalEvent; abandoned?: JournalEvent }> {
    const output = new Map<string, { prepared?: JournalEvent; submitted?: JournalEvent; applied?: JournalEvent; abandoned?: JournalEvent }>();
    for (const event of this.state.events) {
      let current = output.get(event.stepId) ?? {};
      if (event.phase === "PREPARED" || event.phase === "PIN_PREPARED") {
        if (current.abandoned) current = {};
        current.prepared = event;
      }
      else if (event.phase === "SUBMITTED") current.submitted = event;
      else if (event.phase === "APPLIED" || event.phase === "PIN_APPLIED") current.applied = event;
      else if (event.phase === "ABANDONED") current.abandoned = event;
      output.set(event.stepId, current);
    }
    return output;
  }

  private validatePrefix(): void {
    const effects = this.effectState();
    let incomplete = false;
    for (const step of this.state.plan) {
      const effect = effects.get(step.id);
      const applied = Boolean(effect?.applied);
      if (incomplete && applied) throw new Error("restart journal applied events are not a semantic prefix");
      if (!applied) incomplete = true;
    }
  }

  private nextIncomplete(): PastaProofRestartStep | undefined {
    const effects = this.effectState();
    return this.state.plan.find((step) => !effects.get(step.id)?.applied);
  }

  consumedManagerOperationCount(actor: PastaProofRestartActor): number {
    return this.state.events.filter((event) =>
      event.actor === actor
      && (event.phase === "APPLIED" || (event.phase === "ABANDONED" && event.payload.counterConsumed === true)),
    ).length;
  }

  expectedCurrentCounter(actor: PastaProofRestartActor): number {
    return this.initialCounter(actor) + this.consumedManagerOperationCount(actor);
  }

  private assertUniqueOperationHash(operationHash: string, ignoredStepId?: string): void {
    for (const event of this.state.events) {
      if (event.stepId === ignoredStepId) continue;
      if ((event.phase === "SUBMITTED" && event.payload.operationHash === operationHash)
        || (event.phase === "APPLIED" && (event.payload.receipt as any)?.operationHash === operationHash)) {
        throw new Error(`restart journal operation hash is already bound to ${event.stepId}`);
      }
    }
  }

  completedOperationCount(actor: PastaProofRestartActor): number {
    const effects = this.effectState();
    return this.state.plan.filter((step) => step.actor === actor && step.kind === "operation" && effects.get(step.id)?.applied).length;
  }

  initialCounter(actor: PastaProofRestartActor): number {
    const counter = this.state.initialCounters[actor];
    if (!Number.isSafeInteger(counter) || counter < 0) throw new Error(`restart journal has no authenticated ${actor} counter`);
    return counter;
  }

  appliedOperations(): Array<{
    step: PastaProofRestartStep;
    operationSequence: number;
    expectedCounter: number;
    descriptor: Projected;
    descriptorSha256: string;
    receipt: PastaUiLivePublicReceipt;
  }> {
    const effects = this.effectState();
    return this.state.plan.flatMap((step) => {
      if (step.kind !== "operation") return [];
      const effect = effects.get(step.id);
      if (!effect?.prepared || !effect.applied) return [];
      const operationSequence = Number(effect.prepared.payload.operationSequence);
      return [{
        step,
        operationSequence,
        expectedCounter: Number(effect.prepared.payload.expectedCounter),
        descriptor: effect.prepared.payload.descriptor,
        descriptorSha256: String(effect.prepared.payload.descriptorSha256),
        receipt: effect.applied.payload.receipt as PastaUiLivePublicReceipt,
      }];
    });
  }

  operationReceipts(): PastaUiLivePublicReceipt[] {
    return this.state.events.filter((event) => event.phase === "APPLIED").map((event) => event.payload.receipt as PastaUiLivePublicReceipt);
  }

  pinRecords(): Array<{ actor: PastaProofRestartActor; bytes: Uint8Array; value?: unknown; proof: PastaUiLivePinProof }> {
    const effects = this.effectState();
    return this.state.plan.flatMap((step) => {
      if (step.kind !== "pin") return [];
      const effect = effects.get(step.id);
      if (!effect?.prepared || !effect.applied) return [];
      const bytes = Buffer.from(String(effect.prepared.payload.bytesBase64), "base64");
      let value: unknown;
      try { value = JSON.parse(bytes.toString("utf8")); } catch { value = undefined; }
      return [{
        actor: step.actor,
        bytes: Uint8Array.from(bytes),
        ...(value === undefined ? {} : { value }),
        proof: effect.applied.payload.proof as PastaUiLivePinProof,
      }];
    });
  }

  appliedPin(stepId: string): { bytes: Uint8Array; proof: PastaUiLivePinProof } | undefined {
    const step = this.state.plan.find((candidate) => candidate.id === stepId);
    const effect = step ? this.effectState().get(step.id) : undefined;
    if (!step || step.kind !== "pin" || !effect?.prepared || !effect.applied) return undefined;
    return {
      bytes: Uint8Array.from(Buffer.from(String(effect.prepared.payload.bytesBase64), "base64")),
      proof: effect.applied.payload.proof as PastaUiLivePinProof,
    };
  }

  contractAddress(): string | undefined {
    return this.operationReceipts().find((receipt) => receipt.action === "originate")?.contractAddress;
  }

  pending(): Pending | null {
    const step = this.nextIncomplete();
    if (!step || step.kind !== "operation") return null;
    const effect = this.effectState().get(step.id);
    if (!effect?.prepared || effect.abandoned) return null;
    const payload = effect.prepared.payload;
    return {
      step,
      phase: effect.submitted ? "SUBMITTED" : "PREPARED",
      event: effect.submitted ?? effect.prepared,
      operationSequence: Number(payload.operationSequence),
      expectedCounter: Number(payload.expectedCounter),
      descriptor: payload.descriptor,
      descriptorSha256: String(payload.descriptorSha256),
      operationHash: effect.submitted ? String(effect.submitted.payload.operationHash) : undefined,
      contractAddress: effect.submitted?.payload.contractAddress ? String(effect.submitted.payload.contractAddress) : undefined,
    };
  }

  pendingPin(): { step: PastaProofRestartStep; bytes: Uint8Array; fileName: string; mimeType: string; sha256: string } | null {
    const step = this.nextIncomplete();
    if (!step || step.kind !== "pin") return null;
    const effect = this.effectState().get(step.id);
    if (!effect?.prepared || effect.abandoned) return null;
    return {
      step,
      bytes: Uint8Array.from(Buffer.from(String(effect.prepared.payload.bytesBase64), "base64")),
      fileName: String(effect.prepared.payload.fileName),
      mimeType: String(effect.prepared.payload.mimeType),
      sha256: String(effect.prepared.payload.bytesSha256),
    };
  }

  async reconcilePin(resolve: (input: { step: PastaProofRestartStep; bytes: Uint8Array; fileName: string; mimeType: string; sha256: string }) => Promise<
    { status: "absent" } | { status: "present"; proof: PastaUiLivePinProof }
  >): Promise<void> {
    const pending = this.pendingPin();
    if (!pending) return;
    const resolution = await resolve(pending);
    if (resolution.status === "absent") {
      const prepared = this.effectState().get(pending.step.id)?.prepared;
      if (!prepared) throw new Error("restart PIN_PREPARED event disappeared");
      await this.append("ABANDONED", pending.step, { preparedEventSha256: prepared.sha256, reason: "pin not present" });
      return;
    }
    await this.onPin(pending.step.actor, { proof: resolution.proof });
  }

  async reconcile(resolve: (input: Pending) => Promise<PastaProofRestartResolution>): Promise<void> {
    const pending = this.pending();
    if (!pending) return;
    const resolution = await resolve(pending);
    if (resolution.status === "rejected") {
      if (pending.phase !== "SUBMITTED" || resolution.operationHash !== pending.operationHash) {
        throw new Error("restart rejection does not match the exact SUBMITTED hash");
      }
      await this.append("ABANDONED", pending.step, {
        submittedEventSha256: pending.event.sha256,
        operationHash: resolution.operationHash,
        reason: resolution.reason,
        counterConsumed: resolution.counterConsumed,
      });
      return;
    }
    if (resolution.status === "absent") {
      if (pending.phase === "SUBMITTED") throw new Error("restart journal submitted operation is absent; manual reconciliation required");
      await this.append("ABANDONED", pending.step, { preparedEventSha256: pending.event.sha256 });
      return;
    }
    if (validateOperation(resolution.operationHash) !== ValidationResult.VALID || validateContractAddress(resolution.contractAddress) !== ValidationResult.VALID) {
      throw new Error("restart reconciliation returned invalid chain identifiers");
    }
    this.assertUniqueOperationHash(resolution.operationHash, pending.step.id);
    if (pending.operationHash && resolution.operationHash !== pending.operationHash) throw new Error("restart reconciliation hash differs from SUBMITTED");
    const expectedEntrypoints = pending.step.entrypoints ?? (pending.step.entrypoint ? [pending.step.entrypoint] : []);
    if (JSON.stringify(resolution.entrypoints) !== JSON.stringify(expectedEntrypoints)) {
      throw new Error("restart reconciliation entrypoints differ");
    }
    if (pending.phase === "PREPARED") {
      await this.append("SUBMITTED", pending.step, {
        operationSequence: pending.operationSequence,
        expectedCounter: pending.expectedCounter,
        descriptorSha256: pending.descriptorSha256,
        operationHash: resolution.operationHash,
        contractAddress: resolution.contractAddress,
      }, resolution.timestampUtc);
    }
    const receipt: PastaUiLivePublicReceipt = {
      schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
      sequence: pending.operationSequence,
      timestampUtc: resolution.timestampUtc,
      action: pending.step.action!,
      chainId: SHADOWNET_CHAIN_ID,
      signerAddress: this.state.actors[pending.step.actor],
      contractAddress: resolution.contractAddress,
      operationHash: resolution.operationHash,
      ...(resolution.entrypoints.length ? { entrypoints: resolution.entrypoints } : {}),
    };
    await this.append("APPLIED", pending.step, { receipt: project(receipt) as Record<string, Projected> }, resolution.timestampUtc);
  }

  beforeOperationSubmit(actor: PastaProofRestartActor, input: PastaUiLivePreparedOperation): Promise<void> {
    return this.serialized(async () => {
      const step = this.nextIncomplete();
      const expectedEntrypoints = step?.entrypoints ?? (step?.entrypoint ? [step.entrypoint] : []);
      if (!step || step.kind !== "operation" || step.actor !== actor || step.action !== input.action || JSON.stringify(input.entrypoints) !== JSON.stringify(expectedEntrypoints)) {
        throw new Error("restart journal operation differs from the next semantic step");
      }
      const existing = this.effectState().get(step.id);
      if (existing?.prepared && !existing.abandoned) throw new Error("restart journal pending operation requires reconciliation");
      const expectedSequence = this.completedOperationCount(actor) + 1;
      if (input.operationSequence !== expectedSequence) throw new Error(`restart operation sequence must be ${expectedSequence}`);
      if (input.chainId !== SHADOWNET_CHAIN_ID || input.signerAddress !== this.state.actors[actor]) {
        throw new Error("restart operation chain or signer identity differs");
      }
      if (input.descriptor.kind !== input.action) throw new Error("restart operation descriptor action differs");
      if (input.descriptor.kind === "originate") {
        if (input.contractAddress) throw new Error("restart origination cannot have a prepared contract address");
      } else {
        const descriptorContract = input.descriptor.kind === "call"
          ? input.descriptor.call.contractAddress
          : input.descriptor.calls[0]?.contractAddress;
        if (!descriptorContract || input.contractAddress !== descriptorContract || validateContractAddress(descriptorContract) !== ValidationResult.VALID) {
          throw new Error("restart operation prepared contract identity differs");
        }
      }
      const descriptor = project(input.descriptor);
      await this.append("PREPARED", step, {
        operationSequence: input.operationSequence,
        expectedCounter: this.initialCounter(actor) + this.consumedManagerOperationCount(actor) + 1,
        descriptor,
        descriptorSha256: sha256(deterministicJsonBytes(descriptor)),
      }, input.timestampUtc);
    });
  }

  onOperationSubmitted(actor: PastaProofRestartActor, input: PastaUiLiveSubmittedOperation): Promise<void> {
    return this.serialized(async () => {
      const pending = this.pending();
      if (!pending || pending.step.actor !== actor || pending.phase !== "PREPARED") throw new Error("restart SUBMITTED lacks matching PREPARED");
      if (validateOperation(input.operationHash) !== ValidationResult.VALID) throw new Error("restart SUBMITTED operation hash is invalid");
      this.assertUniqueOperationHash(input.operationHash, pending.step.id);
      if (
        input.operationSequence !== pending.operationSequence
        || input.action !== pending.step.action
        || input.chainId !== SHADOWNET_CHAIN_ID
        || input.signerAddress !== this.state.actors[actor]
        || !equalProjected(input.entrypoints, pending.step.entrypoints ?? (pending.step.entrypoint ? [pending.step.entrypoint] : []))
      ) {
        throw new Error("restart SUBMITTED identity differs from PREPARED");
      }
      if (input.contractAddress && validateContractAddress(input.contractAddress) !== ValidationResult.VALID) {
        throw new Error("restart SUBMITTED contract address is invalid");
      }
      const descriptor = project(input.descriptor);
      if (sha256(deterministicJsonBytes(descriptor)) !== pending.descriptorSha256) throw new Error("restart SUBMITTED descriptor differs");
      await this.append("SUBMITTED", pending.step, {
        operationSequence: input.operationSequence,
        expectedCounter: pending.expectedCounter,
        descriptorSha256: pending.descriptorSha256,
        operationHash: input.operationHash,
        ...(input.contractAddress ? { contractAddress: input.contractAddress } : {}),
      }, input.timestampUtc);
    });
  }

  onReceipt(actor: PastaProofRestartActor, receipt: PastaUiLivePublicReceipt): Promise<void> {
    if (receipt.action !== "originate" && receipt.action !== "call" && receipt.action !== "batch") return Promise.resolve();
    return this.serialized(async () => {
      const pending = this.pending();
      if (!pending || pending.step.actor !== actor || pending.phase !== "SUBMITTED" || receipt.operationHash !== pending.operationHash) {
        throw new Error("restart APPLIED receipt lacks matching SUBMITTED");
      }
      const expectedEntrypoints = pending.step.entrypoints ?? (pending.step.entrypoint ? [pending.step.entrypoint] : []);
      if (
        receipt.schema !== PASTA_UI_LIVE_RECEIPT_SCHEMA
        || receipt.sequence !== pending.operationSequence
        || receipt.action !== pending.step.action
        || receipt.chainId !== SHADOWNET_CHAIN_ID
        || receipt.signerAddress !== this.state.actors[actor]
        || validateOperation(receipt.operationHash ?? "") !== ValidationResult.VALID
        || validateContractAddress(receipt.contractAddress ?? "") !== ValidationResult.VALID
        || !equalProjected(receipt.entrypoints ?? [], expectedEntrypoints)
      ) {
        throw new Error("restart APPLIED receipt identity differs from SUBMITTED");
      }
      iso(receipt.timestampUtc, "restart APPLIED receipt timestamp");
      if (pending.contractAddress && receipt.contractAddress !== pending.contractAddress) {
        throw new Error("restart APPLIED contract differs from SUBMITTED");
      }
      await this.append("APPLIED", pending.step, { receipt: project(receipt) as Record<string, Projected> }, receipt.timestampUtc);
    });
  }

  beforePin(actor: PastaProofRestartActor, input: { bytes: Uint8Array; fileName: string; mimeType: string }): Promise<void> {
    return this.serialized(async () => {
      const step = this.nextIncomplete();
      if (!step || step.kind !== "pin" || step.actor !== actor || step.fileName !== input.fileName) throw new Error("restart pin differs from next semantic step");
      const existing = this.effectState().get(step.id);
      if (existing?.prepared && !existing.abandoned) throw new Error("restart pending pin requires reconciliation");
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) throw new Error("restart pin bytes are empty");
      await this.append("PIN_PREPARED", step, {
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteLength: input.bytes.byteLength,
        bytesSha256: sha256(input.bytes),
        bytesBase64: Buffer.from(input.bytes).toString("base64"),
      });
    });
  }

  onPin(actor: PastaProofRestartActor, input: { proof: PastaUiLivePinProof }): Promise<void> {
    return this.serialized(async () => {
      const step = this.nextIncomplete();
      const prepared = step ? this.effectState().get(step.id)?.prepared : undefined;
      if (!step || step.kind !== "pin" || step.actor !== actor || !prepared) throw new Error("restart PIN_APPLIED lacks PIN_PREPARED");
      if (
        input.proof.sha256 !== prepared.payload.bytesSha256
        || input.proof.byteLength !== prepared.payload.byteLength
        || input.proof.fileName !== step.fileName
        || input.proof.mimeType !== prepared.payload.mimeType
        || input.proof.uri !== `ipfs://${input.proof.cid}`
        || input.proof.publicGatewayVerified !== true
      ) {
        throw new Error("restart pin proof differs from prepared bytes");
      }
      const receipt: PastaUiLivePublicReceipt = {
        schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
        sequence: this.state.plan.filter((item) => item.actor === actor && item.kind === "pin" && this.effectState().get(item.id)?.applied).length + 1,
        timestampUtc: new Date().toISOString(),
        action: prepared.payload.mimeType === "application/json" ? "pin_json" : "pin_blob",
        chainId: SHADOWNET_CHAIN_ID,
        signerAddress: this.state.actors[actor],
        cid: input.proof.cid,
        ipfsUri: input.proof.uri,
        publicGatewayUrl: input.proof.publicGatewayUrl,
        sha256: input.proof.sha256,
        byteCount: input.proof.byteLength,
        fileName: input.proof.fileName,
      };
      await this.append("PIN_APPLIED", step, { proof: project(input.proof) as Record<string, Projected>, receipt: project(receipt) as Record<string, Projected> });
    });
  }

  async replayOrHandle(actor: PastaProofRestartActor, request: PastaUiLiveBridgeRequest, handle: () => Promise<unknown>): Promise<unknown> {
    if (request.action !== "pin_json" && request.action !== "pin_blob" && request.action !== "originate" && request.action !== "call" && request.action !== "batch") return handle();
    const completed = this.state.plan.filter((step) =>
      step.actor === actor
      && step.transport !== "direct"
      && this.effectState().get(step.id)?.applied);
    const cursor = this.replayCursor.get(actor) ?? 0;
    const step = completed[cursor];
    if (!step) return handle();
    const effect = this.effectState().get(step.id)!;
    const pinIdentity = request.action === "pin_json" || request.action === "pin_blob" ? requestPinIdentity(request) : undefined;
    const matches = step.kind === "pin"
      ? Boolean(
          pinIdentity
          && (request.action === "pin_json" || request.action === "pin_blob")
          && pinIdentity.fileName === step.fileName
          && pinIdentity.mimeType === effect.prepared?.payload.mimeType
          && pinIdentity.sha256 === effect.prepared?.payload.bytesSha256)
      : request.action === step.action && equalProjected(requestOperationDescriptor(request), effect.prepared?.payload.descriptor) && (
          step.action === "call"
            ? (request.payload as any)?.call?.entrypoint === step.entrypoint
            : step.action === "batch"
              ? JSON.stringify((request.payload as any)?.calls?.map((call: any) => call?.entrypoint)) === JSON.stringify(step.entrypoints)
              : true
        );
    if (!matches) throw new Error(`restart replay request differs from completed step ${step.id}`);
    this.replayCursor.set(actor, cursor + 1);
    const applied = effect.applied!;
    if (step.kind === "pin") return { pin: applied.payload.proof, receipt: applied.payload.receipt };
    const receipt = applied.payload.receipt as PastaUiLivePublicReceipt;
    return { contractAddress: receipt.contractAddress, operationHash: receipt.operationHash, confirmationLevel: 1, receipt };
  }
}
