#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_BASE_URL = "https://wtfos.app";
const PASTA_APPS = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];
const STATIC_TEZOS_APPS = ["macaroni", ...PASTA_APPS];

function flag(name, defaultValue) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

const allowBlockers = flag("PASTA_LIVE_READINESS_ALLOW_BLOCKERS", false);
const finalLaunch = flag("PASTA_LIVE_READINESS_FINAL_LAUNCH", false);
const checkWtfme = flag("PASTA_LIVE_READINESS_CHECK_WTFME", true);
const checkStatic = flag("PASTA_LIVE_READINESS_CHECK_STATIC", true);
const checkInstallers = flag("PASTA_LIVE_READINESS_CHECK_INSTALLERS", true);
const checkColanderProof = flag("PASTA_LIVE_READINESS_CHECK_COLANDER_PROOF", true);
const checkRepoCleanup = flag("PASTA_LIVE_READINESS_CHECK_REPO_CLEANUP", true);
const host = String(process.env.PASTA_WTFME_LIVE_HOST || "").trim().toLowerCase();
const checks = [];
const blockers = [];
const WTFME_CREDENTIAL_DETAIL =
  "provision a dedicated Pasta WTF.ME account with a claimed/publishable .wtfos.me host, active WTFOS DID/repo, linked Tezos wallet, and WTF Pin Collector permission; set PASTA_WTFME_LIVE_COOKIE or PASTA_WTFME_LIVE_USERNAME/PASTA_WTFME_LIVE_PASSWORD for a dry-run/publish pass";

