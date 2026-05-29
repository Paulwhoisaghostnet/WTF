import { asc, gt } from "drizzle-orm";
import { boardReactions, boardThreadReplies, boardThreads } from "@shared/schema";
import { db } from "../../../db";
import { isSpineEnabled } from "../config";
import {
  emitBoardChannelToSpine,
  emitBoardPostToSpine,
  emitBoardReactionToSpine,
} from "../social-emit";

/**
 * Identity-social backfill (S4.1). Replays existing canonical board data through the same
 * (flag-gated, best-effort) spine emitters used on the live write paths, so historical
 * content lands in the AT repos + AppView. Idempotent: emitters use deterministic rkeys, so
 * re-running upserts rather than duplicates. Cursor-based + bounded for safe batching.
 */

export interface BackfillResult {
  processed: number;
  lastId: number;
}

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

export async function backfillBoardChannels(opts: { limit?: number; afterId?: number } = {}): Promise<BackfillResult> {
  if (!isSpineEnabled()) return { processed: 0, lastId: opts.afterId ?? 0 };
  const limit = opts.limit ?? 200;
  let lastId = opts.afterId ?? 0;
  let processed = 0;
  try {
    const rows = await db
      .select()
      .from(boardThreads)
      .where(gt(boardThreads.id, lastId))
      .orderBy(asc(boardThreads.id))
      .limit(limit);
    for (const ch of rows) {
      await emitBoardChannelToSpine({
        id: ch.id,
        title: ch.title,
        createdBy: ch.createdBy,
        topic: ch.topic,
        channelType: ch.channelType,
        categoryId: ch.categoryId,
        pinned: ch.pinned,
        locked: ch.locked,
        createdAt: ch.createdAt,
        updatedAt: ch.updatedAt,
      });
      lastId = ch.id;
      processed += 1;
    }
  } catch (err) {
    if (!missingRelation(err)) throw err;
  }
  return { processed, lastId };
}

export async function backfillBoardPosts(opts: { limit?: number; afterId?: number } = {}): Promise<BackfillResult> {
  if (!isSpineEnabled()) return { processed: 0, lastId: opts.afterId ?? 0 };
  const limit = opts.limit ?? 200;
  let lastId = opts.afterId ?? 0;
  let processed = 0;
  try {
    const rows = await db
      .select()
      .from(boardThreadReplies)
      .where(gt(boardThreadReplies.id, lastId))
      .orderBy(asc(boardThreadReplies.id))
      .limit(limit);
    for (const reply of rows) {
      await emitBoardPostToSpine({
        reply: {
          id: reply.id,
          threadId: reply.threadId,
          userId: reply.userId,
          content: reply.content,
          parentReplyId: reply.parentReplyId,
          createdAt: reply.createdAt,
          editedAt: reply.editedAt,
        },
      });
      lastId = reply.id;
      processed += 1;
    }
  } catch (err) {
    if (!missingRelation(err)) throw err;
  }
  return { processed, lastId };
}

export async function backfillBoardReactions(opts: { limit?: number; afterId?: number } = {}): Promise<BackfillResult> {
  if (!isSpineEnabled()) return { processed: 0, lastId: opts.afterId ?? 0 };
  const limit = opts.limit ?? 200;
  let lastId = opts.afterId ?? 0;
  let processed = 0;
  try {
    const rows = await db
      .select()
      .from(boardReactions)
      .where(gt(boardReactions.id, lastId))
      .orderBy(asc(boardReactions.id))
      .limit(limit);
    for (const r of rows) {
      await emitBoardReactionToSpine({
        reactionId: r.id,
        replyId: r.replyId,
        userId: r.userId,
        emoji: r.emoji,
        createdAt: r.createdAt,
      });
      lastId = r.id;
      processed += 1;
    }
  } catch (err) {
    if (!missingRelation(err)) throw err;
  }
  return { processed, lastId };
}

export interface SocialBackfillSummary {
  enabled: boolean;
  channels: BackfillResult;
  posts: BackfillResult;
  reactions: BackfillResult;
}

/** Run a single bounded pass over channels, posts, and reactions. */
export async function runSocialBackfill(opts: { limit?: number } = {}): Promise<SocialBackfillSummary> {
  const enabled = isSpineEnabled();
  return {
    enabled,
    channels: await backfillBoardChannels(opts),
    posts: await backfillBoardPosts(opts),
    reactions: await backfillBoardReactions(opts),
  };
}
