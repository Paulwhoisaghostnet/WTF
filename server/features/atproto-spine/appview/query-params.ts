/**
 * Pure AppView query helpers (S3.2). No DB. Keyset pagination over the read model by
 * descending record id; the cursor is the last seen id.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface ListFilters {
  collection?: string;
  did?: string;
  domain?: string;
  source?: string;
}

export interface Pagination {
  limit: number;
  cursorId?: number;
}

export function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function decodeCursor(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function encodeCursor(id: number | null | undefined): string | undefined {
  return id && id > 0 ? String(id) : undefined;
}

export function parsePagination(query: { limit?: unknown; cursor?: unknown }): Pagination {
  return { limit: clampLimit(query.limit), cursorId: decodeCursor(query.cursor) };
}

/** Extract whitelisted filters from a query object, dropping empties. */
export function parseFilters(query: Record<string, unknown>): ListFilters {
  const pick = (k: string): string | undefined => {
    const v = query[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    collection: pick("collection"),
    did: pick("did"),
    domain: pick("domain"),
    source: pick("source"),
  };
}
