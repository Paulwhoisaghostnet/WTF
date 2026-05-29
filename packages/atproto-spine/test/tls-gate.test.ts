import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTlsRequest, type TlsGateOptions } from "../src/tls-gate";

const registered = new Set(["alice.wtfos.me", "bob.wtfos.me"]);

const opts: TlsGateOptions = {
  networkDomain: "wtfos.me",
  infraHosts: ["pds.wtfos.me", "relay.wtfos.me", "social.wtfos.me"],
  reservedHandles: ["relay", "pds", "plc", "mod", "api", "social", "admin"],
  isHandleRegistered: (handle) => registered.has(handle.toLowerCase()),
};

test("infra hosts are always allowed", async () => {
  assert.equal((await evaluateTlsRequest("pds.wtfos.me", opts)).allowed, true);
  assert.equal((await evaluateTlsRequest("RELAY.WTFOS.ME", opts)).allowed, true);
});

test("registered single-label handles are allowed", async () => {
  assert.equal((await evaluateTlsRequest("alice.wtfos.me", opts)).allowed, true);
});

test("unregistered handles are denied", async () => {
  const d = await evaluateTlsRequest("mallory.wtfos.me", opts);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "handle not registered");
});

test("reserved labels are denied even if someone tries to register them", async () => {
  const d = await evaluateTlsRequest("admin.wtfos.me", opts);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "reserved label");
});

test("hosts outside the network domain are denied", async () => {
  const d = await evaluateTlsRequest("evil.example.com", opts);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "host outside network domain");
});

test("apex and multi-label subdomains are denied unless explicit infra", async () => {
  assert.equal((await evaluateTlsRequest("wtfos.me", opts)).allowed, false);
  assert.equal((await evaluateTlsRequest("a.b.wtfos.me", opts)).allowed, false);
});

test("empty domain is rejected", async () => {
  const d = await evaluateTlsRequest("", opts);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "domain required");
});
