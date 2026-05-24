import test from "node:test";
import assert from "node:assert/strict";
import {
  isTezosAlias,
  isValidAtHandle,
  normalizeAtHandle,
  parseBskyPostRef,
} from "./identity";

test("AT handle syntax accepts DNS-style hostnames", () => {
  assert.equal(isValidAtHandle("hack.wtfgameshow.app"), true);
  assert.equal(isValidAtHandle("@hack.skywire.wtfgameshow.app"), true);
  assert.equal(normalizeAtHandle("@Hack.Bsky.Social."), "hack.bsky.social");
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
