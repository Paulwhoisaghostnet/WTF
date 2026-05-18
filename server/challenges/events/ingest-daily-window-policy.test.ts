import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("daily challenge automation evaluation is bounded to the UTC completion day", () => {
  const ingestSource = readFileSync("server/challenges/events/ingest.ts", "utf8");
  const evaluatorSource = readFileSync("server/challenges/predicates/evaluator.ts", "utf8");

  assert.match(ingestSource, /function completionWindowFor/);
  assert.match(ingestSource, /mode === "daily"/);
  assert.match(ingestSource, /Date\.UTC/);
  assert.match(ingestSource, /completionWindowStart: completionWindow\?\.start/);
  assert.match(ingestSource, /completionWindowEnd: completionWindow\?\.end/);
  assert.match(evaluatorSource, /completionWindowStart/);
  assert.match(evaluatorSource, /completionWindowEnd/);
  assert.match(evaluatorSource, /lt\(challengeSystemEvents\.occurredAt, context\.completionWindowEnd\)/);
});
