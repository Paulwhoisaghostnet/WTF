/**
 * Wallet surveillance / dossier sync.
 *
 * Three layers of syncing, all rooted at TzKT:
 *
 *   1. `runWalletBackfill(address)` — per-wallet, used the first time we
 *      see a wallet.  Paginates every TzKT endpoint from id=0 up to the
 *      current tip and flips `backfilled=true` when complete.  Also kicked
 *      off on-demand when an admin or the user hits the resync endpoint.
 *
 *   2. `runGlobalWalletSweep()` — every 5 minutes.  Grabs the union of all
 *      backfilled wallets' cursors, issues ONE TzKT call per kind for the
 *      whole fleet (chunked on URL length), filters + fans out per-wallet
 *      on the way back.  Amortised cost is 3–4 TzKT calls per 5 minutes
 *      regardless of user count.
 *
 *   3. `runWalletSafetySweep()` — every 6 hours.  Per-wallet incremental
 *      pass; a belt-and-braces check against cases the global sweep could
 *      miss (e.g. a brand-new wallet that the global run skipped because
 *      its cursor was stale, or a TzKT chunking quirk).
 *
 * Every persisted event is upserted on its TzKT row id, so the sync layers
 * are idempotent: safe to re-run, safe to interrupt.
 */

import { db } from "../db";
import {
  userWallets,
  walletEvents,
  walletSyncCursors,
} from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  chunkAddressesForTzkt,
  getTransfersSinceIdBulk,
  getTransactionsSinceIdBulk,
  getDelegationsSinceIdBulk,
  getOriginationsSinceIdBulk,
  TzktDelegationRow,
  TzktOriginationRow,
  TzktTransactionRow,
  TzktTransferRow,
} from "../tzkt";

export const GLOBAL_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
export const SAFETY_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** In-flight backfills so we never start two syncs for the same wallet concurrently. */
const inFlightBackfills = new Set<string>();
let globalSweepInFlight = false;
let safetySweepInFlight = false;

/** Address-aware metadata used to fan events back out to each wallet cursor. */
type TrackedWallet = {
  walletAddress: string;
  userId: number;
  backfilled: boolean;
  cursor: {
    lastTransferId: number;
    lastOperationId: number;
    lastLevel: number;
  };
};

async function getTrackedWallets(): Promise<TrackedWallet[]> {
  const rows = await db
    .select({
      walletAddress: userWallets.walletAddress,
      userId: userWallets.userId,
      backfilled: walletSyncCursors.backfilled,
      lastTransferId: walletSyncCursors.lastTransferId,
      lastOperationId: walletSyncCursors.lastOperationId,
      lastLevel: walletSyncCursors.lastLevel,
    })
    .from(userWallets)
    .leftJoin(
      walletSyncCursors,
      eq(walletSyncCursors.walletAddress, userWallets.walletAddress)
    );

  return rows.map((r) => ({
    walletAddress: r.walletAddress,
    userId: r.userId,
    backfilled: Boolean(r.backfilled),
    cursor: {
      lastTransferId: Number(r.lastTransferId ?? 0),
      lastOperationId: Number(r.lastOperationId ?? 0),
      lastLevel: Number(r.lastLevel ?? 0),
    },
  }));
}

async function ensureCursor(walletAddress: string) {
  await db
    .insert(walletSyncCursors)
    .values({ walletAddress })
    .onConflictDoNothing({ target: walletSyncCursors.walletAddress });
}

