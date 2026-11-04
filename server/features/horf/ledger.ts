import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../db";
import {
  normalizeHorfTransfer,
  summarizeSeason,
  type HorfTransfer,
} from "./model";
import { HORF_ALL_TIME_SEASON, HORF_SEASONS, HORF_SEASON_CHOICES, type HorfSeason } from "./seasons";
import {
  discoverApprovedHorseTags,
  fetchHorfEventPage,
  hasCandidateMetadataUpdate,
  isLastHorfEventPage,
} from "./source";
import { getStableClaimSnapshot } from "./stable-ledger";
import { getHorseMarketSaleSnapshot } from "./horse-market/sale-ledger";
import { getHorfObjktPurchaseSnapshot } from "./horse-market/objkt-intents";
import { horseContractAddress } from "./horse-config";
import { HORF_MAINNET_BLOCK_MS } from "./mainnet";

// Tezos mainnet's Tallinn block interval is six seconds. Objkt offers no
// subscription, so one source scan per block is shared across all viewers.
const MAINNET_BLOCK_MS = HORF_MAINNET_BLOCK_MS;
export function horfLedgerPolicyVersion(): string {
  // A classifier change or reward-token change must replay every season so
  // false positives leave the race, trade debts, and reward entitlements.
  return `3:${horseContractAddress() ?? ""}`;
}
const PUBLIC_SYNC_ERROR = "The horse trade index is temporarily unavailable. Last completed data is shown when available.";

interface SyncState {
  season_start: Date;
  season_end: Date | null;
  cursor: string;
  status: "ready" | "syncing" | "error";
  as_of: Date | null;
  error: string | null;
  approved_tags: string[];
  run_id: string | null;
  rescan: boolean;
  policy_version: string;
  updated_at: Date;
}

interface StoredTransfer {
  event_id: string;
  operation_hash: string | null;
  occurred_at: Date;
  from_address: string;
  to_address: string;
  amount: string;
  token_contract: string;
  token_id: string;
  token_name: string;
  token_image: string | null;
}

interface GiftSettlement {
  operation_hash: string;
  from_address: string;
  to_address: string;
  token_contract: string;
  token_id: string;
  amount: string;
}

const runningSyncs = new Map<string, Promise<void>>();

function lockKey(season: HorfSeason): string {
  return `horf:${season.startsAt}:mainnet`;
}

function boundaryChanged(state: SyncState, season: HorfSeason): boolean {
  const oldEnd = state.season_end ? new Date(state.season_end).toISOString() : null;
  return oldEnd !== season.endsAt;
}

