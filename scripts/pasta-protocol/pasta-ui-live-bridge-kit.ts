import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { MichelsonMap, type TezosToolkit } from "@taquito/taquito";
import { validateContractAddress, ValidationResult } from "@taquito/utils";
import type { Page } from "playwright";

import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import { declareReadOnlyReader, readWithBoundedRetry } from "./pasta-readonly-retry";

export const PASTA_UI_LIVE_BRIDGE_SCHEMA = "pastaprotocol-ui-live-bridge@1";
export const PASTA_UI_LIVE_RECEIPT_SCHEMA = "pastaprotocol-ui-live-receipt@1";
export const PASTA_UI_LIVE_VIEW_RECEIPT_SCHEMA = "pastaprotocol-ui-live-view-receipt@1";

const BRIDGE_PATH = "/__pasta-proof/bridge";
const HEALTH_PATH = "/__pasta-proof/health";
const DEFAULT_MAX_BODY_BYTES = 5_000_000;
const MAX_PIN_BYTES = 2_000_000;
const MAX_SCRIPT_CODE_JSON_BYTES = 2_000_000;
const SAFE_ACTION = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_ENTRYPOINT = /^[A-Za-z][A-Za-z0-9_.%@-]{0,127}$/;
const SAFE_FILENAME = /^[^\\/\0\r\n]{1,255}$/;
const ADDRESS_RE = /^(?:tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const BRIDGE_ACTIONS = new Set([
  "active_protocol",
  "balance",
  "batch",
  "block_header",
  "call",
  "chain_check",
  "connect",
  "contract_at",
  "estimate_call",
  "execute_view",
  "originate",
  "pin_blob",
  "pin_json",
  "read_storage",
  "script_code_hash",
]);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export type PastaUiLiveAction =
  | "active_protocol"
  | "balance"
  | "batch"
  | "block_header"
  | "call"
  | "chain_check"
  | "connect"
  | "contract_at"
  | "estimate_call"
  | "execute_view"
  | "originate"
  | "pin_blob"
  | "pin_json"
  | "read_storage"
  | "script_code_hash";

export type PastaUiLiveReceiptAction = Exclude<PastaUiLiveAction, "execute_view">;

export type PastaUiLiveBridgeRequest = {
  schema: typeof PASTA_UI_LIVE_BRIDGE_SCHEMA;
  id: string;
  action: PastaUiLiveAction;
  payload: unknown;
};

export type PastaUiLivePublicReceipt = {
  schema: typeof PASTA_UI_LIVE_RECEIPT_SCHEMA;
  sequence: number;
  timestampUtc: string;
  action: PastaUiLiveReceiptAction;
  chainId: string;
  signerAddress?: string;
  contractAddress?: string;
  operationHash?: string;
  entrypoints?: string[];
  cid?: string;
  ipfsUri?: string;
  publicGatewayUrl?: string;
  sha256?: string;
  byteCount?: number;
  fileName?: string;
};

export type PastaUiLiveViewReceipt = {
  schema: typeof PASTA_UI_LIVE_VIEW_RECEIPT_SCHEMA;
  sequence: number;
  action: "execute_view";
  chainId: string;
  viewCaller: string;
  contractAddress: string;
  viewName: string;
  requestSha256: string;
  resultSha256: string;
};

export type PastaUiLivePinProof = {
  cid: string;
  uri: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  localGatewayUrl: string;
  publicGatewayUrl: string;
  publicGatewayVerified: true;
  verificationAttempts: number;
};

export type PastaUiLiveFundingAuthorization = {
  balanceMutez: number;
  requiredBalanceMutez: number;
  estimatedOriginationMutez: number;
  operationReserveMutez: number;
};

export type PastaUiLiveContractViewAuthorization = {
  contractAddress: string;
  viewNames: ReadonlySet<string>;
  /**
   * Admit the session's exact actor address as Taquito's viewCaller.
   */
  allowSessionSigner?: boolean;
  /**
   * Admit only these already-authorized KT1s as viewCaller values. This
   * supports pre-connect pages whose semantic caller is the router contract.
   */
  allowedCallerContractAddresses?: ReadonlySet<string>;
};

export type PastaUiLiveReadOnlyContractAuthorization = {
  contractAddress: string;
};

export type PastaUiLiveBridgeHandler = (
  request: PastaUiLiveBridgeRequest,
) => Promise<unknown>;

export type PastaUiLiveLoopbackServer = {
  origin: string;
  sessionToken: string;
  close(): Promise<void>;
};

export type StartPastaUiLiveLoopbackServerInput = {
  staticRoot: string;
  handleAction: PastaUiLiveBridgeHandler;
  maxBodyBytes?: number;
};

export type PastaUiLiveAppliedOperationAssertion = {
  action: "originate" | "batch" | "call";
  operationHash: string;
  contractAddress?: string;
  entrypoints: string[];
};

export type PastaUiLiveSignerOperationAction = PastaUiLiveAppliedOperationAssertion["action"];

export type PastaUiLiveContractCall = {
  contractAddress: string;
  entrypoint: string;
  payload: unknown;
};

export type PastaUiLiveOperationDescriptor =
  | { kind: "originate"; code: unknown; storage: unknown }
  | { kind: "batch"; calls: readonly PastaUiLiveContractCall[] }
  | { kind: "call"; call: PastaUiLiveContractCall; sendOptions: unknown };

export type PastaUiLivePreparedOperation = {
  status: "PREPARED";
  operationSequence: number;
  timestampUtc: string;
  action: PastaUiLiveSignerOperationAction;
  chainId: string;
  signerAddress: string;
  contractAddress?: string;
  entrypoints: string[];
  /**
   * Exact decoded and validated operation input. This remains in memory so a
   * domain runner can clone, canonicalize, and redact it before durable
   * journaling; the bridge never persists it itself.
   */
  descriptor: PastaUiLiveOperationDescriptor;
};

export type PastaUiLiveSubmittedOperation = Omit<PastaUiLivePreparedOperation, "status" | "timestampUtc"> & {
  status: "SUBMITTED";
  timestampUtc: string;
  operationHash: string;
};

export type TaquitoPastaUiLiveSessionOptions = {
  tezos: TezosToolkit;
  signerAddress: string;
  expectedChainId: string;
  /**
   * Contracts originated and independently verified by another signer session
   * in the same proof run. This allowlist is Node-only and is never accepted
   * from a browser request.
   */
  allowedContractAddresses?: ReadonlySet<string>;
  assertExpectedChain(stage: string): Promise<string>;
  allowedEntrypoints: ReadonlySet<string>;
  /**
   * Optional initial contract/view/caller policies. Contracts originated later
   * can be authorized through `authorizeContractViews` before browser use.
   */
  allowedContractViews?: readonly PastaUiLiveContractViewAuthorization[];
  initialReceiptSequence?: number;
  initialOperationSequence?: number;
  minimumActionBalanceMutez?: number;
  pinJson(input: { value: unknown; fileName: string }): Promise<PastaUiLivePinProof>;
  pinBlob?(input: { bytes: Uint8Array; fileName: string; mimeType: string }): Promise<PastaUiLivePinProof>;
  validateOrigination?(input: { code: unknown; storage: unknown }): void | Promise<void>;
  validateCall?(input: { contractAddress: string; entrypoint: string; payload: unknown }): void | Promise<void>;
  beforeOperationSubmit?(operation: PastaUiLivePreparedOperation): void | Promise<void>;
  onOperationSubmitted?(operation: PastaUiLiveSubmittedOperation): void | Promise<void>;
  assertOperationApplied?(input: PastaUiLiveAppliedOperationAssertion): void | Promise<void>;
  projectStorage?(storage: unknown): unknown | Promise<unknown>;
  /**
   * Runs against the exact bytes the bridge is about to hand to the proof
   * pinner. A rejection here occurs before the external IPFS side effect.
   */
  beforePin?(input: {
    value?: unknown;
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
  }): void | Promise<void>;
  onPin?(input: { value?: unknown; bytes?: Uint8Array; proof: PastaUiLivePinProof }): void | Promise<void>;
  onReceipt?(receipt: PastaUiLivePublicReceipt): void | Promise<void>;
  onViewReceipt?(receipt: PastaUiLiveViewReceipt): void | Promise<void>;
};

function deterministicPinJson(value: unknown, ancestors = new Set<object>()): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "bigint") throw new TypeError("pin JSON does not support bigint values");
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown> & { toJSON?: () => unknown };
  if (ancestors.has(record)) throw new TypeError("pin JSON does not support cyclic values");
  ancestors.add(record);
  try {
    if (typeof record.toJSON === "function") return deterministicPinJson(record.toJSON(), ancestors);
    if (Array.isArray(record)) {
      return `[${record.map((entry) => deterministicPinJson(entry, ancestors) ?? "null").join(",")}]`;
    }
    const properties: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const serialized = deterministicPinJson(record[key], ancestors);
      if (serialized !== undefined) properties.push(`${JSON.stringify(key)}:${serialized}`);
    }
    return `{${properties.join(",")}}`;
  } finally {
    ancestors.delete(record);
  }
}

