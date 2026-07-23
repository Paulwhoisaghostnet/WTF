import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./operator-signer-request.mjs", import.meta.url),
  "utf8",
);

test("custom signer requests accept only an explicit safe non-negative mutez amount", () => {
  assert.match(source, /WTF_OPERATOR_SIGNER_CALL_MUTEZ/);
  assert.match(source, /\/\^\\d\+\$\/\.test\(callMutezRaw\)/);
  assert.match(source, /Number\.isSafeInteger\(callMutez\)/);
  assert.match(source, /mutez:\s*callMutez/);
});
