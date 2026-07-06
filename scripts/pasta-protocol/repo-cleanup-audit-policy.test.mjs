import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/repo-cleanup-audit.mjs", "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${(result.stdout || "")}\n${result.stderr || ""}`.trim()
    );
  }
  return result.stdout.trim();
}

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

test("Pasta repo cleanup audit classifies current dirty work into release lanes", () => {
  assert.match(source, /dirtyLaneMatchers/);
  assert.match(source, /pasta_deploy_release_evidence/);
  assert.match(source, /pasta_evidence_docs/);
  assert.match(source, /remote_apphost_hardening/);
  assert.match(source, /shared_operational_docs/);
  assert.match(source, /repo_cleanup_guardrail/);
  assert.match(source, /unclassified_dirty_work/);
  assert.match(source, /function classifyDirtyWork\(\)/);
  assert.match(source, /gitStatus\(\["status", "--porcelain=v1"\]\)/);
  assert.match(source, /docker-entrypoint\.sh/);
  assert.match(source, /scripts\/pasta-protocol\/live-readiness-gate\.mjs/);
  assert.match(source, /apphost\//);
  assert.match(source, /server\/websocket\.ts/);
  assert.match(source, /BUG_BOUNTY_BOARD\.md/);
  assert.match(source, /scripts\/pasta-protocol\/repo-cleanup-audit\.mjs/);
  assert.match(source, /line\.slice\(2\)\.trimStart\(\)/);
  assert.match(source, /split by hunk when shipping only one release lane/);
});

test("Pasta repo cleanup audit treats tree-equivalent squash branches as prunable", () => {
  assert.match(source, /function hasNoReplayDelta/);
  assert.match(source, /replay\.fileCount === 0/);
  assert.match(source, /replay\.deletedCount === 0/);
  assert.match(source, /promoted_equivalent_squash/);
  assert.match(source, /current main already has the same file tree/);
});

test("Pasta repo cleanup audit proves a zero-delta non-ancestor Pasta ref is squash-equivalent", () => {
  const tempRef = `refs/heads/codex/pasta-zero-delta-fixture-${process.pid}`;
  const commitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "Pasta Cleanup Test",
    GIT_AUTHOR_EMAIL: "pasta-cleanup-test@example.invalid",
    GIT_COMMITTER_NAME: "Pasta Cleanup Test",
    GIT_COMMITTER_EMAIL: "pasta-cleanup-test@example.invalid",
  };

  try {
    const tempCommit = run("git", ["commit-tree", "HEAD^{tree}", "-m", "Pasta zero-delta fixture"], {
      env: commitEnv,
    });
    run("git", ["update-ref", tempRef, tempCommit]);

    const audit = spawnSync("node", ["scripts/pasta-protocol/repo-cleanup-audit.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
      env: {
        ...process.env,
        PASTA_REPO_CLEANUP_BASE_REF: "HEAD",
        PASTA_REPO_CLEANUP_AUDIT_ALLOW_UNKNOWN: "1",
      },
    });

    assert.equal(audit.status, 0, `${audit.stdout}\n${audit.stderr}`);
    const jsonStart = audit.stdout.indexOf("{\n");
    assert.notEqual(jsonStart, -1, audit.stdout);
    const report = JSON.parse(audit.stdout.slice(jsonStart));
    const tempBranch = report.branches.find((branch) => branch.ref === tempRef.replace("refs/heads/", ""));
    assert.ok(tempBranch, audit.stdout);
    assert.equal(tempBranch.ancestor, false);
    assert.equal(tempBranch.replay.fileCount, 0);
    assert.equal(tempBranch.replay.deletedCount, 0);
    assert.equal(tempBranch.replay.shortstat, "");
    assert.equal(tempBranch.classification, "promoted_equivalent_squash");
  } finally {
    spawnSync("git", ["update-ref", "-d", tempRef], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    });
  }
});

test("Pasta repo cleanup audit treats the active branch and remote counterpart as ongoing", () => {
  assert.match(source, /ref === activeRef/);
  assert.match(source, /ref === `origin\/\$\{activeRef\}`/);
  assert.doesNotMatch(source, /codex\/pasta-readiness-catalog-live.*valid_ongoing_work/);
});

test("Pasta repo cleanup audit tolerates refs that disappear during classification", () => {
  const classifyBranchIndex = source.indexOf("function classifyBranch(ref, activeRef)");
  const refStillExistsIndex = source.indexOf("if (!refExists(ref))", classifyBranchIndex);
  const aheadBehindIndex = source.indexOf("const counts = aheadBehind(ref)", classifyBranchIndex);
  assert.notEqual(refStillExistsIndex, -1, "classifyBranch must re-check ref existence");
  assert.ok(
    refStillExistsIndex < aheadBehindIndex,
    "classifyBranch should avoid ahead/behind calls for concurrently deleted refs"
  );
  assert.match(source, /vanished_during_audit/);
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
