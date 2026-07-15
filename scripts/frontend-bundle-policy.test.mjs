import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync("vite.config.ts", "utf8");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("frontend bundle stubs Node-only wallet imports for the browser", () => {
  for (const alias of [
    "https",
    "http",
    "stream",
    "os",
    "net",
    "tls",
    "fs",
    "node:fs",
    "crypto",
    "node:crypto",
  ]) {
    const quoted = JSON.stringify(alias);
    const unquoted = /^[a-z]+$/.test(alias) ? escapeRegExp(alias) : quoted;
    assert.match(
      viteConfig,
      new RegExp(`(?:${quoted}|${unquoted}):\\s*emptyModule|find:\\s*${quoted},\\s*replacement:\\s*emptyModule`),
    );
  }
});

test("frontend bundle isolates wallet SDKs into explicit lazy vendor chunks", () => {
  assert.match(viteConfig, /chunkSizeWarningLimit:\s*2500/);
  assert.match(viteConfig, /id\.includes\("@tezos-x\/"\)\) return "vendor-octez"/);
  assert.match(viteConfig, /id\.includes\("@taquito\/"\)\) return "vendor-taquito"/);
  assert.match(
    viteConfig,
    /id\.includes\("@ecadlabs\/"\) \|\| id\.includes\("@airgap\/"\)\) return "vendor-beacon"/
  );
  assert.match(viteConfig, /id\.includes\("@walletconnect\/"\)\) return "vendor-walletconnect"/);
  assert.match(viteConfig, /id\.includes\("@stablelib\/"\)/);
  assert.match(viteConfig, /return "vendor-crypto"/);
});
