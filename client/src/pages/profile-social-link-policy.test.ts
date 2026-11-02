import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileSource = readFileSync(new URL("./Profile.tsx", import.meta.url), "utf8");

test("Profile starts X proof directly or targets a typed account for a change", () => {
  assert.match(
    profileSource,
    /function normalizeProfileTwitterHandle/,
    "Profile should normalize the typed X handle before X handoff"
  );
  assert.match(
    profileSource,
    /twitterTargetedChange/,
    "Profile should distinguish a targeted account change from direct proof"
  );
  assert.match(
    profileSource,
    /\/api\/auth\/twitter-proof\?\$\{new URLSearchParams\(\{ expectedHandle: expectedTwitterHandle \}\)\.toString\(\)\}/,
    "Profile should bind the intended X handle for targeted proof"
  );
  assert.match(
    profileSource,
    /: "\/api\/auth\/twitter-proof"/,
    "Profile should allow direct proof without a handle"
  );
  assert.match(profileSource, /disabled=\{disconnectSocialMutation\.isPending \|\| twitterHandleInvalid\}/);
  assert.match(profileSource, /"Connect X"/);
  assert.match(profileSource, /twitter_proof_wrong_account/);
  assert.match(profileSource, /Your profile's X link was not changed/);
  assert.match(profileSource, /X will ask you to sign in as @/);
  assert.doesNotMatch(
    profileSource,
    /oauthStartUrl\(`\/api\/auth\/twitter-oauth2\?/,
    "Profile proof should not use the OAuth2 path that fetches a metered user record"
  );
});
