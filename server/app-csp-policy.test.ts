import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("server/app.ts", "utf8");

test("production CSP keeps WalletConnect/Reown, Beacon, trusted calendar, and WTF TV embeds as explicit frame sources", () => {
  for (const source of [
    "https://walletbeacon.io",
    "https://*.walletbeacon.io",
    "https://walletconnect.com",
    "https://walletconnect.org",
    "https://reown.com",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
    "https://thetezos.com",
    "https://odysee.com",
  ]) {
    assert.match(appSource, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(appSource, /const walletConnectFrameSources = \[/);
  assert.match(appSource, /const walletFrameSources = \[/);
  assert.match(appSource, /const trustedCalendarFrameSources = \[/);
  assert.match(appSource, /const trustedTvFrameSources = \[/);
  assert.match(appSource, /"frame-src": \["'self'", \.\.\.walletFrameSources, \.\.\.trustedCalendarFrameSources, \.\.\.trustedTvFrameSources\]/);
  assert.match(appSource, /"child-src": \["'self'", \.\.\.walletFrameSources, \.\.\.trustedCalendarFrameSources, \.\.\.trustedTvFrameSources\]/);
  assert.doesNotMatch(appSource, /"frame-src": \["'self'"\]/);
});

test("production CSP keeps WalletConnect/Reown relay traffic explicit", () => {
  for (const source of [
    "https://walletconnect.com",
    "https://walletconnect.org",
    "https://reown.com",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://*.reown.com",
    "wss://walletconnect.com",
    "wss://walletconnect.org",
    "wss://reown.com",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "wss://*.reown.com",
  ]) {
    assert.match(appSource, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(appSource, /const walletConnectNetworkSources = \[/);
  assert.match(appSource, /"connect-src": \["'self'", "https:", "wss:", "ws:", \.\.\.walletConnectNetworkSources\]/);
  assert.match(appSource, /contentSecurityPolicy:[\s\S]*directives: baseCspDirectives/);
});

test("production CSP can drop unsafe-inline scripts when CSP_STRICT_SCRIPTS=1", () => {
  assert.match(appSource, /CSP_STRICT_SCRIPTS/);
  assert.match(appSource, /strictProductionScripts/);
  assert.match(appSource, /strictProductionScripts \? \[\] : \["'unsafe-inline'"\]/);
});
