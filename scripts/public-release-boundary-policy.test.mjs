import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = JSON.parse(readFileSync("config/public-release-boundary.json", "utf8"));

test("only the three executable governance documents remain public under .agents", () => {
  assert.deepEqual(policy.publicAgentGovernance, [
    ".agents/docs/live/BUG_BOUNTY_BOARD.md",
    ".agents/docs/live/LESSONS_LEARNED.md",
    ".agents/docs/live/user-interaction-inventory.md",
  ]);
  const trackedAgentFiles = execFileSync("git", ["ls-files", ".agents"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(trackedAgentFiles, [...policy.publicAgentGovernance].sort());
});

test("history scan results are recorded before any rewrite is authorized", () => {
  assert.equal(policy.historyScan.scope, "all refs");
  assert.equal(policy.historyScan.rewritePerformed, false);
  assert.ok(policy.historyScan.findingCount > 0);
  assert.ok(policy.historyScan.highConfidenceHistoricCredentialFindings > 0);
});
