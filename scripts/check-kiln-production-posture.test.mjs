import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/check-kiln-production-posture.mjs", "utf8");
const deploy = readFileSync("scripts/server-deploy.sh", "utf8");

test("kiln production posture check only gates mutations, not open Shadownet mode", () => {
  assert.match(source, /open Shadownet builder mode is expected/);
  assert.match(source, /\/api\/kiln\/workflow\/run/);
  assert.doesNotMatch(source, /KILN_ALLOW_PUBLIC_OPEN_MODE/);
  assert.doesNotMatch(source, /Puppet wallet balances must not be public/);
  assert.doesNotMatch(source, /auth\.mode=open[\s\S]*exit\(1\)/);
});

test("server deploy runs kiln posture check before build", () => {
  assert.match(deploy, /check-kiln-production-posture\.mjs/);
  assert.match(deploy, /check-kiln-auth\.mjs/);
});
