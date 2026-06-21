import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const authSource = readFileSync(new URL("./auth-context.tsx", import.meta.url), "utf8");
const walletSource = readFileSync(new URL("./wallet-context.tsx", import.meta.url), "utf8");
const etherlinkSource = readFileSync(new URL("./etherlink/context.tsx", import.meta.url), "utf8");

test("protected API 401s publish an auth-session invalidation boundary", () => {
  assert.match(apiSource, /AUTH_SESSION_INVALID_EVENT = "wtf:auth-session-invalid"/);
  assert.match(apiSource, /shouldSignalAuthSessionInvalid\(path, res\.status\)/);
  assert.match(apiSource, /signalAuthSessionInvalid\(path, requestId\)/);
  assert.match(apiSource, /throw new ApiRequestError\(message, res\.status, path, requestId\)/);
});

test("public auth failures do not globally invalidate the cached user", () => {
  for (const path of [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/wallet/challenge",
    "/api/auth/wallet/verify",
    "/api/auth/wallet/register",
  ]) {
    assert.match(apiSource, new RegExp(JSON.stringify(path)));
  }
});

test("AuthProvider clears cached users and emits the canonical session invalidation event", () => {
  assert.match(authSource, /window\.addEventListener\(AUTH_SESSION_INVALID_EVENT, clearStaleSession\)/);
  assert.match(authSource, /eventType: "auth\.session\.invalidated"/);
  assert.match(authSource, /qc\.setQueryData\(\["auth", "user"\], null\)/);
});

test("passive wallet reconciliation suppresses expected stale-session 401 warnings", () => {
  assert.match(walletSource, /isAuthSessionInvalidError\(err\)/);
  assert.match(etherlinkSource, /isAuthSessionInvalidError\(err\)/);
});
