import test from "node:test";
import assert from "node:assert/strict";
import { buildAtUri, parseAtUri, isWtfosLexicon, toAppviewRow } from "./record-shape";

test("buildAtUri / parseAtUri round-trip", () => {
  const uri = buildAtUri("did:plc:abc", "app.wtfos.social.board.post", "post-7");
  assert.equal(uri, "at://did:plc:abc/app.wtfos.social.board.post/post-7");
  assert.deepEqual(parseAtUri(uri), {
    did: "did:plc:abc",
    collection: "app.wtfos.social.board.post",
    rkey: "post-7",
  });
});

test("parseAtUri rejects malformed URIs", () => {
  assert.throws(() => parseAtUri("https://example.com"), /invalid at:\/\//);
});

test("isWtfosLexicon recognizes published collections", () => {
  assert.equal(isWtfosLexicon("app.wtfos.social.board.post"), true);
  assert.equal(isWtfosLexicon("app.bsky.feed.post"), false);
});

test("toAppviewRow denormalizes create ops with derived domain + uri", () => {
  const row = toAppviewRow({
    action: "create",
    did: "did:plc:abc",
    collection: "app.wtfos.social.board.post",
    rkey: "post-7",
    cid: "bafyrei",
    record: { $type: "app.wtfos.social.board.post", text: "gm" },
  });
  assert.ok(row);
  assert.equal(row?.uri, "at://did:plc:abc/app.wtfos.social.board.post/post-7");
  assert.equal(row?.domain, "social");
  assert.equal(row?.source, "firehose");
});

test("toAppviewRow returns null for deletes and malformed ops", () => {
  assert.equal(
    toAppviewRow({ action: "delete", did: "did:plc:abc", collection: "c", rkey: "r" }),
    null,
  );
  assert.equal(
    toAppviewRow({ action: "create", did: "", collection: "c", rkey: "r", record: {} }),
    null,
  );
});
