import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeOAuthProviderUrl,
  getPublicSiteOrigin,
  oauthCallbackUrl,
} from "./oauth-base";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("OAuth base canonicalizes legacy platform PUBLIC_SITE_URL to wtfos.app", () => {
  withEnv({ PUBLIC_SITE_URL: "https://wtfgameshow.app" }, () => {
    assert.equal(getPublicSiteOrigin(), "https://wtfos.app");
    assert.equal(
      oauthCallbackUrl("/api/auth/twitter-oauth2/callback"),
      "https://wtfos.app/api/auth/twitter-oauth2/callback"
    );
  });
});

test("OAuth provider URL canonicalization preserves callback path, query, and hash", () => {
  assert.equal(
    canonicalizeOAuthProviderUrl(
      "https://www.wtfgameshow.app/api/auth/twitter-oauth2/callback?state=abc#top"
    ),
    "https://wtfos.app/api/auth/twitter-oauth2/callback?state=abc#top"
  );
});

test("OAuth base keeps custom preview origins and empty local fallback behavior", () => {
  withEnv({ PUBLIC_SITE_URL: "https://preview.example.test/path" }, () => {
    assert.equal(getPublicSiteOrigin(), "https://preview.example.test");
  });

  withEnv({ PUBLIC_SITE_URL: undefined }, () => {
    assert.equal(getPublicSiteOrigin(), "");
    assert.equal(
      oauthCallbackUrl("/api/auth/twitter-oauth2/callback"),
      "/api/auth/twitter-oauth2/callback"
    );
  });
});
