import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const utilitySources = [
  {
    name: "Recovery Mode",
    routeAware: true,
    source: readFileSync("client/src/pages/RecoveryMode.tsx", "utf8"),
    surface: "recovery-mode",
  },
  {
    name: "Browser Boundaries",
    routeAware: true,
    source: readFileSync("client/src/pages/BrowserBoundaries.tsx", "utf8"),
    surface: "browser-boundaries",
  },
  {
    name: "Terminal",
    routeAware: true,
    source: readFileSync("client/src/pages/Terminal.tsx", "utf8"),
    surface: "terminal",
  },
  {
    name: "File Manager",
    routeAware: true,
    source: readFileSync("client/src/pages/FileManager.tsx", "utf8"),
    surface: "file-manager",
  },
  {
    name: "Task Manager",
    routeAware: false,
    source: readFileSync("client/src/pages/TaskManager.tsx", "utf8"),
    surface: "task-manager",
  },
  {
    name: "Browser",
    routeAware: false,
    source: readFileSync("client/src/pages/Browser.tsx", "utf8"),
    surface: "browser",
  },
  {
    name: "CLI",
    routeAware: true,
    source: [
      readFileSync("client/src/pages/CliShell.tsx", "utf8"),
      readFileSync("client/src/features/wtfos-cli/WtfOsCliShell.tsx", "utf8"),
      readFileSync("client/src/features/wtfos-cli/WtfOsCliPanel.tsx", "utf8"),
    ].join("\n"),
    surface: "cli",
  },
];

test("desktop utility routes expose Gamma presentation host boundaries", () => {
  for (const utility of utilitySources) {
    assert.match(utility.source, /usePresentationShell/, `${utility.name} must read the active presentation host`);
    assert.match(
      utility.source,
      new RegExp(`data-gamma-utility-surface="${utility.surface}"`),
      `${utility.name} must expose a rendered utility surface marker`
    );
    assert.match(
      utility.source,
      /data-gamma-utility-presentation-host=\{presentation\.host\}/,
      `${utility.name} must expose the active presentation host`
    );
    assert.match(
      utility.source,
      /data-gamma-utility-region="surface"/,
      `${utility.name} must mark the route-owned surface region`
    );
    assert.match(
      utility.source,
      /\[data-gamma-utility-presentation-host="gamma"\]/,
      `${utility.name} must scope Gamma styling by host`
    );
    assert.match(utility.source, /background-image:\s*none/, `${utility.name} must remove classic fill imagery`);
    assert.match(utility.source, /box-shadow:\s*none/, `${utility.name} must remove classic shadow treatment`);
    assert.match(utility.source, /border-radius:\s*6px/, `${utility.name} must stay within Gamma radius limits`);
  }
});

test("desktop utility route handoffs preserve the active presentation shell", () => {
  for (const utility of utilitySources.filter((entry) => entry.routeAware)) {
    assert.match(
      utility.source,
      /presentationRouteHref\([^,\n]+,\s*presentation\.host\)/,
      `${utility.name} must route handoffs through the presentation helper`
    );
  }
});
