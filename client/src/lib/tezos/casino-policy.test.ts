import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./casino.ts", import.meta.url), "utf8");

test("Casino membership sends the compiled single-field entrypoint as a string", () => {
  assert.match(
    source,
    /\.methods\s*\.purchase_membership\(membershipRef\)/,
  );
  assert.doesNotMatch(
    source,
    /\.methodsObject\s*\.purchase_membership\(\{\s*membership_ref:/,
  );
});
