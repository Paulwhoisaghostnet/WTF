import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("server/app.ts", "utf8");
const systemLogsSource = readFileSync("server/routes/system-logs.ts", "utf8");

test("client log route is not exempt from API rate limiting", () => {
  const bypassConfig = appSource.slice(
    appSource.indexOf("const MEDIA_RATE_LIMIT_BYPASS_PREFIXES"),
    appSource.indexOf("function isMediaStreamRequest")
  );

  assert.match(appSource, /const MEDIA_RATE_LIMIT_BYPASS_PREFIXES: readonly string\[\] = \[\]/);
  assert.doesNotMatch(
    bypassConfig,
    /\/api\/system\/logs\/client/
  );
  assert.match(appSource, /skip: shouldSkipApiRateLimit/);
});

test("client log route has endpoint-specific limiter before generic API limiter", () => {
  const clientLogLimiterIndex = appSource.indexOf('"/api/system/logs/client"');
  const genericApiLimiterIndex = appSource.indexOf('"/api/"');

  assert.ok(clientLogLimiterIndex >= 0, "client log limiter mount should exist");
  assert.ok(genericApiLimiterIndex >= 0, "generic API limiter mount should exist");
  assert.ok(
    clientLogLimiterIndex < genericApiLimiterIndex,
    "client log limiter must run before the generic API limiter"
  );
  assert.match(appSource, /max:\s*30/);
  assert.match(appSource, /Too many client log events/);
});

test("client log route keeps route-local limiter and bounded metadata", () => {
  assert.match(systemLogsSource, /clientLogRateLimit/);
  assert.match(systemLogsSource, /boundedClientLogMetadata/);
  assert.match(systemLogsSource, /router\.post\("\/api\/system\/logs\/client", clientLogRateLimit/);
});
