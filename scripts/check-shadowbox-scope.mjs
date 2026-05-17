#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function readJsonFile(filepath) {
  if (!filepath) return null;
  return JSON.parse(readFileSync(resolve(filepath), "utf8"));
}

function getPath(value, path) {
  return path.reduce((current, key) => {
    if (current == null || typeof current !== "object") return undefined;
    return current[key];
  }, value);
}

function anyTruthy(value, paths) {
  return paths.some((path) => truthy(getPath(value, path)));
}

function anyEquals(value, entries) {
  return entries.some(({ path, expected }) => getPath(value, path) === expected);
}

function assertionPassed(evidence, kind) {
  const assertions = evidence?.assertions;
  if (Array.isArray(assertions)) {
    return assertions.some((entry) => {
      const entryKind = String(entry?.kind ?? entry?.type ?? "").toLowerCase();
      return entryKind === kind && truthy(entry?.passed ?? entry?.ok);
    });
  }
  return truthy(assertions?.[kind] ?? evidence?.[`${kind}AssertionPassed`]);
}

export function evaluateShadowboxScope({
  capability = null,
  scenario = null,
  required = false,
} = {}) {
  const hasCapability = Boolean(capability);
  const hasScenario = Boolean(scenario);

  const commandProviderShadowbox = anyTruthy(capability, [
    ["shadowbox", "commandProvider"],
    ["shadowbox", "supportedInCommandProvider"],
    ["capabilities", "shadowbox", "commandProvider"],
    ["capabilities", "shadowbox", "supportedInCommandProvider"],
    ["features", "shadowbox", "commandProvider"],
    ["features", "shadowbox", "supportedInCommandProvider"],
  ]) || anyEquals(capability, [
    { path: ["runtime", "shadowbox", "provider"], expected: "command" },
  ]);
  const mockClearanceBlocked = anyTruthy(capability, [
    ["shadowbox", "mockClearanceBlocked"],
    ["capabilities", "shadowbox", "mockClearanceBlocked"],
    ["features", "shadowbox", "mockClearanceBlocked"],
    ["policy", "mockClearanceBlocked"],
  ]) || anyEquals(capability, [
    { path: ["noStubPolicy", "shadowboxMockClearance"], expected: "blocked" },
  ]);
  const multiContractCapability = anyTruthy(capability, [
    ["shadowbox", "multiContract"],
    ["capabilities", "shadowbox", "multiContract"],
    ["features", "shadowbox", "multiContract"],
  ]) || anyEquals(capability, [
    { path: ["systemScenarios", "shadowboxMultiContract"], expected: "supported-in-command-provider" },
  ]);

  const multiContractScenario = anyTruthy(scenario, [
    ["multiContract"],
    ["scenario", "multiContract"],
    ["evidence", "multiContract"],
  ]);
  const payableStep = anyTruthy(scenario, [
    ["payableStep"],
    ["scenario", "payableStep"],
    ["evidence", "payableStep"],
  ]);
  const storageAssertion = assertionPassed(scenario, "storage");
  const balanceAssertion = assertionPassed(scenario, "balance");
  const bigMapAssertion = assertionPassed(scenario, "big_map") || assertionPassed(scenario, "bigMap");

  const missing = [];
  if (!hasCapability) missing.push("shadowbox_host_capability_json");
  if (!commandProviderShadowbox) missing.push("command_provider_shadowbox_support");
  if (!mockClearanceBlocked) missing.push("mock_clearance_blocked_policy");
  if (!multiContractCapability) missing.push("multi_contract_host_capability");
  if (!hasScenario) missing.push("multi_contract_scenario_evidence");
  if (!multiContractScenario) missing.push("multi_contract_scenario");
  if (!payableStep) missing.push("payable_step_evidence");
  if (!storageAssertion) missing.push("storage_assertion_evidence");
  if (!balanceAssertion) missing.push("balance_assertion_evidence");
  if (!bigMapAssertion) missing.push("big_map_assertion_evidence");

  const verified = missing.length === 0;
  return {
    status: verified ? "verified" : required ? "blocked_required" : "blocked",
    canClaimShadowbox: verified,
    missing,
  };
}

export function evaluateFromEnv(env = process.env) {
  return evaluateShadowboxScope({
    capability: readJsonFile(env.SHADOWBOX_CAPABILITY_FILE),
    scenario: readJsonFile(env.SHADOWBOX_SCENARIO_EVIDENCE_FILE),
    required: truthy(env.SHADOWBOX_MULTICONTRACT_REQUIRED),
  });
}

async function main() {
  try {
    const result = evaluateFromEnv();
    console.log(JSON.stringify(result, null, 2));
    if (!result.canClaimShadowbox && result.status === "blocked_required") {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "error",
          canClaimShadowbox: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