async function updateCursor(
  walletAddress: string,
  patch: Partial<{
    lastTransferId: number;
    lastOperationId: number;
    lastLevel: number;
    lastSyncedAt: Date;
    lastSyncStatus: string;
    lastSyncError: string | null;
    backfilled: boolean;
    backfilledAt: Date | null;
    eventsDelta: number;
  }>
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.lastTransferId != null)
    updates.lastTransferId = sql`GREATEST(${walletSyncCursors.lastTransferId}, ${patch.lastTransferId})`;
  if (patch.lastOperationId != null)
    updates.lastOperationId = sql`GREATEST(${walletSyncCursors.lastOperationId}, ${patch.lastOperationId})`;
  if (patch.lastLevel != null)
    updates.lastLevel = sql`GREATEST(${walletSyncCursors.lastLevel}, ${patch.lastLevel})`;
  if (patch.lastSyncedAt) updates.lastSyncedAt = patch.lastSyncedAt;
  if (patch.lastSyncStatus) updates.lastSyncStatus = patch.lastSyncStatus;
  if (patch.lastSyncError !== undefined)
    updates.lastSyncError = patch.lastSyncError;
  if (patch.backfilled != null) updates.backfilled = patch.backfilled;
  if (patch.backfilledAt !== undefined)
    updates.backfilledAt = patch.backfilledAt;
  if (patch.eventsDelta) {
    updates.eventsTracked = sql`${walletSyncCursors.eventsTracked} + ${patch.eventsDelta}`;
  }

  await db
    .update(walletSyncCursors)
    .set(updates)
    .where(eq(walletSyncCursors.walletAddress, walletAddress));
}

/* ─── Event shape + row building ─────────────────────────── */

type WalletEventInsert = typeof walletEvents.$inferInsert;

function ipfsToHttp(uri?: string | null): string | null {
  if (!uri || typeof uri !== "string") return null;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
  }
  return uri;
}

function extractTokenMetadata(row: TzktTransferRow) {
  const token = row.token || {};
  const contractField = token.contract as any;
  const contract =
    typeof contractField === "string"
      ? contractField
      : contractField?.address ?? null;
  const tokenId =
    token.tokenId != null && token.tokenId !== ""
      ? String(token.tokenId)
      : null;
  const metadata = (token.metadata || {}) as Record<string, any>;
  const thumbnail = ipfsToHttp(
    metadata?.thumbnailUri ||
      metadata?.displayUri ||
      metadata?.artifactUri ||
      null
  );
  return {
    tokenContract: contract,
    tokenId,
    tokenStandard: token.standard ?? null,
    tokenName: typeof metadata?.name === "string" ? metadata.name : null,
    tokenSymbol: typeof metadata?.symbol === "string" ? metadata.symbol : null,
    tokenThumbnail: thumbnail,
  };
}

function buildTransferEvents(
  row: TzktTransferRow,
  tracked: Map<string, TrackedWallet>
): WalletEventInsert[] {
  const fromAddr = row.from?.address ?? null;
  const toAddr = row.to?.address ?? null;
  const token = extractTokenMetadata(row);
  const amount = row.amount != null ? String(row.amount) : null;
  const level = Number(row.level);
  const timestamp = new Date(row.timestamp);
  const commonBase = {
    level,
    timestamp,
    tzktKind: "transfer" as const,
    tzktTransferId: row.id,
    tokenContract: token.tokenContract,
    tokenId: token.tokenId,
    tokenStandard: token.tokenStandard,
    tokenAmount: amount,
    tokenName: token.tokenName,
    tokenSymbol: token.tokenSymbol,
    tokenThumbnail: token.tokenThumbnail,
    raw: row as any,
  };

  const events: WalletEventInsert[] = [];
  // Incoming side: to matches a tracked wallet.
  if (toAddr && tracked.has(toAddr)) {
    const w = tracked.get(toAddr)!;
    events.push({
      ...commonBase,
      walletAddress: toAddr,
      userId: w.userId,
      eventType: fromAddr ? "token_transfer_in" : "token_mint",
      counterpartyAddress: fromAddr,
    });
  }
  // Outgoing side: from matches a tracked wallet (may be the same tx as above if
  // both parties are WTF users, and that's fine — one row per side).
  if (fromAddr && tracked.has(fromAddr)) {
    const w = tracked.get(fromAddr)!;
    events.push({
      ...commonBase,
      walletAddress: fromAddr,
      userId: w.userId,
      eventType: toAddr ? "token_transfer_out" : "token_burn",
      counterpartyAddress: toAddr,
    });
  }
  return events;
}