function deterministicPinJsonBytes(value: unknown): Uint8Array {
  const serialized = deterministicPinJson(value);
  if (serialized === undefined) throw new TypeError("pin JSON root must be serializable");
  return Buffer.from(serialized, "utf8");
}

export class PastaUiLiveBridgeError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "PastaUiLiveBridgeError";
  }
}

function fail(message: string, statusCode = 400): never {
  throw new PastaUiLiveBridgeError(message, statusCode);
}

function publicErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  message = message
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "REDACTED")
    .replace(/\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/g, "REDACTED")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*\b/gi, "Bearer REDACTED")
    .replace(/\b(?:api[_ -]?key|authorization|mnemonic|passphrase|password|private[_ -]?key|secret[_ -]?key|seed[_ -]?phrase)\s*[:=]\s*[^\s"'<>]{8,}/gi, "credential=REDACTED");
  return message.slice(0, 1_000) || "bridge action failed";
}

export class PastaUiLiveSubmittedOperationError extends PastaUiLiveBridgeError {
  readonly code = "PASTA_UI_LIVE_OPERATION_SUBMITTED_UNRESOLVED";
  readonly operationStatus = "SUBMITTED";
  readonly retrySafe = false;
  readonly action: PastaUiLiveSignerOperationAction;
  readonly operationHash: string;
  readonly contractAddress?: string;
  readonly entrypoints: string[];

  constructor(
    assertion: PastaUiLiveAppliedOperationAssertion,
    confirmationError: unknown,
    verificationError: unknown,
  ) {
    const confirmationMessage = publicErrorMessage(confirmationError).slice(0, 250);
    const verificationMessage = publicErrorMessage(verificationError).slice(0, 250);
    super(
      `Operation ${assertion.operationHash} was submitted. ` +
      "Do not retry or submit this action again; reconcile the existing operation hash. " +
      `Confirmation failed (${confirmationMessage}); exact-hash applied-state verification is unresolved ` +
      `(${verificationMessage}).`,
      409,
    );
    this.name = "PastaUiLiveSubmittedOperationError";
    this.action = assertion.action;
    this.operationHash = assertion.operationHash;
    if (assertion.contractAddress) this.contractAddress = assertion.contractAddress;
    this.entrypoints = [...assertion.entrypoints];
  }
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readRequestBytes(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumBytes) fail(`bridge request exceeds ${maximumBytes} bytes`, 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", String(bytes.byteLength));
  response.setHeader("x-content-type-options", "nosniff");
  response.end(bytes);
}

function parseBridgeRequest(value: unknown): PastaUiLiveBridgeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("bridge request must be an object");
  const record = value as Record<string, unknown>;
  if (record.schema !== PASTA_UI_LIVE_BRIDGE_SCHEMA) fail("unsupported bridge request schema");
  if (typeof record.id !== "string" || !/^[a-zA-Z0-9._-]{1,96}$/.test(record.id)) {
    fail("bridge request id is invalid");
  }
  if (typeof record.action !== "string" || !SAFE_ACTION.test(record.action) || !BRIDGE_ACTIONS.has(record.action)) {
    fail("bridge action is not allowed");
  }
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: record.id,
    action: record.action as PastaUiLiveAction,
    payload: record.payload ?? null,
  };
}

async function serveStaticFile(
  staticRoot: string,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("allow", "GET, HEAD");
    response.end("method not allowed");
    return;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    response.statusCode = 400;
    response.end("malformed path");
    return;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    response.statusCode = 400;
    response.end("unsafe path");
    return;
  }
  let requested = path.resolve(staticRoot, `.${decoded}`);
  if (!isInside(staticRoot, requested)) {
    response.statusCode = 403;
    response.end("forbidden");
    return;
  }
  let fileStat;
  try {
    fileStat = await stat(requested);
    if (fileStat.isDirectory()) {
      requested = path.join(requested, "index.html");
      fileStat = await stat(requested);
    }
    const resolved = await realpath(requested);
    if (!isInside(staticRoot, resolved) || !fileStat.isFile()) throw new Error("not a file");
    requested = resolved;
  } catch {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  response.statusCode = 200;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-length", String(fileStat.size));
  response.setHeader("content-type", MIME_TYPES.get(path.extname(requested).toLowerCase()) || "application/octet-stream");
  response.setHeader("x-content-type-options", "nosniff");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(requested).pipe(response);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  const closed = once(server, "close");
  server.close();
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await closed;
}

export async function startPastaUiLiveLoopbackServer(
  input: StartPastaUiLiveLoopbackServerInput,
): Promise<PastaUiLiveLoopbackServer> {
  const staticRoot = await realpath(input.staticRoot);
  const rootStat = await stat(staticRoot);
  if (!rootStat.isDirectory()) fail("static root must be a directory");
  const maximumBytes = input.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1_000 || maximumBytes > 20_000_000) {
    fail("bridge body limit must be an integer from 1000 through 20000000 bytes");
  }
  const sessionToken = randomBytes(32).toString("base64url");
  let origin = "";
  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url || "/", "http://loopback.invalid");
      if (requestUrl.pathname === HEALTH_PATH && request.method === "GET") {
        writeJson(response, 200, { schema: PASTA_UI_LIVE_BRIDGE_SCHEMA, status: "ready" });
        return;
      }
      if (requestUrl.pathname === "/api/auth/user" && request.method === "GET") {
        writeJson(response, 200, { roles: [], effectivePermissions: {} });
        return;
      }
      if (requestUrl.pathname === "/api/system/logs/client" && request.method === "POST") {
        await readRequestBytes(request, 250_000);
        response.statusCode = 204;
        response.setHeader("cache-control", "no-store");
        response.end();
        return;
      }
      if (requestUrl.pathname === "/favicon.ico") {
        response.statusCode = 204;
        response.end();
        return;
      }
      if (requestUrl.pathname !== BRIDGE_PATH) {
        await serveStaticFile(staticRoot, request, response, requestUrl.pathname);
        return;
      }
      if (request.method !== "POST") fail("bridge accepts POST only", 405);
      if (request.headers.origin !== origin) fail("bridge request origin is not the proof loopback origin", 403);
      const fetchSite = request.headers["sec-fetch-site"];
      if (fetchSite && fetchSite !== "same-origin") fail("bridge request is not same-origin", 403);
      if (request.headers["x-pasta-proof-session"] !== sessionToken) fail("bridge session is invalid", 403);
      if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        fail("bridge requires application/json", 415);
      }
      const bytes = await readRequestBytes(request, maximumBytes);
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString("utf8"));
      } catch {
        fail("bridge request is not valid JSON");
      }
      const bridgeRequest = parseBridgeRequest(parsed);
      const result = await input.handleAction(bridgeRequest);
      writeJson(response, 200, {
        schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
        id: bridgeRequest.id,
        ok: true,
        result,
      });
    })().catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const statusCode = error instanceof PastaUiLiveBridgeError ? error.statusCode : 500;
      writeJson(response, statusCode, {
        schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
        ok: false,
        error: { message: publicErrorMessage(error) },
      });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address !== "object") {
    await closeServer(server);
    fail("loopback bridge did not expose a TCP address", 500);
  }
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    sessionToken,
    close: () => closeServer(server),
  };
}

