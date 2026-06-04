import { externalMarketplaceInfo } from "@shared/external-marketplaces";
import { isSkywireTezosContract } from "@shared/skywire-token-links";
import type { RatRacePurchaseIntent } from "@shared/tezos-intel";

const OBJKT_GRAPHQL_ENDPOINT = "https://data.objkt.com/v3/graphql";
const TEIA_FA_CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const OPEN_OBJKT_CONTRACT = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";

const FA_SLUG_CACHE: Record<string, string> = {
  open_objkt: OPEN_OBJKT_CONTRACT,
};

export interface SkywireTokenReference {
  source: "objkt" | "teia";
  sourceUrl: string;
  faContract: string | null;
  faSlug: string | null;
  tokenId: string;
  marketUrl: string;
}

export interface SkywireTokenCreator {
  address: string | null;
  alias: string | null;
}

export interface SkywireTokenSummary {
  faContract: string;
  tokenId: string;
  title: string;
  imageUrl: string | null;
  creatorAddress: string | null;
  creatorName: string | null;
  collectionName: string | null;
  mintedAt: string | null;
  marketUrl: string;
}

export interface SkywireTokenListing {
  kind: "fixed_listing" | "open_edition";
  marketplaceContract: string | null;
  marketplaceName: string | null;
  listingId: string | null;
  priceMutez: string | null;
  priceTez: string | null;
  sellerAddress: string | null;
  amountLeft: number | null;
}

export interface SkywireTokenMarketResponse {
  reference: SkywireTokenReference;
  token: SkywireTokenSummary | null;
  listing: SkywireTokenListing | null;
  purchaseIntent: RatRacePurchaseIntent;
  source: "objkt";
}

export type SkywireObjktGraphql = <T = any>(
  query: string,
  variables: Record<string, unknown>,
) => Promise<T>;

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isNat(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9]+$/.test(value));
}

function isTezosContract(value: string | null | undefined): value is string {
  return isSkywireTezosContract(value);
}

function cleanSourceUrl(value: string): string {
  return value.replace(/[)\].,;!?]+$/g, "");
}

