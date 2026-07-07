import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("server/app.ts", "utf8");

test("apphost session traffic is exempt from the generic API limiter", () => {
  assert.match(appSource, /function isAppHostSessionRequest\(req: Request\): boolean/);
  assert.match(appSource, /url\.startsWith\("\/api\/apphost\/"\)/);
  assert.match(
    appSource,
    /return isMediaStreamRequest\(req\) \|\| isAppHostSessionRequest\(req\) \|\| isRateLimitExempt\(req\);/,
  );
});

test("apphost has a dedicated per-user rate limiter mounted after auth", () => {
  const authSetupIndex = appSource.indexOf("await setupAuth(app)");
  const apphostLimiterIndex = appSource.indexOf('name: "apphost-session"');

  assert.ok(authSetupIndex >= 0, "auth setup should exist");
  assert.ok(apphostLimiterIndex >= 0, "apphost limiter mount should exist");
  assert.ok(
    apphostLimiterIndex > authSetupIndex,
    "apphost limiter must mount after auth so it can key by user session",
  );

  const mountBlock = appSource.slice(Math.max(0, apphostLimiterIndex - 200), apphostLimiterIndex);
  assert.match(mountBlock, /app\.use\(\s*"\/api\/apphost\/",/);

  const limiterBlock = appSource.slice(apphostLimiterIndex, apphostLimiterIndex + 900);
  assert.match(limiterBlock, /max: 6_000/);
  assert.match(limiterBlock, /keyGenerator: sessionOrIpRateLimitKey/);
});
