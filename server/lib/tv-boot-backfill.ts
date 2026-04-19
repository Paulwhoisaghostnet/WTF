import { pool } from "../db";

/**
 * One-shot, idempotent backfill that runs on server boot *after* the
 * drizzle-kit `push` pass.  We prefer idempotent SQL over a Drizzle
 * migration here because the deploy pipeline is `push --force`, which
 * applies schema changes but cannot carry data.
 *
 * Each step below is guarded so re-running the function is cheap:
 *   - `sort_order`:      only updates rows still at the default `0`
 *   - `tv_bumpers.category`: column defaults to 'personal'; nothing to do
 *   - `tv_channel_videos` creator/collection/minted:
 *       only fills rows where the target columns are NULL, pulling
 *       values out of the existing `metadata` jsonb using the same
 *       extraction rules the TV code uses for new inserts.
 *
 * Safe to call on every boot — does nothing once rows are populated.
 */
export async function runTvBootBackfill(): Promise<void> {
  const client = await pool.connect();
  try {
    const results: Record<string, number> = {};

    // 1) tv_channels.sort_order = id for any row still at 0.
    //    Channels predating this column land at 0 by the DDL default.
    //    Aligning sort_order with id preserves the chronological order
    //    that `ORDER BY id ASC` already produced, so the list on screen
    //    doesn't visibly jump after the upgrade.
    const channelsRes = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE tv_channels
            SET sort_order = id
          WHERE sort_order = 0
       RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`
    );
    results["tv_channels.sort_order"] = Number(channelsRes.rows[0]?.count || 0);

    // 2) tv_channel_videos — extract MTV-style display fields from the
    //    JSON blob we already have.  The tokens we know about are
    //    Objkt/TZIP-12 style, so we look at:
    //      - creators:            metadata->'creators' (array of strings)
    //      - creator address:     creators[0] when it matches tz1…/KT1…
    //      - collection name:     metadata->>'collectionName'
    //                             OR metadata->'contract'->>'name'
    //      - minted:              metadata->>'date' (ISO 8601)
    //    Rows that don't have one of these keep a NULL in the new column
    //    and the client falls back to "Unknown" in the overlay.
    const videosRes = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE tv_channel_videos AS v
            SET creator_name = COALESCE(
                  v.creator_name,
                  NULLIF(
                    CASE
                      WHEN jsonb_typeof(v.metadata -> 'creators') = 'array'
                           AND jsonb_array_length(v.metadata -> 'creators') > 0
                      THEN v.metadata -> 'creators' ->> 0
                      WHEN jsonb_typeof(v.metadata -> 'authors') = 'array'
                           AND jsonb_array_length(v.metadata -> 'authors') > 0
                      THEN v.metadata -> 'authors' ->> 0
                      ELSE NULL
                    END,
                    ''
                  )
                ),
                creator_address = COALESCE(
                  v.creator_address,
                  NULLIF(
                    CASE
                      WHEN jsonb_typeof(v.metadata -> 'creators') = 'array'
                           AND jsonb_array_length(v.metadata -> 'creators') > 0
                           AND (v.metadata -> 'creators' ->> 0) ~ '^(tz1|tz2|tz3|KT1)'
                      THEN v.metadata -> 'creators' ->> 0
                      ELSE NULL
                    END,
                    ''
                  )
                ),
                collection_name = COALESCE(
                  v.collection_name,
                  NULLIF(
                    COALESCE(
                      v.metadata ->> 'collectionName',
                      v.metadata -> 'collection' ->> 'name',
                      v.metadata -> 'contract'   ->> 'name'
                    ),
                    ''
                  )
                ),
                minted_at = COALESCE(
                  v.minted_at,
                  CASE
                    WHEN v.metadata ->> 'date' ~ '^\\d{4}-\\d{2}-\\d{2}'
                    THEN (v.metadata ->> 'date')::timestamp
                    ELSE NULL
                  END
                )
          WHERE v.creator_name     IS NULL
             OR v.creator_address  IS NULL
             OR v.collection_name  IS NULL
             OR v.minted_at        IS NULL
       RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`
    );
    results["tv_channel_videos.metadata"] = Number(videosRes.rows[0]?.count || 0);

    console.log("[tv-backfill]", results);
  } catch (err) {
    console.warn("[tv-backfill] non-fatal boot backfill error:", err);
  } finally {
    client.release();
  }
}
