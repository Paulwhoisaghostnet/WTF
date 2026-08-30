import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const creatorSource = readFileSync(
  "server/features/in-app-market/creator-items.ts",
  "utf8"
);
const routeSource = readFileSync("server/routes/in-app-market.ts", "utf8");
const adminSource = readFileSync(
  "server/features/admin/in-app-market-routes.ts",
  "utf8"
);

test("trusted creator Store items stay private while awaiting operator review", () => {
  assert.match(creatorSource, /active:\s*false/);
  assert.match(creatorSource, /submissionStatus:\s*"submitted"/);
  assert.match(creatorSource, /creatorUserId:\s*user\.id/);
  assert.match(routeSource, /\/api\/in-app-market\/creator-items\/mine/);
  assert.match(routeSource, /wtfiam\.creator_item\.created/);
});

test("operator review explicitly approves or rejects creator Store submissions", () => {
  assert.match(adminSource, /reviewStatus:\s*z\.enum\(\["approved",\s*"rejected"\]\)/);
  assert.match(adminSource, /updates\.active\s*=\s*parsed\.data\.reviewStatus\s*===\s*"approved"/);
  assert.match(adminSource, /wtfiam\.creator_item\.reviewed/);
  assert.match(adminSource, /reviewNote/);
});
