import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Request } from "express";
import { horfApiRateLimitKey, isHorfApiRequest } from "./lib/horf-rate-limit";

const appSource = readFileSync("server/app.ts", "utf8");

test("Horf traffic has its own API limiter mounted after authenticated sessions", () => {
  assert.match(appSource, /if \(isHorfApiRequest\(req\)\) return true;/);
  const auth = appSource.indexOf("await setupAuth(app)");
  const limiter = appSource.indexOf('name: "horf-session"');
  const routes = appSource.indexOf("registerRoutes(app)");
  assert.ok(auth >= 0 && auth < limiter && limiter < routes);
  const block = appSource.slice(limiter, limiter + 330);
  assert.match(block, /max: 200/);
  assert.match(block, /keyGenerator: horfApiRateLimitKey/);
});

test("verified riders behind one IP have separate Horf quotas", () => {
  const base = { ip: "203.0.113.18", originalUrl: "/api/horf/horse/rewards" };
  const riderOne = { ...base, user: { id: 101 } } as unknown as Request;
  const riderTwo = { ...base, user: { id: 202 } } as unknown as Request;
  const guestOne = { ...base, session: { horfWalletAddress: "tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2" } } as unknown as Request;
  const guestTwo = { ...base, session: { horfWalletAddress: "tz1f3gLVMRo5apo4ZGu4vdFh55DoJPziCak9" } } as unknown as Request;
  const anonymous = base as unknown as Request;
  assert.notEqual(horfApiRateLimitKey(riderOne), horfApiRateLimitKey(riderTwo));
  assert.notEqual(horfApiRateLimitKey(guestOne), horfApiRateLimitKey(guestTwo));
  assert.equal(horfApiRateLimitKey(anonymous), base.ip);
});

test("only Horf API paths leave the generic quota", () => {
  assert.equal(isHorfApiRequest({ originalUrl: "/api/horf/open-range?season=current-2026" } as Request), true);
  assert.equal(isHorfApiRequest({ originalUrl: "/api/system/logs/client" } as Request), false);
  assert.equal(isHorfApiRequest({ originalUrl: "/api/horfing" } as Request), false);
});
