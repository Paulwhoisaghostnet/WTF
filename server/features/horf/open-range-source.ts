import { objkt } from "../../lib/upstream";
import { approvedHorseTags, HORF_CANDIDATE_REGEX, horseTagEvidence, type ObjktToken } from "./model";
import { HORF_CURRENT_SEASON_KEY, HORF_SEASONS, resolveHorfSeason } from "./seasons";
import { OBJKT_PAGE_SIZE } from "./source";
import { horseContractAddress } from "./horse-config";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";

export const HORF_OPEN_RANGE_QUERY = `query HorfOpenRange($where: token_bool_exp!, $cursor: bigint!, $pageSize: Int!) {
  token(where: { _and: [$where, { pk: { _gt: $cursor } }] }, order_by: { pk: asc }, limit: $pageSize) {
    pk fa_contract token_id timestamp name description decimals thumbnail_uri display_uri artifact_uri mime
    tags { tag { name token_count } }
  }
}`;

// Objkt's PK ordering times out when combined with older timestamp ranges.
// Timestamp-first ordering uses its date index and keeps historical pages fast.
export const HORF_OPEN_RANGE_TIME_QUERY = `query HorfOpenRangeByTime($where: token_bool_exp!, $pageSize: Int!) {
  token(where: $where, order_by: [{ timestamp: asc }, { pk: asc }], limit: $pageSize) {
    pk fa_contract token_id timestamp name description decimals thumbnail_uri display_uri artifact_uri mime
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
  artifactUri: string | null;
  mime: string | null;
  mintedAt: string | null;
  creatorAddress: null;
  eligibility: "auto" | "marshal-review";
}

export type OpenRangeMode = "all-seasons" | "all-horse-search" | string;

function timeOrdered(mode: OpenRangeMode) {
  return mode !== "all-horse-search" && mode !== HORF_CURRENT_SEASON_KEY;
}

function timeCursor(cursor: string): { timestamp: string; pk: string } | null {
  if (cursor === "0") return null;
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\|(\d+)$/.exec(cursor);
  if (!match || !Number.isFinite(Date.parse(match[1])) || new Date(match[1]).toISOString() !== match[1]) {
    throw new Error("Invalid Objkt mint cursor");
  }
  return { timestamp: match[1], pk: BigInt(match[2]).toString() };
}

export function validOpenRangeCursor(mode: OpenRangeMode, cursor: string): boolean {
  if (!timeOrdered(mode)) return /^\d+$/.test(cursor);
  try { timeCursor(cursor); return true; } catch { return false; }
}

export function openRangeWhere(mode: OpenRangeMode, cursor = "0") {
  // Explicit mint tags qualify regardless of group size. The postfilter
  // applies the >5 rule to broader equine tag groups.
  const candidate = { tags: { tag: { name: { _iregex: HORF_CANDIDATE_REGEX } } } };
  if (mode === "all-horse-search") return candidate;
  const selected = resolveHorfSeason(mode);
  if (mode !== "all-seasons" && !selected) throw new Error("Unknown Horf season");
  const first = selected || HORF_SEASONS[0];
  const filters: Record<string, unknown>[] = [candidate, {
    timestamp: { _gte: first.startsAt, ...(selected?.endsAt ? { _lt: selected.endsAt } : {}) },
  }];
  if (timeOrdered(mode)) {
    const after = timeCursor(cursor);
    if (after) filters.push({ _or: [
      { timestamp: { _gt: after.timestamp } },
      { _and: [{ timestamp: { _eq: after.timestamp } }, { pk: { _gt: after.pk } }] },
    ] });
  }
  return { _and: filters };
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
  load: (where: ReturnType<typeof openRangeWhere>, cursor: string, mode: OpenRangeMode) => Promise<OpenRangeMint[]> = async (where, after, selectedMode) => {
    const response = await objkt.postJson<{ data?: { token?: OpenRangeMint[] }; errors?: Array<{ message?: string }> }>("", {
      query: timeOrdered(selectedMode) ? HORF_OPEN_RANGE_TIME_QUERY : HORF_OPEN_RANGE_QUERY,
      variables: timeOrdered(selectedMode)
        ? { where, pageSize: OBJKT_PAGE_SIZE }
        : { where, cursor: after, pageSize: OBJKT_PAGE_SIZE },
    });
    if (response.errors?.length || !Array.isArray(response.data?.token)) {
      throw new Error(`Objkt mint index failed: ${response.errors?.map((error) => error.message).join("; ") || "invalid page"}`);
    }
    return response.data.token;
  },
) {
  if (!validOpenRangeCursor(mode, cursor)) throw new Error("Invalid Objkt mint cursor");
  const byTime = timeOrdered(mode);
  const rows = await load(openRangeWhere(mode, cursor), byTime ? cursor : BigInt(cursor).toString(), mode);
  if (!Array.isArray(rows)) throw new Error("Objkt mint page is invalid");
  let after = byTime ? 0n : BigInt(cursor);
  let lastTime = byTime ? timeCursor(cursor)?.timestamp || null : null;
  const items: OpenRangeItem[] = [];
  for (const row of rows) {
    const current = pk(row.pk);
    const rowTime = row.timestamp == null ? NaN : Date.parse(row.timestamp);
    if (!current || (byTime
      ? !Number.isFinite(rowTime) || (lastTime !== null &&
        (rowTime < Date.parse(lastTime) || (rowTime === Date.parse(lastTime) && BigInt(current) <= after)))
      : BigInt(current) <= after)) throw new Error("Objkt mint cursor did not advance");
    after = BigInt(current);
    if (byTime) lastTime = new Date(rowTime).toISOString();
    if (row.fa_contract === horseContractAddress()) continue;
    if (typeof row.fa_contract !== "string" || !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(row.fa_contract) ||
        typeof row.token_id !== "string" || !/^\d+$/.test(row.token_id) ||
        (row.decimals != null && row.decimals !== 0)) continue;
    const tagNames = (row.tags || []).map((entry) => entry.tag || {});
    const evidence = horseTagEvidence(row, new Set(approvedHorseTags(tagNames)));
    if (evidence === "none") continue;
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
      artifactUri: safeImage(row.artifact_uri),
      mime: typeof row.mime === "string" ? row.mime.trim().toLowerCase() || null : null,
      mintedAt: time === null || !Number.isFinite(time) ? null : new Date(time).toISOString(),
      creatorAddress: null, eligibility: evidence === "horse" ? "auto" : "marshal-review" });
  }
  return { items, nextCursor: rows.length ? (byTime ? `${lastTime}|${after}` : after.toString()) : null,
    hasMore: rows.length === OBJKT_PAGE_SIZE, asOf: new Date().toISOString(),
    sourceRows: rows.length, mediaVersion: 1 as const };
}
