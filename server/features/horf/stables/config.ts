export const HORF_MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
export const HORF_MAINNET_TZKT = "https://api.tzkt.io/v1";

const TEZOS_CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export class HorfStablesUnconfiguredError extends Error {}
export class HorfStablesNetworkError extends Error {}

/** Keep V2 claims and cancellations readable after V3 takes over new deposits. */
export function horfLegacyDepositsClosed(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.TEZOS_NETWORK || "mainnet").trim().toLowerCase() === "mainnet"
    && Boolean((env.HORF_ROOMS_CONTRACT_ADDRESS || "").trim());
}

export function horfStablesContractAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  const network = (env.TEZOS_NETWORK || "mainnet").trim().toLowerCase();
  if (network !== "mainnet") return null;
  const address = (env.HORF_STABLES_CONTRACT_ADDRESS || "").trim();
  return TEZOS_CONTRACT_RE.test(address) ? address : null;
}

/** Read historic Mainnet claims after the active Stable contract changes. */
export function horfStableClaimSourceAddresses(env: NodeJS.ProcessEnv = process.env): string[] {
  if ((env.TEZOS_NETWORK || "mainnet").trim().toLowerCase() !== "mainnet") return [];
  const legacy = (env.HORF_STABLES_LEGACY_CONTRACT_ADDRESSES || "").trim();
  const legacyAddresses = legacy ? legacy.split(",").map((address) => address.trim()) : [];
  if (legacyAddresses.some((address) => !TEZOS_CONTRACT_RE.test(address))) {
    throw new HorfStablesUnconfiguredError("Horf legacy Stable claim sources must be Tezos Mainnet KT1 addresses");
  }
  const active = horfStablesContractAddress(env);
  return Array.from(new Set([...(active ? [active] : []), ...legacyAddresses]));
}

export function requireHorfStablesContractAddress(env: NodeJS.ProcessEnv = process.env): string {
  const address = horfStablesContractAddress(env);
  if (!address) {
    throw new HorfStablesUnconfiguredError("Horf stables are not configured for Tezos mainnet");
  }
  return address;
}

export function requireHorfOracleSecret(env: NodeJS.ProcessEnv = process.env): string {
  const key = (env.HORF_STABLES_ORACLE_SECRET_KEY || "").trim();
  if (!key) throw new HorfStablesUnconfiguredError("Horf stable eligibility signing is not configured");
  return key;
}
