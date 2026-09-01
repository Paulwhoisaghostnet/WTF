import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeOutboundUrl,
  fetchSafeHttp,
  OutboundUrlRejectedError,
  porcupinOutboundPolicy,
} from "./outbound-url";

test("assertSafeOutboundUrl rejects private hosts", () => {
  assert.throws(
    () => assertSafeOutboundUrl("http://127.0.0.1/health"),
    OutboundUrlRejectedError
  );
});

test("assertSafeOutboundUrl rejects credentials in URL", () => {
  assert.throws(
    () => assertSafeOutboundUrl("https://user:pass@example.com/"),
    OutboundUrlRejectedError
  );
});

test("assertSafeOutboundUrl enforces host allowlist", () => {
  assert.throws(
    () =>
      assertSafeOutboundUrl("https://evil.example/ok", {
        hostAllowlist: ["trusted.example"],
      }),
    OutboundUrlRejectedError
  );
  const url = assertSafeOutboundUrl("https://api.trusted.example/v1", {
    hostAllowlist: ["trusted.example"],
  });
  assert.equal(url.hostname, "api.trusted.example");
});

test("porcupinOutboundPolicy requires https in production", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAllow = process.env.PORCUPIN_ALLOW_HTTP;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.PORCUPIN_ALLOW_HTTP;
    const policy = porcupinOutboundPolicy();
    assert.equal(policy.httpsOnly, true);
    assert.throws(
      () => assertSafeOutboundUrl("http://porcupin.example/status", policy),
      OutboundUrlRejectedError
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalAllow === undefined) {
      delete process.env.PORCUPIN_ALLOW_HTTP;
    } else {
      process.env.PORCUPIN_ALLOW_HTTP = originalAllow;
    }
  }
});

test("safe outbound fetch rejects a private redirect before issuing the next request", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), redirect: init?.redirect });
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/internal" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchSafeHttp("https://public.example/start"),
      (error: unknown) =>
        error instanceof OutboundUrlRejectedError &&
        /private or local network hosts/i.test(error.message)
    );
    assert.deepEqual(calls, [
      { url: "https://public.example/start", redirect: "manual" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
