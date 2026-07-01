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
  assert.match(publishSource, /PASTA_WTFME_LIVE_HOST=\$\{publishedHost\} npm run pasta:wtfme:live-check/);
});

test("Pasta WTF.ME live check resolves the public pin manifest record", () => {
  assert.match(source, /PASTA_WTFME_LIVE_CHECK_PIN_RECORDS/);
  assert.match(source, /function parseAtUri\(uri: string\): AtUriParts/);
  assert.match(source, /function didWebDocumentUrl\(did: string\): URL/);
  assert.match(source, /https:\/\/plc\.directory\//);
  assert.match(source, /AtprotoPersonalDataServer/);
  assert.match(source, /\/xrpc\/com\.atproto\.repo\.getRecord/);
  assert.match(source, /app\.wtfos\.media\.pinManifest/);
  assert.match(source, /value\?\.scopeType, "project_bundle"/);
  assert.match(source, /value\?\.sourceChain, "tezos-shadownet"/);
  assert.match(source, /value\?\.storageRef\?\.checksumSha256/);
  assert.match(source, /pin manifest should bind to the checked WTF\.ME host/);
});
