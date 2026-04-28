import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import type { Request, Response } from "express";
import {
  createInMemoryRateLimit,
  type InMemoryRateLimitMiddleware,
} from "./in-memory-rate-limit";

const realDateNow = Date.now;

afterEach(() => {
  Date.now = realDateNow;
});

function mockNow(now: number) {
  Date.now = () => now;
}

function createReq(key: string): Request {
  return {
    headers: { "x-test-key": key },
    ip: key,
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
  limiter: InMemoryRateLimitMiddleware,
  key: string
): { nextCalled: boolean; statusCode: number; body: unknown } {
  const res = createRes();
  let nextCalled = false;
  limiter(
    createReq(key),
    res,
    () => {
      nextCalled = true;
    }
  );
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

test("createInMemoryRateLimit enforces the configured max requests per window", () => {
  const limiter = createInMemoryRateLimit({
    windowMs: 60_000,
    max: 2,
    message: { error: "Too many requests" },
    keyGenerator: (req) => String(req.headers["x-test-key"] || ""),
    maxEntries: 10,
  });

  mockNow(1_000);
  assert.equal(runLimiter(limiter, "same-key").nextCalled, true);
  mockNow(2_000);
  assert.equal(runLimiter(limiter, "same-key").nextCalled, true);
  mockNow(3_000);

  const blocked = runLimiter(limiter, "same-key");
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: "Too many requests" });
});

test("createInMemoryRateLimit evicts stale keys during periodic sweeps", () => {
  const limiter = createInMemoryRateLimit({
    windowMs: 1_000,
    max: 10,
    message: { error: "Too many requests" },
    keyGenerator: (req) => String(req.headers["x-test-key"] || ""),
    maxEntries: 10,
    sweepIntervalMs: 1_000,
  });

  mockNow(100);
  runLimiter(limiter, "old-key");
  assert.equal(limiter.getTrackedKeyCount(), 1);

  mockNow(2_000);
  runLimiter(limiter, "fresh-key");
  assert.equal(limiter.getTrackedKeyCount(), 1);
});

test("createInMemoryRateLimit caps tracked key cardinality under high churn", () => {
  const limiter = createInMemoryRateLimit({
    windowMs: 60_000,
    max: 10,
    message: { error: "Too many requests" },
    keyGenerator: (req) => String(req.headers["x-test-key"] || ""),
    maxEntries: 3,
    sweepIntervalMs: 60_000,
  });

  for (let index = 0; index < 5; index += 1) {
    mockNow(1_000 + index);
    runLimiter(limiter, `key-${index}`);
  }

  assert.equal(limiter.getTrackedKeyCount(), 3);
});
