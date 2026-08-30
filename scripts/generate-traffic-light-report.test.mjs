import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyJourneyStatus,
  parseReleaseLedger,
  renderTrafficLightReport,
} from "./generate-traffic-light-report.mjs";

const ledger = `# WTF commission release evidence

Candidate commit: SELF

| Journey | Status | Actor/environment | Automated proof | Durable result | Visual/trace evidence | Defect or blocker |
| --- | --- | --- | --- | --- | --- | --- |
${Array.from({ length: 12 }, (_, index) => {
  const id = `J-${String(index + 1).padStart(2, "0")}`;
  const status = index === 10 ? "READY FOR TEST" : "PASS — LOCAL CANDIDATE";
  return `| ${id} Journey ${index + 1} | ${status} | actor | proof | result | evidence | — |`;
}).join("\n")}
`;

test("traffic-light classification follows the commission candidate gate", () => {
  assert.equal(classifyJourneyStatus("PASS — LOCAL CANDIDATE"), "GREEN");
  assert.equal(classifyJourneyStatus("READY FOR TEST"), "AMBER");
  assert.equal(classifyJourneyStatus("NOT RUN"), "RED");
  assert.equal(classifyJourneyStatus("READY FOR BASELINE RETEST"), "RED");
});

test("release ledger parsing requires the complete J-01 through J-12 contract", () => {
  const parsed = parseReleaseLedger(ledger);
  assert.equal(parsed.candidateCommit, "SELF");
  assert.deepEqual(parsed.journeys.map((journey) => journey.id), [
    "J-01", "J-02", "J-03", "J-04", "J-05", "J-06",
    "J-07", "J-08", "J-09", "J-10", "J-11", "J-12",
  ]);
  assert.throws(
    () => parseReleaseLedger(ledger.replace("| J-12 Journey 12", "| J-11 Journey 12")),
    /duplicate journey J-11/u,
  );
});

test("traffic-light report is deterministic and names every non-green journey", () => {
  const report = renderTrafficLightReport(parseReleaseLedger(ledger));
  assert.match(report, /Candidate commit: `SELF` \(the commit containing this report\)/u);
  assert.match(report, /Green: 11 · Amber: 1 · Red: 0/u);
  assert.match(report, /\| J-11 \| AMBER \| READY FOR TEST \|/u);
  assert.doesNotMatch(report, /Generated:/u);
});
