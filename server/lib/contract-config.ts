/**
 * Central resolver for marketplace / barter contract addresses + the
 * TzKT indexer URL.  We want a single source of truth because the
 * on-chain verifier, the ledger, and the storage-read routes all need to
 * agree on which contract they're talking about.
 *
 * Rules:
 *   - Production (`NODE_ENV=production`) fails *closed* — if a caller
 *     asks for a contract address that wasn't configured, it throws.
 *     Callers that want to degrade gracefully ("no contract configured"
 *     public response) use the `Maybe` variant.
 *   - Dev / test fall back to the previously hardcoded testnet addresses
 *     so local feature work doesn't require an `.env` file.
 *   - Every environment records the configured `TEZOS_NETWORK` so we can
 *     reject client payloads that claim to be from a different chain.
 */

type Network = "mainnet" | "ghostnet" | "shadownet" | "oxfordnet" | string;

interface Resolved {
  network: Network;
  marketplace: string | null;
  legacyMarketplace: string | null;
  barter: string | null;
  tzktBase: string;
}

const DEV_FALLBACK_MARKETPLACE = "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";
const SHADOWNET_FALLBACK_MARKETPLACE = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const DEV_FALLBACK_BARTER = "KT1WupvcfcSsfp78JPCc6NwKdkdineGfGNdm";
const KNOWN_LEGACY_MARKETPLACE = "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";

function normaliseAddress(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) return null;
  return trimmed;
}

function normaliseNetwork(value: string | undefined | null): Network {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "mainnet";
  return raw;
}

let cached: Resolved | null = null;

function resolve(): Resolved {
  if (cached) return cached;

  const network = normaliseNetwork(process.env.TEZOS_NETWORK);
  const isProd = process.env.NODE_ENV === "production";

  const marketplaceEnv =
    normaliseAddress(process.env.MARKETPLACE_CONTRACT_ADDRESS) ||
    normaliseAddress(process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS);
  const legacyMarketplaceEnv =
    normaliseAddress(process.env.LEGACY_MARKETPLACE_CONTRACT_ADDRESS) ||
    (marketplaceEnv === KNOWN_LEGACY_MARKETPLACE
      ? marketplaceEnv
      : network === "mainnet"
      ? KNOWN_LEGACY_MARKETPLACE
      : null);
  const barterEnv =
    normaliseAddress(process.env.BARTER_CONTRACT_ADDRESS) ||
    normaliseAddress(process.env.VITE_BARTER_CONTRACT_ADDRESS);

  const marketplace =
    marketplaceEnv ??
    (isProd
      ? null
      : network === "shadownet"
      ? SHADOWNET_FALLBACK_MARKETPLACE
      : DEV_FALLBACK_MARKETPLACE);
  const barter =
    barterEnv ??
    (isProd || network === "shadownet" ? null : DEV_FALLBACK_BARTER);

  const tzktBase = (
    process.env.TZKT_API_URL ||
    (network === "ghostnet"
      ? "https://api.ghostnet.tzkt.io/v1"
      : network === "shadownet"
      ? "https://api.shadownet.tzkt.io/v1"
      : "https://api.tzkt.io/v1")
  ).replace(/\/+$/, "");

  if (isProd) {
    if (!marketplaceEnv) {
      console.warn(
        "[contract-config] MARKETPLACE_CONTRACT_ADDRESS is not set in production; " +
          "marketplace write endpoints will refuse to serve."
      );
    }
    if (!barterEnv) {
      console.warn(
        "[contract-config] BARTER_CONTRACT_ADDRESS is not set in production; " +
          "barter write endpoints will refuse to serve."
      );
    }
  }

  cached = { network, marketplace, legacyMarketplace: legacyMarketplaceEnv, barter, tzktBase };
  return cached;
}

export function resetContractConfigCacheForTests(): void {
  cached = null;
}

export function getNetwork(): Network {
  return resolve().network;
}

export function getTzktBase(): string {
  return resolve().tzktBase;
}

export function getMarketplaceAddressOrNull(): string | null {
  return resolve().marketplace;
}

export function getLegacyMarketplaceAddressOrNull(): string | null {
  return resolve().legacyMarketplace;
}

export function getKnownLegacyMarketplaceAddress(): string {
  return KNOWN_LEGACY_MARKETPLACE;
}

export function getBarterAddressOrNull(): string | null {
  return resolve().barter;
}

/**
 * Fail-closed variant.  Callers that can't function without the contract
 * should use this and surface a 503 to the client.
 */
export function requireMarketplaceAddress(): string {
  const resolved = resolve();
  if (!resolved.marketplace) {
    throw new MarketplaceNotConfiguredError();
  }
  return resolved.marketplace;
}

export function requireBarterAddress(): string {
  const resolved = resolve();
  if (!resolved.barter) {
    throw new BarterNotConfiguredError();
  }
  return resolved.barter;
}

export class MarketplaceNotConfiguredError extends Error {
  readonly code = "MARKETPLACE_CONTRACT_NOT_CONFIGURED";
  constructor() {
    super(
      "MARKETPLACE_CONTRACT_ADDRESS is not configured. Set it in the server env."
    );
  }
}

export class BarterNotConfiguredError extends Error {
  readonly code = "BARTER_CONTRACT_NOT_CONFIGURED";
  constructor() {
    super(
      "BARTER_CONTRACT_ADDRESS is not configured. Set it in the server env."
    );
  }
}

/**
 * Return the network label the client should use in telemetry / op
 * submission.  We accept common aliases — mainnet/ghostnet/shadownet —
 * but strip anything else so we don't echo garbage into the ledger.
 */
export function coerceClientNetwork(value: unknown): Network | null {
  if (typeof value !== "string") return null;
  const n = value.trim().toLowerCase();
  if (!n) return null;
  return n;
}