export function decodePastaUiLiveValue(value: unknown): unknown {
  let visited = 0;
  const decode = (current: unknown, depth: number): unknown => {
    visited += 1;
    if (visited > 100_000 || depth > 64) fail("bridge payload is too deeply nested");
    if (current === null || typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
      return current;
    }
    if (Array.isArray(current)) return current.map((entry) => decode(entry, depth + 1));
    if (!current || typeof current !== "object") fail("bridge payload contains an unsupported value");
    const record = current as Record<string, unknown>;
    if (record.__pastaBridgeType === "bigint") {
      if (typeof record.value !== "string" || !/^-?[0-9]+$/.test(record.value)) fail("bridge bigint is invalid");
      return record.value;
    }
    if (record.__pastaBridgeType === "map") {
      if (!Array.isArray(record.entries)) fail("bridge map entries are invalid");
      const map = new MichelsonMap<any, any>();
      for (const entry of record.entries) {
        if (!Array.isArray(entry) || entry.length !== 2) fail("bridge map entry is invalid");
        map.set(decode(entry[0], depth + 1), decode(entry[1], depth + 1));
      }
      return map;
    }
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, child] of Object.entries(record)) {
      if (PROHIBITED_KEYS.has(key)) fail(`bridge payload key is prohibited: ${key}`);
      output[key] = decode(child, depth + 1);
    }
    return output;
  };
  return decode(value, 0);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  label: string,
  expectedKeys: readonly string[],
): void {
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || PROHIBITED_KEYS.has(key)) ||
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    fail(`${label} must contain exactly ${expectedKeys.join(", ")}`);
  }
}

function requireAddress(value: unknown, label: string, contractOnly = false): string {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) fail(`${label} is not a Tezos address`);
  if (contractOnly && validateContractAddress(value) !== ValidationResult.VALID) fail(`${label} is not a KT1 contract`);
  return value;
}

function requireFileName(value: unknown): string {
  if (typeof value !== "string" || !SAFE_FILENAME.test(value.trim())) fail("pin file name is invalid");
  return value.trim();
}

function requireSafeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
  return Number(value);
}

function hashPastaUiLiveScriptCode(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) fail("on-chain script code must be a non-empty array", 502);
  if (value.some((section) => !section || typeof section !== "object" || Array.isArray(section))) {
    fail("on-chain script code sections must be Micheline objects", 502);
  }
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    fail("on-chain script code is not JSON serializable", 502);
  }
  const bytes = Buffer.from(json, "utf8");
  if (bytes.byteLength > MAX_SCRIPT_CODE_JSON_BYTES) {
    fail(`on-chain script code exceeds ${MAX_SCRIPT_CODE_JSON_BYTES} bytes`, 502);
  }
  try {
    return hashMichelsonScriptCode(value);
  } catch (error) {
    fail(`on-chain script code is not a canonical Michelson contract: ${error instanceof Error ? error.message : String(error)}`, 502);
  }
}

export const PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS = Object.freeze({
  maximumDepth: 16,
  maximumNodes: 10_000,
  maximumArrayEntries: 1_000,
  maximumMapEntries: 1_000,
  maximumObjectKeys: 256,
  maximumStringBytes: 262_144,
  maximumTotalStringBytes: 1_000_000,
});

export const PASTA_UI_LIVE_ENTRYPOINT_PROJECTION_MAXIMUM_DEPTH = 32;

type ProjectionMethod = (...args: never[]) => unknown;

function projectionMethod(value: object, name: string): ProjectionMethod | undefined {
  let cursor: object | null = value;
  for (let level = 0; cursor && level < 8; level += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor) return typeof descriptor.value === "function" ? descriptor.value as ProjectionMethod : undefined;
    cursor = Object.getPrototypeOf(cursor);
  }
  return undefined;
}

function isBigNumberProjectionValue(value: object): boolean {
  let cursor: object | null = Object.getPrototypeOf(value);
  for (let level = 0; cursor && level < 8; level += 1) {
    const marker = Object.getOwnPropertyDescriptor(cursor, "_isBigNumber");
    if (marker?.value === true) {
      return Boolean(projectionMethod(value, "toNumber") && projectionMethod(value, "toFixed"));
    }
    cursor = Object.getPrototypeOf(cursor);
  }
  return false;
}

function boundedProjectionFailure(reason: string): never {
  fail(
    `storage projection is not bounded: ${reason}; projectStorage must return only bounded primitives, plain objects, arrays, BigNumber values, or MichelsonMap values`,
    500,
  );
}

/**
 * Converts a deliberately small storage projection into JSON-safe bridge data.
 * Raw Taquito abstractions are intentionally rejected: a projectStorage callback
 * must select the finite values the browser actually needs before this boundary.
 */
function serializePastaUiLiveProjection(value: unknown, maximumDepth: number): unknown {
  const limits = { ...PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS, maximumDepth };
  const seen = new WeakSet<object>();
  let nodes = 0;
  let stringBytes = 0;

  const chargeString = (text: string, label: string): string => {
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > limits.maximumStringBytes) boundedProjectionFailure(`${label} exceeds ${limits.maximumStringBytes} UTF-8 bytes`);
    stringBytes += bytes;
    if (stringBytes > limits.maximumTotalStringBytes) {
      boundedProjectionFailure(`combined strings exceed ${limits.maximumTotalStringBytes} UTF-8 bytes`);
    }
    return text;
  };

  const markSeen = (candidate: object): void => {
    if (seen.has(candidate)) boundedProjectionFailure("cycles and shared object references are prohibited");
    seen.add(candidate);
  };

  const visit = (candidate: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > limits.maximumNodes) boundedProjectionFailure(`projection exceeds ${limits.maximumNodes} nodes`);
    if (depth > limits.maximumDepth) boundedProjectionFailure(`projection exceeds depth ${limits.maximumDepth}`);
    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") return chargeString(candidate, "string value");
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) boundedProjectionFailure("non-finite numbers are prohibited");
      return candidate;
    }
    if (typeof candidate === "bigint") return chargeString(candidate.toString(), "bigint value");
    if (!candidate || typeof candidate !== "object") {
      boundedProjectionFailure(`unsupported ${typeof candidate} value`);
    }

    markSeen(candidate);
    if (Array.isArray(candidate)) {
      if (candidate.length > limits.maximumArrayEntries) {
        boundedProjectionFailure(`array exceeds ${limits.maximumArrayEntries} entries`);
      }
      return candidate.map((entry) => visit(entry, depth + 1));
    }

    if (isBigNumberProjectionValue(candidate)) {
      const toNumber = projectionMethod(candidate, "toNumber");
      const toFixed = projectionMethod(candidate, "toFixed");
      try {
        const numeric = toNumber?.call(candidate);
        if (typeof numeric === "number" && Number.isFinite(numeric)) return numeric;
        const fixed = toFixed?.call(candidate);
        if (typeof fixed === "string") return chargeString(fixed, "BigNumber value");
      } catch {
        boundedProjectionFailure("BigNumber conversion failed");
      }
      boundedProjectionFailure("BigNumber conversion did not produce a finite number or decimal string");
    }

    const entries = projectionMethod(candidate, "entries");
    const set = projectionMethod(candidate, "set");
    if (entries && set) {
      let iterable: unknown;
      try {
        iterable = entries.call(candidate);
      } catch {
        boundedProjectionFailure("MichelsonMap entries could not be read");
      }
      if (!iterable || typeof iterable !== "object" || typeof projectionMethod(iterable, "next") !== "function") {
        boundedProjectionFailure("MichelsonMap entries did not return an iterator");
      }
      const output: Array<[unknown, unknown]> = [];
      const iterator = iterable as Iterator<[unknown, unknown]>;
      for (;;) {
        const step = iterator.next();
        if (step.done) break;
        if (output.length >= limits.maximumMapEntries) {
          boundedProjectionFailure(`MichelsonMap exceeds ${limits.maximumMapEntries} entries`);
        }
        if (!Array.isArray(step.value) || step.value.length !== 2) {
          boundedProjectionFailure("MichelsonMap entry must be a key/value pair");
        }
        output.push([visit(step.value[0], depth + 1), visit(step.value[1], depth + 1)]);
      }
      return { __pastaBridgeType: "map", entries: output };
    }

    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      boundedProjectionFailure("unsupported non-plain object (raw Taquito abstractions are prohibited)");
    }
    const keys = Reflect.ownKeys(candidate);
    if (keys.length > limits.maximumObjectKeys) {
      boundedProjectionFailure(`plain object exceeds ${limits.maximumObjectKeys} keys`);
    }
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") boundedProjectionFailure("symbol keys are prohibited");
      if (PROHIBITED_KEYS.has(key)) boundedProjectionFailure(`plain object key is prohibited: ${key}`);
      chargeString(key, "plain object key");
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !("value" in descriptor)) {
        boundedProjectionFailure(`plain object accessors are prohibited: ${key}`);
      }
      if (typeof descriptor.value === "function") boundedProjectionFailure(`plain object functions are prohibited: ${key}`);
      output[key] = visit(descriptor.value, depth + 1);
    }
    return output;
  };

  return visit(value, 0);
}

