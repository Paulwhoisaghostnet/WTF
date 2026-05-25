import test from "node:test";
import assert from "node:assert/strict";
import {
  isTezosAlias,
  isValidAtHandle,
  normalizeAtHandle,
  normalizeRegistrationHandle,
  parseBskyPostRef,
  sourceUrlForAtUri,
} from "./identity";

test("AT handle syntax accepts DNS-style hostnames", () => {
  assert.equal(isValidAtHandle("hack.wtfgameshow.app"), true);
  assert.equal(isValidAtHandle("@hack.skywire.wtfgameshow.app"), true);
  assert.equal(normalizeAtHandle("@Hack.Bsky.Social."), "hack.bsky.social");
});

test("registration handles can use the default PDS suffix", () => {
  assert.equal(normalizeRegistrationHandle("wtfgameshow", "bsky.social"), "wtfgameshow.bsky.social");
  assert.equal(normalizeRegistrationHandle("@WtfGameShow.Bsky.Social", "bsky.social"), "wtfgameshow.bsky.social");
});

test(".tez aliases are Tezos identity proofs, not automatically AT-compliant handles", () => {
  assert.equal(isTezosAlias("hack.tez"), true);
  assert.equal(isValidAtHandle("hack.tez"), false);
  assert.equal(isTezosAlias("hack.skywire.wtfgameshow.app"), false);
});

test("bsky post URL and at:// URI parsing returns canonical at:// post URIs", () => {
  assert.deepEqual(
    parseBskyPostRef("https://bsky.app/profile/alice.bsky.social/post/3kabc"),
    {
      uri: "at://alice.bsky.social/app.bsky.feed.post/3kabc",
      actor: "alice.bsky.social",
      rkey: "3kabc",
    }
  );
  assert.deepEqual(parseBskyPostRef("at://did:plc:abc/app.bsky.feed.post/3kabc"), {
    uri: "at://did:plc:abc/app.bsky.feed.post/3kabc",
    actor: "did:plc:abc",
    rkey: "3kabc",
  });
});

test("bsky source URLs keep actors readable for Bluesky profile routes", () => {
  assert.equal(
    sourceUrlForAtUri("at://did:plc:abc/app.bsky.feed.post/3kabc"),
    "https://bsky.app/profile/did:plc:abc/post/3kabc"
  );
  assert.equal(
    sourceUrlForAtUri("at://did:plc:abc/app.bsky.feed.post/3kabc", "Alice.Bsky.Social"),
    "https://bsky.app/profile/alice.bsky.social/post/3kabc"
  );
});
