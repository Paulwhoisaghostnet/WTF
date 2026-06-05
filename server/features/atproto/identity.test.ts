import test from "node:test";
import assert from "node:assert/strict";
import {
  isTezosAlias,
  isValidAtHandle,
  normalizeAtHandle,
  normalizeRegistrationHandle,
  parseBskyPostRef,
  resolveAtprotoHandleViaPublicResolver,
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

test("public handle resolver distinguishes resolved, unresolved, and unavailable handles", async () => {
  const resolved = await resolveAtprotoHandleViaPublicResolver("alice.bsky.social", async () => ({
    ok: true,
    json: async () => ({ did: "did:plc:alice" }),
  } as Response));
  assert.deepEqual(resolved, { did: "did:plc:alice", error: null });

  const unresolved = await resolveAtprotoHandleViaPublicResolver("missing.bsky.social", async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: "InvalidRequest", message: "Unable to resolve handle" }),
  } as Response));
  assert.deepEqual(unresolved, { did: null, error: "unresolved" });

  const unavailable = await resolveAtprotoHandleViaPublicResolver("alice.bsky.social", async () => {
    throw new Error("network down");
  });
  assert.deepEqual(unavailable, { did: null, error: "unavailable" });
});
