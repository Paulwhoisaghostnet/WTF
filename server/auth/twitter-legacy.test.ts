import assert from "node:assert/strict";
import test from "node:test";
import { legacyTwitterOAuthEnabled } from "./twitter-legacy";

test("legacy Twitter OAuth is disabled by default even when credentials exist", () => {
  assert.equal(
    legacyTwitterOAuthEnabled({
      TWITTER_CONSUMER_KEY: "key",
      TWITTER_CONSUMER_SECRET: "secret",
    }),
    false
  );
});

test("legacy Twitter OAuth requires an explicit enable flag and credentials", () => {
  assert.equal(
    legacyTwitterOAuthEnabled({
      ENABLE_LEGACY_TWITTER_OAUTH: "1",
      TWITTER_CONSUMER_KEY: "key",
      TWITTER_CONSUMER_SECRET: "secret",
    }, { packageAvailable: true }),
    true
  );
  assert.equal(
    legacyTwitterOAuthEnabled({
      ENABLE_LEGACY_TWITTER_OAUTH: "1",
      TWITTER_CONSUMER_KEY: "key",
    }, { packageAvailable: true }),
    false
  );
});

test("legacy Twitter OAuth stays disabled when the deprecated package is absent", () => {
  assert.equal(
    legacyTwitterOAuthEnabled({
      ENABLE_LEGACY_TWITTER_OAUTH: "1",
      TWITTER_CONSUMER_KEY: "key",
      TWITTER_CONSUMER_SECRET: "secret",
    }, { packageAvailable: false }),
    false
  );
});
