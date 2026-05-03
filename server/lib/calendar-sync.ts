/**
 * Phase 3 — Calendar materialization.
 *
 * Reconciles the existing rounds / challenges / side_quests tables into
 * `gameshow_events` so every dated gameshow artifact appears on the
 * calendar without hand-entering each one. Idempotent: keyed on
 * `(source_kind, source_id)` via the unique partial index defined in
 * `drizzle/0024_calendar.sql`.
 *
 * We use raw SQL for the upsert so we can specify the partial-index
 * predicate `WHERE source_id IS NOT NULL`, which Postgres requires for
 * conflict inference on a partial unique index.
 */

import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { challenges, rounds, sideQuests } from "@shared/schema";

type SourceKind = "round" | "challenge" | "side_quest";

interface MaterializeStats {
  scanned: number;
  upserted: number;
  skipped: number;
}

async function upsertEvent(opts: {
  kind:
    | "round_window"
    | "challenge_window"
    | "side_quest_window";
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  sourceKind: SourceKind;
  sourceId: number;
  status: "draft" | "published" | "cancelled";
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO gameshow_events (
      kind, title, description,
      starts_at, ends_at, all_day,
      source_kind, source_id,
      visibility, status, links_json,
      created_at, updated_at
    )
    VALUES (
      ${opts.kind}::gameshow_event_kind,
      ${opts.title},
      ${opts.description},
      ${opts.startsAt},
      ${opts.endsAt},
      false,
      ${opts.sourceKind},
      ${opts.sourceId},
      'public'::gameshow_event_visibility,
      ${opts.status}::gameshow_event_status,
      '[]'::jsonb,
      NOW(), NOW()
    )
    ON CONFLICT (source_kind, source_id) WHERE source_id IS NOT NULL
    DO UPDATE SET
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      starts_at   = EXCLUDED.starts_at,
      ends_at     = EXCLUDED.ends_at,
      kind        = EXCLUDED.kind,
      status      = EXCLUDED.status,
      updated_at  = NOW()
  `);
}

function titleForRound(r: { number: number; name: string }): string {
  return `R${r.number} — ${r.name}`;
}

export async function materializeRounds(): Promise<MaterializeStats> {
  const rows = await db
    .select({
      id: rounds.id,
      number: rounds.number,
      name: rounds.name,
      description: rounds.description,
      startDate: rounds.startDate,
      endDate: rounds.endDate,
      status: rounds.status,
    })
    .from(rounds)
    .where(isNotNull(rounds.startDate));

  const stats: MaterializeStats = {
    scanned: rows.length,
    upserted: 0,
    skipped: 0,
  };
  for (const r of rows) {
    if (!r.startDate) {
      stats.skipped += 1;
      continue;
    }
    await upsertEvent({
      kind: "round_window",
      title: titleForRound(r),
      description: r.description ?? null,
      startsAt: r.startDate,
      endsAt: r.endDate ?? null,
      sourceKind: "round",
      sourceId: r.id,
      status: "published",
    });
    stats.upserted += 1;
  }
  return stats;
}

export async function materializeChallenges(): Promise<MaterializeStats> {
  const rows = await db
    .select({
      id: challenges.id,
      title: challenges.title,
      description: challenges.description,
      deadline: challenges.deadline,
      status: challenges.status,
    })
    .from(challenges)
    .where(isNotNull(challenges.deadline));

  const stats: MaterializeStats = {
    scanned: rows.length,
    upserted: 0,
    skipped: 0,
  };
  for (const c of rows) {
    if (!c.deadline) {
      stats.skipped += 1;
      continue;
    }
    await upsertEvent({
      kind: "challenge_window",
      title: c.title,
      description: c.description ?? null,
      startsAt: c.deadline,
      endsAt: c.deadline,
      sourceKind: "challenge",
      sourceId: c.id,
      status: c.status === "draft" ? "draft" : "published",
    });
    stats.upserted += 1;
  }
  return stats;
}

export async function materializeSideQuests(): Promise<MaterializeStats> {
  const rows = await db
    .select({
      id: sideQuests.id,
      title: sideQuests.title,
      description: sideQuests.description,
      deadline: sideQuests.deadline,
      status: sideQuests.status,
    })
    .from(sideQuests)
    .where(isNotNull(sideQuests.deadline));

  const stats: MaterializeStats = {
    scanned: rows.length,
    upserted: 0,
    skipped: 0,
  };
  for (const q of rows) {
    if (!q.deadline) {
      stats.skipped += 1;
      continue;
    }
    await upsertEvent({
      kind: "side_quest_window",
      title: q.title,
      description: q.description ?? null,
      startsAt: q.deadline,
      endsAt: q.deadline,
      sourceKind: "side_quest",
      sourceId: q.id,
      status: q.status === "draft" ? "draft" : "published",
    });
    stats.upserted += 1;
  }
  return stats;
}

/**
 * Cancels (not deletes) materialized events whose source rows
 * disappeared. Keeps the audit trail but removes them from public
 * calendar queries that filter to `published`.
 */
export async function reapOrphanedMaterializedEvents(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE gameshow_events
       SET status = 'cancelled',
           updated_at = NOW()
     WHERE status <> 'cancelled'
       AND source_id IS NOT NULL
       AND (
         (source_kind = 'round'
            AND NOT EXISTS (SELECT 1 FROM rounds      WHERE id = gameshow_events.source_id))
      OR (source_kind = 'challenge'
            AND NOT EXISTS (SELECT 1 FROM challenges  WHERE id = gameshow_events.source_id))
      OR (source_kind = 'side_quest'
            AND NOT EXISTS (SELECT 1 FROM side_quests WHERE id = gameshow_events.source_id))
       )
  `);
  return Number((result as unknown as { rowCount?: number }).rowCount ?? 0);
}

