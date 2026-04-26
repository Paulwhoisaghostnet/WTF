import assert from "node:assert/strict";
import {
  buildWtfSubdomainFullName,
  renderWtfSubdomainLabel,
  validateWtfSubdomainLabel,
} from "./wtf-subdomains";

assert.deepEqual(validateWtfSubdomainLabel("FAFO-crew"), {
  ok: true,
  label: "fafo-crew",
});

assert.deepEqual(validateWtfSubdomainLabel("alice.wtf.tez"), {
  ok: true,
  label: "alice",
});

assert.equal(validateWtfSubdomainLabel("wtf").ok, false);
assert.equal(validateWtfSubdomainLabel("-bad").ok, false);
assert.equal(validateWtfSubdomainLabel("two.words").ok, false);

assert.equal(
  buildWtfSubdomainFullName("alice", "wtf.tez"),
  "alice.wtf.tez",
);

assert.equal(
  renderWtfSubdomainLabel("{username}-{userId}", {
    id: 42,
    username: "FAFO Wizard",
    displayName: "The Wizard",
  }),
  "fafo-wizard-42",
);

assert.equal(
  renderWtfSubdomainLabel("", {
    id: 7,
    username: "Bad Name!!",
    displayName: null,
  }),
  "bad-name",
);

console.log("wtf-subdomains tests passed");
