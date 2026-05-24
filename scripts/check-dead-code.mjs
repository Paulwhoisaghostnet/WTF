#!/usr/bin/env node
/**
 * check-dead-code.mjs — Lightweight dead-code detector for the WTF monorepo
 *
 * Scans the client src directory for TypeScript/TSX files and reports:
 *   1. Files not imported by any other file in the project
 *      (potential orphans — may be dead code or lazy-loaded entry points)
 *   2. Exported symbols that are not referenced anywhere in the codebase
 *      (exported-but-unused indicators — review before removing)
 *
 * This is a heuristic scan, not a full tree-shaker.  It may produce false
 * positives for:
 *   - Dynamic imports (`import(...)`)
 *   - Re-exports through barrel files
 *   - Entries registered at runtime (route maps, desktop-app registries)
 *
 * Usage:
 *   node scripts/check-dead-code.mjs
 *   node scripts/check-dead-code.mjs --json          # machine-readable output
 *   node scripts/check-dead-code.mjs --threshold=20  # exit non-zero if > N orphans
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const SCAN_DIRS = ["client/src", "server"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.test\./,
  /\.spec\./,
  /\.d\.ts$/,
  /__snapshots__/,
];

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const thresholdArg = args.find((a) => a.startsWith("--threshold="));
const threshold = thresholdArg ? parseInt(thresholdArg.split("=")[1], 10) : null;

// ── File collection ────────────────────────────────────────────────────────

function collectFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (IGNORE_PATTERNS.some((p) => p.test(full))) continue;
      if (entry.isDirectory()) {
        files.push(...collectFiles(full));
      } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name))) {
        files.push(full);
      }
    }
  } catch {
    // directory may not exist — skip silently
  }
  return files;
}

// ── Import reference scanning ─────────────────────────────────────────────

const IMPORT_RE =
  /(?:import|export)\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g;

function extractImports(source) {
  const imports = [];
  let m;
  const re = new RegExp(IMPORT_RE.source, "g");
  while ((m = re.exec(source)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

// ── Export scanning ────────────────────────────────────────────────────────

const EXPORT_RE =
  /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;

function extractExports(source) {
  const names = [];
  let m;
  const re = new RegExp(EXPORT_RE.source, "g");
  while ((m = re.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ── Main analysis ──────────────────────────────────────────────────────────

const allFiles = SCAN_DIRS.flatMap((d) => collectFiles(join(ROOT, d)));
const relFiles = allFiles.map((f) => relative(ROOT, f));

if (!jsonMode) {
  console.log(`Scanning ${allFiles.length} TypeScript files…\n`);
}

// Build import map: which files appear as import targets
const importTargets = new Set();
const allSources = new Map(); // relPath → source text

for (const f of allFiles) {
  let source = "";
  try {
    source = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const rel = relative(ROOT, f);
  allSources.set(rel, source);

  for (const imp of extractImports(source)) {
    // Resolve relative imports to a file path fragment for matching
    if (imp.startsWith(".")) {
      // Store the raw relative string; we'll match by suffix
      importTargets.add(imp.replace(/\.\.\//g, "").replace(/\.\//g, ""));
    } else {
      importTargets.add(imp);
    }
  }
}

// ── Orphan detection ───────────────────────────────────────────────────────

const ENTRY_PATTERNS = [
  /main\.tsx?$/,
  /index\.tsx?$/,
  /App\.tsx?$/,
  /routes\.tsx?$/,
  /routes\/.*\.tsx?$/,
  /server\/index\.ts$/,
  /server\/app\.ts$/,
];

function isLikelyEntry(rel) {
  return ENTRY_PATTERNS.some((p) => p.test(rel));
}

function isReferenced(rel) {
  if (isLikelyEntry(rel)) return true;
  // Strip extension for matching
  const noExt = rel.replace(/\.[^.]+$/, "");
  for (const target of importTargets) {
    if (noExt.endsWith(target) || noExt.includes(target)) return true;
  }
  return false;
}

const orphans = relFiles.filter((rel) => !isReferenced(rel));

// ── Unused export detection ────────────────────────────────────────────────

const unusedExports = [];

for (const [rel, source] of allSources) {
  const exports = extractExports(source);
  for (const name of exports) {
    if (name === "default") continue;
    // Check if any other file references this symbol name
    let found = false;
    for (const [otherRel, otherSrc] of allSources) {
      if (otherRel === rel) continue;
      if (otherSrc.includes(name)) {
        found = true;
        break;
      }
    }
    if (!found) {
      unusedExports.push({ file: rel, name });
    }
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

if (jsonMode) {
  console.log(
    JSON.stringify({ orphanFiles: orphans, unusedExports }, null, 2)
  );
} else {
  console.log(`=== Potentially Orphaned Files (${orphans.length}) ===`);
  if (orphans.length === 0) {
    console.log("  (none detected)");
  } else {
    orphans.forEach((f) => console.log(`  ${f}`));
  }

  console.log(`\n=== Exported-but-Unreferenced Symbols (${unusedExports.length}) ===`);
  if (unusedExports.length === 0) {
    console.log("  (none detected)");
  } else {
    unusedExports.slice(0, 60).forEach(({ file, name }) =>
      console.log(`  ${name}  (${file})`)
    );
    if (unusedExports.length > 60) {
      console.log(`  … and ${unusedExports.length - 60} more`);
    }
  }

  console.log(
    "\nNote: This is a heuristic scan. Dynamic imports, barrel re-exports, and"
  );
  console.log("runtime registrations may cause false positives.");
}

if (threshold !== null && orphans.length > threshold) {
  process.exit(1);
}
