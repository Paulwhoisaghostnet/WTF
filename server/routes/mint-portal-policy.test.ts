import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("server/routes/mint-portal.ts", "utf8");

test("mint portal exposes only live open-edition WTF contracts for wallet minting", () => {
  assert.match(route, /\/api\/mint-portal\/contracts/);
  assert.match(route, /eq\(collectionContracts\.templateKind, "open_edition"\)/);
  assert.match(route, /eq\(collectionContracts\.status, "live"\)/);
  assert.match(route, /network: z\.enum\(\["ghostnet", "shadownet", "mainnet"\]\)\.optional\(\)/);
});

test("mint portal records wallet-signed WTF mints against direct contract-bound challenges", () => {
  assert.match(route, /\/api\/mint-portal\/record-mint/);
  assert.match(route, /tokenContract: z\.string\(\)\.trim\(\)\.regex\(\/\^KT1/);
  assert.match(route, /opHash: z\.string\(\)\.trim\(\)\.regex\(\/\^o/);
  assert.match(route, /Challenge is not accepting submissions/);
  assert.match(route, /Mint contract does not match challenge binding/);
  assert.match(route, /Challenge has no direct WTF mint contract binding/);
  assert.match(route, /source: "wtf_mint"/);
  assert.match(route, /mintTokenContract: body\.tokenContract/);
  assert.match(route, /mintOpHash: body\.opHash/);
});
