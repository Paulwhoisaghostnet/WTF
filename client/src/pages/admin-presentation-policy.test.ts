import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const adminSource = readFileSync(new URL("./Admin.tsx", import.meta.url), "utf8");
const adminQueriesSource = readFileSync(
  new URL("../features/admin/useAdminDataQueries.ts", import.meta.url),
  "utf8"
);
const adminMutationsSource = readFileSync(
  new URL("../features/admin/useAdminMutations.ts", import.meta.url),
  "utf8"
);
const automationTabSource = readFileSync(
  new URL("../features/admin/tabs/ChallengeAutomationAdminTab.tsx", import.meta.url),
  "utf8"
);

test("Admin suite exposes Gamma host markers for The Count control surface", () => {
  assert.match(adminSource, /usePresentationShell/);
  assert.match(adminSource, /data-admin-presentation-host=\{presentation\.host\}/);
  assert.match(adminSource, /\[data-admin-presentation-host="gamma"\]/);
  assert.match(adminSource, /data-admin-surface="control-suite"/);
  assert.match(adminSource, /data-admin-region="suite-title"/);
  assert.match(adminSource, /data-admin-region="overview-box"/);
  assert.match(adminSource, /data-admin-region="suite-nav"/);
  assert.match(adminSource, /data-admin-region="nav-button"/);
  assert.match(adminSource, /data-admin-region="tab-body"/);
  assert.match(adminSource, /data-admin-active-section=\{activeSection\.title\}/);
  assert.match(adminSource, /\[data-admin-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(adminSource, /\[data-admin-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(adminSource, /#00d2ff/);
});

test("Admin suite keeps Count workflows on shared admin query APIs", () => {
  for (const path of [
    "/api/admin/stats",
    "/api/admin/users",
    "/api/admin/role-access",
    "/api/admin/permissions",
    "/api/admin/reward-ledger",
    "/api/admin/in-app-market/items",
    "/api/admin/apps/desktop",
    "/api/admin/wtf-tv",
    "/api/studio/admin/drive/status",
  ]) {
    assert.match(adminQueriesSource, new RegExp(path.replace(/[/?]/g, "\\$&")));
  }
  assert.match(automationTabSource, /\/api\/admin\/challenge-automation\/registry/);
  assert.match(automationTabSource, /\/api\/admin\/challenge-automation\/challenges/);
});

test("Admin suite keeps Count workflows on shared admin mutation APIs", () => {
  for (const path of [
    "/api/admin/role-access",
    "/api/admin/permissions",
    "/api/admin/in-app-market/items",
    "/api/admin/in-app-market/reprice",
    "/api/admin/reward-ledger",
    "/api/admin/apps/desktop",
    "/api/arcade/admin/games",
  ]) {
    assert.match(adminMutationsSource, new RegExp(path.replace(/[/?]/g, "\\$&")));
  }
  assert.match(automationTabSource, /api\.post\("\/api\/admin\/challenge-automation\/challenges"/);
  assert.match(automationTabSource, /api\.post\("\/api\/admin\/challenge-automation\/seed-daily-loops"/);
});
