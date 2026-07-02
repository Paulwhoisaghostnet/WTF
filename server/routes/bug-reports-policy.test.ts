import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bugReportsRoute = readFileSync("server/routes/bug-reports.ts", "utf8");
const routeRegistry = readFileSync("server/routes.ts", "utf8");
const commsSources = readFileSync("server/features/comms/source-registry.ts", "utf8");

test("bug report API is authenticated and mounted as a system route", () => {
  assert.match(
    bugReportsRoute,
    /router\.post\("\/api\/system\/bug-reports",\s*isAuthenticated/s
  );
  assert.match(routeRegistry, /import bugReportRoutes from "\.\/routes\/bug-reports"/);
  assert.match(routeRegistry, /app\.use\(bugReportRoutes\)/);
});

test("bug report API files reports to the canonical Message Board channel", () => {
  assert.match(bugReportsRoute, /BUG_REPORTS_CHANNEL_TITLE = "bug reports"/);
  assert.match(bugReportsRoute, /ensureBugReportsChannel/);
  assert.match(bugReportsRoute, /\.insert\(boardThreads\)/);
  assert.match(bugReportsRoute, /viewRoles: \["admin"\]/);
  assert.match(bugReportsRoute, /replyRoles: \["admin"\]/);
  assert.match(bugReportsRoute, /\.insert\(boardThreadReplies\)/);
  assert.match(bugReportsRoute, /threadId: channel\.id/);
});

test("bug report API emits normalized system events and targeted admin inbox items", () => {
  assert.match(bugReportsRoute, /eventType: "bug_report\.created"/);
  assert.match(bugReportsRoute, /sourceModule: "app-window-bug-reporter"/);
  assert.match(bugReportsRoute, /listAdminUserIds/);
  assert.match(bugReportsRoute, /sourceKey: "system"/);
  assert.match(bugReportsRoute, /itemKind: "system"/);
  assert.match(bugReportsRoute, /externalRef: `bug-report:\$\{message\.id\}:admin:\$\{adminId\}`/);
  assert.match(bugReportsRoute, /targetUserId: adminId/);
  assert.match(bugReportsRoute, /createNotificationsForUsers\(adminIds/);
});

test("system comms source is registered for admin inbox delivery", () => {
  assert.match(commsSources, /key: "system"/);
  assert.match(commsSources, /sourceKind: "system"/);
  assert.match(commsSources, /adapterKey: "wtfos-system"/);
});
