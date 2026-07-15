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
