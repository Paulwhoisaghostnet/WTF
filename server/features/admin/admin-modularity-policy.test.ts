import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("admin server routes stay as modular compatibility registrars", () => {
  const adminRoutes = readRepoFile("server/routes/admin.ts");
  const userRoutes = readRepoFile("server/features/admin/user-routes.ts");

  assert.ok(adminRoutes.split("\n").length < 80, "server/routes/admin.ts should stay thin");
  assert.ok(userRoutes.split("\n").length < 80, "admin user-routes wrapper should stay thin");

  for (const registrar of [
    "registerAdminPermissionRoutes",
    "registerAdminRoleAccessRoutes",
    "registerAdminWtfTvRoutes",
    "registerAdminMediaStorageRoutes",
    "registerAdminRewardRoutes",
    "registerAdminUserRoutes",
    "registerAdminStatsRoutes",
    "registerAdminInAppMarketRoutes",
  ]) {
    assert.match(adminRoutes, new RegExp(`${registrar}\\(router\\)`));
  }
});

test("admin page delegates tab panels data and mutations to feature modules", () => {
  const adminPage = readRepoFile("client/src/pages/Admin.tsx");
  assert.ok(adminPage.split("\n").length < 1300, "client/src/pages/Admin.tsx should stay below 1300 lines");

  for (const path of [
    "client/src/features/admin/useAdminDataQueries.ts",
    "client/src/features/admin/useAdminMutations.ts",
    "client/src/features/admin/tabs/BoardAdminTab.tsx",
    "client/src/features/admin/tabs/ChallengesAdminTab.tsx",
    "client/src/features/admin/tabs/ConsoleAdminTab.tsx",
    "client/src/features/admin/tabs/InAppMarketAdminTab.tsx",
    "client/src/features/admin/tabs/RewardsAdminTab.tsx",
    "client/src/features/admin/tabs/UsersAdminTab.tsx",
    "client/src/features/admin/tabs/WtfTvAdminTab.tsx",
    "server/features/admin/permissions-routes.ts",
    "server/features/admin/users/index.ts",
    "shared/schema-admin.ts",
    "shared/schema-market.ts",
    "shared/schema-desktop.ts",
  ]) {
    assert.ok(existsSync(join(root, path)), `${path} must exist`);
  }
});
