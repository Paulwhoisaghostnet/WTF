import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/pasta-protocol/wtfme-live-inventory.ts", "utf8");
const pinningServiceSource = readFileSync("server/features/ipfs-pinning/service.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("Pasta WTF.ME live inventory has package hooks and scoped credentials", () => {
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-inventory"],
    "tsx scripts/pasta-protocol/wtfme-live-inventory.ts"
  );
  assert.equal(
    packageJson.scripts["pasta:wtfme:live-inventory:check"],
    "node --test scripts/pasta-protocol/wtfme-live-inventory-policy.test.mjs"
  );
  assert.match(source, /PASTA_WTFME_LIVE_COOKIE/);
  assert.match(source, /PASTA_WTFME_LIVE_USERNAME/);
  assert.match(source, /PASTA_WTFME_LIVE_PASSWORD/);
  assert.match(source, /PASTA_WTFME_LIVE_BASE_URL/);
  assert.match(source, /PASTA_WTFME_LIVE_HOSTS/);
  assert.match(source, /PASTA_WTFME_LIVE_EXPECT_HOST/);
  assert.match(source, /PASTA_WTFME_LIVE_INVENTORY_LIMIT/);
  assert.doesNotMatch(source, /const DEFAULT_HOSTS/);
  assert.doesNotMatch(source, /wtf-admin\.wtfos\.me/);
  assert.match(
    source,
    /fail\("Set PASTA_WTFME_LIVE_COOKIE or both PASTA_WTFME_LIVE_USERNAME and PASTA_WTFME_LIVE_PASSWORD"\)/
  );
  assert.doesNotMatch(source, /E2E_PUPPET|LIVE_PUPPET|MACARONI_.*PASSWORD|PASTA_SUITE_.*PASSWORD/);
});

test("Pasta WTF.ME live inventory only reads site, admin inventory, and TLS state", () => {
  assert.match(source, /fetchWithCookies\("\/api\/auth\/user"\)/);
  assert.match(source, /fetchWithCookies\("\/api\/auth\/login", \{\s*method: "POST"/);
  assert.match(source, /fetchWithCookies\("\/api\/wtf-sites\/my"\)/);
  assert.match(source, /fetchWithCookies\(`\/api\/admin\/wtf-sites\?limit=\$\{numericLimit\(\)\}`\)/);
  assert.match(source, /new URL\("\/internal\/tls\/allow", baseUrl\(\)\)/);
  assert.match(source, /url\.searchParams\.set\("domain", host\)/);

  assert.doesNotMatch(source, /\/api\/wtf-sites\/claim/);
  assert.doesNotMatch(source, /\/api\/wtf-sites\/pages/);
  assert.doesNotMatch(source, /\/api\/wtf-sites\/publish/);
  assert.doesNotMatch(source, /\/api\/wtf-sites\/rollback/);
  assert.doesNotMatch(source, /\/api\/wtf-sites\/assets/);
  assert.doesNotMatch(source, /\/api\/admin\/wtf-sites\/[^"`']+\/(?:suspend|restore)/);
  assert.doesNotMatch(source, /csrf|x-csrf-token/i);
});

test("Pasta WTF.ME live inventory has no production write methods beyond password login", () => {
  const methodMatches = [...source.matchAll(/method:\s*"([A-Z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(methodMatches, ["POST"], "only password login should declare an HTTP method");
  assert.doesNotMatch(source, /method:\s*"(?:PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /PASTA_WTFME_LIVE_PUBLISH/);
  assert.doesNotMatch(source, /savePastaPages|claimIfNeeded|publish\(headers\)/);
});

test("Pasta WTF.ME live inventory reports the host facts needed for production unblock", () => {
  assert.match(source, /summarizeSite/);
  assert.match(source, /summarizeEligibility/);
  assert.match(source, /summarizePinRegistry/);
  assert.match(source, /adminSites/);
  assert.match(source, /tlsAsk/);
  assert.match(source, /nextRequiredHost/);
  assert.match(source, /summarizeReadiness/);
  assert.match(source, /pagePublishReady/);
  assert.match(source, /pinRecoveryPublishReady/);
  assert.match(source, /publicPinDiscoveryReady/);
  assert.match(source, /hasWallet/);
  assert.match(source, /hasOAuthSocial/);
  assert.match(source, /hasLinkedBluesky/);
  assert.match(source, /hasActiveWtfDid/);
  assert.match(source, /canIssueWtfDid/);
  assert.match(source, /use_wtfos_pinning/);
  assert.match(source, /active PDS\/repo pin home/);
  assert.match(source, /This inventory is read-only/);
});

test("Pasta WTF.ME live inventory API exposes non-secret pin home readiness", () => {
  assert.match(pinningServiceSource, /export async function getPinRegistrySummaryForUser/);
  assert.match(pinningServiceSource, /const home = await resolvePinHome\(userId\)/);
  assert.match(pinningServiceSource, /home:\s*\{/);
  assert.match(pinningServiceSource, /ready: home\.ready/);
  assert.match(pinningServiceSource, /repoDid: home\.identity\?\.repoDid/);
  assert.match(pinningServiceSource, /hasRepo: Boolean\(home\.identity\?\.hasRepo\)/);
  assert.match(pinningServiceSource, /siteStatus: home\.site\?\.status/);
  assert.match(pinningServiceSource, /wellKnownUrl: home\.wellKnownUrl/);
});
