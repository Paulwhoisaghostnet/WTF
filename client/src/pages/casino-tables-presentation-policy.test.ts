import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tableSources = {
  wtfButton: readFileSync(new URL("./WtfButton.tsx", import.meta.url), "utf8"),
  rugPull: readFileSync(new URL("./RugPull.tsx", import.meta.url), "utf8"),
  raceway: readFileSync(new URL("./GuineaPigRaceway.tsx", import.meta.url), "utf8"),
};

test("Casino table routes expose Gamma-owned presentation regions", () => {
  for (const source of Object.values(tableSources)) {
    assert.match(source, /usePresentationShell/);
    assert.match(source, /data-casino-table-presentation-host=\{presentation\.host\}/);
    assert.match(source, /data-casino-table-region="surface"/);
    assert.match(source, /data-casino-table-region="title-panel"/);
    assert.match(source, /data-casino-table-region="wallet"/);
    assert.match(source, /\[data-casino-table-presentation-host="gamma"\]/);
    assert.match(source, /\[data-casino-table-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
    assert.match(source, /\[data-casino-table-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
    assert.match(source, /\[data-casino-table-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  }
});

test("Casino table back-navigation preserves Gamma route ownership", () => {
  for (const source of Object.values(tableSources)) {
    assert.match(source, /const openCasinoLobby = \(\) =>/);
    assert.match(source, /presentation\.host === "gamma"/);
    assert.match(source, /setLocation\(presentationRouteHref\("\/casino", presentation\.host\)\)/);
    assert.match(source, /wm\.openPage\("\/casino"\)/);
    assert.doesNotMatch(source, /onClick=\{\(\) => wm\.openPage\("\/casino"\)\}/);
  }
});

test("Casino table routes keep shared table APIs unchanged", () => {
  assert.match(tableSources.wtfButton, /\/api\/casino\/wtf-button\/state/);
  assert.match(tableSources.wtfButton, /\/api\/casino\/wtf-button\/quote/);
  assert.match(tableSources.wtfButton, /\/api\/casino\/wtf-button\/press/);
  assert.match(tableSources.rugPull, /\/api\/casino\/rug-pull\/state/);
  assert.match(tableSources.rugPull, /\/api\/casino\/rug-pull\/press/);
  assert.match(tableSources.rugPull, /\/api\/casino\/rug-pull\/join/);
  assert.match(tableSources.rugPull, /\/api\/casino\/rug-pull\/vote/);
  assert.match(tableSources.raceway, /\/api\/casino\/guinea-pig-raceway\/state/);
  assert.match(tableSources.raceway, /\/api\/casino\/guinea-pig-raceway\/bet/);
  assert.match(tableSources.raceway, /\/api\/casino\/guinea-pig-raceway\/effect/);
  for (const source of Object.values(tableSources)) {
    assert.doesNotMatch(source, /\/api\/gamma/);
  }
});
