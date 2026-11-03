import assert from "node:assert/strict";
import test from "node:test";
import { resolveHorfTraderName } from "./trader-names";

test("linked WTF username takes precedence over an earlier guest Horf name", () => {
  assert.deepEqual(resolveHorfTraderName({ wtf_username: "WtfRider", horf_username: "OldHorfName" }), {
    username: "OldHorfName", displayName: "WtfRider", usernameSource: "wtf", canEditUsername: false,
  });
  assert.deepEqual(resolveHorfTraderName({ wtf_username: null, horf_username: "OpenRangeRider" }), {
    username: "OpenRangeRider", displayName: "OpenRangeRider", usernameSource: "horf", canEditUsername: true,
  });
  assert.deepEqual(resolveHorfTraderName({ wtf_username: null, horf_username: null }), {
    username: null, displayName: null, usernameSource: "wallet", canEditUsername: true,
  });
});
