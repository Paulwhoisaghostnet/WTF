import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTvChannelMediaPath,
  canEditTvChannelPolicy,
  resolveTvChannelPlaybackSource,
  resolveWtfSourceScope,
} from "./tv-policy";

test("buildTvChannelMediaPath creates a channel-scoped playback URL", () => {
  assert.equal(
    buildTvChannelMediaPath(3, 42),
    "/api/tv/channels/3/media/42/file"
  );
});

test("resolveTvChannelPlaybackSource rewrites legacy generic upload URLs to channel-scoped playback", () => {
  assert.equal(
    resolveTvChannelPlaybackSource({
      channelId: 3,
      mediaItemId: 42,
      sourceType: "upload",
      sourceUri: "/api/media/42/file",
    }),
    "/api/tv/channels/3/media/42/file"
  );
});

test("resolveTvChannelPlaybackSource rewrites internal object-storage markers to channel-scoped playback", () => {
  assert.equal(
    resolveTvChannelPlaybackSource({
      channelId: 9,
      mediaItemId: 77,
      sourceType: "upload",
      sourceUri: "s3://wtf-private/users/9/77.mp4",
    }),
    "/api/tv/channels/9/media/77/file"
  );
});

test("canEditTvChannelPolicy allows the owner and wtf-admin only", () => {
  assert.equal(
    canEditTvChannelPolicy({ ownerUserId: 7 }, { id: 7, username: "owner", role: "contestant" }),
    true
  );
  assert.equal(
    canEditTvChannelPolicy({ ownerUserId: 7 }, { id: 99, username: "wtf-admin", role: "admin" }),
    true
  );
  assert.equal(
    canEditTvChannelPolicy({ ownerUserId: 7 }, { id: 99, username: "host-person", role: "host" }),
    false
  );
  assert.equal(
    canEditTvChannelPolicy({ ownerUserId: 7 }, { id: 99, username: "cohost-person", role: "cohost" }),
    false
  );
});

test("canEditTvChannelPolicy does not affect public viewing policy", () => {
  assert.equal(
    canEditTvChannelPolicy({ ownerUserId: 7 }, { id: 11, username: "viewer", role: "witness" }),
    false
  );
});

test("resolveWtfSourceScope preserves explicit selected user configuration", () => {
  const resolved = resolveWtfSourceScope({
    sourceMode: "selected_users",
    sourceUserIds: [7, 8],
    sourceWalletAddresses: [],
    channelOwnerUserId: 5,
    channelOwnerUsername: "paulwhoisaghost",
    channelSlug: "paulwhoisaghost-wtf-tv",
    channelDialNumber: 3,
  });

  assert.equal(resolved.mode, "selected_users");
  assert.deepEqual(resolved.sourceUserIds, [7, 8]);
  assert.equal(resolved.reason, "configured");
});

test("resolveWtfSourceScope defaults canonical dial-03 WTF TV to owner-scoped media", () => {
  const resolved = resolveWtfSourceScope({
    sourceMode: "all_users",
    sourceUserIds: [],
    sourceWalletAddresses: [],
    channelOwnerUserId: 77,
    channelOwnerUsername: "paulwhoisaghost",
    channelSlug: "paulwhoisaghost-wtf-tv",
    channelDialNumber: 3,
  });

  assert.equal(resolved.mode, "selected_users");
  assert.deepEqual(resolved.sourceUserIds, [77]);
  assert.equal(resolved.reason, "owner_fallback");
});

test("resolveWtfSourceScope defaults normal public channels to owner-scoped media", () => {
  const resolved = resolveWtfSourceScope({
    sourceMode: "all_users",
    sourceUserIds: [],
    sourceWalletAddresses: [],
    channelOwnerUserId: 12,
    channelOwnerUsername: "somebodyelse",
    channelSlug: "mixed-channel",
    channelDialNumber: 11,
  });

  assert.equal(resolved.mode, "selected_users");
  assert.deepEqual(resolved.sourceUserIds, [12]);
  assert.equal(resolved.reason, "owner_fallback");
});

test("resolveWtfSourceScope leaves channel 69 on all_users when configured that way", () => {
  const resolved = resolveWtfSourceScope({
    sourceMode: "all_users",
    sourceUserIds: [],
    sourceWalletAddresses: [],
    channelOwnerUserId: 69,
    channelOwnerUsername: "wtf-admin",
    channelSlug: "wtf-platform",
    channelDialNumber: 69,
  });

  assert.equal(resolved.mode, "all_users");
  assert.deepEqual(resolved.sourceUserIds, []);
  assert.equal(resolved.reason, "configured");
});
