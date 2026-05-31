#!/usr/bin/env node

/**
 * Kiln deploy smoke check.
 *
 * Verifies public Kiln health and that mutation routes stay token-gated.
 *
 * Open auth mode and public Shadownet puppet-wallet balances are intentional:
 * Shadownet XTZ is free from the faucet, so shared Bert/Ernie signers are a
 * convenience for builders, not a custody or mainnet security boundary.
 */

const publicUrl = (
  process.env.KILN_PUBLIC_URL ||
  "https://kiln.wtfgameshow.app"
).replace(/\/+$/, "");

const workflowPath =
  process.env.KILN_PROTECTED_PROBE_PATH || "/api/kiln/workflow/run";

async function fetchJson(path, init = {}) {
  const url = `${publicUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "wtf-deploy-kiln-posture-check",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { url, status: response.status, text, json };
}

function fail(message, detail = "") {
  console.error(`[kiln-posture] ERROR: ${message}`);
  if (detail) console.error(detail.slice(0, 800));
  process.exit(1);
}

async function main() {
  const health = await fetchJson("/api/health");
  if (health.status < 200 || health.status >= 300) {
    fail(`/api/health returned HTTP ${health.status}`, health.text);
  }

  const authMode = String(health.json?.auth?.mode || health.json?.authMode || "unknown");
  const authRequired = health.json?.auth?.required;
  console.log(
    `[kiln-posture] health ok (auth.mode=${authMode}, auth.required=${String(authRequired)})`
  );
  if (authMode === "open" || authRequired === false) {
    console.log(
      "[kiln-posture] open Shadownet builder mode is expected — puppet balances may be public; mutations must still require a token"
    );
  }

  const workflow = await fetchJson(workflowPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "deploy-posture-check", dryRun: true }),
  });
  if (workflow.status !== 401 && workflow.status !== 403) {
    fail(
      `Unauthenticated ${workflowPath} returned HTTP ${workflow.status}; expected 401/403.`,
      workflow.text
    );
  }

  console.log(
    `[kiln-posture] protected mutations reject anonymous callers (${workflow.status})`
  );
}

main().catch((error) => {
  console.error("[kiln-posture] ERROR:", error);
  process.exit(1);
});