export function serializePastaUiLiveStorageProjection(value: unknown): unknown {
  return serializePastaUiLiveProjection(value, PASTA_UI_LIVE_STORAGE_PROJECTION_LIMITS.maximumDepth);
}

/**
 * Preserve only Taquito's plain Micheline entrypoint type map across the browser
 * proof bridge. Provider, schema-class, method, and RPC objects are deliberately
 * excluded so a Studio can inspect an on-chain parameter shape without gaining
 * a new capability or traversing an unbounded abstraction graph.
 */
export function serializePastaUiLiveEntrypoints(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  const normalized = serializePastaUiLiveProjection(value, PASTA_UI_LIVE_ENTRYPOINT_PROJECTION_MAXIMUM_DEPTH);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    boundedProjectionFailure("entrypoint schemas must be a plain object");
  }

  const validateMicheline = (candidate: unknown, label: string): void => {
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        validateMicheline(candidate[index], `${label}[${index}]`);
      }
      return;
    }
    if (!candidate || typeof candidate !== "object") {
      boundedProjectionFailure(`${label} is not Micheline`);
    }
    const node = candidate as Record<string, unknown>;
    const keys = Object.keys(node);
    if (typeof node.prim === "string") {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(node.prim)) {
        boundedProjectionFailure(`${label}.prim is invalid`);
      }
      if (keys.some((key) => !["prim", "args", "annots"].includes(key))) {
        boundedProjectionFailure(`${label} contains a non-Micheline primitive field`);
      }
      if (node.args !== undefined) {
        if (!Array.isArray(node.args)) boundedProjectionFailure(`${label}.args must be an array`);
        for (let index = 0; index < node.args.length; index += 1) {
          validateMicheline(node.args[index], `${label}.args[${index}]`);
        }
      }
      if (node.annots !== undefined) {
        if (!Array.isArray(node.annots)) boundedProjectionFailure(`${label}.annots must be an array`);
        for (const annotation of node.annots) {
          if (typeof annotation !== "string" || !/^[%:@]?\S{1,255}$/.test(annotation)) {
            boundedProjectionFailure(`${label}.annots contains an invalid annotation`);
          }
        }
      }
      return;
    }
    if (keys.length !== 1) boundedProjectionFailure(`${label} is not a Micheline literal`);
    if (typeof node.int === "string" && /^-?[0-9]+$/.test(node.int)) return;
    if (typeof node.string === "string") return;
    if (typeof node.bytes === "string" && /^(?:[0-9a-fA-F]{2})*$/.test(node.bytes)) return;
    boundedProjectionFailure(`${label} is not a valid Micheline literal`);
  };

  const output = normalized as Record<string, unknown>;
  for (const [entrypoint, schema] of Object.entries(output)) {
    if (!SAFE_ENTRYPOINT.test(entrypoint)) boundedProjectionFailure(`entrypoint name is invalid: ${entrypoint}`);
    validateMicheline(schema, `entrypoint ${entrypoint}`);
  }
  return output;
}

export class TaquitoPastaUiLiveSession {
  private fundingAuthorization: PastaUiLiveFundingAuthorization | null = null;
  private readonly receipts: PastaUiLivePublicReceipt[] = [];
  private readonly viewReceipts: PastaUiLiveViewReceipt[] = [];
  private readonly writeAuthorizedContracts = new Set<string>();
  private readonly readOnlyAuthorizedContracts = new Set<string>();
  private readonly allowedViewCallersByContract = new Map<string, Map<string, Set<string>>>();
  private sequence = 0;
  private viewSequence = 0;
  private operationSequence = 0;

  constructor(private readonly options: TaquitoPastaUiLiveSessionOptions) {
    requireAddress(options.signerAddress, "signer address");
    if (!options.expectedChainId.trim()) fail("expected chain id is required");
    this.sequence = requireSafeInteger(
      options.initialReceiptSequence === undefined ? 0 : options.initialReceiptSequence,
      "initial receipt sequence",
    );
    this.operationSequence = requireSafeInteger(
      options.initialOperationSequence === undefined ? 0 : options.initialOperationSequence,
      "initial operation sequence",
    );
    for (const address of options.allowedContractAddresses || []) {
      this.writeAuthorizedContracts.add(requireAddress(address, "allowed contract address", true));
    }
    for (const authorization of options.allowedContractViews || []) {
      this.authorizeContractViews(authorization);
    }
  }

  authorizeReadOnlyContract(authorization: PastaUiLiveReadOnlyContractAuthorization): void {
    const record = requireRecord(authorization, "read-only contract authorization");
    requireExactKeys(record, "read-only contract authorization", ["contractAddress"]);
    this.readOnlyAuthorizedContracts.add(
      requireAddress(record.contractAddress, "read-only contract address", true),
    );
  }

  authorizeContractViews(authorization: PastaUiLiveContractViewAuthorization): void {
    const contractAddress = this.requireReadableSessionContract(authorization.contractAddress);
    if (!(authorization.viewNames instanceof Set) || authorization.viewNames.size === 0 || authorization.viewNames.size > 64) {
      fail("contract view authorization must name between 1 and 64 views");
    }
    const callers = new Set<string>();
    if (authorization.allowSessionSigner === true) callers.add(this.options.signerAddress);
    if (authorization.allowSessionSigner !== undefined && typeof authorization.allowSessionSigner !== "boolean") {
      fail("contract view signer authorization must be boolean");
    }
    if (authorization.allowedCallerContractAddresses !== undefined) {
      if (!(authorization.allowedCallerContractAddresses instanceof Set)) {
        fail("contract view caller contracts must be a set");
      }
      for (const callerAddress of authorization.allowedCallerContractAddresses) {
        callers.add(this.requireReadableSessionContract(callerAddress));
      }
    }
    if (callers.size === 0) {
      fail("contract view authorization requires the session signer or an authorized caller contract");
    }
    let views = this.allowedViewCallersByContract.get(contractAddress);
    if (!views) {
      views = new Map();
      this.allowedViewCallersByContract.set(contractAddress, views);
    }
    for (const viewName of authorization.viewNames) {
      if (!SAFE_ENTRYPOINT.test(viewName) || PROHIBITED_KEYS.has(viewName)) {
        fail(`allowed contract view name is invalid: ${String(viewName)}`);
      }
      const viewCallers = views.get(viewName) || new Set<string>();
      for (const caller of callers) viewCallers.add(caller);
      views.set(viewName, viewCallers);
    }
  }

  authorizeAfterFundingPreflight(authorization: PastaUiLiveFundingAuthorization): void {
    const balanceMutez = requireSafeInteger(authorization.balanceMutez, "preflight balance");
    const requiredBalanceMutez = requireSafeInteger(authorization.requiredBalanceMutez, "required preflight balance", 1);
    const estimatedOriginationMutez = requireSafeInteger(
      authorization.estimatedOriginationMutez,
      "estimated origination cost",
    );
    const operationReserveMutez = requireSafeInteger(authorization.operationReserveMutez, "operation reserve");
    if (balanceMutez < requiredBalanceMutez) {
      fail(`funding preflight failed: balance ${balanceMutez} mutez is below required ${requiredBalanceMutez} mutez`);
    }
    this.fundingAuthorization = {
      balanceMutez,
      requiredBalanceMutez,
      estimatedOriginationMutez,
      operationReserveMutez,
    };
  }

  getFundingAuthorization(): PastaUiLiveFundingAuthorization | null {
    return this.fundingAuthorization ? { ...this.fundingAuthorization } : null;
  }

  getReceipts(): PastaUiLivePublicReceipt[] {
    return this.receipts.map((receipt) => ({ ...receipt, ...(receipt.entrypoints ? { entrypoints: [...receipt.entrypoints] } : {}) }));
  }

  getViewReceipts(): PastaUiLiveViewReceipt[] {
    return this.viewReceipts.map((receipt) => ({ ...receipt }));
  }

  private async readOnly<T>(label: string, read: () => Promise<T>): Promise<T> {
    return readWithBoundedRetry({
      primary: declareReadOnlyReader(label, read),
    });
  }

  private async assertChain(stage: string): Promise<string> {
    const chainId = await this.readOnly(
      `${stage} chain identity`,
      () => this.options.assertExpectedChain(stage),
    );
    if (chainId !== this.options.expectedChainId) {
      fail(`${stage} returned unexpected chain id ${chainId}`);
    }
    return chainId;
  }

