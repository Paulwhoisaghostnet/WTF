export type Tz2atFirehoseSnapshot = {
  mode: "wallet-activity-snapshot" | "relay-replay-search";
  baseUrl: string;
  sourceUrl: string;
  chain: "tezos" | "etherlink" | null;
  walletAddress: string | null;
  limit: number;
  cursor: string | null;
  filters: Tz2atFirehoseFilters;
  scannedItems: number;
  matchedItems: number;
  items: Array<Record<string, unknown>>;
  raw: Record<string, unknown> | null;
};

export type Tz2atFirehoseFilters = {
  chain?: "tezos" | "etherlink";
  eventType?: string;
  query?: string;
  address?: string;
  contract?: string;
  marketplace?: string;
  tokenId?: string;
  operationHash?: string;
};

export function extractTz2atEventItems(upstream: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(upstream)) return upstream.filter(isRecord);
  if (!isRecord(upstream)) return [];
  const candidates = [upstream.items, upstream.events, upstream.records, upstream.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

export function extractTz2atCursor(upstream: unknown): string | null {
  if (!isRecord(upstream)) return null;
  const cursor = upstream.cursor ?? upstream.nextCursor ?? upstream.latestCursor;
  return typeof cursor === "string" && cursor.trim() ? cursor : null;
}

export function filterTz2atEventItems(
  items: Array<Record<string, unknown>>,
  filters: Tz2atFirehoseFilters = {}
): Array<Record<string, unknown>> {
  return items.filter((item) => matchesFilter(item, filters));
}

export function buildTz2atFirehoseSnapshot(input: {
  mode?: Tz2atFirehoseSnapshot["mode"];
  baseUrl: string;
  sourceUrl: string;
  chain?: "tezos" | "etherlink";
  walletAddress?: string | null;
  limit: number;
  upstream: unknown;
  filters?: Tz2atFirehoseFilters;
}): Tz2atFirehoseSnapshot {
  const filters = input.filters ?? {};
  const scannedItems = extractTz2atEventItems(input.upstream);
  const items = filterTz2atEventItems(scannedItems, filters);
  return {
    mode: input.mode ?? "wallet-activity-snapshot",
    baseUrl: input.baseUrl,
    sourceUrl: input.sourceUrl,
    chain: input.chain ?? null,
    walletAddress: input.walletAddress ?? null,
    limit: input.limit,
    cursor: extractTz2atCursor(input.upstream),
    filters,
    scannedItems: scannedItems.length,
    matchedItems: items.length,
    items,
    raw: isRecord(input.upstream) ? input.upstream : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesFilter(item: Record<string, unknown>, filters: Tz2atFirehoseFilters): boolean {
  const payload = isRecord(item.payload) ? item.payload : {};
  const merged = { ...payload, ...item };
  const haystack = JSON.stringify(merged).toLowerCase();

  if (filters.chain && !chainMatches(merged, filters.chain, haystack)) return false;
  if (filters.eventType && normalizeText(eventTypeOf(merged)) !== normalizeText(filters.eventType)) return false;
  if (filters.query && !haystack.includes(normalizeText(filters.query))) return false;
  if (filters.address && !haystack.includes(normalizeText(filters.address))) return false;
  if (filters.contract && !haystack.includes(normalizeText(filters.contract))) return false;
  if (filters.marketplace && !haystack.includes(normalizeText(filters.marketplace))) return false;
  if (filters.operationHash && !haystack.includes(normalizeText(filters.operationHash))) return false;
  if (filters.tokenId && !tokenIdMatches(merged, filters.tokenId, haystack)) return false;

  return true;
}

function eventTypeOf(item: Record<string, unknown>): string {
  const value = item.$type ?? item.eventType ?? item.type ?? item.collection;
  return typeof value === "string" ? value : "";
}

function chainMatches(item: Record<string, unknown>, chain: "tezos" | "etherlink", haystack: string): boolean {
  const direct = [item.chain, item.network, item.blockchain].filter((value) => value !== undefined && value !== null).map((value) => normalizeText(String(value)));
  if (direct.length === 0 && !haystack.includes("tezos") && !haystack.includes("etherlink")) return true;
  if (chain === "tezos") return direct.some((value) => value === "tezos" || value === "mainnet" || value === "ghostnet" || value === "shadownet") || haystack.includes("tezos");
  return direct.some((value) => value === "etherlink" || value.includes("etherlink")) || haystack.includes("etherlink");
}

function tokenIdMatches(item: Record<string, unknown>, tokenId: string, haystack: string): boolean {
  const expected = normalizeText(tokenId);
  const direct = [
    item.tokenId,
    item.token_id,
    item.tokenID,
    item.fa2TokenId,
    item.objktId,
    item.objectId,
    item.marketplaceObjectId,
  ];
  if (direct.some((value) => value !== undefined && normalizeText(String(value)) === expected)) return true;
  return haystack.includes(expected);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