function baseUrl() {
  const raw = String(process.env.PASTA_LIVE_READINESS_BASE_URL || process.env.WTFOS_BASE_URL || DEFAULT_BASE_URL).trim();
  const url = new URL(raw);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function record(name, status, detail) {
  checks.push({ name, status, detail });
  const prefix = status === "pass" ? "ok" : status;
  console.log(`[pasta-live-readiness] ${prefix}: ${name}${detail ? ` - ${detail}` : ""}`);
}

function block(name, detail) {
  blockers.push({ name, detail });
  record(name, "blocked", detail);
}

function runPackageScriptResult(script, env = {}) {
  const result = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
  });
  if (result.status === 0) return { ok: true };
  const lines = `${result.stdout || ""}\n${result.stderr || ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    ok: false,
    detail: `${script} failed: ${lines.slice(-8).join(" | ") || `exit ${result.status ?? "unknown"}`}`,
  };
}

function runPackageScript(script, env = {}) {
  const result = runPackageScriptResult(script, env);
  if (result.ok) return;
  throw new Error(result.detail);
}

function parseJsonObjectFromOutput(output, label) {
  const text = String(output || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`${label} did not emit a JSON object`);
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new Error(`${label} emitted invalid JSON: ${error.message}`);
  }
}

function blockedCheckDetails(checks) {
  return checks
    .filter((check) => check?.status === "blocked")
    .map((check) => `${check.name}: ${check.detail}`)
    .slice(0, 4)
    .join("; ");
}

function checkFinalLaunchGuardrails() {
  if (!finalLaunch) return;

  const violations = [];
  if (allowBlockers) {
    violations.push("cannot be combined with PASTA_LIVE_READINESS_ALLOW_BLOCKERS=1");
  }
  if (!checkRepoCleanup) violations.push("requires PASTA_LIVE_READINESS_CHECK_REPO_CLEANUP=1");
  if (!checkStatic) violations.push("requires PASTA_LIVE_READINESS_CHECK_STATIC=1");
  if (!checkInstallers) violations.push("requires PASTA_LIVE_READINESS_CHECK_INSTALLERS=1");
  if (!checkColanderProof) violations.push("requires PASTA_LIVE_READINESS_CHECK_COLANDER_PROOF=1");
  if (!checkWtfme) violations.push("requires PASTA_LIVE_READINESS_CHECK_WTFME=1");

  if (violations.length > 0) {
    block("final launch mode", violations.join("; "));
    return;
  }

  record(
    "final launch mode",
    "pass",
    "blockers are fatal and repo cleanup, static, installer, Colander, and WTF.ME probes are enabled"
  );
}

async function fetchText(pathname) {
  const url = new URL(pathname, baseUrl());
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-live-readiness-gate" },
    redirect: "manual",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url.toString()} returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  return { url, text };
}

async function fetchStatus(pathname) {
  const url = new URL(pathname, baseUrl());
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-live-readiness-gate" },
    redirect: "manual",
  });
  const text = await response.text().catch(() => "");
  return { url, status: response.status, text };
}

async function checkHealth() {
  const { text } = await fetchText("/api/health");
  const health = JSON.parse(text);
  if (health.status !== "ok" || health.ok !== true) {
    throw new Error(`/api/health is not ok: ${text.slice(0, 240)}`);
  }
  if (health.version?.nodeEnv !== "production") {
    throw new Error(`/api/health did not report production nodeEnv: ${health.version?.nodeEnv || "missing"}`);
  }
  record("live health", "pass", `commit ${health.version?.commitRef || "unknown"}, chain ${health.chain?.network || "unknown"}`);
}

function checkRepoCleanupAudit() {
  if (!checkRepoCleanup) {
    record("repo cleanup audit", "skipped", "PASTA_LIVE_READINESS_CHECK_REPO_CLEANUP=0");
    return;
  }
  const result = runPackageScriptResult("pasta:repo-cleanup:audit");
  if (result.ok) {
    record("repo cleanup audit", "pass", "Pasta branches/worktrees classified against current origin/main");
    return;
  }
  block("repo cleanup audit", result.detail);
}

async function checkStaticBundles() {
  if (!checkStatic) {
    record("static bundle probes", "skipped", "PASTA_LIVE_READINESS_CHECK_STATIC=0");
    return;
  }
  for (const app of STATIC_TEZOS_APPS) {
    const { text } = await fetchText(`/creation-tools/${app}/vendor/tezos.js`);
    if (text.includes("24.3.0")) throw new Error(`${app} vendor bundle still contains Taquito 24.3.0`);
    if (text.includes("rpc.shadownet.teztnets.com")) throw new Error(`${app} vendor bundle still contains legacy teztnets RPC`);
    if (!text.includes("25.0.0")) throw new Error(`${app} vendor bundle is missing Taquito 25.0.0 marker`);
    record(`${app} Tezos vendor`, "pass", "Taquito 25 marker present");
  }
  for (const app of PASTA_APPS) {
    const { text } = await fetchText(`/creation-tools/${app}/js/common.js`);
    for (const marker of ["window.MD", "consumeCheaseHandoff", "loadPlatformCapabilities"]) {
      if (!text.includes(marker)) throw new Error(`${app} common.js is missing ${marker}`);
    }
    record(`${app} shared Pasta runtime`, "pass", "window.MD and handoff markers present");
  }
}

function checkInstallerDownloads() {
  if (!checkInstallers) {
    record("installer download probes", "skipped", "PASTA_LIVE_READINESS_CHECK_INSTALLERS=0");
    return;
  }
  const installers = [
    {
      name: "Macaroni Desktop installers",
      script: "macaroni:installers:live-check",
      env: { WTFOS_INSTALLER_REQUIRE_AUTH: "0" },
    },
    {
      name: "Pasta Suite installers",
      script: "pasta-suite:installers:live-check",
      env: { PASTA_SUITE_INSTALLER_REQUIRE_AUTH: "0" },
    },
    {
      name: "Spaghetti Desktop installers",
      script: "spaghetti:installers:live-check",
      env: { SPAGHETTI_INSTALLER_REQUIRE_AUTH: "0" },
    },
  ];
  for (const installer of installers) {
    runPackageScript(installer.script, installer.env);
    record(installer.name, "pass", "protected manifest and public release assets verified");
  }

  const individualInstallers = [
    {
      name: "Gnocchi Desktop standalone installers",
      script: "gnocchi:installers:live-check",
      env: { GNOCCHI_INSTALLER_REQUIRE_AUTH: "0" },
      releaseTag: "gnocchi-desktop-v1.0.0",
      envPrefix: "GNOCCHI_INSTALLER",
    },
    {
      name: "Ravioli Desktop standalone installers",
      script: "ravioli:installers:live-check",
      env: { RAVIOLI_INSTALLER_REQUIRE_AUTH: "0" },
      releaseTag: "ravioli-desktop-v1.0.0",
      envPrefix: "RAVIOLI_INSTALLER",
    },
    {
      name: "Rotini Desktop standalone installers",
      script: "rotini:installers:live-check",
      env: { ROTINI_INSTALLER_REQUIRE_AUTH: "0" },
      releaseTag: "rotini-desktop-v1.0.0",
      envPrefix: "ROTINI_INSTALLER",
    },
    {
      name: "Penne Desktop standalone installers",
      script: "penne:installers:live-check",
      env: { PENNE_INSTALLER_REQUIRE_AUTH: "0" },
      releaseTag: "penne-desktop-v1.0.0",
      envPrefix: "PENNE_INSTALLER",
    },
    {
      name: "Lasagna Desktop standalone installers",
      script: "lasagna:installers:live-check",
      env: { LASAGNA_INSTALLER_REQUIRE_AUTH: "0" },
      releaseTag: "lasagna-desktop-v1.0.0",
      envPrefix: "LASAGNA_INSTALLER",
    },
  ];
  for (const installer of individualInstallers) {
    const result = runPackageScriptResult(installer.script, installer.env);
    if (result.ok) {
      record(installer.name, "pass", "protected manifest and public release assets verified");
      continue;
    }
    block(
      installer.name,
      `${result.detail}; publish ${installer.releaseTag}, configure ${installer.envPrefix}_* production env, deploy the manifest route, and rerun npm run ${installer.script}`
    );
  }
}

async function checkInstallerCatalogRoute() {
  if (!checkInstallers) {
    record("Pasta installer catalog", "skipped", "PASTA_LIVE_READINESS_CHECK_INSTALLERS=0");
    return;
  }
  const { status, text } = await fetchStatus("/api/pasta/installers/catalog");
  if (status === 401) {
    record("Pasta installer catalog", "pass", "/api/pasta/installers/catalog is deployed and auth-protected");
    return;
  }
  block(
    "Pasta installer catalog",
    `/api/pasta/installers/catalog returned HTTP ${status}; expected an auth-protected 401 before claiming unified suite plus individual installer downloads${text ? ` (${text.slice(0, 120)})` : ""}`
  );
}

function checkRecordedColanderActionProof() {
  if (!checkColanderProof) {
    record("recorded Colander Shadownet action proof", "skipped", "PASTA_LIVE_READINESS_CHECK_COLANDER_PROOF=0");
    return;
  }
  runPackageScript("pasta:shadownet:colander:action-proof");
  record("recorded Colander Shadownet action proof", "pass", "TzKT indexed operation verified without signer execution");
}

function credentialState() {
  const hasCookie = Boolean(String(process.env.PASTA_WTFME_LIVE_COOKIE || "").trim());
  const hasUserPass =
    Boolean(String(process.env.PASTA_WTFME_LIVE_USERNAME || "").trim()) &&
    Boolean(String(process.env.PASTA_WTFME_LIVE_PASSWORD || ""));
  return { hasCookie, hasUserPass };
}

function checkWtfmePublishDryRun() {
  const { hasCookie, hasUserPass } = credentialState();
  if (hasCookie || hasUserPass) {
    record("local WTF.ME publish credentials", "pass", hasCookie ? "cookie env present" : "username/password env present");
  } else {
    block(
      "local WTF.ME publish credentials",
      WTFME_CREDENTIAL_DETAIL
    );
    return;
  }

  const env = {
    ...process.env,
    PASTA_WTFME_LIVE_PUBLISH: "0",
    PASTA_WTFME_LIVE_VERIFY_AFTER_PUBLISH: "0",
  };
  if (host) env.PASTA_WTFME_LIVE_EXPECT_HOST = host;

  const result = spawnSync("npm", ["run", "pasta:wtfme:live-publish"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
  });
  if (result.status === 0) {
    record(
      "WTF.ME publish dry-run",
      "pass",
      host ? `credentials authenticate and resolve to ${host}` : "credentials authenticate and resolve a WTF.ME host"
    );
    return;
  }

  const lines = `${result.stdout || ""}\n${result.stderr || ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const focused =
    lines.find((line) => line.includes("authenticated user resolves")) ||
    lines.find((line) => line.includes("Refusing to")) ||
    lines.find((line) => line.includes("not eligible")) ||
    lines.find((line) => line.includes("Set PASTA_WTFME")) ||
    lines.find((line) => line.includes("[pasta-wtfme-publish]"));
  block("WTF.ME publish dry-run", focused || lines.slice(-3).join(" | ") || `pasta:wtfme:live-publish exited ${result.status ?? "unknown"}`);
}

