import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commandPaletteSource = readFileSync("client/src/pages/CommandCenter.tsx", "utf8");

test("Command Palette route hub is presentation-host aware", () => {
  assert.match(commandPaletteSource, /usePresentationShell/);
  assert.match(commandPaletteSource, /presentationRouteHref\(command\.path,\s*presentation\.host\)/);
  assert.match(commandPaletteSource, /presentationRouteHref\("\/browser-boundaries",\s*presentation\.host\)/);
  assert.match(commandPaletteSource, /data-command-palette-presentation-host=\{presentation\.host\}/);
  assert.match(commandPaletteSource, /data-command-palette-surface="command-palette"/);
  assert.match(commandPaletteSource, /data-command-palette-region="surface"/);
  assert.match(commandPaletteSource, /data-command-palette-region="status-grid"/);
  assert.match(commandPaletteSource, /data-command-palette-region="search-input"/);
  assert.match(commandPaletteSource, /data-command-palette-region="result-row"/);
  assert.match(commandPaletteSource, /data-command-palette-command-path=\{command\.path\}/);
  assert.match(commandPaletteSource, /data-command-palette-region="open-button"/);
  assert.match(commandPaletteSource, /\[data-command-palette-presentation-host="gamma"\]/);
  assert.match(commandPaletteSource, /background-image:\s*none/);
  assert.match(commandPaletteSource, /box-shadow:\s*none/);
  assert.match(commandPaletteSource, /border-radius:\s*6px/);
});
