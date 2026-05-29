import { sql } from "drizzle-orm";
import { wtfosAtprotoOutbox } from "@shared/schema";
import { db } from "../../db";
import { isSpineEnabled } from "./config";
import { appviewIndexerStatus } from "./appview/indexer";
import { recentModerationActions } from "./labeler";
import { federationConfig } from "./federation";

/**
 * Admin observability (S5.1). Read-only aggregation of spine health for an admin surface:
 * outbox delivery stats, AppView indexer cursors, recent moderation actions, and the active
 * federation policy. The summarizer is pure + unit-tested; DB aggregation is a thin wrapper.
 */

export interface OutboxSummary {
  byStatus: Record<string, number>;
  total: number;
}

/** Pure: fold (status,count) rows into a summary. */
export function summarizeOutbox(rows: Array<{ status: string | null; count: number }>): OutboxSummary {
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const key = row.status ?? "unknown";
    const count = Number(row.count) || 0;
    byStatus[key] = (byStatus[key] ?? 0) + count;
    total += count;
  }
  return { byStatus, total };
}

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

export async function getOutboxStats(): Promise<OutboxSummary> {
  try {
    const rows = await db
      .select({ status: wtfosAtprotoOutbox.status, count: sql<number>`count(*)::int` })
      .from(wtfosAtprotoOutbox)
      .groupBy(wtfosAtprotoOutbox.status);
    return summarizeOutbox(rows as Array<{ status: string | null; count: number }>);
  } catch (err) {
    if (missingRelation(err)) return { byStatus: {}, total: 0 };
    throw err;
  }
}

export interface SpineObservability {
  enabled: boolean;
  outbox: OutboxSummary;
  appview: Awaited<ReturnType<typeof appviewIndexerStatus>>;
  moderationRecent: Awaited<ReturnType<typeof recentModerationActions>>;
  federation: {
    crawlRelays: string[];
    pdsHostnames: string[];
    acceptExternal: boolean;
  };
}

export async function getSpineObservability(): Promise<SpineObservability> {
  const fed = federationConfig();
  const [outbox, appview, moderationRecent] = await Promise.all([
    getOutboxStats(),
    appviewIndexerStatus(),
    recentModerationActions(20).catch(() => []),
  ]);
  return {
    enabled: isSpineEnabled(),
    outbox,
    appview,
    moderationRecent,
    federation: {
      crawlRelays: fed.crawlRelays,
      pdsHostnames: fed.pdsHostnames,
      acceptExternal: fed.acceptExternal,
    },
  };
}
