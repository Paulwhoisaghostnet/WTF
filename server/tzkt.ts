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

export function clearCache() {
  cache.clear();
}
