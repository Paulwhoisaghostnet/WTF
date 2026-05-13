/**
 * Lightweight work queue for wallet/contract indexing.
 *
 * Today the queue is populated by:
 *   - login handlers (enqueue linked wallets with priority=1)
 *   - admin/cockpit "Sync now" buttons (priority=2)
 *   - future counterparty discovery (priority=7)
 *
 * A single worker (`events-sync` in Phase 1) drains it.  Until Phase 1
 * lands, this module is used purely by the cockpit "Sync now" endpoint
 * to log the intent into a durable queue; the existing
 * `backfillUserWallets` path still handles the actual work.
 */

import { db } from "../db";
import { indexingQueue } from "@shared/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export type EnqueueInput = {
  target: string;
  targetKind: "wallet" | "contract";
  priority?: number;
  reason?: string;
  /** Owning user id, stored for audit only (queue is not user-scoped). */
  userId?: number;
};

/**
 * Enqueue a target.  If a row already exists with status='pending'
 * for the same (target, targetKind), the existing id is returned
 * and priority is lowered (= more urgent) if the new request is
 * more urgent.
 */
export async function enqueue(input: EnqueueInput): Promise<number> {
  const priority = Math.max(1, Math.min(10, input.priority ?? 5));
  const existing = await db
    .select({ id: indexingQueue.id, priority: indexingQueue.priority })
    .from(indexingQueue)
    .where(
      and(
        eq(indexingQueue.target, input.target),
        eq(indexingQueue.targetKind, input.targetKind),
        eq(indexingQueue.status, "pending")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    if (priority < existing[0].priority) {
      await db
        .update(indexingQueue)
        .set({ priority, reason: input.reason ?? null })
        .where(eq(indexingQueue.id, existing[0].id));
    }
    return existing[0].id;
  }

  const [row] = await db
    .insert(indexingQueue)
    .values({
      target: input.target,
      targetKind: input.targetKind,
      priority,
      reason: input.reason ?? null,
      status: "pending",
    })
    .returning({ id: indexingQueue.id });
  return row.id;
}

/**
 * Claim the next N pending items for processing.  Sets status to
 * 'processing' atomically to prevent double-picks.
 */
export async function claim(limit = 5) {
  const rows = await db.execute(sql`
    WITH picked AS (
      SELECT id FROM indexing_queue
      WHERE status = 'pending'
      ORDER BY priority ASC, enqueued_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE indexing_queue q
    SET status = 'processing',
        picked_up_at = NOW(),
        attempts = attempts + 1
    FROM picked
    WHERE q.id = picked.id
    RETURNING q.id, q.target, q.target_kind, q.priority, q.reason, q.attempts
  `);
  const list = ((rows as any).rows ?? []) as Array<{
    id: number;
    target: string;
    target_kind: string;
    priority: number;
    reason: string | null;
    attempts: number;
  }>;
  return list.map((r) => ({
    id: r.id,
    target: r.target,
    targetKind: r.target_kind as "wallet" | "contract",
    priority: r.priority,
    reason: r.reason,
    attempts: r.attempts,
  }));
}

export async function markSuccess(id: number): Promise<void> {
  await db
    .update(indexingQueue)
    .set({ status: "done", finishedAt: new Date() })
    .where(eq(indexingQueue.id, id));
}

export async function markError(id: number, error: unknown): Promise<void> {
  const message =
    error instanceof Error
      ? error.stack ?? error.message
      : String(error ?? "unknown");
  await db
    .update(indexingQueue)
    .set({
      status: "error",
      finishedAt: new Date(),
      lastError: message.slice(0, 4000),
    })
    .where(eq(indexingQueue.id, id));
}

/**
 * Reset stuck "processing" rows back to "pending" after a timeout.
 * Called by the worker at the top of each pass; prevents a crash
 * mid-work from permanently parking an item.
 */
export async function reclaimStuck(olderThanMs = 10 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db.execute(sql`
    WITH stuck AS (
      SELECT id, target, target_kind
      FROM indexing_queue
      WHERE status = 'processing'
        AND picked_up_at < ${cutoff}
    ),
    restored AS (
      UPDATE indexing_queue q
      SET status = 'pending',
          picked_up_at = NULL,
          last_error = NULL
      FROM stuck s
      WHERE q.id = s.id
        AND NOT EXISTS (
          SELECT 1 FROM indexing_queue p
          WHERE p.target = s.target
            AND p.target_kind = s.target_kind
            AND p.status = 'pending'
        )
      RETURNING q.id
    ),
    superseded AS (
      UPDATE indexing_queue q
      SET status = 'error',
          finished_at = NOW(),
          last_error = 'stale processing row superseded by an existing pending duplicate'
      FROM stuck s
      WHERE q.id = s.id
        AND EXISTS (
          SELECT 1 FROM indexing_queue p
          WHERE p.target = s.target
            AND p.target_kind = s.target_kind
            AND p.status = 'pending'
        )
      RETURNING q.id
    )
    SELECT
      (SELECT COUNT(*)::int FROM restored) AS restored,
      (SELECT COUNT(*)::int FROM superseded) AS superseded
  `);
  const row = ((rows as any).rows ?? [])[0] as { restored?: number; superseded?: number } | undefined;
  return Number(row?.restored || 0) + Number(row?.superseded || 0);
}

export async function listPending(limit = 100) {
  return db
    .select()
    .from(indexingQueue)
    .where(eq(indexingQueue.status, "pending"))
    .orderBy(asc(indexingQueue.priority), asc(indexingQueue.enqueuedAt))
    .limit(limit);
}
