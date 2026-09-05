import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MichelCodecPacker, TezosToolkit } from "@taquito/taquito";
import type { InMemorySigner } from "@taquito/signer";
import { HttpBackend } from "@taquito/http-utils";
import { RpcClient } from "@taquito/rpc";

import * as keyringNamespace from "../../extensions/wtf-operator-signer/src/keyring";
import type { SignerEnv } from "../../extensions/wtf-operator-signer/src/env";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";
export const SHADOWNET_RPC_PRIMARY =
  process.env.PASTA_SHADOWNET_RPC || "https://tezos-shadownet.octez.io/";
export const SHADOWNET_RPC_FALLBACK =
  process.env.PASTA_SHADOWNET_RPC_FALLBACK || "https://tcinfra.net/rpc/tezos/shadownet";
export const SHADOWNET_TZKT_API =
  process.env.PASTA_SHADOWNET_TZKT_API || "https://api.shadownet.tzkt.io/v1";

const DEFAULT_KEYRING_PATH = path.join(homedir(), ".wtf-gameshow", "platform-wallet-keyring.json");
const DEFAULT_MASTER_KEY_FILE = path.join(homedir(), ".wtf-gameshow", "platform-keyring-master.key");
const DEFAULT_CREATOR_WALLET_ID = "wtf-os-root";
const DEFAULT_COLLECTOR_WALLET_ID = "arcade-treasury";
const DEFAULT_COLLECTOR_TWO_WALLET_ID = "e2e-bert";
const HTTP_TIMEOUT_MS = Math.max(1_000, Number(process.env.PASTA_SHADOWNET_HTTP_TIMEOUT_MS || "15000"));
const TAQUITO_TIMEOUT_MS = Math.max(30_000, Number(process.env.PASTA_SHADOWNET_TAQUITO_TIMEOUT_MS || "120000"));
const DEFAULT_IPFS_PUBLIC_GATEWAY = "https://ipfs.fileship.xyz";
const DEFAULT_IPFS_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_IPFS_VERIFY_ATTEMPTS = 30;
const DEFAULT_IPFS_VERIFY_DELAY_MS = 4_000;
const IPFS_CID_PATTERN = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const keyringModule = (
  "default" in keyringNamespace
    ? (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default
    : keyringNamespace
);
const { PlatformWalletKeyring } = keyringModule;

export type ProofStatus = "BLOCKED" | "FAILED" | "PASSED";

export type RpcProbe = {
  rpcUrl: string;
  chainId: string;
};

export type PlatformWallet = {
  id: string;
  address: string;
  network: string;
};

export type SignerPair = {
  creator: PlatformWallet;
  creatorSigner: InMemorySigner;
  collector: PlatformWallet;
  collectorSigner: InMemorySigner;
};

export type SignerSet = SignerPair & {
  collectorTwo: PlatformWallet;
  collectorTwoSigner: InMemorySigner;
};

export type IpfsProofOptions = {
  apiUrl?: string;
  localGatewayUrl?: string;
  publicGatewayUrl?: string;
  requestTimeoutMs?: number;
  verifyAttempts?: number;
  verifyDelayMs?: number;
};

export type IpfsProofConfig = {
  apiUrl: string;
  localGatewayUrl: string;
  publicGatewayUrl: string;
  requestTimeoutMs: number;
  verifyAttempts: number;
  verifyDelayMs: number;
};

export type IpfsPinnedProof = {
  cid: string;
  uri: `ipfs://${string}`;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  localGatewayUrl: string;
  publicGatewayUrl: string;
  publicGatewayVerified: true;
  verificationAttempts: number;
};

export type PinIpfsProofBytesInput = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  options?: IpfsProofOptions;
};

export type PinIpfsProofJsonInput = {
  value: unknown;
  fileName: string;
  options?: IpfsProofOptions;
};

export class ProofBlocked extends Error {
  constructor(
    message: string,
    readonly lines: string[],
  ) {
    super(message);
    this.name = "ProofBlocked";
  }
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return resolved;
}

