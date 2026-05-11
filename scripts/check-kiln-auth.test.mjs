import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/check-kiln-auth.mjs", "utf8");

test("kiln auth deploy check probes a protected mutation without a token", () => {
  assert.match(source, /KILN_PUBLIC_URL/);
  assert.match(source, /\/api\/kiln\/workflow\/run/);
  assert.match(source, /method:\s*"POST"/);
  assert.doesNotMatch(source, /x-kiln-token/i);
  assert.match(source, /response\.status === 401 \|\| response\.status === 403/);
});
