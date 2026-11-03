import { ValidationResult, validateAddress } from "@taquito/utils";
import { externalMarketplaceInfo } from "@shared/external-marketplaces";
import { objkt } from "../../../lib/upstream";
import { horfMainnetIndex } from "../mainnet-index";
import { HORF_MAINNET_CHAIN_ID } from "../stables/config";
import { OBJKT_PAGE_SIZE } from "../source";

/** A token can have several Objkt asks. The caller pages until nextCursor is null. */
export const HORF_OBJKT_LISTINGS_QUERY = `query HorfObjktListings($contract: String!, $tokenId: String!, $limit: Int!, $offset: Int!) {
  token(where: {fa_contract: {_eq: $contract}, token_id: {_eq: $tokenId}}, limit: 1) {
    fa_contract
    token_id
    listings_active(
      where: {amount_left: {_gt: 0}, currency: {type: {_eq: "tez"}}}
      order_by: [{price: asc}, {id: asc}]
      limit: $limit
      offset: $offset
    ) {
      id
      bigmap_key
      marketplace_contract
      seller_address
      price
      amount_left
      currency { type }
    }
  }
}`;

const SUPPORTED_OBJKT_VERSIONS = new Set(["v1", "v4", "v6", "v6.1", "v6.2"]);

export interface HorfObjktListing {
  listingId: string;
  askId: string;
  marketplaceContract: string;
  version: string;
  entrypoint: "fulfill_ask";
  sellerAddress: string;
  priceMutez: string;
  amountLeft: string;
  tokenContract: string;
  tokenId: string;
}

interface ObjktListingRow {
  id?: unknown;
  bigmap_key?: unknown;
  marketplace_contract?: unknown;
  seller_address?: unknown;
  price?: unknown;
  amount_left?: unknown;
  currency?: { type?: unknown } | null;
}

export interface ObjktListingReader {
  load(contract: string, tokenId: string, limit: number, offset: number): Promise<ObjktListingRow[]>;
}

export interface ObjktChainReader {
  getJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T>;
}

const liveObjktReader: ObjktListingReader = {
  async load(contract, tokenId, limit, offset) {
    const response = await objkt.postJson<{
      data?: { token?: Array<{ fa_contract?: string; token_id?: string; listings_active?: ObjktListingRow[] }> };
      errors?: Array<{ message?: string }>;
    }>("", { query: HORF_OBJKT_LISTINGS_QUERY, variables: { contract, tokenId, limit, offset } });
    if (response.errors?.length || !Array.isArray(response.data?.token)) {
      throw new Error(`Objkt horse sale lookup failed: ${response.errors?.map((item) => item.message).join("; ") || "missing token results"}`);
    }
    const token = response.data.token[0];
    if (!token) return [];
    if (token.fa_contract !== contract || String(token.token_id) !== tokenId || !Array.isArray(token.listings_active)) {
      throw new Error("Objkt returned an unexpected horse sale response");
    }
    return token.listings_active;
  },
};

function nat(value: unknown, allowZero = true): string | null {
  const raw = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(raw)) return null;
  const normalized = BigInt(raw).toString();
  return !allowZero && normalized === "0" ? null : normalized;
}

function address(value: unknown): string | null {
  return typeof value === "string" && validateAddress(value) === ValidationResult.VALID ? value : null;
}

function supportedVersion(contract: string): string | null {
  const info = externalMarketplaceInfo(contract);
  return info?.marketplace === "objkt" && SUPPORTED_OBJKT_VERSIONS.has(info.version) ? info.version : null;
}

export function normalizeHorfObjktListing(
  row: ObjktListingRow,
  tokenContract: string,
  tokenId: string,
): HorfObjktListing | null {
  const marketplaceContract = address(row.marketplace_contract);
  const version = marketplaceContract ? supportedVersion(marketplaceContract) : null;
  const sellerAddress = address(row.seller_address);
  const listingId = nat(row.id);
  const askId = nat(row.bigmap_key);
  const priceMutez = nat(row.price, false);
  const amountLeft = nat(row.amount_left, false);
  if (!marketplaceContract || !version || !sellerAddress || !listingId || !askId || !priceMutez || !amountLeft || row.currency?.type !== "tez") {
    return null;
  }
  return {
    listingId, askId, marketplaceContract, version, entrypoint: "fulfill_ask",
    sellerAddress, priceMutez, amountLeft, tokenContract, tokenId,
  };
}

