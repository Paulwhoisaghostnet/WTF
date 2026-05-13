import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("W/X connect onboarding policy", () => {
  it("runs after Twitter OAuth2 connects a verified WTF user", () => {
    const authRoutes = readFileSync("server/auth/routes.ts", "utf8");

    assert.match(authRoutes, /runXConnectOnboardingSoon/);
    assert.match(authRoutes, /twitterOAuth2Redirect\(returnTo, "verified=twitter_oauth2"\)/);
  });

  it("syncs timeline rules, follows the connected user, and adds them to the Gameshow groupchat", () => {
    const source = readFileSync("server/lib/w-x-onboarding.ts", "utf8");

    assert.match(source, /syncStreamRulesToX/);
    assert.match(source, /requestTimelineStreamReconnect/);
    assert.match(source, /\/users\/.*\/following/);
    assert.match(source, /target_user_id/);
    assert.match(source, /\/chat\/conversations\/.*\/members/);
    assert.match(source, /participant_user_ids/);
    assert.match(source, /getDesignatedGroupchatIds/);
  });
});
