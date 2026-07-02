import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/standalone-installer-release-audit.mjs", "utf8");

test("standalone installer release audit is wired as package commands", () => {
  assert.equal(
    packageJson.scripts["pasta:standalone-installers:audit"],
    "node scripts/pasta-protocol/standalone-installer-release-audit.mjs"
  );
  assert.equal(
    packageJson.scripts["pasta:standalone-installers:audit:check"],
    "node --test scripts/pasta-protocol/standalone-installer-release-audit-policy.test.mjs"
  );
});

test("standalone installer release audit covers every remaining static Pasta desktop app", () => {
  for (const app of ["gnocchi", "ravioli", "rotini", "penne", "lasagna"]) {
    assert.match(source, new RegExp(`key: "${app}"`));
    assert.match(source, new RegExp(`${app}-desktop-v1\\.0\\.0`));
    assert.match(source, new RegExp(`/api/\\$\\{app\\.key\\}/installers`));
  }
  assert.match(source, /\$\{app\.key\}:desktop:check/);
  assert.match(source, /\$\{app\.key\}:installers:live-check/);
});

test("standalone installer release audit proves local source wiring before remote publication", () => {
  assert.match(source, /apps\/\$\{app\.key\}-desktop\/package\.json/);
  assert.match(source, /\.github\/workflows\/\$\{app\.key\}-desktop-installers\.yml/);
  assert.match(source, /server\/routes\/\$\{app\.key\}-installers\.ts/);
  assert.match(source, /scripts\/check-\$\{app\.key\}-installers-live\.mjs/);
  assert.match(source, /scripts\/\$\{app\.key\}-desktop-package-policy\.test\.mjs/);
  assert.match(source, /server\/routes\.ts/);
  assert.match(source, /route registration/);
  assert.match(source, /runSourcePolicy/);
});

test("standalone installer release audit checks remote workflow and release digests without publishing", () => {
  assert.match(source, /ghApiJson\(`repos\/\$\{repository\}\/actions\/workflows`\)/);
  assert.match(source, /item\.path === workflowPath/);
  assert.match(source, /ghJson\(\["release", "view", app\.releaseTag, "--json", "tagName,isDraft,isPrerelease,assets,url"\]\)/);
  assert.match(source, /sha256FromDigest/);
  assert.match(source, /is missing a sha256 digest/);
  assert.match(source, /PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_REMOTE/);
  assert.doesNotMatch(source, /ghJson\(\["workflow", "run"/);
  assert.doesNotMatch(source, /ghJson\(\["release", "create"/);
});

test("standalone installer release audit checks deployed protected manifest routes", () => {
  assert.match(source, /PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_LIVE/);
  assert.match(source, /response\.status === 401/);
  assert.match(source, /is deployed and auth-protected/);
  assert.match(source, /returned HTTP \$\{response\.status\}; deploy route and env before live verification/);
});

test("standalone installer release audit prints exact next release commands", () => {
  assert.match(source, /function printNextSteps\(\)/);
  assert.match(source, /promote the installer workflow\/route commits to main before release dispatch/);
  assert.match(source, /gh workflow run \$\{app\.key\}-desktop-installers\.yml/);
  assert.match(source, /-f publish_release=true -f release_tag=\$\{app\.releaseTag\}/);
  assert.match(source, /\*_INSTALLER_\* production env values/);
  assert.match(source, /redeploy\/recreate the app container/);
  assert.match(source, /PASTA_STANDALONE_INSTALLER_AUDIT_ALLOW_BLOCKERS/);
});
