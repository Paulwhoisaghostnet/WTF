import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
const cockpitQueriesSource = readFileSync(
  new URL("../features/cockpit/cockpit-queries.ts", import.meta.url),
  "utf8"
);

test("Dashboard route exposes a presentation-host boundary for Gamma", () => {
  assert.match(dashboardSource, /usePresentationShell/);
  assert.match(dashboardSource, /data-dashboard-surface="cockpit"/);
  assert.match(dashboardSource, /data-dashboard-presentation-host=\{presentation\.host\}/);
  assert.match(dashboardSource, /dashboardRegionAttrs\("panel"\)/);
  assert.match(dashboardSource, /dashboardRegionAttrs\("metric"\)/);
  assert.match(dashboardSource, /dashboardRegionAttrs\("activity-row"\)/);
  assert.match(dashboardSource, /dashboardRegionAttrs\("wallet-row"\)/);
  assert.match(dashboardSource, /dashboardRegionAttrs\("table"\)/);
});

test("Dashboard Gamma chrome overrides app-owned cockpit panels without changing Classic defaults", () => {
  assert.match(dashboardSource, /data-dashboard-presentation-host="gamma"/);
  assert.match(dashboardSource, /background-image:\s*none\s*!important/);
  assert.match(dashboardSource, /box-shadow:\s*none\s*!important/);
  assert.match(dashboardSource, /border-radius:\s*6px\s*!important/);
  assert.match(dashboardSource, /#070706/);
  assert.match(dashboardSource, /#00d2ff/);
  assert.match(dashboardSource, /#f2ead9/);
});

test("Dashboard Gamma next-action rail is presentation-only and route-backed", () => {
  assert.match(dashboardSource, /GAMMA_DASHBOARD_ACTIONS/);
  assert.match(dashboardSource, /presentation\.host === "gamma"/);
  assert.match(dashboardSource, /data-dashboard-gamma-next-actions/);
  assert.match(dashboardSource, /data-dashboard-gamma-action=\{action\.key\}/);
  assert.match(dashboardSource, /data-dashboard-launch=\{action\.route\}/);
  assert.match(dashboardSource, /route: "\/side-quests"/);
  assert.match(dashboardSource, /route: "\/challenges"/);
  assert.match(dashboardSource, /route: "\/w"/);
  assert.match(dashboardSource, /route: "\/wtfiam\?category=apps"/);
  assert.match(dashboardSource, /route: "\/messages"/);
  assert.match(dashboardSource, /route: "\/profile"/);
});

test("Dashboard keeps shared cockpit, wallet, reward, and portfolio behavior", () => {
  assert.match(dashboardSource, /api\.get<any\[]>\("\/api\/wallets"\)/);
  assert.match(dashboardSource, /api\.get<\{ balance: string \}>\(`\/api\/wallets\/\$\{balanceAddr\}\/balance`\)/);
  assert.match(dashboardSource, /api\.get<any>\("\/api\/cockpit\/overview"\)/);
  assert.match(dashboardSource, /useCockpitSyncStatusQuery\(\)/);
  assert.match(
    cockpitQueriesSource,
    /api\.get<CockpitSyncStatusResponse>\(\s*"\/api\/cockpit\/sync\/status"\s*\)/
  );
  assert.match(dashboardSource, /api\.get<any>\("\/api\/cockpit\/activity\?limit=100"\)/);
  assert.match(dashboardSource, /api\.get<any>\("\/api\/portfolio\/summary"\)/);
  assert.match(dashboardSource, /api\.post\(`\/api\/cockpit\/sync\/\$\{encodeURIComponent\(wallet\)\}`/);
  assert.match(dashboardSource, /api\.put\(`\/api\/wallets\/\$\{id\}\/primary`/);
  assert.match(dashboardSource, /api\.delete\(`\/api\/wallets\/\$\{id\}`\)/);
  assert.doesNotMatch(dashboardSource, /\/api\/gamma/);
});
