import assert from "node:assert/strict";
import test from "node:test";
import {
  accountHasCapability,
  canUseAtprotoSession,
} from "./wtf-live-capabilities";

test("accountHasCapability prefers explicit oauthCapabilities", () => {
  const account = {
    oauthCapabilities: ["rooms" as const],
    oauthScopes: "",
    session: { reconnectRequired: false },
  };
  assert.equal(accountHasCapability(account, "rooms"), true);
  assert.equal(accountHasCapability(account, "stages"), false);
});

test("accountHasCapability falls back to grantedSkywireCapabilities from scopes", () => {
  const account = {
    oauthCapabilities: [] as const,
    oauthScopes: "repo:app.wtfgameshow.skywire.stage.broadcast",
    session: { reconnectRequired: false },
  };
  assert.equal(accountHasCapability(account, "stages"), true);
  assert.equal(accountHasCapability(account, "rooms"), false);
});

test("canUseAtprotoSession blocks reconnect-required sessions", () => {
  assert.equal(
    canUseAtprotoSession({ oauthCapabilities: ["rooms"], oauthScopes: null, session: { reconnectRequired: true } }),
    false,
  );
  assert.equal(
    canUseAtprotoSession({ oauthCapabilities: ["rooms"], oauthScopes: null, session: { reconnectRequired: false } }),
    true,
  );
});
