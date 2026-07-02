import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roundsSource = readFileSync(new URL("./Rounds.tsx", import.meta.url), "utf8");
const roundDetailSource = readFileSync(new URL("./RoundDetail.tsx", import.meta.url), "utf8");
const roundInfoCardSource = readFileSync(new URL("../components/RoundInfoCard.tsx", import.meta.url), "utf8");

test("Rounds list chrome is presentation-host aware", () => {
  assert.match(roundsSource, /usePresentationShell/);
  assert.match(roundsSource, /presentationRouteHref/);
  assert.match(roundsSource, /data-rounds-presentation-host=\{presentation\.host\}/);
  assert.match(roundsSource, /data-rounds-surface="rounds"/);
  assert.match(roundsSource, /data-rounds-region="launch-board"/);
  assert.match(roundsSource, /data-rounds-region="launch-metric"/);
  assert.match(roundsSource, /data-rounds-region="round-card"/);
  assert.match(roundsSource, /\[data-rounds-presentation-host="gamma"\]/);
  assert.match(roundsSource, /\[data-rounds-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(roundsSource, /\[data-rounds-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(roundsSource, /\[data-rounds-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
});

test("Rounds app-owned handoffs stay presentation-aware without changing shared APIs", () => {
  for (const route of [
    "/mission-control",
    "/side-quests",
    "/challenges",
    "/calendar",
    "/admin",
  ]) {
    assert.match(roundsSource, new RegExp(`goToRoute\\("${route}"\\)`));
    assert.doesNotMatch(roundsSource, new RegExp(`setLocation\\("${route}"\\)`));
  }
  assert.match(roundsSource, /setLocation\(presentationRouteHref\(route, presentation\.host\)\)/);
  assert.match(roundsSource, /api\.get<any\[\]>\("\/api\/seasons"\)/);
  assert.match(roundsSource, /api\.get<any\[\]>\(`\/api\/rounds\?seasonId=\$\{activeSeason\.id\}`\)/);
  assert.match(roundsSource, /api\.get<any\[\]>\("\/api\/challenges"\)/);
  assert.doesNotMatch(roundsSource, /\/api\/gamma/);
});

test("Round Detail and shared RoundInfoCard expose Gamma-owned regions", () => {
  assert.match(roundDetailSource, /usePresentationShell/);
  assert.match(roundDetailSource, /presentationRouteHref/);
  assert.match(roundDetailSource, /data-rounds-presentation-host=\{presentation\.host\}/);
  assert.match(roundDetailSource, /data-rounds-surface="round-detail"/);
  assert.match(roundDetailSource, /data-rounds-region="challenge-card"/);
  assert.match(roundDetailSource, /goToRoute\("\/challenges"\)/);
  assert.match(roundDetailSource, /goToRoute\("\/rounds"\)/);
  assert.match(roundDetailSource, /setLocation\(presentationRouteHref\(route, presentation\.host\)\)/);
  assert.doesNotMatch(roundDetailSource, /setLocation\("\/challenges"\)/);
  assert.doesNotMatch(roundDetailSource, /setLocation\("\/rounds"\)/);
  assert.match(roundDetailSource, /api\.get<any>\(`\/api\/rounds\/\$\{roundId\}`\)/);
  assert.match(roundDetailSource, /api\.get<any\[\]>\(`\/api\/challenges\?roundId=\$\{roundId\}`\)/);
  assert.doesNotMatch(roundDetailSource, /\/api\/gamma/);

  assert.match(roundInfoCardSource, /data-rounds-region="info-card"/);
  assert.match(roundInfoCardSource, /data-rounds-region="info-meta"/);
  assert.match(roundInfoCardSource, /data-rounds-region="info-pill"/);
  assert.match(roundInfoCardSource, /data-rounds-region="mini-list"/);
  assert.match(roundInfoCardSource, /\[data-rounds-presentation-host="gamma"\] &/);
});
