import { packDataBytes } from "@taquito/michel-codec";
import { InMemorySigner } from "@taquito/signer";
import { b58DecodeAddress, b58DecodeAndCheckPrefix, PrefixV2 } from "@taquito/utils";
import { horfMainnetIndex } from "./mainnet-index";
import { getHorfHorseConfig, HORF_HORSE_CHAIN_ID, HORF_HORSE_ORIGINATOR, horseContractAddress, type HorseChainReader } from "./horse-config";
import { isTezosWallet } from "./model";

const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
/** Verified wtf.tez Mainnet origination KT1KH1xShHGtNpfqwK8SsdfMxGZTPYs8aDpT. */
export const HORF_HORSE_CLAIM_CODE_HASH = 490344894;
export const HORF_HORSE_CLAIM_ORACLE_PUBLIC_KEY = "edpkv5vGcno1bQEwzPNpUqg3eLBi7j23WrfSjfi7X9DGdBsLXiVThL";

export class HorfHorseClaimUnconfiguredError extends Error {}
export class HorfHorseClaimSyncError extends Error {}

export function horseClaimContractAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  const address = String(env.HORF_HORSE_CLAIM_CONTRACT_ADDRESS || "").trim();
  return CONTRACT_RE.test(address) ? address : null;
}

function nat(value: unknown, label: string): string {
  const raw = typeof value === "number" && Number.isSafeInteger(value) ? String(value) :
    typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${label} in HORSE claim vault`);
  return BigInt(raw).toString();
}

export interface HorseClaimStorage {
  admin: string;
  horse_contract: string;
  horse_token_id: string | number;
  oracle_key: string;
  oracle_epoch: string | number;
}

export interface HorseClaimReader extends HorseChainReader {}

export interface HorseClaimSigner {
  publicKey(): Promise<string>;
  sign(bytes: string): Promise<{ prefixSig: string }>;
}

export interface HorseClaimVaultState {
  contractAddress: string;
  oracleEpoch: string;
  claimedRaw: string;
  balanceRaw: string;
  asOf: string | null;
  signer: HorseClaimSigner | null;
}

/** An absent vault is a valid prelaunch state; a configured vault must read accurately. */
export async function readConfiguredHorseClaimVault(
  address: string,
  options: { reader?: HorseClaimReader; env?: NodeJS.ProcessEnv; signer?: HorseClaimSigner } = {},
): Promise<HorseClaimVaultState | null> {
  const env = options.env ?? process.env;
  if (!env.HORF_HORSE_CLAIM_CONTRACT_ADDRESS?.trim()) return null;
  return readHorseClaimVault(address, options);
}

/** Read Mainnet state, and accept only the wtf.tez vault holding the verified HORSE clone. */
export async function readHorseClaimVault(
  address: string,
  options: { reader?: HorseClaimReader; env?: NodeJS.ProcessEnv; signer?: HorseClaimSigner } = {},
): Promise<HorseClaimVaultState> {
  if (!isTezosWallet(address)) throw new Error("Invalid HORSE claimant wallet");
  const env = options.env ?? process.env;
  const contractAddress = horseClaimContractAddress(env);
  if (!contractAddress) throw new HorfHorseClaimUnconfiguredError("HORSE claim vault is not deployed");
  const reader = options.reader ?? horfMainnetIndex;
  const horseContract = horseContractAddress(env);
  if (!horseContract) throw new HorfHorseClaimUnconfiguredError("HORSE token is not configured");
  const [head, contract, storage, horse] = await Promise.all([
    reader.getJson<{ chainId?: string; timestamp?: string }>("/head"),
    reader.getJson<{ creator?: { address?: string }; codeHash?: number }>(`/contracts/${contractAddress}`),
    reader.getJson<HorseClaimStorage>(`/contracts/${contractAddress}/storage`),
    getHorfHorseConfig(null, reader, env),
  ]);
  if (head.chainId !== HORF_HORSE_CHAIN_ID || contract.codeHash !== HORF_HORSE_CLAIM_CODE_HASH ||
      contract.creator?.address !== HORF_HORSE_ORIGINATOR ||
      storage.admin !== HORF_HORSE_ORIGINATOR || storage.horse_contract !== horseContract ||
      nat(storage.horse_token_id, "token ID") !== "0" ||
      storage.oracle_key !== HORF_HORSE_CLAIM_ORACLE_PUBLIC_KEY ||
      !horse.token || horse.token.contract !== horseContract) {
    throw new Error("HORSE claim vault identity or Mainnet chain is not verified");
  }
  let claimedRaw = "0";
  const balances = await reader.getJson<Array<{
    account?: { address?: string }; token?: { contract?: { address?: string }; tokenId?: string }; balance?: string;
  }>>("/tokens/balances", {
    account: contractAddress, "token.contract": horseContract, "token.tokenId": "0", limit: 1,
  });
  if (!Array.isArray(balances)) throw new Error("HORSE vault balance index was not an array");
  const balance = balances[0];
  if (balance && (balance.account?.address !== contractAddress ||
      balance.token?.contract?.address !== horseContract || String(balance.token?.tokenId) !== "0")) {
    throw new Error("HORSE vault balance index did not filter the expected token");
  }
  // TzKT returns HTTP 204 (empty body) for an absent single big-map key, so
  // use the filtered collection endpoint, which returns JSON [] instead.
  const keys = await reader.getJson<Array<{ active?: boolean; key?: unknown; value?: unknown }>>(
    `/contracts/${contractAddress}/bigmaps/claimed_raw/keys`, { key: address },
  );
  if (!Array.isArray(keys) || keys.length > 1 ||
      (keys[0] && keys[0].key !== address)) {
    throw new Error("HORSE claimed balance index did not filter the claimant");
  }
  if (keys[0] && keys[0].active !== false) claimedRaw = nat(keys[0].value, "claimed amount");
  let signer = options.signer ?? null;
  if (!signer && env.HORF_HORSE_CLAIM_ORACLE_SECRET_KEY?.trim()) {
    try { signer = await InMemorySigner.fromSecretKey(env.HORF_HORSE_CLAIM_ORACLE_SECRET_KEY.trim()); }
    catch { throw new HorfHorseClaimUnconfiguredError("HORSE claim oracle key is invalid"); }
  }
  if (signer && await signer.publicKey() !== storage.oracle_key) {
    throw new HorfHorseClaimUnconfiguredError("HORSE claim oracle key does not match the vault");
  }
  return {
    contractAddress, oracleEpoch: nat(storage.oracle_epoch, "oracle epoch"),
    claimedRaw, balanceRaw: balance ? nat(balance.balance, "vault HORSE balance") : "0",
    asOf: head.timestamp || horse.asOf, signer,
  };
}

export interface HorseClaimPermitInput {
  chainId: string;
  contractAddress: string;
  address: string;
  totalRaw: string;
  oracleEpoch: string;
}

/** Exact SmartPy PACK of (chain_id, (self, (sender, (total_raw, oracle_epoch)))). */
export function packHorseClaimPermit(input: HorseClaimPermitInput): string {
  const chainIdBytes = Buffer.from(
    b58DecodeAndCheckPrefix(input.chainId, [PrefixV2.ChainID])[0],
  ).toString("hex");
  const data = { prim: "Pair", args: [
    { bytes: chainIdBytes },
    { prim: "Pair", args: [
      { bytes: b58DecodeAddress(input.contractAddress) },
      { prim: "Pair", args: [
        { bytes: b58DecodeAddress(input.address) },
        { prim: "Pair", args: [
          { int: nat(input.totalRaw, "total claim") },
          { int: nat(input.oracleEpoch, "oracle epoch") },
        ] },
      ] },
    ] },
  ] };
  const type = { prim: "pair", args: [
    { prim: "chain_id" },
    { prim: "pair", args: [
      { prim: "address" },
      { prim: "pair", args: [
        { prim: "address" },
        { prim: "pair", args: [{ prim: "nat" }, { prim: "nat" }] },
      ] },
    ] },
  ] };
  return packDataBytes(data as never, type as never).bytes;
}

export async function signHorseClaimPermit(
  address: string,
  totalRaw: string,
  vault: HorseClaimVaultState,
): Promise<{ contractAddress: string; chainId: typeof HORF_HORSE_CHAIN_ID; totalRaw: string; claimedRaw: string; claimableRaw: string; oracleEpoch: string; signature: string }> {
  const total = BigInt(nat(totalRaw, "total claim"));
  const claimed = BigInt(vault.claimedRaw);
  if (total <= claimed) throw new HorfHorseClaimUnconfiguredError("No unclaimed HORSE is available");
  const delta = total - claimed;
  if (BigInt(vault.balanceRaw) < delta) throw new HorfHorseClaimUnconfiguredError("HORSE claim vault needs more HORSE funding");
  if (!vault.signer) throw new HorfHorseClaimUnconfiguredError("HORSE claim oracle is not configured");
  const bytes = packHorseClaimPermit({
    chainId: HORF_HORSE_CHAIN_ID,
    contractAddress: vault.contractAddress,
    address, totalRaw: total.toString(), oracleEpoch: vault.oracleEpoch,
  });
  const signature = (await vault.signer.sign(bytes)).prefixSig;
  return {
    contractAddress: vault.contractAddress, chainId: HORF_HORSE_CHAIN_ID,
    totalRaw: total.toString(), claimedRaw: vault.claimedRaw,
    claimableRaw: delta.toString(), oracleEpoch: vault.oracleEpoch, signature,
  };
}
