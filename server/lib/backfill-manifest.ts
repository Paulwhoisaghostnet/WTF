/**
 * Backfill manifest — the "what's still missing" queue.
 *
 * The Guidance import gives us the bulk of historic data but it is
 * necessarily incomplete:
 *
 *   • Some 2021-2023 Objkt-GraphQL rows lack a real on-chain op_hash
 *     (stored here as `source LIKE '%_synth%'` and a `synth:<id>` hash).
 *   • Some of those same rows lack a seller address.
 *   • XTZ/USD daily prices may have gaps.
 *   • Connected wallets may not have been indexed past their
 *     last-sync cursor.
 *   • Tokens we own have no live listing / floor / current market
 *     data until somebody asks TzKT/Objkt for it.
 *   • Addresses we've seen on-chain have no friendly label.
 *
 * Rather than asking an operator to run one-shot backfill scripts,
 * we enqueue these gaps here and let the dispatcher worker drain them
 * continuously at the rate the upstream APIs will tolerate.
 *
 * This module is the low-level CRUD façade for the manifest table.
 * The seeders (gap-enumeration SQL) live in `backfill-seeders.ts`;
 * the handlers (TzKT / Objkt calls) live in `backfill-handlers.ts`;
 * the loop that ties it all together lives in `backfill-dispatcher.ts`.
 */

import { db } from "../db";
import { backfillManifest } from "@shared/schema";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";

/** Discriminator for manifest rows.  Keep strings short & stable. */
export type BackfillTaskType =
  | "xtz_price_gap"
  | "address_label"
  | "sale_reconcile"
  | "wallet_history"
  | "token_market"
  | "token_mint_enrich"
  /**
   * `acquisition_resolve` — held-token cost-basis resolver.
   *
   * Seeded for every token a user wallet holds that has a wallet_events
   * row proving the wallet received the token, but has NO matching
   * token_sales / token_mint_events row from our ingest layer.  The
   * handler fetches the full operation group from TzKT, classifies the
   * op (mint / marketplace sale / transfer / free drop), and materialises
   * the correct row — giving portfolio-analytics a real cost basis.
   */
  | "acquisition_resolve";

export interface BackfillRow {
  id: number;
  taskType: BackfillTaskType;
  target: string;
  payload: unknown;
  priority: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * `enqueue()` — upsert a manifest row.  Safe to call from seeders in
 * a tight loop; duplicates are a no-op (ON CONFLICT DO NOTHING on the
 * (task_type, target) unique index).
 *
 * If the row already exists and is `completed`, we leave it alone.
 * If it already exists and is `failed|pending|in_progress`, we also
 * leave it alone — the dispatcher's retry logic is authoritative.
 */
export async function enqueue(opts: {
  taskType: BackfillTaskType;
  target: string;
  payload?: unknown;
  priority?: number;
  maxAttempts?: number;
}): Promise<void> {
  await db
    .insert(backfillManifest)
    .values({
      taskType: opts.taskType,
      target: opts.target,
      payload: (opts.payload ?? null) as any,
      priority: opts.priority ?? 50,
      maxAttempts: opts.maxAttempts ?? 6,
    })
    .onConflictDoNothing({
      target: [backfillManifest.taskType, backfillManifest.target],
    });
}

/** Same as `enqueue()` but for batches of rows — one INSERT, many values. */
export async function enqueueBatch(
  rows: Array<{
    taskType: BackfillTaskType;
    target: string;
    payload?: unknown;
    priority?: number;
    maxAttempts?: number;
  }>
): Promise<number> {
  if (!rows.length) return 0;
  // Chunk at 1000 rows per INSERT — well under Postgres's default
  // protocol-level parameter limit (≈65k) and cheap on memory.
  let inserted = 0;
  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result = await db
      .insert(backfillManifest)
      .values(
        chunk.map((r) => ({
          taskType: r.taskType,
          target: r.target,
          payload: (r.payload ?? null) as any,
          priority: r.priority ?? 50,
          maxAttempts: r.maxAttempts ?? 6,
        }))
      )
      .onConflictDoNothing({
        target: [backfillManifest.taskType, backfillManifest.target],
      })
      .returning({ id: backfillManifest.id });
    inserted += result.length;
  }
  return inserted;
}

