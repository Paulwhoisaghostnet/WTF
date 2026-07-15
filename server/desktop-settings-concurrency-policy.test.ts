import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop settings route exposes and enforces optimistic concurrency tokens", async () => {
  const [route, page] = await Promise.all([
    readFile(new URL("./routes/desktop.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/DesktopSettings.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /updatedAt: row\?\.updatedAt \? row\.updatedAt\.toISOString\(\) : null/);
  assert.match(route, /normalizeExpectedUpdatedAt/);
  assert.match(
    route,
    /body\.updatedAt !== undefined \? body\.updatedAt : body\.ifUnmodifiedSince/
  );
  assert.doesNotMatch(route, /body\.updatedAt \?\? body\.ifUnmodifiedSince/);
  assert.match(route, /clientProvidedConcurrencyToken/);
  assert.match(route, /status\(409\)\.json/);
  assert.match(route, /desktop_settings_conflict/);
  assert.match(route, /normalizeLocalizationSettings/);
  assert.match(route, /localization: nextLocalization/);
  assert.match(route, /localization: normalizeLocalizationSettings\(row\.localization \?\? {}\)/);
  assert.match(route, /expectedUpdatedAtDate = new Date\(expectedUpdatedAt\)/);
  assert.match(route, /eq\(userDesktopSettings\.updatedAt, expectedUpdatedAtDate\)/);
  assert.match(route, /onConflictDoNothing\(\)/);

  assert.match(page, /updatedAt: settingsQuery\.data\?\.updatedAt \?\? null/);
});
