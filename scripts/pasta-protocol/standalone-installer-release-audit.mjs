#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const DEFAULT_BASE_URL = "https://wtfos.app";
const DEFAULT_REPOSITORY = "Paulwhoisaghostnet/WTF";

const APPS = [
  {
    key: "gnocchi",
    label: "Gnocchi",
    envPrefix: "GNOCCHI_INSTALLER",
    releaseTag: "gnocchi-desktop-v1.0.0",
    assets: [
      "Gnocchi-Studio-1.0.0-mac-universal.dmg",
      "Gnocchi-Studio-1.0.0-win-x64.exe",
      "Gnocchi-Studio-1.0.0-linux-arm64.deb",
    ],
  },
  {
    key: "ravioli",
    label: "Ravioli",
    envPrefix: "RAVIOLI_INSTALLER",
    releaseTag: "ravioli-desktop-v1.0.0",
    assets: [
      "Ravioli-Studio-1.0.0-mac-universal.dmg",
      "Ravioli-Studio-1.0.0-win-x64.exe",
      "Ravioli-Studio-1.0.0-linux-arm64.deb",
    ],
  },
  {
    key: "rotini",
    label: "Rotini",
    envPrefix: "ROTINI_INSTALLER",
    releaseTag: "rotini-desktop-v1.0.0",
    assets: [
      "Rotini-Studio-1.0.0-mac-universal.dmg",
      "Rotini-Studio-1.0.0-win-x64.exe",
      "Rotini-Studio-1.0.0-linux-arm64.deb",
    ],
  },
  {
    key: "penne",
    label: "Penne",
    envPrefix: "PENNE_INSTALLER",
    releaseTag: "penne-desktop-v1.0.0",
    assets: [
      "Penne-Studio-1.0.0-mac-universal.dmg",
      "Penne-Studio-1.0.0-win-x64.exe",
      "Penne-Studio-1.0.0-linux-arm64.deb",
    ],
  },
  {
    key: "lasagna",
    label: "Lasagna",
    envPrefix: "LASAGNA_INSTALLER",
    releaseTag: "lasagna-desktop-v1.0.0",
    assets: [
      "Lasagna-Studio-1.0.0-mac-universal.dmg",
      "Lasagna-Studio-1.0.0-win-x64.exe",
      "Lasagna-Studio-1.0.0-linux-arm64.deb",
    ],
  },
];

const checks = [];
const blockers = [];

function flag(name, defaultValue) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

const allowBlockers = flag("PASTA_STANDALONE_INSTALLER_AUDIT_ALLOW_BLOCKERS", false);
const checkRemote = flag("PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_REMOTE", true);
const checkLive = flag("PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_LIVE", true);
const runSourcePolicy = flag("PASTA_STANDALONE_INSTALLER_AUDIT_RUN_SOURCE_POLICY", true);
const repository = String(process.env.PASTA_INSTALLER_REPOSITORY || DEFAULT_REPOSITORY).trim();

function baseUrl() {
  const raw = String(
    process.env.PASTA_STANDALONE_INSTALLER_AUDIT_BASE_URL || process.env.WTFOS_BASE_URL || DEFAULT_BASE_URL
  ).trim();
  const url = new URL(raw);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function record(app, name, status, detail = "") {
  const item = { app: app?.key || "all", name, status, detail };
  checks.push(item);
  const prefix = status === "pass" ? "ok" : status;
  const appLabel = app ? `${app.label} ` : "";
  console.log(`[pasta-standalone-installers] ${prefix}: ${appLabel}${name}${detail ? ` - ${detail}` : ""}`);
  if (status === "blocked") blockers.push(item);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertFile(app, path, description) {
  if (!existsSync(path)) {
    record(app, description, "blocked", `${path} is missing`);
    return false;
  }
  return true;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
    ...options,
  });
}

