#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const BASE_REF = String(process.env.PASTA_REPO_CLEANUP_BASE_REF || "origin/main").trim();
const allowUnknown = /^(1|true|yes|on)$/i.test(String(process.env.PASTA_REPO_CLEANUP_AUDIT_ALLOW_UNKNOWN || ""));

const pastaPattern = /pasta|spaghetti|gnocchi|ravioli|rotini|penne|lasagna|macaroni|colander|wtfme|ipfs|pinning/i;
const ignoredPattern = /gamma|beta/i;
const activeBranches = new Set(["codex/pasta-readiness-catalog-live"]);
const historicalProofBranches = new Set([
  "codex/pasta-live-readiness",
  "origin/codex/pasta-live-readiness",
  "wip/full-working-tree-20260617",
]);
const promotedAncestorBranches = new Set([
  "codex/spaghetti-installer-live",
  "origin/codex/spaghetti-installer-live",
  "codex/pasta-installer-audit-docs",
  "codex/ipfs-pinning-organ",
  "codex/macaroni-access-export",
  "codex/macaroni-browser-compat",
  "codex/macaroni-direct-upload-lane",
  "codex/macaroni-drop-repair",
  "codex/macaroni-layout-audit",
  "codex/macaroni-new-drop-controls",
  "codex/macaroni-onboarding-guards",
  "codex/macaroni-practical-media-limits",
  "codex/macaroni-recent-mints",
  "codex/macaroni-v2-full-send",
  "origin/codex/macaroni-onboarding-guards",
  "origin/codex/macaroni-v2-full-send",
]);

const protectedReplayPattern =
  /apps\/.*-desktop|\.github\/workflows\/.*desktop-installers|live-readiness|standalone-installer|colander-action|pasta-protocol\/.*report|wtfme-live|pasta-proof|well-known-policy|server\/routes\/.*installers|shared\/pasta-shadownet-proof-contracts/i;

