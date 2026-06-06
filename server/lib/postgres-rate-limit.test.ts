import assert from "node:assert/strict";
import test from "node:test";
import { postgresRateLimitBucketKey } from "./postgres-rate-limit";

test("postgres rate-limit bucket keys are namespaced per limiter", () => {
  const now = Date.UTC(2026, 5, 6, 12, 7, 30);
  const windowMs = 15 * 60 * 1000;

  const loginBucket = postgresRateLimitBucketKey({
    limiterName: "auth-password",
    requesterKey: "203.0.113.7",
    windowMs,
    now,
  });
  const walletBucket = postgresRateLimitBucketKey({
    limiterName: "auth-wallet",
    requesterKey: "203.0.113.7",
    windowMs,
    now,
  });

  assert.notEqual(loginBucket, walletBucket);
  assert.match(loginBucket, /^auth-password:203\.0\.113\.7:/);
  assert.match(walletBucket, /^auth-wallet:203\.0\.113\.7:/);
});
