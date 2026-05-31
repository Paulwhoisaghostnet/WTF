import { wtfosAtprotoOutbox } from "@shared/schema";
import { db } from "../../db";
import { isSpineEnabled } from "../atproto-spine/config";
import { SPINE_DISABLED_REASON, SPINE_TARGET_MISSING_REASON } from "../atproto-spine/service";

type OutboxRow = typeof wtfosAtprotoOutbox.$inferSelect;

function missingRelation(err: unknown): boolean {
  return (
    (err as { code?: string })?.code === "42P01" ||
    String((err as { message?: string })?.message || err).includes("does not exist")
  );
}

export async function enqueueCrpOutboxRecord(input: {
  userId: number;
  wtfosIdentityId?: number | null;
  targetType: OutboxRow["targetType"];
  targetDid: string | null;
  targetHandle?: string | null;
  targetPdsUrl?: string | null;
  collection: string;
  rkey: string;
  record: Record<string, unknown>;
  sourceEventType: string;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
}): Promise<OutboxRow | null> {
  const now = new Date();
  const enabled = isSpineEnabled();
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
        targetType: input.targetType,
        targetDid: input.targetDid,
        targetHandle: input.targetHandle ?? null,
        targetPdsUrl: input.targetPdsUrl ?? null,
        collection: input.collection,
        rkey: input.rkey,
        record: input.record,
        sourceEventType: input.sourceEventType,
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
