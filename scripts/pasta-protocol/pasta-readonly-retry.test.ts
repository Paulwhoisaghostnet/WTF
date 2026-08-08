import assert from "node:assert/strict";
import test from "node:test";

import {
  createHttpGetReader,
  declareReadOnlyReader,
  ReadOnlyDeadlineError,
  ReadOnlyHttpStatusError,
  ReadOnlyRetryExhaustedError,
  readWithBoundedRetry,
} from "./pasta-readonly-retry";

function fakeTiming(start = 1_700_000_000_000) {
  let current = start;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: async (milliseconds: number) => {
      sleeps.push(milliseconds);
      current += milliseconds;
    },
    sleeps,
  };
}

test("declared read-only work succeeds without sleeping", async () => {
  const timing = fakeTiming();
  let calls = 0;
  const value = await readWithBoundedRetry({
    primary: declareReadOnlyReader("head level", async ({ attempt, lane, signal }) => {
      calls += 1;
      assert.equal(attempt, 1);
      assert.equal(lane, "primary");
      assert.equal(signal.aborted, false);
      return 42;
    }),
  }, {
    now: timing.now,
    sleep: timing.sleep,
    jitterRatio: 0,
  });

  assert.equal(value, 42);
  assert.equal(calls, 1);
  assert.deepEqual(timing.sleeps, []);
});

test("429 and 5xx responses retry with deterministic exponential backoff", async () => {
  const timing = fakeTiming();
  const statuses = [503, 500, 200];
  const reader = createHttpGetReader({
    label: "TzKT head",
    url: "https://api.ghostnet.tzkt.io/v1/head",
    fetchImpl: async () => new Response("head", { status: statuses.shift() }),
    parse: async (response) => response.text(),
  });

  assert.equal(await readWithBoundedRetry({ primary: reader }, {
    maxAttempts: 3,
    deadlineMs: 5_000,
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  }), "head");
  assert.deepEqual(timing.sleeps, [100, 200]);
});

test("Retry-After delta-seconds is honored but bounded", async () => {
  const timing = fakeTiming();
  let calls = 0;
  const reader = createHttpGetReader({
    label: "rate-limited GET",
    url: "https://example.test/value",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "30" } })
        : new Response("ok");
    },
    parse: async (response) => response.text(),
  });

  assert.equal(await readWithBoundedRetry({ primary: reader }, {
    deadlineMs: 10_000,
    maxRetryAfterMs: 1_500,
    baseDelayMs: 100,
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  }), "ok");
  assert.deepEqual(timing.sleeps, [1_500]);
});

test("Retry-After HTTP-date uses the injected clock and remains bounded", async () => {
  const timing = fakeTiming(Date.parse("2026-07-22T12:00:00Z"));
  let calls = 0;
  const reader = createHttpGetReader({
    label: "dated rate limit",
    url: "https://example.test/value",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", {
            status: 503,
            headers: { "retry-after": "Wed, 22 Jul 2026 12:00:04 GMT" },
          })
        : new Response("ok");
    },
    parse: async (response) => response.text(),
  });

  await readWithBoundedRetry({ primary: reader }, {
    deadlineMs: 10_000,
    maxRetryAfterMs: 2_500,
    baseDelayMs: 100,
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  });
  assert.deepEqual(timing.sleeps, [2_500]);
});

test("jitter is deterministic through an injected random source", async () => {
  const timing = fakeTiming();
  let calls = 0;
  const reader = declareReadOnlyReader("RPC storage", async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    return "storage";
  });

  assert.equal(await readWithBoundedRetry({ primary: reader }, {
    baseDelayMs: 100,
    jitterRatio: 0.5,
    random: () => 1,
    now: timing.now,
    sleep: timing.sleep,
  }), "storage");
  assert.deepEqual(timing.sleeps, [150]);
});