function httpEndpoint(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  if (parsed.username || parsed.password || parsed.search) {
    throw new Error(`${label} must not include credentials or query parameters`);
  }
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function deriveLocalGateway(apiUrl: string): string {
  const parsed = new URL(apiUrl);
  parsed.port = "8080";
  parsed.pathname = "/ipfs";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function resolveIpfsProofConfig(options: IpfsProofOptions = {}): IpfsProofConfig {
  const apiUrl = httpEndpoint(
    options.apiUrl ?? process.env.PASTA_SHADOWNET_IPFS_API_URL ?? "",
    "PASTA_SHADOWNET_IPFS_API_URL",
  );
  const localGatewayUrl = httpEndpoint(
    options.localGatewayUrl ??
      process.env.PASTA_SHADOWNET_IPFS_LOCAL_GATEWAY ??
      deriveLocalGateway(apiUrl),
    "PASTA_SHADOWNET_IPFS_LOCAL_GATEWAY",
  );
  const publicGatewayUrl = httpEndpoint(
    options.publicGatewayUrl ??
      process.env.PASTA_SHADOWNET_IPFS_GATEWAY ??
      DEFAULT_IPFS_PUBLIC_GATEWAY,
    "PASTA_SHADOWNET_IPFS_GATEWAY",
  );
  const publicOrigin = new URL(publicGatewayUrl).origin;
  if (publicOrigin === new URL(apiUrl).origin || publicOrigin === new URL(localGatewayUrl).origin) {
    throw new Error(
      "PASTA_SHADOWNET_IPFS_GATEWAY must use an independent public gateway origin, not a local Kubo origin",
    );
  }
  return {
    apiUrl,
    localGatewayUrl,
    publicGatewayUrl,
    requestTimeoutMs: positiveInteger(
      options.requestTimeoutMs,
      Number(process.env.PASTA_SHADOWNET_IPFS_REQUEST_TIMEOUT_MS || DEFAULT_IPFS_REQUEST_TIMEOUT_MS),
      "IPFS request timeout",
    ),
    verifyAttempts: positiveInteger(
      options.verifyAttempts,
      Number(process.env.PASTA_SHADOWNET_IPFS_VERIFY_ATTEMPTS || DEFAULT_IPFS_VERIFY_ATTEMPTS),
      "IPFS verification attempts",
    ),
    verifyDelayMs: nonNegativeInteger(
      options.verifyDelayMs,
      Number(process.env.PASTA_SHADOWNET_IPFS_VERIFY_DELAY_MS || DEFAULT_IPFS_VERIFY_DELAY_MS),
      "IPFS verification delay",
    ),
  };
}

export function ipfsGatewayUrl(gatewayBaseUrl: string, cid: string): string {
  if (!IPFS_CID_PATTERN.test(cid)) throw new Error(`invalid IPFS CID: ${cid}`);
  return `${gatewayBaseUrl.replace(/\/+$/, "")}/${cid}`;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deterministicJson(value: unknown, ancestors: Set<object>): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "bigint") throw new TypeError("deterministic JSON does not support bigint values");
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown> & { toJSON?: () => unknown };
  if (ancestors.has(record)) throw new TypeError("deterministic JSON does not support cyclic values");
  if (typeof record.toJSON === "function") {
    ancestors.add(record);
    try {
      return deterministicJson(record.toJSON(), ancestors);
    } finally {
      ancestors.delete(record);
    }
  }
  ancestors.add(record);
  try {
    if (Array.isArray(record)) {
      return `[${record.map((item) => deterministicJson(item, ancestors) ?? "null").join(",")}]`;
    }
    const properties: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const serialized = deterministicJson(record[key], ancestors);
      if (serialized !== undefined) properties.push(`${JSON.stringify(key)}:${serialized}`);
    }
    return `{${properties.join(",")}}`;
  } finally {
    ancestors.delete(record);
  }
}

export function deterministicJsonBytes(value: unknown): Uint8Array {
  const serialized = deterministicJson(value, new Set());
  if (serialized === undefined) {
    throw new TypeError("deterministic JSON root must be serializable");
  }
  return Buffer.from(serialized, "utf8");
}

function safeUploadName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed || trimmed.length > 255 || /[\\/\0\r\n]/.test(trimmed)) {
    throw new Error("IPFS proof file name must be a plain 1-255 character file name");
  }
  return trimmed;
}

function safeMimeType(mimeType: string): string {
  const trimmed = mimeType.trim().toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(trimmed)) {
    throw new Error(`invalid IPFS proof MIME type: ${mimeType}`);
  }
  return trimmed;
}

