import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cockpitRoutes = readFileSync("server/routes/cockpit.ts", "utf8");

test("cockpit scheduler status is authenticated and redacts diagnostics by permission", () => {
  assert.match(
    cockpitRoutes,
    /router\.get\("\/api\/cockpit\/sync\/status", isAuthenticated/
  );
  assert.match(cockpitRoutes, /hasPermission\([\s\S]*"manage_settings"/);
  assert.match(cockpitRoutes, /error: canViewDiagnostics \? latestRun\.error : null/);
  assert.match(cockpitRoutes, /diagnostics:\s*\{\s*visible: canViewDiagnostics/);
});

test("cockpit scheduler run history requires admin settings permission", () => {
  assert.match(
    cockpitRoutes,
    /"\/api\/cockpit\/sync\/runs\/:jobName",\s*requirePermission\("manage_settings"\)/
  );
});

test("cockpit forced job runs require admin settings permission and a safe allowlist", () => {
  const allowlistBlock = cockpitRoutes.match(
    /const MANUAL_RUN_JOB_NAMES = new Set\(\[[\s\S]*?\]\);/
  )?.[0];
  assert.ok(allowlistBlock, "manual forced-run allowlist should be declared");

  assert.doesNotMatch(
    cockpitRoutes,
    /router\.post\("\/api\/cockpit\/sync\/run\/:jobName",\s*isAuthenticated/
  );
  assert.match(
    cockpitRoutes,
    /"\/api\/cockpit\/sync\/run\/:jobName",\s*requirePermission\("manage_settings"\)/
  );
  assert.match(allowlistBlock, /"nonce-cleanup"/);
  assert.match(allowlistBlock, /"system-event-log-prune"/);
  assert.match(allowlistBlock, /"tv-cache-evict"/);
  assert.doesNotMatch(allowlistBlock, /"supabase-backup"/);
  assert.doesNotMatch(allowlistBlock, /"tv-cache-warm"/);
  assert.doesNotMatch(allowlistBlock, /"tv-transcode-sweep"/);
  assert.doesNotMatch(allowlistBlock, /"portfolio-sync"/);
  assert.doesNotMatch(allowlistBlock, /"x-dm-sync-groupchat"/);
  assert.match(cockpitRoutes, /if \(!MANUAL_RUN_JOB_NAMES\.has\(name\)\)/);
  assert.match(cockpitRoutes, /manual_run_not_allowed/);
});
