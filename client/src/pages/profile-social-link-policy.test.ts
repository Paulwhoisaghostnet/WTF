import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileSource = readFileSync(new URL("./Profile.tsx", import.meta.url), "utf8");

test("Profile verifies a typed X account through the identity-only sign-in flow", () => {
  assert.match(
    profileSource,
    /function normalizeProfileTwitterHandle/,
    "Profile should normalize the typed X handle before X handoff"
  );
  assert.match(
    profileSource,
    /expectedHandle: expectedTwitterHandle/,
    "Profile should bind the intended X handle into the proof start URL"
  );
  assert.match(
    profileSource,
    /oauthStartUrl\(`\/api\/auth\/twitter-proof\?\$\{params\.toString\(\)\}`\)/,
    "Profile should start the identity-only proof flow"
  );
  assert.match(
    profileSource,
    /disabled=\{disconnectSocialMutation\.isPending \|\| !expectedTwitterHandle\}/,
    "Profile should require a valid intended handle before verification"
  );
  assert.match(profileSource, /twitter_proof_wrong_account/);
  assert.match(profileSource, /Your profile's X link was not changed/);
  assert.match(profileSource, /X will ask you to sign in as @/);
  assert.match(profileSource, /Verification uses X sign-in without an X profile lookup/);
  assert.doesNotMatch(
    profileSource,
    /oauthStartUrl\(`\/api\/auth\/twitter-oauth2\?/,
    "Profile proof should not use the OAuth2 path that fetches a metered user record"
  );
});