function kuboAddUrl(apiUrl: string): URL {
  const url = new URL(apiUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath.endsWith("/api/v0") ? basePath : `${basePath}/api/v0`}/add`.replace(/\/{2,}/g, "/");
  url.searchParams.set("pin", "true");
  url.searchParams.set("cid-version", "1");
  url.searchParams.set("raw-leaves", "true");
  return url;
}

function cidFromKuboResponse(text: string): string {
  for (const line of text.trim().split(/\r?\n/).reverse()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { Hash?: unknown };
      const cid = String(parsed.Hash ?? "").trim();
      if (IPFS_CID_PATTERN.test(cid)) return cid;
    } catch {
      // Kubo streams newline-delimited JSON; ignore non-JSON progress lines.
    }
  }
  throw new Error(`Kubo returned no valid CID: ${text.slice(0, 300)}`);
}

async function responseDigest(response: Response): Promise<{ byteLength: number; sha256: string }> {
  const hash = createHash("sha256");
  let byteLength = 0;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { byteLength: bytes.byteLength, sha256: sha256Hex(bytes) };
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    hash.update(value);
  }
  return { byteLength, sha256: hash.digest("hex") };
}

async function verifyPublicGateway(
  url: string,
  expectedBytes: Uint8Array,
  config: IpfsProofConfig,
): Promise<number> {
  const expectedSha256 = sha256Hex(expectedBytes);
  let lastFailure = "no response";
  for (let attempt = 1; attempt <= config.verifyAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "user-agent": "wtfos-pasta-shadownet-ipfs-proof" },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (response.ok) {
        const received = await responseDigest(response);
        if (received.sha256 !== expectedSha256 || received.byteLength !== expectedBytes.byteLength) {
          throw new Error(
            `public IPFS gateway bytes differ from pinned bytes: expected SHA-256 ${expectedSha256} ` +
              `(${expectedBytes.byteLength} bytes), received ${received.sha256} (${received.byteLength} bytes)`,
          );
        }
        return attempt;
      }
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("public IPFS gateway bytes differ")) throw error;
      lastFailure = message;
    }
    if (attempt < config.verifyAttempts && config.verifyDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.verifyDelayMs));
    }
  }
  throw new Error(
    `pinned bytes did not resolve from independent public IPFS gateway ${url} after ` +
      `${config.verifyAttempts} attempts: ${lastFailure}`,
  );
}

export async function pinIpfsProofBytes(input: PinIpfsProofBytesInput): Promise<IpfsPinnedProof> {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) {
    throw new Error("IPFS proof bytes must be a non-empty Uint8Array");
  }
  const config = resolveIpfsProofConfig(input.options);
  const fileName = safeUploadName(input.fileName);
  const mimeType = safeMimeType(input.mimeType);
  const bytes = Uint8Array.from(input.bytes);
  const body = new FormData();
  body.append("file", new Blob([bytes.buffer], { type: mimeType }), fileName);
  const response = await fetch(kuboAddUrl(config.apiUrl), {
    method: "POST",
    body,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Kubo IPFS pin failed with HTTP ${response.status}: ${responseText.slice(0, 300)}`);
  }
  const cid = cidFromKuboResponse(responseText);
  const localGatewayUrl = ipfsGatewayUrl(config.localGatewayUrl, cid);
  const publicGatewayUrl = ipfsGatewayUrl(config.publicGatewayUrl, cid);
  const verificationAttempts = await verifyPublicGateway(publicGatewayUrl, bytes, config);
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName,
    mimeType,
    byteLength: bytes.byteLength,
    sha256: sha256Hex(bytes),
    localGatewayUrl,
    publicGatewayUrl,
    publicGatewayVerified: true,
    verificationAttempts,
  };
}

