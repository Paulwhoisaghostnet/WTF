import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appWindow = readFileSync("client/src/components/layout/AppWindow.tsx", "utf8");
const desktopRoute = readFileSync("server/routes/desktop.ts", "utf8");
const localizationCatalog = readFileSync("client/src/lib/localization-catalogs.ts", "utf8");

test("AppWindow exposes a shared bug-report trigger in every window chrome", () => {
  assert.match(appWindow, /import \{ Bug \} from "lucide-react"/);
  assert.match(appWindow, /data-bug-report-trigger="true"/);
  assert.ok(
    (appWindow.match(/data-bug-report-trigger="true"/g) || []).length >= 2,
    "classic and inline app chrome should both expose the report trigger"
  );
  assert.match(appWindow, /aria-label=\{t\("appWindow\.reportBug"/);
  assert.match(appWindow, /data-bug-report-dialog="true"/);
});

test("AppWindow report form carries domain, subdomain, and route context", () => {
  assert.match(appWindow, /findAdminSurfaceForPath\(pagePath\)/);
  assert.match(appWindow, /const bugDomain = adminSurface\?\.domain/);
  assert.match(appWindow, /const bugSubdomain = adminSurface\?\.subdomain/);
  assert.match(appWindow, /surfaceId: adminSurface\?\.id \?\? null/);
  assert.match(appWindow, /surfaceLabel: bugSurfaceLabel/);
  assert.match(appWindow, /domain: bugDomain/);
  assert.match(appWindow, /subdomain: bugSubdomain/);
  assert.match(appWindow, /routePath/);
});

test("AppWindow submits reports to the system bug-report API and refreshes inbox surfaces", () => {
  assert.match(appWindow, /api\.post<BugReportResponse>\("\/api\/system\/bug-reports"/);
  assert.match(appWindow, /qc\.invalidateQueries\(\{ queryKey: \["board", "channels"\] \}\)/);
  assert.match(appWindow, /qc\.invalidateQueries\(\{ queryKey: \["comms"\] \}\)/);
  assert.match(appWindow, /qc\.invalidateQueries\(\{ queryKey: \["notifications"\] \}\)/);
  assert.match(appWindow, /qc\.invalidateQueries\(\{ queryKey: \["inbox", "unread-count"\] \}\)/);
});

test("AppWindow report-open action is a normalized desktop event", () => {
  assert.match(appWindow, /"\/api\/desktop\/events"/);
  assert.match(appWindow, /eventType: "desktop\.bug_report\.opened"/);
  assert.match(desktopRoute, /"desktop\.bug_report\.opened"/);
});

test("bug-report form strings are in the localization catalog", () => {
  for (const key of [
    "appWindow.reportBug",
    "appWindow.bugReport.title",
    "appWindow.bugReport.summary",
    "appWindow.bugReport.details",
    "appWindow.bugReport.expected",
    "appWindow.bugReport.steps",
    "appWindow.bugReport.severity",
    "appWindow.bugReport.submit",
    "appWindow.bugReport.success",
  ]) {
    assert.match(localizationCatalog, new RegExp(`"${key.replaceAll(".", "\\.")}"`));
  }
});