function buildTransactionEvent(
  row: TzktTransactionRow,
  tracked: Map<string, TrackedWallet>
): WalletEventInsert[] {
  const sender = row.sender?.address ?? null;
  const target = row.target?.address ?? null;
  const level = Number(row.level);
  const timestamp = new Date(row.timestamp);
  const isContractCall =
    !!target && target.startsWith("KT") && Boolean(row.entrypoint);
  const events: WalletEventInsert[] = [];
  const base = {
    level,
    timestamp,
    tzktKind: "transaction" as const,
    tzktOperationId: row.id,
    opHash: row.hash ?? null,
    xtzAmountMutez:
      typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    raw: row as any,
  };

  if (sender && tracked.has(sender)) {
    const w = tracked.get(sender)!;
    events.push({
      ...base,
      walletAddress: sender,
      userId: w.userId,
      eventType: isContractCall ? "contract_call" : "xtz_transfer_out",
      counterpartyAddress: target,
    });
  }
  if (
    target &&
    tracked.has(target) &&
    target !== sender &&
    !isContractCall &&
    (row.amount ?? 0) > 0
  ) {
    const w = tracked.get(target)!;
    events.push({
      ...base,
      walletAddress: target,
      userId: w.userId,
      eventType: "xtz_transfer_in",
      counterpartyAddress: sender,
    });
  }
  return events;
}

function buildDelegationEvent(
  row: TzktDelegationRow,
  tracked: Map<string, TrackedWallet>
): WalletEventInsert[] {
  const sender = row.sender?.address ?? null;
  if (!sender || !tracked.has(sender)) return [];
  const w = tracked.get(sender)!;
  return [
    {
      walletAddress: sender,
      userId: w.userId,
      eventType: "delegation",
      level: Number(row.level),
      timestamp: new Date(row.timestamp),
      tzktKind: "delegation",
      tzktOperationId: row.id,
      opHash: row.hash ?? null,
      counterpartyAddress: row.newDelegate?.address ?? null,
      raw: row as any,
    },
  ];
}

function buildOriginationEvent(
  row: TzktOriginationRow,
  tracked: Map<string, TrackedWallet>
): WalletEventInsert[] {
  const sender = row.sender?.address ?? null;
  if (!sender || !tracked.has(sender)) return [];
  const w = tracked.get(sender)!;
  return [
    {
      walletAddress: sender,
      userId: w.userId,
      eventType: "origination",
      level: Number(row.level),
      timestamp: new Date(row.timestamp),
      tzktKind: "origination",
      tzktOperationId: row.id,
      opHash: row.hash ?? null,
      counterpartyAddress: row.originatedContract?.address ?? null,
      xtzAmountMutez:
        typeof row.contractBalance === "number"
          ? row.contractBalance
          : Number(row.contractBalance) || 0,
      raw: row as any,
    },
  ];
}

/* ─── Upserts ─────────────────────────────────────────────── */

/**
 * Insert a batch of walletEvents.  Events carry one of two unique
 * constraints — (wallet_address, tzkt_transfer_id) or
 * (wallet_address, tzkt_operation_id, tzkt_kind) — and `onConflictDoNothing`
 * with no target tells Postgres to skip any conflict, which is what we want.
 */
async function upsertWalletEvents(rows: WalletEventInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  // Chunk to keep parameter counts sane (Postgres has a ~65k bind limit).
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await db
      .insert(walletEvents)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: walletEvents.id });
    inserted += result.length;
  }
  return inserted;
}

/* ─── Per-wallet backfill ──────────────────────────────────── */

/**
 * Run a full per-wallet backfill from the current cursor up to TzKT's tip.
 * Safe to call repeatedly; no-op when already in flight for the wallet.
 */