export function pinIpfsProofJson(input: PinIpfsProofJsonInput): Promise<IpfsPinnedProof> {
  return pinIpfsProofBytes({
    bytes: deterministicJsonBytes(input.value),
    fileName: input.fileName,
    mimeType: "application/json",
    options: input.options,
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeBase(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function utf8ToHex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

export function dataJsonUri(value: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}`;
}

export function hexToUtf8(hex: string): string {
  return Buffer.from(hex, "hex").toString("utf8");
}

export function parseDataJsonUri(uri: string): unknown {
  const match = uri.match(/^data:application\/json;base64,(.+)$/);
  if (!match) throw new Error(`unsupported metadata URI: ${uri.slice(0, 80)}`);
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

export function createLogger(scope: string): (message: string) => void {
  return (message: string) => {
    console.log(`[${scope}] ok: ${message}`);
  };
}

export function block(message: string, details: string[]): never {
  throw new ProofBlocked(message, ["## Blocker", "", ...details]);
}

export async function writeProofReport(options: {
  reportPath: string;
  title: string;
  status: ProofStatus;
  lines: string[];
  rpcUrl?: string;
}): Promise<void> {
  await mkdir(path.dirname(options.reportPath), { recursive: true });
  await writeFile(
    options.reportPath,
    [
      `# ${options.title}`,
      "",
      `- Status: ${options.status}`,
      `- Timestamp: ${nowIso()}`,
      `- RPC: ${normalizeBase(options.rpcUrl || SHADOWNET_RPC_PRIMARY)}`,
      `- TzKT API: ${normalizeBase(SHADOWNET_TZKT_API)}`,
      "",
      ...options.lines,
      "",
    ].join("\n"),
  );
}

export async function fetchText(url: string, userAgent: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  return { status: response.status, text: await response.text() };
}

export async function fetchJson(
  url: string,
  userAgent: string,
): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

export async function probeRpcChainId(): Promise<RpcProbe> {
  const errors: string[] = [];
  for (const rpcUrl of [SHADOWNET_RPC_PRIMARY, SHADOWNET_RPC_FALLBACK]) {
    const base = normalizeBase(rpcUrl);
    try {
      const response = await fetchText(`${base}/chains/main/chain_id`, "wtfos-pasta-shadownet-proof");
      if (response.status >= 200 && response.status < 300) {
        const chainId = response.text.trim().replace(/^"|"$/g, "");
        assert.equal(
          chainId,
          SHADOWNET_CHAIN_ID,
          `${base} returned unexpected chain id ${chainId}`,
        );
        return { rpcUrl: base, chainId };
      }
      errors.push(`${base}: HTTP ${response.status} ${response.text.slice(0, 160)}`);
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No configured Shadownet RPC returned ${SHADOWNET_CHAIN_ID}: ${errors.join(" | ")}`);
}

export async function pollJson(
  label: string,
  url: string,
  predicate: (json: any) => boolean,
  opts: { attempts?: number; delayMs?: number; userAgent?: string } = {},
): Promise<any> {
  const attempts = opts.attempts ?? 30;
  const delayMs = opts.delayMs ?? 4_000;
  const userAgent = opts.userAgent || "wtfos-pasta-shadownet-proof";
  let last: { status: number; json: any; text: string } | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await fetchJson(url, userAgent);
    if (last.status >= 200 && last.status < 300 && predicate(last.json)) return last.json;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `${label} did not appear after ${attempts} attempts: HTTP ${last?.status ?? "n/a"} ${String(
      last?.text ?? "",
    ).slice(0, 500)}`,
  );
}

async function loadMasterKey(): Promise<string> {
  const inline = process.env.WTF_PLATFORM_KEYRING_MASTER_KEY?.trim();
  if (inline) return inline;

  const file = process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || DEFAULT_MASTER_KEY_FILE;
  let value = "";
  try {
    value = (await readFile(file, "utf8")).trim();
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      block("platform keyring master key file is missing", [
        `Expected keyring master key file: \`${file}\`.`,
        "Set `WTF_PLATFORM_KEYRING_MASTER_KEY` or `WTF_PLATFORM_KEYRING_MASTER_KEY_FILE`, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
      ]);
    }
    throw error;
  }

  if (value.length < 24) {
    block("platform keyring master key is too short", [
      `Loaded keyring master key from \`${file}\`, but it does not meet the platform keyring length requirement.`,
      "Provide the correct keyring master key, then rerun with `PASTA_SHADOWNET_E2E_EXECUTE=1`.",
    ]);
  }
  return value;
}

