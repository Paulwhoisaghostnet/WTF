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

test("Skywire can register new AT Protocol identities without leaking credentials", () => {
  const route = readFileSync("server/routes/atproto.ts", "utf8");
  const oauth = readFileSync("server/features/atproto/oauth.ts", "utf8");
  assert.match(route, /"\/api\/atproto\/registration\/options"/);
  assert.match(route, /"\/api\/atproto\/register\/phone-verification"/);
  assert.match(route, /"\/api\/atproto\/register"/);
  assert.match(route, /"\/api\/atproto\/oauth\/start"/);
  assert.match(route, /issues:\s*parsed\.error\.issues\.map/);
  assert.match(route, /normalizeRegistrationHandle/);
  assert.match(route, /atproto_oauth_start/);
  assert.match(route, /requestPhoneVerification/);
  assert.match(route, /verificationPhone/);
  assert.match(route, /verificationCode/);
  assert.match(route, /externalSignupUrlForPds/);
  assert.match(route, /phoneVerificationModeForPds/);
  assert.match(route, /external_signup_required/);
  assert.match(route, /phone verification not enabled/);
  assert.match(route, /maskedPhone/);
  assert.match(route, /new AtpAgent\(\{ service: pdsUrl \}\)/);
  assert.match(route, /agent\.createAccount\(/);
  assert.match(route, /pdsRegistrationErrorResponse/);
  assert.match(route, /InvalidPhoneVerification/i);
  assert.match(route, /PDS registration failed/);
  assert.match(route, /\[skywire\] PDS registration rejected/);
  assert.match(route, /persistCredentialSessionForDid/);
  assert.match(route, /eventType:\s*"atproto\.account\.registered"/);
  assert.match(oauth, /persistCredentialSessionForDid/);
  assert.match(oauth, /credentialAgent\.resumeSession/);
});

test("Skywire registration UI supports in-app PDS phone verification", () => {
  const page = readFileSync("client/src/pages/Skywire.tsx", "utf8");
  assert.match(page, /\/api\/atproto\/register\/phone-verification/);
  assert.match(page, /phoneVerificationMode/);
  assert.match(page, /externalPhoneFlow/);
  assert.match(page, /Official Bluesky signup handles account creation for this PDS/);
  assert.match(page, /connectHandle/);
  assert.match(page, /atproto_oauth_start/);
  assert.match(page, /skywire-registration-phone/);
  assert.match(page, /skywire-registration-phone-code/);
  assert.match(page, /autoComplete="one-time-code"/);
  assert.match(page, /Send Phone Code/);
  assert.match(page, /Open PDS Signup/);
  assert.match(page, /window\.open\(externalSignupUrl/);
});

test("Skywire exposes app-grade actor discovery and WTF-native AT repo signals", () => {
  const route = readFileSync("server/routes/skywire.ts", "utf8");
  const events = readFileSync("server/features/atproto/events.ts", "utf8");
  assert.match(route, /"\/api\/skywire\/actors\/search"/);
  assert.match(route, /"\/api\/skywire\/actor\/:actor\/feed"/);
  assert.match(route, /"\/api\/skywire\/follow"/);
  assert.match(route, /"\/api\/skywire\/profile"/);
  assert.match(route, /SKYWIRE_SIGNAL_COLLECTION = "app\.wtfgameshow\.skywire\.signal"/);
  assert.match(route, /com\.atproto\.repo\.createRecord/);
  assert.match(route, /validate:\s*false/);
  assert.match(events, /"atproto\.profile\.updated"/);
  assert.match(events, /"atproto\.actor\.searched"/);
  assert.match(events, /"atproto\.actor\.followed"/);
  assert.match(events, /"atproto\.signal\.published"/);
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
