import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const gammaSource = readFileSync("client/src/pages/GammaWtfos.tsx", "utf8");
const presentationShellSource = readFileSync("client/src/lib/presentation-shell.tsx", "utf8");
const react95PresentationSource = readFileSync("client/src/lib/react95-presentation.tsx", "utf8");
const viteSource = readFileSync("vite.config.ts", "utf8");

test("App routes production Gamma hostnames through the Gamma shell", () => {
  assert.match(appSource, /function isGammaHost\(\): boolean/);
  assert.match(appSource, /window\.location\.hostname === "gamma\.wtfos\.app"/);
  assert.match(appSource, /if \(isGammaHost\(\)\) return true/);
  assert.match(appSource, /const gammaShellMatch = isGammaShellLocation\(location\) \? matchPage\("\/gamma"\) : null/);
  assert.match(appSource, /if \(gammaShellMatch\) \{\s*return <FullscreenRouteRenderer match=\{gammaShellMatch\} \/>;\s*\}/);
});

test("Gamma navigation separates production hostname routes from local harness-prefixed routes", () => {
  assert.match(gammaSource, /function gammaNavigationTarget\(route: string, currentLocation: string\): string/);
  assert.match(gammaSource, /if \(isGammaHost\(\)\) return routeLocation/);
  assert.match(gammaSource, /if \(!isGammaHarnessLocation\(currentLocation\)\) return routeLocation/);
  assert.match(gammaSource, /return `\/gamma\$\{routeLocation\}`/);
  assert.match(gammaSource, /function gammaRouteFromLocation\(location: string\): string/);
  assert.match(gammaSource, /parts\.pathname\.slice\("\/gamma"\.length\)/);
});

test("Gamma interface switching preserves the selected route while allowing explicit exits", () => {
  assert.match(gammaSource, /function interfaceHref\(host: "classic" \| "beta" \| "gamma", routeLocation: string\): string/);
  assert.match(gammaSource, /https:\/\/wtfos\.app/);
  assert.match(gammaSource, /https:\/\/beta\.wtfos\.app/);
  assert.match(gammaSource, /https:\/\/gamma\.wtfos\.app/);
  assert.match(gammaSource, /data-gamma-ux-switcher/);
  assert.match(gammaSource, /data-gamma-interface-switch="true"/);
  assert.match(gammaSource, /if \(anchor\.closest\("\[data-gamma-interface-switch='true'\]"\)\) return null/);
});

test("Gamma intercepts only shared route navigation and keeps APIs external", () => {
  assert.match(gammaSource, /function routeFromInterceptableLink\(anchor: HTMLAnchorElement\): string \| null/);
  assert.match(gammaSource, /\["wtfos\.app", "beta\.wtfos\.app", "gamma\.wtfos\.app"\]\.includes\(url\.hostname\)/);
  assert.match(gammaSource, /if \(routePath\.startsWith\("\/api\/"\)\) return null/);
  assert.match(gammaSource, /return matchPage\(normalizedRoute\) \? normalizedRoute : null/);
  assert.doesNotMatch(gammaSource, /\/api\/gamma/i);
  assert.doesNotMatch(presentationShellSource, /\/api\/gamma/i);
});

test("Gamma route content is hosted by the presentation provider, not the Classic desktop", () => {
  assert.match(gammaSource, /<PresentationShellProvider host="gamma">/);
  assert.match(gammaSource, /<GammaApplicationContent data-gamma-application-content>/);
  assert.match(gammaSource, /<WindowManagerProvider navigate=\{onLaunch\} currentLocation=\{routeLocation\}>/);
  assert.match(gammaSource, /data-gamma-wtfos/);
  assert.doesNotMatch(gammaSource, /<Desktop\b/);
  assert.doesNotMatch(gammaSource, /data-wtf-desktop/);
});

test("React95 imports resolve through the presentation adapter for Gamma", () => {
  assert.match(viteSource, /find:\s*\/\^react95\$\/,/);
  assert.match(viteSource, /client\/src\/lib\/react95-presentation\.tsx/);
  assert.match(react95PresentationSource, /import \* as React95 from "react95\/dist\/index\.mjs"/);
  assert.match(react95PresentationSource, /return usePresentationShell\(\)\.host === "gamma"/);
  assert.match(react95PresentationSource, /if \(!isGamma\(\)\) return <Original\.Button/);
  assert.match(react95PresentationSource, /if \(!isGamma\(\)\) return <Original\.Window/);
  assert.match(react95PresentationSource, /data-gamma-ui="button"/);
  assert.match(react95PresentationSource, /data-gamma-ui="window"/);
  assert.match(react95PresentationSource, /data-gamma-ui="table"/);
  assert.match(react95PresentationSource, /data-gamma-ui="tabs"/);
});
