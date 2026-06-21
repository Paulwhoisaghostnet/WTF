import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileSource = readFileSync(new URL("./Profile.tsx", import.meta.url), "utf8");

test("Profile X linking carries the intended handle and explains wrong-account callbacks", () => {
  assert.match(
    profileSource,
    /function normalizeProfileTwitterHandle/,
    "Profile should normalize the typed X handle before OAuth handoff"
  );
  assert.match(
    profileSource,
    /params\.set\("expectedHandle", expectedTwitterHandle\)/,
    "Profile should bind the intended X handle into the OAuth start URL"
  );
  assert.match(
    profileSource,
    /twitter_oauth2_wrong_account/,
    "Profile should render a specific wrong-account OAuth recovery message"
  );
  assert.match(
    profileSource,
    /Switch accounts on x\.com, then reconnect/,
    "Profile should tell users how to recover when X returns the wrong logged-in account"
  );
});