export async function signerEnv(
  rpcUrl: string,
  options: { socketPath?: string; authToken?: string; auditLog?: string } = {},
): Promise<SignerEnv> {
  return {
    WTF_OPERATOR_SIGNER_RPC: rpcUrl,
    WTF_OPERATOR_SIGNER_SOCKET:
      process.env.WTF_OPERATOR_SIGNER_SOCKET || options.socketPath || "/tmp/wtf-pasta-shadownet-e2e.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN:
      process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || options.authToken || "local-pasta-shadownet-e2e",
    WTF_OPERATOR_SIGNER_SECRET: process.env.WTF_OPERATOR_SIGNER_SECRET || "",
    WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID:
      process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID,
    WTF_PLATFORM_KEYRING_PATH: process.env.WTF_PLATFORM_KEYRING_PATH || DEFAULT_KEYRING_PATH,
    WTF_PLATFORM_KEYRING_MASTER_KEY: await loadMasterKey(),
    WTF_PLATFORM_KEYRING_MASTER_KEY_FILE:
      process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || DEFAULT_MASTER_KEY_FILE,
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: 0,
    WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST: [],
    WTF_OPERATOR_SIGNER_DISBURSE_ASSETS: [],
    WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ: 100_000_000,
    WTF_OPERATOR_SIGNER_MAX_RECIPIENTS: 20,
    WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: 0,
    WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION: 1,
    WTF_OPERATOR_SIGNER_MAX_ORIGINATION_BYTES: 750_000,
    WTF_OPERATOR_SIGNER_AUDIT_LOG:
      process.env.WTF_OPERATOR_SIGNER_AUDIT_LOG || options.auditLog || "/tmp/wtf-pasta-shadownet-e2e-audit.log",
  };
}

export function buildToolkit(signer: InMemorySigner, rpcUrl: string): TezosToolkit {
  const tezos = new TezosToolkit(new RpcClient(rpcUrl, "main", new HttpBackend(TAQUITO_TIMEOUT_MS)));
  tezos.setPackerProvider(new MichelCodecPacker());
  tezos.setProvider({ signer });
  return tezos;
}

export async function assertShadownet(tezos: TezosToolkit, stage: string): Promise<void> {
  const chainId = await tezos.rpc.getChainId();
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${stage} RPC returned unexpected chain id ${chainId}`);
}

export async function loadSignerPair(env: SignerEnv): Promise<SignerPair> {
  const keyring = new PlatformWalletKeyring(env);
  const creatorWalletId = process.env.PASTA_SHADOWNET_CREATOR_WALLET_ID || DEFAULT_CREATOR_WALLET_ID;
  const collectorWalletId = process.env.PASTA_SHADOWNET_COLLECTOR_WALLET_ID || DEFAULT_COLLECTOR_WALLET_ID;
  try {
    const { wallet: creator, signer: creatorSigner } = await keyring.getSigner(creatorWalletId);
    const { wallet: collector, signer: collectorSigner } = await keyring.getSigner(collectorWalletId);
    assert.equal(creator.network, "shadownet", `creator wallet ${creator.id} is not Shadownet`);
    assert.equal(collector.network, "shadownet", `collector wallet ${collector.id} is not Shadownet`);
    return { creator, creatorSigner, collector, collectorSigner };
  } catch (error) {
    block("platform keyring signer is unavailable", [
      `Creator wallet id: \`${creatorWalletId}\`.`,
      `Collector wallet id: \`${collectorWalletId}\`.`,
      `Keyring path: \`${env.WTF_PLATFORM_KEYRING_PATH}\`.`,
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

export async function loadSignerSet(env: SignerEnv): Promise<SignerSet> {
  const pair = await loadSignerPair(env);
  const keyring = new PlatformWalletKeyring(env);
  const collectorTwoWalletId =
    process.env.PASTA_SHADOWNET_COLLECTOR_TWO_WALLET_ID || DEFAULT_COLLECTOR_TWO_WALLET_ID;
  try {
    const { wallet: collectorTwo, signer: collectorTwoSigner } = await keyring.getSigner(collectorTwoWalletId);
    assert.equal(collectorTwo.network, "shadownet", `collector wallet ${collectorTwo.id} is not Shadownet`);
    assert.notEqual(collectorTwo.address, pair.collector.address, "collector wallets must be independent");
    assert.notEqual(collectorTwo.address, pair.creator.address, "second collector must not be the creator");
    return { ...pair, collectorTwo, collectorTwoSigner };
  } catch (error) {
    block("second platform keyring collector signer is unavailable", [
      `Second collector wallet id: \`${collectorTwoWalletId}\`.`,
      `Keyring path: \`${env.WTF_PLATFORM_KEYRING_PATH}\`.`,
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

export function collectAnnotations(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAnnotations(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const record = value as { annots?: unknown; args?: unknown };
  if (Array.isArray(record.annots)) {
    for (const annot of record.annots) {
      if (typeof annot === "string" && annot.startsWith("%")) output.add(annot.slice(1));
    }
  }
  if (Array.isArray(record.args)) {
    for (const arg of record.args) collectAnnotations(arg, output);
  }
  return output;
}
