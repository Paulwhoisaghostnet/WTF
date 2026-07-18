#!/usr/bin/env node

import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_BASE_URL = "https://wtfos.app";
const PLACEHOLDER_COMMITS = new Set([
  "dev",
  "development",
  "local",
  "unknown",
  "undefined",
  "null",
]);

function normalizeCommit(value) {
  return String(value ?? "").trim();
}

export function assessProductionReadiness({ liveness, readiness, expectedCommit = "" }) {
  const blockers = [];
  const checks = [];
  const commitRef = normalizeCommit(readiness?.version?.commitRef);
  const expected = normalizeCommit(expectedCommit);
  const pass = (name, detail) => checks.push({ name, status: "pass", detail });
  const block = (name, detail) => {
    blockers.push({ name, detail });
    checks.push({ name, status: "blocked", detail });
  };

  if (liveness?.ok === true) pass("public liveness", "GET /api/health reports ok");
  else block("public liveness", "GET /api/health did not report ok=true");

  if (readiness?.ok === true && readiness?.status === "ready") {
    pass("dependency readiness", "database, chain, scheduler, and runtime report ready");
  } else {
    block("dependency readiness", `GET /api/health/ready reported ${JSON.stringify(readiness?.status ?? "missing")}`);
  }

  if (readiness?.version?.nodeEnv === "production") {
    pass("production runtime", "version.nodeEnv is production");
  } else {
    block("production runtime", `version.nodeEnv is ${JSON.stringify(readiness?.version?.nodeEnv ?? "missing")}`);
  }

  if (!commitRef) {
    block("deployment commit", "version.commitRef is missing");
  } else if (PLACEHOLDER_COMMITS.has(commitRef.toLowerCase())) {
    block("deployment commit", `version.commitRef is placeholder ${JSON.stringify(commitRef)}`);
  } else if (!/^[0-9a-f]{7,40}$/i.test(commitRef)) {
    block("deployment commit", `version.commitRef is not a git hex ref: ${JSON.stringify(commitRef)}`);
  } else if (expected && commitRef.slice(0, 7) !== expected.slice(0, 7)) {
    block("deployment commit", `live ${commitRef.slice(0, 7)} does not match expected ${expected.slice(0, 7)}`);
  } else {
    pass("deployment commit", expected ? `live commit matches ${expected.slice(0, 7)}` : `live commit is ${commitRef}`);
  }

  return {
    ok: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "blocked",
    commitRef: commitRef || null,
    expectedCommit: expected || null,
    checks,
    blockers,
  };
}

function baseUrl() {
  const url = new URL(String(process.env.WTFOS_BASE_URL || DEFAULT_BASE_URL).trim());
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchJson(pathname) {
  const url = new URL(pathname, baseUrl());
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-production-readiness" },
    redirect: "manual",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url.toString()} returned HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url.toString()} returned invalid JSON`);
  }
}

export async function runProductionReadiness() {
  const [liveness, readiness] = await Promise.all([
    fetchJson("/api/health"),
    fetchJson("/api/health/ready"),
  ]);
  const report = assessProductionReadiness({
    liveness,
    readiness,
    expectedCommit: process.env.WTFOS_EXPECT_COMMIT || "",
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runProductionReadiness().catch((error) => {
    console.error(`[production-readiness] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
