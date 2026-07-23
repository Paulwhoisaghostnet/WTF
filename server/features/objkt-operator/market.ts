import { createHash } from "node:crypto";
import type {
  ObjktCreatorScoreBreakdown,
  ObjktCreatorPortfolioItem,
  ObjktMarketCandidate,
  ObjktOperatorCreator,
  ObjktOperatorScan,
  ObjktPurchaseIntent,
} from "@shared/objkt-operator";

export const OBJKT_GRAPHQL_ENDPOINT = "https://data.objkt.com/v3/graphql";
const MUTEZ_PER_XTZ = 1_000_000;
const TEZOS_MAINNET_CHAIN_ID = "NetXdQprcVkpaWU" as const;

const DISCOVER_CREATORS_QUERY = `
  query DiscoverCreators($since: timestamptz!, $limit: Int!) {
    listing_sale(
      where: {timestamp: {_gte: $since}, price_xtz: {_gt: 0}}
      order_by: {timestamp: desc}
      limit: $limit
    ) {
      price_xtz
      timestamp
      buyer_address
      token {
        creators {
          creator_address
          verified
          holder { address alias logo }
        }
      }
    }
  }
`;

const AFFORDABLE_INVENTORY_QUERY = `
  query AffordableCreatorInventory($creators: [String!]!, $maxAsk: bigint!, $limit: Int!) {
    token(
      where: {
        creators: {creator_address: {_in: $creators}}
        lowest_ask: {_is_null: false, _lte: $maxAsk}
      }
      order_by: {last_listed: desc}
      limit: $limit
    ) {
      lowest_ask
      creators { creator_address }
      listings_active(
        where: {
          amount_left: {_gt: 0}
          price: {_lte: $maxAsk}
          currency: {type: {_eq: "tez"}}
        }
        order_by: {price: asc}
        limit: 3
      ) {
        price
        price_xtz
        amount_left
        currency { symbol decimals type }
      }
    }
  }
`;

const CREATOR_PORTFOLIO_QUERY = `
  query CreatorPortfolio($creator: String!, $limit: Int!) {
    token(
      where: {creators: {creator_address: {_eq: $creator}}}
      order_by: {timestamp: desc}
      limit: $limit
    ) {
      token_id
      fa_contract
      name
      display_uri
      thumbnail_uri
      mime
      supply
      timestamp
      lowest_ask
      average
      listing_sales(order_by: {timestamp: desc}, limit: 12) {
        price_xtz
        timestamp
        buyer_address
      }
    }
  }
`;

const TOKENS_FOR_SALE_QUERY = `
  query TokensForSale($creators: [String!]!, $maxAsk: bigint!, $limit: Int!) {
    token(
      where: {
        creators: {creator_address: {_in: $creators}}
        lowest_ask: {_is_null: false, _lte: $maxAsk}
      }
      order_by: {last_listed: desc}
      limit: $limit
    ) {
      pk
      token_id
      fa_contract
      name
      display_uri
      thumbnail_uri
      mime
      supply
      lowest_ask
      average
      highest_offer
      last_listed
      timestamp
      listings_active(
        where: {
          amount_left: {_gt: 0}
          price: {_lte: $maxAsk}
          currency: {type: {_eq: "tez"}}
        }
        order_by: {price: asc}
        limit: 5
      ) {
        id
        price
        price_xtz
        amount_left
        seller_address
        bigmap_key
        marketplace_contract
        currency { symbol decimals type }
        marketplace { contract name }
      }
      creators {
        creator_address
        verified
        holder { address alias logo }
      }
      listing_sales(order_by: {timestamp: desc}, limit: 12) {
        price_xtz
        timestamp
        buyer_address
        seller_address
      }
    }
  }
`;

type FetchLike = typeof fetch;

async function objktGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  operation: string,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const retryable = new Set([429, 502, 503, 504]);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(OBJKT_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        lastError = new Error(`${operation} failed with HTTP ${response.status}`);
        if (attempt < 2 && retryable.has(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
          continue;
        }
        throw lastError;
      }
      const body = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
      if (body.errors?.length) {
        throw new Error(`${operation} failed: ${body.errors.map((item) => item.message || "GraphQL error").join("; ")}`);
      }
      if (!body.data) throw new Error(`${operation} returned no data`);
      return body.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`${operation} failed`);
      if (attempt >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw lastError || new Error(`${operation} failed`);
}

