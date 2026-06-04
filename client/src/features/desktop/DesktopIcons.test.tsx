import assert from "node:assert/strict";
import { test } from "node:test";
import { DESKTOP_ICON_LAYOUT_KEYS } from "@shared/desktop";
import { DESKTOP_APPS, EXPERIMENTAL_DESKTOP_APPS } from "@shared/types";
import {
  buildDesktopIconDefs,
  type DesktopAppAvailability,
} from "./DesktopIcons";

const ENABLED_APPS = Object.fromEntries(
  DESKTOP_APPS.map((key) => [key, true])
) as DesktopAppAvailability;

function iconKeyForAppKey(appKey: string): string {
  return appKey === "gallery" ? "my-gallery" : appKey;
}

test("native desktop icon defs are accepted by persisted layout normalization", () => {
  const iconDefs = buildDesktopIconDefs(ENABLED_APPS, { appGateBypass: true });
  const keys = iconDefs.map((def) => def.key);
  const allowedKeys = new Set<string>(DESKTOP_ICON_LAYOUT_KEYS);

  assert.equal(new Set(keys).size, keys.length, "desktop icon keys should be unique");
  for (const key of keys) {
    assert.equal(allowedKeys.has(key), true, `${key} should persist in icon layout`);
  }
});

test("experimental desktop apps render with an explicit icon affordance", () => {
  const iconDefs = buildDesktopIconDefs(ENABLED_APPS, { appGateBypass: true });
  const iconByKey = new Map(iconDefs.map((def) => [def.key, def]));

  for (const appKey of EXPERIMENTAL_DESKTOP_APPS) {
    const iconKey = iconKeyForAppKey(appKey);
    const icon = iconByKey.get(iconKey);
    assert.ok(icon, `${appKey} should have a native desktop icon`);
    assert.equal(icon.experimental, true, `${appKey} should show the experimental outline`);
  }

  const experimentalApps = new Set<string>(EXPERIMENTAL_DESKTOP_APPS);
  for (const appKey of DESKTOP_APPS) {
    if (experimentalApps.has(appKey)) continue;
    const icon = iconByKey.get(iconKeyForAppKey(appKey));
    if (icon) {
      assert.notEqual(icon.experimental, true, `${appKey} should not be marked experimental`);
    }
  }
});
