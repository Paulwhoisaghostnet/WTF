import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TezosToolkit } from "@taquito/taquito";
import type { InMemorySigner } from "@taquito/signer";

import keyringModule from "../../extensions/wtf-operator-signer/src/keyring";
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
const { PlatformWalletKeyring } = keyringModule as any;

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

export class ProofBlocked extends Error {
  constructor(
    message: string,
    readonly lines: string[],
  ) {
    super(message);
    this.name = "ProofBlocked";
  }
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
  });
  return { status: response.status, text: await response.text() };
}

export async function fetchJson(
  url: string,
  userAgent: string,
): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
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
  const tezos = new TezosToolkit(rpcUrl);
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