function runPackageScript(app, script) {
  const result = run("npm", ["run", script]);
  if (result.status === 0) {
    record(app, `${script} source policy`, "pass");
    return;
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" | ");
  record(app, `${script} source policy`, "blocked", output || `exit ${result.status ?? "unknown"}`);
}

function ghJson(args) {
  const result = run("gh", [...args, "--repo", repository]);
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    return { ok: false, detail: output || `gh ${args.join(" ")} exited ${result.status ?? "unknown"}` };
  }
  try {
    return { ok: true, value: JSON.parse(result.stdout || "{}") };
  } catch (error) {
    return { ok: false, detail: `failed to parse gh JSON: ${error.message}` };
  }
}

function sha256FromDigest(value) {
  const digest = String(value || "").toLowerCase();
  const sha256 = digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
  return /^[0-9a-f]{64}$/.test(sha256) ? sha256 : "";
}

function checkLocalSource(app) {
  const packagePath = `apps/${app.key}-desktop/package.json`;
  const workflowPath = `.github/workflows/${app.key}-desktop-installers.yml`;
  const routePath = `server/routes/${app.key}-installers.ts`;
  const liveCheckPath = `scripts/check-${app.key}-installers-live.mjs`;
  const policyPath = `scripts/${app.key}-desktop-package-policy.test.mjs`;

  const requiredFiles = [
    [packagePath, "desktop package"],
    [`apps/${app.key}-desktop/package-lock.json`, "desktop package lock"],
    [`apps/${app.key}-desktop/scripts/prepare-assets.mjs`, "asset prepare script"],
    [`apps/${app.key}-desktop/src/main.cjs`, "desktop main process"],
    [`apps/${app.key}-desktop/src/preload.cjs`, "desktop preload"],
    [workflowPath, "installer workflow"],
    [routePath, "installer manifest route"],
    [liveCheckPath, "live installer verifier"],
    [policyPath, "desktop package policy"],
  ];
  const hasAllFiles = requiredFiles.every(([path, description]) => assertFile(app, path, description));
  if (!hasAllFiles) return;

  const desktopPackage = readJson(packagePath);
  if (desktopPackage.version !== "1.0.0") {
    record(app, "desktop package version", "blocked", `expected 1.0.0, got ${desktopPackage.version || "missing"}`);
  } else {
    record(app, "desktop package version", "pass", "1.0.0");
  }

  const rootPackage = readJson("package.json");
  for (const script of [
    `${app.key}:desktop:prepare`,
    `${app.key}:desktop:check`,
    `${app.key}:desktop:dist`,
    `${app.key}:installers:live-check`,
  ]) {
    if (!rootPackage.scripts?.[script]) {
      record(app, "root package script", "blocked", `${script} is missing`);
    }
  }

  const envExample = readFileSync(".env.example", "utf8");
  for (const suffix of [
    "VERSION",
    "MACOS_URL",
    "MACOS_SHA256",
    "WINDOWS_URL",
    "WINDOWS_SHA256",
    "RASPBERRY_PI_URL",
    "RASPBERRY_PI_SHA256",
  ]) {
    const key = `${app.envPrefix}_${suffix}=`;
    if (!envExample.includes(key)) record(app, "env example", "blocked", `${key} is missing`);
  }

  const routesSource = readFileSync("server/routes.ts", "utf8");
  if (!routesSource.includes(`./routes/${app.key}-installers`) || !routesSource.includes(`${app.key}InstallerRoutes`)) {
    record(app, "route registration", "blocked", `server/routes.ts does not register ${app.key}InstallerRoutes`);
  } else {
    record(app, "route registration", "pass", `/api/${app.key}/installers`);
  }

  if (runSourcePolicy) runPackageScript(app, `${app.key}:desktop:check`);
}

