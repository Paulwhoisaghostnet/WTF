import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hoardSource = readFileSync("client/src/pages/Hoard.tsx", "utf8");

test("Hoard chamber chrome is presentation-host aware", () => {
  assert.match(hoardSource, /usePresentationShell/);
  assert.match(hoardSource, /data-hoard-surface="treasure-chamber"/);
  assert.match(hoardSource, /data-hoard-presentation-host=\{presentation\.host\}/);
  assert.match(hoardSource, /\[data-hoard-presentation-host="gamma"\]/);
  assert.match(hoardSource, /data-hoard-region="surface"/);
  assert.match(hoardSource, /data-hoard-region="meta-bar"/);
  assert.match(hoardSource, /data-hoard-region="stage"/);
  assert.match(hoardSource, /data-hoard-region="canvas"/);
  assert.match(hoardSource, /data-hoard-region="empty-state"/);
});

test("Hoard Gamma wrapper avoids classic panel treatment while preserving the animated chamber", () => {
  assert.match(hoardSource, /background-image:\s*none/);
  assert.match(hoardSource, /box-shadow:\s*none/);
  assert.match(hoardSource, /border-radius:\s*6px/);
  assert.match(hoardSource, /#00d2ff/);
  assert.match(hoardSource, /#d6ff3f/);
  assert.match(hoardSource, /runScene\(canvasRef\.current, tokens, totalCoins, stopRef\)/);
});

test("Hoard keeps wallet and token behavior on shared APIs", () => {
  assert.match(hoardSource, /useWallet/);
  assert.match(hoardSource, /queryKey:\s*\["hoard-tokens"\]/);
  assert.match(hoardSource, /\/api\/profile\/tokens\?limit=500&sortBy=balance&sortDir=desc/);
  assert.doesNotMatch(hoardSource, /\/api\/gamma/);
});
