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
const checkWtfme = flag("PASTA_LIVE_READINESS_CHECK_WTFME", true);
const checkStatic = flag("PASTA_LIVE_READINESS_CHECK_STATIC", true);
const host = String(process.env.PASTA_WTFME_LIVE_HOST || "").trim().toLowerCase();
const checks = [];
const blockers = [];

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

function checkLocalCredentialShape() {
  const hasCookie = Boolean(String(process.env.PASTA_WTFME_LIVE_COOKIE || "").trim());
  const hasUserPass =
    Boolean(String(process.env.PASTA_WTFME_LIVE_USERNAME || "").trim()) &&
    Boolean(String(process.env.PASTA_WTFME_LIVE_PASSWORD || ""));
  if (hasCookie || hasUserPass) {
    record("local WTF.ME publish credentials", "pass", hasCookie ? "cookie env present" : "username/password env present");
  } else {
    block(
      "local WTF.ME publish credentials",
      "set PASTA_WTFME_LIVE_COOKIE or PASTA_WTFME_LIVE_USERNAME/PASTA_WTFME_LIVE_PASSWORD for a dry-run/publish pass"
    );
  }
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

async function main() {
  console.log(`[pasta-live-readiness] target ${baseUrl().origin}`);
  await checkHealth();
  await checkStaticBundles();
  checkLocalCredentialShape();
  checkWtfmeHost();

  const ok = blockers.length === 0;
  console.log(JSON.stringify({ ok, allowBlockers, checks, blockers }, null, 2));
  if (!ok && !allowBlockers) process.exit(1);
}

main().catch((error) => {
  console.error(`[pasta-live-readiness] ${error.stack || error.message}`);
  process.exit(1);
});
