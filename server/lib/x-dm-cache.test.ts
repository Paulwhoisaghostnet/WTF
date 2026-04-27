import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  clearDmCache,
  dmCacheKey,
  readDmThroughCache,
} from "./x-dm-cache";

beforeEach(() => {
  clearDmCache();
});

test("dmCacheKey concatenates parts deterministically and tolerates null/undefined", () => {
  assert.equal(dmCacheKey(["a", 1, null, undefined, "b"]), "a::1::::::b");
});

test("readDmThroughCache: cache miss → calls loader and caches the result", async () => {
  let calls = 0;
  const result = await readDmThroughCache<{ messages: number[] }>({
    key: "k1",
    ttlMs: 60_000,
    loader: async () => {
      calls += 1;
      return { messages: [1, 2, 3] };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.payload, { messages: [1, 2, 3] });
  assert.equal(result.fromCache, false);
  assert.equal(result.rateLimitedUntil, null);
});

test("readDmThroughCache: cache hit within TTL → no upstream call", async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { v: calls };
  };
  await readDmThroughCache({ key: "k2", ttlMs: 60_000, loader });
  await readDmThroughCache({ key: "k2", ttlMs: 60_000, loader });
  await readDmThroughCache({ key: "k2", ttlMs: 60_000, loader });
  assert.equal(calls, 1);
});

test("readDmThroughCache: 429 with stale cache → returns cached + rateLimitedUntil, no rethrow", async () => {
  let phase: "ok" | "rate-limited" = "ok";
  const loader = async () => {
    if (phase === "ok") return { messages: ["hello"] };
    const err: any = new Error("X API 429: Too Many Requests");
    err.status = 429;
    // Reset 60s in the future:
    err.rateLimitReset = Math.floor(Date.now() / 1000) + 60;
    throw err;
  };

  // Warm the cache with a successful call.
  const first = await readDmThroughCache<{ messages: string[] }>({
    key: "k3",
    ttlMs: 1, // tiny TTL so the next call goes back to the loader
    staleTtlMs: 60_000,
    loader,
  });
  assert.deepEqual(first.payload, { messages: ["hello"] });
  assert.equal(first.fromCache, false);

  // Force the next call past the fresh TTL but loader now 429s.
  await new Promise((r) => setTimeout(r, 5));
  phase = "rate-limited";

  const second = await readDmThroughCache<{ messages: string[] }>({
    key: "k3",
    ttlMs: 1,
    staleTtlMs: 60_000,
    loader,
  });
  // Stale cached payload is returned with rateLimitedUntil set.
  assert.deepEqual(second.payload, { messages: ["hello"] });
  assert.equal(second.fromCache, true);
  assert.ok(second.rateLimitedUntil && second.rateLimitedUntil > Date.now());
});

test("readDmThroughCache: 429 with cold cache → rethrows with rateLimitedUntil attached", async () => {
  const loader = async () => {
    const err: any = new Error("X API 429: Too Many Requests");
    err.status = 429;
    err.rateLimitReset = Math.floor(Date.now() / 1000) + 60;
    throw err;
  };

  await assert.rejects(
    () => readDmThroughCache({ key: "k4", ttlMs: 1, staleTtlMs: 60_000, loader }),
    (err: any) => {
      assert.equal(err.status, 429);
      assert.ok(err.rateLimitedUntil > Date.now(), "rateLimitedUntil should be set on the rethrown error");
      return true;
    }
  );
});

test("readDmThroughCache: rate-limit window blocks subsequent loader calls until it expires", async () => {
  let calls = 0;
  let mode: "ok" | "rate-limited" = "ok";
  const loader = async () => {
    calls += 1;
    if (mode === "rate-limited") {
      const err: any = new Error("X API 429");
      err.status = 429;
      // Reset 1s in the future
      err.rateLimitReset = Math.floor(Date.now() / 1000) + 1;
      throw err;
    }
    return { ts: calls };
  };

  // Warm cache.
  await readDmThroughCache({ key: "k5", ttlMs: 1, staleTtlMs: 60_000, loader });
  // Force rate limit on next call.
  await new Promise((r) => setTimeout(r, 5));
  mode = "rate-limited";
  await readDmThroughCache({ key: "k5", ttlMs: 1, staleTtlMs: 60_000, loader });
  const callsAfterFirst429 = calls; // should be 2 (warm-up + first 429)

  // While the window is still active, more calls must NOT hit the loader.
  for (let i = 0; i < 5; i += 1) {
    await readDmThroughCache({ key: "k5", ttlMs: 1, staleTtlMs: 60_000, loader });
  }
  assert.equal(calls, callsAfterFirst429, "no upstream calls during rate-limit window");
});

test("readDmThroughCache: keys are isolated", async () => {
  let aCalls = 0;
  let bCalls = 0;
  await readDmThroughCache({
    key: dmCacheKey(["x", "A"]),
    ttlMs: 60_000,
    loader: async () => {
      aCalls += 1;
      return { who: "A" };
    },
  });
  await readDmThroughCache({
    key: dmCacheKey(["x", "B"]),
    ttlMs: 60_000,
    loader: async () => {
      bCalls += 1;
      return { who: "B" };
    },
  });
  // A again — cached, no new call.
  await readDmThroughCache({
    key: dmCacheKey(["x", "A"]),
    ttlMs: 60_000,
    loader: async () => {
      aCalls += 1;
      return { who: "A" };
    },
  });
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);
});

test("readDmThroughCache: 429 falls back to retryAfterSeconds when rateLimitReset missing", async () => {
  const loader = async () => {
    const err: any = new Error("X API 429");
    err.status = 429;
    err.retryAfterSeconds = 30;
    throw err;
  };
  await assert.rejects(
    () => readDmThroughCache({ key: "k6", ttlMs: 1, loader }),
    (err: any) => {
      assert.equal(err.status, 429);
      const expectedAt = Date.now() + 30_000;
      assert.ok(
        Math.abs(err.rateLimitedUntil - expectedAt) < 2_000,
        `rateLimitedUntil (${err.rateLimitedUntil}) should be near now+30s (${expectedAt})`
      );
      return true;
    }
  );
});

test("readDmThroughCache: non-429 errors do not start a rate-limit window", async () => {
  const loader = async () => {
    const err: any = new Error("X API 500");
    err.status = 500;
    throw err;
  };
  await assert.rejects(() => readDmThroughCache({ key: "k7", ttlMs: 1, loader }));
  // Subsequent call should still hit the loader, not be blocked by a window.
  let secondCalled = false;
  await assert.rejects(() =>
    readDmThroughCache({
      key: "k7",
      ttlMs: 1,
      loader: async () => {
        secondCalled = true;
        const err: any = new Error("X API 500");
        err.status = 500;
        throw err;
      },
    })
  );
  assert.equal(secondCalled, true);
});
