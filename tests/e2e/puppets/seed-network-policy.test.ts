import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seedSource = readFileSync(new URL("./seed.ts", import.meta.url), "utf8");
const networkSource = readFileSync(
  new URL("../../../extensions/wtf-operator-signer/src/network.ts", import.meta.url),
  "utf8",
);

test("puppet seed repairs stale keyring network metadata before linking wallets", () => {
  assert.match(seedSource, /retargetWalletNetwork/);
  assert.match(seedSource, /wallet\.network\s*!==\s*input\.network/);
  assert.match(seedSource, /wallet\.chainId\s*!==\s*input\.expectedChainId/);
  assert.match(seedSource, /expectedChainId/);
  assert.match(seedSource, /probeRpcChainId/);
  assert.match(networkSource, /AbortController/);
  assert.match(networkSource, /tcinfra\.net\/rpc\/tezos\/shadownet/);
  assert.match(networkSource, /expectedChainId && chainId !== expectedChainId/);
});

test("console game seed is idempotent against the schema's unique slug contract", () => {
  const schemaSource = readFileSync(
    new URL("../../../shared/schema-liveops.ts", import.meta.url),
    "utf8",
  );

  assert.match(schemaSource, /slug:\s*varchar\("slug", \{ length: 120 \}\)\.notNull\(\)\.unique\(\)/);
  assert.match(
    seedSource,
    /\.insert\(consoleGames\)[\s\S]*?\.onConflictDoUpdate\(\{\s*target:\s*consoleGames\.slug,/,
  );
  assert.match(seedSource, /consoleStockGamesSeeded:\s*consoleSeedCount/);
});
