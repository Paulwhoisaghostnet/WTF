import test from "node:test";
import assert from "node:assert/strict";
import { toWtfosHandle, checkHandleAvailability } from "./handle-policy";

test("toWtfosHandle lowercases and appends the network domain", () => {
  assert.equal(toWtfosHandle("Alice", "wtfos.me"), "alice.wtfos.me");
});

test("checkHandleAvailability rejects reserved/invalid labels before resolving", async () => {
  let resolverCalled = false;
  const result = await checkHandleAvailability({
    label: "relay",
    networkDomain: "wtfos.me",
    resolveDid: async () => {
      resolverCalled = true;
      return null;
    },
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, "label_reserved_or_invalid");
  assert.equal(resolverCalled, false, "reserved labels short-circuit before the resolver");
});

test("checkHandleAvailability reports taken handles with the existing DID", async () => {
  const result = await checkHandleAvailability({
    label: "alice",
    networkDomain: "wtfos.me",
    resolveDid: async (handle) => {
      assert.equal(handle, "alice.wtfos.me");
      return "did:plc:existingexistingexisting";
    },
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, "handle_taken");
  assert.equal(result.existingDid, "did:plc:existingexistingexisting");
});

test("checkHandleAvailability allows a free, valid label", async () => {
  const result = await checkHandleAvailability({
    label: "alice",
    networkDomain: "wtfos.me",
    resolveDid: async () => null,
  });
  assert.equal(result.available, true);
  assert.equal(result.handle, "alice.wtfos.me");
  assert.equal(result.reason, null);
});
