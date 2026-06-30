import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ratRaceSource = readFileSync("client/src/pages/RatRace.tsx", "utf8");

test("Rat Race app chrome is presentation-host aware", () => {
  assert.match(ratRaceSource, /usePresentationShell/);
  assert.match(ratRaceSource, /data-rat-race-surface="rat-race"/);
  assert.match(ratRaceSource, /data-rat-race-presentation-host=\{presentation\.host\}/);
  assert.match(ratRaceSource, /\[data-rat-race-presentation-host="gamma"\]/);
  assert.match(ratRaceSource, /data-rat-race-region="header"/);
  assert.match(ratRaceSource, /data-rat-race-region="card"/);
  assert.match(ratRaceSource, /data-rat-race-region="meter-fill"/);
  assert.match(ratRaceSource, /background-image:\s*none/);
  assert.match(ratRaceSource, /box-shadow:\s*none/);
  assert.match(ratRaceSource, /border-radius:\s*6px/);
  assert.match(ratRaceSource, /#00d2ff/);
});

test("Rat Race keeps external marketplace exits and shared purchase logic raw", () => {
  assert.match(ratRaceSource, /window\.open\(item\.marketUrl/);
  assert.match(ratRaceSource, /purchaseRatRaceListing/);
  assert.doesNotMatch(ratRaceSource, /presentationRouteHref\(item\.marketUrl/);
});
