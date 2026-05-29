import { test } from "node:test";
import assert from "node:assert/strict";
import { mapToRecord, deterministicRkey, normalizeRkey, prepareRecord } from "../src/record-mapper";

test("mapToRecord sets collection=$type and injects $type into the record", () => {
  const write = mapToRecord("app.wtfos.social.board.post", "abc123", { text: "hi" });
  assert.equal(write.collection, "app.wtfos.social.board.post");
  assert.equal(write.rkey, "abc123");
  assert.equal(write.record.$type, "app.wtfos.social.board.post");
  assert.equal(write.record.text, "hi");
});

test("deterministicRkey is stable and url-safe (idempotent re-publish)", () => {
  assert.equal(deterministicRkey(["board", 42, "post"]), "board-42-post");
  assert.equal(deterministicRkey(["a/b", null, "c d"]), "ab--cd");
  assert.equal(deterministicRkey(["a/b", undefined, "c"]), "ab--c");
});

test("normalizeRkey clamps to a non-empty safe key", () => {
  assert.equal(normalizeRkey(""), "self");
  assert.equal(normalizeRkey("hello world!"), "helloworld");
  assert.equal(normalizeRkey("x".repeat(600)).length, 512);
});

test("stripKeys removes configured top-level fields", () => {
  const out = prepareRecord({ $type: "x", keep: 1, secret: 2 }, { stripKeys: ["secret"] });
  assert.equal(out.keep, 1);
  assert.equal("secret" in out, false);
});

test("oversized records shrink: payload replaced with a truncation marker", () => {
  const big = "z".repeat(1_000_000);
  const out = prepareRecord({ $type: "x", payload: big }, { maxRecordBytes: 1000 });
  assert.equal((out.payload as { truncated: boolean }).truncated, true);
  assert.equal((out.payload as { reason: string }).reason, "atproto-record-size-limit");
});

test("oversized records without payload get a top-level truncation marker", () => {
  const out = prepareRecord({ $type: "x", blob: "z".repeat(1_000_000) }, { maxRecordBytes: 1000 });
  assert.equal((out._wtfosTruncation as { truncated: boolean }).truncated, true);
});
