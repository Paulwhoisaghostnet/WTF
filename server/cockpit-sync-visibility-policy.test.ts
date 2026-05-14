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
