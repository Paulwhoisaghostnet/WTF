import assert from "node:assert/strict";
import test from "node:test";
import { boundedClientLogMetadata } from "../lib/client-log-metadata";

test("client log metadata is bounded and omits nested objects", () => {
  const metadata = boundedClientLogMetadata({
    short: "ok",
    long: "x".repeat(2_000),
    number: 42,
    bool: true,
    nested: { nope: true },
  });

  assert.equal(metadata.short, "ok");
  assert.equal(String(metadata.long).length, 1_000);
  assert.equal(metadata.number, 42);
  assert.equal(metadata.bool, true);
  assert.equal(metadata.nested, "[structured metadata omitted]");
});
