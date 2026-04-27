import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeverityForStatus,
  sanitizeForSystemLog,
  serializeErrorForSystemLog,
} from "./system-log";

test("sanitizeForSystemLog redacts secrets deeply without dropping useful context", () => {
  const input: any = {
    username: "admin",
    password: "rushmore",
    nested: {
      authorization: "Bearer secret",
      harmless: "kept",
      refreshToken: "abc123",
    },
    list: [{ cookie: "sid=secret" }, "plain"],
  };
  input.self = input;

  const sanitized = sanitizeForSystemLog(input) as any;

  assert.equal(sanitized.username, "admin");
  assert.equal(sanitized.password, "[redacted]");
  assert.equal(sanitized.nested.authorization, "[redacted]");
  assert.equal(sanitized.nested.refreshToken, "[redacted]");
  assert.equal(sanitized.nested.harmless, "kept");
  assert.equal(sanitized.list[0].cookie, "[redacted]");
  assert.equal(sanitized.list[1], "plain");
  assert.equal(sanitized.self, "[circular]");
});

test("sanitizeForSystemLog truncates large strings and arrays", () => {
  const sanitized = sanitizeForSystemLog({
    message: "x".repeat(2_100),
    ids: Array.from({ length: 75 }, (_, i) => i),
  }) as any;

  assert.equal(sanitized.message.length, 2_020);
  assert.match(sanitized.message, /\[truncated 101 chars\]$/);
  assert.equal(sanitized.ids.length, 51);
  assert.equal(sanitized.ids[50], "[truncated 25 items]");
});

test("serializeErrorForSystemLog preserves error identity and causal chain", () => {
  const cause = new TypeError("socket burped");
  const error = new Error("fetch failed", { cause });

  const serialized = serializeErrorForSystemLog(error);

  assert.equal(serialized.name, "Error");
  assert.equal(serialized.message, "fetch failed");
  assert.match(serialized.stack || "", /fetch failed/);
  assert.deepEqual(serialized.cause, {
    name: "TypeError",
    message: "socket burped",
    stack: cause.stack,
  });
});

test("getSeverityForStatus maps status codes to useful alert levels", () => {
  assert.equal(getSeverityForStatus(200), "info");
  assert.equal(getSeverityForStatus(404), "warn");
  assert.equal(getSeverityForStatus(500), "error");
});
