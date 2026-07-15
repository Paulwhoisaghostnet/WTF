import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hostRouter = readFileSync("server/features/wtf-sites/host-router.ts", "utf8");
const pdsRenderer = readFileSync("scripts/wtfos-user-site-renderer.ts", "utf8");

test("user-site CSP allows WalletConnect relay and verification frame", () => {
  assert.match(hostRouter, /const USER_SITE_WALLET_CONNECT_SOURCES = \[/);
  assert.match(hostRouter, /`connect-src 'self' https: \$\{USER_SITE_WALLET_CONNECT_SOURCES\.join\(" "\)\}`/);
  assert.match(hostRouter, /const USER_SITE_WALLET_FRAME_SOURCES = \[/);
  assert.match(hostRouter, /`frame-src \$\{USER_SITE_WALLET_FRAME_SOURCES\.join\(" "\)\}`/);
  assert.match(pdsRenderer, /connect-src 'self' https: wss:\/\/relay\.walletconnect\.org/);
  assert.match(pdsRenderer, /frame-src https:\/\/verify\.walletconnect\.org/);

  for (const source of [hostRouter, pdsRenderer]) {
    assert.match(source, /wss:\/\/relay\.walletconnect\.org/);
    assert.match(source, /https:\/\/verify\.walletconnect\.org/);
    assert.match(source, /wss:\/\/\*\.octez\.io/);
    assert.match(source, /wss:\/\/walletbeacon\.io/);
    assert.match(source, /wss:\/\/\*\.walletbeacon\.io/);
    assert.match(source, /https:\/\/walletbeacon\.io/);
    assert.match(source, /https:\/\/\*\.walletbeacon\.io/);
    assert.match(source, /https:\/\/\*\.octez\.io/);
  }
});
