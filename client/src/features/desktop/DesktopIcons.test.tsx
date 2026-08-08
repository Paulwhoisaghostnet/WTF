import assert from "node:assert/strict";
import { test } from "node:test";
import { DESKTOP_ICON_LAYOUT_KEYS } from "@shared/desktop";
import { DESKTOP_APPS, EXPERIMENTAL_DESKTOP_APPS } from "@shared/types";
import { isAppStoreAppKey, isDefaultDesktopAppKey } from "@shared/wtfos-app-catalog";
import {
  buildDesktopIconDefs,
  shouldOpenDesktopIconFromClick,
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

test("native desktop icon defs only promote core default apps", () => {
  const iconDefs = buildDesktopIconDefs(ENABLED_APPS, { appGateBypass: true });
  const keys = iconDefs.map((def) => def.key);
  const defaultAppIconKeys = DESKTOP_APPS.filter(isDefaultDesktopAppKey).map(iconKeyForAppKey);

  for (const iconKey of ["recycle-bin", "mission-control", "command-palette"]) {
    assert.ok(keys.includes(iconKey), `${iconKey} should remain a native desktop utility`);
  }
  for (const iconKey of defaultAppIconKeys) {
    assert.ok(keys.includes(iconKey), `${iconKey} should remain a default desktop app`);
  }
  for (const appKey of DESKTOP_APPS) {
    if (isDefaultDesktopAppKey(appKey) || !isAppStoreAppKey(appKey)) continue;
    assert.equal(
      keys.includes(iconKeyForAppKey(appKey)),
      false,
      `${appKey} should be unlocked from WTFIAM Apps before desktop placement`
    );
  }
});

test("experimental default desktop apps render with an explicit icon affordance", () => {
  const iconDefs = buildDesktopIconDefs(ENABLED_APPS, { appGateBypass: true });
  const iconByKey = new Map(iconDefs.map((def) => [def.key, def]));

  for (const appKey of EXPERIMENTAL_DESKTOP_APPS.filter(isDefaultDesktopAppKey)) {
    const iconKey = iconKeyForAppKey(appKey);
    const icon = iconByKey.get(iconKey);
    assert.ok(icon, `${appKey} should have a native desktop icon`);
    assert.equal(icon.experimental, true, `${appKey} should show the experimental outline`);
  }

  const experimentalApps = new Set<string>(EXPERIMENTAL_DESKTOP_APPS);
  for (const appKey of DESKTOP_APPS.filter(isDefaultDesktopAppKey)) {
    if (experimentalApps.has(appKey)) continue;
    const icon = iconByKey.get(iconKeyForAppKey(appKey));
    if (icon) {
      assert.notEqual(icon.experimental, true, `${appKey} should not be marked experimental`);
    }
  }
});

test("private Objkt Operator desktop icon is owner-gated", () => {
  const hidden = buildDesktopIconDefs(ENABLED_APPS, {
    appGateBypass: true,
    objktOperatorAvailable: false,
  });
  assert.equal(hidden.find((icon) => icon.key === "objkt-operator")?.enabled, false);

  const visible = buildDesktopIconDefs(ENABLED_APPS, {
    appGateBypass: true,
    objktOperatorAvailable: true,
  });
  const operator = visible.find((icon) => icon.key === "objkt-operator");
  assert.equal(operator?.openPath, "/objkt-operator");
  assert.equal(operator?.enabled, true);
});

test("desktop icon click policy opens once across single, double, drag, and context gestures", () => {
  assert.equal(
    shouldOpenDesktopIconFromClick({ button: 0, clickCount: 1, moved: false, shiftKey: false }),
    true,
    "an ordinary single click should open"
  );
  assert.equal(
    shouldOpenDesktopIconFromClick({ button: 0, clickCount: 0, moved: false, shiftKey: false }),
    true,
    "a keyboard or synthetic primary click should open"
  );
  assert.equal(
    shouldOpenDesktopIconFromClick({ button: 0, clickCount: 2, moved: false, shiftKey: false }),
    false,
    "the second click in a double-click sequence must not reopen"
  );
  assert.equal(
    shouldOpenDesktopIconFromClick({ button: 0, clickCount: 1, moved: true, shiftKey: false }),
    false,
    "a drag release must not open"
  );
  assert.equal(
    shouldOpenDesktopIconFromClick({ button: 0, clickCount: 1, moved: false, shiftKey: true }),
    false,
    "Shift-click belongs to the context-menu path"
  );
  assert.equal(
    shouldOpenDesktopIconFromClick({ button: 2, clickCount: 1, moved: false, shiftKey: false }),
    false,
    "a secondary-button gesture must not open"
  );
});