test("terminal HTTP, parsing, ordinary, and explicit abort errors are never retried", async () => {
  const cases: Array<[string, () => unknown]> = [
    ["HTTP 400", () => new ReadOnlyHttpStatusError("bad request", 400)],
    ["HTTP 408", () => new ReadOnlyHttpStatusError("request timeout", 408)],
    ["HTTP 600", () => new ReadOnlyHttpStatusError("not 5xx", 600)],
    ["JSON parse", () => new SyntaxError("bad JSON")],
    ["ordinary", () => new Error("programming error")],
    ["abort", () => new DOMException("cancelled", "AbortError")],
  ];

  for (const [label, makeError] of cases) {
    const timing = fakeTiming();
    let calls = 0;
    const error = makeError();
    const reader = declareReadOnlyReader(label, async () => {
      calls += 1;
      throw error;
    });
    await assert.rejects(readWithBoundedRetry({ primary: reader }, {
      maxAttempts: 5,
      now: timing.now,
      sleep: timing.sleep,
    }), (received) => received === error, label);
    assert.equal(calls, 1, label);
    assert.deepEqual(timing.sleeps, [], label);
  }
});

test("nested transient network codes retry, while error message numerals do not", async () => {
  const timing = fakeTiming();
  let calls = 0;
  const reader = declareReadOnlyReader("network read", async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    }
    return "recovered";
  });
  assert.equal(await readWithBoundedRetry({ primary: reader }, {
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  }), "recovered");
  assert.equal(calls, 2);

  let ordinaryCalls = 0;
  await assert.rejects(readWithBoundedRetry({
    primary: declareReadOnlyReader("ordinary 503 text", async () => {
      ordinaryCalls += 1;
      throw new Error("the expected value was 503");
    }),
  }, {
    now: timing.now,
    sleep: timing.sleep,
  }), /expected value was 503/);
  assert.equal(ordinaryCalls, 1);

  let abortedFetchCalls = 0;
  await assert.rejects(readWithBoundedRetry({
    primary: declareReadOnlyReader("aborted fetch", async () => {
      abortedFetchCalls += 1;
      throw new TypeError("fetch failed", { cause: new DOMException("cancelled", "AbortError") });
    }),
  }, {
    now: timing.now,
    sleep: timing.sleep,
  }), /fetch failed/);
  assert.equal(abortedFetchCalls, 1, "a nested explicit abort must override generic fetch wording");
});

test("attempt exhaustion is explicit and exactly bounded", async () => {
  const timing = fakeTiming();
  let calls = 0;
  const reader = declareReadOnlyReader("unreachable RPC", async () => {
    calls += 1;
    throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
  });

  await assert.rejects(readWithBoundedRetry({ primary: reader }, {
    maxAttempts: 3,
    deadlineMs: 5_000,
    baseDelayMs: 10,
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  }), (error: unknown) => {
    assert.ok(error instanceof ReadOnlyRetryExhaustedError);
    assert.equal(error.attempts, 3);
    assert.match(error.message, /after 3 attempts/);
    return true;
  });
  assert.equal(calls, 3);
  assert.deepEqual(timing.sleeps, [10, 20]);
});

test("deadline refuses a retry whose bounded wait would consume the budget", async () => {
  const timing = fakeTiming();
  let calls = 0;
  const reader = createHttpGetReader({
    label: "slow endpoint",
    url: "https://example.test/value",
    fetchImpl: async () => {
      calls += 1;
      return new Response("busy", { status: 429, headers: { "retry-after": "2" } });
    },
    parse: async (response) => response.text(),
  });

  await assert.rejects(readWithBoundedRetry({ primary: reader }, {
    maxAttempts: 5,
    deadlineMs: 1_500,
    maxRetryAfterMs: 5_000,
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  }), (error: unknown) => {
    assert.ok(error instanceof ReadOnlyDeadlineError);
    assert.equal(error.attempts, 1);
    return true;
  });
  assert.equal(calls, 1);
  assert.deepEqual(timing.sleeps, []);
});

test("deadline aborts an in-flight read even when it never resolves", async () => {
  let observedSignal: AbortSignal | undefined;
  const startedAt = Date.now();
  await assert.rejects(readWithBoundedRetry({
    primary: declareReadOnlyReader("hung read", async ({ signal }) => {
      observedSignal = signal;
      return new Promise<never>(() => undefined);
    }),
  }, {
    deadlineMs: 25,
    maxAttempts: 3,
  }), ReadOnlyDeadlineError);
  assert.equal(observedSignal?.aborted, true);
  assert.ok(Date.now() - startedAt < 500, "deadline must stay wall-clock bounded");
});

