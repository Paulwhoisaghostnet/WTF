import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const passportSource = readFileSync("server/auth/passport.ts", "utf8");
const buildScript = String(packageJson.scripts?.build || "");

test("WTF-BB-050 retired deprecated GitHub and Discord passport adapters", () => {
  for (const section of ["dependencies", "devDependencies"] as const) {
    assert.equal(packageJson[section]?.["passport-github2"], undefined);
    assert.equal(packageJson[section]?.["passport-discord"], undefined);
    assert.equal(packageJson[section]?.["@types/passport-github2"], undefined);
  }

  assert.equal(packageLock.packages?.["node_modules/passport-github2"], undefined);
  assert.equal(packageLock.packages?.["node_modules/passport-discord"], undefined);
  assert.equal(packageLock.packages?.["node_modules/@types/passport-github2"], undefined);
});

test("WTF-BB-050 uses maintained generic OAuth2 strategy for GitHub and Discord", () => {
  assert.equal(packageJson.dependencies?.["passport-oauth2"], "^1.8.0");
  assert.equal(packageJson.devDependencies?.["@types/passport-oauth2"], "^1.8.0");
  assert.match(passportSource, /from "passport-oauth2"/);
  assert.match(passportSource, /createGithubStrategy/);
  assert.match(passportSource, /createDiscordStrategy/);
  assert.doesNotMatch(passportSource, /passport-github2|passport-discord/);
  assert.doesNotMatch(buildScript, /passport-github2|passport-discord/);
});
