import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("server/routes/collection-factory.ts", "utf8");
const bootBackfill = readFileSync("server/lib/gameshow-boot-backfill.ts", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const deploy = readFileSync("scripts/server-deploy.sh", "utf8");
const kilnAuthCheck = readFileSync("scripts/check-kiln-auth.mjs", "utf8");
const envExample = readFileSync(".env.example", "utf8");

test("collection factory uses Docker-safe Kiln defaults and token aliases", () => {
  assert.match(route, /process\.env\.NODE_ENV === "production"[\s\S]*host\.docker\.internal:3001/);
  assert.match(route, /process\.env\.KILN_API_TOKEN\?\.trim\(\)/);
  assert.match(route, /process\.env\.WTF_KILN_API_TOKEN\?\.trim\(\)/);
  assert.match(route, /process\.env\.API_AUTH_TOKEN\?\.trim\(\)/);
  assert.match(route, /process\.env\.KILN_TIMEOUT_MS/);
  assert.match(route, /process\.env\.WTF_KILN_TIMEOUT_MS/);
  assert.match(route, /AbortController/);
  assert.match(route, /controller\.abort\(\)/);
});

test("collection factory loads only app-vendored contract template paths", () => {
  for (const sourcePath of [
    "contracts/wtf-collections/WtfAllowlistFA2.py",
    "contracts/wtf-collections/WtfOpenEditionFA2.py",
    "contracts/wtf-collections/WtfBondingCurveFA2.py",
    "contracts/wtf-collections/WtfBlindMintFA2.py",
    "contracts/wtf-buyback/WtfBuybackV1.py",
  ]) {
    assert.match(bootBackfill, new RegExp(sourcePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(bootBackfill, /building\/shadownet kiln/);
  assert.doesNotMatch(bootBackfill, /\.\.\/\.\.\//);
  assert.match(dockerfile, /COPY --from=builder \/app\/contracts \.\/contracts/);
});

test("deployment preflights protected Kiln mutation auth before app restart", () => {
  assert.match(envExample, /KILN_PUBLIC_URL=https:\/\/kiln\.wtfgameshow\.app/);
  assert.match(envExample, /KILN_API_TOKEN=/);
  assert.match(deploy, /node scripts\/check-kiln-auth\.mjs[\s\S]*docker compose build/);
  assert.match(kilnAuthCheck, /\/api\/kiln\/workflow\/run/);
  assert.doesNotMatch(kilnAuthCheck, /x-kiln-token/i);
  assert.match(kilnAuthCheck, /response\.status === 401 \|\| response\.status === 403/);
});
