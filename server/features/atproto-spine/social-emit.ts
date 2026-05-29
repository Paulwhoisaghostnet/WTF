import { eq } from "drizzle-orm";
import { boardThreadReplies } from "@shared/schema";
import { db } from "../../db";
import { getSpineConfig, isSpineEnabled } from "./config";
import { enqueueSpineRecord, echoRecordToMaster } from "./service";
import { buildAtUri } from "./appview/record-shape";
import { resolveSpineIdentity } from "./identity-resolve";
import {
  BOARD_CHANNEL_COLLECTION,
  BOARD_POST_COLLECTION,
  BOARD_REACTION_COLLECTION,
  buildBoardChannelRecord,
  buildBoardPostRecord,
  buildBoardReactionRecord,
  channelRef,
  channelRkey,
  postRkey,
  type BoardReplyRow,
  type BoardThreadRow,
} from "./social-records";

/**
 * Message Board → spine emission (S4.2). Additive + flag-gated: each board write also
 * publishes the matching app.wtfos.social.* record to the author's repo (and a master echo),
 * WITHOUT changing the board's own behavior. The pure builders live in ./social-records.ts;
 * these emit fns are best-effort and silently no-op when the spine is off or the author has
 * no provisioned repo.
 */

export * from "./social-records";

/** Emit a board channel to the master repo (channels are WTF-owned infra). */
export async function emitBoardChannelToSpine(thread: BoardThreadRow): Promise<void> {
  if (!isSpineEnabled()) return;
  const config = getSpineConfig();
  await enqueueSpineRecord({
    userId: thread.createdBy,
    type: BOARD_CHANNEL_COLLECTION,
    record: buildBoardChannelRecord(thread) as unknown as Record<string, unknown>,
    rkeyParts: [channelRkey(thread.id)],
    targetType: "primary_wtfos_repo",
    targetDid: config.master.repoDid ?? null,
    targetHandle: config.master.identifier ?? null,
    targetPdsUrl: config.master.url,
    sourceRefType: "board_thread",
    sourceRefId: String(thread.id),
  }).catch(() => undefined);
}

/** Emit a board post to the author's repo + master echo. No-op without a provisioned repo. */
export async function emitBoardPostToSpine(input: {
  reply: BoardReplyRow;
  mediaRefs?: string[];
}): Promise<void> {
  if (!isSpineEnabled()) return;
  const identity = await resolveSpineIdentity(input.reply.userId).catch(() => null);
  if (!identity?.hasRepo || !identity.repoDid) return;

  const ref = channelRef(input.reply.threadId);
  const record = buildBoardPostRecord({ reply: input.reply, channelRef: ref, mediaRefs: input.mediaRefs });
  await enqueueSpineRecord({
    userId: input.reply.userId,
    wtfosIdentityId: identity.identityId,
    type: BOARD_POST_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkeyParts: [postRkey(input.reply.id)],
    targetType: "user_wtfos_repo",
    targetDid: identity.repoDid,
    targetHandle: identity.handle,
    targetPdsUrl: identity.pdsUrl,
    sourceRefType: "board_thread_reply",
    sourceRefId: String(input.reply.id),
  }).catch(() => undefined);

  await echoRecordToMaster({
    userId: input.reply.userId,
    fact: {
      factRepo: identity.repoDid,
      factCollection: BOARD_POST_COLLECTION,
      factRkey: postRkey(input.reply.id),
      summary: { channelId: input.reply.threadId, text: (input.reply.content ?? "").slice(0, 280) },
    },
    sourceRefType: "board_thread_reply",
    sourceRefId: String(input.reply.id),
  }).catch(() => undefined);
}

/** Emit a board reaction to the reactor's repo, pointing at the post's at:// URI. */
export async function emitBoardReactionToSpine(input: {
  reactionId: number;
  replyId: number;
  userId: number;
  emoji: string;
  createdAt?: Date | string | null;
}): Promise<void> {
  if (!isSpineEnabled()) return;
  const reactor = await resolveSpineIdentity(input.userId).catch(() => null);
  if (!reactor?.hasRepo || !reactor.repoDid) return;

  // Resolve the post author's repo to build the subject URI.
  let postAuthorId: number | null = null;
  try {
    const [reply] = await db
      .select({ userId: boardThreadReplies.userId })
      .from(boardThreadReplies)
      .where(eq(boardThreadReplies.id, input.replyId))
      .limit(1);
    postAuthorId = reply?.userId ?? null;
  } catch {
    postAuthorId = null;
  }
  if (!postAuthorId) return;
  const author = await resolveSpineIdentity(postAuthorId).catch(() => null);
  if (!author?.repoDid) return;

  const subjectRef = buildAtUri(author.repoDid, BOARD_POST_COLLECTION, postRkey(input.replyId));
  await enqueueSpineRecord({
    userId: input.userId,
    wtfosIdentityId: reactor.identityId,
    type: BOARD_REACTION_COLLECTION,
    record: buildBoardReactionRecord({ subjectRef, emoji: input.emoji, createdAt: input.createdAt }) as unknown as Record<string, unknown>,
    rkeyParts: [postRkey(input.replyId), input.userId, input.emoji],
    targetType: "user_wtfos_repo",
    targetDid: reactor.repoDid,
    targetHandle: reactor.handle,
    targetPdsUrl: reactor.pdsUrl,
    sourceRefType: "board_reaction",
    sourceRefId: String(input.reactionId),
  }).catch(() => undefined);
}
