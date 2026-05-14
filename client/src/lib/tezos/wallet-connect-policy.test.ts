import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Octez Connect is the primary wallet path with valid featured wallet prefixes", () => {
  const source = readFileSync(new URL("./wallet.ts", import.meta.url), "utf8");

  assert.match(source, /"kukai"/);
  assert.match(source, /"temple"/);
  assert.match(source, /"umami"/);
  assert.doesNotMatch(source, /"plenty"/);
  assert.doesNotMatch(source, /"ookjlbkiijinhpmnjffcofjonbfbgaoc"/);
  assert.match(source, /featuredWallets: OCTEZ_FEATURED_WALLETS/);
  assert.doesNotMatch(source, /wtf:enable-octez-connect/);
  assert.doesNotMatch(source, /isOctezConnectEnabled/);
  assert.match(source, /const octez = new OctezConnectAdapter\(\)/);
  assert.match(source, /return octez/);
  assert.match(source, /let adapterInitPromise:/);
  assert.match(source, /let connectPromise:/);
  assert.match(source, /network: \{ type: preferredNetwork as any, rpcUrl: _rpcUrl \}/);
  assert.match(source, /enableMetrics: false/);
  assert.match(source, /network: \{ type: this\.network as any, rpcUrl: this\.rpcUrl \}/);
  assert.match(source, /enableMetrics: false/);
  assert.match(source, /preflightOctezExtensionHandshake/);
  assert.match(source, /WalletAccountMismatchError/);
  assert.match(source, /expectedAddress && !sameWalletAddress\(address, expectedAddress\)/);
  assert.doesNotMatch(source, /requestPermissions\(\{\s*network/s);
});