function checkRemoteWorkflow(app) {
  if (!checkRemote) {
    record(app, "remote workflow", "skipped", "PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_REMOTE=0");
    return;
  }
  const workflowPath = `${app.key}-desktop-installers.yml`;
  const result = ghJson(["workflow", "view", workflowPath, "--json", "id,name,path,state"]);
  if (!result.ok) {
    record(app, "remote workflow", "blocked", `${workflowPath} is not registered on ${repository}; push/merge the workflow before release dispatch`);
    return;
  }
  const workflow = result.value;
  if (workflow.state !== "active") {
    record(app, "remote workflow", "blocked", `${workflowPath} state is ${workflow.state || "unknown"}`);
    return;
  }
  record(app, "remote workflow", "pass", `${workflow.name || workflowPath} is active`);
}

function checkRelease(app) {
  if (!checkRemote) {
    record(app, "GitHub release", "skipped", "PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_REMOTE=0");
    return;
  }
  const result = ghJson(["release", "view", app.releaseTag, "--json", "tagName,isDraft,isPrerelease,assets,url"]);
  if (!result.ok) {
    record(app, "GitHub release", "blocked", `${app.releaseTag} is missing on ${repository}`);
    return;
  }
  const release = result.value;
  if (release.isDraft || release.isPrerelease) {
    record(app, "GitHub release", "blocked", `${app.releaseTag} is draft/prerelease`);
    return;
  }
  const byName = new Map((release.assets || []).map((asset) => [asset.name, asset]));
  for (const name of app.assets) {
    const asset = byName.get(name);
    if (!asset) {
      record(app, "GitHub release asset", "blocked", `${name} is missing from ${app.releaseTag}`);
      continue;
    }
    const sha256 = sha256FromDigest(asset.digest);
    if (!sha256) {
      record(app, "GitHub release asset", "blocked", `${name} is missing a sha256 digest`);
      continue;
    }
    record(app, "GitHub release asset", "pass", `${name} sha256:${sha256}`);
  }
}

async function checkLiveRoute(app) {
  if (!checkLive) {
    record(app, "production manifest route", "skipped", "PASTA_STANDALONE_INSTALLER_AUDIT_CHECK_LIVE=0");
    return;
  }
  const url = new URL(`/api/${app.key}/installers`, baseUrl());
  let response;
  try {
    response = await fetch(url, { redirect: "manual" });
    await response.body?.cancel();
  } catch (error) {
    record(app, "production manifest route", "blocked", `${url.toString()} fetch failed: ${error.message}`);
    return;
  }
  if (response.status === 401) {
    record(app, "production manifest route", "pass", `${url.pathname} is deployed and auth-protected`);
    return;
  }
  record(app, "production manifest route", "blocked", `${url.pathname} returned HTTP ${response.status}; deploy route and env before live verification`);
}

function printNextSteps() {
  if (blockers.length === 0) return;
  console.log("[pasta-standalone-installers] next: promote the installer workflow/route commits to main before release dispatch.");
  for (const app of APPS) {
    console.log(
      `[pasta-standalone-installers] next: gh workflow run ${app.key}-desktop-installers.yml --repo ${repository} --ref main -f publish_release=true -f release_tag=${app.releaseTag}`
    );
  }
  console.log("[pasta-standalone-installers] next: copy each release asset URL and GitHub sha256 digest into the matching *_INSTALLER_* production env values, redeploy/recreate the app container, then rerun each npm run <app>:installers:live-check with auth.");
}

async function main() {
  console.log(`[pasta-standalone-installers] repository ${repository}`);
  console.log(`[pasta-standalone-installers] target ${baseUrl().origin}`);

  for (const app of APPS) {
    checkLocalSource(app);
    checkRemoteWorkflow(app);
    checkRelease(app);
    await checkLiveRoute(app);
  }

  const ok = blockers.length === 0;
  console.log(JSON.stringify({ ok, allowBlockers, checks, blockers }, null, 2));
  printNextSteps();
  if (!ok && !allowBlockers) process.exit(1);
}

main().catch((error) => {
  console.error(`[pasta-standalone-installers] ${error.stack || error.message}`);
  process.exit(1);
});