/**
 * Atomically claim up to `limit` rows for processing.  Uses
 * `FOR UPDATE SKIP LOCKED` so multiple dispatcher workers (today one,
 * tomorrow many) never double-claim.  Claimed rows flip to
 * `in_progress` with `last_attempt_at = now()`.
 *
 * Optional `taskType` lets callers run a type-specific dispatcher
 * (useful when an API's rate budget is much smaller than another).
 */
export async function claim(opts: {
  limit: number;
  taskType?: BackfillTaskType;
}): Promise<BackfillRow[]> {
  const { limit, taskType } = opts;
  const typeFilter = taskType ? sql`AND task_type = ${taskType}` : sql``;

  // We do the pick in a single CTE so the UPDATE and the returned
  // rowset stay consistent.  SKIP LOCKED is the key — any row another
  // worker already holds is silently skipped.
  const result = (await db.execute(sql`
    WITH picked AS (
      SELECT id
      FROM backfill_manifest
      WHERE status = 'pending'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ${typeFilter}
      ORDER BY priority ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE backfill_manifest AS m
       SET status          = 'in_progress',
           last_attempt_at = now(),
           attempts        = m.attempts + 1
      FROM picked
     WHERE m.id = picked.id
     RETURNING m.*
  `)) as any;

  const raw: any[] = result?.rows ?? (Array.isArray(result) ? result : []);
  return raw.map(rowToBackfillRow);
}

/** Mark an `in_progress` row as `completed`.  No-op if row moved away. */
export async function complete(id: number): Promise<void> {
  await db
    .update(backfillManifest)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
      nextAttemptAt: null,
    })
    .where(eq(backfillManifest.id, id));
}

/**
 * Mark an `in_progress` row as failed.  If attempts < maxAttempts we
 * schedule a retry at `now() + backoff(attempts)` and flip back to
 * pending; otherwise we mark it `failed` so it stops blocking the
 * dispatcher.
 */
export async function fail(opts: {
  id: number;
  error: unknown;
  currentAttempts: number;
  maxAttempts: number;
  /** Override the default backoff when the upstream told us exactly when to retry. */
  retryAfterMs?: number;
}): Promise<void> {
  const msg = errorString(opts.error);
  const exhausted = opts.currentAttempts >= opts.maxAttempts;
  const waitMs =
    opts.retryAfterMs ?? defaultBackoffMs(opts.currentAttempts);

  if (exhausted) {
    await db
      .update(backfillManifest)
      .set({ status: "failed", lastError: msg })
      .where(eq(backfillManifest.id, opts.id));
    return;
  }

  const nextAt = new Date(Date.now() + waitMs);
  await db
    .update(backfillManifest)
    .set({
      status: "pending",
      lastError: msg,
      nextAttemptAt: nextAt,
    })
    .where(eq(backfillManifest.id, opts.id));
}

/**
 * Mark a row as permanently `skipped` — the row is structurally
 * unrecoverable (e.g. token was burnt, wallet doesn't exist, TzKT
 * returned 404).  Handlers call this when they know a retry will
 * never succeed.
 */
export async function skip(id: number, reason: string): Promise<void> {
  await db
    .update(backfillManifest)
    .set({
      status: "skipped",
      lastError: reason.slice(0, 2000),
      completedAt: new Date(),
    })
    .where(eq(backfillManifest.id, id));
}

/** Stuck-row recovery: anything in_progress for > stuckMs → pending. */
export async function rescueStuck(stuckMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - stuckMs);
  const result = await db
    .update(backfillManifest)
    .set({
      status: "pending",
      nextAttemptAt: new Date(Date.now() + 30_000),
    })
    .where(
      and(
        eq(backfillManifest.status, "in_progress"),
        or(
          isNull(backfillManifest.lastAttemptAt),
          lte(backfillManifest.lastAttemptAt, cutoff)
        )
      )
    )
    .returning({ id: backfillManifest.id });
  return result.length;
}

