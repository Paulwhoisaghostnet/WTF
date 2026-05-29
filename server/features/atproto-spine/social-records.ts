import type { BoardChannel, BoardPost, BoardReaction } from "@shared/atproto";
import { getSpineConfig } from "./config";
import { buildAtUri } from "./appview/record-shape";

/**
 * Pure Message Board record builders (S4.2). No DB/network, so they unit-test cheaply. The
 * DB-bound emit functions live in ./social-emit.ts.
 */

export const BOARD_CHANNEL_COLLECTION = "app.wtfos.social.board.channel";
export const BOARD_POST_COLLECTION = "app.wtfos.social.board.post";
export const BOARD_REACTION_COLLECTION = "app.wtfos.social.board.reaction";

export interface BoardThreadRow {
  id: number;
  title: string;
  createdBy: number;
  topic?: string | null;
  channelType?: string | null;
  categoryId?: number | null;
  pinned?: boolean | null;
  locked?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface BoardReplyRow {
  id: number;
  threadId: number;
  userId: number;
  content: string;
  parentReplyId?: number | null;
  createdAt?: Date | string | null;
  editedAt?: Date | string | null;
}

export function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function channelRkey(channelId: number | string): string {
  return `channel-${channelId}`;
}
export function postRkey(postId: number | string): string {
  return `post-${postId}`;
}

/** at:// URI of a board channel in the master repo. */
export function channelRef(channelId: number | string, masterDid?: string): string {
  const did = masterDid ?? getSpineConfig().master.repoDid ?? "did:web:wtfos.me";
  return buildAtUri(did, BOARD_CHANNEL_COLLECTION, channelRkey(channelId));
}

export function buildBoardChannelRecord(thread: BoardThreadRow): Omit<BoardChannel, "$type"> {
  return {
    schemaVersion: 1,
    channelId: String(thread.id),
    title: thread.title,
    topic: thread.topic ?? undefined,
    categoryId: thread.categoryId != null ? String(thread.categoryId) : undefined,
    channelType: thread.channelType ?? undefined,
    pinned: thread.pinned ?? undefined,
    locked: thread.locked ?? undefined,
    createdAt: iso(thread.createdAt),
    updatedAt: thread.updatedAt ? iso(thread.updatedAt) : undefined,
  };
}

export function buildBoardPostRecord(input: {
  reply: BoardReplyRow;
  channelRef: string;
  parentRef?: string;
  mediaRefs?: string[];
}): Omit<BoardPost, "$type"> {
  return {
    schemaVersion: 1,
    postId: String(input.reply.id),
    channelRef: input.channelRef,
    parentRef: input.parentRef,
    text: input.reply.content ?? "",
    mediaRefs: input.mediaRefs && input.mediaRefs.length ? input.mediaRefs : undefined,
    createdAt: iso(input.reply.createdAt),
    editedAt: input.reply.editedAt ? iso(input.reply.editedAt) : undefined,
  };
}

export function buildBoardReactionRecord(input: {
  subjectRef: string;
  emoji: string;
  createdAt?: Date | string | null;
}): Omit<BoardReaction, "$type"> {
  return {
    schemaVersion: 1,
    subjectRef: input.subjectRef,
    emoji: input.emoji,
    createdAt: iso(input.createdAt),
  };
}
