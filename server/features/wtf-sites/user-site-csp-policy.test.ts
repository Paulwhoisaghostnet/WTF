import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hostRouter = readFileSync("server/features/wtf-sites/host-router.ts", "utf8");
const pdsRenderer = readFileSync("scripts/wtfos-user-site-renderer.ts", "utf8");

test("user-site CSP allows WalletConnect relay and verification frame", () => {
  for (const source of [hostRouter, pdsRenderer]) {
    assert.match(source, /connect-src 'self' https: wss:\/\/relay\.walletconnect\.org/);
    assert.match(source, /frame-src https:\/\/verify\.walletconnect\.org/);
    assert.match(source, /wss:\/\/\*\.octez\.io/);
    assert.match(source, /wss:\/\/walletbeacon\.io/);
    assert.match(source, /wss:\/\/\*\.walletbeacon\.io/);
    assert.match(source, /https:\/\/walletbeacon\.io/);
    assert.match(source, /https:\/\/\*\.walletbeacon\.io/);
    assert.match(source, /https:\/\/\*\.octez\.io/);
  }
});