  private async assertAuthorizedAndFunded(stage: string): Promise<string> {
    if (!this.fundingAuthorization) fail("funding preflight has not authorized bridge pins or writes", 409);
    const chainId = await this.assertChain(stage);
    const balance = await this.readOnly(
      `${stage} signer balance`,
      () => this.options.tezos.tz.getBalance(this.options.signerAddress),
    );
    const balanceMutez = Number(balance.toString());
    const minimum = this.options.minimumActionBalanceMutez ?? 50_000;
    if (!Number.isSafeInteger(balanceMutez) || balanceMutez < minimum) {
      fail(`signer balance ${balanceMutez} mutez is below the per-action safety floor ${minimum} mutez`, 409);
    }
    return chainId;
  }

  private async record(
    action: PastaUiLiveReceiptAction,
    chainId: string,
    fields: Omit<PastaUiLivePublicReceipt, "schema" | "sequence" | "timestampUtc" | "action" | "chainId"> = {},
  ): Promise<PastaUiLivePublicReceipt> {
    const receipt: PastaUiLivePublicReceipt = {
      schema: PASTA_UI_LIVE_RECEIPT_SCHEMA,
      sequence: ++this.sequence,
      timestampUtc: new Date().toISOString(),
      action,
      chainId,
      ...fields,
    };
    this.receipts.push(receipt);
    await this.options.onReceipt?.(receipt);
    return receipt;
  }

  private async recordView(
    chainId: string,
    input: Omit<PastaUiLiveViewReceipt, "schema" | "sequence" | "action" | "chainId">,
  ): Promise<PastaUiLiveViewReceipt> {
    const receipt: PastaUiLiveViewReceipt = {
      schema: PASTA_UI_LIVE_VIEW_RECEIPT_SCHEMA,
      sequence: ++this.viewSequence,
      action: "execute_view",
      chainId,
      ...input,
    };
    this.viewReceipts.push(receipt);
    await this.options.onViewReceipt?.(receipt);
    return receipt;
  }

  private async prepareOperation(input: {
    action: PastaUiLiveSignerOperationAction;
    chainId: string;
    contractAddress?: string;
    entrypoints: string[];
    descriptor: PastaUiLiveOperationDescriptor;
  }): Promise<PastaUiLivePreparedOperation> {
    if (typeof this.options.assertOperationApplied !== "function") {
      fail("an exact-hash applied-operation verifier is required before signer submission", 409);
    }
    const operation: PastaUiLivePreparedOperation = {
      status: "PREPARED",
      operationSequence: ++this.operationSequence,
      timestampUtc: new Date().toISOString(),
      action: input.action,
      chainId: input.chainId,
      signerAddress: this.options.signerAddress,
      ...(input.contractAddress ? { contractAddress: input.contractAddress } : {}),
      entrypoints: [...input.entrypoints],
      descriptor: input.descriptor,
    };
    await this.options.beforeOperationSubmit?.(operation);
    return operation;
  }

  private async operationSubmitted(
    prepared: PastaUiLivePreparedOperation,
    operationHash: string,
    contractAddress = prepared.contractAddress,
  ): Promise<PastaUiLiveSubmittedOperation> {
    const operation: PastaUiLiveSubmittedOperation = {
      status: "SUBMITTED",
      operationSequence: prepared.operationSequence,
      timestampUtc: new Date().toISOString(),
      action: prepared.action,
      chainId: prepared.chainId,
      signerAddress: prepared.signerAddress,
      ...(contractAddress ? { contractAddress } : {}),
      entrypoints: [...prepared.entrypoints],
      descriptor: prepared.descriptor,
      operationHash,
    };
    await this.options.onOperationSubmitted?.(operation);
    return operation;
  }

  private requireWriteSessionContract(address: unknown): string {
    const contractAddress = requireAddress(address, "contract address", true);
    if (!this.writeAuthorizedContracts.has(contractAddress)) {
      fail(`contract ${contractAddress} is not authorized for this UI-live session`, 403);
    }
    return contractAddress;
  }

  private requireReadableSessionContract(address: unknown): string {
    const contractAddress = requireAddress(address, "contract address", true);
    if (
      !this.writeAuthorizedContracts.has(contractAddress) &&
      !this.readOnlyAuthorizedContracts.has(contractAddress)
    ) {
      fail(`contract ${contractAddress} is not authorized for this UI-live session (read-only access)`, 403);
    }
    return contractAddress;
  }

  private parseCall(value: unknown): PastaUiLiveContractCall {
    const call = requireRecord(value, "contract call");
    const contractAddress = this.requireWriteSessionContract(call.contractAddress);
    if (
      typeof call.entrypoint !== "string" ||
      !SAFE_ENTRYPOINT.test(call.entrypoint) ||
      !this.options.allowedEntrypoints.has(call.entrypoint)
    ) {
      fail(`contract entrypoint is not allowed: ${String(call.entrypoint)}`, 403);
    }
    return {
      contractAddress,
      entrypoint: call.entrypoint,
      payload: decodePastaUiLiveValue(call.payload),
    };
  }

  private async confirmationRecoveredByAppliedAssertion(
    operation: { hash: string; confirmation(confirmations?: number): Promise<unknown> },
    assertion: PastaUiLiveAppliedOperationAssertion,
  ): Promise<boolean> {
    const verifier = this.options.assertOperationApplied;
    if (typeof verifier !== "function") {
      throw new PastaUiLiveSubmittedOperationError(
        assertion,
        new Error("native confirmation polling is not a proof finality boundary"),
        new Error("exact-hash applied-operation verifier is unavailable"),
      );
    }
    try {
      await verifier(assertion);
    } catch (verificationError) {
      throw new PastaUiLiveSubmittedOperationError(
        assertion,
        new Error(`native confirmation polling was bypassed for submitted operation ${operation.hash}`),
        verificationError,
      );
    }
    return true;
  }

