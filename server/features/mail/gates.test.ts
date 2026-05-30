import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBotMailGate,
  evaluateUserMailGate,
  isEmailIntegratedManifest,
} from "./gates";

test("user gate requires tezos wallet + identity", () => {
  const missingWallet = evaluateUserMailGate({
    tezosWalletCount: 0,
    atprotoAccount: { did: "did:plc:a", handle: "alice.bsky.social" },
    wtfosIdentity: null,
    username: "alice",
  });
  assert.equal(missingWallet.ok, false);
  if (!missingWallet.ok) assert.equal(missingWallet.code, "missing_tezos_wallet");

  const guest = evaluateUserMailGate({
    tezosWalletCount: 1,
    atprotoAccount: null,
    wtfosIdentity: null,
    username: "guest",
  });
  assert.equal(guest.ok, false);
  if (!guest.ok) assert.equal(guest.code, "missing_identity");

  const okWtf = evaluateUserMailGate({
    tezosWalletCount: 1,
    atprotoAccount: null,
    wtfosIdentity: {
      wtfDid: "did:plc:abc",
      wtfHandle: "alice.wtfos.me",
      status: "active",
    },
    username: "alice",
  });
  assert.equal(okWtf.ok, true);
  if (okWtf.ok) {
    assert.equal(okWtf.localPart, "alice");
    assert.equal(okWtf.identitySource, "wtfos");
  }
});

test("bot gate requires valid key path and email integration flag", () => {
  assert.equal(isEmailIntegratedManifest({ integrations: { email: { enabled: true } } }), true);
  assert.equal(isEmailIntegratedManifest({ integrations: { email: { enabled: false } } }), false);

  const blocked = evaluateBotMailGate({
    appRegistryEnabled: true,
    verifyReason: "ok",
    appId: "desktop:arcade",
    registration: {
      enabled: true,
      lifecycleState: "published",
      manifest: { integrations: { email: { enabled: false } } },
    },
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "email_not_integrated");

  const ok = evaluateBotMailGate({
    appRegistryEnabled: true,
    verifyReason: "ok",
    appId: "desktop:arcade",
    registration: {
      enabled: true,
      lifecycleState: "alpha",
      manifest: { integrations: { email: { enabled: true } } },
    },
  });
  assert.equal(ok.ok, true);
});
