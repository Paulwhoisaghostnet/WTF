import test from "node:test";
import assert from "node:assert/strict";
import {
  ATPROTO_CHAT_SCOPE,
  ATPROTO_TRANSITION_GENERIC_SCOPE,
  buildSkywireAtprotoMaxScope,
  buildSkywireAtprotoScope,
  buildTz2atAtprotoScope,
  grantedSkywireCapabilities,
  hasTz2atWalletLinkScope,
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
  const boldWithChat = buildSkywireAtprotoScope("be-bold", true);
  const max = buildSkywireAtprotoMaxScope();

  assert.match(withChat, new RegExp(ATPROTO_CHAT_SCOPE.replace(".", "\\.")));
  assert.match(withChat, new RegExp(ATPROTO_TRANSITION_GENERIC_SCOPE));
  assert.equal(boldWithChat, "atproto transition:generic transition:chat.bsky");
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

test("tz2at scope builder stays narrow until wallet-link publish", () => {
  const identity = buildTz2atAtprotoScope("identity");
  const walletLink = buildTz2atAtprotoScope("wallet-link");

  assert.equal(identity, "atproto");
  assert.match(walletLink, /repo:xyz\.tz2at\.identity\.walletLink/);
  assert.equal(hasTz2atWalletLinkScope(walletLink), true);

  for (const scope of [identity, walletLink]) {
    assert.doesNotMatch(scope, /transition:generic/);
    assert.doesNotMatch(scope, /transition:chat\.bsky/);
    assert.doesNotMatch(scope, /app\.bsky\.feed\.post/);
    assert.doesNotMatch(scope, /app\.bsky\.actor\.profile/);
    assert.doesNotMatch(scope, /blob:/);
  }
});
