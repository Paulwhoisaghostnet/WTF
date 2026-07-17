import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop settings route exposes and enforces optimistic concurrency tokens", async () => {
  const [route, service, page] = await Promise.all([
    readFile(new URL("./routes/desktop.ts", import.meta.url), "utf8"),
    readFile(new URL("./lib/user-desktop-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/DesktopSettings.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /const user = req\.user as any/);
  assert.match(route, /getUserDesktopSettings\(user\.id\)/);
  assert.match(route, /updateUserDesktopSettings\(user\.id, req\.body\)/);
  assert.match(service, /updatedAt: row\?\.updatedAt \? row\.updatedAt\.toISOString\(\) : null/);
  assert.match(service, /normalizeExpectedUpdatedAt/);
  assert.match(
    service,
    /body\.updatedAt !== undefined \? body\.updatedAt : body\.ifUnmodifiedSince/
  );
  assert.doesNotMatch(service, /body\.updatedAt \?\? body\.ifUnmodifiedSince/);
  assert.match(service, /clientProvidedConcurrencyToken/);
  assert.match(route, /status\(409\)\.json/);
  assert.match(service, /desktop_settings_conflict/);
  assert.match(service, /normalizeLocalizationSettings/);
  assert.match(service, /localization: nextLocalization/);
  assert.match(service, /localization: normalizeLocalizationSettings\(row\.localization \?\? {}\)/);
  assert.match(service, /expectedUpdatedAtDate = new Date\(String\(expectedUpdatedAt\)\)/);
  assert.match(service, /eq\(userDesktopSettings\.updatedAt, expectedUpdatedAtDate\)/);
  assert.match(service, /onConflictDoNothing\(\)/);

  assert.match(page, /updatedAt: settingsQuery\.data\?\.updatedAt \?\? null/);
});
