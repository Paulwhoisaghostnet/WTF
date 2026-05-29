import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { FirehoseConsumer, type FirehoseFrame } from "@wtfos/atproto-spine";
import { wtfosAppviewRecords, wtfosAppviewCursor, wtfosAtprotoOutbox } from "@shared/schema";
import { db } from "../../../db";
import { getSpineConfig, isSpineEnabled } from "../config";
import { toAppviewRow, parseAtUri, type RepoOp, type AppviewRow } from "./record-shape";

/**
 * AppView indexer (S3.1). Two ingestion paths:
 *  1. indexFromOutbox(): mirrors OUR OWN published records (PG-canonical) into the read model.
 *  2. startFirehoseIndexer(decodeCommit): indexes EXTERNAL/federated records from the relay
 *     firehose. CAR-commit decoding is injected (deploy supplies @atproto/repo) so the kernel
 *     carries no heavy IPLD deps; without a decoder the consumer simply tracks the cursor.
 *
 * Flag-gated by ATPROTO_SPINE_ENABLED. Idempotent upserts keyed by at:// URI.
 */

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

/** Upsert a single AppView row (idempotent by uri). */
export async function indexAppviewRow(row: AppviewRow): Promise<void> {
  const now = new Date();
  try {
    await db
      .insert(wtfosAppviewRecords)
      .values({
        uri: row.uri,
        did: row.did,
        collection: row.collection,
        rkey: row.rkey,
        cid: row.cid,
        domain: row.domain,
        json: row.json,
        source: row.source,
        indexedAt: now,
      })
      .onConflictDoUpdate({
        target: wtfosAppviewRecords.uri,
        set: { cid: row.cid, json: row.json, domain: row.domain, source: row.source, indexedAt: now },
      });
  } catch (err) {
    if (missingRelation(err)) return;
    throw err;
  }
}

/** Index (or delete) a repo op. */
export async function indexRepoOp(op: RepoOp, source = "firehose"): Promise<void> {
  if (op.action === "delete") {
    const uri = op.uri ?? `at://${op.did}/${op.collection}/${op.rkey}`;
    try {
      await db.delete(wtfosAppviewRecords).where(eq(wtfosAppviewRecords.uri, uri));
    } catch (err) {
      if (!missingRelation(err)) throw err;
    }
    return;
  }
  const row = toAppviewRow(op, source);
  if (row) await indexAppviewRow(row);
}

async function readCursor(service: string): Promise<number> {
  try {
    const [row] = await db
      .select({ cursor: wtfosAppviewCursor.cursor })
      .from(wtfosAppviewCursor)
      .where(eq(wtfosAppviewCursor.service, service))
      .limit(1);
    return row?.cursor ?? 0;
  } catch (err) {
    if (missingRelation(err)) return 0;
    throw err;
  }
}

async function writeCursor(service: string, cursor: number): Promise<void> {
  const now = new Date();
  try {
    await db
      .insert(wtfosAppviewCursor)
      .values({ service, cursor, lastEventAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: wtfosAppviewCursor.service,
        set: { cursor, lastEventAt: now, updatedAt: now },
      });
  } catch (err) {
    if (!missingRelation(err)) throw err;
  }
}

/**
 * Mirror our own published outbox rows into the AppView read model. Processes rows with id >
 * the stored "outbox" cursor that have a recordUri. Returns the number indexed.
 */
export async function indexFromOutbox(limit = 100): Promise<number> {
  if (!isSpineEnabled()) return 0;
  const cursor = await readCursor("outbox");
  let rows: Array<typeof wtfosAtprotoOutbox.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(wtfosAtprotoOutbox)
      .where(
        and(
          gt(wtfosAtprotoOutbox.id, cursor),
          eq(wtfosAtprotoOutbox.status, "published"),
          isNotNull(wtfosAtprotoOutbox.recordUri),
        ),
      )
      .orderBy(asc(wtfosAtprotoOutbox.id))
      .limit(limit);
  } catch (err) {
    if (missingRelation(err)) return 0;
    throw err;
  }

  let indexed = 0;
  let maxId = cursor;
  for (const row of rows) {
    maxId = Math.max(maxId, row.id);
    if (!row.recordUri || !row.targetDid) continue;
    let parts: { did: string; collection: string; rkey: string };
    try {
      parts = parseAtUri(row.recordUri);
    } catch {
      continue;
    }
    await indexRepoOp(
      {
        action: "create",
        did: parts.did,
        collection: parts.collection,
        rkey: parts.rkey,
        cid: row.recordCid,
        uri: row.recordUri,
        record: row.record,
      },
      "outbox",
    );
    indexed += 1;
  }
  if (maxId > cursor) await writeCursor("outbox", maxId);
  return indexed;
}

/** Decoded firehose commit: the repo ops plus the sequence number for cursor bookkeeping. */
export interface DecodedCommit {
  seq?: number;
  ops: RepoOp[];
}

/** Decoder that turns a raw firehose frame into a decoded commit (injected at deploy). */
export type CommitDecoder = (frame: FirehoseFrame) => Promise<DecodedCommit> | DecodedCommit;

export interface FirehoseIndexerHandle {
  stop: () => void;
}

/**
 * Start the firehose indexer for external/federated records. Requires a CommitDecoder
 * (deploy supplies one backed by @atproto/repo). Without one, frames are ignored but the
 * cursor still advances so we never re-scan history.
 */
export async function startFirehoseIndexer(input: {
  decodeCommit?: CommitDecoder;
  relayUrl?: string;
} = {}): Promise<FirehoseIndexerHandle> {
  if (!isSpineEnabled()) throw new Error("atproto_spine_disabled");
  const config = getSpineConfig();
  const url = input.relayUrl ?? config.relayUrl;
  if (!url) throw new Error("relay_url_unconfigured");

  const consumer = new FirehoseConsumer({
    url,
    getCursor: async () => (await readCursor(url)) || undefined,
    saveCursor: async (cursor) => {
      const seq = Number(cursor);
      if (Number.isFinite(seq)) await writeCursor(url, seq);
    },
    onFrame: async (frame: FirehoseFrame) => {
      if (!input.decodeCommit) return;
      const { seq, ops } = await input.decodeCommit(frame);
      for (const op of ops) await indexRepoOp(op, "firehose");
      if (typeof seq === "number") await writeCursor(url, seq);
    },
  });
  await consumer.start();
  return { stop: () => consumer.stop() };
}

/** Indexer status for admin/observability surfaces. */
export async function appviewIndexerStatus() {
  const config = getSpineConfig();
  try {
    const outboxCursor = await readCursor("outbox");
    const relayCursor = config.relayUrl ? await readCursor(config.relayUrl) : 0;
    return { enabled: isSpineEnabled(), outboxCursor, relayCursor, relayUrl: config.relayUrl ?? null };
  } catch {
    return { enabled: isSpineEnabled(), outboxCursor: 0, relayCursor: 0, relayUrl: config.relayUrl ?? null };
  }
}
