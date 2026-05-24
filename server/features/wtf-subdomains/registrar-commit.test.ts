import assert from "node:assert/strict";
import test from "node:test";
import { prepareCommitPlan } from "./commit";

test("prepareCommitPlan rejects invalid label", () => {
  const prev = process.env.WTF_DOMAINS_REGISTRAR_ENABLED;
  process.env.WTF_DOMAINS_REGISTRAR_ENABLED = "true";
  process.env.WTF_DOMAINS_REGISTRAR_ADDRESS = "KT1TestRegistrar1111111111111111111111111";
  process.env.WTF_DOMAINS_PARENT_DOMAIN = "wtf.tez";

  const result = prepareCommitPlan({
    label: "ab",
    targetAddress: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
  });

  process.env.WTF_DOMAINS_REGISTRAR_ENABLED = prev;

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
  }
});

test("prepareCommitPlan returns salt and operations when configured", () => {
  const prevEnabled = process.env.WTF_DOMAINS_REGISTRAR_ENABLED;
  const prevAddr = process.env.WTF_DOMAINS_REGISTRAR_ADDRESS;
  const prevParent = process.env.WTF_DOMAINS_PARENT_DOMAIN;

  process.env.WTF_DOMAINS_REGISTRAR_ENABLED = "true";
  process.env.WTF_DOMAINS_REGISTRAR_ADDRESS = "KT1TestRegistrar1111111111111111111111111";
  process.env.WTF_DOMAINS_PARENT_DOMAIN = "wtf.tez";

  const result = prepareCommitPlan({
    label: "alice",
    targetAddress: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
  });

  process.env.WTF_DOMAINS_REGISTRAR_ENABLED = prevEnabled;
  process.env.WTF_DOMAINS_REGISTRAR_ADDRESS = prevAddr;
  process.env.WTF_DOMAINS_PARENT_DOMAIN = prevParent;

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.body.fullName, "alice.wtf.tez");
    assert.match(result.body.salt, /^[0-9a-f]{32}$/);
    assert.equal(result.body.operations.length, 2);
  }
});
