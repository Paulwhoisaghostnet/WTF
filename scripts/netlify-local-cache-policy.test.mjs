import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const helper = readFileSync("scripts/netlify-status-local-cache.mjs", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");

test("Netlify rollback status uses a repo-local npm cache and pinned CLI", () => {
  assert.equal(
    packageJson.scripts["deploy:netlify:status"],
    "node scripts/netlify-status-local-cache.mjs"
  );
  assert.match(helper, /const cacheDir = path\.join\(repoRoot, "\.npm-cache", "netlify-status"\)/);
  assert.match(helper, /v22\.22\.0\/bin\/npm/);
  assert.match(helper, /npm_config_cache: cacheDir/);
  assert.match(helper, /PATH:[\s\S]*npmBinDir/);
  assert.match(helper, /netlify-cli@\$\{cliVersion\}/);
  assert.match(helper, /const cliVersion = "17\.38\.1"/);
  assert.match(helper, /"netlify",\s*"status"/);
  assert.match(gitignore, /^\.npm-cache\/$/m);
});
