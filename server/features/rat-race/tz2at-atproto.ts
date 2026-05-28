import { EXTERNAL_MARKETPLACE_CONTRACTS } from "@shared/external-marketplaces";
import type { RatRaceSourceFreshness } from "@shared/tezos-intel";
import { objkt, tz2atAtproto, tz2atRelay, type UpstreamClient } from "../../lib/upstream";
import type { RatRaceCandidateRow, RatRaceFilter } from "./hot-tokens";

const TZ2AT_REPO_DID =
  process.env.TZ2AT_ATPROTO_REPO_DID || "did:plc:yz5lcmeid4toa3saotz44356";
const TZ2AT_COLLECT_COLLECTION = "xyz.tz2at.marketplace.collect";
const TZ2AT_FA2_TRANSFER_COLLECTION = "xyz.tz2at.fa2.transfer";
const TZ2AT_RECORD_PAGE_LIMIT = 100;
const DEFAULT_MAX_COLLECT_RECORDS = 500;
const DEFAULT_MAX_TRANSFER_RECORDS = 500;
const MAX_OBJKT_REFS = 180;
const DEFAULT_REPLAY_CHUNK_BLOCKS = 500;
const DEFAULT_MAX_REPLAY_BLOCKS = 14_400;

const MARKETPLACE_ADDRESSES = new Set(EXTERNAL_MARKETPLACE_CONTRACTS.map((contract) => contract.address));

type JsonClient = Pick<UpstreamClient, "getJson" | "postJson">;

export type Tz2atRepoRecord<T> = {
  uri?: string | null;
  cid?: string | null;
  value?: T | null;
};

type Tz2atListRecordsResponse<T> = {
  cursor?: string | null;
  records?: Tz2atRepoRecord<T>[] | null;
};

export type Tz2atCollectRecord = {
  $type?: string;
  buyer?: string | null;
  seller?: string | null;
  amount?: string | number | null;
  network?: string | null;
  tokenId?: string | number | null;
  tokenContract?: string | null;
  tokenRef?: string | null;
  timestamp?: string | null;
  blockLevel?: number | string | null;
  entrypoint?: string | null;
  priceMutez?: string | number | null;
  marketplace?: string | null;
  operationHash?: string | null;
  subjectAddresses?: unknown;
};

export type Tz2atFa2TransferRecord = {
  $type?: string;
  from?: string | null;
  to?: string | null;
  amount?: string | number | null;
  network?: string | null;
  tokenId?: string | number | null;
  contract?: string | null;
  tokenRef?: string | null;
  timestamp?: string | null;
  operationHash?: string | null;
};

export type NormalizedCollect = {
  buyer: string;
  seller: string | null;
  amount: number;
  tokenId: string;
  tokenContract: string | null;
  timestamp: string;
  priceMutez: string | null;
  marketplace: string;
  operationHash: string;
  subjectAddresses: string[];
};

export type NormalizedTransfer = {
  from: string | null;
  to: string | null;
  amount: number;
  tokenId: string;
  tokenContract: string;
  timestamp: string | null;
  operationHash: string;
};

type TokenRef = {
  tokenContract: string;
  tokenId: string;
};

type ObjktTokenRow = {
  fa_contract?: string | null;
  token_id?: string | number | null;
  name?: string | null;
  display_uri?: string | null;
  thumbnail_uri?: string | null;
  artifact_uri?: string | null;
  supply?: string | number | null;
  timestamp?: string | null;
  creators?: Array<{ creator_address?: string | null } | null> | null;
};

type ObjktListingRow = {
  id?: string | number | null;
  price?: string | number | null;
  amount_left?: string | number | null;
  status?: string | null;
  seller_address?: string | null;
  marketplace_contract?: string | null;
  timestamp?: string | null;
  token?: {
    fa_contract?: string | null;
    token_id?: string | number | null;
  } | null;
};

type ObjktRatRaceResponse = {
  data?: {
    token?: ObjktTokenRow[] | null;
    listing?: ObjktListingRow[] | null;
  } | null;
  errors?: Array<{ message?: string | null }> | null;
};

type Tz2atHealthResponse = {
  ok?: boolean | null;
  rollingIndexer?: {
    lastLevel?: number | string | null;
    headLevel?: number | string | null;
    headLagBlocks?: number | string | null;
    maxHeadLagBlocks?: number | string | null;
    updatedAt?: string | null;
    ageMs?: number | string | null;
    maxStaleMs?: number | string | null;
    ok?: boolean | null;
    state?: string | null;
  } | null;
};

