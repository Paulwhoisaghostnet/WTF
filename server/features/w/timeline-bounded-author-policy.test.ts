import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("W timeline route uses a bounded author window instead of route-local user scans", () => {
  const route = readFileSync("server/features/w/timeline-routes.ts", "utf8");

  assert.match(route, /loadWTimelineAuthorWindow\(MAX_ACCOUNTS\)/);
  assert.doesNotMatch(route, /\bfrom\(\s*users\s*\)/);
  assert.doesNotMatch(route, /\busers\.twitterHandle\b/);
});

test("W timeline author helper keeps SQL user reads ordered and limited", () => {
  const db = readFileSync("server/lib/timeline-db.ts", "utf8");

  assert.match(db, /AUTHOR_WINDOW_MAX_ROWS/);
  assert.match(db, /const rowLimit = Math\.min\(/);
  assert.match(db, /\.orderBy\(normalizedHandle, users\.id\)\s*\.limit\(rowLimit\)/);
  assert.match(db, /if \(accounts\.length >= accountLimit\) break;/);
  assert.match(db, /skippedAccounts: Math\.max\(0, totalHandles - accounts\.length\)/);
});

test("W timeline recovery worker shares the bounded author loader", () => {
  const worker = readFileSync("server/lib/timeline-worker.ts", "utf8");

  assert.match(worker, /loadWTimelineAuthorHandles\(MAX_ACCOUNTS\)/);
  assert.doesNotMatch(worker, /\bfrom\(\s*users\s*\)/);
});
