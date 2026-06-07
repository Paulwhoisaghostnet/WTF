import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("WTFOS PDS request path provisions a separate repo and writes identity link", () => {
  const route = readFileSync("server/routes/tz2at.ts", "utf8");
  const schema = readFileSync("shared/schema-social.ts", "utf8");

  assert.match(route, /agent\.createAccount\(/);
  assert.match(route, /collection:\s*"app\.wtfos\.identity\.link"/);
  assert.match(route, /repo:\s*account\.data\.did/);
  assert.match(route, /canonicalDid:\s*input\.canonicalDid/);
  assert.match(route, /wtfDid:\s*account\.data\.did/);
  assert.match(route, /encryptOAuthSecret\(session\.accessJwt\)/);
  assert.match(route, /WTFOS_PDS_PROVISIONING_ENABLED/);
  assert.match(schema, /wtfosAtprotoIdentities/);
  assert.match(schema, /encryptedRepoPassword/);
});

test("WTFOS PDS route keeps canonical repo writes allowlisted", () => {
  const route = readFileSync("server/routes/tz2at.ts", "utf8");
  const canonicalRepoWrites = [...route.matchAll(/repo:\s*account\.did/g)];

  assert.equal(canonicalRepoWrites.length, 1);
  assert.match(route, /collection:\s*TZ2AT_WALLET_LINK_COLLECTION/);
});

test("tz2at ecosystem analytics route has a total request budget", () => {
  const route = readFileSync("server/routes/tz2at.ts", "utf8");

  assert.match(route, /DEFAULT_TZ2AT_ECOSYSTEM_ANALYTICS_TIMEOUT_MS/);
  assert.match(route, /withTz2atAnalyticsBudget/);
  assert.match(route, /Tz2atEcosystemAnalyticsTimeoutError/);
  assert.match(route, /res\.status\(504\)/);
});
