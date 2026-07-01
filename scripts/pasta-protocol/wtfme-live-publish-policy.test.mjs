import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/pasta-protocol/wtfme-live-publish.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("Pasta WTF.ME live publisher defaults to dry-run and requires an explicit production write gate", () => {
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-publish"],
    "tsx scripts/pasta-protocol/wtfme-live-publish.ts"
  );
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-publish:check"],
    "node --test scripts/pasta-protocol/wtfme-live-publish-policy.test.mjs"
  );
  assert.match(source, /const execute = flag\("PASTA_WTFME_LIVE_PUBLISH", false\)/);
  assert.match(source, /const publishPins = flag\("PASTA_WTFME_LIVE_PUBLISH_PINS", true\)/);
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
    /fail\("Set PASTA_WTFME_LIVE_COOKIE or both PASTA_WTFME_LIVE_USERNAME and PASTA_WTFME_LIVE_PASSWORD"\)/
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
    /fetchWithCookies\("\/api\/wtf-sites\/claim", \{\s*method: "POST",\s*headers,/
  );
  assert.match(
    source,
    /fetchWithCookies\(`\/api\/wtf-sites\/pages\/\$\{encodeURIComponent\(page\.slug\)\}`, \{\s*method: "PUT",\s*headers,/
  );
  assert.match(
    source,
    /fetchWithCookies\("\/api\/wtf-sites\/publish", \{\s*method: "POST",\s*headers,/
  );
  assert.match(
    source,
    /fetchWithCookies\("\/api\/ipfs-pinning\/pasta-protocol\/publish", \{\s*method: "POST",\s*headers,/
  );
  assert.match(source, /await probeTlsAsk\(host\)/);
  assert.match(source, /published host \$\{host\} is still denied by the production TLS gate/);
});

test("Pasta WTF.ME live publisher checks TLS before publishing pin recovery", () => {
  assert.match(source, /dry-run: would publish Pasta pin recovery manifest for \$\{host\}/);
  assert.match(source, /Pasta pin recovery publish did not return a manifestUri and wellKnownUrl/);

  const savePages = source.indexOf("await savePastaPages(headers)");
  const publishSite = source.indexOf("const published = await publish(headers)");
  const probeTls = source.indexOf("await probeTlsAsk(host)");
  const publishPins = source.indexOf("const pinning = publishPins ? await publishPastaPins(headers) : null");
  assert.ok(savePages > -1, "page saves should exist");
  assert.ok(publishSite > savePages, "site publish should happen after page saves");
  assert.ok(probeTls > publishSite, "TLS gate should be probed after site publish");
  assert.ok(publishPins > probeTls, "pin recovery publish should happen only after TLS passes");
});

test("Pasta WTF.ME live publisher explains production host eligibility blockers", () => {
  assert.match(source, /function eligibilitySummary\(state: any\): string/);
  assert.match(source, /claimableHost=\$\{host \|\| "none"\}/);
  assert.match(source, /canClaim=\$\{Boolean\(eligibility\.canClaim\)\}/);
  assert.match(source, /hasWallet=\$\{Boolean\(eligibility\.hasWallet\)\}/);
  assert.match(source, /hasOAuthSocial=\$\{Boolean\(eligibility\.hasOAuthSocial\)\}/);
  assert.match(source, /hasLinkedBluesky=\$\{Boolean\(eligibility\.hasLinkedBluesky\)\}/);
  assert.match(source, /hasActiveWtfDid=\$\{Boolean\(eligibility\.hasActiveWtfDid\)\}/);
  assert.match(source, /canIssueWtfDid=\$\{Boolean\(eligibility\.canIssueWtfDid\)\}/);
  assert.match(source, /reasons=\$\{reasons\.join\("; "\)\}/);
  assert.match(
    source,
    /authenticated user is not eligible to claim a WTF\.ME host: \$\{eligibilitySummary\(state\)\}/
  );
  assert.match(
    source,
    /authenticated user did not expose a WTF\.ME host or claimable host: \$\{eligibilitySummary\(state\)\}/
  );
});
