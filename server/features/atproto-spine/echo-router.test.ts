import test from "node:test";
import assert from "node:assert/strict";
import { domainForType, domainsForType, buildIndexRef, echoRkeyParts, buildEchoWrite } from "./echo-router";

test("domainForType maps lexicon types to their domain, defaulting to os", () => {
  assert.equal(domainForType("app.wtfos.social.board.post"), "social");
  assert.equal(domainForType("app.wtfos.media.echo"), "media");
  assert.equal(domainForType("app.wtfos.index.ref"), "os");
});

test("domainsForType always returns at least the os catch-all", () => {
  assert.deepEqual(domainsForType("app.wtfos.unknown.thing"), ["os"]);
  assert.ok(domainsForType("app.wtfos.social.board.post").includes("social"));
});

test("buildIndexRef captures the canonical fact pointer", () => {
  const ref = buildIndexRef({
    factRepo: "did:plc:abcdefghijklmnopqrstuvwx",
    factCollection: "app.wtfos.social.board.post",
    factRkey: "post-7",
    summary: { text: "gm" },
  });
  assert.equal(ref.domain, "social");
  assert.equal(ref.refKind, "fact");
  assert.equal(ref.factCollection, "app.wtfos.social.board.post");
  assert.equal(ref.factRkey, "post-7");
});

test("echoRkeyParts is deterministic for the same fact (idempotent echo)", () => {
  const fact = {
    factRepo: "did:plc:abcdefghijklmnopqrstuvwx",
    factCollection: "app.wtfos.social.board.post",
    factRkey: "post-7",
  };
  assert.deepEqual(echoRkeyParts(fact), ["social", "app.wtfos.social.board.post", "post-7"]);
});

test("buildEchoWrite produces a validated index.ref write", () => {
  const write = buildEchoWrite({
    factRepo: "did:plc:abcdefghijklmnopqrstuvwx",
    factCollection: "app.wtfos.social.board.post",
    factRkey: "post-7",
  });
  assert.equal(write.collection, "app.wtfos.index.ref");
  assert.equal(write.record.$type, "app.wtfos.index.ref");
  assert.equal(write.rkey, "social-app.wtfos.social.board.post-post-7");
});
