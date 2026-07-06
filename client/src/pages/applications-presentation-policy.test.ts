import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const applicationsSource = readFileSync("client/src/pages/Applications.tsx", "utf8");

test("Applications route exposes a Gamma-aware presentation boundary", () => {
  assert.match(applicationsSource, /usePresentationShell/);
  assert.match(applicationsSource, /data-applications-presentation-host=\{presentation\.host\}/);
  assert.match(applicationsSource, /data-applications-surface="applications"/);
  assert.match(applicationsSource, /data-applications-region="surface"/);
  assert.match(applicationsSource, /\[data-applications-presentation-host="gamma"\]/);
});

test("Applications Gamma chrome covers apphost carousel progress and actions", () => {
  for (const region of [
    "toolbar",
    "app-grid",
    "carousel-shell",
    "carousel-controls",
    "title-carousel",
    "title-card",
    "cover-frame",
    "cover-image",
    "card-summary",
    "card-pill",
    "detail-panel",
    "launch-window",
    "conflict-banner",
    "status-block",
    "state-pill",
    "progress",
    "progress-track",
    "progress-fill",
    "support-note",
    "actions",
    "action-button",
    "empty-state",
    "separator",
  ]) {
    assert.match(applicationsSource, new RegExp(`data-applications-region="${region}"`));
  }

  assert.match(applicationsSource, /data-applications-app-id=\{app\.id\}/);
  assert.match(applicationsSource, /background-image:\s*none/);
  assert.match(applicationsSource, /box-shadow:\s*none/);
  assert.match(applicationsSource, /text-shadow:\s*none/);
  assert.match(applicationsSource, /border-radius:\s*6px/);
  assert.match(applicationsSource, /#00d2ff/);
});

test("Applications keeps implementation diagnostics out of the user surface", () => {
  assert.doesNotMatch(applicationsSource, /JSON\.stringify\(status\.diagnostics/);
  assert.doesNotMatch(applicationsSource, /PID:/);
  assert.doesNotMatch(applicationsSource, /Health:/);
  assert.match(applicationsSource, /role="progressbar"/);
  assert.match(applicationsSource, /wtfOS handles setup privately/);
});

test("Applications presents remote titles from apphost manifests", () => {
  assert.match(applicationsSource, /coverImageUrl/);
  assert.match(applicationsSource, /coverImageAlt/);
  assert.match(applicationsSource, /summary/);
  assert.match(applicationsSource, /category/);
  assert.match(applicationsSource, /External apps/);
  assert.match(applicationsSource, /External app title selection/);
  assert.match(applicationsSource, /activeSession/);
  assert.match(applicationsSource, /Sorry, try joining user/);
  assert.match(applicationsSource, /selectedBlockedByActiveSession/);
});

test("Applications keeps shared apphost API behavior raw and window-managed", () => {
  assert.match(applicationsSource, /api\.get<ApplicationsResponse>\("\/api\/apphost\/apps"\)/);
  assert.match(applicationsSource, /function fetchStatus\(appId: string\)/);
  assert.match(applicationsSource, /\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/status/);
  assert.match(applicationsSource, /api\.post<LaunchResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/stop`, \{\}\)/);
  assert.match(applicationsSource, /wm\.openPage\(path\)/);
  assert.match(applicationsSource, /wm\.setSize\(path, bounds\.width, bounds\.height\)/);
  assert.doesNotMatch(applicationsSource, /window\.open\(applicationPlayPath\(appId\), "_blank"/);
  assert.doesNotMatch(applicationsSource, /\/api\/gamma/);
});
