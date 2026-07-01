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
  assert.match(source, /const verifyAfterPublish = flag\("PASTA_WTFME_LIVE_VERIFY_AFTER_PUBLISH", true\)/);
  assert.match(source, /const overwriteExisting = flag\("PASTA_WTFME_LIVE_OVERWRITE_EXISTING", false\)/);
  assert.match(source, /set PASTA_WTFME_LIVE_PUBLISH=1 to claim\/save\/publish pages/);
  assert.match(source, /if \(!execute\) \{\s*ok\(`dry-run: would publish Pasta landing\/mint\/collection pages to \$\{host\}`\);[\s\S]*?return;\s*\}/);

  const safetyCheck = source.indexOf("assertSafeExistingContent(state)");
  const dryRunReturn = source.indexOf("dry-run: would publish Pasta landing/mint/collection pages");
  const firstSave = source.indexOf("await savePastaPages(headers)");
  const firstPublish = source.indexOf("await publish(headers)");
  assert.ok(safetyCheck > -1, "existing-content safety check should be present");
  assert.ok(safetyCheck < dryRunReturn, "existing-content safety check should run before dry-run success");
  assert.ok(dryRunReturn > -1, "dry-run return should be present before writes");
  assert.ok(firstSave > dryRunReturn, "page saves must happen only after the dry-run return path");
  assert.ok(firstPublish > dryRunReturn, "publish must happen only after the dry-run return path");
});

test("Pasta WTF.ME live publisher scopes credentials and host before writing", () => {
  assert.match(source, /PASTA_WTFME_LIVE_COOKIE/);
  assert.match(source, /PASTA_WTFME_LIVE_USERNAME/);
  assert.match(source, /PASTA_WTFME_LIVE_PASSWORD/);
  assert.match(source, /PASTA_WTFME_LIVE_EXPECT_HOST/);
  assert.match(source, /function assertProductionHostPinned\(\): void/);
  assert.match(
    source,
    /Set PASTA_WTFME_LIVE_EXPECT_HOST=<dedicated-host\.wtfos\.me> before enabling PASTA_WTFME_LIVE_PUBLISH=1/
  );
  assert.match(
    source,
    /fail\("Set PASTA_WTFME_LIVE_COOKIE or both PASTA_WTFME_LIVE_USERNAME and PASTA_WTFME_LIVE_PASSWORD"\)/
  );
  assert.match(source, /assertExpectedHost\(String\(plannedHost\)\.toLowerCase\(\)\)/);
  assert.match(source, /assertExpectedHost\(host\)/);
  assert.doesNotMatch(source, /E2E_PUPPET|LIVE_PUPPET|MACARONI_.*PASSWORD|PASTA_SUITE_.*PASSWORD/);

  const hostPin = source.indexOf("assertProductionHostPinned()");
  const login = source.indexOf("await login()");
  const firstSave = source.indexOf("await savePastaPages(headers)");
  assert.ok(hostPin > -1, "production publish host pinning should be present");
  assert.ok(login > hostPin, "production host pinning should run before credential validation");
  assert.ok(firstSave > hostPin, "production host pinning should run before any page write");
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

test("Pasta WTF.ME live publisher verifies the public host after production publish", () => {
  assert.match(source, /function verifyPublishedHost\(host: string\): void/);
  assert.match(source, /spawnSync\("npm", \["run", "pasta:wtfme:live-check"\]/);
  assert.match(source, /PASTA_WTFME_LIVE_HOST: host/);
  assert.match(source, /PASTA_WTFME_LIVE_CHECK_PINS: "0"/);
  assert.match(source, /public post-publish verifier failed for \$\{host\}/);
  assert.match(source, /public post-publish verifier passed for \$\{host\}/);
  assert.match(source, /dry-run: would verify public Pasta host \$\{host\}/);

  const publishPins = source.indexOf("const pinning = publishPins ? await publishPastaPins(headers) : null");
  const publishedHost = source.indexOf("const publishedHost = String(published.site?.host || host).toLowerCase()");
  const verifyHost = source.indexOf("verifyPublishedHost(publishedHost)");
  const finalCommand = source.indexOf("verify with: PASTA_WTFME_LIVE_HOST=${publishedHost}");
  assert.ok(publishPins > -1, "pin recovery publish should exist");
  assert.ok(publishedHost > publishPins, "published host should be resolved after pin recovery publish");
  assert.ok(verifyHost > publishedHost, "public host verifier should run after final host resolution");
  assert.ok(finalCommand > verifyHost, "final manual verification command should print only after verifier runs");
});

test("Pasta WTF.ME live publisher refuses accidental existing-site overwrites", () => {
  assert.match(source, /function assertSafeExistingContent\(state: any\): void/);
  assert.match(source, /DEFAULT_HOME_HTML/);
  assert.match(source, /pastaPageMarkers\(\)/);
  assert.match(source, /Refusing to publish Pasta pages over \$\{site\.host\}: existing non-target WTF\.ME page\(s\)/);
  assert.match(source, /would remain published; use a dedicated proof host or remove them first/);
  assert.match(source, /Refusing to overwrite existing non-Pasta WTF\.ME page\(s\)/);
  assert.match(source, /set PASTA_WTFME_LIVE_OVERWRITE_EXISTING=1 only for a dedicated Pasta proof host/);
  assert.match(source, /explicit overwrite enabled for existing WTF\.ME page\(s\)/);

  const claim = source.indexOf("state = await claimIfNeeded");
  const safetyCheck = source.indexOf("assertSafeExistingContent(state)");
  const savePages = source.indexOf("await savePastaPages(headers)");
  assert.ok(claim > -1, "claim or claim dry-run should exist");
  assert.ok(safetyCheck > claim, "existing-content safety check should run after host state is known");
  assert.ok(savePages > safetyCheck, "page saves must happen only after existing-content safety check");
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
