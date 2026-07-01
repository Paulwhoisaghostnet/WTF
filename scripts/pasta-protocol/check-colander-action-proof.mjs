#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const REPORT_PATH = path.join(
  root,
  ".agents",
  "docs",
  "archive",
  "contracts",
  "pasta-protocol",
  "shadownet-colander-action-report.md",
);

const TZKT_API = normalizeBase(
  process.env.PASTA_SHADOWNET_TZKT_API || "https://api.shadownet.tzkt.io/v1",
);
const OPERATION_HASH = "oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h";
const CONTRACT = "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r";
const ADMINISTRATOR = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const WALLET_ID = "arcade-treasury";
const ENTRYPOINT = "set_current_revision";
const PARAMETER_VALUE = "0";
const EXPECTED_LEVEL = 4008347;
const EXPECTED_REVISION_COUNT = "2";

function normalizeBase(value) {
  return String(value || "").replace(/\/+$/, "");
}

function assertReportEvidence(report) {
  const requiredMarkers = [
    "- Status: PASSED",
    `- Contract: \`${CONTRACT}\``,
    `- Signer wallet id: \`${WALLET_ID}\`.`,
    `- Signer address: \`${ADMINISTRATOR}\`.`,
    "- Adapter action: `set_current_revision(0)`.",
    `- Operation hash: \`${OPERATION_HASH}\`.`,
    `- TzKT level: \`${EXPECTED_LEVEL}\`.`,
    "TzKT indexed the operation as an applied transaction",
  ];
  for (const marker of requiredMarkers) {
    assert.ok(report.includes(marker), `Colander action report is missing marker: ${marker}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-pasta-colander-action-proof" },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${url} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function storageText(value) {
  if (value == null) return "";
  return String(value);
}

function matchesColanderAction(operation) {
  return (
    operation?.hash === OPERATION_HASH &&
    operation?.level === EXPECTED_LEVEL &&
    operation?.sender?.address === ADMINISTRATOR &&
    operation?.target?.address === CONTRACT &&
    operation?.parameter?.entrypoint === ENTRYPOINT &&
    storageText(operation?.parameter?.value) === PARAMETER_VALUE &&
    operation?.status === "applied" &&
    operation?.amount === 0 &&
    operation?.storage?.administrator === ADMINISTRATOR &&
    operation?.storage?.pending_administrator === null &&
    storageText(operation?.storage?.current_revision) === PARAMETER_VALUE &&
    storageText(operation?.storage?.revision_count) === EXPECTED_REVISION_COUNT
  );
}

async function main() {
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to verify Shadownet Colander proof with TEZOS_NETWORK=mainnet");
  }

  const report = readFileSync(REPORT_PATH, "utf8");
  assertReportEvidence(report);

  const operationUrl = `${TZKT_API}/operations/transactions/${encodeURIComponent(OPERATION_HASH)}`;
  const operations = await fetchJson(operationUrl);
  assert.ok(Array.isArray(operations), "TzKT transaction lookup should return an array");
  const operation = operations.find(matchesColanderAction);
  assert.ok(operation, "TzKT should still expose the recorded applied Colander action operation");

  console.log(
    `[pasta-colander-action-proof] ok: verified ${ENTRYPOINT}(${PARAMETER_VALUE}) on ${CONTRACT} at Shadownet level ${operation.level} without signer execution`,
  );
}

main().catch((error) => {
  console.error(`[pasta-colander-action-proof] ${error.stack || error.message}`);
  process.exit(1);
});
