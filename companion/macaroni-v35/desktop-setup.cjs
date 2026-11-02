"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const SAFE_SETUP_FILES = Object.freeze([
  ["README.md", "standalone-companion/README.md"],
  ["API.md", "standalone-companion/API.md"],
  ["BACKUP_RECOVERY.md", "standalone-companion/BACKUP_RECOVERY.md"],
  [".dockerignore", "standalone-companion/.dockerignore"],
  [".env.example", "standalone-companion/.env.example"],
  ["Dockerfile", "standalone-companion/Dockerfile"],
  ["compose.yaml", "standalone-companion/compose.yaml"],
  ["package.json", "standalone-companion/package.json"],
  ["package-lock.json", "standalone-companion/package-lock.json"],
]);
const SAFE_SETUP_DIRECTORIES = Object.freeze(["contract", "scripts", "src", "templates"]);
const FORBIDDEN_SEGMENTS = new Set(["data", "node_modules", "secrets"]);
const FORBIDDEN_FILE_NAMES = new Set([".env", "admin.token", "finalizer.key", "master.key"]);

function assertInside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its approved root`);
  }
}

function assertSafeRelativePath(relative) {
  const segments = String(relative).split(/[\\/]+/).filter(Boolean).map((segment) => segment.toLowerCase());
  if (!segments.length || segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))
    || FORBIDDEN_FILE_NAMES.has(segments.at(-1))) {
    throw new Error("Companion setup copy rejected a private path");
  }
}

async function copyApprovedFile(sourceRoot, destinationRoot, fromRelative, toRelative) {
  assertSafeRelativePath(fromRelative === ".env.example" ? "env.example" : fromRelative);
  assertSafeRelativePath(toRelative === "standalone-companion/.env.example"
    ? "standalone-companion/env.example"
    : toRelative);
  const source = path.resolve(sourceRoot, fromRelative);
  const destination = path.resolve(destinationRoot, toRelative);
  assertInside(sourceRoot, source, "Companion setup source");
  assertInside(destinationRoot, destination, "Companion setup destination");
  const info = await fsp.lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Companion setup copy accepts regular files only");
  await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fsp.copyFile(source, destination);
  await fsp.chmod(destination, fromRelative.startsWith("scripts/") ? 0o700 : 0o600).catch(() => undefined);
}

async function copyApprovedDirectory(sourceRoot, destinationRoot, relative) {
  assertSafeRelativePath(relative);
  const source = path.resolve(sourceRoot, relative);
  const entries = await fsp.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("Companion setup copy rejects symbolic links");
    const child = path.join(relative, entry.name);
    assertSafeRelativePath(child);
    if (entry.isDirectory()) await copyApprovedDirectory(sourceRoot, destinationRoot, child);
    else if (entry.isFile()) await copyApprovedFile(sourceRoot, destinationRoot, child, path.join("standalone-companion", child));
    else throw new Error("Companion setup copy accepts regular files and directories only");
  }
}

async function prepareDesktopSetupKit({ companionRoot, destinationRoot }) {
  const sourceRoot = path.resolve(companionRoot);
  const targetRoot = path.resolve(destinationRoot);
  if (!fs.existsSync(path.join(sourceRoot, "DESKTOP_SETUP.md"))) {
    throw new Error("Macaroni desktop setup guide is missing from this application build");
  }
  await fsp.mkdir(targetRoot, { recursive: true, mode: 0o700 });
  await copyApprovedFile(sourceRoot, targetRoot, "DESKTOP_SETUP.md", "README.md");
  for (const [fromRelative, toRelative] of SAFE_SETUP_FILES) {
    await copyApprovedFile(sourceRoot, targetRoot, fromRelative, toRelative);
  }
  for (const relative of SAFE_SETUP_DIRECTORIES) {
    await copyApprovedDirectory(sourceRoot, targetRoot, relative);
  }
  await fsp.chmod(targetRoot, 0o700).catch(() => undefined);
  return { guidePath: path.join(targetRoot, "README.md") };
}

module.exports = {
  SAFE_SETUP_DIRECTORIES,
  SAFE_SETUP_FILES,
  prepareDesktopSetupKit,
};
