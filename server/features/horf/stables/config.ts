export const HORF_MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
export const HORF_MAINNET_TZKT = "https://api.tzkt.io/v1";

const TEZOS_CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export class HorfStablesUnconfiguredError extends Error {}
export class HorfStablesNetworkError extends Error {}

export function horfStablesContractAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  const network = (env.TEZOS_NETWORK || "mainnet").trim().toLowerCase();
  if (network !== "mainnet") return null;
  const address = (env.HORF_STABLES_CONTRACT_ADDRESS || "").trim();
  return TEZOS_CONTRACT_RE.test(address) ? address : null;
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
