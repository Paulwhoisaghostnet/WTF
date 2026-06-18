import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/features/wtf-sites/host-router.ts", "utf8");

test("user-site CSP keeps wallet relay and verification frames available for hosted drops", () => {
  assert.match(source, /wss:\/\/\*\.octez\.io/);
  assert.match(source, /wss:\/\/\*\.walletbeacon\.io/);
  assert.match(source, /wss:\/\/relay\.walletconnect\.org/);
  assert.match(source, /wss:\/\/\*\.walletconnect\.org/);
  assert.match(source, /wss:\/\/\*\.reown\.com/);
  assert.match(source, /https:\/\/\*\.octez\.io/);
  assert.match(source, /https:\/\/\*\.walletbeacon\.io/);
  assert.match(source, /https:\/\/verify\.walletconnect\.org/);
  assert.match(source, /frame-src \$\{USER_SITE_WALLET_FRAME_SOURCES\.join\(" "\)\}/);
  assert.doesNotMatch(source, /connect-src 'self' https:",/);
});

test("user-site wallet pages preserve opener compatibility for wallet popups", () => {
  assert.match(source, /Cross-Origin-Opener-Policy", "same-origin-allow-popups"/);
});
