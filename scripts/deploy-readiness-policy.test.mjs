import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

test("Hetzner deploy accepts the readiness contract it probes", () => {
  assert.match(deployWorkflow, /curl -sf http:\/\/localhost:3000\/api\/health\/ready/);
  assert.match(deployWorkflow, /grep -q '\"status\":\"ready\"'/);
  assert.doesNotMatch(deployWorkflow, /grep -q '\"status\":\"ok\"'/);
});