function checkWtfmeInventoryReadiness() {
  const { hasCookie, hasUserPass } = credentialState();
  if (!hasCookie && !hasUserPass) {
    record("WTF.ME read-only inventory readiness", "skipped", "waiting for local WTF.ME publish credentials");
    return;
  }

  const env = {
    ...process.env,
    PASTA_WTFME_LIVE_PUBLISH: "0",
  };
  if (host) env.PASTA_WTFME_LIVE_EXPECT_HOST = host;

  const result = spawnSync("npm", ["run", "pasta:wtfme:live-inventory"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
  });
  if (result.status !== 0) {
    const lines = `${result.stdout || ""}\n${result.stderr || ""}`
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    block("WTF.ME read-only inventory readiness", lines.slice(-4).join(" | ") || `pasta:wtfme:live-inventory exited ${result.status ?? "unknown"}`);
    return;
  }

  let inventory;
  try {
    inventory = parseJsonObjectFromOutput(result.stdout, "pasta:wtfme:live-inventory");
  } catch (error) {
    block("WTF.ME read-only inventory readiness", error.message);
    return;
  }

  const readiness = inventory?.readiness || {};
  const pageReady = readiness.pagePublishReady === true;
  const pinReady = readiness.pinRecoveryPublishReady === true;
  const publicReady = readiness.publicPinDiscoveryReady === true;
  if (!pageReady || !pinReady) {
    const failed =
      blockedCheckDetails([...(readiness.pagePublishChecks || []), ...(readiness.pinRecoveryChecks || [])]) ||
      "inventory did not report passing page/pin prerequisites";
    block("WTF.ME read-only inventory readiness", failed);
    return;
  }

  record(
    "WTF.ME read-only inventory readiness",
    "pass",
    `${readiness.candidateHost || "candidate host"} page/pin prerequisites pass; public discovery ${publicReady ? "already present" : "awaits publish"}`
  );
}

