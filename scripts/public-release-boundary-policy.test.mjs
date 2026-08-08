import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { hasJwtShapedCredential } from "./public-release-secret-patterns.mjs";

const policy = JSON.parse(readFileSync("config/public-release-boundary.json", "utf8"));
const checkerSource = readFileSync("scripts/check-public-release-boundary.mjs", "utf8");

function currentReleaseFiles(...roots) {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...roots],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((file) => file && existsSync(file))
    .sort();
}

test("agent governance stays narrow while reviewed release evidence ships under docs", () => {
  assert.deepEqual(policy.publicAgentGovernance, [
    ".agents/docs/live/BUG_BOUNTY_BOARD.md",
    ".agents/docs/live/LESSONS_LEARNED.md",
    ".agents/docs/live/user-interaction-inventory.md",
  ]);
  const publicAgentFiles = currentReleaseFiles(".agents");
  assert.deepEqual(publicAgentFiles, [...policy.publicAgentGovernance].sort());

  assert.deepEqual(policy.publicReleaseEvidence, [
    "docs/reference/wtf-marketplace-v2-mainnet-release-20260724.md",
    "docs/reference/wtfos-contract-registry.md",
  ]);
  const publicReleaseEvidence = currentReleaseFiles(...policy.publicReleaseEvidence);
  assert.deepEqual(publicReleaseEvidence, [...policy.publicReleaseEvidence].sort());
});

test("history scan results are recorded before any rewrite is authorized", () => {
  assert.equal(policy.historyScan.scope, "all refs");
  assert.equal(policy.historyScan.rewritePerformed, false);
  assert.ok(policy.historyScan.findingCount > 0);
  assert.ok(policy.historyScan.highConfidenceHistoricCredentialFindings > 0);
});

test("the shipping checker evaluates the current release candidate, not a stale index", () => {
  assert.match(
    checkerSource,
    /"ls-files", "--cached", "--others", "--exclude-standard", "-z"/,
  );
  assert.match(checkerSource, /file && existsSync\(file\)/);
  assert.match(checkerSource, /isReleaseText && stat\.size > 2_000_000/);
});

test("the shipping checker rejects JWT-shaped browser credentials without storing one in the fixture", () => {
  const syntheticJwt = [
    `eyJ${"header-segment".replace("-", "")}`,
    "payloadsegment",
    "signaturesegment",
  ].join(".");

  assert.equal(hasJwtShapedCredential(syntheticJwt), true);
  assert.equal(hasJwtShapedCredential("Bearer user-owned-session-credential"), false);
  assert.match(checkerSource, /hasJwtShapedCredential\(source\)/);
});