type Tz2atReplayEvent<T> = {
  event?: T | null;
};

type Tz2atReplayRecordsResult<T> = {
  records: Tz2atRepoRecord<T>[];
  freshness: RatRaceSourceFreshness | null;
};

type HydratedToken = {
  token?: ObjktTokenRow;
  listings: ObjktListingRow[];
};

export type Tz2atRatRaceRowsResult = {
  source: "tz2at-replay" | "tz2at-atproto";
  rows: RatRaceCandidateRow[];
  sourceFreshness?: RatRaceSourceFreshness | null;
};

function refKey(ref: TokenRef): string {
  return `${ref.tokenContract}:${ref.tokenId}`;
}

function numberFrom(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function trimString(value: unknown): string {
  return String(value ?? "").trim();
}

function isKt1Address(value: string): boolean {
  return /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
}

function isValidIsoish(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function transferKey(operationHash: string, tokenId: string): string {
  return `${operationHash}:${tokenId}`;
}

function tokenContractFromRef(tokenRef: unknown): string | null {
  const value = trimString(tokenRef);
  const match = /^tezos:[^:]+:(KT1[1-9A-HJ-NP-Za-km-z]{33}):token:[^:]+$/.exec(value);
  return match?.[1] ?? null;
}

export function normalizeTz2atCollectRecord(record: Tz2atRepoRecord<Tz2atCollectRecord>): NormalizedCollect | null {
  const value = record.value;
  if (!value) return null;
  const tokenId = trimString(value.tokenId);
  const tokenContract = trimString(value.tokenContract) || tokenContractFromRef(value.tokenRef);
  const timestamp = trimString(value.timestamp);
  const buyer = trimString(value.buyer);
  const seller = trimString(value.seller) || null;
  const marketplace = trimString(value.marketplace);
  const operationHash = trimString(value.operationHash);
  if (!tokenId || !timestamp || !isValidIsoish(timestamp) || !buyer || !marketplace || !operationHash) {
    return null;
  }

  const subjectAddresses = Array.isArray(value.subjectAddresses)
    ? value.subjectAddresses.map(trimString).filter(Boolean)
    : [];

  const priceMutez = value.priceMutez == null ? null : trimString(value.priceMutez);
  return {
    buyer,
    seller,
    amount: Math.max(1, Math.floor(numberFrom(value.amount, 1))),
    tokenId,
    tokenContract,
    timestamp,
    priceMutez: priceMutez && /^[0-9]+$/.test(priceMutez) ? priceMutez : null,
    marketplace,
    operationHash,
    subjectAddresses,
  };
}

export function normalizeTz2atTransferRecord(record: Tz2atRepoRecord<Tz2atFa2TransferRecord>): NormalizedTransfer | null {
  const value = record.value;
  if (!value) return null;
  const tokenId = trimString(value.tokenId);
  const tokenContract = trimString(value.contract) || tokenContractFromRef(value.tokenRef);
  const operationHash = trimString(value.operationHash);
  if (!tokenId || !tokenContract || !operationHash) return null;

  return {
    from: trimString(value.from) || null,
    to: trimString(value.to) || null,
    amount: Math.max(1, Math.floor(numberFrom(value.amount, 1))),
    tokenId,
    tokenContract,
    timestamp: value.timestamp && isValidIsoish(String(value.timestamp)) ? String(value.timestamp) : null,
    operationHash,
  };
}

async function listTz2atRecords<T>(
  collection: string,
  maxRecords: number,
  client: JsonClient = tz2atAtproto
): Promise<Tz2atRepoRecord<T>[]> {
  const records: Tz2atRepoRecord<T>[] = [];
  let cursor: string | undefined;
  while (records.length < maxRecords) {
    const limit = Math.min(TZ2AT_RECORD_PAGE_LIMIT, maxRecords - records.length);
    const response = await client.getJson<Tz2atListRecordsResponse<T>>("/com.atproto.repo.listRecords", {
      repo: TZ2AT_REPO_DID,
      collection,
      limit,
      cursor,
    });
    const page = response.records ?? [];
    records.push(...page);
    cursor = response.cursor || undefined;
    if (!cursor || page.length === 0) break;
  }
  return records;
}

function replayBlocksForFilter(filter: RatRaceFilter): number {
  const requested = Number(process.env.RAT_RACE_TZ2AT_REPLAY_BLOCKS);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.min(86_400, Math.floor(requested));
  }
  const estimatedWindowBlocks = Math.ceil(Math.max(1, filter.windowHours) * 600);
  return Math.min(DEFAULT_MAX_REPLAY_BLOCKS, estimatedWindowBlocks);
}

function replayChunkBlocks(): number {
  const requested = Number(process.env.RAT_RACE_TZ2AT_REPLAY_CHUNK_BLOCKS);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.max(25, Math.min(1_000, Math.floor(requested)));
  }
  return DEFAULT_REPLAY_CHUNK_BLOCKS;
}

function nullableNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function replayFreshnessFromHealth(health: Tz2atHealthResponse): RatRaceSourceFreshness | null {
  const rollingIndexer = health.rollingIndexer;
  if (!rollingIndexer) return null;
  return {
    ok: rollingIndexer.ok ?? health.ok ?? null,
    state: trimString(rollingIndexer.state) || null,
    lastLevel: nullableNumber(rollingIndexer.lastLevel),
    headLevel: nullableNumber(rollingIndexer.headLevel),
    headLagBlocks: nullableNumber(rollingIndexer.headLagBlocks),
    maxHeadLagBlocks: nullableNumber(rollingIndexer.maxHeadLagBlocks),
    updatedAt: trimString(rollingIndexer.updatedAt) || null,
    ageMs: nullableNumber(rollingIndexer.ageMs),
    maxStaleMs: nullableNumber(rollingIndexer.maxStaleMs),
  };
}

function replayFreshnessIsStale(freshness: RatRaceSourceFreshness | null): boolean {
  if (!freshness) return false;
  if (freshness.ok === false) return true;
  if (
    freshness.headLagBlocks !== null &&
    freshness.maxHeadLagBlocks !== null &&
    freshness.headLagBlocks > freshness.maxHeadLagBlocks
  ) {
    return true;
  }
  if (freshness.ageMs !== null && freshness.maxStaleMs !== null && freshness.ageMs > freshness.maxStaleMs) {
    return true;
  }
  return false;
}

async function listTz2atReplayEvents<T>(
  filter: RatRaceFilter,
  client: JsonClient = tz2atRelay
): Promise<Tz2atReplayRecordsResult<T>> {
  const health = await client.getJson<Tz2atHealthResponse>("/health");
  const freshness = replayFreshnessFromHealth(health);
  const headLevel = Math.floor(
    numberFrom(health.rollingIndexer?.lastLevel ?? health.rollingIndexer?.headLevel, 0)
  );
  if (!headLevel || replayFreshnessIsStale(freshness)) return { records: [], freshness };

  const replayBlocks = replayBlocksForFilter(filter);
  const chunkBlocks = replayChunkBlocks();
  const fromLevel = Math.max(0, headLevel - replayBlocks);
  const ranges: Array<{ fromLevel: number; toLevel: number }> = [];
  for (let toLevel = headLevel; toLevel > fromLevel; toLevel -= chunkBlocks) {
    ranges.push({ fromLevel: Math.max(fromLevel, toLevel - chunkBlocks + 1), toLevel });
  }

  const pages = await Promise.all(
    ranges.map((range) =>
      client.getJson<Array<Tz2atReplayEvent<T>>>("/replay", {
        fromLevel: range.fromLevel,
        toLevel: range.toLevel,
      })
    )
  );

  const records = new Map<string, Tz2atRepoRecord<T>>();
  for (const page of pages) {
    for (const item of Array.isArray(page) ? page : []) {
      const value = item.event;
      if (!value) continue;
      const raw = value as Record<string, unknown>;
      const key = [
        raw.$type,
        raw.blockHash,
        raw.operationHash,
        raw.operationGroupIndex,
        raw.operationIndex,
        raw.eventIndex,
        raw.tokenContract ?? raw.contract,
        raw.tokenId,
      ]
        .map((part) => trimString(part))
        .join(":");
      records.set(key, { value });
    }
  }
  return { records: Array.from(records.values()), freshness };
}

function candidateRefsForCollect(
  collect: NormalizedCollect,
  transferBySale: Map<string, NormalizedTransfer>
): TokenRef[] {
  if (collect.tokenContract) {
    return [{ tokenContract: collect.tokenContract, tokenId: collect.tokenId }];
  }
  const transfer = transferBySale.get(transferKey(collect.operationHash, collect.tokenId));
  if (transfer?.tokenContract) {
    return [{ tokenContract: transfer.tokenContract, tokenId: collect.tokenId }];
  }

  const candidates = new Set<string>();
  for (const address of collect.subjectAddresses) {
    if (!isKt1Address(address)) continue;
    if (address === collect.marketplace) continue;
    if (MARKETPLACE_ADDRESSES.has(address)) continue;
    candidates.add(address);
  }
  return Array.from(candidates).map((tokenContract) => ({ tokenContract, tokenId: collect.tokenId }));
}

