#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const BASE_REF = String(process.env.PASTA_REPO_CLEANUP_BASE_REF || "origin/main").trim();
const allowUnknown = /^(1|true|yes|on)$/i.test(String(process.env.PASTA_REPO_CLEANUP_AUDIT_ALLOW_UNKNOWN || ""));

const pastaPattern = /pasta|spaghetti|gnocchi|ravioli|rotini|penne|lasagna|macaroni|colander|wtfme|ipfs|pinning/i;
const ignoredPattern = /gamma|beta/i;
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

const dirtyLaneMatchers = [
  {
    lane: "pasta_deploy_release_evidence",
    action: "valid ongoing Pasta/deploy guardrail; verify and promote separately from apphost",
    matches: (path) =>
      [
        "docker-entrypoint.sh",
        "package.json",
        "scripts/deploy-dry-run-policy.test.mjs",
        "scripts/pasta-protocol/live-readiness-gate.mjs",
        "scripts/pasta-protocol/live-readiness-gate-policy.test.mjs",
      ].includes(path),
  },
  {
    lane: "pasta_evidence_docs",
    action: "valid ongoing Pasta release evidence; keep current with live readiness blockers",
    matches: (path) =>
      [
        ".agents/docs/live/PASTA_LIVE_READINESS_MATRIX.md",
        ".agents/docs/live/PASTA_REPO_CLEANUP_AUDIT.md",
        ".agents/docs/live/PASTA_WTFME_LIVE_PUBLISH_RUNBOOK.md",
        "PASTA_PROTOCOL_COVERAGE_REPORT.md",
      ].includes(path),
  },
  {
    lane: "remote_apphost_hardening",
    action: "valid ongoing Remote Applications/apphost work; verify and promote separately unless intentionally bundled",
    matches: (path) =>
      path.startsWith("apphost/") ||
      path.startsWith("server/features/apphost/") ||
      path === "server/routes/apphost.ts" ||
      path === "server/websocket.ts" ||
      path === "server/websocket-apphost-input-policy.test.ts" ||
      path === "client/src/pages/Applications.tsx" ||
      path === "client/src/pages/ApplicationSession.tsx" ||
      path === "client/src/pages/application-session-policy.test.ts" ||
      path === "client/src/pages/applications-policy.test.ts" ||
      path === "client/src/pages/applications-presentation-policy.test.ts" ||
      path === "client/src/routes/page-defs.ts" ||
      path === "client/src/features/admin-os/admin-surface-registry.ts" ||
      path === "tests/e2e/inventory/behavior-assertions.mjs" ||
      path === ".gitignore",
  },
  {
    lane: "shared_operational_docs",
    action: "mixed operational evidence; split by hunk when shipping only one release lane",
    matches: (path) =>
      [
        ".agents/docs/live/BUG_BOUNTY_BOARD.md",
        ".agents/docs/live/LESSONS_LEARNED.md",
        ".agents/docs/live/user-interaction-inventory.md",
      ].includes(path),
  },
  {
    lane: "repo_cleanup_guardrail",
    action: "valid ongoing repo-cleanup audit guardrail; keep it with cleanup evidence refreshes",
    matches: (path) =>
      [
        "scripts/pasta-protocol/repo-cleanup-audit.mjs",
        "scripts/pasta-protocol/repo-cleanup-audit-policy.test.mjs",
      ].includes(path),
  },
];

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

function hasNoReplayDelta(replay) {
  return replay.fileCount === 0 && replay.deletedCount === 0 && !replay.shortstat;
}

function classifyBranch(ref, activeRef) {
  if (!refExists(ref)) {
    const item = {
      ref,
      baseRef: BASE_REF,
      aheadBehind: null,
      ancestor: null,
      classification: "vanished_during_audit",
      action: "no current ref to inspect; rerun audit if this was unexpected",
      replay: {
        fileCount: 0,
        deletedCount: 0,
        shortstat: "",
        protectedDeletes: [],
      },
    };
    record(`branch ${ref}`, "warn", `${item.classification}; ref disappeared before classification`);
    return item;
  }

  const counts = aheadBehind(ref);
  const ancestor = isAncestor(ref);
  const replay = replaySummary(ref);
  let classification = "needs_manual_review";
  let action = "inspect before keeping or archiving";
  let status = "blocked";

  if (ref === activeRef || ref === `origin/${activeRef}`) {
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
  } else if (hasNoReplayDelta(replay)) {
    classification = "promoted_equivalent_squash";
    action = "delete/prune after verification; current main already has the same file tree";
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

function dirtyStatusEntries() {
  const output = gitStatus(["status", "--porcelain=v1"]).stdout.trim();
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(2).trimStart();
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() : rawPath;
      return { status, path };
    })
    .filter((entry) => entry.path);
}

function classifyDirtyPath(path) {
  const lane = dirtyLaneMatchers.find((matcher) => matcher.matches(path));
  if (!lane) {
    return {
      path,
      lane: "unclassified_dirty_work",
      action: "inspect before release; classify as ongoing, stale, or unrelated before pushing live",
    };
  }
  return { path, lane: lane.lane, action: lane.action };
}

function classifyDirtyWork() {
  const entries = dirtyStatusEntries().map((entry) => ({
    ...entry,
    ...classifyDirtyPath(entry.path),
  }));
  if (entries.length === 0) {
    record("dirty work split", "pass", "working tree is clean");
    return entries;
  }

  const lanes = new Map();
  for (const entry of entries) {
    const list = lanes.get(entry.lane) || [];
    list.push(entry.path);
    lanes.set(entry.lane, list);
  }

  for (const [lane, paths] of lanes) {
    if (lane === "unclassified_dirty_work") {
      record("dirty work split", "blocked", `${paths.length} unclassified dirty paths: ${paths.slice(0, 12).join(", ")}`);
    } else {
      record("dirty work split", "warn", `${lane}: ${paths.length} paths`);
    }
  }
  return entries;
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
  const dirtyWork = classifyDirtyWork();
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
    dirtyWork,
  }, null, 2));
  if (!ok) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`[pasta-repo-cleanup] ${error.stack || error.message}`);
  process.exit(1);
}
