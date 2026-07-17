import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin help index API is admin-only, filterable, versioned, and registered", async () => {
  const [route, registrar] = await Promise.all([
    readFile(new URL("./help-index-routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../../routes/admin.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /\/api\/admin\/help-index/);
  assert.match(route, /requirePermission\("access_admin_panel"\)/);
  assert.match(route, /buildAdminHelpIndex\(query\)/);
  assert.match(route, /req\.query\.q/);
  assert.match(route, /req\.query\.id/);
  assert.match(route, /req\.query\.kind/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /admin\.help\.searched/);
  assert.match(registrar, /registerAdminHelpIndexRoutes\(router\)/);
});

test("user WTF Passport route exposes acute settings without returning credential secrets", async () => {
  const route = await readFile(new URL("./users/passport-routes.ts", import.meta.url), "utf8");

  assert.match(route, /\/api\/admin\/users\/:id\/passport/);
  assert.match(route, /requirePermission\("manage_users"\)/);
  assert.match(route, /getEffectivePermissionsForRoles/);
  assert.match(route, /getWtfOsAccessForRoles/);
  assert.match(route, /getUserDesktopSettings/);
  assert.match(route, /listActiveUserCurses/);
  assert.match(route, /admin\.user\.passport\.viewed/);
  assert.match(route, /admin\.user\.desktop_settings\.updated/);
  assert.doesNotMatch(route, /passwordHash:\s*row\.passwordHash/);
  assert.doesNotMatch(route, /tempPasswordHash:\s*row\.tempPasswordHash/);
});
