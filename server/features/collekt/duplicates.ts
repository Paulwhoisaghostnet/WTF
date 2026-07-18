import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "../../db";
import { tzkt } from "../../lib/upstream";
import { createBoundedExpiringCache } from "../../lib/bounded-expiring-cache";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import {
  acquisitionLots,
  tokenMarketSummary,
  tokenMetadata,
} from "@shared/schema";
import type {
  CollektDuplicateScanResponse,
  CollektDuplicateToken,
} from "@shared/collekt";

const MAX_RESULTS = 500;
const CACHE_TTL_MS = 2 * 60 * 1000;
const scanCache = createBoundedExpiringCache<CollektDuplicateScanResponse>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 250,
});

type DuplicateBalance = {
  contract: string;
  tokenId: string;
  balance: number;
  totalSupply: number;
  decimals: number;
  firstTime: string | null;
  lastTime: string | null;
  metadata: Record<string, any>;
};

type ExclusionReason = "decimals" | "supply" | "malformed";

export function isTezosWalletAddress(value: string): boolean {
  return /^(tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

function finiteInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isSafeInteger(numeric) ? numeric : null;
}

export function normalizeDuplicateBalance(
  row: Record<string, any>
): { item: DuplicateBalance | null; excluded: ExclusionReason | null } {
  const token = row?.token ?? {};
  const metadata = token?.metadata && typeof token.metadata === "object"
    ? token.metadata
    : {};
  const contract = String(token?.contract?.address ?? "");
  const tokenId = String(token?.tokenId ?? "");
  const balance = finiteInteger(row?.balance);
  const totalSupply = finiteInteger(token?.totalSupply);
  const decimals = finiteInteger(metadata?.decimals ?? 0);

  if (
    !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract) ||
    !/^[0-9]+$/.test(tokenId) ||
    balance === null ||
    balance < 2 ||
    totalSupply === null ||
    decimals === null
  ) {
    return { item: null, excluded: "malformed" };
  }
  if (decimals !== 0) return { item: null, excluded: "decimals" };
  if (totalSupply < 1 || totalSupply > 5000) {
    return { item: null, excluded: "supply" };
  }

  return {
    item: {
      contract,
      tokenId,
      balance,
      totalSupply,
      decimals: 0,
      firstTime: typeof row?.firstTime === "string" ? row.firstTime : null,
      lastTime: typeof row?.lastTime === "string" ? row.lastTime : null,
      metadata,
    },
    excluded: null,
  };
}

