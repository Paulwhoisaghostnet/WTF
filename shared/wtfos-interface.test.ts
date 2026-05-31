import assert from "node:assert/strict";
import test from "node:test";

import {
  artifactKindFromPackageKind,
  buildWtfOsPathwayMap,
  classifyWtfOsPathway,
} from "./wtfos-interface";

test("WTFOS interface helpers classify pathways consistently", () => {
  assert.equal(classifyWtfOsPathway("/api/game-studio/projects"), "api");
  assert.equal(classifyWtfOsPathway("/api/cli/can-open"), "cli");
  assert.equal(classifyWtfOsPathway("open /mission-control"), "cli");
  assert.equal(classifyWtfOsPathway("/admin"), "admin");
  assert.equal(classifyWtfOsPathway("/tools/particle-painter"), "browser");
  assert.equal(classifyWtfOsPathway("server/lib/wtf-mcp.ts"), "build");
  assert.equal(classifyWtfOsPathway("docs/wtfos-mcp-doctrine.md"), "audit");
});

test("WTFOS interface helpers build stable pathway maps", () => {
  const pathways = buildWtfOsPathwayMap([
    "/arcade",
    "/api/arcade/games",
    "server/lib/wtf-mcp.ts",
    "docs/wtfos-sdk.md",
  ]);

  assert.deepEqual(pathways.browser, ["/arcade"]);
  assert.deepEqual(pathways.api, ["/api/arcade/games"]);
  assert.deepEqual(pathways.build, ["server/lib/wtf-mcp.ts"]);
  assert.deepEqual(pathways.audit, ["docs/wtfos-sdk.md"]);
});

test("WTFOS interface maps package kinds to artifact kinds", () => {
  assert.equal(artifactKindFromPackageKind("desktop-app"), "app");
  assert.equal(artifactKindFromPackageKind("creation-tool"), "tool");
  assert.equal(artifactKindFromPackageKind("console-stock-cartridges"), "package");
  assert.equal(artifactKindFromPackageKind("project-bundle"), "project");
  assert.equal(artifactKindFromPackageKind("integration-plugin"), "plugin");
});

