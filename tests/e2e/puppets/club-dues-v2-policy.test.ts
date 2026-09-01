import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seedSource = readFileSync(new URL("./seed.ts", import.meta.url), "utf8");
const liveSpecSource = readFileSync(
  new URL("../../playwright/live/puppet-orchestration.spec.mjs", import.meta.url),
  "utf8",
);
const browserHarnessSource = readFileSync(
  new URL("../../playwright/harness.mjs", import.meta.url),
  "utf8",
);

test("Club Dues puppet fixtures seed and refresh the promoted V2 template", () => {
  assert.doesNotMatch(seedSource, /wtf-club-dues-v1/);
  assert.equal(seedSource.match(/wtf-club-dues-v2/g)?.length, 4);
  assert.match(
    seedSource,
    /onConflictDoUpdate\(\{[\s\S]*?templateVersion:\s*"wtf-club-dues-v2"[\s\S]*?compileArtifact:\s*\{[^}]*templateVersion:\s*"wtf-club-dues-v2"/,
    "an existing local puppet row must be upgraded as well as a newly inserted row",
  );
});

test("Club Dues live proof accepts V2 and explicitly rejects retired V1", () => {
  for (const value of ["liveContract.templateVersion", "compile.templateVersion"]) {
    const escaped = value.replaceAll(".", "\\.");
    assert.match(liveSpecSource, new RegExp(`expect\\(${escaped}\\)\\.toBe\\("wtf-club-dues-v2"\\)`));
    assert.match(liveSpecSource, new RegExp(`expect\\(${escaped}\\)\\.not\\.toBe\\("wtf-club-dues-v1"\\)`));
  }
});

test("browser inventory fixtures expose only the current Club Dues template", () => {
  assert.doesNotMatch(browserHarnessSource, /wtf-club-dues-v1/);
  assert.equal(browserHarnessSource.match(/wtf-club-dues-v2/g)?.length, 2);
});
