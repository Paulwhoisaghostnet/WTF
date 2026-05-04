import assert from "node:assert/strict";
import test from "node:test";

import {
  findNextQueueTarget,
  queueItemKey,
  resolveActivePlaybackState,
  resolveSelectedChannelPlaybackState,
  type TvQueueKeyable,
} from "./tv-playback";

type QueueItem = TvQueueKeyable & {
  kind?: "video" | "bumper";
};

function item(
  itemId: number,
  videoId: number,
  sourceUri: string,
  kind: "video" | "bumper" = "video"
): QueueItem {
  return { itemId, videoId, sourceUri, kind };
}

test("resolveActivePlaybackState pins the currently airing item when a refetch reorders the queue", () => {
  const a = item(1, 101, "ipfs://a");
  const b = item(2, 202, "ipfs://b");
  const c = item(3, 303, "ipfs://c");
  const refreshed = [b, c, a];

  const resolved = resolveActivePlaybackState(
    refreshed,
    0,
    queueItemKey(a),
    a
  );

  assert.equal(resolved.source, "pinned");
  assert.equal(resolved.activeQueueIdx, 2);
  assert.equal(resolved.activeItem?.videoId, 101);
});

test("resolveActivePlaybackState falls back to the previous item snapshot when the queue drops it mid-play", () => {
  const a = item(1, 101, "ipfs://a");
  const b = item(2, 202, "ipfs://b");
  const refreshed = [b];

  const resolved = resolveActivePlaybackState(
    refreshed,
    0,
    queueItemKey(a),
    a
  );

  assert.equal(resolved.source, "fallback");
  assert.equal(resolved.activeQueueIdx, 0);
  assert.equal(resolved.activeItem?.videoId, 101);
});

test("resolveSelectedChannelPlaybackState keeps the current item pinned during a same-channel refetch with no fresh payload yet", () => {
  const a = item(1, 101, "ipfs://a");

  const resolved = resolveSelectedChannelPlaybackState({
    selectedChannelId: 3,
    streamChannelId: null,
    queue: [],
    currentItem: null,
    requestedIdx: 0,
    pinnedKey: queueItemKey(a),
    fallbackItem: a,
    fallbackChannelId: 3,
  });

  assert.equal(resolved.streamMatchesSelectedChannel, false);
  assert.equal(resolved.source, "fallback");
  assert.equal(resolved.activeItem?.videoId, 101);
});

test("resolveSelectedChannelPlaybackState drops the old item immediately when the user switches channels", () => {
  const a = item(1, 101, "ipfs://a");

  const resolved = resolveSelectedChannelPlaybackState({
    selectedChannelId: 7,
    streamChannelId: null,
    queue: [],
    currentItem: null,
    requestedIdx: 0,
    pinnedKey: queueItemKey(a),
    fallbackItem: a,
    fallbackChannelId: 3,
  });

  assert.equal(resolved.streamMatchesSelectedChannel, false);
  assert.equal(resolved.source, "empty");
  assert.equal(resolved.activeItem, null);
});

test("resolveSelectedChannelPlaybackState cuts to the new channel queue once that stream arrives", () => {
  const oldItem = item(1, 101, "ipfs://a");
  const newItem = item(4, 404, "ipfs://d");

  const resolved = resolveSelectedChannelPlaybackState({
    selectedChannelId: 7,
    streamChannelId: 7,
    queue: [newItem],
    currentItem: newItem,
    requestedIdx: 0,
    pinnedKey: queueItemKey(oldItem),
    fallbackItem: oldItem,
    fallbackChannelId: 3,
  });

  assert.equal(resolved.streamMatchesSelectedChannel, true);
  assert.equal(resolved.source, "requested");
  assert.equal(resolved.activeItem?.videoId, 404);
});

test("findNextQueueTarget skips session-blacklisted clips without losing wrap semantics", () => {
  const a = item(1, 101, "ipfs://a");
  const b = item(2, 202, "ipfs://b");
  const c = item(3, 303, "ipfs://c");
  const skipped = new Set([queueItemKey(b)]);

  const next = findNextQueueTarget([a, b, c], 0, skipped);

  assert.equal(next.nextIdx, 2);
  assert.equal(next.nextItem?.videoId, 303);
  assert.equal(next.skippedBlacklisted, 1);
});
