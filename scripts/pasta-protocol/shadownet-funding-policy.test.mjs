import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./fund-shadownet-proof-wallet.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));

test("Shadownet proof-wallet funding is explicit, bounded, and mainnet-forbidden", () => {
  assert.match(source, /PASTA_SHADOWNET_E2E_FUND/);
  assert.match(source, /TEZOS_NETWORK/);
  assert.match(source, /mainnet funding is forbidden/);
  assert.match(source, /amountMutez >= 1 && amountMutez <= 2_000_000/);
  assert.match(source, /assertShadownet/);
  assert.match(source, /operationHash: operation\.hash/);
  assert.equal(
    packageJson.scripts["pasta:shadownet:fund-proof-wallet"],
    "tsx scripts/pasta-protocol/fund-shadownet-proof-wallet.ts",
  );
});
