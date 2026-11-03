import { objkt } from "../../lib/upstream";
import { approvedHorseTags, HORF_CANDIDATE_REGEX, tokenQualifies, type ObjktToken } from "./model";
import { HORF_SEASONS, resolveHorfSeason } from "./seasons";
import { OBJKT_PAGE_SIZE } from "./source";
import { horseContractAddress } from "./horse-config";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { HORF_MAINNET_BLOCK_MS } from "./mainnet";

export const HORF_OPEN_RANGE_QUERY = `query HorfOpenRange($where: token_bool_exp!, $cursor: bigint!, $pageSize: Int!) {
  token(where: { _and: [$where, { pk: { _gt: $cursor } }] }, order_by: { pk: asc }, limit: $pageSize) {
    pk fa_contract token_id timestamp name description decimals thumbnail_uri display_uri
    tags { tag { name token_count } }
  }
}`;

export interface OpenRangeMint extends ObjktToken {
  pk?: string | number;
  timestamp?: string | null;
}

export interface OpenRangeItem {
  contract: string;
  tokenId: string;
  name: string;
  description: string | null;
  image: string | null;
  mintedAt: string | null;
  creatorAddress: null;
}

export type OpenRangeMode = "all-seasons" | "all-horse-search" | string;

export function openRangeWhere(mode: OpenRangeMode) {
  const candidate = { _or: [
    { name: { _iregex: HORF_CANDIDATE_REGEX } },
    { description: { _iregex: HORF_CANDIDATE_REGEX } },
    // Explicit tag keywords qualify regardless of group size, so the source
    // branch must not impose token_count > 5. The postfilter applies that rule.
    { tags: { tag: { name: { _iregex: HORF_CANDIDATE_REGEX } } } },
  ] };
  if (mode === "all-horse-search") return candidate;
  const windows = mode === "all-seasons" ? HORF_SEASONS : [resolveHorfSeason(mode)].filter((value) => !!value);
  if (!windows.length) throw new Error("Unknown Horf season");
  return { _and: [candidate, { _or: windows.map((season) => ({
    timestamp: { _gte: season.startsAt, ...(season.endsAt ? { _lt: season.endsAt } : {}) },
  })) }] };
}

function safeImage(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri) return null;
  try {
    const url = new URL(normalizeIpfsUri(uri));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function pk(value: unknown): string | null {
  const text = typeof value === "string" ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  return /^\d+$/.test(text) ? BigInt(text).toString() : null;
}

export async function fetchOpenRangeMintPage(
  mode: OpenRangeMode,
  cursor = "0",
  load: (where: ReturnType<typeof openRangeWhere>, cursor: string) => Promise<OpenRangeMint[]> = async (where, after) => {
    const response = await objkt.postJson<{ data?: { token?: OpenRangeMint[] }; errors?: Array<{ message?: string }> }>("", {
      query: HORF_OPEN_RANGE_QUERY,
      variables: { where, cursor: after, pageSize: OBJKT_PAGE_SIZE },
    });
    if (response.errors?.length || !Array.isArray(response.data?.token)) {
      throw new Error(`Objkt mint index failed: ${response.errors?.map((error) => error.message).join("; ") || "invalid page"}`);
    }
    return response.data.token;
  },
) {
  if (!/^\d+$/.test(cursor)) throw new Error("Invalid Objkt mint cursor");
  const rows = await load(openRangeWhere(mode), BigInt(cursor).toString());
  if (!Array.isArray(rows)) throw new Error("Objkt mint page is invalid");
  let after = BigInt(cursor);
  const items: OpenRangeItem[] = [];
  for (const row of rows) {
    const current = pk(row.pk);
    if (!current || BigInt(current) <= after) throw new Error("Objkt mint cursor did not advance");
    after = BigInt(current);
    if (row.fa_contract === horseContractAddress()) continue;
    if (typeof row.fa_contract !== "string" || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(row.fa_contract) ||
        typeof row.token_id !== "string" || !/^\d+$/.test(row.token_id) ||
        (row.decimals != null && row.decimals !== 0)) continue;
    const tagNames = (row.tags || []).map((entry) => entry.tag || {});
    if (!tokenQualifies(row, new Set(approvedHorseTags(tagNames)))) continue;
    const time = row.timestamp == null ? null : Date.parse(row.timestamp);
    if (mode !== "all-horse-search" && (time === null || !Number.isFinite(time))) continue;
    const selected = resolveHorfSeason(mode);
    if (selected && (time === null || time < Date.parse(selected.startsAt) ||
        (selected.endsAt && time >= Date.parse(selected.endsAt)))) continue;
    if (mode === "all-seasons" && (time === null || !HORF_SEASONS.some((season) =>
      time >= Date.parse(season.startsAt) && (!season.endsAt || time < Date.parse(season.endsAt))))) continue;
    items.push({ contract: row.fa_contract, tokenId: BigInt(row.token_id).toString(),
      name: String(row.name || `Token #${row.token_id}`).trim() || `Token #${row.token_id}`,
      description: typeof row.description === "string" ? row.description : null,
      image: safeImage(row.thumbnail_uri || row.display_uri),
      mintedAt: time === null || !Number.isFinite(time) ? null : new Date(time).toISOString(),
      creatorAddress: null });
  }
  return { items, nextCursor: rows.length ? after.toString() : null,
    hasMore: rows.length === OBJKT_PAGE_SIZE, asOf: new Date().toISOString(),
    sourceRows: rows.length };
}

const pageCache = new Map<string, { expiresAt: number; value: Promise<Awaited<ReturnType<typeof fetchOpenRangeMintPage>>> }>();
/** Public refreshes reuse one Objkt source page during Horf's Mainnet block cadence. */
export function cachedOpenRangeMintPage(mode: OpenRangeMode, cursor: string) {
  const now = Date.now();
  for (const [key, row] of pageCache) if (row.expiresAt <= now) pageCache.delete(key);
  const key = `${mode}/${cursor}`;
  const cached = pageCache.get(key);
  if (cached) return cached.value;
  const value = fetchOpenRangeMintPage(mode, cursor);
  pageCache.set(key, { expiresAt: now + HORF_MAINNET_BLOCK_MS, value });
  value.catch(() => { if (pageCache.get(key)?.value === value) pageCache.delete(key); });
  return value;
}
