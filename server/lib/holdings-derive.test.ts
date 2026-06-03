import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./holdings-derive.ts", import.meta.url), "utf8");

test("holdings derive normalizes token_amount before numeric aggregation", () => {
  assert.match(source, /WITH normalized_events AS/);
  assert.match(source, /NULLIF\(BTRIM\(we\.token_amount\), ''\) ~ '\^\[0-9\]\+\(\[.\]\[0-9\]\+\)\?\$'/);
  assert.match(source, /ELSE 1/);
  assert.match(source, /we\.token_amount_numeric/);
  assert.doesNotMatch(source, /NULLIF\(we\.token_amount,''\)::numeric/);
});
