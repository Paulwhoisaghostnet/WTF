import { pool } from "../../db";
import { HORF_CURRENT_SEASON_KEY, resolveHorfSeason } from "./seasons";
import { HORF_MAINNET_BLOCK_MS } from "./mainnet";
import { fetchOpenRangeMintPage, type OpenRangeMode } from "./open-range-source";

export type OpenRangeMintPage = Awaited<ReturnType<typeof fetchOpenRangeMintPage>>;
export type CachedOpenRangeMintPage = OpenRangeMintPage & {
  cacheStatus: "cached" | "refreshed" | "stale";
};

export type StoredOpenRangePage = { page: OpenRangeMintPage; fetchedAt: number };
export type OpenRangePageStore = {
  read: (mode: OpenRangeMode, cursor: string) => Promise<StoredOpenRangePage | null>;
  write: (mode: OpenRangeMode, cursor: string, fresh: OpenRangeMintPage) => Promise<OpenRangeMintPage>;
};

function pageKey(mode: OpenRangeMode, cursor: string): string {
  return JSON.stringify([mode, cursor]);
}

function activeSource(mode: OpenRangeMode): boolean {
  return mode === "all-horse-search" || mode === "all-seasons" ||
    mode === HORF_CURRENT_SEASON_KEY || resolveHorfSeason(mode)?.endsAt === null;
}

/** Source pages can change as Objkt indexes older mints. Keep prior discoveries
 * and their cursor path while taking fresh metadata for tokens seen again. */
export function mergeOpenRangeMintPages(
  previous: OpenRangeMintPage | null,
  fresh: OpenRangeMintPage,
): OpenRangeMintPage {
  if (!previous) return fresh;
  const items = new Map(previous.items.map((item) => [`${item.contract}/${item.tokenId}`, item]));
  for (const item of fresh.items) items.set(`${item.contract}/${item.tokenId}`, item);
  const keepPriorCursor = previous.hasMore && previous.nextCursor !== null;
  return {
    items: [...items.values()],
    nextCursor: keepPriorCursor ? previous.nextCursor : fresh.nextCursor,
    hasMore: keepPriorCursor || fresh.hasMore,
    asOf: fresh.asOf,
    sourceRows: fresh.sourceRows,
    mediaVersion: fresh.mediaVersion,
  };
}

type CachedPageRow = { page: unknown; fetched_at: Date };

function validStoredPage(value: unknown): value is OpenRangeMintPage {
  const row = value as Partial<OpenRangeMintPage> | null;
  return !!row && Array.isArray(row.items) && row.items.every((item) =>
    item && typeof item.contract === "string" && typeof item.tokenId === "string" && typeof item.name === "string") &&
    (row.nextCursor === null || typeof row.nextCursor === "string") &&
    typeof row.hasMore === "boolean" && typeof row.asOf === "string" &&
    typeof row.sourceRows === "number";
}

export const postgresOpenRangePageStore: OpenRangePageStore = {
  async read(mode, cursor) {
    const result = await pool.query<CachedPageRow>(
      `SELECT page, fetched_at FROM public.horf_open_range_page_cache
        WHERE mode = $1 AND cursor = $2`, [mode, cursor]);
    const row = result.rows[0];
    if (!row) return null;
    if (!validStoredPage(row.page)) throw new Error("Stored Open Range horse page is invalid");
    return { page: row.page, fetchedAt: new Date(row.fetched_at).getTime() };
  },
  async write(mode, cursor, fresh) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Insert the first snapshot before locking so simultaneous server
      // instances also serialize on a previously missing page.
      await client.query(
        `INSERT INTO public.horf_open_range_page_cache (mode, cursor, page, fetched_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (mode, cursor) DO NOTHING`,
        [mode, cursor, JSON.stringify(fresh)],
      );
      const result = await client.query<CachedPageRow>(
        `SELECT page, fetched_at FROM public.horf_open_range_page_cache
          WHERE mode = $1 AND cursor = $2 FOR UPDATE`, [mode, cursor]);
      const previous = result.rows[0]?.page;
      if (!validStoredPage(previous)) throw new Error("Stored Open Range horse page is invalid");
      const merged = mergeOpenRangeMintPages(previous, fresh);
      await client.query(
        `UPDATE public.horf_open_range_page_cache
         SET page = $3::jsonb, fetched_at = now()
         WHERE mode = $1 AND cursor = $2`,
        [mode, cursor, JSON.stringify(merged)],
      );
      await client.query("COMMIT");
      return merged;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

export function createOpenRangePageCache(
  store: OpenRangePageStore,
  loadFresh: (mode: OpenRangeMode, cursor: string) => Promise<OpenRangeMintPage> = fetchOpenRangeMintPage,
  now: () => number = Date.now,
) {
  const refreshing = new Map<string, Promise<OpenRangeMintPage>>();
  const lastBackgroundAttempt = new Map<string, number>();

  function refresh(mode: OpenRangeMode, cursor: string) {
    const key = pageKey(mode, cursor);
    const running = refreshing.get(key);
    if (running) return running;
    const work = (async () => {
      const fresh = await loadFresh(mode, cursor);
      return store.write(mode, cursor, fresh);
    })();
    refreshing.set(key, work);
    void work.finally(() => { if (refreshing.get(key) === work) refreshing.delete(key); }).catch(() => {});
    return work;
  }

  return async function cachedOpenRangeMintPage(
    mode: OpenRangeMode,
    cursor: string,
    options: { refresh?: boolean } = {},
  ): Promise<CachedOpenRangeMintPage> {
    const stored = await store.read(mode, cursor);
    // Older cache snapshots only contain Objkt's collection thumbnail. A page
    // version avoids repeatedly refreshing historical rows retained by merge.
    const lacksTokenMedia = stored && stored.page.mediaVersion !== 1;
    if (stored && !options.refresh && !lacksTokenMedia) {
      const key = pageKey(mode, cursor);
      const lastAttempt = lastBackgroundAttempt.get(key) ?? 0;
      if (activeSource(mode) && now() - stored.fetchedAt >= HORF_MAINNET_BLOCK_MS &&
          now() - lastAttempt >= HORF_MAINNET_BLOCK_MS) {
        lastBackgroundAttempt.set(key, now());
        void refresh(mode, cursor).catch((error) =>
          console.warn("[horf] Open Range background refresh failed:", error));
      }
      return { ...stored.page, cacheStatus: "cached" };
    }
    try {
      const page = await refresh(mode, cursor);
      return { ...page, cacheStatus: "refreshed" };
    } catch (error) {
      if (stored) return { ...stored.page, cacheStatus: "stale" };
      throw error;
    }
  };
}

export const cachedOpenRangeMintPage = createOpenRangePageCache(postgresOpenRangePageStore);
