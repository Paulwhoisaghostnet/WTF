import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateFromEnv, evaluateShadowboxScope } from "./check-shadowbox-scope.mjs";

function jsonFile(value) {
  const dir = mkdtempSync(path.join(tmpdir(), "wtf-shadowbox-"));
  const filepath = path.join(dir, "evidence.json");
  writeFileSync(filepath, JSON.stringify(value), "utf8");
  return filepath;
}

test("Shadowbox scope guard stays blocked without host evidence", () => {
  const result = evaluateShadowboxScope();

  assert.equal(result.status, "blocked");
  assert.equal(result.canClaimShadowbox, false);
  assert.ok(result.missing.includes("shadowbox_host_capability_json"));
  assert.ok(result.missing.includes("multi_contract_scenario_evidence"));
});

test("Shadowbox required mode fails closed without proof", () => {
  const result = evaluateShadowboxScope({ required: true });

  assert.equal(result.status, "blocked_required");
  assert.equal(result.canClaimShadowbox, false);
});

test("Shadowbox scope verifies only with host capability and scenario evidence", () => {
  const result = evaluateShadowboxScope({
    capability: {
      shadowbox: {
        commandProvider: true,
        supportedInCommandProvider: true,
        mockClearanceBlocked: true,
        multiContract: true,
      },
    },
    scenario: {
      multiContract: true,
      payableStep: true,
      assertions: [
        { kind: "storage", passed: true },
        { kind: "balance", passed: true },
        { kind: "big_map", passed: true },
      ],
    },
    required: true,
  });

  assert.equal(result.status, "verified");
  assert.equal(result.canClaimShadowbox, true);
  assert.deepEqual(result.missing, []);
});

test("Shadowbox scope accepts live Kiln capability shape", () => {
  const result = evaluateShadowboxScope({
    capability: {
      runtime: {
        shadowbox: {
          provider: "command",
        },
      },
      noStubPolicy: {
        shadowboxMockClearance: "blocked",
      },
      systemScenarios: {
        shadowboxMultiContract: "supported-in-command-provider",
      },
    },
    scenario: {
      multiContract: true,
      payableStep: true,
      assertions: [
        { kind: "storage", passed: true },
        { kind: "balance", passed: true },
        { kind: "big_map", passed: true },
      ],
    },
    required: true,
  });

  assert.equal(result.status, "verified");
  assert.equal(result.canClaimShadowbox, true);
  assert.deepEqual(result.missing, []);
});

test("Shadowbox env evaluator reads evidence files and reports missing assertions", () => {
  const result = evaluateFromEnv({
    SHADOWBOX_MULTICONTRACT_REQUIRED: "1",
    SHADOWBOX_CAPABILITY_FILE: jsonFile({
      capabilities: {
        shadowbox: {
          commandProvider: true,
          mockClearanceBlocked: true,
          multiContract: true,
        },
      },
    }),
    SHADOWBOX_SCENARIO_EVIDENCE_FILE: jsonFile({
      scenario: {
        multiContract: true,
        payableStep: true,
      },
      assertions: [{ kind: "storage", passed: true }],
    }),
  });

  assert.equal(result.status, "blocked_required");
  assert.equal(result.canClaimShadowbox, false);
  assert.ok(result.missing.includes("balance_assertion_evidence"));
  assert.ok(result.missing.includes("big_map_assertion_evidence"));
});
