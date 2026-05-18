import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./mint.ts", import.meta.url), "utf8");

test("mint-from-WTF uses wallet preflight before open-edition mint writes", () => {
  assert.match(source, /assertNetworkReadyForSend\(params\.walletAddress\)/);
  assert.match(source, /tezos\.wallet\.at\(contractAddress\)/);
  assert.match(source, /\.mint_editions\(/);
  assert.match(source, /to_: params\.walletAddress/);
  assert.match(source, /\.send\(\{ amount: totalMutez, mutez: true \}\)/);
  assert.match(source, /trackContractActivity/);
  assert.match(source, /module: "mint_portal"/);
  assert.doesNotMatch(source, /Tezos\.contract\.at/);
});
