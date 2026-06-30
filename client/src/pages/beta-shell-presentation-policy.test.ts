import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const betaSource = readFileSync("client/src/pages/BetaWtfos.tsx", "utf8");
const presentationShellSource = readFileSync("client/src/lib/presentation-shell.tsx", "utf8");
const react95PresentationSource = readFileSync("client/src/lib/react95-presentation.tsx", "utf8");

function readSourceTree(dir: string): string {
  let source = "";
  for (const entry of readdirSync(dir)) {
    const file = `${dir}/${entry}`;
    const stat = statSync(file);
    if (stat.isDirectory()) {
      source += readSourceTree(file);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      source += `\n${readFileSync(file, "utf8")}`;
    }
  }
  return source;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("App routes production Beta hostnames through the Beta shell", () => {
  assert.match(appSource, /function isBetaShellLocation\(location: string\): boolean/);
  assert.match(appSource, /window\.location\.hostname === "beta\.wtfos\.app"/);
  assert.match(appSource, /if \(isBetaHost\(\)\) return true/);
  assert.match(appSource, /const betaShellMatch = isBetaShellLocation\(location\) \? matchPage\("\/beta"\) : null/);
  assert.match(appSource, /if \(betaShellMatch\) \{\s*return <FullscreenRouteRenderer match=\{betaShellMatch\} \/>;\s*\}/);
});

test("Beta navigation separates production hostname routes from local harness-prefixed routes", () => {
  assert.match(betaSource, /function betaNavigationTarget\(route: string, currentLocation: string\): string/);
  assert.match(betaSource, /if \(isBetaHost\(\)\) return routeLocation/);
  assert.match(betaSource, /if \(!isBetaHarnessLocation\(currentLocation\)\) return routeLocation/);
  assert.match(betaSource, /return `\/beta\$\{routeLocation\}`/);
  assert.match(betaSource, /function betaRouteFromLocation\(location: string\): string/);
  assert.match(betaSource, /parts\.pathname\.slice\("\/beta"\.length\)/);
});

test("Beta interface switching preserves the selected route while allowing explicit exits", () => {
  assert.match(betaSource, /function betaInterfaceHref\(host: "classic" \| "beta" \| "gamma", routeLocation: string\): string/);
  assert.match(betaSource, /https:\/\/wtfos\.app/);
  assert.match(betaSource, /https:\/\/beta\.wtfos\.app/);
  assert.match(betaSource, /https:\/\/gamma\.wtfos\.app/);
  assert.match(betaSource, /data-beta-ux-switcher/);
  assert.match(betaSource, /data-beta-interface-switch="true"/);
  assert.match(betaSource, /if \(anchor\.closest\("\[data-beta-interface-switch='true'\]"\)\) return null/);
});

test("Beta route content is hosted by the presentation provider, not the Classic desktop", () => {
  assert.match(betaSource, /<PresentationShellProvider host="beta">/);
  assert.match(betaSource, /<BetaApplicationContent data-beta-application-content>/);
  assert.match(betaSource, /<WindowManagerProvider navigate=\{onLaunch\} currentLocation=\{routeLocation\}>/);
  assert.match(betaSource, /data-beta-workspace/);
  assert.doesNotMatch(betaSource, /<Desktop\b/);
  assert.doesNotMatch(betaSource, /data-wtf-desktop/);
});

test("presentationRouteHref is Beta-aware without adding Beta APIs", () => {
  assert.match(presentationShellSource, /host === "beta" \|\| host === "gamma"/);
  assert.match(presentationShellSource, /window\.location\.hostname === "beta\.wtfos\.app"/);
  assert.match(presentationShellSource, /return localPresentationHref\(url, presentationHost\)/);
  assert.doesNotMatch(presentationShellSource, /\/api\/beta/i);
});

test("Beta shares the presentation adapter for React95 controls", () => {
  assert.match(react95PresentationSource, /function isPresentationShell\(\)/);
  assert.match(react95PresentationSource, /presentation\.host === "beta" \|\| presentation\.host === "gamma"/);
  assert.match(react95PresentationSource, /stored === "beta" \|\| stored === "gamma"/);
  assert.match(react95PresentationSource, /if \(!isPresentationShell\(\)\) return <Original\.Button/);
  assert.match(react95PresentationSource, /if \(!isPresentationShell\(\)\) return <Original\.Window/);
  assert.match(react95PresentationSource, /--presentation-accent/);
  assert.match(react95PresentationSource, /--presentation-progress/);
  assert.match(betaSource, /--presentation-progress: var\(--amber\)/);
});

test("Beta owns route app chrome through host-marked presentation surfaces", () => {
  assert.match(betaSource, /const betaPresentationHostSelector = `:is\(/);
  const sourceMarkers = [
    ...new Set(readSourceTree("client/src").match(/data-[a-z0-9-]+-presentation-host/g) ?? []),
  ].sort();
  assert.ok(sourceMarkers.length > 40, "expected route-owner presentation host markers");
  for (const marker of sourceMarkers) {
    assert.match(betaSource, new RegExp(`\\[${escapeRegExp(marker)}="beta"\\]`));
  }
  assert.match(betaSource, /const betaPresentationClusterSelector = `:where\(/);
  assert.match(betaSource, /background-image: none !important/);
  assert.match(betaSource, /box-shadow: none !important/);
  assert.match(betaSource, /border-width: 1px !important/);
  assert.match(betaSource, /color: var\(--presentation-progress, var\(--amber\)\) !important/);
  assert.match(betaSource, /--presentation-current: var\(--rose\)/);
  assert.match(betaSource, /--presentation-radius: 8px/);
});