export function isObjktTezosAddress(address: string) {
  return /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

function mutezToXtz(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric / MUTEZ_PER_XTZ : 0;
}

function xtzToMutez(value: number) {
  return Math.round(Math.max(0, value) * MUTEZ_PER_XTZ);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function creatorScorePart(score: number, weight: number) {
  const bounded = clamp(score);
  return {
    score: Math.round(bounded * 100),
    weight,
    contribution: Number((bounded * weight).toFixed(1)),
  };
}

export function buildObjktCreatorScoreBreakdown(input: {
  volumeXtz: number;
  salesCount: number;
  uniqueBuyers: number;
  verified: boolean;
  lastSaleAt: string;
  affordableListingCount: number;
  lowestAskXtz: number | null;
  maxItemPriceXtz: number;
}): ObjktCreatorScoreBreakdown {
  const recencyDays = Math.max(0, (Date.now() - new Date(input.lastSaleAt).getTime()) / 86_400_000);
  const volume = Math.min(Math.log10(input.volumeXtz + 1) / 2.4, 1);
  const floorFit = input.lowestAskXtz === null
    ? 0
    : Math.max(0, 1 - input.lowestAskXtz / input.maxItemPriceXtz);
  return {
    sales: creatorScorePart(Math.min(input.salesCount / 18, 1), 25.6),
    buyers: creatorScorePart(Math.min(input.uniqueBuyers / 10, 1), 19.2),
    volume: creatorScorePart(volume, 19.2),
    recency: creatorScorePart(Math.max(0, 1 - recencyDays / 45), 9.6),
    verification: creatorScorePart(input.verified ? 1 : 0.25, 6.4),
    inventoryDepth: creatorScorePart(Math.min(input.affordableListingCount / 8, 1), 13),
    floorFit: creatorScorePart(floorFit, 7),
  };
}

function totalCreatorScore(parts: ObjktCreatorScoreBreakdown) {
  return Math.round(Object.values(parts).reduce((sum, part) => sum + part.contribution, 0));
}

export async function discoverObjktCreators(
  limit = 25,
  maxItemPriceXtz = 5,
  fetchImpl: FetchLike = fetch,
  excludedAddresses: readonly string[] = [],
): Promise<ObjktOperatorCreator[]> {
  const boundedLimit = Math.max(1, Math.min(Math.round(limit), 25));
  const maxPrice = Math.max(0.1, Math.min(Number(maxItemPriceXtz) || 5, 100));
  const excluded = new Set(excludedAddresses.filter(isObjktTezosAddress));
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const data = await objktGraphql<{ listing_sale: any[] }>(
    DISCOVER_CREATORS_QUERY,
    { since, limit: Math.max(300, boundedLimit * 12) },
    "Discover creators",
    fetchImpl,
  );
  const activity = new Map<string, {
    address: string;
    alias: string | null;
    logo: string | null;
    verified: boolean;
    salesCount: number;
    volumeXtz: number;
    buyers: Set<string>;
    lastSaleAt: string;
  }>();
  for (const sale of data.listing_sale || []) {
    for (const creator of sale.token?.creators || []) {
      const address = String(creator.creator_address || "");
      if (!isObjktTezosAddress(address) || excluded.has(address)) continue;
      const current = activity.get(address) || {
        address,
        alias: creator.holder?.alias || null,
        logo: creator.holder?.logo || null,
        verified: Boolean(creator.verified),
        salesCount: 0,
        volumeXtz: 0,
        buyers: new Set<string>(),
        lastSaleAt: String(sale.timestamp || since),
      };
      current.salesCount += 1;
      current.volumeXtz += mutezToXtz(sale.price_xtz);
      if (sale.buyer_address) current.buyers.add(String(sale.buyer_address));
      if (String(sale.timestamp || "") > current.lastSaleAt) current.lastSaleAt = String(sale.timestamp);
      current.verified ||= Boolean(creator.verified);
      current.alias ||= creator.holder?.alias || null;
      current.logo ||= creator.holder?.logo || null;
      activity.set(address, current);
    }
  }
  const ranked = [...activity.values()]
    .sort((a, b) => b.salesCount - a.salesCount || b.volumeXtz - a.volumeXtz)
    .slice(0, Math.min(100, Math.max(40, boundedLimit * 4)));
  if (!ranked.length) return [];

  const inventory = await objktGraphql<{ token: any[] }>(
    AFFORDABLE_INVENTORY_QUERY,
    {
      creators: ranked.map((creator) => creator.address),
      maxAsk: xtzToMutez(maxPrice),
      limit: Math.min(500, ranked.length * 12),
    },
    "Discover affordable creator inventory",
    fetchImpl,
  );
  const inventoryByCreator = new Map<string, { count: number; floorXtz: number | null }>();
  for (const token of inventory.token || []) {
    const listings = (token.listings_active || []).filter((listing: any) =>
      Number(listing.amount_left || 0) > 0 &&
      listing.currency?.type === "tez" &&
      listing.currency?.symbol === "XTZ" &&
      Number(listing.currency?.decimals) === 6,
    );
    if (!listings.length) continue;
    const floorXtz = Math.min(...listings.map((listing: any) => mutezToXtz(listing.price_xtz ?? listing.price)));
    if (!(floorXtz > 0 && floorXtz <= maxPrice)) continue;
    for (const creator of token.creators || []) {
      const address = String(creator.creator_address || "");
      if (!activity.has(address)) continue;
      const current = inventoryByCreator.get(address) || { count: 0, floorXtz: null };
      current.count += 1;
      current.floorXtz = current.floorXtz === null ? floorXtz : Math.min(current.floorXtz, floorXtz);
      inventoryByCreator.set(address, current);
    }
  }

  return ranked
    .map((creator) => {
      const affordable = inventoryByCreator.get(creator.address) || { count: 0, floorXtz: null };
      const scoreParts = buildObjktCreatorScoreBreakdown({
        volumeXtz: creator.volumeXtz,
        salesCount: creator.salesCount,
        uniqueBuyers: creator.buyers.size,
        verified: creator.verified,
        lastSaleAt: creator.lastSaleAt,
        affordableListingCount: affordable.count,
        lowestAskXtz: affordable.floorXtz,
        maxItemPriceXtz: maxPrice,
      });
      return {
        address: creator.address,
        alias: creator.alias,
        logo: creator.logo,
        verified: creator.verified,
        reviewStatus: "pending" as const,
        salesCount: creator.salesCount,
        volumeXtz: Number(creator.volumeXtz.toFixed(3)),
        uniqueBuyers: creator.buyers.size,
        lastSaleAt: creator.lastSaleAt,
        affordableListingCount: affordable.count,
        lowestAskXtz: affordable.floorXtz === null ? null : Number(affordable.floorXtz.toFixed(3)),
        score: totalCreatorScore(scoreParts),
        scoreParts,
      };
    })
    .sort((a, b) =>
      Number(b.affordableListingCount > 0) - Number(a.affordableListingCount > 0) ||
      b.score - a.score ||
      b.affordableListingCount - a.affordableListingCount,
    )
    .slice(0, boundedLimit);
}

function portfolioSales(row: any) {
  const sales = Array.isArray(row?.listing_sales) ? row.listing_sales : [];
  const now = Date.now();
  const recentSales30 = sales.filter((sale: any) => now - new Date(sale.timestamp).getTime() <= 30 * 86_400_000);
  const recentSales180 = sales.filter((sale: any) => now - new Date(sale.timestamp).getTime() <= 180 * 86_400_000);
  return {
    recentSales30d: recentSales30.length,
    recentSales180d: recentSales180.length,
    uniqueRecentBuyers: new Set(recentSales180.map((sale: any) => sale.buyer_address).filter(Boolean)).size,
    medianSaleXtz: median(sales.map((sale: any) => mutezToXtz(sale.price_xtz)).filter((price: number) => price > 0)),
  };
}

export async function fetchObjktCreatorPortfolio(
  creatorAddress: string,
  limit = 12,
  fetchImpl: FetchLike = fetch,
): Promise<ObjktCreatorPortfolioItem[]> {
  if (!isObjktTezosAddress(creatorAddress)) throw new Error("Invalid creator address");
  const data = await objktGraphql<{ token: any[] }>(
    CREATOR_PORTFOLIO_QUERY,
    { creator: creatorAddress, limit: Math.max(1, Math.min(Math.round(limit), 24)) },
    "Load creator portfolio",
    fetchImpl,
  );
  return (data.token || []).map((row: any) => {
    const sales = portfolioSales(row);
    return {
      id: `${row.fa_contract}:${row.token_id}`,
      contract: String(row.fa_contract || ""),
      tokenId: String(row.token_id ?? ""),
      name: row.name || "Untitled",
      displayUri: row.display_uri || null,
      thumbnailUri: row.thumbnail_uri || null,
      mime: row.mime || null,
      supply: row.supply ? Number(row.supply) : null,
      mintedAt: row.timestamp || null,
      lowestAskXtz: row.lowest_ask ? mutezToXtz(row.lowest_ask) : null,
      medianSaleXtz: sales.medianSaleXtz,
      averageSaleXtz: row.average ? mutezToXtz(row.average) : null,
      recentSales30d: sales.recentSales30d,
      recentSales180d: sales.recentSales180d,
      uniqueRecentBuyers: sales.uniqueRecentBuyers,
      objktUrl: `https://objkt.com/asset/${row.fa_contract}/${row.token_id}`,
    };
  });
}

function listingPurchaseIntent(row: any, listing: any): ObjktPurchaseIntent | null {
  const listingId = Number(listing?.id);
  const onchainListingKey = Number(listing?.bigmap_key);
  const marketplaceContract = String(listing?.marketplace_contract || listing?.marketplace?.contract || "");
  const sellerAddress = String(listing?.seller_address || "");
  const tokenContract = String(row?.fa_contract || "");
  const tokenId = String(row?.token_id ?? "");
  const priceMutez = Number(listing?.price_xtz ?? listing?.price);
  if (
    !Number.isSafeInteger(listingId) || listingId <= 0 ||
    !Number.isSafeInteger(onchainListingKey) || onchainListingKey < 0 ||
    !Number.isSafeInteger(priceMutez) || priceMutez <= 0 ||
    !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(marketplaceContract) ||
    !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(tokenContract) ||
    !isObjktTezosAddress(sellerAddress) || !tokenId
  ) return null;
  const canonical = [
    "objkt-marketplace-listing-v1",
    "mainnet",
    TEZOS_MAINNET_CHAIN_ID,
    tokenContract,
    tokenId,
    listingId,
    onchainListingKey,
    marketplaceContract,
    sellerAddress,
    priceMutez,
    1,
    "XTZ",
  ].join("|");
  return {
    schema: "objkt-marketplace-listing-v1",
    network: "mainnet",
    chainId: TEZOS_MAINNET_CHAIN_ID,
    tokenContract,
    tokenId,
    listingId,
    onchainListingKey,
    marketplaceContract,
    marketplaceName: listing?.marketplace?.name || null,
    sellerAddress,
    priceMutez,
    amount: 1,
    currency: "XTZ",
    entrypoint: null,
    fingerprint: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  };
}

function supplyScore(supply?: number | null) {
  if (!supply || supply <= 0) return 0.35;
  if (supply <= 5) return 1;
  if (supply <= 10) return 0.86;
  if (supply <= 25) return 0.68;
  if (supply <= 100) return 0.44;
  return 0.25;
}

export function normalizeObjktCandidate(row: any, creatorAddress: string, maxItemPriceXtz: number): ObjktMarketCandidate {
  const listings = (Array.isArray(row.listings_active) ? row.listings_active : [])
    .filter((listing: any) =>
      Number(listing.amount_left || 0) > 0 &&
      Number(listing.price_xtz ?? listing.price ?? 0) > 0 &&
      listing.currency?.type === "tez" &&
      listing.currency?.symbol === "XTZ" &&
      Number(listing.currency?.decimals) === 6,
    )
    .sort((a: any, b: any) => Number(a.price_xtz ?? a.price) - Number(b.price_xtz ?? b.price));
  const listing = listings[0];
  const sales = Array.isArray(row.listing_sales) ? row.listing_sales : [];
  const salePrices = sales.map((sale: any) => mutezToXtz(sale.price_xtz)).filter((price: number) => price > 0);
  const now = Date.now();
  const recentSales30 = sales.filter((sale: any) => now - new Date(sale.timestamp).getTime() <= 30 * 86_400_000);
  const recentSales180 = sales.filter((sale: any) => now - new Date(sale.timestamp).getTime() <= 180 * 86_400_000);
  const uniqueBuyers = new Set(recentSales180.map((sale: any) => sale.buyer_address).filter(Boolean)).size;
  const creator = (row.creators || []).find((item: any) => item.creator_address === creatorAddress) || row.creators?.[0];
  const ask = mutezToXtz(listing?.price_xtz ?? listing?.price ?? row.lowest_ask);
  const medianSale = median(salePrices);
  const averageSale = mutezToXtz(row.average) || null;
  const referenceSale = medianSale || averageSale;
  const discount = referenceSale ? clamp((referenceSale - ask) / referenceSale, -0.35, 1) : 0;
  const discountScore = clamp((discount + 0.1) / 0.6);
  const velocity = clamp(Math.min(recentSales30.length / 5, 1) * 0.72 + Math.min(recentSales180.length / 18, 1) * 0.28);
  const scarcity = supplyScore(row.supply ? Number(row.supply) : null);
  const collectors = clamp(uniqueBuyers / 8);
  const verification = creator?.verified ? 1 : 0.35;
  const budgetFit = maxItemPriceXtz > 0 ? clamp(1 - ask / maxItemPriceXtz) : 0.5;
  const score = Math.round(100 * clamp(
    discountScore * 0.3 + velocity * 0.25 + scarcity * 0.14 +
    collectors * 0.14 + verification * 0.1 + budgetFit * 0.07,
  ));
  const purchaseIntent = listing ? listingPurchaseIntent(row, listing) : null;
  const riskFlags: string[] = [];
  if (!listing) riskFlags.push("active XTZ listing identity unavailable");
  if (listing && !purchaseIntent) riskFlags.push("exact marketplace purchase intent unavailable");
  if (!creator?.verified) riskFlags.push("creator not verified in Objkt index");
  if (!referenceSale) riskFlags.push("no recent sale reference");
  if (referenceSale && ask > referenceSale) riskFlags.push("ask above recent sale reference");
  if (recentSales180.length < 3) riskFlags.push("thin secondary-sales sample");
  const referenceSource = medianSale ? "median_sale" as const : averageSale ? "average_sale" as const : "markup_only" as const;
  const suggestedListXtz = Number(Math.max(ask * (referenceSale ? 1.18 : 1.32), referenceSale ? referenceSale * 0.96 : 0).toFixed(3));
  const grossProfit = Number(Math.max(0, suggestedListXtz - ask).toFixed(3));
  const confidence = Math.max(5, Math.min(95, Math.round(
    clamp(velocity * 0.34 + collectors * 0.22 + discountScore * 0.2 + scarcity * 0.14 + Math.min(recentSales30.length / 6, 1) * 0.1) * 100 -
    Math.min(riskFlags.length * 9, 36),
  )));
  const liquidityGrade = confidence >= 78 ? "A" as const : confidence >= 62 ? "B" as const : confidence >= 44 ? "C" as const : "D" as const;
  const thesis = [
    referenceSale && ask < referenceSale ? `ask below recent sale reference (${referenceSale.toFixed(2)} XTZ)` : null,
    recentSales30.length ? `${recentSales30.length} sale${recentSales30.length === 1 ? "" : "s"} in 30d` : null,
    uniqueBuyers > 1 ? `${uniqueBuyers} recent buyers` : null,
    row.supply && Number(row.supply) <= 25 ? `edition supply ${row.supply}` : null,
  ].filter(Boolean).join("; ") || "thin data, ranked mainly by budget fit and creator approval";

  return {
    id: `${row.fa_contract}:${row.token_id}`,
    tokenPk: Number(row.pk),
    tokenId: String(row.token_id),
    contract: String(row.fa_contract),
    name: row.name || "Untitled",
    creatorAddress,
    creatorAlias: creator?.holder?.alias || null,
    creatorVerified: Boolean(creator?.verified),
    displayUri: row.display_uri || null,
    thumbnailUri: row.thumbnail_uri || null,
    mime: row.mime || null,
    supply: row.supply ? Number(row.supply) : null,
    activeListingCount: listings.length,
    listingId: listing?.id ? Number(listing.id) : null,
    listingBigmapKey: listing?.bigmap_key === undefined ? null : Number(listing.bigmap_key),
    listingSellerAddress: listing?.seller_address || null,
    marketplaceContract: listing?.marketplace_contract || listing?.marketplace?.contract || null,
    marketplaceName: listing?.marketplace?.name || null,
    listingPriceMutez: listing ? Number(listing.price_xtz ?? listing.price) : null,
    purchaseIntent,
    lowestAskXtz: ask,
    medianSaleXtz: medianSale,
    averageSaleXtz: averageSale,
    highestOfferXtz: row.highest_offer ? mutezToXtz(row.highest_offer) : null,
    resale: {
      suggestedListXtz,
      estimatedGrossProfitXtz: grossProfit,
      estimatedGrossReturnPct: ask > 0 ? Math.round((grossProfit / ask) * 100) : 0,
      referenceSaleXtz: referenceSale ? Number(referenceSale.toFixed(3)) : null,
      referenceSource,
      confidence,
      liquidityGrade,
      holdWindowDays: liquidityGrade === "A" ? 14 : liquidityGrade === "B" ? 30 : liquidityGrade === "C" ? 60 : 90,
      exitPlan: `List near ${suggestedListXtz.toFixed(3)} XTZ and refresh market evidence before signing.`,
    },
    recentSales30d: recentSales30.length,
    recentSales180d: recentSales180.length,
    uniqueRecentBuyers: uniqueBuyers,
    lastListedAt: row.last_listed || null,
    mintedAt: row.timestamp || null,
    objktUrl: `https://objkt.com/asset/${row.fa_contract}/${row.token_id}`,
    score,
    scoreParts: {
      discount: Math.round(discountScore * 100),
      velocity: Math.round(velocity * 100),
      scarcity: Math.round(scarcity * 100),
      collectors: Math.round(collectors * 100),
      verification: Math.round(verification * 100),
      budgetFit: Math.round(budgetFit * 100),
    },
    thesis,
    riskFlags,
  };
}

export async function scanObjktCreators(input: {
  approvedCreators: ObjktOperatorCreator[];
  spendCapXtz: number;
  maxItemPriceXtz: number;
  perCreatorLimit: number;
}, fetchImpl: FetchLike = fetch): Promise<ObjktOperatorScan> {
  const creatorAddresses = input.approvedCreators
    .filter((creator) => creator.reviewStatus === "approved")
    .map((creator) => creator.address)
    .filter((address, index, all) => isObjktTezosAddress(address) && all.indexOf(address) === index)
    .slice(0, 40);
  const maxPrice = Math.max(0.1, Math.min(input.maxItemPriceXtz, input.spendCapXtz));
  const perCreatorLimit = Math.max(3, Math.min(Math.round(input.perCreatorLimit), 50));
  const generatedAt = new Date().toISOString();
  if (!creatorAddresses.length) {
    return {
      candidates: [],
      summary: { approvedCreators: 0, queriedCreators: 0, tokenRows: 0, filteredCandidates: 0, generatedAt, dataSource: "objkt", fallbackNotes: [] },
    };
  }
  const data = await objktGraphql<{ token: any[] }>(
    TOKENS_FOR_SALE_QUERY,
    {
      creators: creatorAddresses,
      maxAsk: xtzToMutez(maxPrice),
      limit: Math.min(500, perCreatorLimit * creatorAddresses.length),
    },
    `Scan ${creatorAddresses.length} approved creators`,
    fetchImpl,
  );
  const counts = new Map<string, number>();
  const candidates: ObjktMarketCandidate[] = [];
  for (const row of data.token || []) {
    const creatorAddress = (row.creators || [])
      .map((creator: any) => creator.creator_address)
      .find((address: string) => creatorAddresses.includes(address));
    if (!creatorAddress) continue;
    const count = counts.get(creatorAddress) || 0;
    if (count >= perCreatorLimit) continue;
    counts.set(creatorAddress, count + 1);
    const candidate = normalizeObjktCandidate(row, creatorAddress, maxPrice);
    if (candidate.lowestAskXtz > 0 && candidate.lowestAskXtz <= maxPrice && candidate.purchaseIntent) {
      candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.lowestAskXtz - b.lowestAskXtz);
  const limited = candidates.slice(0, 60);
  return {
    candidates: limited,
    summary: {
      approvedCreators: creatorAddresses.length,
      queriedCreators: creatorAddresses.length,
      tokenRows: data.token?.length || 0,
      filteredCandidates: limited.length,
      generatedAt,
      dataSource: "objkt",
      fallbackNotes: [],
    },
  };
}
