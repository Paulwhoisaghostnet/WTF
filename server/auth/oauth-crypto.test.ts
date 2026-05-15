import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { decryptOAuthSecret, encryptOAuthSecret } from "./oauth-crypto";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  TWITTER_TOKEN_ENCRYPTION_KEY: process.env.TWITTER_TOKEN_ENCRYPTION_KEY,
};

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.SESSION_SECRET = originalEnv.SESSION_SECRET;
  process.env.TWITTER_TOKEN_ENCRYPTION_KEY = originalEnv.TWITTER_TOKEN_ENCRYPTION_KEY;
});

test("OAuth secrets require a dedicated encryption key in production", () => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "session-only-secret";
  delete process.env.TWITTER_TOKEN_ENCRYPTION_KEY;

  assert.throws(
    () => encryptOAuthSecret("token-value"),
    /Missing TWITTER_TOKEN_ENCRYPTION_KEY/
  );
});

test("OAuth secrets can use SESSION_SECRET only outside production", () => {
  process.env.NODE_ENV = "development";
  process.env.SESSION_SECRET = "local-session-secret";
  delete process.env.TWITTER_TOKEN_ENCRYPTION_KEY;

  const encrypted = encryptOAuthSecret("token-value");

  assert.equal(decryptOAuthSecret(encrypted), "token-value");
});

test("OAuth secrets prefer the dedicated key when it is present", () => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "session-secret";
  process.env.TWITTER_TOKEN_ENCRYPTION_KEY = "twitter-token-key";

  const encrypted = encryptOAuthSecret("token-value");

  assert.equal(decryptOAuthSecret(encrypted), "token-value");
});
