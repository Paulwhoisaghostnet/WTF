import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./MintPortal.tsx", import.meta.url), "utf8");

test("Mint Portal exposes direct wallet minting through the WTF mint pipeline", () => {
  assert.match(source, /Mint from WTF/);
  assert.match(source, /\/api\/mint-portal\/contracts/);
  assert.match(source, /mintOpenEditionFromWtf/);
  assert.match(source, /wallet\.connect\(\)/);
  assert.match(source, /\/api\/mint-portal\/record-mint/);
  assert.match(source, /Provider: \{wallet\.providerName \|\| "none"\}/);
});
