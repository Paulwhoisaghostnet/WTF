import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import type { Request, Response } from "express";
import {
  clientLogRateLimitKey,
  createClientLogRateLimit,
} from "./client-log-rate-limit";

const realDateNow = Date.now;

afterEach(() => {
  Date.now = realDateNow;
});

function mockNow(now: number) {
  Date.now = () => now;
}

function createReq(input: { ip: string; userId?: number | string }): Request {
  return {
    user: input.userId == null ? undefined : { id: input.userId },
    headers: { "x-forwarded-for": `${input.ip}, 10.0.0.2` },
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;
}

function createRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as Response & { statusCode: number; body: unknown };
}

function runLimiter(
  limiter: ReturnType<typeof createClientLogRateLimit>,
  input: { ip: string; userId?: number | string }
): { nextCalled: boolean; statusCode: number; body: unknown } {
  const res = createRes();
  let nextCalled = false;
  limiter(createReq(input), res, () => {
    nextCalled = true;
  });
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

test("client log rate-limit key prefers authenticated user id", () => {
  assert.equal(
    clientLogRateLimitKey(createReq({ ip: "203.0.113.4", userId: 42 })),
    "user:42"
  );
});

test("client log rate-limit key falls back to bounded source IP", () => {
  assert.equal(
    clientLogRateLimitKey(createReq({ ip: "203.0.113.5" })),
    "ip:203.0.113.5"
  );
});

test("client log limiter caps tracked keyspace under anonymous IP churn", () => {
  const limiter = createClientLogRateLimit({
    maxEntries: 3,
    sweepIntervalMs: 60_000,
  });

  for (let index = 0; index < 12; index += 1) {
    mockNow(1_000 + index);
    runLimiter(limiter, { ip: `203.0.113.${index}` });
  }

  assert.equal(limiter.getTrackedKeyCount(), 3);
});

test("client log limiter blocks noisy diagnostic floods", () => {
  const limiter = createClientLogRateLimit({ maxEntries: 10 });

  for (let index = 0; index < 120; index += 1) {
    mockNow(1_000 + index);
    assert.equal(runLimiter(limiter, { ip: "203.0.113.20" }).nextCalled, true);
  }

  mockNow(2_000);
  const blocked = runLimiter(limiter, { ip: "203.0.113.20" });
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, {
    error: "Too many client log events, please try again later",
  });
});