export interface ManifestStats {
  total: number;
  byStatus: Record<string, number>;
  byTaskType: Array<{
    taskType: string;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    skipped: number;
  }>;
  oldestPendingAt: Date | null;
  newestCompletedAt: Date | null;
}

/** Aggregate stats for the cockpit / admin endpoint. */
export async function stats(): Promise<ManifestStats> {
  const totalRes = (await db.execute(sql`
    SELECT status, task_type, COUNT(*)::int AS n
    FROM backfill_manifest
    GROUP BY status, task_type
  `)) as any;

  const rows: Array<{ status: string; task_type: string; n: number }> =
    totalRes?.rows ?? (Array.isArray(totalRes) ? totalRes : []);

  const byStatus: Record<string, number> = {};
  const byTypeMap = new Map<
    string,
    { pending: number; inProgress: number; completed: number; failed: number; skipped: number }
  >();

  let total = 0;
  for (const r of rows) {
    total += r.n;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + r.n;
    if (!byTypeMap.has(r.task_type)) {
      byTypeMap.set(r.task_type, {
        pending: 0,
        inProgress: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
      });
    }
    const ent = byTypeMap.get(r.task_type)!;
    if (r.status === "pending") ent.pending += r.n;
    else if (r.status === "in_progress") ent.inProgress += r.n;
    else if (r.status === "completed") ent.completed += r.n;
    else if (r.status === "failed") ent.failed += r.n;
    else if (r.status === "skipped") ent.skipped += r.n;
  }

  const extremesRes = (await db.execute(sql`
    SELECT
      MIN(created_at) FILTER (WHERE status = 'pending')    AS oldest_pending_at,
      MAX(completed_at)                                    AS newest_completed_at
    FROM backfill_manifest
  `)) as any;
  const extremes: { oldest_pending_at: Date | null; newest_completed_at: Date | null } =
    (extremesRes?.rows ?? [])[0] ?? { oldest_pending_at: null, newest_completed_at: null };

  return {
    total,
    byStatus,
    byTaskType: Array.from(byTypeMap.entries()).map(([taskType, c]) => ({
      taskType,
      ...c,
    })),
    oldestPendingAt: extremes.oldest_pending_at
      ? new Date(extremes.oldest_pending_at)
      : null,
    newestCompletedAt: extremes.newest_completed_at
      ? new Date(extremes.newest_completed_at)
      : null,
  };
}

/* ---------- Helpers ----------------------------------------------------- */

function rowToBackfillRow(r: any): BackfillRow {
  return {
    id: r.id,
    taskType: r.task_type as BackfillTaskType,
    target: r.target,
    payload: r.payload ?? null,
    priority: r.priority,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    lastError: r.last_error,
    lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : null,
    nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at) : null,
    completedAt: r.completed_at ? new Date(r.completed_at) : null,
    createdAt: new Date(r.created_at),
  };
}

function errorString(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.stack ?? err.message ?? String(err);
    return msg.length > 2_000 ? msg.slice(0, 2_000) + "…" : msg;
  }
  return String(err).slice(0, 2_000);
}

/**
 * Exponential backoff schedule for retries.
 *   attempt 1 → 30s
 *   attempt 2 → 2m
 *   attempt 3 → 10m
 *   attempt 4 → 1h
 *   attempt 5 → 6h
 *   attempt 6 → 24h (final before `failed`)
 *
 * We stagger with ±20% jitter so a mass failure doesn't stampede.
 */
function defaultBackoffMs(attempts: number): number {
  const table = [
    30_000,      // 30s
    2 * 60_000,  // 2m
    10 * 60_000, // 10m
    60 * 60_000, // 1h
    6 * 60 * 60_000,  // 6h
    24 * 60 * 60_000, // 24h
  ];
  const base = table[Math.min(attempts - 1, table.length - 1)] ?? 30_000;
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(1_000, Math.round(base + jitter));
}
