import { WTF_TOKEN } from "@shared/types";
import type {
  TzKTTokenBalance,
  TzKTTokenTransfer,
} from "@shared/types";
import { createBoundedExpiringCache } from "./lib/bounded-expiring-cache";
import { tzkt } from "./lib/upstream";
import { normalizeIpfsUri as normalizeIpfsUriShared } from "@shared/ipfs-gateways";

const CACHE_TTL = 5 * 60 * 1000;
const cache = createBoundedExpiringCache<unknown>({
  ttlMs: CACHE_TTL,
  maxEntries: Math.max(100, Number(process.env.TZKT_HELPER_CACHE_MAX_ENTRIES || 2_000)),
});

interface CacheOptions {
  forceFresh?: boolean;
}

function getCached<T>(key: string): T | null {
  return cache.get(key) as T | null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, data);
}

export async function getTokenHolders(
  limit = 100,
  offset = 0
): Promise<TzKTTokenBalance[]> {
  const cacheKey = `holders:${limit}:${offset}`;
  const cached = getCached<TzKTTokenBalance[]>(cacheKey);
  if (cached) return cached;

  const data = await tzkt.getJson<TzKTTokenBalance[]>("/tokens/balances", {
    "token.contract": WTF_TOKEN.contract,
    "token.tokenId": WTF_TOKEN.tokenId,
    "balance.gt": 0,
    "sort.desc": "balance",
    limit,
    offset,
  });
  setCache(cacheKey, data);
  return data;
}

export async function getTokenBalance(
  address: string,
  options: CacheOptions = {}
): Promise<TzKTTokenBalance | null> {
  const cacheKey = `balance:${address}`;
  if (!options.forceFresh) {
    const cached = getCached<TzKTTokenBalance | null>(cacheKey);
    if (cached !== null) return cached;
  }

  const data = await tzkt.getJson<TzKTTokenBalance[]>("/tokens/balances", {
    "token.contract": WTF_TOKEN.contract,
    "token.tokenId": WTF_TOKEN.tokenId,
    account: address,
  });
  const result = data[0] ?? null;
  if (result) setCache(cacheKey, result);
  return result;
}

export async function getTokenTransfers(
  limit = 100,
  offset = 0
): Promise<TzKTTokenTransfer[]> {
  const cacheKey = `transfers:${limit}:${offset}`;
  const cached = getCached<TzKTTokenTransfer[]>(cacheKey);
  if (cached) return cached;

  const data = await tzkt.getJson<TzKTTokenTransfer[]>("/tokens/transfers", {
    "token.contract": WTF_TOKEN.contract,
    "token.tokenId": WTF_TOKEN.tokenId,
    "sort.desc": "id",
    limit,
    offset,
  });
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

  const data = await tzkt.getJson<TzKTTokenTransfer[]>("/tokens/transfers", {
    "token.contract": WTF_TOKEN.contract,
    "token.tokenId": WTF_TOKEN.tokenId,
    "anyof.from.to": address,
    "sort.desc": "id",
    limit,
  });
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
  creatorAddress?: string;
}

function normalizeIpfsUri(uri?: string): string | undefined {
  if (!uri || typeof uri !== "string") return undefined;
  return normalizeIpfsUriShared(uri);
}

export async function getOwnedFa2TokensPage(
  address: string,
  limit = 200,
  offset = 0,
  options: CacheOptions = {}
): Promise<{ items: OwnedFa2Token[]; hasMore: boolean; nextOffset: number }> {
  const cacheKey = `owned-fa2:${address}:${limit}:${offset}`;
  if (!options.forceFresh) {
    const cached = getCached<{
      items: OwnedFa2Token[];
      hasMore: boolean;
      nextOffset: number;
    }>(cacheKey);
    if (cached) return cached;
  }

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safeOffset = Math.max(offset, 0);
  const data = await tzkt.getJson<any[]>("/tokens/balances", {
    account: address,
    "token.standard": "fa2",
    "balance.gt": 0,
    "sort.desc": "lastTime",
    offset: safeOffset,
    limit: safeLimit,
  });

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

      const creators = metadata?.creators;
      let creatorAddress: string | undefined;
      if (Array.isArray(creators) && creators.length > 0) {
        const first = creators[0];
        if (typeof first === "string" && first.startsWith("tz")) {
          creatorAddress = first;
        }
      }
      if (!creatorAddress && typeof token?.firstMinter?.address === "string") {
        creatorAddress = token.firstMinter.address;
      }

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
        creatorAddress,
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
  limit = 200,
  options: CacheOptions = {}
): Promise<OwnedFa2Token[]> {
  const first = await getOwnedFa2TokensPage(address, limit, 0, options);
  return first.items;
}