function buildObjktRatRaceQuery(refs: TokenRef[]) {
  return {
    query: `query WtfRatRaceTokens($refs: [token_bool_exp!]!, $listingLimit: Int!) {
      token(where: { _or: $refs }, limit: 200) {
        fa_contract
        token_id
        name
        display_uri
        thumbnail_uri
        artifact_uri
        supply
        timestamp
        creators { creator_address }
      }
      listing(
        where: {
          token: { _or: $refs }
          status: { _eq: "active" }
        }
        limit: $listingLimit
        order_by: [{ price: asc }, { timestamp: asc }]
      ) {
        id
        price
        amount_left
        status
        seller_address
        marketplace_contract
        timestamp
        token { fa_contract token_id }
      }
    }`,
    variables: {
      refs: refs.map((ref) => ({
        fa_contract: { _eq: ref.tokenContract },
        token_id: { _eq: ref.tokenId },
      })),
      listingLimit: Math.max(1, refs.length * 20),
    },
  };
}

async function hydrateObjktRefs(refs: TokenRef[], client: JsonClient = objkt): Promise<Map<string, HydratedToken>> {
  const hydrated = new Map<string, HydratedToken>();
  const uniqueRefs = Array.from(new Map(refs.map((ref) => [refKey(ref), ref])).values()).slice(0, MAX_OBJKT_REFS);
  for (let i = 0; i < uniqueRefs.length; i += 40) {
    const chunk = uniqueRefs.slice(i, i + 40);
    const response = await client.postJson<ObjktRatRaceResponse>("", buildObjktRatRaceQuery(chunk));
    if (response.errors?.length) {
      const first = response.errors[0]?.message || "unknown";
      throw new Error(`Objkt Rat Race GraphQL error: ${first}`);
    }
    for (const token of response.data?.token ?? []) {
      const tokenContract = trimString(token.fa_contract);
      const tokenId = trimString(token.token_id);
      if (!tokenContract || !tokenId) continue;
      const key = refKey({ tokenContract, tokenId });
      hydrated.set(key, { ...(hydrated.get(key) ?? { listings: [] }), token });
    }
    for (const listing of response.data?.listing ?? []) {
      const tokenContract = trimString(listing.token?.fa_contract);
      const tokenId = trimString(listing.token?.token_id);
      if (!tokenContract || !tokenId) continue;
      const key = refKey({ tokenContract, tokenId });
      const current = hydrated.get(key) ?? { listings: [] };
      current.listings.push(listing);
      hydrated.set(key, current);
    }
  }
  return hydrated;
}

function chooseTokenRef(
  collect: NormalizedCollect,
  refs: TokenRef[],
  hydrated: Map<string, HydratedToken>
): TokenRef | null {
  if (refs.length === 0) return null;
  const withMetadata = refs.find((ref) => hydrated.get(refKey(ref))?.token);
  if (withMetadata) return withMetadata;
  if (refs.length === 1) return refs[0] ?? null;
  const withListing = refs.find((ref) => (hydrated.get(refKey(ref))?.listings.length ?? 0) > 0);
  if (withListing) return withListing;
  const ktSubjects = collect.subjectAddresses.filter(isKt1Address);
  const lastKtSubject = ktSubjects[ktSubjects.length - 1];
  return refs.find((ref) => ref.tokenContract === lastKtSubject) ?? null;
}

