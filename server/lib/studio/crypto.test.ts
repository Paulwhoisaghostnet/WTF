import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { isStudioCryptoConfigured, openSecret, sealSecret } from "./crypto";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  STUDIO_CRYPTO_KEY: process.env.STUDIO_CRYPTO_KEY,
};

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.SESSION_SECRET = originalEnv.SESSION_SECRET;
  process.env.STUDIO_CRYPTO_KEY = originalEnv.STUDIO_CRYPTO_KEY;
});

test("Studio secrets require STUDIO_CRYPTO_KEY in production", () => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "session-only-secret";
  delete process.env.STUDIO_CRYPTO_KEY;

  assert.equal(isStudioCryptoConfigured(), false);
  assert.throws(
    () => sealSecret("refresh-token"),
    /STUDIO_CRYPTO_KEY is not set/
  );
});

test("Studio secrets can use SESSION_SECRET only outside production", () => {
  process.env.NODE_ENV = "development";
  process.env.SESSION_SECRET = "local-session-secret";
  delete process.env.STUDIO_CRYPTO_KEY;

  assert.equal(isStudioCryptoConfigured(), true);

  const sealed = sealSecret("refresh-token");

  assert.equal(openSecret(sealed), "refresh-token");
});

test("Studio secrets prefer STUDIO_CRYPTO_KEY when it is present", () => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "session-secret";
  process.env.STUDIO_CRYPTO_KEY = "studio-crypto-key";

  assert.equal(isStudioCryptoConfigured(), true);

  const sealed = sealSecret("refresh-token");

  assert.equal(openSecret(sealed), "refresh-token");
});