/**
 * FA2 balance row enriched with the TzKT `firstTime`/`lastTime`
 * fields.  Used by the cockpit `balance-reconcile` job to patch
 * wallet_holdings with authoritative acquire/last-activity
 * timestamps.  Intentionally minimal — no metadata, no caching —
 * so we can ship it through the reconcile loop cheaply.
 */
export interface OwnedFa2Time {
  contract: string;
  tokenId: string;
  balance: string;
  firstTime: string | null;
  lastTime: string | null;
}

export async function getOwnedFa2BalancesWithTimes(
  address: string,
  limit = 500,
  offset = 0
): Promise<{
  items: OwnedFa2Time[];
  hasMore: boolean;
  nextOffset: number;
}> {
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  const safeOffset = Math.max(offset, 0);
  const data = await tzkt.getJson<any[]>("/tokens/balances", {
    account: address,
    "token.standard": "fa2",
    "balance.gt": 0,
    select: "token.contract.address,token.tokenId,balance,firstTime,lastTime",
    "sort.desc": "lastTime",
    offset: safeOffset,
    limit: safeLimit,
  });
  const rows = Array.isArray(data) ? data : [];

  const items: OwnedFa2Time[] = rows
    .map((row: any) => ({
      contract:
        row?.["token.contract.address"] ??
        row?.token?.contract?.address ??
        null,
      tokenId: String(
        row?.["token.tokenId"] ?? row?.token?.tokenId ?? ""
      ),
      balance: String(row?.balance ?? "0"),
      firstTime: row?.firstTime ?? null,
      lastTime: row?.lastTime ?? null,
    }))
    .filter(
      (it: OwnedFa2Time) =>
        typeof it.contract === "string" &&
        it.contract.startsWith("KT1") &&
        /^[0-9]+$/.test(it.tokenId)
    );

  return {
    items,
    hasMore: rows.length >= safeLimit,
    nextOffset: safeOffset + rows.length,
  };
}

export function clearCache() {
  cache.clear();
}

/* ─────────────────────────────────────────────────────────
 * Surveillance helpers
 *
 * These are the building blocks of the per-wallet dossier.
 * They explicitly bypass the 5-minute response cache because
 * sync jobs need fresh data, and always use an incremental
 * `id.gt` cursor so we never miss or replay events.
 * ───────────────────────────────────────────────────────── */

export interface TzktTransferRow {
  id: number;
  level: number;
  timestamp: string;
  token?: {
    id?: number;
    contract?: { address?: string } | string;
    tokenId?: string | number;
    standard?: string;
    metadata?: Record<string, any>;
  };
  from?: { address?: string } | null;
  to?: { address?: string } | null;
  amount?: string | number;
  transactionId?: number;
  originationId?: number;
  migrationId?: number;
}

export interface TzktTransactionRow {
  id: number;
  level: number;
  timestamp: string;
  hash?: string;
  type?: string;
  sender?: { address?: string } | null;
  target?: { address?: string } | null;
  amount?: number;
  status?: string;
  parameter?: unknown;
  entrypoint?: string;
}

export interface TzktDelegationRow {
  id: number;
  level: number;
  timestamp: string;
  hash?: string;
  sender?: { address?: string } | null;
  newDelegate?: { address?: string } | null;
  prevDelegate?: { address?: string } | null;
  status?: string;
}

