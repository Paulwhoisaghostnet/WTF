import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_DEFS } from "../client/src/routes/page-defs";
import { WTF_DWELLING_KEYS } from "./wtf-dwellings";
import {
  WTF_PROJECT_BUNDLE_SECTION_KEYS,
  WTF_PROJECT_BUNDLE_SECTIONS,
  buildWtfProjectBundleManifest,
  getWtfProjectBundleSection,
} from "./wtf-project-bundles";

test("WTF project bundle manifest covers every Law-required section exactly once", () => {
  const manifest = buildWtfProjectBundleManifest();

  assert.equal(manifest.version, 1);
  assert.equal(manifest.rootDwelling, "projects");
  assert.equal(manifest.rootPath, "WTF/Projects");
  assert.deepEqual(
    manifest.sections.map((section) => section.key),
    WTF_PROJECT_BUNDLE_SECTION_KEYS
  );
  assert.ok(getWtfProjectBundleSection("boardStory"));
  assert.ok(getWtfProjectBundleSection("logs"));
  assert.equal(new Set(manifest.sections.map((section) => section.key)).size, manifest.sections.length);
});

test("every WTF project bundle section has a real route, dwelling, artifacts, and event output", () => {
  const routes = new Set(PAGE_DEFS.map((page) => page.pattern));
  const dwellings = new Set(WTF_DWELLING_KEYS);

  for (const section of WTF_PROJECT_BUNDLE_SECTIONS) {
    assert(routes.has(section.route), `${section.key} route ${section.route} is not registered`);
    assert(dwellings.has(section.dwelling), `${section.key} dwelling ${section.dwelling} is not registered`);
    assert(section.owner.length > 0, `${section.key} needs an owner`);
    assert(section.purpose.length > 40, `${section.key} needs a useful purpose`);
    assert(section.requiredArtifacts.length >= 3, `${section.key} needs bundle artifacts`);
    assert(section.eventHandles.length > 0, `${section.key} needs event handles`);
    assert.equal(getWtfProjectBundleSection(section.key).label, section.label);
  }
});
