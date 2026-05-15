import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import type { Request, Response } from "express";
import {
  boardWebhookRateLimitKey,
  createBoardWebhookRateLimit,
} from "./board-webhook-rate-limit";

const realDateNow = Date.now;

afterEach(() => {
  Date.now = realDateNow;
});

function mockNow(now: number) {
  Date.now = () => now;
}

function createReq(token: string, ip: string): Request {
  return {
    params: { token },
    headers: { "x-forwarded-for": `${ip}, 10.0.0.2` },
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
  limiter: ReturnType<typeof createBoardWebhookRateLimit>,
  token: string,
  ip: string
): { nextCalled: boolean; statusCode: number; body: unknown } {
  const res = createRes();
  let nextCalled = false;
  limiter(createReq(token, ip), res, () => {
    nextCalled = true;
  });
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

test("board webhook rate-limit key is token and source scoped but bounded", () => {
  const req = createReq("x".repeat(200), "203.0.113.10");

  assert.equal(boardWebhookRateLimitKey(req), `${"x".repeat(128)}:203.0.113.10`);
});

test("board webhook limiter caps tracked keyspace under token/ip churn", () => {
  const limiter = createBoardWebhookRateLimit({
    maxEntries: 3,
    sweepIntervalMs: 60_000,
  });

  for (let index = 0; index < 12; index += 1) {
    mockNow(1_000 + index);
    runLimiter(limiter, `token-${index}`, `203.0.113.${index}`);
  }

  assert.equal(limiter.getTrackedKeyCount(), 3);
});

test("board webhook limiter keeps the existing per-token/ip request ceiling", () => {
  const limiter = createBoardWebhookRateLimit({ maxEntries: 10 });

  for (let index = 0; index < 20; index += 1) {
    mockNow(1_000 + index);
    assert.equal(runLimiter(limiter, "token", "203.0.113.20").nextCalled, true);
  }

  mockNow(2_000);
  const blocked = runLimiter(limiter, "token", "203.0.113.20");
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { error: "Webhook rate limit exceeded" });
});