  async handle(request: PastaUiLiveBridgeRequest): Promise<unknown> {
    const payload = requireRecord(request.payload ?? {}, `${request.action} payload`);
    if (request.action === "connect") {
      const chainId = await this.assertChain("UI-live connect");
      const receipt = await this.record("connect", chainId, { signerAddress: this.options.signerAddress });
      return { address: this.options.signerAddress, chainId, receipt };
    }
    if (request.action === "chain_check") {
      const chainId = await this.assertChain("UI-live operation safety check");
      const receipt = await this.record("chain_check", chainId, { signerAddress: this.options.signerAddress });
      return { address: this.options.signerAddress, chainId, receipt };
    }
    if (request.action === "active_protocol") {
      requireExactKeys(payload, "active protocol payload", ["block"]);
      if (payload.block !== "head") {
        fail("UI-live active protocol reads are restricted to head");
      }
      const chainId = await this.assertChain("UI-live active protocol read");
      const head = requireRecord(
        await this.readOnly(
          "UI-live active protocol head",
          () => this.options.tezos.rpc.getBlock({ block: "head" }),
        ),
        "Tezos head block",
      );
      if (
        typeof head.protocol !== "string" ||
        !/^[1-9A-HJ-NP-Za-km-z]{20,128}$/.test(head.protocol)
      ) {
        fail("Tezos head returned an invalid active protocol identity");
      }
      return { block: "head", chainId, protocol: head.protocol };
    }
    if (request.action === "block_header") {
      requireExactKeys(payload, "block header payload", ["block"]);
      if (payload.block !== "head") fail("UI-live block-header reads are restricted to head");
      const chainId = await this.assertChain("UI-live block-header read");
      const header = requireRecord(
        await this.readOnly(
          "UI-live head block header",
          () => this.options.tezos.rpc.getBlockHeader({ block: "head" }),
        ),
        "Tezos head block header",
      );
      const timestamp = String(header.timestamp || "");
      const level = Number(header.level);
      if (!Number.isFinite(Date.parse(timestamp)) || !Number.isSafeInteger(level) || level < 0) {
        fail("Tezos head returned an invalid block-header timestamp or level");
      }
      return { block: "head", chainId, timestamp, level };
    }
    if (request.action === "balance") {
      const chainId = await this.assertChain("UI-live balance read");
      const address = requireAddress(payload.address ?? this.options.signerAddress, "balance address");
      const balance = await this.readOnly(
        `UI-live balance for ${address}`,
        () => this.options.tezos.tz.getBalance(address),
      );
      return { address, balanceMutez: Number(balance.toString()), chainId };
    }
    if (request.action === "pin_json") {
      const chainId = await this.assertAuthorizedAndFunded("before UI-live JSON pin");
      const fileName = requireFileName(payload.fileName ?? "metadata.json");
      const value = decodePastaUiLiveValue(payload.value);
      const bytes = deterministicPinJsonBytes(value);
      await this.options.beforePin?.({ value, bytes, fileName, mimeType: "application/json" });
      const proof = await this.options.pinJson({ value, fileName });
      await this.options.onPin?.({ value, proof });
      const receipt = await this.record("pin_json", chainId, {
        signerAddress: this.options.signerAddress,
        cid: proof.cid,
        ipfsUri: proof.uri,
        publicGatewayUrl: proof.publicGatewayUrl,
        sha256: proof.sha256,
        byteCount: proof.byteLength,
        fileName: proof.fileName,
      });
      return { pin: proof, receipt };
    }
    if (request.action === "pin_blob") {
      const chainId = await this.assertAuthorizedAndFunded("before UI-live blob pin");
      if (!this.options.pinBlob) fail("blob pinning is not enabled for this UI-live session", 403);
      const fileName = requireFileName(payload.fileName ?? "artifact.bin");
      const mimeType = typeof payload.mimeType === "string" && payload.mimeType.trim()
        ? payload.mimeType.trim().slice(0, 200)
        : "application/octet-stream";
      if (typeof payload.dataBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.dataBase64)) {
        fail("blob pin payload is not valid base64");
      }
      const bytes = Buffer.from(payload.dataBase64, "base64");
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PIN_BYTES) fail("blob pin payload size is invalid");
      await this.options.beforePin?.({ bytes, fileName, mimeType });
      const proof = await this.options.pinBlob({ bytes, fileName, mimeType });
      await this.options.onPin?.({ bytes, proof });
      const receipt = await this.record("pin_blob", chainId, {
        signerAddress: this.options.signerAddress,
        cid: proof.cid,
        ipfsUri: proof.uri,
        publicGatewayUrl: proof.publicGatewayUrl,
        sha256: proof.sha256,
        byteCount: proof.byteLength,
        fileName: proof.fileName,
      });
      return { pin: proof, receipt };
    }
    if (request.action === "originate") {
      const chainId = await this.assertAuthorizedAndFunded("before UI-live origination");
      const code = decodePastaUiLiveValue(payload.code);
      const storage = decodePastaUiLiveValue(payload.storage);
      await this.options.validateOrigination?.({ code, storage });
      const preparedOperation = await this.prepareOperation({
        action: "originate",
        chainId,
        entrypoints: [],
        descriptor: { kind: "originate", code, storage },
      });
      const operation = await this.options.tezos.contract.originate({ code, storage } as never);
      const fallbackContractAddress = typeof operation.contractAddress === "string" &&
        ADDRESS_RE.test(operation.contractAddress) &&
        validateContractAddress(operation.contractAddress) === ValidationResult.VALID
        ? operation.contractAddress
        : undefined;
      await this.operationSubmitted(preparedOperation, operation.hash, fallbackContractAddress);
      const fallbackAssertion: PastaUiLiveAppliedOperationAssertion = {
        action: "originate",
        operationHash: operation.hash,
        ...(fallbackContractAddress ? { contractAddress: fallbackContractAddress } : {}),
        entrypoints: [],
      };
      const recovered = await this.confirmationRecoveredByAppliedAssertion(operation, fallbackAssertion);
      let contractAddress: string;
      if (recovered) {
        if (!fallbackContractAddress) {
          throw new PastaUiLiveSubmittedOperationError(
            fallbackAssertion,
            new Error("confirmation did not provide an originated contract"),
            new Error("exact-hash verification could not recover the originated contract address"),
          );
        }
        contractAddress = fallbackContractAddress;
      } else {
        const contract = await this.readOnly(
          `UI-live originated contract lookup for ${operation.hash}`,
          () => operation.contract(),
        );
        contractAddress = requireAddress(contract.address, "originated contract address", true);
        await this.options.assertOperationApplied?.({
          action: "originate",
          operationHash: operation.hash,
          contractAddress,
          entrypoints: [],
        });
      }
      this.writeAuthorizedContracts.add(contractAddress);
      const receipt = await this.record("originate", chainId, {
        signerAddress: this.options.signerAddress,
        contractAddress,
        operationHash: operation.hash,
      });
      return { contractAddress, operationHash: operation.hash, confirmationLevel: 1, receipt };
    }
    if (request.action === "contract_at") {
      const chainId = await this.assertChain("before UI-live contract lookup");
      const contractAddress = this.requireReadableSessionContract(payload.contractAddress);
      const contract = await this.readOnly(
        `UI-live contract lookup ${contractAddress}`,
        () => this.options.tezos.contract.at(contractAddress),
      );
      const entrypoints = serializePastaUiLiveEntrypoints(
        (contract as unknown as { entrypoints?: { entrypoints?: unknown } }).entrypoints?.entrypoints,
      );
      return { contractAddress, chainId, entrypoints };
    }
    if (request.action === "execute_view") {
      requireExactKeys(payload, "contract view payload", ["contractAddress", "viewName", "params", "options"]);
      const contractAddress = this.requireReadableSessionContract(payload.contractAddress);
      if (
        typeof payload.viewName !== "string" ||
        !SAFE_ENTRYPOINT.test(payload.viewName) ||
        PROHIBITED_KEYS.has(payload.viewName) ||
        !this.allowedViewCallersByContract.get(contractAddress)?.has(payload.viewName)
      ) {
        fail(`contract view is not allowed for ${contractAddress}: ${String(payload.viewName)}`, 403);
      }
      const viewName = payload.viewName;
      const viewOptions = requireRecord(payload.options, "contract view options");
      requireExactKeys(viewOptions, "contract view options", ["viewCaller"]);
      const viewCaller = requireAddress(viewOptions.viewCaller, "contract view caller");
      if (!this.allowedViewCallersByContract.get(contractAddress)?.get(viewName)?.has(viewCaller)) {
        fail(`contract view caller ${viewCaller} is not authorized for ${contractAddress}.${viewName}`, 403);
      }
      const params = decodePastaUiLiveValue(payload.params);
      const serializedParams = serializePastaUiLiveStorageProjection(params);
      const chainId = await this.assertChain("before UI-live on-chain view");
      const contract = await this.readOnly(
        `UI-live view contract lookup ${contractAddress}`,
        () => this.options.tezos.contract.at(contractAddress),
      );
      const contractViews = (contract as unknown as { contractViews?: Record<string, unknown> }).contractViews;
      if (
        !contractViews ||
        typeof contractViews !== "object" ||
        !Object.prototype.hasOwnProperty.call(contractViews, viewName) ||
        typeof contractViews[viewName] !== "function"
      ) {
        fail(`contract does not expose allowed on-chain view ${viewName}`);
      }
      const invocation = (contractViews[viewName] as (value: unknown) => unknown)(params) as {
        executeView?: (options: { viewCaller: string }) => Promise<unknown>;
      } | null;
      if (!invocation || typeof invocation.executeView !== "function") {
        fail(`contract on-chain view ${viewName} is not executable`);
      }
      const value = serializePastaUiLiveStorageProjection(
        await this.readOnly(
          `UI-live view ${contractAddress}.${viewName}`,
          () => invocation.executeView!({ viewCaller }),
        ),
      );
      const requestSha256 = createHash("sha256").update(deterministicPinJsonBytes({
        contractAddress,
        params: serializedParams,
        viewCaller,
        viewName,
      })).digest("hex");
      const resultSha256 = createHash("sha256").update(deterministicPinJsonBytes(value)).digest("hex");
      const viewReceipt = await this.recordView(chainId, {
        viewCaller,
        contractAddress,
        viewName,
        requestSha256,
        resultSha256,
      });
      return { contractAddress, chainId, viewName, value, viewReceipt };
    }
    if (request.action === "script_code_hash") {
      const chainId = await this.assertChain("before UI-live script identity read");
      const contractAddress = this.requireReadableSessionContract(payload.contractAddress);
      const script = requireRecord(
        await this.readOnly(
          `UI-live script identity ${contractAddress}`,
          () => this.options.tezos.rpc.getScript(contractAddress),
        ),
        "on-chain contract script",
      );
      return {
        contractAddress,
        chainId,
        codeHash: hashPastaUiLiveScriptCode(script.code),
      };
    }
    if (request.action === "read_storage") {
      const chainId = await this.assertChain("before UI-live storage read");
      const contractAddress = this.requireReadableSessionContract(payload.contractAddress);
      const storage = await this.readOnly(
        `UI-live projected storage ${contractAddress}`,
        async () => {
          const contract = await this.options.tezos.contract.at(contractAddress);
          const raw = await contract.storage();
          const projected = this.options.projectStorage ? await this.options.projectStorage(raw) : raw;
          return serializePastaUiLiveStorageProjection(projected);
        },
      );
      return { contractAddress, chainId, storage };
    }
    if (request.action === "estimate_call") {
      const chainId = await this.assertAuthorizedAndFunded("before UI-live contract-call estimate");
      const call = this.parseCall(payload.call);
      const contract = await this.readOnly(
        `UI-live estimate contract lookup ${call.contractAddress}`,
        () => this.options.tezos.contract.at(call.contractAddress),
      );
      const method = contract.methodsObject[call.entrypoint];
      if (typeof method !== "function") fail(`contract does not expose ${call.entrypoint}`);
      const sendOptions = decodePastaUiLiveValue(payload.sendOptions ?? {});
      const prepared = method(call.payload);
      if (!prepared || typeof prepared.toTransferParams !== "function") {
        fail(`contract method ${call.entrypoint} cannot produce transfer parameters`);
      }
      const transferParams = prepared.toTransferParams(sendOptions as never);
      const estimate = await this.readOnly(
        `UI-live transfer estimate ${call.contractAddress}.${call.entrypoint}`,
        () => this.options.tezos.estimate.transfer(transferParams),
      );
      return {
        chainId,
        contractAddress: call.contractAddress,
        entrypoint: call.entrypoint,
        estimate: {
          gasLimit: requireSafeInteger(Number(estimate.gasLimit), "estimated gas limit", 1),
          storageLimit: requireSafeInteger(Number(estimate.storageLimit), "estimated storage limit"),
          suggestedFeeMutez: requireSafeInteger(Number(estimate.suggestedFeeMutez), "suggested fee"),
          minimalFeeMutez: requireSafeInteger(Number(estimate.minimalFeeMutez), "minimal fee"),
          burnFeeMutez: requireSafeInteger(Number(estimate.burnFeeMutez), "burn fee"),
        },
      };
    }
    if (request.action === "batch") {
      const chainId = await this.assertAuthorizedAndFunded("before UI-live batch");
      if (!Array.isArray(payload.calls) || payload.calls.length === 0 || payload.calls.length > 50) {
        fail("batch must contain between 1 and 50 calls");
      }
      const calls = payload.calls.map((call) => this.parseCall(call));
      const batch = this.options.tezos.contract.batch();
      for (const call of calls) {
        await this.options.validateCall?.(call);
        const contract = await this.readOnly(
          `UI-live batch contract lookup ${call.contractAddress}`,
          () => this.options.tezos.contract.at(call.contractAddress),
        );
        const method = contract.methodsObject[call.entrypoint];
        if (typeof method !== "function") fail(`contract does not expose ${call.entrypoint}`);
        batch.withContractCall(method(call.payload));
      }
      const preparedOperation = await this.prepareOperation({
        action: "batch",
        chainId,
        contractAddress: calls[0].contractAddress,
        entrypoints: calls.map((call) => call.entrypoint),
        descriptor: { kind: "batch", calls },
      });
      const operation = await batch.send();
      await this.operationSubmitted(preparedOperation, operation.hash);
      const appliedAssertion: PastaUiLiveAppliedOperationAssertion = {
        action: "batch",
        operationHash: operation.hash,
        contractAddress: calls[0].contractAddress,
        entrypoints: calls.map((call) => call.entrypoint),
      };
      const recovered = await this.confirmationRecoveredByAppliedAssertion(operation, appliedAssertion);
      if (!recovered) await this.options.assertOperationApplied?.(appliedAssertion);
      const receipt = await this.record("batch", chainId, {
        signerAddress: this.options.signerAddress,
        contractAddress: calls[0].contractAddress,
        operationHash: operation.hash,
        entrypoints: calls.map((call) => call.entrypoint),
      });
      return { operationHash: operation.hash, confirmationLevel: 1, receipt };
    }
    if (request.action === "call") {
      const chainId = await this.assertAuthorizedAndFunded("before UI-live contract call");
      const call = this.parseCall(payload.call);
      await this.options.validateCall?.(call);
      const contract = await this.readOnly(
        `UI-live call contract lookup ${call.contractAddress}`,
        () => this.options.tezos.contract.at(call.contractAddress),
      );
      const method = contract.methodsObject[call.entrypoint];
      if (typeof method !== "function") fail(`contract does not expose ${call.entrypoint}`);
      const sendOptions = decodePastaUiLiveValue(payload.sendOptions ?? {});
      const preparedCall = method(call.payload);
      if (!preparedCall || typeof preparedCall.send !== "function") {
        fail(`contract method ${call.entrypoint} cannot submit an operation`);
      }
      const preparedOperation = await this.prepareOperation({
        action: "call",
        chainId,
        contractAddress: call.contractAddress,
        entrypoints: [call.entrypoint],
        descriptor: { kind: "call", call, sendOptions },
      });
      const operation = await preparedCall.send(sendOptions as never);
      await this.operationSubmitted(preparedOperation, operation.hash);
      const appliedAssertion: PastaUiLiveAppliedOperationAssertion = {
        action: "call",
        operationHash: operation.hash,
        contractAddress: call.contractAddress,
        entrypoints: [call.entrypoint],
      };
      const recovered = await this.confirmationRecoveredByAppliedAssertion(operation, appliedAssertion);
      if (!recovered) await this.options.assertOperationApplied?.(appliedAssertion);
      const receipt = await this.record("call", chainId, {
        signerAddress: this.options.signerAddress,
        contractAddress: call.contractAddress,
        operationHash: operation.hash,
        entrypoints: [call.entrypoint],
      });
      return { operationHash: operation.hash, confirmationLevel: 1, receipt };
    }
    fail(`unsupported bridge action: ${request.action}`);
  }
}