function decodedPathParts(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

function normalizeFaSlug(value: string): string {
  return value.trim().toLowerCase();
}

function objktReferenceFromPath(url: URL, fa: string | null | undefined, tokenId: string | null | undefined): SkywireTokenReference | null {
  const faValue = pickString(fa);
  if (!faValue || !isNat(tokenId)) return null;
  const faContract = isTezosContract(faValue) ? faValue : null;
  const faSlug = faContract ? null : normalizeFaSlug(faValue);
  return {
    source: "objkt",
    sourceUrl: url.toString(),
    faContract: faContract ?? FA_SLUG_CACHE[faSlug ?? ""] ?? null,
    faSlug,
    tokenId,
    marketUrl: faContract
      ? `https://objkt.com/asset/${faContract}/${tokenId}`
      : `https://objkt.com/tokens/${faSlug}/${tokenId}`,
  };
}

function teiaReferenceFromTokenId(url: URL, tokenId: string | null | undefined, faContract = TEIA_FA_CONTRACT): SkywireTokenReference | null {
  if (!isNat(tokenId)) return null;
  return {
    source: "teia",
    sourceUrl: url.toString(),
    faContract,
    faSlug: null,
    tokenId,
    marketUrl: `https://teia.art/objkt/${tokenId}`,
  };
}

export function normalizeTokenImageUrl(uri: string | null | undefined): string | null {
  const value = pickString(uri);
  if (!value) return null;
  if (value.startsWith("ipfs://ipfs/")) {
    return `https://ipfs.io/ipfs/${value.slice("ipfs://ipfs/".length)}`;
  }
  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.slice("ipfs://".length)}`;
  }
  if (value.startsWith("/ipfs/")) return `https://ipfs.io${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

export function priceMutezToTez(priceMutez: string | null | undefined): string | null {
  if (!isNat(priceMutez)) return null;
  const mutez = Number(priceMutez);
  if (!Number.isFinite(mutez)) return null;
  return (mutez / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export function parseSkywireTokenUrl(value: string): SkywireTokenReference | null {
  let url: URL;
  try {
    url = new URL(cleanSourceUrl(value));
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  const parts = decodedPathParts(url);
  if (hostname === "teia.art") {
    if (parts[0] === "objkt") {
      if (isTezosContract(parts[1])) return teiaReferenceFromTokenId(url, parts[2], parts[1]);
      return teiaReferenceFromTokenId(url, parts[1]);
    }
    if ((parts[0] === "token" || parts[0] === "tokens") && isNat(parts[1])) {
      return teiaReferenceFromTokenId(url, parts[1]);
    }
    if ((parts[0] === "asset" || parts[0] === "token" || parts[0] === "tokens") && isTezosContract(parts[1])) {
      return teiaReferenceFromTokenId(url, parts[2], parts[1]);
    }
    return null;
  }

  if (hostname !== "objkt.com") return null;

  if ((parts[0] === "asset" || parts[0] === "token" || parts[0] === "tokens") && parts[1] && isNat(parts[2])) {
    return objktReferenceFromPath(url, parts[1], parts[2]);
  }

  if ((parts[0] === "collection" || parts[0] === "collections") && parts[1]) {
    if (parts[2] === "tokens" && isNat(parts[3])) {
      return objktReferenceFromPath(url, parts[1], parts[3]);
    }
    if (isNat(parts[2])) {
      return objktReferenceFromPath(url, parts[1], parts[2]);
    }
  }

  if ((parts[0] === "open-edition" || parts[0] === "open-editions" || parts[0] === "editions") && isNat(parts[1])) {
    return objktReferenceFromPath(url, "open_objkt", parts[1]);
  }

  return null;
}

export async function objktGraphql<T = any>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(OBJKT_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Objkt GraphQL returned ${response.status}`);
    }
    const payload: any = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((err: any) => err?.message || "Objkt GraphQL error").join("; "));
    }
    return payload.data as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveFaContract(
  reference: SkywireTokenReference,
  graphql: SkywireObjktGraphql,
): Promise<SkywireTokenReference> {
  if (reference.faContract || !reference.faSlug) return reference;
  const data = await graphql<{ fa: Array<{ contract: string | null }> }>(
    `query SkywireFaByPath($path: String!) {
      fa(where: { path: { _eq: $path } }, limit: 1) {
        contract
      }
    }`,
    { path: reference.faSlug },
  );
  const contract = pickString(data.fa?.[0]?.contract);
  return contract ? { ...reference, faContract: contract } : reference;
}

function creatorFromToken(token: any): SkywireTokenCreator {
  const row = Array.isArray(token?.creators) ? token.creators[0] : null;
  return {
    address: pickString(row?.creator_address) ?? pickString(row?.holder?.address),
    alias: pickString(row?.holder?.alias),
  };
}

function normalizeTokenDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function tokenSummaryFromObjkt(token: any, reference: SkywireTokenReference): SkywireTokenSummary {
  const creator = creatorFromToken(token);
  const contract = pickString(token?.fa_contract) ?? reference.faContract ?? "";
  const tokenId = String(token?.token_id ?? reference.tokenId);
  return {
    faContract: contract,
    tokenId,
    title: pickString(token?.name) ?? `${contract} #${tokenId}`,
    imageUrl: normalizeTokenImageUrl(
      token?.thumbnail_uri ?? token?.display_uri ?? token?.artifact_uri,
    ),
    creatorAddress: creator.address,
    creatorName: creator.alias,
    collectionName: pickString(token?.fa?.name) ?? pickString(token?.fa?.path),
    mintedAt: normalizeTokenDate(token?.timestamp),
    marketUrl: reference.marketUrl,
  };
}

function vaultCollectionSortValue(token: SkywireTokenSummary): string {
  return token.collectionName?.trim() || token.faContract;
}

function compareVaultCreatedTokens(a: SkywireTokenSummary, b: SkywireTokenSummary): number {
  return (
    vaultCollectionSortValue(a).localeCompare(vaultCollectionSortValue(b), undefined, { sensitivity: "base" }) ||
    a.faContract.localeCompare(b.faContract, undefined, { sensitivity: "base" }) ||
    String(a.tokenId).localeCompare(String(b.tokenId), undefined, { numeric: true }) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

function unsupportedIntent(reason: string): RatRacePurchaseIntent {
  return {
    supported: false,
    reason,
    marketplaceContract: null,
    marketplaceName: null,
    entrypoint: null,
    listingId: null,
    amount: 1,
    priceMutez: null,
    totalMutez: null,
  };
}

export function buildSkywireTokenPurchaseIntent(listing: {
  kind: "fixed_listing" | "open_edition";
  marketplaceContract: string | null;
  listingId: string | null;
  priceMutez: string | null;
  currencyId?: number | string | null;
  targetAddress?: string | null;
} | null): RatRacePurchaseIntent {
  if (!listing) return unsupportedIntent("No live tez listing found.");
  if (listing.targetAddress) return unsupportedIntent("Targeted listings cannot be fulfilled from Skywire.");
  if (listing.kind === "fixed_listing" && listing.currencyId !== undefined && Number(listing.currencyId) !== 1) {
    return unsupportedIntent("Only tez-priced listings are supported for direct Skywire buys.");
  }
  if (!listing.marketplaceContract) return unsupportedIntent("Listing is missing a marketplace contract.");
  if (!isNat(listing.listingId)) return unsupportedIntent("Listing is missing a supported ask id.");
  const priceValue = Number(listing.priceMutez);
  if (!isNat(listing.priceMutez) || (listing.kind === "fixed_listing" ? priceValue <= 0 : priceValue < 0)) {
    return unsupportedIntent("Listing price is not valid.");
  }

  const info = externalMarketplaceInfo(listing.marketplaceContract);
  if (!info) return unsupportedIntent("Marketplace contract is not in the direct-buy allowlist.");

  const entrypoint =
    info.marketplace === "hen" || info.marketplace === "teia"
      ? "collect"
      : info.saleEntrypoints.includes("fulfill_ask")
        ? "fulfill_ask"
        : info.saleEntrypoints.includes("buy")
          ? "buy"
          : info.saleEntrypoints.includes("claim")
            ? "claim"
          : info.saleEntrypoints.includes("collect")
            ? "collect"
            : null;
  if (!entrypoint) return unsupportedIntent("Marketplace entrypoint is not supported.");

  return {
    supported: true,
    reason: null,
    marketplaceContract: listing.marketplaceContract,
    marketplaceName: info.name,
    entrypoint,
    listingId: listing.listingId,
    amount: 1,
    priceMutez: listing.priceMutez,
    totalMutez: listing.priceMutez,
  };
}

function listingFromToken(token: any): SkywireTokenListing | null {
  const active = Array.isArray(token?.listings_active)
    ? token.listings_active[0]
    : null;
  if (active) {
    const marketplaceContract = pickString(active.marketplace_contract);
    return {
      kind: "fixed_listing",
      marketplaceContract,
      marketplaceName: externalMarketplaceInfo(marketplaceContract)?.name ?? marketplaceContract,
      listingId: String(active.bigmap_key ?? active.id ?? ""),
      priceMutez: String(active.price ?? ""),
      priceTez: priceMutezToTez(String(active.price ?? "")),
      sellerAddress: pickString(active.seller_address),
      amountLeft: Number.isFinite(Number(active.amount_left)) ? Number(active.amount_left) : null,
    };
  }

  const openEdition = token?.open_edition_active;
  if (!openEdition) return null;
  return {
    kind: "open_edition",
    marketplaceContract: OPEN_OBJKT_CONTRACT,
    marketplaceName: "objkt open edition",
    listingId: String(token?.token_id ?? ""),
    priceMutez: String(openEdition.price ?? ""),
    priceTez: priceMutezToTez(String(openEdition.price ?? "")),
    sellerAddress: pickString(openEdition.seller_address),
    amountLeft: null,
  };
}

export async function resolveSkywireTokenMarket(
  sourceUrl: string,
  graphql: SkywireObjktGraphql = objktGraphql,
): Promise<SkywireTokenMarketResponse> {
  const parsed = parseSkywireTokenUrl(sourceUrl);
  if (!parsed) {
    throw new Error("URL is not a supported Tezos token link.");
  }
  const reference = await resolveFaContract(parsed, graphql);
  if (!reference.faContract) {
    throw new Error("Could not resolve token collection.");
  }

  const data = await graphql<{ token: any[] }>(
    `query SkywireTokenMarket($fa: String!, $tokenId: String!) {
      token(where: { fa_contract: { _eq: $fa }, token_id: { _eq: $tokenId } }, limit: 1) {
        fa_contract
        token_id
        timestamp
        name
        thumbnail_uri
        display_uri
        artifact_uri
        fa {
          name
          path
        }
        creators {
          creator_address
          holder {
            address
            alias
          }
        }
        listings_active(order_by: { price: asc }, limit: 1) {
          marketplace_contract
          id
          bigmap_key
          price
          currency_id
          seller_address
          amount_left
          target_address
        }
        open_edition_active {
          price
          seller_address
        }
      }
    }`,
    { fa: reference.faContract, tokenId: reference.tokenId },
  );
  const token = data.token?.[0] ?? null;
  const listing = token ? listingFromToken(token) : null;
  const activeFixedListing = Array.isArray(token?.listings_active)
    ? token.listings_active[0]
    : null;

  return {
    reference,
    token: token ? tokenSummaryFromObjkt(token, reference) : null,
    listing,
    purchaseIntent: buildSkywireTokenPurchaseIntent(
      listing?.kind === "fixed_listing"
        ? {
            kind: "fixed_listing",
            marketplaceContract: listing.marketplaceContract,
            listingId: listing.listingId,
            priceMutez: listing.priceMutez,
            currencyId: activeFixedListing?.currency_id,
            targetAddress: activeFixedListing?.target_address,
          }
        : listing,
    ),
    source: "objkt",
  };
}

export async function fetchObjktCreatedTokens(
  addresses: string[],
  limit: number,
  graphql: SkywireObjktGraphql = objktGraphql,
): Promise<SkywireTokenSummary[]> {
  const uniqueAddresses = Array.from(new Set(addresses.map((address) => address.trim()).filter(Boolean)));
  if (!uniqueAddresses.length) return [];
  const data = await graphql<{ token: any[] }>(
    `query SkywireCreatedTokens($addresses: [String!]!, $limit: Int!) {
      token(
        where: { creators: { creator_address: { _in: $addresses } } }
        order_by: { timestamp: desc }
        limit: $limit
      ) {
        fa_contract
        token_id
        timestamp
        name
        thumbnail_uri
        display_uri
        artifact_uri
        fa {
          name
          path
        }
        creators {
          creator_address
          holder {
            address
            alias
          }
        }
      }
    }`,
    { addresses: uniqueAddresses, limit },
  );

  const seen = new Set<string>();
  return (data.token ?? [])
    .map((token) => {
      const reference: SkywireTokenReference = {
        source: "objkt",
        sourceUrl: `https://objkt.com/tokens/${token.fa_contract}/${token.token_id}`,
        faContract: String(token.fa_contract || ""),
        faSlug: null,
        tokenId: String(token.token_id || ""),
        marketUrl: `https://objkt.com/tokens/${token.fa_contract}/${token.token_id}`,
      };
      return tokenSummaryFromObjkt(token, reference);
    })
    .filter((token) => {
      const key = `${token.faContract}:${token.tokenId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareVaultCreatedTokens);
}