export async function runCalendarMaterialization(): Promise<{
  rounds: MaterializeStats;
  challenges: MaterializeStats;
  sideQuests: MaterializeStats;
  reaped: number;
}> {
  const [r, c, q, reaped] = await Promise.all([
    materializeRounds(),
    materializeChallenges(),
    materializeSideQuests(),
    reapOrphanedMaterializedEvents(),
  ]);
  return { rounds: r, challenges: c, sideQuests: q, reaped };
}

/** Called from create/update route hooks for a single round. */
export async function syncRoundEvent(roundId: number): Promise<void> {
  const [r] = await db.select().from(rounds).where(eq(rounds.id, roundId));
  if (!r || !r.startDate) {
    await db.execute(sql`
      UPDATE gameshow_events
         SET status = 'cancelled',
             updated_at = NOW()
       WHERE source_kind = 'round'
         AND source_id = ${roundId}
         AND status <> 'cancelled'
    `);
    return;
  }
  await upsertEvent({
    kind: "round_window",
    title: titleForRound(r),
    description: r.description ?? null,
    startsAt: r.startDate,
    endsAt: r.endDate ?? null,
    sourceKind: "round",
    sourceId: r.id,
    status: "published",
  });
}

/** Called from create/update route hooks for a single challenge. */
export async function syncChallengeEvent(challengeId: number): Promise<void> {
  const [c] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId));
  if (!c || !c.deadline) return;
  await upsertEvent({
    kind: "challenge_window",
    title: c.title,
    description: c.description ?? null,
    startsAt: c.deadline,
    endsAt: c.deadline,
    sourceKind: "challenge",
    sourceId: c.id,
    status: c.status === "draft" ? "draft" : "published",
  });
}

/** Called from create/update route hooks for a single side quest. */
export async function syncSideQuestEvent(questId: number): Promise<void> {
  const [q] = await db
    .select()
    .from(sideQuests)
    .where(eq(sideQuests.id, questId));
  if (!q || !q.deadline) return;
  await upsertEvent({
    kind: "side_quest_window",
    title: q.title,
    description: q.description ?? null,
    startsAt: q.deadline,
    endsAt: q.deadline,
    sourceKind: "side_quest",
    sourceId: q.id,
    status: q.status === "draft" ? "draft" : "published",
  });
}

export type { MaterializeStats, SourceKind };
