import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("server/app.ts", "utf8");

test("production CSP keeps WalletConnect/Reown, Beacon, trusted calendar, and WTF TV embeds as explicit frame sources", () => {
  for (const source of [
    "https://walletbeacon.io",
    "https://*.walletbeacon.io",
    "https://*.octez.io",
    "https://walletconnect.com",
    "https://walletconnect.org",
    "https://reown.com",
    "https://walletbeacon.io",
    "https://*.walletbeacon.io",
    "https://*.octez.io",
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
    "wss://walletbeacon.io",
    "wss://*.walletbeacon.io",
    "wss://*.octez.io",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "wss://*.reown.com",
  ]) {
    assert.match(appSource, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(appSource, /const walletConnectNetworkSources = \[/);
  assert.match(appSource, /"connect-src": \["'self'", \.\.\.trustedNetworkSources, \.\.\.walletConnectNetworkSources\]/);
  assert.doesNotMatch(appSource, /"connect-src": \[[^\]]*"https:"/);
  assert.doesNotMatch(appSource, /"connect-src": \[[^\]]*"wss:"/);
  assert.doesNotMatch(appSource, /"connect-src": \[[^\]]*"ws:"/);
  assert.match(appSource, /contentSecurityPolicy:[\s\S]*directives: baseCspDirectives/);
});

test("production shell scripts are strict by default", () => {
  const baseScriptBlock = appSource.match(/const baseScriptSrc = \[([\s\S]*?)\n  \];/)?.[1] || "";
  assert.match(baseScriptBlock, /"'self'"/);
  assert.doesNotMatch(baseScriptBlock, /unsafe-inline/);
  assert.doesNotMatch(baseScriptBlock, /unsafe-eval/);
  assert.doesNotMatch(baseScriptBlock, /blob:/);
  assert.doesNotMatch(baseScriptBlock, /data:/);
  assert.doesNotMatch(baseScriptBlock, /wasm-unsafe-eval/);
  assert.doesNotMatch(appSource, /CSP_STRICT_SCRIPTS/);
});

test("legacy cartridge capabilities are isolated to named route exceptions", () => {
  assert.match(appSource, /const LEGACY_SCRIPT_EXCEPTION_PATHS = \["\/games\/installed", "\/creation-tools"\]/);
  assert.match(appSource, /"'unsafe-inline'"/);
  assert.match(appSource, /"'unsafe-eval'"/);
  assert.match(appSource, /"'wasm-unsafe-eval'"/);
  assert.match(appSource, /"worker-src": \["'self'", "blob:"\]/);
  assert.match(appSource, /LEGACY_SCRIPT_EXCEPTION_PATHS,[\s\S]*helmet\.contentSecurityPolicy/);
});
