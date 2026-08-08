#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PASTA_DESKTOP_PROVENANCE_SCHEMA = "wtfos.pasta.desktop-build-provenance.v1";

const SAFE_VALUE_PATTERN = /^[a-z0-9][a-z0-9+._-]{0,127}$/i;

export function parseBuildProvenanceArguments(argv, runtime = process) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) {
      throw new Error(`Unsupported provenance argument: ${argument}`);
    }
    if (values.has(match[1])) {
      throw new Error(`Duplicate provenance argument: --${match[1]}`);
    }
    values.set(match[1], match[2]);
  }

  const allowed = new Set(["app-dir", "mode", "platform", "arch", "format", "output"]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`Unknown provenance option: --${key}`);
  }

  const mode = values.get("mode");
  if (mode !== "preflight" && mode !== "release") {
    throw new Error("Build provenance requires --mode=preflight or --mode=release");
  }

  const platform = requireSafeValue(values.get("platform") || runtime.platform, "platform");
  const architecture = requireSafeValue(values.get("arch") || runtime.arch, "arch");
  const format = requireSafeValue(values.get("format") || "directory", "format");
  const output = values.get("output");
  if (!output || path.isAbsolute(output)) {
    throw new Error("Build provenance requires a relative --output path");
  }

  const appDir = path.resolve(values.get("app-dir") || runtime.cwd());
  const outputPath = path.resolve(appDir, output);
  if (outputPath === appDir || !outputPath.startsWith(`${appDir}${path.sep}`)) {
    throw new Error("Build provenance output must remain inside the desktop app directory");
  }

  return {
    appDir,
    outputPath,
    mode,
    platform,
    architecture,
    format,
  };
}

export function inspectGitSource(appDir, runGit = runGitCommand) {
  const repoRoot = runGit(appDir, ["rev-parse", "--show-toplevel"]);
  const gitSha = runGit(appDir, ["rev-parse", "HEAD"]).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(gitSha)) {
    throw new Error(`Git returned an invalid source revision: ${gitSha}`);
  }

  const status = runGit(appDir, ["status", "--porcelain=v1", "--untracked-files=all"], {
    trim: false,
  });
  const dirty = status.trim().length > 0;
  return {
    repoRoot: path.resolve(repoRoot),
    gitSha,
    dirty,
    revision: dirty ? `${gitSha}-dirty` : gitSha,
  };
}

export function readDesktopPackageIdentity(appDir) {
  const packagePath = path.join(appDir, "package.json");
  const lockPath = path.join(appDir, "package-lock.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const packageLock = JSON.parse(readFileSync(lockPath, "utf8"));

  if (
    typeof packageJson.name !== "string" ||
    typeof packageJson.version !== "string" ||
    typeof packageJson.build?.productName !== "string"
  ) {
    throw new Error(`Desktop package identity is incomplete: ${packagePath}`);
  }

  const lockRoot = packageLock.packages?.[""];
  if (
    packageLock.name !== packageJson.name ||
    packageLock.version !== packageJson.version ||
    lockRoot?.name !== packageJson.name ||
    lockRoot?.version !== packageJson.version
  ) {
    throw new Error(`Desktop package and lockfile identity do not match: ${packageJson.name}`);
  }

  return {
    id: packageJson.name,
    version: packageJson.version,
  };
}

export function createDesktopBuildProvenance({ identity, source, build }) {
  if (build.mode === "release" && source.dirty) {
    throw new Error(
      `Refusing release provenance for dirty source ${source.revision}. Commit or stash every change before building an installer.`,
    );
  }

  return {
    schema: PASTA_DESKTOP_PROVENANCE_SCHEMA,
    app: identity.id,
    version: identity.version,
    gitSha: source.gitSha,
    dirty: source.dirty,
    sourceRevision: source.revision,
    target: {
      platform: build.platform,
      arch: build.architecture,
      format: build.format,
    },
  };
}

export function writeDesktopBuildProvenance(options, dependencies = {}) {
  const identity = (dependencies.readIdentity || readDesktopPackageIdentity)(options.appDir);
  const source = (dependencies.inspectSource || inspectGitSource)(options.appDir);
  const manifest = createDesktopBuildProvenance({
    identity,
    source,
    build: options,
  });

  mkdirSync(path.dirname(options.outputPath), { recursive: true });
  writeFileSync(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function requireSafeValue(value, label) {
  if (!value || !SAFE_VALUE_PATTERN.test(value)) {
    throw new Error(`Build provenance requires a safe --${label} value`);
  }
  return value;
}

function runGitCommand(cwd, args, options = {}) {
  try {
    const output = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return options.trim === false ? output : output.trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim();
    throw new Error(`Unable to inspect Git source provenance: ${detail}`);
  }
}

function main() {
  const options = parseBuildProvenanceArguments(process.argv.slice(2));
  const manifest = writeDesktopBuildProvenance(options);
  const relativeOutput = path.relative(options.appDir, options.outputPath);
  console.log(
    `Wrote ${options.mode} provenance for ${manifest.app}@${manifest.version} (${manifest.sourceRevision}) to ${relativeOutput}`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
