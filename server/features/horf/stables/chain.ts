import { horfMainnetIndex } from "../mainnet-index";
import { InMemorySigner } from "@taquito/signer";
import {
  HORF_MAINNET_CHAIN_ID,
  HorfStablesNetworkError,
  horfStablesContractAddress,
  requireHorfOracleSecret,
  requireHorfStablesContractAddress,
} from "./config";
import { isTezosWallet } from "../model";

export interface ChainReader {
  getJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T>;
}

interface TzktHead {
  chainId?: string;
  timestamp?: string;
  level?: number;
}

interface TzktKey {
  id?: number;
  active?: boolean;
  key?: unknown;
  value?: unknown;
}

export interface HorfStableListing {
  id: string;
  mode: 0 | 1 | 2;
  owner: string;
  tokenContract: string;
  tokenId: string;
  submitted: string;
  remaining: string;
  claimedByWallet: boolean | null;
}

export interface HorfStablesSnapshot {
  network: "mainnet";
  chainId: typeof HORF_MAINNET_CHAIN_ID;
  contractAddress: string | null;
  status: "ready" | "unconfigured";
  permitReady: boolean;
  adminAddress: string | null;
  onChainBlacklisted: boolean | null;
  asOf: string | null;
  reciprocalCredits: string;
  groupCredits: string;
  listings: HorfStableListing[];
}