export async function runWalletBackfill(
  walletAddress: string,
  opts: { reason?: string } = {}
): Promise<{ scanned: number; inserted: number }> {
  if (inFlightBackfills.has(walletAddress)) {
    return { scanned: 0, inserted: 0 };
  }
  inFlightBackfills.add(walletAddress);
  const started = Date.now();

  try {
    await ensureCursor(walletAddress);
    const [cursorRow] = await db
      .select()
      .from(walletSyncCursors)
      .where(eq(walletSyncCursors.walletAddress, walletAddress))
      .limit(1);
    const [walletRow] = await db
      .select({ userId: userWallets.userId })
      .from(userWallets)
      .where(eq(userWallets.walletAddress, walletAddress))
      .limit(1);
    if (!walletRow) {
      return { scanned: 0, inserted: 0 };
    }
    const tracked = new Map<string, TrackedWallet>([
      [
        walletAddress,
        {
          walletAddress,
          userId: walletRow.userId,
          backfilled: cursorRow?.backfilled ?? false,
          cursor: {
            lastTransferId: Number(cursorRow?.lastTransferId ?? 0),
            lastOperationId: Number(cursorRow?.lastOperationId ?? 0),
            lastLevel: Number(cursorRow?.lastLevel ?? 0),
          },
        },
      ],
    ]);

    let scanned = 0;
    let inserted = 0;
    let maxLevel = Number(cursorRow?.lastLevel ?? 0);

    // ─── FA2 transfers ───
    let lastTransferId = Number(cursorRow?.lastTransferId ?? 0);
    for (let page = 0; page < 500; page++) {
      const rows = await getTransfersSinceIdBulk(
        [walletAddress],
        lastTransferId,
        1000
      );
      if (rows.length === 0) break;
      scanned += rows.length;
      const events = rows.flatMap((r) => buildTransferEvents(r, tracked));
      inserted += await upsertWalletEvents(events);
      lastTransferId = rows[rows.length - 1].id;
      maxLevel = Math.max(maxLevel, ...rows.map((r) => Number(r.level)));
      if (rows.length < 1000) break;
    }

    // ─── Transactions (XTZ + contract calls) ───
    let lastOpId = Number(cursorRow?.lastOperationId ?? 0);
    for (let page = 0; page < 500; page++) {
      const rows = await getTransactionsSinceIdBulk(
        [walletAddress],
        lastOpId,
        1000
      );
      if (rows.length === 0) break;
      scanned += rows.length;
      const events = rows.flatMap((r) => buildTransactionEvent(r, tracked));
      inserted += await upsertWalletEvents(events);
      lastOpId = rows[rows.length - 1].id;
      maxLevel = Math.max(maxLevel, ...rows.map((r) => Number(r.level)));
      if (rows.length < 1000) break;
    }

    // ─── Delegations + originations (cheap; single page each is usually enough) ───
    for (let page = 0; page < 50; page++) {
      const rows = await getDelegationsSinceIdBulk(
        [walletAddress],
        lastOpId,
        1000
      );
      if (rows.length === 0) break;
      scanned += rows.length;
      const events = rows.flatMap((r) => buildDelegationEvent(r, tracked));
      inserted += await upsertWalletEvents(events);
      maxLevel = Math.max(maxLevel, ...rows.map((r) => Number(r.level)));
      if (rows.length < 1000) break;
    }
    for (let page = 0; page < 50; page++) {
      const rows = await getOriginationsSinceIdBulk(
        [walletAddress],
        lastOpId,
        1000
      );
      if (rows.length === 0) break;
      scanned += rows.length;
      const events = rows.flatMap((r) => buildOriginationEvent(r, tracked));
      inserted += await upsertWalletEvents(events);
      maxLevel = Math.max(maxLevel, ...rows.map((r) => Number(r.level)));
      if (rows.length < 1000) break;
    }

    await updateCursor(walletAddress, {
      lastTransferId,
      lastOperationId: lastOpId,
      lastLevel: maxLevel,
      lastSyncedAt: new Date(),
      lastSyncStatus: "ok",
      lastSyncError: null,
      backfilled: true,
      backfilledAt: new Date(),
      eventsDelta: inserted,
    });

    console.log(
      `[wallet-events] backfill ${walletAddress} reason=${opts.reason ?? "manual"} scanned=${scanned} inserted=${inserted} in ${Math.round(
        (Date.now() - started) / 1000
      )}s`
    );
    return { scanned, inserted };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(
      `[wallet-events] backfill failed for ${walletAddress}:`,
      message
    );
    await updateCursor(walletAddress, {
      lastSyncedAt: new Date(),
      lastSyncStatus: "error",
      lastSyncError: message.slice(0, 500),
    });
    return { scanned: 0, inserted: 0 };
  } finally {
    inFlightBackfills.delete(walletAddress);
  }
}

/** Public helper to kick a backfill from a request handler without blocking. */
export function scheduleBackfill(
  walletAddress: string,
  reason: string
): void {
  runWalletBackfill(walletAddress, { reason }).catch((err) =>
    console.error(
      `[wallet-events] scheduled backfill ${walletAddress} failed:`,
      err
    )
  );
}

