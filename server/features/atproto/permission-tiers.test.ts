import test from "node:test";
import assert from "node:assert/strict";
import {
  ATPROTO_CHAT_SCOPE,
  ATPROTO_TRANSITION_GENERIC_SCOPE,
  buildSkywireAtprotoMaxScope,
  buildSkywireAtprotoScope,
  grantedSkywireCapabilities,
  inferSkywirePermissionTier,
} from "@shared/atproto-permissions";

test("Skywire AT permission tiers request progressively broader scopes", () => {
  const safe = buildSkywireAtprotoScope("be-safe");
  const social = buildSkywireAtprotoScope("be-social");
  const heard = buildSkywireAtprotoScope("be-heard");
  const bold = buildSkywireAtprotoScope("be-bold");

  assert.match(safe, /rpc:app\.bsky\.feed\.getTimeline/);
  assert.doesNotMatch(safe, /repo:app\.bsky\.feed\.like/);
  assert.doesNotMatch(safe, /transition:generic/);

  assert.match(social, /repo:app\.bsky\.feed\.like/);
  assert.match(social, /repo:app\.bsky\.feed\.repost/);
  assert.match(social, /repo:app\.bsky\.graph\.follow/);
  assert.doesNotMatch(social, /repo:app\.bsky\.feed\.post/);

  assert.match(heard, /repo:app\.bsky\.feed\.post/);
  assert.match(heard, /repo:app\.bsky\.actor\.profile/);
  assert.match(heard, /repo:app\.wtfgameshow\.skywire\.signal/);
  assert.match(heard, /blob:image\/\*/);

  assert.equal(bold, "atproto transition:generic");
});

test("Skywire chat add-on is explicit and included in the maximum metadata scope", () => {
  const withChat = buildSkywireAtprotoScope("be-safe", true);
  const max = buildSkywireAtprotoMaxScope();

  assert.match(withChat, new RegExp(ATPROTO_CHAT_SCOPE.replace(".", "\\.")));
  assert.match(withChat, new RegExp(ATPROTO_TRANSITION_GENERIC_SCOPE));
  assert.match(max, new RegExp(ATPROTO_CHAT_SCOPE.replace(".", "\\.")));
  assert.match(max, /repo:app\.bsky\.feed\.post/);
  assert.match(max, /transition:generic/);
});

test("Skywire capabilities are inferred from granted scopes, not selected labels", () => {
  const socialCapabilities = grantedSkywireCapabilities(buildSkywireAtprotoScope("be-social"));
  assert.equal(socialCapabilities.has("socialActions"), true);
  assert.equal(socialCapabilities.has("compose"), false);

  const boldCapabilities = grantedSkywireCapabilities(buildSkywireAtprotoScope("be-bold"));
  assert.equal(boldCapabilities.has("compose"), true);
  assert.equal(boldCapabilities.has("signals"), true);
  assert.equal(boldCapabilities.has("chat"), false);

  assert.equal(inferSkywirePermissionTier(buildSkywireAtprotoScope("be-heard")), "be-heard");
  assert.equal(inferSkywirePermissionTier(buildSkywireAtprotoScope("be-bold", true)), "be-bold");
});
