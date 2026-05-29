import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { wtfosAppviewRecords } from "@shared/schema";
import { db } from "../../../db";
import {
  encodeCursor,
  type ListFilters,
  type Pagination,
} from "./query-params";

/**
 * AppView read queries (S3.2) over the wtfos_appview_records read model. Keyset paginated by
 * descending id. Returns rows + a next cursor. Safe against the table not existing yet.
 */

type Row = typeof wtfosAppviewRecords.$inferSelect;

export interface ListResult {
  records: Row[];
  cursor?: string;
}

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

export async function listAppviewRecords(filters: ListFilters, page: Pagination): Promise<ListResult> {
  const conditions: SQL[] = [];
  if (filters.collection) conditions.push(eq(wtfosAppviewRecords.collection, filters.collection));
  if (filters.did) conditions.push(eq(wtfosAppviewRecords.did, filters.did));
  if (filters.domain) conditions.push(eq(wtfosAppviewRecords.domain, filters.domain));
  if (filters.source) conditions.push(eq(wtfosAppviewRecords.source, filters.source));
  if (page.cursorId) conditions.push(lt(wtfosAppviewRecords.id, page.cursorId));

  try {
    const rows = await db
      .select()
      .from(wtfosAppviewRecords)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(wtfosAppviewRecords.id))
      .limit(page.limit + 1);

    const hasMore = rows.length > page.limit;
    const records = hasMore ? rows.slice(0, page.limit) : rows;
    const cursor = hasMore ? encodeCursor(records[records.length - 1]?.id) : undefined;
    return { records, cursor };
  } catch (err) {
    if (missingRelation(err)) return { records: [] };
    throw err;
  }
}

export async function getAppviewRecordByUri(uri: string): Promise<Row | null> {
  try {
    const [row] = await db
      .select()
      .from(wtfosAppviewRecords)
      .where(eq(wtfosAppviewRecords.uri, uri))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}