test("fallback readers alternate within one shared attempt and deadline budget", async () => {
  const timing = fakeTiming();
  const lanes: string[] = [];
  const primary = declareReadOnlyReader("primary RPC", async ({ lane }) => {
    lanes.push(lane);
    throw Object.assign(new Error("primary reset"), { code: "ECONNRESET" });
  });
  const fallback = declareReadOnlyReader("fallback RPC", async ({ lane }) => {
    lanes.push(lane);
    return "fallback state";
  });

  assert.equal(await readWithBoundedRetry({ primary, fallback }, {
    maxAttempts: 2,
    baseDelayMs: 5,
    jitterRatio: 0,
    now: timing.now,
    sleep: timing.sleep,
  }), "fallback state");
  assert.deepEqual(lanes, ["primary", "fallback"]);
  assert.deepEqual(timing.sleeps, [5]);
});

test("fallback recognizes a retryable HTTP status through a nested read failure", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const nested = new ReadOnlyRetryExhaustedError(
    "nested big-map read",
    4,
    Object.assign(new Error("rate limited"), { status: 429 }),
  );
  const result = await readWithBoundedRetry({
    primary: declareReadOnlyReader("primary projection", async () => {
      primaryCalls += 1;
      throw nested;
    }),
    fallback: declareReadOnlyReader("fallback projection", async () => {
      fallbackCalls += 1;
      return "recovered";
    }),
  }, {
    baseDelayMs: 0,
    maxDelayMs: 0,
    jitterRatio: 0,
  });
  assert.equal(result, "recovered");
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 1);
});

test("fallback is not consulted for a terminal primary failure", async () => {
  let fallbackCalls = 0;
  const terminal = new ReadOnlyHttpStatusError("missing", 404);
  await assert.rejects(readWithBoundedRetry({
    primary: declareReadOnlyReader("primary", async () => { throw terminal; }),
    fallback: declareReadOnlyReader("fallback", async () => {
      fallbackCalls += 1;
      return "wrong";
    }),
  }), (error) => error === terminal);
  assert.equal(fallbackCalls, 0);
});

test("HTTP wrapper can issue only GET with no request body or method override", async () => {
  let receivedInput: string | URL | Request | undefined;
  let receivedInit: RequestInit | undefined;
  const reader = createHttpGetReader({
    label: "GET guard",
    url: "https://example.test/value",
    headers: { accept: "application/json" },
    fetchImpl: async (input, init) => {
      receivedInput = input;
      receivedInit = init;
      return Response.json({ ok: true });
    },
    parse: async (response) => response.json() as Promise<{ ok: boolean }>,
  });

  assert.deepEqual(await readWithBoundedRetry({ primary: reader }), { ok: true });
  assert.equal(String(receivedInput), "https://example.test/value");
  assert.equal(receivedInit?.method, "GET");
  assert.equal(receivedInit?.body, undefined);
  assert.equal((receivedInit?.headers as Record<string, string>).accept, "application/json");

  assert.throws(() => createHttpGetReader({
    label: "override guard",
    url: "https://example.test/value",
    headers: { "X-HTTP-Method-Override": "POST" },
    fetchImpl: async () => new Response("wrong"),
    parse: async (response) => response.text(),
  }), /forbidden.*GET-only/);
});

test("raw callbacks cannot enter the retry loop without an explicit read-only declaration", async () => {
  let calls = 0;
  const rawCallback = async () => {
    calls += 1;
    return "unsafe";
  };

  await assert.rejects(
    readWithBoundedRetry({ primary: rawCallback as never }),
    /declareReadOnlyReader|createHttpGetReader/,
  );
  assert.equal(calls, 0);
});

test("policy bounds reject unbounded attempts, deadlines, Retry-After, and invalid jitter", async () => {
  const reader = declareReadOnlyReader("bounded", async () => "ok");
  const invalid: Array<[string, Record<string, unknown>]> = [
    ["attempts", { maxAttempts: 11 }],
    ["deadline", { deadlineMs: 120_001 }],
    ["Retry-After", { maxRetryAfterMs: 30_001 }],
    ["jitter", { jitterRatio: 1.01 }],
    ["delay order", { baseDelayMs: 500, maxDelayMs: 499 }],
  ];
  for (const [label, options] of invalid) {
    await assert.rejects(
      readWithBoundedRetry({ primary: reader }, options),
      /bounded|must|cannot exceed/,
      label,
    );
  }
});
