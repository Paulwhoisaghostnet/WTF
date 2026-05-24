import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";

test("Skywire routes strip OAuth secrets from account responses", () => {
  const route = readFileSync("server/routes/atproto.ts", "utf8");
  assert.match(route, /export function safeAtprotoAccount/);
  assert.match(route, /hasEncryptedTokens/);
  assert.doesNotMatch(route, /encryptedAccessToken:\s*account\.encryptedAccessToken/);
  assert.doesNotMatch(route, /encryptedRefreshToken:\s*account\.encryptedRefreshToken/);
  assert.doesNotMatch(route, /encryptedDpopKey:\s*account\.encryptedDpopKey/);
});

test("well-known DID lookup only serves verified WTF-hosted handle claims", () => {
  const route = readFileSync("server/routes/atproto.ts", "utf8");
  assert.match(route, /"\/\.well-known\/atproto-did"/);
  assert.match(route, /eq\(atprotoHandleClaims\.verificationStatus,\s*"verified"\)/);
  assert.match(route, /eq\(atprotoHandleClaims\.verificationMethod,\s*"wtf_hosted_subdomain"\)/);
  assert.match(route, /res\.type\("text\/plain"\)\.send\(claim\.did\)/);
});

test("Skywire post claims verify actor DID and emit idempotent challenge events", () => {
  const route = readFileSync("server/routes/skywire.ts", "utf8");
  assert.match(route, /post\.author\.did !== account\.did/);
  assert.match(route, /skywireEventId\("atproto\.post\.claimed"/);
  assert.match(route, /eventType:\s*"atproto\.post\.claimed"/);
});

test("Skywire adapter persists atproto events and calls challenge ingestion", () => {
  const adapter = readFileSync("server/features/atproto/events.ts", "utf8");
  assert.match(adapter, /insert\(atprotoEvents\)/);
  assert.match(adapter, /onConflictDoNothing/);
  assert.match(adapter, /ingestSystemEvent\(/);
});

test("Skywire page is registered as a desktop social app", () => {
  const routes = readFileSync("client/src/routes/page-defs.ts", "utf8");
  assert.match(routes, /pattern:\s*"\/skywire"/);
  assert.match(routes, /title:\s*"Skywire"/);
  assert.match(routes, /group:\s*"social"/);
  assert.match(routes, /desktopIcon:\s*true/);
});
