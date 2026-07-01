import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/wtfme-live-check.ts", "utf8");
const publishSource = readFileSync("scripts/pasta-protocol/wtfme-live-publish.ts", "utf8");

test("Pasta WTF.ME live check requires the post-publish host explicitly", () => {
  assert.equal(packageJson.scripts["pasta:wtfme:live-check"], "tsx scripts/pasta-protocol/wtfme-live-check.ts");
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-check:check"],
    "node --test scripts/pasta-protocol/wtfme-live-check-policy.test.mjs"
  );
  assert.match(source, /process\.env\.PASTA_WTFME_LIVE_HOST/);
  assert.match(source, /Set PASTA_WTFME_LIVE_HOST to the published Pasta WTF\.ME host/);
  assert.doesNotMatch(source, /const DEFAULT_HOST/);
  assert.doesNotMatch(source, /wtf-admin\.wtfos\.me/);
  assert.match(publishSource, /PASTA_WTFME_LIVE_HOST=\$\{published\.site\.host\} npm run pasta:wtfme:live-check/);
});