function nat(value: unknown, label: string): string {
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label} in Horf stable chain state`);
  return BigInt(text).toString();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Horf stable chain record");
  }
  return value as Record<string, unknown>;
}

export function readHorfStableListing(row: TzktKey): HorfStableListing | null {
  if (row.active === false) return null;
  const source = record(row.value);
  const remaining = nat(source.remaining, "listing remainder");
  if (remaining === "0") return null;
  const mode = Number(nat(source.mode, "listing mode"));
  if (mode !== 0 && mode !== 1 && mode !== 2) throw new Error("Unknown Horf stable mode");
  const owner = String(source.owner || "");
  const tokenContract = String(source.token_contract || "");
  if (!isTezosWallet(owner) || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(tokenContract)) {
    throw new Error("Invalid Horf stable listing address");
  }
  return {
    id: nat(row.key, "listing ID"),
    mode,
    owner,
    tokenContract,
    tokenId: nat(source.token_id, "listing token ID"),
    submitted: nat(source.submitted, "listing submission"),
    remaining,
    claimedByWallet: null,
  };
}

export async function assertHorfStablesMainnet(reader: ChainReader = horfMainnetIndex): Promise<TzktHead> {
  const head = await reader.getJson<TzktHead>("/head");
  if (head?.chainId !== HORF_MAINNET_CHAIN_ID) {
    throw new HorfStablesNetworkError("Horf stables require Tezos mainnet");
  }
  return head;
}

export interface HorfStablesContractStorage {
  admin: string;
  oracle_key: string;
  oracle_epoch: string | number;
  next_listing_id: string | number;
}

async function oracleMatches(storage: HorfStablesContractStorage, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    const signer = await InMemorySigner.fromSecretKey(requireHorfOracleSecret(env));
    return await signer.publicKey() === storage.oracle_key;
  } catch {
    return false;
  }
}

export async function readHorfStablesStorage(
  contractAddress: string,
  reader: ChainReader = horfMainnetIndex,
): Promise<HorfStablesContractStorage> {
  const storage = await reader.getJson<unknown>(`/contracts/${contractAddress}/storage`);
  const value = record(storage);
  if (!isTezosWallet(value.admin)) throw new Error("Horf Stable admin address is invalid");
  if (typeof value.oracle_key !== "string" || value.oracle_key.length === 0) {
    throw new Error("Horf stable oracle key is missing from contract storage");
  }
  nat(value.oracle_epoch, "oracle epoch");
  nat(value.next_listing_id, "next listing ID");
  return value as unknown as HorfStablesContractStorage;
}

async function readWalletKey(
  contractAddress: string,
  mapName: "blacklisted" | "reciprocal_credits" | "group_credits",
  address: string,
  reader: ChainReader,
): Promise<TzktKey | null> {
  // TzKT returns 204 with no JSON body for an absent singleton key. Its
  // filtered collection returns JSON [] and still identifies an exact key.
  const keys = await reader.getJson<TzktKey[]>(
    `/contracts/${contractAddress}/bigmaps/${mapName}/keys`,
    { key: address, limit: 2 },
  );
  if (!Array.isArray(keys) || keys.length > 1 || (keys[0] && keys[0].key !== address)) {
    throw new Error(`Horf stable ${mapName} index did not filter the wallet`);
  }
  return keys[0] ?? null;
}

async function readOnChainBlacklist(contractAddress: string, address: string | null, reader: ChainReader): Promise<boolean | null> {
  if (!address) return null;
  const key = await readWalletKey(contractAddress, "blacklisted", address, reader);
  return key?.active !== false && key?.value === true;
}

async function readCredit(
  contractAddress: string,
  mapName: "reciprocal_credits" | "group_credits",
  address: string | null,
  reader: ChainReader,
): Promise<string> {
  if (!address) return "0";
  const key = await readWalletKey(contractAddress, mapName, address, reader);
  return !key || key.active === false ? "0" : nat(key.value, `${mapName} balance`);
}

async function readListings(contractAddress: string, reader: ChainReader): Promise<HorfStableListing[]> {
  const listings: HorfStableListing[] = [];
  let cursor = 0;
  // 100 is TzKT's documented default page size; cursor paging has no total cap.
  const pageSize = 100;
  while (true) {
    const rows = await reader.getJson<TzktKey[]>(
      `/contracts/${contractAddress}/bigmaps/listings/keys`,
      { active: true, "sort.asc": "id", "offset.cr": cursor, limit: pageSize },
    );
    if (!Array.isArray(rows)) throw new Error("Horf stable listing page was not an array");
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor) {
        throw new Error("Horf stable listing cursor did not advance");
      }
      cursor = id;
      const listing = readHorfStableListing(row);
      if (listing) listings.push(listing);
    }
    if (rows.length < pageSize) break;
  }
  return listings.sort((a, b) => BigInt(a.id) === BigInt(b.id) ? 0 : BigInt(a.id) < BigInt(b.id) ? 1 : -1);
}

async function readGroupClaims(
  contractAddress: string,
  address: string | null,
  reader: ChainReader,
): Promise<Set<string>> {
  const claimed = new Set<string>();
  if (!address) return claimed;
  let cursor = 0;
  const pageSize = 100;
  while (true) {
    const rows = await reader.getJson<TzktKey[]>(
      `/contracts/${contractAddress}/bigmaps/group_claimed/keys`,
      { active: true, "key.claimant": address, "sort.asc": "id", "offset.cr": cursor, limit: pageSize },
    );
    if (!Array.isArray(rows)) throw new Error("Horf stable claim page was not an array");
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor) {
        throw new Error("Horf stable claim cursor did not advance");
      }
      cursor = id;
      const key = record(row.key);
      if (key.claimant !== address) {
        throw new Error("Horf stable claim index did not filter by wallet");
      }
      const tokenContract = String(key.token_contract || "");
      const tokenId = nat(key.token_id, "claimed token ID");
      claimed.add(`${tokenContract}/${tokenId}`);
    }
    if (rows.length < pageSize) break;
  }
  return claimed;
}

export async function getHorfStablesSnapshot(
  address: string | null,
  reader: ChainReader = horfMainnetIndex,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HorfStablesSnapshot> {
  const contractAddress = horfStablesContractAddress(env);
  const empty: HorfStablesSnapshot = {
    network: "mainnet",
    chainId: HORF_MAINNET_CHAIN_ID,
    contractAddress: null,
    status: "unconfigured",
    permitReady: false,
    adminAddress: null,
    onChainBlacklisted: null,
    asOf: null,
    reciprocalCredits: "0",
    groupCredits: "0",
    listings: [],
  };
  if (!contractAddress) return empty;
  requireHorfStablesContractAddress(env);
  const head = await assertHorfStablesMainnet(reader);
  const storage = await readHorfStablesStorage(contractAddress, reader);
  const [listings, reciprocalCredits, groupCredits, groupClaims, permitReady, onChainBlacklisted] = await Promise.all([
    readListings(contractAddress, reader),
    readCredit(contractAddress, "reciprocal_credits", address, reader),
    readCredit(contractAddress, "group_credits", address, reader),
    readGroupClaims(contractAddress, address, reader),
    oracleMatches(storage, env),
    readOnChainBlacklist(contractAddress, address, reader),
  ]);
  return {
    ...empty,
    contractAddress,
    status: "ready",
    permitReady,
    adminAddress: storage.admin,
    onChainBlacklisted,
    asOf: head.timestamp || null,
    reciprocalCredits,
    groupCredits,
    listings: listings.map((listing) => ({
      ...listing,
      claimedByWallet: listing.mode === 2 && address
        ? groupClaims.has(`${listing.tokenContract}/${listing.tokenId}`)
        : null,
    })),
  };
}