function checkWtfmeHost() {
  if (!checkWtfme) {
    record("live WTF.ME host", "skipped", "PASTA_LIVE_READINESS_CHECK_WTFME=0");
    return;
  }
  if (!host) {
    block(
      "live WTF.ME host",
      "set PASTA_WTFME_LIVE_HOST to the post-publish Pasta WTF.ME host and rerun; no production Pasta host is currently proven"
    );
    return;
  }
  const result = spawnSync("npm", ["run", "pasta:wtfme:live-check"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status === 0) {
    record("live WTF.ME host", "pass", `${host} passed hosted-page and pin discovery checks`);
    return;
  }
  const lines = `${result.stdout || ""}\n${result.stderr || ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const focused = lines.find((line) => line.includes("missing marker")) || lines.find((line) => line.includes("[pasta-wtfme-live]"));
  const output = focused || lines.slice(-3).join(" | ");
  block("live WTF.ME host", output || `pasta:wtfme:live-check exited ${result.status ?? "unknown"}`);
}

function printBlockerRemediation() {
  if (blockers.length === 0) return;
  const hasCredentialBlocker = blockers.some((blocker) => blocker.name === "local WTF.ME publish credentials");
  const hasHostBlocker = blockers.some((blocker) => blocker.name === "live WTF.ME host");
  if (hasCredentialBlocker) {
    console.log(
      "[pasta-live-readiness] next: provision the dedicated Pasta WTF.ME account/host credential outside the repo, then rerun this gate with PASTA_WTFME_LIVE_COOKIE or PASTA_WTFME_LIVE_USERNAME/PASTA_WTFME_LIVE_PASSWORD"
    );
  }
  if (hasCredentialBlocker || hasHostBlocker) {
    console.log(
      "[pasta-live-readiness] runbook: .agents/docs/live/PASTA_WTFME_LIVE_PUBLISH_RUNBOOK.md"
    );
    console.log(
      "[pasta-live-readiness] next: bind the proof to the emitted host with PASTA_WTFME_LIVE_HOST=<published-host> for readiness checks and PASTA_WTFME_LIVE_EXPECT_HOST=<published-host> before any PASTA_WTFME_LIVE_PUBLISH=1 run"
    );
    console.log(
      "[pasta-live-readiness] next: after publish, require PASTA_WTFME_LIVE_HOST=<published-host> npm run pasta:wtfme:live-check to pass with pin discovery enabled"
    );
  }
}

async function main() {
  console.log(`[pasta-live-readiness] target ${baseUrl().origin}`);
  checkFinalLaunchGuardrails();
  await checkHealth();
  checkRepoCleanupAudit();
  await checkStaticBundles();
  checkInstallerDownloads();
  await checkInstallerCatalogRoute();
  checkRecordedColanderActionProof();
  checkWtfmePublishDryRun();
  checkWtfmeInventoryReadiness();
  checkWtfmeHost();

  const ok = blockers.length === 0;
  console.log(JSON.stringify({ ok, allowBlockers, finalLaunch, checks, blockers }, null, 2));
  printBlockerRemediation();
  if (!ok && (!allowBlockers || finalLaunch)) process.exit(1);
}

main().catch((error) => {
  console.error(`[pasta-live-readiness] ${error.stack || error.message}`);
  process.exit(1);
});
