import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DESKTOP_APP_CONFIG } from "@shared/desktop-apps";
import {
  DESKTOP_APP_LABELS,
  DESKTOP_APPS,
  EXPERIMENTAL_DESKTOP_APPS,
  type DesktopAppKey,
} from "@shared/types";
import { DESKTOP_ICON_LAYOUT_KEYS } from "@shared/desktop";
import { WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE } from "@shared/wtf-app-packages";
import { ADMIN_SURFACES } from "../features/admin-os/admin-surface-registry";
import { buildDesktopIconDefs, type DesktopAppAvailability } from "../features/desktop/DesktopIcons";
import { START_MENU_APP_GATES } from "../components/layout/start-menu-app-gates";
import { PAGE_DEFS } from "../routes/page-defs";

test("Applications is a first-class registry-gated desktop app", () => {
  const appKey = "applications" as DesktopAppKey;

  assert(DESKTOP_APPS.includes(appKey), "Applications must have a canonical DesktopAppKey");
  assert.equal(DESKTOP_APP_LABELS[appKey], "Applications");
  assert.equal(DEFAULT_DESKTOP_APP_CONFIG[appKey], true);
  assert.equal(START_MENU_APP_GATES["/applications"], appKey);
  assert(
    (EXPERIMENTAL_DESKTOP_APPS as readonly string[]).includes(appKey),
    "remote app hosting should keep an experimental badge"
  );

  const route = PAGE_DEFS.find((def) => def.pattern === "/applications");
  assert(route, "Applications route should exist");
  assert.equal(route?.desktopIcon, true);
  assert.equal(route?.startMenu, true);

  const adminSurface = ADMIN_SURFACES.find((surface) => surface.id === appKey);
  assert(adminSurface, "Applications must have an admin surface binding");
  assert.equal(adminSurface?.desktopAppKey, appKey);
  assert(adminSurface?.routePatterns.includes("/applications"));

  const packageAcceptance = WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE.find((entry) => entry.key === appKey);
  assert(packageAcceptance, "Applications must have package acceptance evidence");
  assert.equal(packageAcceptance?.appKey, appKey);
  assert.equal(packageAcceptance?.state, "active");

  const apps = Object.fromEntries(
    [...DESKTOP_APPS, appKey].map((key) => [key, true])
  ) as DesktopAppAvailability;
  const icon = buildDesktopIconDefs(apps, { appGateBypass: true }).find((def) => def.key === appKey);
  assert.equal(
    icon,
    undefined,
    "App-store Applications should be pinned as a user shortcut, not shipped as a native default icon",
  );
  assert(
    (DESKTOP_ICON_LAYOUT_KEYS as readonly string[]).includes(appKey),
    "Applications icon position must persist"
  );
});
