import { AtpAgent } from "@atproto/api";
import { and, asc, desc, eq } from "drizzle-orm";
import { type LexiconId } from "@shared/atproto";
import { wtfosAtprotoOutbox } from "@shared/schema";
import { db } from "../../db";
import {
  getSpineConfig,
  isSpineEnabled,
  WTFOS_DOMAINS,
  type WtfosDomain,
} from "./config";
import { buildSpineWrite } from "./records";

export { buildSpineWrite } from "./records";

/**
 * Kernel AT Protocol spine service (S2.1).
 *
 * Provides a flag-gated publish/read facade for the structured app.wtfos.* lexicons,
 * layered ON TOP of the pre-existing tz2at outbox (server/features/tz2at/wtfos-outbox.ts).
 * Every publish is validated against the lexicon registry, mapped to a deterministic
 * rkey, and enqueued into wtfos_atproto_outbox so the existing worker
 * (publishQueuedWtfosOutbox) drains it. The master flag ATPROTO_SPINE_ENABLED gates
 * whether rows are queued for delivery; when off, rows are recorded as "skipped" so the
 * intent stays auditable with zero network side effects.
 */

export const SPINE_DISABLED_REASON = "atproto_spine_disabled";
export const SPINE_TARGET_MISSING_REASON = "atproto_spine_target_unconfigured";

type OutboxRow = typeof wtfosAtprotoOutbox.$inferSelect;
type OutboxTarget = "primary_wtfos_repo" | "user_wtfos_repo";

export interface SpineRecordInput {
  /** Authoring/owning wtfOS user (outbox.userId is NOT NULL). */
  userId: number;
  /** Lexicon NSID, e.g. "app.wtfos.social.board.post". */
  type: LexiconId;
  /** The record body (without $type; it is injected during mapping). */
  record: Record<string, unknown>;
  /** Deterministic rkey parts (idempotent re-publish). Falls back to "self". */
  rkeyParts?: Array<string | number | null | undefined>;
  /** Which repo this lands in. Defaults to the authoring user's wtf repo. */
  targetType?: OutboxTarget;
  targetDid?: string | null;
  targetHandle?: string | null;
  targetPdsUrl?: string | null;
  wtfosIdentityId?: number | null;
  sourceEventType?: string | null;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
}

function missingRelation(err: unknown): boolean {
  return (
    (err as { code?: string })?.code === "42P01" ||
    String((err as { message?: string })?.message || err).includes("does not exist")
  );
}

/**
 * Validate + enqueue a structured record into the outbox. Returns the row, or null if
 * the outbox table is not migrated yet. Throws LexiconValidationError on bad records.
 */
