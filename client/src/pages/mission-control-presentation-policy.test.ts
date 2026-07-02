import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const missionControlSource = readFileSync("client/src/pages/MissionControl.tsx", "utf8");

test("Mission Control route cockpit is presentation-host aware", () => {
  assert.match(missionControlSource, /usePresentationShell/);
  assert.match(missionControlSource, /presentationRouteHref\(path,\s*presentation\.host\)/);
  assert.match(missionControlSource, /data-mission-control-presentation-host=\{presentation\.host\}/);
  assert.match(missionControlSource, /data-mission-control-surface="mission-control"/);
  assert.match(missionControlSource, /data-mission-control-region="surface"/);
  assert.match(missionControlSource, /data-mission-control-region="status-grid"/);
  assert.match(missionControlSource, /data-mission-control-region="actions"/);
  assert.match(missionControlSource, /data-mission-control-region="metric"/);
  assert.match(missionControlSource, /data-mission-control-region="row"/);
  assert.match(missionControlSource, /data-mission-control-region="button"/);
  assert.match(missionControlSource, /\[data-mission-control-presentation-host="gamma"\]/);
  assert.match(missionControlSource, /background-image:\s*none/);
  assert.match(missionControlSource, /box-shadow:\s*none/);
  assert.match(missionControlSource, /border-radius:\s*6px/);
});
