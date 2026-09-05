import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const swapSource = readFileSync(new URL("./Swap.tsx", import.meta.url), "utf8");
const gammaSpecSource = readFileSync(
  new URL("../../../tests/playwright/inventory/gamma-wtfos.spec.mjs", import.meta.url),
  "utf8"
);
const walletSource = readFileSync(new URL("../lib/tezos/wallet.ts", import.meta.url), "utf8");

test("Swap app chrome is presentation-host aware", () => {
  assert.match(swapSource, /usePresentationShell/);
  assert.match(swapSource, /data-swap-presentation-host=\{presentation\.host\}/);
  assert.match(swapSource, /data-swap-surface="swap"/);
  assert.match(swapSource, /data-swap-region="surface"/);
  assert.match(swapSource, /data-swap-region="health"/);
  assert.match(swapSource, /data-swap-region="from-panel"/);
  assert.match(swapSource, /data-swap-region="to-panel"/);
  assert.match(swapSource, /data-swap-region="amount-input"/);
  assert.match(swapSource, /data-swap-region="quote-output"/);
  assert.match(swapSource, /swapRegionAttrs\("direction-button"\)/);
  assert.match(swapSource, /data-swap-region="slippage-panel"/);
  assert.match(swapSource, /data-swap-region="info-panel"/);
  assert.match(swapSource, /data-swap-region="submit-button"/);
});

test("Swap Gamma styling is scoped to presentation chrome", () => {
  assert.match(swapSource, /\[data-swap-presentation-host="gamma"\]/);
  assert.match(swapSource, /background:\s*#070706/);
  assert.match(swapSource, /color:\s*#f2ead9/);
  assert.match(swapSource, /color:\s*#00d2ff/);
  assert.match(swapSource, /border-color:\s*#d6ff3f/);
  assert.match(swapSource, /background-image:\s*none\s*!important/);
  assert.match(swapSource, /box-shadow:\s*none\s*!important/);
  assert.match(swapSource, /text-shadow:\s*none\s*!important/);
  assert.match(swapSource, /border-radius:\s*6px\s*!important/);
});

test("Swap keeps shared DEX and wallet behavior raw", () => {
  assert.match(swapSource, /api\.get<SpicyToken\[\]>\("\/api\/dex\/tokens"\)/);
  assert.match(swapSource, /api\.get<SpicyPool\[\]>\("\/api\/dex\/pools"\)/);
  assert.match(swapSource, /\/api\/dex\/counterparts\/\$\{encodeURIComponent\(tag!\)\}/);
  assert.match(swapSource, /\/api\/dex\/health/);
  assert.match(swapSource, /const opHash = await executeSwap\(params\)/);
  assert.match(swapSource, /https:\/\/3route\.io\/swap/);
  assert.doesNotMatch(swapSource, /\/api\/gamma/);
});

test("Swap token icons use the shared FileShip-first preview recovery chain", () => {
  assert.match(swapSource, /resolveTokenThumbnail/);
  assert.match(swapSource, /advanceResolvedMediaFallback/);
  assert.doesNotMatch(swapSource, /https:\/\/gateway\.pinata\.cloud\/ipfs\//);
});

test("Swap Gamma proof seeds the current accepted wallet session provider", () => {
  assert.match(walletSource, /parsed\.providerName !== "octez\.connect"/);
  assert.match(gammaSpecSource, /"wtf:wallet-session"/);
  assert.match(gammaSpecSource, /providerName:\s*"octez\.connect"/);
  assert.doesNotMatch(gammaSpecSource, /providerName:\s*"beacon"/);
});
