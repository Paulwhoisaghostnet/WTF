import test from "node:test";
import assert from "node:assert/strict";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  parsePagination,
  parseFilters,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./query-params";

test("clampLimit applies default and ceiling", () => {
  assert.equal(clampLimit(undefined), DEFAULT_PAGE_SIZE);
  assert.equal(clampLimit("0"), DEFAULT_PAGE_SIZE);
  assert.equal(clampLimit("10"), 10);
  assert.equal(clampLimit("9999"), MAX_PAGE_SIZE);
});

test("cursor encode/decode round-trips and rejects junk", () => {
  assert.equal(decodeCursor("42"), 42);
  assert.equal(decodeCursor(""), undefined);
  assert.equal(decodeCursor("-1"), undefined);
  assert.equal(decodeCursor("abc"), undefined);
  assert.equal(encodeCursor(42), "42");
  assert.equal(encodeCursor(0), undefined);
});

test("parsePagination combines limit + cursor", () => {
  assert.deepEqual(parsePagination({ limit: "25", cursor: "100" }), { limit: 25, cursorId: 100 });
});

test("parseFilters whitelists and trims, dropping empties", () => {
  const filters = parseFilters({
    collection: "app.wtfos.social.board.post",
    did: " did:plc:abc ",
    domain: "",
    bogus: "ignored",
  });
  assert.equal(filters.collection, "app.wtfos.social.board.post");
  assert.equal(filters.did, "did:plc:abc");
  assert.equal(filters.domain, undefined);
  assert.equal((filters as Record<string, unknown>).bogus, undefined);
});
