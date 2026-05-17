import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/lib/studio/user-drive.ts", "utf8");

test("Studio user Drive client cache has explicit max-entry and TTL bounds", () => {
  assert.match(source, /const USER_DRIVE_CLIENT_CACHE_MAX = Math\.max\(/);
  assert.match(source, /process\.env\.STUDIO_USER_DRIVE_CLIENT_CACHE_MAX/);
  assert.match(source, /const USER_DRIVE_CLIENT_CACHE_TTL_MS = Math\.max\(/);
  assert.match(source, /process\.env\.STUDIO_USER_DRIVE_CLIENT_CACHE_TTL_MS/);
  assert.match(
    source,
    /function pruneUserClientCache\(now = Date\.now\(\)\): void \{[\s\S]*now - entry\.touchedAt > USER_DRIVE_CLIENT_CACHE_TTL_MS[\s\S]*userClientCache\.delete\(userId\)[\s\S]*evictOldestEntries\(userClientCache, USER_DRIVE_CLIENT_CACHE_MAX\)/,
    "client cache prune should expire stale entries and enforce the max size"
  );
  assert.match(
    source,
    /function setUserClientCache[\s\S]*pruneUserClientCache\(\);[\s\S]*userClientCache\.set\(userId, \{ \.\.\.value, touchedAt: Date\.now\(\) \}\);[\s\S]*evictOldestEntries\(userClientCache, USER_DRIVE_CLIENT_CACHE_MAX\)/,
    "client cache writes should prune first, touch the entry, and cap cardinality"
  );
});

test("Studio user Drive app-usage cache has explicit max-entry and TTL bounds", () => {
  assert.match(source, /const USER_DRIVE_APP_USAGE_CACHE_MAX = Math\.max\(/);
  assert.match(source, /process\.env\.STUDIO_USER_DRIVE_APP_USAGE_CACHE_MAX/);
  assert.match(source, /const USER_DRIVE_APP_USAGE_CACHE_TTL_MS = Math\.max\(/);
  assert.match(source, /process\.env\.STUDIO_USER_DRIVE_APP_USAGE_CACHE_TTL_MS/);
  assert.match(
    source,
    /function pruneUserAppUsageCache\(now = Date\.now\(\)\): void \{[\s\S]*now - entry\.touchedAt > USER_DRIVE_APP_USAGE_CACHE_TTL_MS[\s\S]*userAppUsageCache\.delete\(userId\)[\s\S]*evictOldestEntries\(userAppUsageCache, USER_DRIVE_APP_USAGE_CACHE_MAX\)/,
    "app-usage cache prune should expire stale entries and enforce the max size"
  );
  assert.match(
    source,
    /function setUserAppUsageCache[\s\S]*pruneUserAppUsageCache\(\);[\s\S]*userAppUsageCache\.set\(userId, \{ \.\.\.value, touchedAt: Date\.now\(\) \}\);[\s\S]*evictOldestEntries\(userAppUsageCache, USER_DRIVE_APP_USAGE_CACHE_MAX\)/,
    "app-usage cache writes should prune first, touch the entry, and cap cardinality"
  );
});

test("Studio user Drive cache reads touch live entries and disconnect clears user state", () => {
  assert.match(
    source,
    /function getUserClientCache[\s\S]*pruneUserClientCache\(\);[\s\S]*setUserClientCache\(userId, cached\)/,
    "client cache reads should refresh LRU order for live entries"
  );
  assert.match(
    source,
    /function getUserAppUsageCache[\s\S]*pruneUserAppUsageCache\(\);[\s\S]*setUserAppUsageCache\(userId, cached\)/,
    "app-usage cache reads should refresh LRU order for live entries"
  );
  assert.match(
    source,
    /export async function disconnectUserDrive[\s\S]*invalidateUserCache\(userId\);[\s\S]*userAppUsageCache\.delete\(userId\);/,
    "disconnect should remove both client and usage cache state for the user"
  );
});
