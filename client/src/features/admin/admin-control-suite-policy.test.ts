import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("user administration is a broad role review with an acute WTF Passport", async () => {
  const [users, passport, page] = await Promise.all([
    readFile(new URL("./tabs/UsersAdminTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/AdminUserPassport.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../pages/Admin.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["Highest role", "Level", "EXP", "Curses", "Signals"]) {
    assert(users.includes(`label: \"${label}\"`), `user scope must expose ${label}`);
  }
  assert.match(users, /Open WTF Passport for/);
  assert.match(users, /AdminScopeTable/);
  assert.match(users, /defaultSortKey="role"/);
  assert.match(users, /searchable|Search user role review/);

  for (const tab of ["Account", "Access & curses", "wtfOS settings", "Recovery", "Wallets & activity"]) {
    assert(passport.includes(tab), `WTF Passport must include ${tab}`);
  }
  assert.match(passport, /effectivePermissions/);
  assert.match(passport, /wtfOsAccess/);
  assert.match(passport, /desktopSettingsMutation/);
  assert.match(passport, /WalletDossier/);
  assert.match(passport, /Complete settings snapshot/);
  assert.match(page, /section\.slug/);
  assert.match(page, /openUserPassport/);
});

test("roles and curses provide sortable scope tables before record controls", async () => {
  const [roles, curses] = await Promise.all([
    readFile(new URL("./tabs/RolesAdminTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("./tabs/CursesAdminTab.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(roles, /Search role catalog/);
  assert.match(roles, /Role catalog with access level and assigned user counts/);
  assert.match(roles, /Assigned users/);
  assert.match(roles, /onOpenUser/);

  assert.match(curses, /Search curse scope/);
  assert.match(curses, /Curse definitions and active user assignment counts/);
  assert.match(curses, /Affected users/);
  assert.match(curses, /Apply to another user/);
  assert.match(curses, /Lift/);
});

test("admin help is exhaustive, human-readable, agent-readable, and deep-linkable", async () => {
  const [help, catalog, nativePanel] = await Promise.all([
    readFile(new URL("./tabs/AdminHelpTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("./help/admin-help-index.ts", import.meta.url), "utf8"),
    readFile(new URL("../admin-os/NativeAdminPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(help, /Human guide/);
  assert.match(help, /Agent contract/);
  assert.match(help, /\/api\/admin\/help-index/);
  assert.match(help, /Copy JSON/);
  assert.match(catalog, /buildSectionTopics/);
  assert.match(catalog, /buildSurfaceTopics/);
  assert.match(catalog, /buildPermissionTopics/);
  assert.match(catalog, /buildCurseTopics/);
  assert.match(nativePanel, /adminSectionHrefForPanelLabel/);
  assert.match(nativePanel, /Find in Help/);
  assert.match(nativePanel, /Open Automation/);
});
