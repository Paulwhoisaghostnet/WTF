import { Router } from "express";
import { db } from "../db";
import { userWallets, users, userOwnedTokens } from "@shared/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

const router = Router();

const TZKT_BASE = "https://api.tzkt.io/v1";
const BARTER_CONTRACT_ADDRESS =
  process.env.BARTER_CONTRACT_ADDRESS ||
  process.env.VITE_BARTER_CONTRACT_ADDRESS ||
  "";

interface OnChainStorage {
  admin: string;
  paused: boolean;
  trades: string | number;
}

interface BigMapKeyRow {
  key?: unknown;
  value?: unknown;
  active?: boolean;
}

interface AddressProfile {
  userId: number | null;
  username: string | null;
  displayName: string | null;
  pfpImageUrl: string | null;
}

interface TokenMetadata {
  tokenName: string | null;
  tokenThumbnail: string | null;
}

interface OnChainRequestedItem {
  tokenContract: string;
  tokenId: string | null;
  amount: string;
}

interface OnChainOfferedItem {
  tokenContract: string;
  tokenId: string;
  amount: string;
}

interface OnChainTrade {
  id: number;
  maker: string;
  requestedMode: "package" | "choice";
  requestedItems: OnChainRequestedItem[];
  offeredMode: "package" | "choice";
  offeredItems: OnChainOfferedItem[];
  expiresAt: string | null;
  active: boolean;
}

interface OnChainTradeSnapshot {
  admin: string;
  paused: boolean;
  trades: OnChainTrade[];
}

function normalizeMediaUri(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    const path = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    return path ? `https://ipfs.io/ipfs/${path}` : null;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return null;
}

function resolveTokenThumbnail(
  tokenThumbnail: string | null | undefined,
  metadata: unknown
): string | null {
  const meta =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return (
    normalizeMediaUri(tokenThumbnail || null) ||
    normalizeMediaUri(meta.thumbnailUri) ||
    normalizeMediaUri(meta.displayUri) ||
    normalizeMediaUri(meta.artifactUri) ||
    normalizeMediaUri(meta.image) ||
    null
  );
}

interface EnrichedRequestedItem extends OnChainRequestedItem {
  tokenName: string | null;
  tokenThumbnail: string | null;
}

interface EnrichedOfferedItem extends OnChainOfferedItem {
  tokenName: string | null;
  tokenThumbnail: string | null;
}

interface EnrichedTrade extends Omit<OnChainTrade, "requestedItems" | "offeredItems"> {
  makerUserId: number | null;
  makerUsername: string | null;
  makerDisplayName: string | null;
  requestedItems: EnrichedRequestedItem[];
  offeredItems: EnrichedOfferedItem[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asNatMaybe(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return /^[0-9]+$/.test(raw) ? raw : null;
}

function asNatString(value: unknown): string {
  return asNatMaybe(value) ?? "0";
}

function asNatNumber(value: unknown): number | null {
  const raw = asNatMaybe(value);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function asAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("tz") && !trimmed.startsWith("KT1")) return null;
  return trimmed;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function parseVariantName(
  value: unknown,
  allowed: Array<"package" | "choice">
): "package" | "choice" | null {
  if (typeof value === "string") {
    return allowed.includes(value as "package" | "choice")
      ? (value as "package" | "choice")
      : null;
  }
  const obj = asObject(value);
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return key;
  }
  return null;
}

function parseOptionalNat(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const obj = asObject(value);
  if (Object.prototype.hasOwnProperty.call(obj, "None")) return null;
  if (Object.prototype.hasOwnProperty.call(obj, "none")) return null;
  if (Object.prototype.hasOwnProperty.call(obj, "Some")) {
    return asNatMaybe(obj.Some) ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(obj, "some")) {
    return asNatMaybe(obj.some) ?? null;
  }
  return asNatMaybe(value) ?? null;
}

function parseOptionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  const obj = asObject(value);
  if (Object.prototype.hasOwnProperty.call(obj, "None")) return null;
  if (Object.prototype.hasOwnProperty.call(obj, "none")) return null;
  if (Object.prototype.hasOwnProperty.call(obj, "Some")) {
    const inner = obj.Some;
    if (inner === null || inner === undefined) return null;
    return String(inner);
  }
  if (Object.prototype.hasOwnProperty.call(obj, "some")) {
    const inner = obj.some;
    if (inner === null || inner === undefined) return null;
    return String(inner);
  }
  return String(value);
}