export async function enqueueSpineRecord(input: SpineRecordInput): Promise<OutboxRow | null> {
  const write = buildSpineWrite(input.type, input.record, input.rkeyParts);
  const now = new Date();
  const enabled = isSpineEnabled();
  const targetType: OutboxTarget = input.targetType ?? "user_wtfos_repo";
  const hasTarget = Boolean(input.targetDid);

  let status: OutboxRow["status"] = "queued";
  let lastError: string | null = null;
  if (!enabled) {
    status = "skipped";
    lastError = SPINE_DISABLED_REASON;
  } else if (!hasTarget) {
    status = "skipped";
    lastError = SPINE_TARGET_MISSING_REASON;
  }

  try {
    const [row] = await db
      .insert(wtfosAtprotoOutbox)
      .values({
        userId: input.userId,
        wtfosIdentityId: input.wtfosIdentityId ?? null,
        targetType,
        targetDid: input.targetDid ?? null,
        targetHandle: input.targetHandle ?? null,
        targetPdsUrl: input.targetPdsUrl ?? null,
        collection: write.collection,
        rkey: write.rkey,
        record: write.record,
        sourceEventType: input.sourceEventType ?? input.type,
        sourceRefType: input.sourceRefType ?? null,
        sourceRefId: input.sourceRefId ?? null,
        status,
        lastError,
        scheduledAt: now,
        updatedAt: now,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}

function pdsUrlForDomain(domain: WtfosDomain | "master"): string {
  const config = getSpineConfig();
  if (domain === "master") return config.master.url;
  return config.domains[domain]?.url ?? config.master.url;
}

export interface SpineReadOptions {
  repoDid: string;
  type: LexiconId | string;
  domain?: WtfosDomain | "master";
  pdsUrl?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Read records from a repo via the PDS public listRecords XRPC (unauthenticated). This is
 * a kernel convenience for direct repo reads; aggregated cross-repo reads come from the
 * AppView (S3.2). Returns the raw XRPC payload.
 */
export async function readSpineRecords(opts: SpineReadOptions) {
  const service = opts.pdsUrl ?? pdsUrlForDomain(opts.domain ?? "master");
  const agent = new AtpAgent({ service });
  const res = await agent.com.atproto.repo.listRecords({
    repo: opts.repoDid,
    collection: opts.type,
    limit: Math.max(1, Math.min(opts.limit ?? 50, 100)),
    cursor: opts.cursor,
  });
  return res.data;
}

/** Lightweight, side-effect-free status for admin/observability surfaces (S5.1). */
export async function spineStatus() {
  const config = getSpineConfig();
  const base = {
    enabled: isSpineEnabled(),
    networkDomain: config.networkDomain,
    namespace: config.lexiconNamespace,
    domains: WTFOS_DOMAINS,
    masterConfigured: Boolean(config.master.repoDid && (config.master.password || config.master.adminPassword)),
  };
  try {
    const recent = await db
      .select({ status: wtfosAtprotoOutbox.status })
      .from(wtfosAtprotoOutbox)
      .orderBy(desc(wtfosAtprotoOutbox.id))
      .limit(500);
    const counts = recent.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    return { ...base, outbox: counts };
  } catch (err) {
    if (missingRelation(err)) return { ...base, outbox: null };
    throw err;
  }
}

/**
 * Enqueue an app.wtfos.index.ref pointer echo into the MASTER repo for a canonical fact.
 * Reuses the structured outbox; flag-gated like all spine publishes. The master repo DID
 * comes from spine config (the WTF-owned did:web/did:plc).
 */
export async function echoRecordToMaster(input: {
  userId: number;
  fact: import("./echo-router").FactRef;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
}): Promise<OutboxRow | null> {
  const { buildIndexRef, echoRkeyParts } = await import("./echo-router");
  const config = getSpineConfig();
  return enqueueSpineRecord({
    userId: input.userId,
    type: "app.wtfos.index.ref",
    record: buildIndexRef(input.fact) as unknown as Record<string, unknown>,
    rkeyParts: echoRkeyParts(input.fact),
    targetType: "primary_wtfos_repo",
    targetDid: config.master.repoDid ?? null,
    targetHandle: config.master.identifier ?? null,
    targetPdsUrl: config.master.url,
    sourceEventType: "app.wtfos.index.ref",
    sourceRefType: input.sourceRefType ?? "echo",
    sourceRefId: input.sourceRefId ?? `${input.fact.factCollection}:${input.fact.factRkey}`,
  });
}

/** Drain queued structured rows for a target via the shared worker. */
export async function listQueuedSpineRows(targetDid: string, limit = 25): Promise<OutboxRow[]> {
  try {
    return await db
      .select()
      .from(wtfosAtprotoOutbox)
      .where(and(eq(wtfosAtprotoOutbox.targetDid, targetDid), eq(wtfosAtprotoOutbox.status, "queued")))
      .orderBy(asc(wtfosAtprotoOutbox.scheduledAt), asc(wtfosAtprotoOutbox.id))
      .limit(limit);
  } catch (err) {
    if (missingRelation(err)) return [];
    throw err;
  }
}
