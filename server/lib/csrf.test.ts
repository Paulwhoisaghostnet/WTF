import assert from "node:assert/strict";
import test from "node:test";
import {
  createCsrfToken,
  isCsrfExemptRequest,
  isValidCsrfToken,
} from "./csrf";

test("CSRF token validation accepts only the current session token", () => {
  const token = createCsrfToken();
  const rotated = createCsrfToken();

  assert.equal(isValidCsrfToken(token, token), true);
  assert.equal(isValidCsrfToken(rotated, token), false);
  assert.equal(isValidCsrfToken("", token), false);
  assert.equal(isValidCsrfToken(token, ""), false);
});

test("CSRF policy exempts bootstrap and webhook-like routes but protects API writes", () => {
  assert.equal(isCsrfExemptRequest("GET", "/api/w/post"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/auth/login"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/auth/twitter/callback"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/board/webhook/token"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/system/logs/client"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/tv/playback/events"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/tv/telemetry/item-end"), true);
  assert.equal(isCsrfExemptRequest("POST", "/api/w/post"), false);
  assert.equal(isCsrfExemptRequest("DELETE", "/api/media/12"), false);
});