function tokenKey(tokenContract: string, tokenId: string): string {
  return `${tokenContract}:${tokenId}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TzKT request failed (${res.status}) for ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchOnChainStorage(): Promise<OnChainStorage> {
  const url = `${TZKT_BASE}/contracts/${BARTER_CONTRACT_ADDRESS}/storage`;
  return fetchJson<OnChainStorage>(url);
}

async function fetchBigMapRows(
  bigMapId: string | number,
  limit: number
): Promise<BigMapKeyRow[]> {
  const safeLimit = clamp(limit, 1, 500);
  const url = `${TZKT_BASE}/bigmaps/${bigMapId}/keys?active=true&limit=${safeLimit}`;
  return fetchJson<BigMapKeyRow[]>(url);
}

function parseRequestedItem(value: unknown): OnChainRequestedItem | null {
  const row = asObject(value);
  const tokenContract = asAddress(row.token_contract);
  if (!tokenContract) return null;
  return {
    tokenContract,
    tokenId: parseOptionalNat(row.token_id),
    amount: asNatString(row.amount),
  };
}

function parseOfferedItem(value: unknown): OnChainOfferedItem | null {
  const row = asObject(value);
  const tokenContract = asAddress(row.token_contract);
  if (!tokenContract) return null;
  return {
    tokenContract,
    tokenId: asNatString(row.token_id),
    amount: asNatString(row.amount),
  };
}

function parseTradeRow(row: BigMapKeyRow): OnChainTrade | null {
  const tradeId = asNatNumber(row.key);
  const value = asObject(row.value);
  const maker = asAddress(value.maker);
  if (tradeId === null || !maker) return null;

  const requestedMode =
    parseVariantName(value.requested_mode, ["package", "choice"]) || "package";
  const offeredMode =
    parseVariantName(value.offered_mode, ["package", "choice"]) || "package";

  const requestedItems = (Array.isArray(value.requested_items)
    ? value.requested_items
    : []
  )
    .map(parseRequestedItem)
    .filter(Boolean) as OnChainRequestedItem[];

  const offeredItems = (Array.isArray(value.offered_items)
    ? value.offered_items
    : []
  )
    .map(parseOfferedItem)
    .filter(Boolean) as OnChainOfferedItem[];

  return {
    id: tradeId,
    maker,
    requestedMode,
    requestedItems,
    offeredMode,
    offeredItems,
    expiresAt: parseOptionalTimestamp(value.expires_at),
    active: Boolean(value.active),
  };
}

async function fetchOnChainSnapshot(limit: number): Promise<OnChainTradeSnapshot> {
  const storage = await fetchOnChainStorage();
  const tradeRows = await fetchBigMapRows(storage.trades, limit);

  return {
    admin: storage.admin,
    paused: Boolean(storage.paused),
    trades: tradeRows.map(parseTradeRow).filter(Boolean) as OnChainTrade[],
  };
}

async function loadAddressProfiles(addresses: string[]): Promise<Map<string, AddressProfile>> {
  const map = new Map<string, AddressProfile>();
  if (addresses.length === 0) return map;

  const unique = Array.from(new Set(addresses));
  const rows = await db
    .select({
      walletAddress: userWallets.walletAddress,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      pfpImageUrl: users.pfpImageUrl,
    })
    .from(userWallets)
    .leftJoin(users, eq(userWallets.userId, users.id))
    .where(inArray(userWallets.walletAddress, unique));

  for (const row of rows) {
    map.set(row.walletAddress, {
      userId: row.userId ?? null,
      username: row.username ?? null,
      displayName: row.displayName ?? null,
      pfpImageUrl: row.pfpImageUrl ?? null,
    });
  }
  return map;
}

async function loadTokenMetadata(
  tokenContract: string,
  tokenId: string
): Promise<TokenMetadata> {
  const [row] = await db
    .select({
      tokenName: userOwnedTokens.tokenName,
      tokenThumbnail: userOwnedTokens.tokenThumbnail,
      metadata: userOwnedTokens.metadata,
    })
    .from(userOwnedTokens)
    .where(
      and(
        eq(userOwnedTokens.tokenContract, tokenContract),
        eq(userOwnedTokens.tokenId, tokenId)
      )
    )
    .orderBy(desc(userOwnedTokens.updatedAt))
    .limit(1);

  return {
    tokenName: row?.tokenName ?? null,
    tokenThumbnail: resolveTokenThumbnail(row?.tokenThumbnail ?? null, row?.metadata),
  };
}

async function enrichTrades(trades: OnChainTrade[]): Promise<EnrichedTrade[]> {
  const addressSet = new Set<string>();
  for (const trade of trades) {
    addressSet.add(trade.maker);
  }
  const profiles = await loadAddressProfiles(Array.from(addressSet));

  const metaCache = new Map<string, Promise<TokenMetadata>>();
  const getMeta = (tokenContract: string, tokenId: string) => {
    const key = tokenKey(tokenContract, tokenId);
    if (!metaCache.has(key)) {
      metaCache.set(key, loadTokenMetadata(tokenContract, tokenId));
    }
    return metaCache.get(key)!;
  };

  return Promise.all(
    trades.map(async (trade) => {
      const makerProfile = profiles.get(trade.maker) ?? null;

      const requestedItems = await Promise.all(
        trade.requestedItems.map(async (item) => {
          if (item.tokenId == null) {
            return {
              ...item,
              tokenName: null,
              tokenThumbnail: null,
            } satisfies EnrichedRequestedItem;
          }
          const meta = await getMeta(item.tokenContract, item.tokenId);
          return {
            ...item,
            tokenName: meta.tokenName,
            tokenThumbnail: meta.tokenThumbnail,
          } satisfies EnrichedRequestedItem;
        })
      );

      const offeredItems = await Promise.all(
        trade.offeredItems.map(async (item) => {
          const meta = await getMeta(item.tokenContract, item.tokenId);
          return {
            ...item,
            tokenName: meta.tokenName,
            tokenThumbnail: meta.tokenThumbnail,
          } satisfies EnrichedOfferedItem;
        })
      );

      return {
        ...trade,
        makerUserId: makerProfile?.userId ?? null,
        makerUsername: makerProfile?.username ?? null,
        makerDisplayName: makerProfile?.displayName ?? null,
        requestedItems,
        offeredItems,
      } satisfies EnrichedTrade;
    })
  );
}

function noContractResponse() {
  return {
    contractAddress: null,
    admin: null,
    paused: false,
    trades: [] as EnrichedTrade[],
    counts: {
      trades: 0,
    },
    warning: "BARTER_CONTRACT_ADDRESS_NOT_CONFIGURED",
  };
}

router.get("/api/barter/onchain", async (req, res) => {
  try {
    if (!BARTER_CONTRACT_ADDRESS) {
      return res.json(noContractResponse());
    }

    const limit = clamp(parseInt((req.query.limit as string) || "200", 10), 1, 500);
    const snapshot = await fetchOnChainSnapshot(limit);
    const activeTrades = snapshot.trades.filter((trade) => trade.active);
    const trades = await enrichTrades(activeTrades);

    res.json({
      contractAddress: BARTER_CONTRACT_ADDRESS,
      admin: snapshot.admin,
      paused: snapshot.paused,
      trades,
      counts: {
        trades: trades.length,
      },
    });
  } catch (_err) {
    res.status(500).json({ error: "Failed to fetch on-chain barter state" });
  }
});

router.get("/api/barter/trade-board", async (req, res) => {
  try {
    if (!BARTER_CONTRACT_ADDRESS) {
      return res.json({
        contractAddress: null,
        items: [],
        pagination: {
          limit: 0,
          offset: 0,
          count: 0,
          total: 0,
          hasMore: false,
          nextOffset: 0,
        },
        warning: "BARTER_CONTRACT_ADDRESS_NOT_CONFIGURED",
      });
    }

    const owner = String(req.query.owner || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = clamp(parseInt((req.query.limit as string) || "100", 10), 1, 500);
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10));

    const snapshot = await fetchOnChainSnapshot(500);
    const enriched = await enrichTrades(snapshot.trades.filter((trade) => trade.active));

    const filtered = enriched
      .filter((trade) => (owner ? trade.maker === owner : true))
      .filter((trade) => {
        if (!q) return true;

        const makerLabel = `${trade.maker} ${trade.makerUsername || ""} ${trade.makerDisplayName || ""}`.toLowerCase();
        const requestedLabel = trade.requestedItems
          .map(
            (item) =>
              `${item.tokenContract} ${item.tokenId ?? "*"} ${item.tokenName || ""}`
          )
          .join(" ")
          .toLowerCase();
        const offeredLabel = trade.offeredItems
          .map(
            (item) => `${item.tokenContract} ${item.tokenId} ${item.tokenName || ""}`
          )
          .join(" ")
          .toLowerCase();

        return (
          makerLabel.includes(q) ||
          requestedLabel.includes(q) ||
          offeredLabel.includes(q) ||
          String(trade.id).includes(q)
        );
      })
      .sort((a, b) => b.id - a.id);

    const items = filtered.slice(offset, offset + limit);

    res.json({
      contractAddress: BARTER_CONTRACT_ADDRESS,
      items,
      pagination: {
        limit,
        offset,
        count: items.length,
        total: filtered.length,
        hasMore: offset + limit < filtered.length,
        nextOffset: offset + items.length,
      },
    });
  } catch (_err) {
    res.status(500).json({ error: "Failed to fetch barter trade board" });
  }
});

export default router;