export function buildPastaUiLiveProxyInstallerSource(
  origin: string,
  sessionToken: string,
  classification: "UI-LIVE" | "UI-MOCK",
): string {
  const config = JSON.stringify({
    endpoint: `${origin}${BRIDGE_PATH}`,
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    sessionToken,
    classification,
  }).replace(/</g, "\\u003c");
  return `(() => {
    "use strict";
    const config = ${config};
    const MD = window.MD;
    if (!MD || !window.TZ || !window.TZ.MichelsonMap) throw new Error("Spaghetti runtime is not ready for UI-live bridge installation");
    let requestSequence = 0;
    let account = "";
    const publicReceipts = [];
    const publicViewReceipts = [];
    const publicPins = [];
    const toolkit = {};

    function encode(value, seen) {
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      if (typeof value === "bigint") return { __pastaBridgeType: "bigint", value: value.toString() };
      if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
      if (Array.isArray(value)) return value.map((entry) => encode(entry, seen));
      if (!value || typeof value !== "object") throw new Error("unsupported bridge value");
      if (seen.has(value)) throw new Error("cyclic bridge value");
      seen.add(value);
      try {
        if (typeof value.entries === "function" && typeof value.set === "function") {
          return { __pastaBridgeType: "map", entries: Array.from(value.entries(), (entry) => [encode(entry[0], seen), encode(entry[1], seen)]) };
        }
        if (typeof value.toFixed === "function" && value.constructor && /BigNumber/i.test(value.constructor.name)) {
          return { __pastaBridgeType: "bigint", value: value.toFixed() };
        }
        const output = {};
        for (const key of Object.keys(value)) {
          if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("prohibited bridge key");
          const child = encode(value[key], seen);
          if (child !== undefined) output[key] = child;
        }
        return output;
      } finally {
        seen.delete(value);
      }
    }

    function decode(value) {
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      if (Array.isArray(value)) return value.map(decode);
      if (!value || typeof value !== "object") return value;
      if (value.__pastaBridgeType === "map") {
        const map = new window.TZ.MichelsonMap();
        for (const entry of value.entries || []) map.set(decode(entry[0]), decode(entry[1]));
        return map;
      }
      if (value.__pastaBridgeType === "bigint") return value.value;
      const output = {};
      for (const key of Object.keys(value)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("prohibited bridge response key");
        output[key] = decode(value[key]);
      }
      return output;
    }

    async function request(action, payload) {
      const id = "ui-" + (++requestSequence);
      const response = await fetch(config.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Pasta-Proof-Session": config.sessionToken,
        },
        body: JSON.stringify({ schema: config.schema, id, action, payload: encode(payload, new Set()) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.ok !== true) {
        throw new Error(body && body.error && body.error.message ? body.error.message : "UI-live bridge request failed (" + response.status + ")");
      }
      const result = decode(body.result);
      if (result && result.receipt) publicReceipts.push(result.receipt);
      if (result && result.viewReceipt) publicViewReceipts.push(result.viewReceipt);
      return result;
    }

    function operation(result) {
      return {
        hash: result.operationHash,
        async confirmation() { return result.confirmationLevel || 1; },
      };
    }

    function methodCall(contractAddress, entrypoint, payload) {
      const call = { contractAddress, entrypoint, payload };
      return {
        __pastaBridgeCall: call,
        async toTransferParams(sendOptions) {
          return { __pastaBridgeEstimateCall: call, sendOptions: sendOptions || {} };
        },
        async send(sendOptions) {
          const result = await request("call", { call, sendOptions: sendOptions || {} });
          return operation(result);
        },
      };
    }

    function contractProxy(contractAddress, entrypoints) {
      return {
        address: contractAddress,
        entrypoints: { entrypoints: entrypoints || {} },
        methodsObject: new Proxy({}, {
          get(_target, entrypoint) {
            if (typeof entrypoint !== "string") return undefined;
            return (payload) => methodCall(contractAddress, entrypoint, payload);
          },
        }),
        contractViews: new Proxy({}, {
          get(_target, viewName) {
            if (typeof viewName !== "string") return undefined;
            return (params) => ({
              async executeView(options) {
                if (!options || typeof options !== "object" || Array.isArray(options)) {
                  throw new Error("UI-live bridge contract view options must be an object");
                }
                const optionKeys = Object.keys(options);
                if (optionKeys.length !== 1 || optionKeys[0] !== "viewCaller" || typeof options.viewCaller !== "string") {
                  throw new Error("UI-live bridge contract view options permit only viewCaller");
                }
                const result = await request("execute_view", {
                  contractAddress,
                  viewName,
                  params,
                  options: { viewCaller: options.viewCaller },
                });
                return result.value;
              },
            });
          },
        }),
        async storage() {
          const result = await request("read_storage", { contractAddress });
          return result.storage;
        },
      };
    }

    toolkit.rpc = {
      async getChainId() { return (await request("chain_check", {})).chainId; },
      async getBlock(options) {
        if (
          !options ||
          typeof options !== "object" ||
          Array.isArray(options) ||
          Object.keys(options).length !== 1 ||
          options.block !== "head"
        ) {
          throw new Error("UI-live bridge permits only the active head protocol read");
        }
        const result = await request("active_protocol", { block: "head" });
        if (
          !result ||
          result.block !== "head" ||
          typeof result.protocol !== "string" ||
          !/^[1-9A-HJ-NP-Za-km-z]{20,128}$/.test(result.protocol)
        ) {
          throw new Error("UI-live bridge returned an invalid active protocol identity");
        }
        return { protocol: result.protocol };
      },
      async getBlockHeader(options) {
        if (
          options !== undefined
          && (
            !options
            || typeof options !== "object"
            || Array.isArray(options)
            || Object.keys(options).length !== 1
            || options.block !== "head"
          )
        ) {
          throw new Error("UI-live bridge permits only the active head block-header read");
        }
        const result = await request("block_header", { block: "head" });
        if (
          !result
          || result.block !== "head"
          || typeof result.timestamp !== "string"
          || !Number.isFinite(Date.parse(result.timestamp))
          || !Number.isSafeInteger(result.level)
          || result.level < 0
        ) {
          throw new Error("UI-live bridge returned an invalid head block header");
        }
        return { timestamp: result.timestamp, level: result.level };
      },
      async getScriptCodeHash(contractAddress) {
        const result = await request("script_code_hash", { contractAddress });
        if (!result || result.contractAddress !== contractAddress || typeof result.codeHash !== "string" || !/^[0-9a-f]{64}$/.test(result.codeHash)) {
          throw new Error("UI-live bridge returned an invalid script-code hash");
        }
        return result.codeHash;
      },
    };
    toolkit.tz = {
      async getBalance(address) {
        const result = await request("balance", { address });
        return {
          toNumber: () => result.balanceMutez,
          toString: () => String(result.balanceMutez),
        };
      },
    };
    toolkit.contract = {
      async at(contractAddress) {
        const result = await request("contract_at", { contractAddress });
        return contractProxy(contractAddress, result.entrypoints);
      },
    };
    toolkit.estimate = {
      async transfer(params) {
        if (!params || typeof params !== "object" || !params.__pastaBridgeEstimateCall) {
          throw new Error("UI-live bridge estimate requires a bridge contract call");
        }
        const result = await request("estimate_call", {
          call: params.__pastaBridgeEstimateCall,
          sendOptions: params.sendOptions || {},
        });
        return result.estimate;
      },
    };
    toolkit.wallet = {
      originate(input) {
        return {
          async send() {
            const result = await request("originate", input);
            return {
              ...operation(result),
              async contract() { return contractProxy(result.contractAddress); },
            };
          },
        };
      },
      async at(contractAddress) {
        const result = await request("contract_at", { contractAddress });
        return contractProxy(contractAddress, result.entrypoints);
      },
      batch() {
        const calls = [];
        return {
          withContractCall(call) {
            if (!call || !call.__pastaBridgeCall) throw new Error("batch received a non-bridge contract call");
            calls.push(call.__pastaBridgeCall);
            return this;
          },
          async send() {
            const result = await request("batch", { calls });
            return operation(result);
          },
        };
      },
    };

    if (typeof MD.useToolkitAdapter === "function") {
      MD.useToolkitAdapter(toolkit);
    }

    MD.setupToolkit = (network) => {
      if (network !== "shadownet") throw new Error("UI-live proof bridge only permits Shadownet");
      return toolkit;
    };
    MD.getToolkit = () => toolkit;
    MD.connectWallet = async () => {
      const result = await request("connect", {});
      if (result.chainId !== "NetXsqzbfFenSTS") throw new Error("UI-live bridge returned a non-Shadownet chain");
      account = result.address;
      return account;
    };
    MD.getAccount = () => account;
    MD.assertOperationSafety = async () => {
      const result = await request("chain_check", {});
      if (!account || result.address !== account || result.chainId !== "NetXsqzbfFenSTS") {
        throw new Error("UI-live bridge account or chain changed before signing");
      }
      return account;
    };
    MD.pinProviderFromForm = () => {
      const provider = document.getElementById("pinProvider");
      const node = document.getElementById("pinNode");
      if (!provider || provider.value !== "node") throw new Error("UI-live proof requires the visible Kubo provider selection");
      let nodeUrl = null;
      try { nodeUrl = node ? new URL(node.value.trim()) : null; } catch (_) { nodeUrl = null; }
      if (!nodeUrl || nodeUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(nodeUrl.hostname) || nodeUrl.username || nodeUrl.password || nodeUrl.search || nodeUrl.hash || nodeUrl.pathname !== "/") {
        throw new Error("UI-live proof requires a loopback Kubo URL");
      }
      return { kind: "proof-bridge" };
    };
    MD.pinJson = async (_provider, value, fileName) => {
      const result = await request("pin_json", { value, fileName: fileName || "metadata.json" });
      publicPins.push(result.pin);
      return result.pin.cid;
    };
    MD.pinBlob = async (_provider, blob, fileName) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const result = await request("pin_blob", {
        dataBase64: btoa(binary),
        fileName: fileName || blob.name || "artifact.bin",
        mimeType: blob.type || "application/octet-stream",
      });
      publicPins.push(result.pin);
      return result.pin.cid;
    };
    window.__pastaUiLiveBridge = Object.freeze({
      installed: true,
      classification: config.classification,
      receipts: publicReceipts,
      viewReceipts: publicViewReceipts,
      pins: publicPins,
      getAccount: () => account,
    });
  })();`;
}

export async function installPastaUiLiveBrowserProxy(
  page: Page,
  bridge: Pick<PastaUiLiveLoopbackServer, "origin" | "sessionToken">,
  classification: "UI-LIVE" | "UI-MOCK",
): Promise<void> {
  const pageUrl = new URL(page.url());
  if (pageUrl.origin !== bridge.origin) fail("browser page is not on the proof bridge loopback origin");
  const script = await page.addScriptTag({
    content: buildPastaUiLiveProxyInstallerSource(bridge.origin, bridge.sessionToken, classification),
  });
  await page.waitForFunction(() => Boolean((window as Window & { __pastaUiLiveBridge?: { installed?: boolean } }).__pastaUiLiveBridge?.installed));
  await script.evaluate((element) => element.parentNode?.removeChild(element));
}

export function hashJsonForBridge(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createBridgeRequest(action: PastaUiLiveAction, payload: unknown): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: randomUUID(),
    action,
    payload,
  };
}