export async function findHorfObjktListings(
  tokenContract: string,
  tokenId: string,
  cursor = 0,
  reader: ObjktListingReader = liveObjktReader,
) {
  const raw = await reader.load(tokenContract, tokenId, OBJKT_PAGE_SIZE, cursor);
  if (!Array.isArray(raw) || raw.length > OBJKT_PAGE_SIZE) throw new Error("Objkt listing page was invalid");
  return {
    listings: raw.flatMap((row) => {
      const listing = normalizeHorfObjktListing(row, tokenContract, tokenId);
      return listing ? [listing] : [];
    }),
    nextCursor: raw.length === OBJKT_PAGE_SIZE ? cursor + raw.length : null,
  };
}

export class ObjktListingChangedError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ObjktListingChangedError("Objkt ask is not active");
  return value as Record<string, unknown>;
}

function askToken(value: Record<string, unknown>, version: string) {
  if (version === "v1") {
    return { tokenContract: address(value.fa2), tokenId: nat(value.objkt_id), sellerAddress: address(value.issuer),
      priceMutez: nat(value.xtz_per_objkt, false), amountLeft: nat(value.amount, false) };
  }
  const token = record(value.token);
  return { tokenContract: address(token.address), tokenId: nat(token.token_id), sellerAddress: address(value.creator),
    priceMutez: nat(value.amount, false), amountLeft: nat(value.editions, false) };
}

function activeInTime(value: Record<string, unknown>, now: number) {
  for (const [field, before] of [["start_time", true], ["expiry_time", false]] as const) {
    const raw = value[field];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "string") return false;
    const time = Date.parse(raw);
    if (!Number.isFinite(time) || (before ? time > now : time <= now)) return false;
  }
  return true;
}

/** A new chain read is required for every click; GraphQL listing IDs are never ask IDs. */
export async function preflightHorfObjktPurchase(
  selected: Pick<HorfObjktListing, "marketplaceContract" | "askId" | "tokenContract" | "tokenId" | "sellerAddress" | "priceMutez">,
  reader: ObjktChainReader = horfMainnetIndex,
  now = Date.now(),
) {
  const version = supportedVersion(selected.marketplaceContract);
  if (!version) throw new ObjktListingChangedError("This Objkt contract is not supported for in-page buying");
  const head = await reader.getJson<{ chainId?: string; timestamp?: string }>("/head");
  if (head.chainId !== HORF_MAINNET_CHAIN_ID) throw new Error("Objkt purchase preflight requires Tezos Mainnet");
  const storage = record(await reader.getJson<unknown>(`/contracts/${selected.marketplaceContract}/storage`));
  const asksId = nat(storage.asks);
  if (!asksId) throw new Error("Objkt asks map is unavailable");
  let key: { active?: boolean; key?: unknown; value?: unknown };
  try {
    key = await reader.getJson<typeof key>(`/bigmaps/${asksId}/keys/${selected.askId}`);
  } catch (error) {
    if ((error as { status?: number })?.status === 404) throw new ObjktListingChangedError("This Objkt ask has closed");
    throw error;
  }
  if (key.active !== true || nat(key.key) !== selected.askId) throw new ObjktListingChangedError("This Objkt ask has closed");
  const value = record(key.value);
  const current = askToken(value, version);
  if (current.tokenContract !== selected.tokenContract || current.tokenId !== selected.tokenId ||
    current.sellerAddress !== selected.sellerAddress || current.priceMutez !== selected.priceMutez ||
    !current.amountLeft || !activeInTime(value, now) ||
    (version !== "v1" && (value.condition != null || value.target != null || !record(value.currency).tez))) {
    throw new ObjktListingChangedError("This Objkt ask changed or is not available for a direct purchase");
  }
  return {
    purchase: {
      ...selected,
      version,
      entrypoint: "fulfill_ask" as const,
      amount: "1" as const,
      amountLeft: current.amountLeft,
      network: "mainnet" as const,
      chainId: HORF_MAINNET_CHAIN_ID,
      checkedAt: head.timestamp || new Date(now).toISOString(),
    },
  };
}