export async function buildTz2atAtprotoRatRaceRows(
  collects: NormalizedCollect[],
  transfers: NormalizedTransfer[],
  filter: RatRaceFilter,
  hydrated: Map<string, HydratedToken>
): Promise<RatRaceCandidateRow[]> {
  const transferBySale = new Map(transfers.map((transfer) => [transferKey(transfer.operationHash, transfer.tokenId), transfer]));
  const candidateRefs = new Map<string, TokenRef[]>();
  for (const collect of collects) {
    candidateRefs.set(transferKey(collect.operationHash, collect.tokenId), candidateRefsForCollect(collect, transferBySale));
  }

  type Aggregate = {
    ref: TokenRef;
    saleCount: number;
    soldEditions: number;
    recentSaleCount: number;
    recentEditionsSold: number;
    lastSaleAt: string | null;
  };

  const recentCutoffMs = filter.now.getTime() - Math.max(1, filter.windowHours) * 3_600_000;
  const aggregates = new Map<string, Aggregate>();
  for (const collect of collects) {
    const refs = candidateRefs.get(transferKey(collect.operationHash, collect.tokenId)) ?? [];
    const ref = chooseTokenRef(collect, refs, hydrated);
    if (!ref) continue;
    const transfer = transferBySale.get(transferKey(collect.operationHash, collect.tokenId));
    const amount = Math.max(1, transfer?.amount ?? collect.amount);
    const key = refKey(ref);
    const aggregate = aggregates.get(key) ?? {
      ref,
      saleCount: 0,
      soldEditions: 0,
      recentSaleCount: 0,
      recentEditionsSold: 0,
      lastSaleAt: null,
    };
    aggregate.saleCount += 1;
    aggregate.soldEditions += amount;
    if (!aggregate.lastSaleAt || new Date(collect.timestamp).getTime() > new Date(aggregate.lastSaleAt).getTime()) {
      aggregate.lastSaleAt = collect.timestamp;
    }
    if (new Date(collect.timestamp).getTime() >= recentCutoffMs) {
      aggregate.recentSaleCount += 1;
      aggregate.recentEditionsSold += amount;
    }
    aggregates.set(key, aggregate);
  }

  const rows: RatRaceCandidateRow[] = [];
  for (const aggregate of aggregates.values()) {
    const hydration = hydrated.get(refKey(aggregate.ref));
    const listings = (hydration?.listings ?? []).filter((listing) => String(listing.status || "").toLowerCase() === "active");
    if (listings.length === 0) continue;

    const token = hydration?.token;
    const supply = token?.supply == null ? null : Math.floor(numberFrom(token.supply, 0));
    const knownSupply = supply && supply > 0 ? supply : null;
    const activeListingEditions = listings.reduce((sum, listing) => sum + Math.max(1, Math.floor(numberFrom(listing.amount_left, 1))), 0);
    const soldBySupply = knownSupply ? Math.max(0, knownSupply - activeListingEditions) : 0;
    const observedSoldEditions = Math.max(aggregate.soldEditions, soldBySupply);
    const soldEditions = knownSupply ? Math.min(knownSupply, observedSoldEditions) : observedSoldEditions;
    const floorListing = listings.reduce<ObjktListingRow | null>((best, listing) => {
      if (!best) return listing;
      return numberFrom(listing.price, Number.MAX_SAFE_INTEGER) < numberFrom(best.price, Number.MAX_SAFE_INTEGER) ? listing : best;
    }, null);
    const firstListedAt = listings
      .map((listing) => listing.timestamp)
      .filter((timestamp): timestamp is string => Boolean(timestamp && isValidIsoish(timestamp)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
    const thumbnail = token?.thumbnail_uri || token?.display_uri || token?.artifact_uri || null;

    rows.push({
      token_contract: aggregate.ref.tokenContract,
      token_id: aggregate.ref.tokenId,
      token_name: token?.name || null,
      token_thumbnail: thumbnail,
      creator_address: token?.creators?.find(Boolean)?.creator_address || null,
      metadata_supply: knownSupply,
      minted_editions: knownSupply,
      minted_at: token?.timestamp || null,
      first_listed_at: firstListedAt,
      last_sale_at: aggregate.lastSaleAt,
      sale_count: aggregate.saleCount,
      sold_editions: soldEditions,
      primary_sold_editions: soldEditions,
      recent_sale_count: aggregate.recentSaleCount,
      recent_editions_sold: aggregate.recentEditionsSold,
      active_listing_count: listings.length,
      floor_mutez: floorListing?.price == null ? null : String(floorListing.price),
      listing_id: floorListing?.id == null ? null : String(floorListing.id),
      marketplace_contract: floorListing?.marketplace_contract || null,
      listing_price_mutez: floorListing?.price == null ? null : String(floorListing.price),
    });
  }
  return rows;
}

export async function loadTz2atAtprotoRatRaceRows(
  filter: RatRaceFilter,
  deps: { tz2atClient?: JsonClient; objktClient?: JsonClient } = {}
): Promise<RatRaceCandidateRow[]> {
  const result = await loadTz2atRatRaceRows(filter, deps);
  return result.rows;
}

export async function loadTz2atRatRaceRows(
  filter: RatRaceFilter,
  deps: { tz2atClient?: JsonClient; objktClient?: JsonClient } = {}
): Promise<Tz2atRatRaceRowsResult> {
  if (process.env.RAT_RACE_TZ2AT_ATPROTO_ENABLED === "0") return { source: "tz2at-replay", rows: [] };
  try {
    const replayResult = await loadTz2atReplayRatRaceRowsWithFreshness(filter, deps);
    return { source: "tz2at-replay", rows: replayResult.rows, sourceFreshness: replayResult.sourceFreshness };
  } catch (err) {
    console.warn("[rat-race] tz2at replay fallback failed:", err);
  }

  const maxCollectRecords = Math.max(1, Math.min(1000, Number(process.env.RAT_RACE_TZ2AT_COLLECT_LIMIT || DEFAULT_MAX_COLLECT_RECORDS)));
  const maxTransferRecords = Math.max(1, Math.min(1000, Number(process.env.RAT_RACE_TZ2AT_TRANSFER_LIMIT || DEFAULT_MAX_TRANSFER_RECORDS)));
  const [collectRecords, transferRecords] = await Promise.all([
    listTz2atRecords<Tz2atCollectRecord>(TZ2AT_COLLECT_COLLECTION, maxCollectRecords, deps.tz2atClient),
    listTz2atRecords<Tz2atFa2TransferRecord>(TZ2AT_FA2_TRANSFER_COLLECTION, maxTransferRecords, deps.tz2atClient),
  ]);
  const collects = collectRecords.map(normalizeTz2atCollectRecord).filter((record): record is NormalizedCollect => Boolean(record));
  const transfers = transferRecords.map(normalizeTz2atTransferRecord).filter((record): record is NormalizedTransfer => Boolean(record));
  const transferBySale = new Map(transfers.map((transfer) => [transferKey(transfer.operationHash, transfer.tokenId), transfer]));
  const refs = collects.flatMap((collect) => candidateRefsForCollect(collect, transferBySale));
  if (refs.length === 0) return { source: "tz2at-atproto", rows: [] };
  const hydrated = await hydrateObjktRefs(refs, deps.objktClient);
  return { source: "tz2at-atproto", rows: await buildTz2atAtprotoRatRaceRows(collects, transfers, filter, hydrated) };
}

export async function loadTz2atReplayRatRaceRows(
  filter: RatRaceFilter,
  deps: { tz2atClient?: JsonClient; objktClient?: JsonClient } = {}
): Promise<RatRaceCandidateRow[]> {
  return (await loadTz2atReplayRatRaceRowsWithFreshness(filter, deps)).rows;
}

async function loadTz2atReplayRatRaceRowsWithFreshness(
  filter: RatRaceFilter,
  deps: { tz2atClient?: JsonClient; objktClient?: JsonClient } = {}
): Promise<{ rows: RatRaceCandidateRow[]; sourceFreshness: RatRaceSourceFreshness | null }> {
  const replayResult = await listTz2atReplayEvents<Tz2atCollectRecord | Tz2atFa2TransferRecord>(filter, deps.tz2atClient ?? tz2atRelay);
  const replayRecords = replayResult.records;
  const collectRecords = replayRecords.filter((record) => record.value?.$type === TZ2AT_COLLECT_COLLECTION) as Tz2atRepoRecord<Tz2atCollectRecord>[];
  const transferRecords = replayRecords.filter((record) => record.value?.$type === TZ2AT_FA2_TRANSFER_COLLECTION) as Tz2atRepoRecord<Tz2atFa2TransferRecord>[];
  const collects = collectRecords.map(normalizeTz2atCollectRecord).filter((record): record is NormalizedCollect => Boolean(record));
  const transfers = transferRecords.map(normalizeTz2atTransferRecord).filter((record): record is NormalizedTransfer => Boolean(record));
  const transferBySale = new Map(transfers.map((transfer) => [transferKey(transfer.operationHash, transfer.tokenId), transfer]));
  const refs = collects.flatMap((collect) => candidateRefsForCollect(collect, transferBySale));
  if (refs.length === 0) return { rows: [], sourceFreshness: replayResult.freshness };
  const hydrated = await hydrateObjktRefs(refs, deps.objktClient);
  return {
    rows: await buildTz2atAtprotoRatRaceRows(collects, transfers, filter, hydrated),
    sourceFreshness: replayResult.freshness,
  };
}
