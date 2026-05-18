import assert from "node:assert/strict";
import test from "node:test";
import { checkJstzAdapter } from "./check-jstz-adapter.mjs";

test("jstz adapter is planned disabled by default", () => {
  const result = checkJstzAdapter({});
  assert.equal(result.status, "planned_disabled");
  assert.equal(result.canClaimAdapter, false);
});

test("required jstz adapter fails closed when disabled", () => {
  const result = checkJstzAdapter({ JSTZ_ADAPTER_REQUIRED: "1", KILN_JSTZ_ENABLED: "0" });
  assert.equal(result.status, "blocked_required");
  assert.equal(result.canClaimAdapter, false);
  assert.deepEqual(result.missing, ["KILN_JSTZ_ENABLED"]);
});

test("enabled jstz adapter requires an argv-array proof command", () => {
  const result = checkJstzAdapter({
    KILN_JSTZ_ENABLED: "1",
    JSTZ_EXECUTABLE: "node",
    JSTZ_COUNTER_PROOF_COMMAND: "node -e 1",
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.canClaimAdapter, false);
  assert(result.missing.includes("JSTZ_COUNTER_PROOF_COMMAND"));
});

test("enabled jstz adapter reports proof failures", () => {
  const result = checkJstzAdapter({
    KILN_JSTZ_ENABLED: "1",
    JSTZ_EXECUTABLE: "node",
    JSTZ_COUNTER_PROOF_COMMAND: JSON.stringify(["node", "-e", "process.exit(7)"]),
  });
  assert.equal(result.status, "proof_failed");
  assert.equal(result.canClaimAdapter, false);
  assert.equal(result.proof.status, 7);
});

test("enabled jstz adapter verifies after proof command exits zero", () => {
  const result = checkJstzAdapter({
    KILN_JSTZ_ENABLED: "1",
    JSTZ_EXECUTABLE: "node",
    JSTZ_COUNTER_PROOF_COMMAND: JSON.stringify(["node", "-e", "console.log('counter proof ok')"]),
  });
  assert.equal(result.status, "verified");
  assert.equal(result.canClaimAdapter, true);
  assert.equal(result.proof.stdout, "counter proof ok");
});
