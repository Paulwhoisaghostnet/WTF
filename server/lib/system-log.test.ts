import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemLogEntry,
  getSeverityForStatus,
  sanitizeForSystemLog,
  selectConsoleErrorForSystemLog,
  serializeConsoleMessage,
  serializeErrorForSystemLog,
  serializeSystemLogEntryForFile,
  shouldWriteEntryToDatabase,
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

test("routine scheduler lifecycle stays in the file trace without duplicating into the database", () => {
  for (const eventType of ["job_started", "job_succeeded"]) {
    const entry = buildSystemLogEntry({
      source: "scheduler",
      eventType,
      severity: "info",
      message: `Scheduler ${eventType}`,
      metadata: { syncRunId: 42 },
    });

    assert.equal(shouldWriteEntryToDatabase(entry), false);
    assert.match(serializeSystemLogEntryForFile(entry), new RegExp(`"eventType":"${eventType}"`));
  }

  for (const eventType of ["job_failed", "job_skipped", "job_missing"]) {
    const entry = buildSystemLogEntry({
      source: "scheduler",
      eventType,
      severity: eventType === "job_failed" ? "error" : "warn",
      message: `Scheduler ${eventType}`,
      metadata: { syncRunId: 42 },
    });

    assert.equal(shouldWriteEntryToDatabase(entry), true);
    assert.match(serializeSystemLogEntryForFile(entry), new RegExp(`"eventType":"${eventType}"`));
  }

  const nonSchedulerEntry = buildSystemLogEntry({
    source: "operator",
    eventType: "job_started",
    severity: "info",
    message: "Operator action started",
  });
  assert.equal(shouldWriteEntryToDatabase(nonSchedulerEntry), true);
});

test("Drizzle-like params payloads are summarized across every persistence channel", () => {
  const sentinel = "fixture-value-that-must-not-persist";
  const diagnostic = `Drizzle query failed\nparams: fixture-id,${sentinel}`;
  const error = new Error(diagnostic, { cause: new TypeError(diagnostic) });
  error.stack = `Error: ${diagnostic}\n    at synthetic-fixture`;

  const entry = buildSystemLogEntry({
    source: "console",
    eventType: "console_error",
    severity: "error",
    message: diagnostic,
    metadata: {
      diagnostic,
      nested: { diagnostic },
      ordinary: "ordinary diagnostic remains useful",
    },
    error,
  });
  const fileLine = serializeSystemLogEntryForFile(entry);
  const consoleText = serializeConsoleMessage([
    diagnostic,
    { diagnostic, ordinary: "ordinary diagnostic remains useful" },
    error,
  ]);

  assert.doesNotMatch(JSON.stringify(entry), new RegExp(sentinel));
  assert.doesNotMatch(JSON.stringify(serializeErrorForSystemLog(error)), new RegExp(sentinel));
  assert.doesNotMatch(fileLine, new RegExp(sentinel));
  assert.doesNotMatch(consoleText, new RegExp(sentinel));
  assert.match(entry.message || "", /Drizzle query failed/);
  assert.match(entry.message || "", /params: \[redacted parameter payload\]/);
  assert.equal((entry.metadata as any).ordinary, "ordinary diagnostic remains useful");
  assert.match(consoleText, /ordinary diagnostic remains useful/);

  const splitArgs = ["Drizzle query failed\nparams:", sentinel];
  const splitEntry = buildSystemLogEntry({
    source: "console",
    eventType: "console_error",
    severity: "error",
    message: serializeConsoleMessage(splitArgs),
    metadata: { args: splitArgs },
  });

  assert.doesNotMatch(JSON.stringify(splitEntry), new RegExp(sentinel));
  assert.match(splitEntry.message || "", /params: \[redacted parameter payload\]/);

  const splitErrorArgs = [
    "Drizzle query failed\nparams:",
    new Error(sentinel),
  ];
  const splitErrorEntry = buildSystemLogEntry({
    source: "console",
    eventType: "console_error",
    severity: "error",
    message: serializeConsoleMessage(splitErrorArgs),
    metadata: { args: splitErrorArgs },
    error: selectConsoleErrorForSystemLog(splitErrorArgs),
  });

  assert.doesNotMatch(JSON.stringify(splitErrorEntry), new RegExp(sentinel));
});
