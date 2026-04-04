import { WTF_TOKEN } from "@shared/types";
import type {
  TzKTTokenBalance,
  TzKTTokenTransfer,
} from "@shared/types";

const TZKT_BASE = "https://api.tzkt.io/v1";
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function getTokenHolders(
  limit = 100,
  offset = 0
): Promise<TzKTTokenBalance[]> {
  const cacheKey = `holders:${limit}:${offset}`;
  const cached = getCached<TzKTTokenBalance[]>(cacheKey);
  if (cached) return cached;

  const url = `${TZKT_BASE}/tokens/balances?token.contract=${WTF_TOKEN.contract}&token.tokenId=${WTF_TOKEN.tokenId}&balance.gt=0&sort.desc=balance&limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT error: ${res.status}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

export async function getTokenBalance(
  address: string
): Promise<TzKTTokenBalance | null> {
  const cacheKey = `balance:${address}`;
  const cached = getCached<TzKTTokenBalance | null>(cacheKey);
  if (cached !== null) return cached;

  const url = `${TZKT_BASE}/tokens/balances?token.contract=${WTF_TOKEN.contract}&token.tokenId=${WTF_TOKEN.tokenId}&account=${address}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT error: ${res.status}`);
  const data = await res.json();
  const result = data[0] ?? null;
  setCache(cacheKey, result);
  return result;
}

export async function getTokenTransfers(
  limit = 100,
  offset = 0
): Promise<TzKTTokenTransfer[]> {
  const cacheKey = `transfers:${limit}:${offset}`;
  const cached = getCached<TzKTTokenTransfer[]>(cacheKey);
  if (cached) return cached;

  const url = `${TZKT_BASE}/tokens/transfers?token.contract=${WTF_TOKEN.contract}&token.tokenId=${WTF_TOKEN.tokenId}&sort.desc=id&limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT error: ${res.status}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

export async function getWalletTokenTransfers(
  address: string,
  limit = 50
): Promise<TzKTTokenTransfer[]> {
  const cacheKey = `wallet-transfers:${address}:${limit}`;
  const cached = getCached<TzKTTokenTransfer[]>(cacheKey);
  if (cached) return cached;

  const url = `${TZKT_BASE}/tokens/transfers?token.contract=${WTF_TOKEN.contract}&token.tokenId=${WTF_TOKEN.tokenId}&anyof.from.to=${address}&sort.desc=id&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT error: ${res.status}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

export interface OwnedFa2Token {
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  symbol?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
}

function normalizeIpfsUri(uri?: string): string | undefined {
  if (!uri || typeof uri !== "string") return undefined;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
  }
  return uri;
}

export async function getOwnedFa2TokensPage(
  address: string,
  limit = 200,
  offset = 0
): Promise<{ items: OwnedFa2Token[]; hasMore: boolean; nextOffset: number }> {
  const cacheKey = `owned-fa2:${address}:${limit}:${offset}`;
  const cached = getCached<{
    items: OwnedFa2Token[];
    hasMore: boolean;
    nextOffset: number;
  }>(cacheKey);
  if (cached) return cached;

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safeOffset = Math.max(offset, 0);
  const url =
    `${TZKT_BASE}/tokens/balances?account=${address}` +
    `&token.standard=fa2&balance.gt=0` +
    `&sort.desc=lastTime&offset=${safeOffset}&limit=${safeLimit}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TzKT error: ${res.status}`);
  const data = await res.json();

  const rows = Array.isArray(data) ? data : [];
  const mapped: OwnedFa2Token[] = rows
    .map((row: any) => {
      // TzKT may return slightly different row shapes over time; support both nested and flat.
      const token = row?.token || row || {};
      const metadata = token?.metadata || {};
      const thumbnail =
        metadata?.thumbnailUri ||
        metadata?.displayUri ||
        metadata?.artifactUri ||
        undefined;

      return {
        contract:
          token?.contract?.address ||
          token?.contractAddress ||
          token?.contract ||
          undefined,
        tokenId: String(token?.tokenId ?? "0"),
        balance: String(row?.balance ?? "0"),
        name: metadata?.name || token?.name || undefined,
        symbol: metadata?.symbol || undefined,
        thumbnail: normalizeIpfsUri(thumbnail),
        metadata: metadata || undefined,
      };
    })
    .filter(
      (t: OwnedFa2Token) =>
        typeof t.contract === "string" &&
        t.contract.startsWith("KT1") &&
        typeof t.tokenId === "string" &&
        /^[0-9]+$/.test(t.tokenId)
    );

  const result = {
    items: mapped,
    hasMore: rows.length >= safeLimit,
    nextOffset: safeOffset + rows.length,
  };
  setCache(cacheKey, result);
  return result;
}

export async function getOwnedFa2Tokens(
  address: string,
  limit = 200
): Promise<OwnedFa2Token[]> {
  const first = await getOwnedFa2TokensPage(address, limit, 0);
  return first.items;
}

export function clearCache() {
  cache.clear();
}
