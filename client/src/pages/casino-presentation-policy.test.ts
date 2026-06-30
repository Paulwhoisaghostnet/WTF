import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const casinoSource = readFileSync(new URL("./Casino.tsx", import.meta.url), "utf8");

test("Casino lobby chrome is presentation-host aware", () => {
  assert.match(casinoSource, /usePresentationShell/);
  assert.match(casinoSource, /data-casino-presentation-host=\{presentation\.host\}/);
  assert.match(casinoSource, /data-casino-surface="lobby"/);
  assert.match(casinoSource, /data-casino-region="surface"/);
  assert.match(casinoSource, /data-casino-region="title-panel"/);
  assert.match(casinoSource, /data-casino-region="meter"/);
  assert.match(casinoSource, /data-casino-region="floor"/);
  assert.match(casinoSource, /data-casino-region="game-card"/);
  assert.match(casinoSource, /data-casino-region="entry-controls"/);
  assert.match(casinoSource, /\[data-casino-presentation-host="gamma"\]/);
  assert.match(casinoSource, /\[data-casino-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(casinoSource, /\[data-casino-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(casinoSource, /\[data-casino-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  assert.match(casinoSource, /letter-spacing:\s*0/);
});

test("Casino lobby handoffs preserve Gamma route ownership", () => {
  assert.match(casinoSource, /const openCasinoRoute = \(route: string\) =>/);
  assert.match(casinoSource, /presentation\.host === "gamma"/);
  assert.match(casinoSource, /setLocation\(presentationRouteHref\(route, presentation\.host\)\)/);
  assert.match(casinoSource, /wm\.openPage\(route\)/);
  assert.match(casinoSource, /openCasinoRoute\(`\/casino\/\$\{game\.key\}`\)/);
  assert.match(casinoSource, /openCasinoRoute\("\/wtfiam"\)/);
  assert.doesNotMatch(casinoSource, /wm\.openPage\(`\/casino\/\$\{game\.key\}`\)/);
  assert.doesNotMatch(casinoSource, /wm\.openPage\("\/wtfiam"\)/);
});

test("Casino lobby keeps shared casino, wallet, and market behavior unchanged", () => {
  for (const apiPath of [
    "/api/casino/status",
    "/api/casino/games",
    "/api/casino/membership-intents",
    "/api/casino/membership-verify",
    "/api/casino/entry",
  ]) {
    assert.match(casinoSource, new RegExp(apiPath.replace(/[/?]/g, "\\$&")));
  }
  assert.match(casinoSource, /purchaseCasinoMembership/);
  assert.match(casinoSource, /wallet\.connect\(\)/);
  assert.doesNotMatch(casinoSource, /\/api\/gamma/);
});
