import { HORF_MAINNET_CHAIN_ID } from "../stables/config";

export { HORF_MAINNET_CHAIN_ID };

const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export class HorfRoomsUnconfiguredError extends Error {}
export class HorfRoomsNetworkError extends Error {}

export function horfRoomsContractAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  if ((env.TEZOS_NETWORK || "mainnet").trim().toLowerCase() !== "mainnet") return null;
  const address = (env.HORF_ROOMS_CONTRACT_ADDRESS || "").trim();
  return KT1_RE.test(address) ? address : null;
}

export function requireHorfRoomsContractAddress(env: NodeJS.ProcessEnv = process.env): string {
  const address = horfRoomsContractAddress(env);
  if (!address) throw new HorfRoomsUnconfiguredError("Horf escrow rooms are not configured for Tezos Mainnet");
  return address;
}

/** The same signer may serve V2 and V3: PACK binds the contract address and action. */
export function requireHorfRoomsOracleSecret(env: NodeJS.ProcessEnv = process.env): string {
  const key = (env.HORF_ROOMS_ORACLE_SECRET_KEY || env.HORF_STABLES_ORACLE_SECRET_KEY || "").trim();
  if (!key) throw new HorfRoomsUnconfiguredError("Horf room eligibility signing is not configured");
  return key;
}
