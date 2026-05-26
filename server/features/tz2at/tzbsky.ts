import { TZ2AT_TZBSKY_COLLECTION } from "@shared/atproto-permissions";

export type Tz2atIdentityChain = "tezos" | "etherlink";

export interface ParsedTzbskyWalletProof {
  chain: Tz2atIdentityChain;
  walletAddress: string;
  proof: Record<string, unknown>;
  publicKey: string | null;
  raw: Record<string, unknown>;
}

const TEZOS_ADDRESS_RE = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeTzbskyChain(value: unknown): Tz2atIdentityChain | null {
  const chain = String(value || "").trim().toLowerCase();
  if (chain === "tezos" || chain === "tezos_l1") return "tezos";
  if (chain === "etherlink" || chain === "etherlink_mainnet" || chain === "evm") {
    return "etherlink";
  }
  return null;
}

export function isTz2atWalletAddress(chain: Tz2atIdentityChain, value: unknown): value is string {
  const address = String(value || "").trim();
  return chain === "tezos" ? TEZOS_ADDRESS_RE.test(address) : EVM_ADDRESS_RE.test(address);
}

export function normalizeTz2atWalletAddress(chain: Tz2atIdentityChain, value: string): string {
  return chain === "etherlink" ? value.trim().toLowerCase() : value.trim();
}

export function parseTzbskyCryptoAddressRecord(input: unknown): ParsedTzbskyWalletProof[] {
  if (!input || typeof input !== "object") {
    throw new Error("tzbsky record must be an object");
  }
  const record = input as Record<string, unknown>;
  if (record.$type !== TZ2AT_TZBSKY_COLLECTION) {
    throw new Error(`tzbsky record must have $type ${TZ2AT_TZBSKY_COLLECTION}`);
  }
  if (!Array.isArray(record.addresses)) {
    throw new Error("tzbsky record must include addresses[]");
  }

  const parsed = record.addresses.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`tzbsky addresses[${index}] must be an object`);
    }
    const raw = entry as Record<string, unknown>;
    const chain = normalizeTzbskyChain(raw.chain);
    if (!chain) throw new Error(`tzbsky addresses[${index}] has unsupported chain`);
    if (!isTz2atWalletAddress(chain, raw.address)) {
      throw new Error(`tzbsky addresses[${index}] has invalid ${chain} address`);
    }
    if (!raw.proof || typeof raw.proof !== "object") {
      throw new Error(`tzbsky addresses[${index}] is missing proof`);
    }
    return {
      chain,
      walletAddress: normalizeTz2atWalletAddress(chain, String(raw.address)),
      proof: raw.proof as Record<string, unknown>,
      publicKey: typeof raw.publicKey === "string" ? raw.publicKey : null,
      raw,
    };
  });

  return parsed;
}