/**
 * Convenience: trigger backfill for every wallet linked to a user.
 * Runs sequentially so we don't flood TzKT on login.
 */
export async function backfillUserWallets(
  userId: number,
  reason: string
): Promise<void> {
  const rows = await db
    .select({ addr: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  for (const r of rows) {
    await runWalletBackfill(r.addr, { reason });
  }
}

/* ─── 5-minute global sweep ───────────────────────────────── */

/**
 * Bulk-fetch the delta of events across ALL backfilled wallets in one pass.
 * This is the cheap, high-frequency path.
 */
export async function runGlobalWalletSweep(): Promise<{
  wallets: number;
  inserted: number;
}> {
  if (globalSweepInFlight) return { wallets: 0, inserted: 0 };
  globalSweepInFlight = true;
  const started = Date.now();

  try {
    const all = await getTrackedWallets();
    const backfilled = all.filter((w) => w.backfilled);
    if (backfilled.length === 0) return { wallets: 0, inserted: 0 };

    const trackedMap = new Map(backfilled.map((w) => [w.walletAddress, w]));
    const addrList = backfilled.map((w) => w.walletAddress);
    const chunks = chunkAddressesForTzkt(addrList, 50);

    // We need one global cursor per kind so the TzKT filter stays small:
    // use the minimum cursor across the fleet, then let per-wallet upsert
    // idempotency shield us from replaying events on already-fresh wallets.
    const minTransfer = Math.min(
      ...backfilled.map((w) => w.cursor.lastTransferId)
    );
    const minOperation = Math.min(
      ...backfilled.map((w) => w.cursor.lastOperationId)
    );

    let inserted = 0;
    const perWalletDelta = new Map<
      string,
      {
        events: number;
        maxTransferId: number;
        maxOperationId: number;
        maxLevel: number;
      }
    >();
    const touch = (
      addr: string,
      delta: {
        maxTransferId?: number;
        maxOperationId?: number;
        maxLevel?: number;
        events?: number;
      }
    ) => {
      const cur = perWalletDelta.get(addr) ?? {
        events: 0,
        maxTransferId: 0,
        maxOperationId: 0,
        maxLevel: 0,
      };
      cur.events += delta.events ?? 0;
      cur.maxTransferId = Math.max(
        cur.maxTransferId,
        delta.maxTransferId ?? 0
      );
      cur.maxOperationId = Math.max(
        cur.maxOperationId,
        delta.maxOperationId ?? 0
      );
      cur.maxLevel = Math.max(cur.maxLevel, delta.maxLevel ?? 0);
      perWalletDelta.set(addr, cur);
    };

    // ─── Transfers ───
    for (const chunk of chunks) {
      const rows = await getTransfersSinceIdBulk(chunk, minTransfer, 1000);
      if (rows.length === 0) continue;
      const events = rows.flatMap((r) => buildTransferEvents(r, trackedMap));
      inserted += await upsertWalletEvents(events);
      for (const r of rows) {
        const level = Number(r.level);
        const touchedAddrs = [r.from?.address, r.to?.address].filter(
          (a): a is string => typeof a === "string" && trackedMap.has(a)
        );
        for (const a of touchedAddrs) {
          touch(a, { maxTransferId: r.id, maxLevel: level, events: 1 });
        }
      }
    }

    // ─── Transactions ───
    for (const chunk of chunks) {
      const rows = await getTransactionsSinceIdBulk(chunk, minOperation, 1000);
      if (rows.length === 0) continue;
      const events = rows.flatMap((r) => buildTransactionEvent(r, trackedMap));
      inserted += await upsertWalletEvents(events);
      for (const r of rows) {
        const level = Number(r.level);
        const touchedAddrs = [r.sender?.address, r.target?.address].filter(
          (a): a is string => typeof a === "string" && trackedMap.has(a)
        );
        for (const a of touchedAddrs) {
          touch(a, { maxOperationId: r.id, maxLevel: level, events: 1 });
        }
      }
    }

    // ─── Delegations + originations ───
    for (const chunk of chunks) {
      const delegations = await getDelegationsSinceIdBulk(
        chunk,
        minOperation,
        500
      );
      if (delegations.length > 0) {
        const events = delegations.flatMap((r) =>
          buildDelegationEvent(r, trackedMap)
        );
        inserted += await upsertWalletEvents(events);
        for (const r of delegations) {
          if (r.sender?.address && trackedMap.has(r.sender.address)) {
            touch(r.sender.address, {
              maxOperationId: r.id,
              maxLevel: Number(r.level),
              events: 1,
            });
          }
        }
      }
    }
    for (const chunk of chunks) {
      const origs = await getOriginationsSinceIdBulk(chunk, minOperation, 500);
      if (origs.length > 0) {
        const events = origs.flatMap((r) =>
          buildOriginationEvent(r, trackedMap)
        );
        inserted += await upsertWalletEvents(events);
        for (const r of origs) {
          if (r.sender?.address && trackedMap.has(r.sender.address)) {
            touch(r.sender.address, {
              maxOperationId: r.id,
              maxLevel: Number(r.level),
              events: 1,
            });
          }
        }
      }
    }

    // Fan the cursor updates back out — GREATEST() in updateCursor() ensures
    // we never regress a wallet that already got ahead via backfill.
    const now = new Date();
    for (const [addr, delta] of perWalletDelta.entries()) {
      await updateCursor(addr, {
        lastTransferId: delta.maxTransferId || undefined,
        lastOperationId: delta.maxOperationId || undefined,
        lastLevel: delta.maxLevel || undefined,
        lastSyncedAt: now,
        lastSyncStatus: "ok",
        lastSyncError: null,
        eventsDelta: delta.events,
      });
    }
    // Every backfilled wallet gets lastSyncedAt bumped even if no events fired,
    // so the dossier UI can show liveness.
    await db
      .update(walletSyncCursors)
      .set({ lastSyncedAt: now, lastSyncStatus: "ok" })
      .where(
        and(
          eq(walletSyncCursors.backfilled, true),
          inArray(walletSyncCursors.walletAddress, addrList)
        )
      );

    console.log(
      `[wallet-events] global sweep: ${backfilled.length} wallets, ${inserted} inserted in ${Math.round(
        (Date.now() - started) / 1000
      )}s`
    );
    return { wallets: backfilled.length, inserted };
  } catch (err) {
    console.error("[wallet-events] global sweep failed:", err);
    return { wallets: 0, inserted: 0 };
  } finally {
    globalSweepInFlight = false;
  }
}

/* ─── 6-hour safety sweep ─────────────────────────────────── */

/**
 * Iterate every tracked wallet and run an incremental per-wallet pass.
 * Catches wallets that slipped past the global sweep (e.g. newly added
 * or stuck with backfilled=false for any reason).
 */
export async function runWalletSafetySweep(): Promise<{
  wallets: number;
  inserted: number;
}> {
  if (safetySweepInFlight) return { wallets: 0, inserted: 0 };
  safetySweepInFlight = true;
  const started = Date.now();
  try {
    const wallets = await getTrackedWallets();
    let inserted = 0;
    for (const w of wallets) {
      const r = await runWalletBackfill(w.walletAddress, {
        reason: "safety-sweep",
      });
      inserted += r.inserted;
    }
    console.log(
      `[wallet-events] safety sweep: ${wallets.length} wallets, ${inserted} inserted in ${Math.round(
        (Date.now() - started) / 1000
      )}s`
    );
    return { wallets: wallets.length, inserted };
  } catch (err) {
    console.error("[wallet-events] safety sweep failed:", err);
    return { wallets: 0, inserted: 0 };
  } finally {
    safetySweepInFlight = false;
  }
}

/* ─── Query helpers used by routes ────────────────────────── */

export type DossierEvent = typeof walletEvents.$inferSelect;

export async function getWalletCursor(walletAddress: string) {
  const [row] = await db
    .select()
    .from(walletSyncCursors)
    .where(eq(walletSyncCursors.walletAddress, walletAddress))
    .limit(1);
  return row ?? null;
}

export async function getWalletDossier(
  walletAddress: string,
  opts: { limit?: number } = {}
): Promise<{
  cursor: typeof walletSyncCursors.$inferSelect | null;
  stats: {
    total: number;
    byType: Record<string, number>;
    firstEventAt: Date | null;
    lastEventAt: Date | null;
  };
  events: DossierEvent[];
}> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const cursor = await getWalletCursor(walletAddress);

  const byType = await db
    .select({
      eventType: walletEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(walletEvents)
    .where(eq(walletEvents.walletAddress, walletAddress))
    .groupBy(walletEvents.eventType);

  const [range] = await db
    .select({
      total: sql<number>`count(*)::int`,
      first: sql<Date | null>`min(${walletEvents.timestamp})`,
      last: sql<Date | null>`max(${walletEvents.timestamp})`,
    })
    .from(walletEvents)
    .where(eq(walletEvents.walletAddress, walletAddress));

  const events = await db
    .select()
    .from(walletEvents)
    .where(eq(walletEvents.walletAddress, walletAddress))
    .orderBy(desc(walletEvents.timestamp))
    .limit(limit);

  const byTypeMap: Record<string, number> = {};
  for (const r of byType) byTypeMap[r.eventType as string] = r.count;

  return {
    cursor,
    stats: {
      total: range?.total ?? 0,
      byType: byTypeMap,
      firstEventAt: range?.first ?? null,
      lastEventAt: range?.last ?? null,
    },
    events,
  };
}

export async function getUserDossier(
  userId: number,
  opts: { limit?: number } = {}
) {
  const addrs = await db
    .select({ addr: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));

  const per = await Promise.all(
    addrs.map(async (a) => ({
      walletAddress: a.addr,
      ...(await getWalletDossier(a.addr, opts)),
    }))
  );

  const aggregate = per.reduce(
    (acc, p) => {
      acc.total += p.stats.total;
      for (const [k, v] of Object.entries(p.stats.byType)) {
        acc.byType[k] = (acc.byType[k] ?? 0) + v;
      }
      if (p.stats.firstEventAt) {
        acc.firstEventAt =
          acc.firstEventAt && acc.firstEventAt < p.stats.firstEventAt
            ? acc.firstEventAt
            : p.stats.firstEventAt;
      }
      if (p.stats.lastEventAt) {
        acc.lastEventAt =
          acc.lastEventAt && acc.lastEventAt > p.stats.lastEventAt
            ? acc.lastEventAt
            : p.stats.lastEventAt;
      }
      return acc;
    },
    {
      total: 0,
      byType: {} as Record<string, number>,
      firstEventAt: null as Date | null,
      lastEventAt: null as Date | null,
    }
  );

  return { wallets: per, aggregate };
}

/* ─── Scheduling ──────────────────────────────────────────── */

import { register as registerJob } from "./scheduler";

/**
 * Register wallet-surveillance jobs with the cockpit scheduler.
 * Behaviour is identical to the prior `setInterval` pair: a global
 * sweep every 5 minutes and a per-wallet safety sweep every 6 hours
 * (staggered 30 min after boot so it doesn't pile onto startup).
 */
export function registerWalletSurveillance(): void {
  registerJob({
    name: "wallet-events-global",
    fn: async () => {
      const res = await runGlobalWalletSweep();
      return { itemsIn: res.wallets, itemsOut: res.inserted };
    },
    intervalMs: GLOBAL_SWEEP_INTERVAL_MS,
  });

  registerJob({
    name: "wallet-events-safety",
    fn: async () => {
      const res = await runWalletSafetySweep();
      return { itemsIn: res.wallets, itemsOut: res.inserted };
    },
    intervalMs: SAFETY_SWEEP_INTERVAL_MS,
    initialDelayMs: 30 * 60 * 1000,
    skipInitialRun: false,
  });

  console.log(
    `[jobs] wallet surveillance registered: global sweep every ${
      GLOBAL_SWEEP_INTERVAL_MS / 60000
    }min, safety sweep every ${SAFETY_SWEEP_INTERVAL_MS / 3600000}h`
  );
}

/**
 * Legacy entry-points kept so any in-tree caller still works.
 * Scheduler.start/stop are the right way to control lifecycle now.
 */
export function startWalletSurveillance(): void {
  registerWalletSurveillance();
}

export function stopWalletSurveillance(): void {
  // No-op; lifecycle is owned by the scheduler.
}
