import { sql } from "drizzle-orm";
import { db } from "../db";
import { register, type JobResult } from "./scheduler";
import {
  resolveObjktTezosAddressesForHandle,
  upsertXTezosIdentityHints,
} from "./objkt-identity";

export async function selectXTezosIdentityCandidates(limit = 20): Promise<string[]> {
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT LOWER(author_handle) AS handle, fetched_at AS seen_at
      FROM x_timeline_posts
      WHERE author_handle IS NOT NULL AND author_handle <> ''
    ),
    ranked AS (
      SELECT handle, MAX(seen_at) AS last_seen_at
      FROM candidates
      WHERE handle ~ '^[a-z0-9_]{1,15}$'
      GROUP BY handle
    ),
    stale AS (
      SELECT r.handle, r.last_seen_at, MAX(h.last_checked_at) AS last_checked_at
      FROM ranked r
      LEFT JOIN x_tezos_identity_hints h
        ON h.twitter_handle = r.handle
       AND h.source = 'objkt_holder_twitter'
      GROUP BY r.handle, r.last_seen_at
    )
    SELECT handle
    FROM stale
    WHERE last_checked_at IS NULL
       OR last_checked_at < NOW() - INTERVAL '7 days'
    ORDER BY last_checked_at ASC NULLS FIRST, last_seen_at DESC
    LIMIT ${Math.max(1, Math.min(limit, 100))}
  `);
  const rows = ((result as any).rows ?? []) as Array<{ handle: string }>;
  return rows.map((row) => row.handle).filter(Boolean);
}

export async function runXTezosIdentityEnrichment(limit = 20): Promise<JobResult> {
  const handles = await selectXTezosIdentityCandidates(limit);
  let written = 0;
  for (const handle of handles) {
    try {
      const hints = await resolveObjktTezosAddressesForHandle(handle);
      written += await upsertXTezosIdentityHints(hints);
    } catch (err) {
      console.warn(
        `[x-tezos-identity] ${handle}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return { itemsIn: handles.length, itemsOut: written };
}

export function registerXTezosIdentityEnrichment(): void {
  register({
    name: "x-tezos-identity-enrichment",
    fn: () => runXTezosIdentityEnrichment(),
    intervalMs: Math.max(5 * 60_000, Number(process.env.X_TEZOS_IDENTITY_INTERVAL_MS || 30 * 60_000)),
    initialDelayMs: 3 * 60_000,
  });
}