const checks = [];
const blockers = [];
const warnings = [];

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    ...options,
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail || `exit ${result.status ?? "unknown"}`}`);
  }
  return result.stdout.trim();
}

function gitStatus(args, options = {}) {
  return spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    ...options,
  });
}

function record(name, status, detail = "") {
  const item = { name, status, detail };
  checks.push(item);
  const prefix = status === "pass" ? "ok" : status;
  console.log(`[pasta-repo-cleanup] ${prefix}: ${name}${detail ? ` - ${detail}` : ""}`);
  if (status === "blocked") blockers.push(item);
  if (status === "warn") warnings.push(item);
}

function refExists(ref) {
  return gitStatus(["show-ref", "--verify", "--quiet", `refs/heads/${ref}`]).status === 0 ||
    gitStatus(["show-ref", "--verify", "--quiet", `refs/remotes/${ref}`]).status === 0 ||
    gitStatus(["rev-parse", "--verify", "--quiet", ref]).status === 0;
}

function currentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function currentHead() {
  return git(["rev-parse", "HEAD"]);
}

function branchList() {
  return git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((branch) => branch !== "origin")
    .filter((branch) => pastaPattern.test(branch))
    .filter((branch) => !ignoredPattern.test(branch))
    .sort();
}

function aheadBehind(ref) {
  const output = git(["rev-list", "--left-right", "--count", `${BASE_REF}...${ref}`]);
  const [baseAhead, branchAhead] = output.split(/\s+/).map((value) => Number(value));
  return { baseAhead, branchAhead };
}

function isAncestor(ref) {
  return gitStatus(["merge-base", "--is-ancestor", ref, BASE_REF]).status === 0;
}

function shortstat(ref) {
  return gitStatus(["diff", "--shortstat", `${BASE_REF}..${ref}`]).stdout.trim();
}

function replaySummary(ref) {
  const output = gitStatus(["diff", "--name-status", `${BASE_REF}..${ref}`]).stdout.trim();
  const entries = output ? output.split("\n") : [];
  const deleted = entries.filter((line) => line.startsWith("D\t"));
  const protectedDeletes = deleted
    .map((line) => line.slice(2))
    .filter((path) => protectedReplayPattern.test(path))
    .slice(0, 12);
  return {
    fileCount: entries.length,
    deletedCount: deleted.length,
    shortstat: shortstat(ref),
    protectedDeletes,
  };
}

function classifyBranch(ref, activeRef) {
  const counts = aheadBehind(ref);
  const ancestor = isAncestor(ref);
  const replay = replaySummary(ref);
  let classification = "needs_manual_review";
  let action = "inspect before keeping or archiving";
  let status = "blocked";

  if (activeBranches.has(ref) || ref === activeRef) {
    classification = "valid_ongoing_work";
    action = "continue from this live-base readiness hardening worktree";
    status = "pass";
  } else if (ancestor || promotedAncestorBranches.has(ref)) {
    classification = "promoted_ancestor";
    action = "archive/delete only after user confirmation; no commits ahead of current main";
    status = "pass";
  } else if (historicalProofBranches.has(ref)) {
    classification = "historical_evidence_unsafe_to_replay";
    action = "keep as evidence only; mine ideas manually against current main";
    status = "pass";
  }

  const item = {
    ref,
    baseRef: BASE_REF,
    aheadBehind: counts,
    ancestor,
    classification,
    action,
    replay,
  };

  const detail = `${classification}; ${counts.baseAhead} behind current main / ${counts.branchAhead} ahead; ${replay.shortstat || "no file delta"}`;
  if (status === "blocked" && allowUnknown) {
    record(`branch ${ref}`, "warn", detail);
  } else {
    record(`branch ${ref}`, status, detail);
  }
  return item;
}

function parseWorktrees() {
  const lines = git(["worktree", "list", "--porcelain"]).split("\n");
  const worktrees = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length), branch: null, head: null };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  if (current) worktrees.push(current);
  return worktrees;
}

function dirtyCount(path) {
  const result = gitStatus(["-C", path, "status", "--short"]);
  if (result.status !== 0) return null;
  return result.stdout.split("\n").filter((line) => line.trim()).length;
}

function classifyWorktrees(activeRef) {
  return parseWorktrees()
    .filter((worktree) => {
      const text = `${worktree.path} ${worktree.branch || ""}`;
      return pastaPattern.test(text) && !ignoredPattern.test(text);
    })
    .map((worktree) => {
      const dirty = dirtyCount(worktree.path);
      let classification = "pasta_related_reference";
      let action = "inspect before deleting";
      if (worktree.branch === activeRef) {
        classification = "valid_ongoing_worktree";
        action = "continue current readiness hardening here";
      } else if (worktree.branch === "codex/pasta-live-readiness") {
        classification = "historical_evidence_worktree";
        action = "keep as evidence only; do not merge wholesale";
      } else if (promotedAncestorBranches.has(worktree.branch || "")) {
        classification = "promoted_ancestor_worktree";
        action = "archive/delete only after user confirmation";
      }
      record(`worktree ${worktree.path}`, "pass", `${classification}; dirty=${dirty ?? "unknown"}`);
      return { ...worktree, dirtyCount: dirty, classification, action };
    });
}

function ensureExpectedRefs() {
  for (const ref of ["codex/pasta-live-readiness", "wip/full-working-tree-20260617"]) {
    if (refExists(ref)) {
      record(`expected historical ref ${ref}`, "pass", "present for audit classification");
    } else {
      record(`expected historical ref ${ref}`, "warn", "missing locally; stale-work audit cannot re-check replay risk for it");
    }
  }
}

function main() {
  const activeRef = currentBranch();
  const head = currentHead();
  const originMain = git(["rev-parse", BASE_REF]);
  console.log(`[pasta-repo-cleanup] base ${BASE_REF} ${originMain}`);
  console.log(`[pasta-repo-cleanup] active ${activeRef} ${head}`);
  ensureExpectedRefs();

  const branches = branchList().map((ref) => classifyBranch(ref, activeRef));
  const worktrees = classifyWorktrees(activeRef);
  const unknownBranches = branches.filter((branch) => branch.classification === "needs_manual_review");
  if (unknownBranches.length > 0 && !allowUnknown) {
    record(
      "unknown Pasta branch review",
      "blocked",
      `${unknownBranches.map((branch) => branch.ref).join(", ")} need manual classification or PASTA_REPO_CLEANUP_AUDIT_ALLOW_UNKNOWN=1`
    );
  }

  const ok = blockers.length === 0;
  console.log(JSON.stringify({
    ok,
    allowUnknown,
    baseRef: BASE_REF,
    baseHead: originMain,
    activeRef,
    activeHead: head,
    checks,
    warnings,
    blockers,
    branches,
    worktrees,
  }, null, 2));
  if (!ok) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`[pasta-repo-cleanup] ${error.stack || error.message}`);
  process.exit(1);
}
