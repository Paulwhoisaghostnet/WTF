import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("createRateLimit selects postgres store when RATE_LIMIT_STORE=postgres", () => {
  const source = readFileSync("server/lib/create-rate-limit.ts", "utf8");
  assert.match(source, /RATE_LIMIT_STORE/);
  assert.match(source, /createPostgresRateLimit/);
  assert.match(source, /createInMemoryRateLimit/);
});

test("app.ts uses shared createRateLimit factory for API throttles", () => {
  const source = readFileSync("server/app.ts", "utf8");
  assert.match(source, /createRateLimit/);
  assert.doesNotMatch(source, /from "\.\/lib\/in-memory-rate-limit"/);
});
