import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/live-readiness-gate.mjs", "utf8");

test("Pasta live-readiness gate is wired as an explicit package command", () => {
  assert.equal(packageJson.scripts["pasta:live-readiness"], "node scripts/pasta-protocol/live-readiness-gate.mjs");
  assert.equal(
    packageJson.scripts["pasta:live-readiness:check"],
    "node --test scripts/pasta-protocol/live-readiness-gate-policy.test.mjs"
  );
});

test("Pasta live-readiness gate separates blockers from allowed audit mode", () => {
  assert.match(source, /PASTA_LIVE_READINESS_ALLOW_BLOCKERS/);
  assert.match(source, /const blockers = \[\]/);
  assert.match(source, /if \(!ok && !allowBlockers\) process\.exit\(1\)/);
  assert.match(source, /set PASTA_WTFME_LIVE_HOST to the post-publish Pasta WTF\.ME host/);
});

test("Pasta live-readiness gate proves live health and static Pasta bundle markers", () => {
  assert.match(source, /\/api\/health/);
  assert.match(source, /health\.version\?\.nodeEnv !== "production"/);
  assert.match(source, /\/creation-tools\/\$\{app\}\/vendor\/tezos\.js/);
  assert.match(source, /24\.3\.0/);
  assert.match(source, /rpc\.shadownet\.teztnets\.com/);
  assert.match(source, /25\.0\.0/);
  assert.match(source, /\/creation-tools\/\$\{app\}\/js\/common\.js/);
  assert.match(source, /window\.MD/);
  assert.match(source, /consumeCheaseHandoff/);
  assert.match(source, /loadPlatformCapabilities/);
});

test("Pasta live-readiness gate verifies public installer download surfaces", () => {
  assert.match(source, /PASTA_LIVE_READINESS_CHECK_INSTALLERS/);
  assert.match(source, /macaroni:installers:live-check/);
  assert.match(source, /pasta-suite:installers:live-check/);
  assert.match(source, /spaghetti:installers:live-check/);
  assert.match(source, /WTFOS_INSTALLER_REQUIRE_AUTH: "0"/);
  assert.match(source, /PASTA_SUITE_INSTALLER_REQUIRE_AUTH: "0"/);
  assert.match(source, /SPAGHETTI_INSTALLER_REQUIRE_AUTH: "0"/);
  assert.match(source, /protected manifest and public release assets verified/);
});

test("Pasta live-readiness gate delegates hosted-page proof to the live WTF.ME checker", () => {
  assert.match(source, /PASTA_WTFME_LIVE_HOST/);
  assert.match(source, /spawnSync\("npm", \["run", "pasta:wtfme:live-check"\]/);
  assert.doesNotMatch(source, /PASTA_WTFME_LIVE_PUBLISH:\s*"1"/);
  assert.doesNotMatch(source, /PASTA_WTFME_LIVE_PASSWORD.*console\.log/);
});

test("Pasta live-readiness gate validates supplied WTF.ME credentials with a non-writing publisher dry-run", () => {
  assert.match(source, /function checkWtfmePublishDryRun\(\)/);
  assert.match(source, /spawnSync\("npm", \["run", "pasta:wtfme:live-publish"\]/);
  assert.match(source, /PASTA_WTFME_LIVE_PUBLISH: "0"/);
  assert.match(source, /PASTA_WTFME_LIVE_VERIFY_AFTER_PUBLISH: "0"/);
  assert.match(source, /env\.PASTA_WTFME_LIVE_EXPECT_HOST = host/);
  assert.match(source, /WTF\.ME publish dry-run/);
  assert.match(source, /credentials authenticate and resolve/);
  assert.match(source, /authenticated user resolves/);
  assert.match(source, /Refusing to/);
});

test("Pasta live-readiness gate prints non-secret WTF.ME unblock instructions", () => {
  assert.match(source, /function printBlockerRemediation\(\)/);
  assert.match(source, /dedicated Pasta WTF\.ME account/);
  assert.match(source, /claimed\/publishable \.wtfos\.me host/);
  assert.match(source, /active WTFOS DID\/repo/);
  assert.match(source, /linked Tezos wallet/);
  assert.match(source, /WTF Pin Collector permission/);
  assert.match(source, /PASTA_WTFME_LIVE_EXPECT_HOST=<published-host>/);
  assert.match(source, /PASTA_WTFME_LIVE_PUBLISH=1/);
  assert.match(source, /pin discovery enabled/);
  assert.doesNotMatch(source, /PASTA_WTFME_LIVE_PASSWORD[^\\n]+console\.log/);
});
