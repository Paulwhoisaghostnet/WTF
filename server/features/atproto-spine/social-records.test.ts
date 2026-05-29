import test from "node:test";
import assert from "node:assert/strict";
import { boardChannelSchema, boardPostSchema, boardReactionSchema } from "@shared/atproto";
import {
  buildBoardChannelRecord,
  buildBoardPostRecord,
  buildBoardReactionRecord,
  channelRef,
  channelRkey,
  postRkey,
  BOARD_CHANNEL_COLLECTION,
  BOARD_POST_COLLECTION,
  BOARD_REACTION_COLLECTION,
} from "./social-records";

test("deterministic rkeys are stable", () => {
  assert.equal(channelRkey(12), "channel-12");
  assert.equal(postRkey(99), "post-99");
});

test("channelRef builds an at:// uri in the master repo", () => {
  const ref = channelRef(7, "did:web:wtfos.me");
  assert.equal(ref, "at://did:web:wtfos.me/app.wtfos.social.board.channel/channel-7");
});

test("buildBoardChannelRecord validates against the channel lexicon", () => {
  const rec = buildBoardChannelRecord({
    id: 7,
    title: "General",
    createdBy: 3,
    topic: "say hi",
    channelType: "text",
    pinned: true,
    locked: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  const parsed = boardChannelSchema.parse({ $type: BOARD_CHANNEL_COLLECTION, ...rec });
  assert.equal(parsed.channelId, "7");
  assert.equal(parsed.title, "General");
});

test("buildBoardPostRecord validates against the post lexicon", () => {
  const rec = buildBoardPostRecord({
    reply: { id: 42, threadId: 7, userId: 3, content: "gm wtfOS", createdAt: new Date("2026-01-02T00:00:00Z") },
    channelRef: channelRef(7, "did:web:wtfos.me"),
  });
  const parsed = boardPostSchema.parse({ $type: BOARD_POST_COLLECTION, ...rec });
  assert.equal(parsed.postId, "42");
  assert.equal(parsed.text, "gm wtfOS");
  assert.ok(parsed.channelRef.includes("channel-7"));
});

test("buildBoardReactionRecord validates against the reaction lexicon", () => {
  const rec = buildBoardReactionRecord({
    subjectRef: "at://did:web:wtfos.me/app.wtfos.social.board.post/post-42",
    emoji: ":fire:",
    createdAt: new Date("2026-01-03T00:00:00Z"),
  });
  const parsed = boardReactionSchema.parse({ $type: BOARD_REACTION_COLLECTION, ...rec });
  assert.equal(parsed.emoji, ":fire:");
});
