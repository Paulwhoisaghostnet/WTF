import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } from "@shared/types";

test("permanent user deletion has a dedicated least-privilege permission", async () => {
  const route = await readFile(new URL("./deletion-routes.ts", import.meta.url), "utf8");

  assert.ok(PERMISSION_KEYS.includes("delete_users"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS.cohost.includes("manage_users"));
  assert.equal(DEFAULT_ROLE_PERMISSIONS.cohost.includes("delete_users"), false);
  assert.ok(DEFAULT_ROLE_PERMISSIONS.host.includes("delete_users"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS.admin.includes("delete_users"));
  assert.match(route, /router\.delete\(\s*"\/api\/admin\/users\/:id",\s*requirePermission\("delete_users"\)/s);
  assert.doesNotMatch(route, /router\.delete\(\s*"\/api\/admin\/users\/:id",\s*requirePermission\("manage_users"\)/s);
});

