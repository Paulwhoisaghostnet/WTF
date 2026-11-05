import { InMemorySigner } from "@taquito/signer";
import { horfMainnetIndex } from "../mainnet-index";
import { isTezosWallet } from "../model";
import { HORF_MAINNET_CHAIN_ID, HorfRoomsNetworkError,
  horfRoomsContractAddress, requireHorfRoomsContractAddress, requireHorfRoomsOracleSecret } from "./config";

export interface RoomChainReader {
  getJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T>;
}

type TzktHead = { chainId?: string; timestamp?: string };
type TzktKey = { id?: number; active?: boolean; key?: unknown; value?: unknown };

export type HorfRoomMode = 0 | 1 | 2 | 3;
export interface HorfPrivateTerms {
  offerer: string;
  inputTokenContract: string;
  inputTokenId: string;
}
export interface HorfRoomListing {
  id: string;
  mode: HorfRoomMode;
  owner: string;
  tokenContract: string;
  tokenId: string;
  submitted: string;
  remaining: string;
  claimedByWallet: boolean | null;
}

export interface HorfRoomsSnapshot {
  network: "mainnet";
  chainId: typeof HORF_MAINNET_CHAIN_ID;
  contractAddress: string | null;
  status: "ready" | "unconfigured";
  permitReady: boolean;
  adminAddress: string | null;
  onChainBlacklisted: boolean | null;
  asOf: string | null;
  reciprocalCredits: string;
  listings: HorfRoomListing[];
}

export interface HorfRoomsStorage {
  admin: string;
  oracle_key: string;
  oracle_epoch: string | number;
  next_listing_id: string | number;
}

