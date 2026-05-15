import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("TV public telemetry write routes use the bounded telemetry limiter", () => {
  const routes = readFileSync("server/features/tv/telemetry-routes.ts", "utf8");
  const limiter = readFileSync("server/features/tv/telemetry.ts", "utf8");

  assert.match(
    routes,
    /router\.post\("\/api\/tv\/telemetry\/item-end",\s*tvTelemetryRateLimit/
  );
  assert.match(
    routes,
    /router\.post\("\/api\/tv\/playback\/events",\s*tvTelemetryRateLimit/
  );
  assert.match(limiter, /createInMemoryRateLimit/);
  assert.match(limiter, /TV_TELEMETRY_RATE_LIMIT_MAX_KEYS/);
});
