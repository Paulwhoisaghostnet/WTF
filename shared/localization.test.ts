import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_LOCALIZATION_SETTINGS,
  LOCALE_METADATA,
  localeDirection,
  normalizeLocalizationSettings,
  normalizeSupportedLocale,
} from "./localization";

test("normalizes supported locale aliases and falls back safely", () => {
  assert.equal(normalizeSupportedLocale("es"), "es-ES");
  assert.equal(normalizeSupportedLocale("es_MX"), "es-ES");
  assert.equal(normalizeSupportedLocale("ar-SA"), "ar");
  assert.equal(normalizeSupportedLocale("pseudo"), "en-XA");
  assert.equal(normalizeSupportedLocale("not-a-locale"), "en-US");
  assert.equal(normalizeSupportedLocale(null), "en-US");
});

test("normalizes localization settings with locale-specific default regions", () => {
  assert.deepEqual(normalizeLocalizationSettings({ locale: "es" }), {
    locale: "es-ES",
    region: LOCALE_METADATA["es-ES"].defaultRegion,
  });
  assert.deepEqual(normalizeLocalizationSettings({ locale: "ar", region: "eg" }), {
    locale: "ar",
    region: "EG",
  });
  assert.deepEqual(
    normalizeLocalizationSettings({}, { locale: "en-XA", region: "XA" }),
    { locale: "en-XA", region: "XA" }
  );
  assert.deepEqual(normalizeLocalizationSettings({ region: "bad-region" }), {
    ...DEFAULT_LOCALIZATION_SETTINGS,
  });
});

test("reports locale writing direction for document chrome", () => {
  assert.equal(localeDirection("en-US"), "ltr");
  assert.equal(localeDirection("es-ES"), "ltr");
  assert.equal(localeDirection("ar"), "rtl");
  assert.equal(localeDirection("missing"), "ltr");
});