function tokenKey(contract: string, tokenId: string) {
  return `${contract}:${tokenId}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataCollectionName(metadata: Record<string, any>): string | null {
  return stringOrNull(
    metadata.collectionName ?? metadata.collection?.name ?? metadata.contract?.name
  );
}

function metadataCreator(metadata: Record<string, any>): {
  address: string | null;
  name: string | null;
} {
  const creator = Array.isArray(metadata.creators) ? metadata.creators[0] : null;
  if (typeof creator === "string") {
    return {
      address: creator.startsWith("tz") ? creator : null,
      name: creator.startsWith("tz") ? null : creator,
    };
  }
  if (creator && typeof creator === "object") {
    return {
      address: stringOrNull(creator.address),
      name: stringOrNull(creator.name ?? creator.alias),
    };
  }
  return { address: null, name: null };
}

function normalizeMediaUri(value: unknown): string | null {
  const uri = stringOrNull(value);
  return uri ? normalizeIpfsUri(uri) : null;
}

function safeIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toBigIntOrNull(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = BigInt(String(value));
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function deltaPercent(cost: bigint | null, sale: bigint | null): number | null {
  if (cost === null || sale === null || cost <= 0n) return null;
  return Number((((sale - cost) * 10_000n) / cost)) / 100;
}

async function loadEnrichment(items: DuplicateBalance[], walletAddress: string) {
  if (!items.length) return { metadata: [], markets: [], lots: [] };
  const metadataScope = or(...items.map((item) => and(
    eq(tokenMetadata.tokenContract, item.contract),
    eq(tokenMetadata.tokenId, item.tokenId)
  )))!;
  const marketScope = or(...items.map((item) => and(
    eq(tokenMarketSummary.tokenContract, item.contract),
    eq(tokenMarketSummary.tokenId, item.tokenId)
  )))!;
  const lotScope = or(...items.map((item) => and(
    eq(acquisitionLots.tokenContract, item.contract),
    eq(acquisitionLots.tokenId, item.tokenId)
  )))!;
  const [metadata, markets, lots] = await Promise.all([
    db.select().from(tokenMetadata).where(metadataScope),
    db.select().from(tokenMarketSummary).where(marketScope),
    db
      .select()
      .from(acquisitionLots)
      .where(
        and(
          eq(acquisitionLots.walletAddress, walletAddress),
          lotScope,
          isNull(acquisitionLots.disposedAt)
        )
      ),
  ]);
  return { metadata, markets, lots };
}

export async function scanDuplicateArtWallet(
  walletAddress: string,
  options: { forceFresh?: boolean } = {}
): Promise<CollektDuplicateScanResponse> {
  const address = walletAddress.trim();
  if (!isTezosWalletAddress(address)) throw new Error("INVALID_WALLET_ADDRESS");
  const cacheKey = address;
  if (!options.forceFresh) {
    const cached = scanCache.get(cacheKey);
    if (cached) return cached;
  }

  const rows = await tzkt.getJson<any[]>("/tokens/balances", {
    account: address,
    "token.standard": "fa2",
    "balance.gt": 1,
    "sort.desc": "lastTime",
    limit: MAX_RESULTS,
  });
  const excluded = { decimals: 0, supply: 0, malformed: 0 };
  const balances: DuplicateBalance[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const normalized = normalizeDuplicateBalance(row);
    if (normalized.item) balances.push(normalized.item);
    else if (normalized.excluded) excluded[normalized.excluded] += 1;
  }

  const enrichment = await loadEnrichment(balances, address);
  const metadataByToken = new Map(
    enrichment.metadata.map((row) => [tokenKey(row.tokenContract, row.tokenId), row])
  );
  const marketByToken = new Map(
    enrichment.markets.map((row) => [tokenKey(row.tokenContract, row.tokenId), row])
  );
  const lotsByToken = new Map<string, typeof enrichment.lots>();
  for (const lot of enrichment.lots) {
    const key = tokenKey(lot.tokenContract, lot.tokenId);
    lotsByToken.set(key, [...(lotsByToken.get(key) ?? []), lot]);
  }

  const items: CollektDuplicateToken[] = balances.map((holding) => {
    const key = tokenKey(holding.contract, holding.tokenId);
    const storedMetadata = metadataByToken.get(key);
    const raw = storedMetadata?.raw && typeof storedMetadata.raw === "object"
      ? storedMetadata.raw as Record<string, any>
      : holding.metadata;
    const creator = metadataCreator(raw);
    const lots = (lotsByToken.get(key) ?? []).sort(
      (a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime()
    );
    const lotEditions = lots.reduce((sum, lot) => sum + Math.max(0, Number(lot.editions) || 0), 0);
    const lotCost = lots.length
      ? lots.reduce((sum, lot) => sum + (toBigIntOrNull(lot.costMutez) ?? 0n), 0n)
      : null;
    const unitCost = lotCost !== null && lotEditions > 0 ? lotCost / BigInt(lotEditions) : null;
    const market = marketByToken.get(key);
    const lastSale = toBigIntOrNull(market?.lastSaleMutez);
    const delta = unitCost !== null && lastSale !== null ? lastSale - unitCost : null;
    const firstLot = lots[0];
    const lotTypes = new Set(lots.map((lot) => String(lot.acquisitionType)));
    const acquisitionType = lotTypes.size === 1 && ["purchase", "mint", "free_transfer"].includes(String(firstLot?.acquisitionType))
      ? firstLot!.acquisitionType as "purchase" | "mint" | "free_transfer"
      : "unknown";

    return {
      key,
      contract: holding.contract,
      tokenId: holding.tokenId,
      ownerAddress: address,
      name: stringOrNull(storedMetadata?.name) ?? stringOrNull(raw.name) ?? `Token #${holding.tokenId}`,
      collectionName: metadataCollectionName(raw),
      creatorAddress: stringOrNull(storedMetadata?.creatorAddress) ?? creator.address,
      creatorName: creator.name,
      thumbnailUri: normalizeMediaUri(storedMetadata?.thumbnail ?? raw.thumbnailUri ?? raw.displayUri ?? raw.artifactUri),
      artifactUri: normalizeMediaUri(storedMetadata?.artifactUri ?? raw.artifactUri),
      mimeType: stringOrNull(storedMetadata?.mimeType ?? raw.mimeType ?? raw.mime),
      balance: holding.balance,
      totalSupply: holding.totalSupply,
      decimals: 0,
      acquiredAt: safeIso(firstLot?.acquiredAt ?? holding.firstTime),
      acquisitionType,
      acquisitionMarketplace: stringOrNull(firstLot?.marketplace),
      acquisitionEditions: lots.length ? lotEditions : null,
      acquisitionCostMutez: lotCost?.toString() ?? null,
      acquisitionUnitCostMutez: unitCost?.toString() ?? null,
      lastSaleMutez: lastSale?.toString() ?? null,
      lastSaleAt: safeIso(market?.lastSaleAt),
      deltaMutez: delta?.toString() ?? null,
      deltaPercent: deltaPercent(unitCost, lastSale),
      currentFloorMutez: toBigIntOrNull(market?.currentFloorMutez)?.toString() ?? null,
      saleCount: Number(market?.saleCount ?? 0),
      activeListingCount: Number(market?.activeListingCount ?? 0),
      uniqueOwnersCount: Number(market?.uniqueOwnersCount ?? 0),
      firstHeldAt: safeIso(holding.firstTime),
      lastChangedAt: safeIso(holding.lastTime),
      provenance: {
        holdings: "tzkt",
        acquisition: lots.length ? "wtfos-index" : "unavailable",
        market: market ? "wtfos-index" : "unavailable",
      },
    };
  });

  const fetchedAt = new Date();
  const response: CollektDuplicateScanResponse = {
    walletAddress: address,
    items,
    summary: {
      duplicateArtTokens: items.length,
      duplicateEditions: items.reduce((sum, item) => sum + item.balance, 0),
      knownAcquisitionPrices: items.filter((item) => item.acquisitionUnitCostMutez !== null).length,
      knownLastSales: items.filter((item) => item.lastSaleMutez !== null).length,
      excluded,
    },
    filters: {
      minimumBalance: 2,
      maximumSupply: 5000,
      decimals: 0,
      standard: "fa2",
    },
    source: {
      holdings: "tzkt",
      pricing: "wtfos-index",
      network: "tezos-mainnet",
      fetchedAt: fetchedAt.toISOString(),
      staleAfter: new Date(fetchedAt.getTime() + CACHE_TTL_MS).toISOString(),
      truncated: Array.isArray(rows) && rows.length >= MAX_RESULTS,
    },
  };
  scanCache.set(cacheKey, response);
  return response;
}