function safeNumber(value: string | number, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid ${label} in Horf ledger`);
  }
  return number;
}

async function getOrCreateState(season: HorfSeason, client?: PoolClient): Promise<SyncState> {
  const insert = `INSERT INTO public.horf_season_sync (season_start, season_end)
     VALUES ($1::timestamptz, $2::timestamptz)
     ON CONFLICT (season_start) DO NOTHING`;
  if (client) await client.query(insert, [season.startsAt, season.endsAt]);
  else await pool.query(insert, [season.startsAt, season.endsAt]);
  const select = `SELECT season_start, season_end, cursor, status, as_of, error,
            approved_tags, run_id, rescan, policy_version, updated_at
       FROM public.horf_season_sync
      WHERE season_start = $1::timestamptz`;
  const result = client
    ? await client.query<SyncState>(select, [season.startsAt])
    : await pool.query<SyncState>(select, [season.startsAt]);
  const state = result.rows[0];
  if (!state) throw new Error("Horf season sync row is unavailable");
  return state;
}

function tagsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

async function persistPage(
  client: PoolClient,
  season: HorfSeason,
  accepted: HorfTransfer[],
  cursor: number,
  fullRescan: boolean,
  runId: string | null,
  complete: boolean,
): Promise<void> {
  const records = accepted.map((transfer) => ({
    event_id: transfer.id,
    operation_hash: transfer.operationHash ?? null,
    occurred_at: transfer.timestamp,
    from_address: transfer.from,
    to_address: transfer.to,
    amount: transfer.amount,
    token_contract: transfer.token.contract,
    token_id: transfer.token.tokenId,
    token_name: transfer.token.name,
    token_image: transfer.token.image,
  }));
  await client.query("BEGIN");
  try {
    if (records.length) {
      await client.query(
        `INSERT INTO public.horf_transfer_events (
           event_id, season_start, occurred_at, from_address, to_address,
           amount, token_contract, token_id, token_name, token_image,
           operation_hash, last_seen_run
         )
         SELECT x.event_id, $1::timestamptz, x.occurred_at, x.from_address,
                x.to_address, x.amount, x.token_contract, x.token_id,
                x.token_name, x.token_image, x.operation_hash, $3::text
           FROM jsonb_to_recordset($2::jsonb) AS x(
             event_id bigint, occurred_at timestamptz, from_address text,
             to_address text, amount bigint, token_contract text, token_id text,
             token_name text, token_image text, operation_hash text
           )
         ON CONFLICT (event_id) DO UPDATE SET
           season_start = EXCLUDED.season_start,
           occurred_at = EXCLUDED.occurred_at,
           from_address = EXCLUDED.from_address,
           to_address = EXCLUDED.to_address,
           amount = EXCLUDED.amount,
           token_contract = EXCLUDED.token_contract,
           token_id = EXCLUDED.token_id,
           token_name = EXCLUDED.token_name,
           token_image = EXCLUDED.token_image,
           operation_hash = EXCLUDED.operation_hash,
           last_seen_run = EXCLUDED.last_seen_run`,
        [season.startsAt, JSON.stringify(records), runId],
      );
    }
    if (complete) {
      if (fullRescan) {
        await client.query(
          `DELETE FROM public.horf_transfer_events
            WHERE season_start = $1::timestamptz
              AND last_seen_run IS DISTINCT FROM $2::text`,
          [season.startsAt, runId],
        );
      }
      await client.query(
        `UPDATE public.horf_season_sync
            SET cursor = $2::bigint, status = 'ready', as_of = now(),
                error = NULL, run_id = NULL, rescan = false, updated_at = now()
          WHERE season_start = $1::timestamptz`,
        [season.startsAt, cursor],
      );
    } else {
      await client.query(
        `UPDATE public.horf_season_sync
            SET cursor = $2::bigint, updated_at = now()
          WHERE season_start = $1::timestamptz`,
        [season.startsAt, cursor],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function syncSeason(season: HorfSeason): Promise<void> {
  const client = await pool.connect();
  let locked = false;
  const advisoryKey = lockKey(season);
  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired",
      [advisoryKey],
    );
    locked = lockResult.rows[0]?.acquired === true;
    if (!locked) return;

    const state = await getOrCreateState(season, client);
    const approvedTags = await discoverApprovedHorseTags();
    const priorTags = Array.isArray(state.approved_tags) ? [...state.approved_tags].sort() : [];
    const changedTags = !tagsEqual(priorTags, approvedTags);
    const currentPolicy = horfLedgerPolicyVersion();
    const changedPolicy = state.policy_version !== currentPolicy;
    const changedBoundary = boundaryChanged(state, season);
    const metadataChanged = !changedTags && !changedPolicy && !changedBoundary && state.as_of
      ? await hasCandidateMetadataUpdate(new Date(state.as_of).toISOString())
      : false;
    const resumeRescan = state.rescan && !!state.run_id && !changedTags && !changedPolicy && !changedBoundary && !metadataChanged;
    const fullRescan = resumeRescan || changedTags || changedPolicy || changedBoundary || metadataChanged || !state.as_of;
    const runId = resumeRescan ? state.run_id : fullRescan ? randomUUID() : null;
    let cursor = resumeRescan || !fullRescan ? safeNumber(state.cursor, "cursor") : 0;

    await client.query(
      `UPDATE public.horf_season_sync
          SET status = 'syncing', error = NULL, cursor = $2::bigint,
              approved_tags = $3::jsonb, run_id = $4::text,
              rescan = $5::boolean, policy_version = $6::text,
              as_of = CASE WHEN $7::boolean THEN NULL ELSE as_of END,
              season_end = $8::timestamptz,
              updated_at = now()
        WHERE season_start = $1::timestamptz`,
      [season.startsAt, cursor, JSON.stringify(approvedTags), runId, fullRescan,
        currentPolicy, changedTags || changedPolicy || changedBoundary || metadataChanged,
        season.endsAt],
    );

    // Read approvals after publishing the scan's policy version. A concurrent
    // Marshal decision invalidates that version and triggers a later replay;
    // it cannot be accidentally overwritten by this scan's startup update.
    const approvals = await client.query<{ token_contract: string; token_id: string }>(
      `SELECT token_contract, token_id FROM public.horf_inspection_approvals WHERE active = true`,
    );
    const approvedTokens = new Set(approvals.rows.map((row) => `${row.token_contract}/${row.token_id}`));
    const exclusions = await client.query<{ token_contract: string; token_id: string }>(
      `SELECT token_contract, token_id FROM public.horf_token_nonhorse_decisions WHERE active = true`,
    );
    const excludedTokens = new Set(exclusions.rows.map((row) => `${row.token_contract}/${row.token_id}`));

    const approvedSet = new Set(approvedTags);
    while (true) {
      const page = await fetchHorfEventPage(cursor, season.startsAt, season.endsAt);
      const accepted = page.flatMap((event) => {
        const token = event.token;
        if (token && excludedTokens.has(`${token.fa_contract}/${token.token_id}`)) return [];
        const marshalApproved = !!token && approvedTokens.has(`${token.fa_contract}/${token.token_id}`);
        const transfer = normalizeHorfTransfer(event, approvedSet, season.startsAt, season.endsAt,
          horseContractAddress(), marshalApproved);
        return transfer ? [transfer] : [];
      });
      if (page.length) cursor = safeNumber(page[page.length - 1]!.id!, "event cursor");
      const complete = isLastHorfEventPage(page);
      await persistPage(client, season, accepted, cursor, fullRescan, runId, complete);
      if (complete) break;
    }
  } catch (error) {
    console.error("[horf] season sync failed:", error);
    try {
      await client.query(
        `UPDATE public.horf_season_sync
            SET status = 'error', error = $2::text, updated_at = now()
          WHERE season_start = $1::timestamptz`,
        [season.startsAt, PUBLIC_SYNC_ERROR],
      );
    } catch (updateError) {
      console.error("[horf] could not persist season sync error:", updateError);
    }
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1::text))", [advisoryKey]);
      } catch (error) {
        console.error("[horf] advisory unlock failed:", error);
      }
    }
    client.release();
  }
}

export function dueForSync(state: SyncState, season: HorfSeason, now: number): boolean {
  if (state.policy_version !== horfLedgerPolicyVersion()) return true;
  if (boundaryChanged(state, season)) return true;
  if (state.status === "syncing") return true;
  // A completed closed window contains immutable chain events. Keep its
  // persisted ledger until a policy or boundary change requires replay.
  // This prevents an All time read from starting every archive scan per block.
  if (season.endsAt && state.status === "ready" && state.as_of) return false;
  const reference = state.status === "ready" ? state.as_of : state.updated_at;
  return !reference || now >= new Date(reference).getTime() + MAINNET_BLOCK_MS;
}

function kickSync(season: HorfSeason): void {
  if (runningSyncs.has(season.key)) return;
  const pending = syncSeason(season)
    .catch((error) => console.error("[horf] could not start season sync:", error))
    .finally(() => {
      runningSyncs.delete(season.key);
    });
  runningSyncs.set(season.key, pending);
}

function readStoredTransfer(row: StoredTransfer): HorfTransfer {
  return {
    id: safeNumber(row.event_id, "stored event ID"),
    operationHash: row.operation_hash,
    timestamp: new Date(row.occurred_at).toISOString(),
    from: row.from_address,
    to: row.to_address,
    amount: safeNumber(row.amount, "stored amount"),
    token: {
      contract: row.token_contract,
      tokenId: row.token_id,
      name: row.token_name,
      image: row.token_image,
    },
  };
}

function giftKey(transfer: Pick<HorfTransfer, "operationHash" | "from" | "to" | "amount" | "token">): string {
  return [transfer.operationHash, transfer.from, transfer.to,
    transfer.token.contract, transfer.token.tokenId, transfer.amount].join("\u0000");
}

/** Match each TzKT-proven gift to one corresponding Objkt event, even for repeated same-block sends. */
export function applyGiftSettlements(transfers: HorfTransfer[], gifts: GiftSettlement[]): HorfTransfer[] {
  const unmatched = new Map<string, number>();
  for (const gift of gifts) {
    const key = giftKey({
      operationHash: gift.operation_hash,
      from: gift.from_address,
      to: gift.to_address,
      amount: safeNumber(gift.amount, "gift amount"),
      token: { contract: gift.token_contract, tokenId: gift.token_id, name: "", image: null },
    });
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }
  return transfers.map((transfer) => {
    if (!transfer.operationHash) return transfer;
    const key = giftKey(transfer);
    const left = unmatched.get(key) ?? 0;
    if (left === 0) return transfer;
    unmatched.set(key, left - 1);
    return { ...transfer, settlement: "gift" };
  });
}

/** A Marshal's exact-token nonhorse decision applies to every settlement path. */
export function withoutExcludedHorseTokens(transfers: HorfTransfer[], excluded: ReadonlySet<string>): HorfTransfer[] {
  return transfers.filter((transfer) => !excluded.has(`${transfer.token.contract}/${transfer.token.tokenId}`));
}

export async function getHorfSeasonSnapshot(address: string | null, season: HorfSeason) {
  const state = await getOrCreateState(season);
  const now = Date.now();
  const due = dueForSync(state, season, now);
  const invalidSnapshot = state.policy_version !== horfLedgerPolicyVersion() || boundaryChanged(state, season);
  const effectiveStatus = invalidSnapshot || (due && state.status === "ready") ? "syncing" : state.status;
  const asOf = !invalidSnapshot && state.as_of ? new Date(state.as_of).toISOString() : null;
  const stableClaims = await getStableClaimSnapshot(season);
  const marketSales = await getHorseMarketSaleSnapshot(season);
  const objktPurchases = await getHorfObjktPurchaseSnapshot(season);
  let directTransfers: HorfTransfer[] = [];
  let leaderboard: ReturnType<typeof summarizeSeason>["leaderboard"] = [];
  let currentUser: ReturnType<typeof summarizeSeason>["currentUser"] = null;
  if (asOf) {
    const result = await pool.query<StoredTransfer>(
      `SELECT event_id, occurred_at, from_address, to_address, amount,
              token_contract, token_id, token_name, token_image, operation_hash
         FROM public.horf_transfer_events
        WHERE season_start = $1::timestamptz
        ORDER BY occurred_at ASC, event_id ASC`,
      [season.startsAt],
    );
    const gifts = await pool.query<GiftSettlement>(
      `SELECT operation_hash, from_address, to_address, token_contract,
              token_id, amount
         FROM public.horf_gift_transfers
        WHERE kind = 'gift'
          AND occurred_at >= $1::timestamptz
          AND ($2::timestamptz IS NULL OR occurred_at < $2::timestamptz)
        ORDER BY occurred_at ASC, tzkt_transfer_id ASC`,
      [season.startsAt, season.endsAt],
    );
    directTransfers = applyGiftSettlements(result.rows.map(readStoredTransfer), gifts.rows);
  }
  const exclusions = await pool.query<{ token_contract: string; token_id: string }>(
    `SELECT token_contract, token_id FROM public.horf_token_nonhorse_decisions WHERE active = true`,
  );
  const excluded = new Set(exclusions.rows.map((row) => `${row.token_contract}/${row.token_id}`));
  ({ leaderboard, currentUser } = summarizeSeason(withoutExcludedHorseTokens([
    ...directTransfers, ...stableClaims.transfers, ...marketSales.transfers, ...objktPurchases.transfers,
  ], excluded), address));
  if (due) kickSync(season);
  const reference = effectiveStatus === "ready" ? state.as_of : state.updated_at;
  const dueAt = reference ? new Date(reference).getTime() + MAINNET_BLOCK_MS : now + MAINNET_BLOCK_MS;
  const nextRefreshAt = season.endsAt && effectiveStatus === "ready"
    ? null
    : new Date(Math.max(now + MAINNET_BLOCK_MS, dueAt)).toISOString();
  const status = effectiveStatus === "error" || stableClaims.status === "error" || marketSales.status === "error" ? "error"
    : effectiveStatus === "syncing" || stableClaims.status === "syncing" || marketSales.status === "syncing" ? "syncing" : "ready";
  const sourceTimes = [asOf, stableClaims.asOf, marketSales.asOf].filter((value): value is string => !!value);
  const combinedAsOf = sourceTimes.length ? new Date(Math.min(...sourceTimes.map(Date.parse))).toISOString() : null;
  const refreshCandidates = [nextRefreshAt, stableClaims.nextRefreshAt, marketSales.nextRefreshAt].filter((value): value is string => !!value);
  return {
    season,
    seasons: HORF_SEASON_CHOICES,
    asOf: combinedAsOf,
    status,
    error: state.error || stableClaims.error || marketSales.error,
    nextRefreshAt: refreshCandidates.length ? refreshCandidates.sort()[0] : null,
    countingRule: "Each whole horse sent directly or claimed from a Horf Stable counts for both traders. A verified HORSE market sale or Objkt purchase made in Horf counts once for each trader, even when several editions sell; only direct pairwise sends create return rides.",
    leaderboard,
    currentUser,
  };
}

type HorfSeasonSnapshot = Awaited<ReturnType<typeof getHorfSeasonSnapshot>>;

function assertDisjointHorfSeasons(seasons: readonly HorfSeason[]): void {
  const ordered = [...seasons].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!;
    if (!previous.endsAt || previous.endsAt > ordered[i]!.startsAt) {
      throw new Error(`Horf tracked seasons overlap: ${previous.key} and ${ordered[i]!.key}`);
    }
  }
}

function sumCount(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Horf all-time count exceeds safe integer range");
  return total;
}

/** Combine only named, nonoverlapping campaign snapshots; gaps remain outside the count. */
export function combineHorfSeasonSnapshots(snapshots: readonly HorfSeasonSnapshot[], address: string | null) {
  const totals = new Map<string, { received: number; sent: number; name: null }>();
  for (const snapshot of snapshots) {
    for (const rider of snapshot.leaderboard) {
      const previous = totals.get(rider.address) || { received: 0, sent: 0, name: null };
      previous.received = sumCount(previous.received, rider.received);
      previous.sent = sumCount(previous.sent, rider.sent);
      totals.set(rider.address, previous);
    }
  }
  const leaderboard = [...totals].map(([wallet, counts]) => ({
    address: wallet, name: counts.name,
    received: counts.received, sent: counts.sent,
    trades: sumCount(counts.received, counts.sent),
  })).sort((a, b) => b.trades - a.trades || b.received - a.received || a.address.localeCompare(b.address));

  // Return rides can settle a prior season's obligation. Rebuild this wallet's
  // FIFO pair ledger from the original recent rows instead of summing debts.
  const seenRecent = new Set<string>();
  const personalTransfers: HorfTransfer[] = [];
  if (address) {
    for (const snapshot of snapshots) {
      for (const row of snapshot.currentUser?.recent || []) {
        const identity = [row.settlement || "direct", row.id, row.timestamp,
          row.direction, row.counterparty, row.token.contract, row.token.tokenId,
          row.amount].join("\u0000");
        if (seenRecent.has(identity)) continue;
        seenRecent.add(identity);
        personalTransfers.push({
          id: row.id, timestamp: row.timestamp,
          from: row.direction === "out" ? address : row.counterparty,
          to: row.direction === "out" ? row.counterparty : address,
          token: row.token, amount: row.amount,
          ...(row.settlement ? { settlement: row.settlement } : {}),
          ...(row.stableMode !== undefined ? { stableMode: row.stableMode } : {}),
        });
      }
    }
  }
  const currentUser = address ? summarizeSeason(personalTransfers, address).currentUser : null;
  const status = snapshots.some((snapshot) => snapshot.status === "error") ? "error"
    : snapshots.some((snapshot) => snapshot.status === "syncing") ? "syncing" : "ready";
  const sourceTimes = snapshots.map((snapshot) => snapshot.asOf ? Date.parse(snapshot.asOf) : NaN);
  const asOf = sourceTimes.length === snapshots.length && sourceTimes.every(Number.isFinite)
    ? new Date(Math.min(...sourceTimes)).toISOString() : null;
  const refreshTimes = snapshots.map((snapshot) => snapshot.nextRefreshAt ? Date.parse(snapshot.nextRefreshAt) : NaN)
    .filter(Number.isFinite);
  const nextRefreshAt = refreshTimes.length
    ? new Date(Math.min(...refreshTimes)).toISOString()
    : status === "ready" ? null : new Date(Date.now() + MAINNET_BLOCK_MS).toISOString();
  const error = snapshots.find((snapshot) => snapshot.error)?.error || null;
  return {
    season: HORF_ALL_TIME_SEASON,
    seasons: HORF_SEASON_CHOICES,
    asOf, status, error, nextRefreshAt,
    countingRule: `${snapshots[0]?.countingRule || "Each qualifying horse transfer counts for both traders."} All time combines only the named horse-trading seasons tracked by Horf; gaps between those campaigns are excluded. Return rides can settle a debt from an earlier season.`,
    leaderboard, currentUser,
  };
}

export async function getHorfAllTimeSnapshot(address: string | null) {
  assertDisjointHorfSeasons(HORF_SEASONS);
  const snapshots = await Promise.all(HORF_SEASONS.map((season) => getHorfSeasonSnapshot(address, season)));
  return combineHorfSeasonSnapshots(snapshots, address);
}
