import assert from "node:assert/strict";
import test from "node:test";
import { backoffMs, UpstreamClient, UpstreamError } from "./upstream";

function jsonResponse(status: number, body: unknown = {}, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("upstream backoff is deterministic when random is injected", () => {
  assert.equal(backoffMs(1, () => 0.5), 200);
  assert.equal(backoffMs(2, () => 0.5), 400);
  assert.equal(backoffMs(3, () => 0.5), 800);
});

test("upstream retries transient 5xx within retry budget", async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const client = new UpstreamClient({
    label: "test-upstream",
    baseUrl: "https://example.test",
    requestsPerSecond: 100,
    burst: 100,
    maxRetries: 2,
    retryBudgetMs: 1_000,
    randomFn: () => 0.5,
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(503, { error: "try again" })
        : jsonResponse(200, { ok: true });
    },
  });

  const payload = await client.getJson<{ ok: boolean }>("/health");

  assert.deepEqual(payload, { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [200]);
});

test("upstream refuses Retry-After values that exceed retry budget", async () => {
  const sleeps: number[] = [];
  const client = new UpstreamClient({
    label: "budgeted-upstream",
    baseUrl: "https://example.test",
    requestsPerSecond: 100,
    burst: 100,
    maxRetries: 2,
    retryBudgetMs: 500,
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async () => jsonResponse(429, { error: "slow down" }, { "retry-after": "2" }),
  });

  await assert.rejects(
    () => client.getJson("/limited"),
    (err) =>
      err instanceof UpstreamError &&
      err.status === 429 &&
      /retry budget exhausted/.test(err.message)
  );
  assert.deepEqual(sleeps, []);
});
