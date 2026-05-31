import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeApiError } from "../src/http-sanitize.ts";

test("sanitizeApiError prefers JSON error field", () => {
  assert.equal(sanitizeApiError('{"error":"path is required"}', 400), "path is required");
});

test("sanitizeApiError hides HTML error pages", () => {
  assert.equal(sanitizeApiError("<html><body>nope</body></html>", 502), "Request failed: 502");
});

test("sanitizeApiError hides verbose JSON blobs", () => {
  assert.equal(sanitizeApiError('{"stack":"Error: boom\\n at foo"}', 500), "Request failed: 500");
});
