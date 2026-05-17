import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInAppMarketAssertions,
  summarizeKilnAssertionResult,
} from "./e2e-assertions";

test("in-app market Kiln payload requires storage, balance, and big-map assertions", () => {
  const assertions = buildInAppMarketAssertions({
    dummyWtfAddress: "KT1Dummy",
    marketAddress: "KT1Market",
    walletAAddress: "tz1Treasury",
    walletBAddress: "tz1Buyer",
    mintAmountWtfUnits: "100000000000",
    purchaseAmountWtfUnits: "2500000000",
    purchaseStepLabel: "Buyer purchases pet medicine",
  });

  assert.equal(assertions.some((entry) => entry.kind === "storage"), true);
  assert.equal(assertions.some((entry) => entry.kind === "balance"), true);
  assert.equal(assertions.some((entry) => entry.kind === "big_map"), true);
  assert.deepEqual(
    assertions.find((entry) => entry.id === "buyer_dummy_wtf_ledger_big_map")?.expected,
    "97500000000",
  );
});

test("Kiln assertion summary fails closed when a required assertion kind is absent", () => {
  const result = summarizeKilnAssertionResult({
    success: true,
    assertions: [
      { kind: "storage", passed: true },
      { kind: "big_map", passed: true },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingKinds, ["balance"]);
});

test("Kiln assertion summary accepts nested passed assertion evidence", () => {
  const result = summarizeKilnAssertionResult({
    success: true,
    steps: [
      { assertions: [{ kind: "storage", status: "passed" }] },
      { receipt: { assertions: [{ kind: "balance", ok: true }] } },
      { receipt: { assertions: [{ kind: "bigMap", success: true }] } },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingKinds, []);
  assert.deepEqual(result.passedKinds, ["storage", "balance", "big_map"]);
});
