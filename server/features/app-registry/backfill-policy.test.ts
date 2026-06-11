import test from "node:test";
import assert from "node:assert/strict";
import { WTF_APP_PACKAGE_ACCEPTANCE } from "@shared/wtf-app-packages";
import { DESKTOP_APPS } from "@shared/types";
import { DEFAULT_DESKTOP_APP_CONFIG } from "@shared/desktop-apps";
import {
  buildRegistrationSeeds,
  isPackageEnabledByDefault,
  lifecycleForSeed,
  seedFromPackage,
} from "./backfill-policy";

test("every current app maps to a registration seed", () => {
  const seeds = buildRegistrationSeeds();
  assert.equal(seeds.length, WTF_APP_PACKAGE_ACCEPTANCE.length);
  assert.equal(new Set(seeds.map((s) => s.appId)).size, seeds.length);
});

test("all desktop apps are present with desktop:<key> ids", () => {
  const seeds = buildRegistrationSeeds();
  for (const appKey of DESKTOP_APPS) {
    const seed = seeds.find((s) => s.appId === `desktop:${appKey}`);
    assert(seed, `${appKey} must have a registration seed`);
    assert.equal(seed?.kind, "desktop-app");
  }
});

test("WTF Domains has its own enableable app registry seed", () => {
  const seed = buildRegistrationSeeds().find((candidate) => candidate.appId === "desktop:wtf-subdomains");
  assert(seed, "WTF Domains must be seedable in the app registry");
  assert.equal(seed?.appKey, "wtf-subdomains");
  assert.equal(seed?.label, "WTF Domains");
  assert.equal(seed?.enabled, true);
  assert.equal(seed?.lifecycleState, "published");
  assert.equal(seed?.domainLabel, "Tezos Platform");
});

test("enabled defaults are preserved from DEFAULT_DESKTOP_APP_CONFIG", () => {
  const seeds = buildRegistrationSeeds();
  for (const appKey of DESKTOP_APPS) {
    const seed = seeds.find((s) => s.appId === `desktop:${appKey}`)!;
    assert.equal(seed.enabled, DEFAULT_DESKTOP_APP_CONFIG[appKey] !== false);
  }
});

test("currently-enabled builtins land in published; off apps in registered", () => {
  const hoard = seedFromPackage(WTF_APP_PACKAGE_ACCEPTANCE.find((e) => e.id === "desktop:hoard")!);
  assert.equal(hoard.enabled, true);
  assert.equal(hoard.lifecycleState, "published");

  const dues = seedFromPackage(WTF_APP_PACKAGE_ACCEPTANCE.find((e) => e.id === "desktop:dues-manager")!);
  assert.equal(dues.enabled, false);
  assert.equal(dues.lifecycleState, "registered");
});

test("blocked integrations land in disabled and stay disabled", () => {
  const shadowbox = WTF_APP_PACKAGE_ACCEPTANCE.find((e) => e.key === "shadowbox");
  assert(shadowbox);
  assert.equal(isPackageEnabledByDefault(shadowbox!), false);
  assert.equal(lifecycleForSeed(shadowbox!, false), "disabled");
});

test("disabled-by-default packages are registered but not enabled", () => {
  const jstz = WTF_APP_PACKAGE_ACCEPTANCE.find((e) => e.key === "jstz");
  assert(jstz);
  const seed = seedFromPackage(jstz!);
  assert.equal(seed.enabled, false);
  assert.equal(seed.lifecycleState, "registered");
});

test("creation tools and integrations keep their namespaced ids and kinds", () => {
  const seeds = buildRegistrationSeeds();
  const particle = seeds.find((s) => s.appId === "creation-tool:particle-painter");
  assert(particle);
  assert.equal(particle?.kind, "creation-tool");
  assert.equal(particle?.enabled, true);
  assert.equal(particle?.lifecycleState, "published");

  const kiln = seeds.find((s) => s.appId === "integration:kiln");
  assert(kiln);
  assert.equal(kiln?.kind, "integration-plugin");
});
