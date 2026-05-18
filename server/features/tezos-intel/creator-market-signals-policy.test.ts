import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scorePanel = readFileSync(
  "client/src/features/tezos-intel/CreatorScorePanel.tsx",
  "utf8"
);
const comparePanel = readFileSync(
  "client/src/features/tezos-intel/CreatorComparePanel.tsx",
  "utf8"
);
const routes = readFileSync("server/features/tezos-intel/routes.ts", "utf8");

test("creator intel is presented as market signals, not artist ranking", () => {
  assert.match(scorePanel, /Creator Market Signals/);
  assert.match(scorePanel, /Market signal/);
  assert.match(scorePanel, /Market band/);
  assert.match(scorePanel, /not creator\s+quality/);
  assert.doesNotMatch(scorePanel, /<PanelTitle>Creator Score<\/PanelTitle>/);
  assert.doesNotMatch(scorePanel, /<MetricLabel>Grade<\/MetricLabel>/);
});

test("creator compare uses the same market-signal language", () => {
  assert.match(comparePanel, /Creator Market Compare/);
  assert.match(comparePanel, /Comparing market signals/);
  assert.match(comparePanel, /Market signal/);
  assert.doesNotMatch(comparePanel, /<MetricLabel>Score<\/MetricLabel>/);
});

test("creator intel API errors avoid score-as-judgment copy", () => {
  assert.match(routes, /creator market signals failed/);
  assert.match(routes, /Failed to load creator market signals/);
  assert.doesNotMatch(routes, /Failed to load creator score/);
});