function nat(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label} in Horf room chain state`);
  return BigInt(text).toString();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Horf room chain record");
  return value as Record<string, unknown>;
}

export function readHorfRoomListing(row: TzktKey): HorfRoomListing | null {
  if (row.active === false) return null;
  const source = record(row.value);
  const remaining = nat(source.remaining, "listing remainder");
  if (remaining === "0") return null;
  const mode = Number(nat(source.mode, "listing mode"));
  if (mode !== 0 && mode !== 1 && mode !== 2 && mode !== 3) throw new Error("Unknown Horf room mode");
  const owner = String(source.owner || "");
  const tokenContract = String(source.token_contract || "");
  if (!isTezosWallet(owner) || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(tokenContract)) {
    throw new Error("Invalid Horf room listing address");
  }
  return {
    id: nat(row.key, "listing ID"), mode, owner, tokenContract,
    tokenId: nat(source.token_id, "token ID"), submitted: nat(source.submitted, "submitted editions"),
    remaining, claimedByWallet: null,
  };
}

/** Exact on-chain terms for one private listing; the caller still checks offer participants. */
export async function readHorfPrivateTerms(
  contractAddress: string, listingId: string, reader: RoomChainReader = horfMainnetIndex,
): Promise<HorfPrivateTerms | null> {
  const id = nat(listingId, "private listing ID");
  const rows = await reader.getJson<TzktKey[]>(`/contracts/${contractAddress}/bigmaps/private_terms/keys`,
    { key: id, limit: 2 });
  if (!Array.isArray(rows) || rows.length > 1 || (rows[0] && nat(rows[0].key, "private terms key") !== id)) {
    throw new Error("Horf private terms index did not filter the listing");
  }
  if (!rows[0] || rows[0].active === false) return null;
  const value = record(rows[0].value);
  const offerer = String(value.offerer || "");
  const inputTokenContract = String(value.input_token_contract || "");
  if (!isTezosWallet(offerer) || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(inputTokenContract)) {
    throw new Error("Invalid Horf private offer terms");
  }
  return { offerer, inputTokenContract, inputTokenId: nat(value.input_token_id, "private input token ID") };
}

export async function assertHorfRoomsMainnet(reader: RoomChainReader = horfMainnetIndex): Promise<TzktHead> {
  const head = await reader.getJson<TzktHead>("/head");
  if (head?.chainId !== HORF_MAINNET_CHAIN_ID) throw new HorfRoomsNetworkError("Horf rooms require Tezos Mainnet");
  return head;
}

export async function readHorfRoomsStorage(
  contractAddress: string, reader: RoomChainReader = horfMainnetIndex,
): Promise<HorfRoomsStorage> {
  const value = record(await reader.getJson<unknown>(`/contracts/${contractAddress}/storage`));
  if (!isTezosWallet(value.admin)) throw new Error("Horf room admin address is invalid");
  if (typeof value.oracle_key !== "string" || !value.oracle_key) throw new Error("Horf room oracle key is missing");
  nat(value.oracle_epoch, "oracle epoch");
  nat(value.next_listing_id, "next listing ID");
  return value as unknown as HorfRoomsStorage;
}

async function readWalletKey(
  contractAddress: string, mapName: "blacklisted" | "reciprocal_credits", address: string,
  reader: RoomChainReader,
): Promise<TzktKey | null> {
  const rows = await reader.getJson<TzktKey[]>(`/contracts/${contractAddress}/bigmaps/${mapName}/keys`,
    { key: address, limit: 2 });
  if (!Array.isArray(rows) || rows.length > 1 || (rows[0] && rows[0].key !== address)) {
    throw new Error(`Horf room ${mapName} index did not filter the wallet`);
  }
  return rows[0] ?? null;
}

async function readListings(contractAddress: string, reader: RoomChainReader): Promise<HorfRoomListing[]> {
  const listings: HorfRoomListing[] = [];
  let cursor = 0;
  const pageSize = 100; // TzKT's documented default page size; cursor paging has no total cap.
  while (true) {
    const rows = await reader.getJson<TzktKey[]>(`/contracts/${contractAddress}/bigmaps/listings/keys`,
      { active: true, "sort.asc": "id", "offset.cr": cursor, limit: pageSize });
    if (!Array.isArray(rows)) throw new Error("Horf room listing page was not an array");
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor) throw new Error("Horf room listing cursor did not advance");
      cursor = id;
      const listing = readHorfRoomListing(row);
      if (listing) listings.push(listing);
    }
    if (rows.length < pageSize) break;
  }
  return listings.sort((left, right) => BigInt(left.id) === BigInt(right.id) ? 0
    : BigInt(left.id) < BigInt(right.id) ? 1 : -1);
}

async function readClaimedTokens(contractAddress: string, address: string | null, reader: RoomChainReader): Promise<Set<string>> {
  const claimed = new Set<string>();
  if (!address) return claimed;
  let cursor = 0;
  const pageSize = 100;
  while (true) {
    const rows = await reader.getJson<TzktKey[]>(`/contracts/${contractAddress}/bigmaps/claimed_tokens/keys`,
      { active: true, "key.claimant": address, "sort.asc": "id", "offset.cr": cursor, limit: pageSize });
    if (!Array.isArray(rows)) throw new Error("Horf room claim page was not an array");
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor) throw new Error("Horf room claim cursor did not advance");
      cursor = id;
      const key = record(row.key);
      if (key.claimant !== address) throw new Error("Horf room claim index did not filter the wallet");
      claimed.add(`${String(key.token_contract || "")}/${nat(key.token_id, "claimed token ID")}`);
    }
    if (rows.length < pageSize) break;
  }
  return claimed;
}

async function oracleMatches(storage: HorfRoomsStorage, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    const signer = await InMemorySigner.fromSecretKey(requireHorfRoomsOracleSecret(env));
    return await signer.publicKey() === storage.oracle_key;
  } catch { return false; }
}

export async function getHorfRoomsSnapshot(
  address: string | null, reader: RoomChainReader = horfMainnetIndex,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HorfRoomsSnapshot> {
  const empty: HorfRoomsSnapshot = {
    network: "mainnet", chainId: HORF_MAINNET_CHAIN_ID, contractAddress: null,
    status: "unconfigured", permitReady: false, adminAddress: null,
    onChainBlacklisted: null, asOf: null, reciprocalCredits: "0", listings: [],
  };
  const contractAddress = horfRoomsContractAddress(env);
  if (!contractAddress) return empty;
  requireHorfRoomsContractAddress(env);
  const head = await assertHorfRoomsMainnet(reader);
  const storage = await readHorfRoomsStorage(contractAddress, reader);
  const [listings, creditsRow, blacklistRow, claimed, permitReady] = await Promise.all([
    readListings(contractAddress, reader),
    address ? readWalletKey(contractAddress, "reciprocal_credits", address, reader) : null,
    address ? readWalletKey(contractAddress, "blacklisted", address, reader) : null,
    readClaimedTokens(contractAddress, address, reader),
    oracleMatches(storage, env),
  ]);
  return {
    ...empty, contractAddress, status: "ready", permitReady, adminAddress: storage.admin,
    onChainBlacklisted: address ? blacklistRow?.active !== false && blacklistRow?.value === true : null,
    asOf: head.timestamp || null,
    reciprocalCredits: !creditsRow || creditsRow.active === false ? "0" : nat(creditsRow.value, "reciprocal credits"),
    listings: listings.map((listing) => ({ ...listing,
      claimedByWallet: address ? claimed.has(`${listing.tokenContract}/${listing.tokenId}`) : null,
    })),
  };
}
