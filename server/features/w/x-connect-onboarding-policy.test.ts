import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("W/X connect onboarding policy", () => {
  it("runs after Twitter OAuth2 connects a verified WTF user", () => {
    const authRoutes = readFileSync("server/auth/routes.ts", "utf8");

    assert.match(authRoutes, /runXConnectOnboardingSoon/);
    assert.match(authRoutes, /twitterOAuth2Redirect\(returnTo, "verified=twitter_oauth2"\)/);
  });

  it("binds Profile X OAuth to the intended handle before storing tokens", () => {
    const authRoutes = readFileSync("server/auth/routes.ts", "utf8");

    assert.match(authRoutes, /const X_OAUTH2_AUTH_URL = "https:\/\/x\.com\/i\/oauth2\/authorize"/);
    assert.match(authRoutes, /function normalizeTwitterOAuth2Handle/);
    assert.match(authRoutes, /const expectedHandle = normalizeTwitterOAuth2Handle\(req\.query\.expectedHandle\)/);
    assert.match(authRoutes, /expectedHandle,/);
    assert.match(authRoutes, /const expectedHandle = normalizeTwitterOAuth2Handle\(sessionState\?\.expectedHandle\)/);
    assert.match(authRoutes, /twitter_oauth2_wrong_account/);
    assert.match(authRoutes, /expectedHandle && expectedHandle !== actualHandle/);
    assert.match(authRoutes, /runXConnectOnboardingSoon/);
    const wrongAccountGuard = authRoutes.indexOf("twitter_oauth2_wrong_account");
    const tokenPersistence = authRoutes.indexOf("const updateSet: Record<string, unknown>");
    assert.ok(
      wrongAccountGuard > 0 && tokenPersistence > 0 && wrongAccountGuard < tokenPersistence,
      "wrong X account callbacks must redirect before token persistence/onboarding"
    );
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
