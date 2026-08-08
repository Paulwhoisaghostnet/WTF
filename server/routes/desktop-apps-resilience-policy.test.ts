import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("server/routes/desktop-apps.ts", "utf8");
const migrationSource = readFileSync(
  "drizzle/0116_desktop_app_registration_resilience.sql",
  "utf8",
);

test("desktop app admin exposes an all-app registration refresh", () => {
  assert.match(routeSource, /\/api\/admin\/apps\/desktop\/refresh-all/);
  assert.match(routeSource, /DESKTOP_APPS\.map/);
  assert.match(routeSource, /registrationNeverExpires/);
});

test("desktop app permanent-registration policy is deployed additively", () => {
  assert.match(migrationSource, /registration_never_expires/);
  assert.match(migrationSource, /DEFAULT false/);
});
