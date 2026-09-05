import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ObjktOperator.tsx", import.meta.url), "utf8");

test("Objkt Operator portfolio previews use shared FileShip-first recovery", () => {
  assert.match(source, /RecoverableIpfsImage/);
  assert.match(source, /styled\(RecoverableIpfsImage\)/);
  assert.doesNotMatch(source, /https:\/\/ipfs\.fileship\.xyz\/\$\{uri\.slice\(7\)\}/);
});
