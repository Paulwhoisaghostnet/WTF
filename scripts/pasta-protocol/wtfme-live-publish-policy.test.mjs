import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/pasta-protocol/wtfme-live-publish.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("Pasta WTF.ME live publisher defaults to dry-run and requires an explicit production write gate", () => {
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-publish"],
    "tsx scripts/pasta-protocol/wtfme-live-publish.ts",
  );
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-publish:check"],
    "node --test scripts/pasta-protocol/wtfme-live-publish-policy.test.mjs",
  );
  assert.match(source, /const execute = flag\("PASTA_WTFME_LIVE_PUBLISH", false\)/);
  assert.match(source, /set PASTA_WTFME_LIVE_PUBLISH=1 to claim\/save\/publish pages/);
  assert.match(source, /if \(!execute\) \{\s*ok\(`dry-run: would publish Pasta landing\/mint\/collection pages to \$\{host\}`\);[\s\S]*?return;\s*\}/);

  const dryRunReturn = source.indexOf("dry-run: would publish Pasta landing/mint/collection pages");
  const firstSave = source.indexOf("await savePastaPages(headers)");
  const firstPublish = source.indexOf("await publish(headers)");
  assert.ok(dryRunReturn > -1, "dry-run return should be present before writes");
  assert.ok(firstSave > dryRunReturn, "page saves must happen only after the dry-run return path");
  assert.ok(firstPublish > dryRunReturn, "publish must happen only after the dry-run return path");
});

test("Pasta WTF.ME live publisher scopes credentials and host before writing", () => {
  assert.match(source, /PASTA_WTFME_LIVE_COOKIE/);
  assert.match(source, /PASTA_WTFME_LIVE_USERNAME/);
  assert.match(source, /PASTA_WTFME_LIVE_PASSWORD/);
  assert.match(source, /PASTA_WTFME_LIVE_EXPECT_HOST/);
  assert.match(
    source,
    /fail\("Set PASTA_WTFME_LIVE_COOKIE or both PASTA_WTFME_LIVE_USERNAME and PASTA_WTFME_LIVE_PASSWORD"\)/,
  );
  assert.match(source, /assertExpectedHost\(String\(plannedHost\)\.toLowerCase\(\)\)/);
  assert.match(source, /assertExpectedHost\(host\)/);
  assert.doesNotMatch(source, /E2E_PUPPET|LIVE_PUPPET|MACARONI_.*PASSWORD|PASTA_SUITE_.*PASSWORD/);
});

test("Pasta WTF.ME live publisher uses CSRF for every mutating API call and verifies TLS after publish", () => {
  assert.match(source, /"x-csrf-token": String\(payload\.csrfToken\)/);
  assert.match(source, /state = await claimIfNeeded\(state, execute \? await csrfHeaders\(\) : \{\}\)/);
  assert.match(
    source,
    /fetchWithCookies\("\/api\/wtf-sites\/claim", \{\s*method: "POST",\s*headers,/,
  );
  assert.match(
    source,
    /fetchWithCookies\(`\/api\/wtf-sites\/pages\/\$\{encodeURIComponent\(page\.slug\)\}`, \{\s*method: "PUT",\s*headers,/,
  );
  assert.match(
    source,
    /fetchWithCookies\("\/api\/wtf-sites\/publish", \{\s*method: "POST",\s*headers,/,
  );
  assert.match(source, /await probeTlsAsk\(host\)/);
  assert.match(source, /published host \$\{host\} is still denied by the production TLS gate/);
});
