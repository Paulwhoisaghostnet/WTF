import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerSource = readFileSync("client/src/lib/localization.tsx", "utf8");
const appSource = readFileSync("client/src/App.tsx", "utf8");

test("LocalizationProvider owns fallback locale, server persistence, and document metadata", () => {
  assert.match(providerSource, /LOCALIZATION_STORAGE_KEY = "wtfos:localization"/);
  assert.match(providerSource, /navigator\.languages/);
  assert.match(providerSource, /api\.get<DesktopSettingsResponse>\("\/api\/desktop\/settings"\)/);
  assert.match(providerSource, /api\.put<DesktopSettingsResponse>\("\/api\/desktop\/settings"/);
  assert.match(providerSource, /root\.lang = activeSettings\.locale/);
  assert.match(providerSource, /root\.dir = localeDirection\(activeSettings\.locale\)/);
  assert.match(providerSource, /root\.dataset\.wtfLocale = activeSettings\.locale/);
});

test("LocalizationProvider is mounted above the OS shell providers", () => {
  assert.match(appSource, /<LocalizationProvider>/);
  assert.match(appSource, /<WtfOsAppearanceProvider>/);
  assert.ok(
    appSource.indexOf("<LocalizationProvider>") <
      appSource.indexOf("<WtfOsAppearanceProvider>"),
    "localization must wrap appearance and shell surfaces"
  );
});

test("normal UI localization does not use runtime LLM translation", () => {
  for (const forbidden of [
    /\/api\/ai/i,
    /\/api\/agent/i,
    /openai/i,
    /translateText/i,
    /runtime.*translation/i,
  ]) {
    assert.doesNotMatch(providerSource, forbidden);
  }
});
