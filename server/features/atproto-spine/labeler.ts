import { challengeAutomationAuditLogs } from "@shared/schema";
import { db } from "../../db";
import { isSpineEnabled } from "./config";
import { buildLabel, isBanLabel, labelerDid, type AtprotoLabel } from "./labeler-policy";

/**
 * Labeler service (S2.8). Applies/negates moderation labels with a durable audit trail.
 * Flag-gated by ATPROTO_SPINE_ENABLED. Audit rows go to challengeAutomationAuditLogs (the
 * same table admins already review) so moderation is fully auditable without new schema.
 *
 * Label SIGNING + serving over com.atproto.label.* is performed by the self-hosted labeler
 * (Ozone) container; this kernel layer is the authority that records WHO labeled WHAT and WHY.
 */

export const LABELER_DISABLED = "atproto_spine_disabled";

async function recordModerationAudit(input: {
  userId?: number | null;
  action: string;
  status: string;
  message?: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(challengeAutomationAuditLogs).values({
      userId: input.userId ?? null,
      action: input.action,
      status: input.status,
      message: input.message ?? null,
      metadata: input.metadata,
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== "42P01") throw err;
  }
}

export interface ApplyLabelInput {
  /** Subject DID (account) or at:// URI (record). */
  subjectUri: string;
  /** Label value (must be known). */
  val: string;
  /** wtfOS user id of the subject, for audit linkage. */
  subjectUserId?: number | null;
  /** Optional record CID. */
  cid?: string;
  /** Moderator/admin DID or id performing the action. */
  actorDid?: string;
  reason?: string;
  exp?: string;
}

export interface LabelActionResult {
  label: AtprotoLabel;
  isBan: boolean;
}

/** Apply a label to a subject and audit it. */
export async function applyLabel(input: ApplyLabelInput): Promise<LabelActionResult> {
  if (!isSpineEnabled()) throw new Error(LABELER_DISABLED);
  const label = buildLabel({
    src: labelerDid(),
    uri: input.subjectUri,
    cid: input.cid,
    val: input.val,
    exp: input.exp,
  });
  const isBan = isBanLabel(input.val);
  await recordModerationAudit({
    userId: input.subjectUserId,
    action: "moderation.label.applied",
    status: isBan ? "banned" : "labeled",
    message: input.reason,
    metadata: { label, actorDid: input.actorDid ?? null, isBan },
  });
  return { label, isBan };
}

/** Negate (remove) a previously applied label and audit it. */
export async function negateLabel(input: ApplyLabelInput): Promise<LabelActionResult> {
  if (!isSpineEnabled()) throw new Error(LABELER_DISABLED);
  const label = buildLabel({
    src: labelerDid(),
    uri: input.subjectUri,
    cid: input.cid,
    val: input.val,
    neg: true,
  });
  await recordModerationAudit({
    userId: input.subjectUserId,
    action: "moderation.label.negated",
    status: "unlabeled",
    message: input.reason,
    metadata: { label, actorDid: input.actorDid ?? null },
  });
  return { label, isBan: false };
}

/** Read recent moderation audit rows for an admin surface. */
export async function recentModerationActions(limit = 50) {
  try {
    const { desc, inArray } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(challengeAutomationAuditLogs)
      .where(inArray(challengeAutomationAuditLogs.action, ["moderation.label.applied", "moderation.label.negated"]))
      .orderBy(desc(challengeAutomationAuditLogs.id))
      .limit(limit);
    return rows;
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return [];
    throw err;
  }
}