export interface TzktOriginationRow {
  id: number;
  level: number;
  timestamp: string;
  hash?: string;
  sender?: { address?: string } | null;
  originatedContract?: { address?: string; alias?: string } | null;
  contractBalance?: number;
  status?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  return tzkt.getJson<T>(url);
}

/**
 * Split an address list into chunks that keep the TzKT URL below the
 * typical 2 KB practical limit.  TzKT accepts long query strings but
 * HTTP proxies in front of it may not.
 */
export function chunkAddressesForTzkt(addresses: string[], chunkSize = 50): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < addresses.length; i += chunkSize) {
    out.push(addresses.slice(i, i + chunkSize));
  }
  return out;
}

const TRANSFER_FIELDS = [
  "id",
  "level",
  "timestamp",
  "token",
  "from",
  "to",
  "amount",
  "transactionId",
  "originationId",
  "migrationId",
].join(",");

/** Fetch FA1.2 / FA2 transfers where any of the supplied addresses was either side. */
export async function getTransfersSinceIdBulk(
  addresses: string[],
  sinceId: number,
  limit = 1000
): Promise<TzktTransferRow[]> {
  if (addresses.length === 0) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const addrList = addresses.join(",");
  return fetchJson<TzktTransferRow[]>(
    `/tokens/transfers?anyof.from.to.in=${encodeURIComponent(addrList)}&id.gt=${sinceId}&sort.asc=id&limit=${safeLimit}&select=${TRANSFER_FIELDS}`
  );
}

/** Per-wallet backfill/catchup variant. */
export async function getTransfersSinceIdSingle(
  address: string,
  sinceId: number,
  limit = 1000
): Promise<TzktTransferRow[]> {
  return getTransfersSinceIdBulk([address], sinceId, limit);
}

const TX_FIELDS = [
  "id",
  "level",
  "timestamp",
  "hash",
  "type",
  "sender",
  "target",
  "amount",
  "status",
  "entrypoint",
].join(",");

/**
 * Fetch native transactions (XTZ transfers + contract calls) where any of the
 * supplied addresses was sender or target.  Distinct from /tokens/transfers.
 */
export async function getTransactionsSinceIdBulk(
  addresses: string[],
  sinceId: number,
  limit = 1000
): Promise<TzktTransactionRow[]> {
  if (addresses.length === 0) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const addrList = addresses.join(",");
  return fetchJson<TzktTransactionRow[]>(
    `/operations/transactions?anyof.sender.target.in=${encodeURIComponent(addrList)}&id.gt=${sinceId}&sort.asc=id&limit=${safeLimit}&status=applied&select=${TX_FIELDS}`
  );
}

export async function getTransactionsSinceIdSingle(
  address: string,
  sinceId: number,
  limit = 1000
): Promise<TzktTransactionRow[]> {
  return getTransactionsSinceIdBulk([address], sinceId, limit);
}

/** Fetch delegation ops (user changed their delegate / originator). */
export async function getDelegationsSinceIdBulk(
  addresses: string[],
  sinceId: number,
  limit = 1000
): Promise<TzktDelegationRow[]> {
  if (addresses.length === 0) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const addrList = addresses.join(",");
  return fetchJson<TzktDelegationRow[]>(
    `/operations/delegations?sender.in=${encodeURIComponent(addrList)}&id.gt=${sinceId}&sort.asc=id&limit=${safeLimit}&status=applied`
  );
}

/** Fetch contract originations initiated by the user. */
export async function getOriginationsSinceIdBulk(
  addresses: string[],
  sinceId: number,
  limit = 1000
): Promise<TzktOriginationRow[]> {
  if (addresses.length === 0) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const addrList = addresses.join(",");
  return fetchJson<TzktOriginationRow[]>(
    `/operations/originations?sender.in=${encodeURIComponent(addrList)}&id.gt=${sinceId}&sort.asc=id&limit=${safeLimit}&status=applied`
  );
}
