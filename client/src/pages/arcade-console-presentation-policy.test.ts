import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arcadeSource = readFileSync(new URL("./Arcade.tsx", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("./Console.tsx", import.meta.url), "utf8");

test("Arcade delegates to the shared Console app surface", () => {
  assert.match(arcadeSource, /import \{ Console \} from "\.\/Console"/);
  assert.match(arcadeSource, /<Console surface="arcade" \/>/);
});

test("Arcade and Console expose a Gamma presentation-host boundary", () => {
  assert.match(consoleSource, /usePresentationShell/);
  assert.match(consoleSource, /data-arcade-console-presentation-host=\{presentation\.host\}/);
  assert.match(consoleSource, /data-arcade-console-surface=\{surface\}/);
  assert.match(consoleSource, /data-arcade-console-view=\{view\}/);
  assert.match(consoleSource, /data-arcade-console-region/);
  assert.match(consoleSource, /"chassis"/);
  assert.match(consoleSource, /"stats-strip"/);
  assert.match(consoleSource, /"catalog-pane"/);
  assert.match(consoleSource, /"game-card"/);
  assert.match(consoleSource, /"activity-rail"/);
  assert.match(consoleSource, /"report-dialog"/);
  assert.match(consoleSource, /"payment-window"/);
  assert.match(consoleSource, /"game-frame"/);
});

test("Arcade and Console Gamma chrome is scoped to presentation styling only", () => {
  assert.match(consoleSource, /data-arcade-console-presentation-host="gamma"/);
  assert.match(consoleSource, /background-image:\s*none\s*!important/);
  assert.match(consoleSource, /box-shadow:\s*none\s*!important/);
  assert.match(consoleSource, /border-width:\s*1px\s*!important/);
  assert.match(consoleSource, /border-radius:\s*6px\s*!important/);
  assert.match(consoleSource, /#070706/);
  assert.match(consoleSource, /#11110f/);
  assert.match(consoleSource, /#00d2ff/);
  assert.match(consoleSource, /#f2ead9/);
  assert.match(consoleSource, /presentationRouteHref\("\/wtfiam\?category=arcade", presentation\.host\)/);
  assert.match(consoleSource, /presentationRouteHref\("\/login", presentation\.host\)/);
});

test("Arcade and Console keep shared APIs, iframe sandboxing, and external exits raw", () => {
  assert.match(consoleSource, /const surfaceApi = isArcade \? "\/api\/arcade" : "\/api\/console"/);
  assert.match(consoleSource, /api\.get<ConsoleCatalog>\(`\$\{surfaceApi\}\/games`\)/);
  assert.match(consoleSource, /api\.get<ConsoleStats>\(`\$\{surfaceApi\}\/stats`\)/);
  assert.match(consoleSource, /api\.get<ArcadePlayFeeResponse>\("\/api\/arcade\/play-fee"\)/);
  assert.match(consoleSource, /api\.get<ArcadePlayStatus>\("\/api\/arcade\/play-status"\)/);
  assert.match(consoleSource, /api\.get<ConsoleDiscoveryShelves>\(`\$\{surfaceApi\}\/discovery\?limit=8`\)/);
  assert.match(consoleSource, /api\.get<ConsoleChampionsResponse>\(`\$\{surfaceApi\}\/champions\?limit=12`\)/);
  assert.match(consoleSource, /api\.get<ConsoleTopPlayersResponse>\(`\$\{surfaceApi\}\/players\/top\?limit=12`\)/);
  assert.match(consoleSource, /api\.get<ConsoleRecentScoresResponse>\(`\$\{surfaceApi\}\/recent\?limit=10`\)/);
  assert.match(consoleSource, /api\.get<Cartridge\[\]>\("\/api\/console\/demo-cartridges"\)/);
  assert.match(consoleSource, /api\.get<Cartridge\[\]>\("\/api\/console\/cartridges"\)/);
  assert.match(consoleSource, /api\.post\(`\$\{surfaceApi\}\/session`, \{ slug: gameSlug \}\)/);
  assert.match(consoleSource, /api\.post\(`\$\{surfaceApi\}\/games\/\$\{reportTarget\.slug\}\/report`/);
  assert.match(consoleSource, /fetch\(zipUrl\)/);
  assert.match(consoleSource, /handleRuntimeBridgeRequest/);
  assert.match(consoleSource, /path === "\/api\/console\/session"/);
  assert.match(consoleSource, /path === "\/api\/arcade\/scores"/);
  assert.match(consoleSource, /sandbox=\{/);
  assert.match(consoleSource, /allow="fullscreen; gamepad; autoplay"/);
  assert.match(consoleSource, /target="_blank"/);
  assert.match(consoleSource, /rel="noopener noreferrer"/);
  assert.doesNotMatch(consoleSource, /\/api\/gamma/);
});

test("wallet-owned ZIP cartridges use the FileShip-first artifact recovery cache", () => {
  assert.match(consoleSource, /resolveArtifactUri/);
  assert.match(consoleSource, /resolvedArtifact\?\.src/);
  assert.doesNotMatch(consoleSource, /zipUrl = `\/api\/cache\/media\?url=/);
});
