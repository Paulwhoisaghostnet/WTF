import assert from "node:assert/strict";
import test from "node:test";
import { toPublicCanOpenResponse } from "./cli-access-response.ts";

test("toPublicCanOpenResponse hides route oracle for anonymous denials", () => {
  const payload = toPublicCanOpenResponse(
    {
      allowed: false,
      path: "/admin",
      pattern: "/admin",
      reason: "auth-required",
      title: "Admin Panel",
    },
    false
  );
  assert.equal(payload.allowed, false);
  assert.equal("reason" in payload, false);
  assert.equal("title" in payload, false);
  assert.match(payload.message, /Access denied/);
  assert.doesNotMatch(payload.message, /Admin Panel/);
});

test("toPublicCanOpenResponse keeps signed-in denial detail", () => {
  const payload = toPublicCanOpenResponse(
    {
      allowed: false,
      path: "/admin",
      pattern: "/admin",
      reason: "role-denied",
      title: "Admin Panel",
    },
    true
  );
  assert.equal(payload.allowed, false);
  if (payload.allowed) return;
  assert.equal(payload.reason, "role-denied");
  assert.match(payload.message, /Admin Panel/);
});

test("toPublicCanOpenResponse trims allowed payload fields", () => {
  const payload = toPublicCanOpenResponse(
    {
      allowed: true,
      path: "/mission-control",
      pattern: "/mission-control",
      surfaceId: "mission-control",
      appKey: undefined,
      title: "Mission Control",
    },
    true
  );
  assert.deepEqual(payload, {
    allowed: true,
    path: "/mission-control",
    title: "Mission Control",
  });
});
