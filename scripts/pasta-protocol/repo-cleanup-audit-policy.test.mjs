import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/repo-cleanup-audit.mjs", "utf8");

test("Pasta repo cleanup audit is wired as package commands", () => {
  assert.equal(
    packageJson.scripts["pasta:repo-cleanup:audit"],
    "node scripts/pasta-protocol/repo-cleanup-audit.mjs"
  );
  assert.equal(
    packageJson.scripts["pasta:repo-cleanup:audit:check"],
    "node --test scripts/pasta-protocol/repo-cleanup-audit-policy.test.mjs"
  );
});

test("Pasta repo cleanup audit uses current main replay checks", () => {
  assert.match(source, /PASTA_REPO_CLEANUP_BASE_REF/);
  assert.match(source, /origin\/main/);
  assert.match(source, /rev-list", "--left-right", "--count", `\$\{BASE_REF\}\.\.\.\$\{ref\}`/);
  assert.match(source, /merge-base", "--is-ancestor", ref, BASE_REF/);
  assert.match(source, /diff", "--name-status", `\$\{BASE_REF\}\.\.\$\{ref\}`/);
  assert.match(source, /protectedReplayPattern/);
});

test("Pasta repo cleanup audit classifies known stale and promoted branches", () => {
  assert.match(source, /historicalProofBranches/);
  assert.match(source, /codex\/pasta-live-readiness/);
  assert.match(source, /wip\/full-working-tree-20260617/);
  assert.match(source, /promotedAncestorBranches/);
  assert.match(source, /codex\/spaghetti-installer-live/);
  assert.match(source, /codex\/ipfs-pinning-organ/);
  assert.match(source, /codex\/macaroni-v2-full-send/);
  assert.match(source, /historical_evidence_unsafe_to_replay/);
  assert.match(source, /promoted_ancestor/);
});

test("Pasta repo cleanup audit ignores gamma and beta cleanup noise", () => {
  assert.match(source, /const pastaPattern =/);
  assert.match(source, /const ignoredPattern = \/gamma\|beta\/i/);
  assert.match(source, /!ignoredPattern\.test\(branch\)/);
  assert.match(source, /!ignoredPattern\.test\(text\)/);
});

test("Pasta repo cleanup audit is non-destructive", () => {
  assert.doesNotMatch(source, /git", \["branch", "-D"/);
  assert.doesNotMatch(source, /git", \["worktree", "remove"/);
  assert.doesNotMatch(source, /git", \["reset", "--hard"/);
  assert.doesNotMatch(source, /git", \["checkout"/);
  assert.doesNotMatch(source, /rm -rf/);
  assert.match(source, /archive\/delete only after user confirmation/);
});
