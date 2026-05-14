import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cockpitRoutes = readFileSync("server/routes/cockpit.ts", "utf8");

test("manual cockpit wallet sync rejects invalid and unlinked wallet targets", () => {
  assert.match(cockpitRoutes, /TEZOS_IMPLICIT_ADDRESS_RE/);
  assert.match(cockpitRoutes, /400\)\.json\(\{ error: "invalid wallet address" \}\)/);
  assert.match(cockpitRoutes, /const canSyncAnyWallet = await hasPermission/);
  assert.match(cockpitRoutes, /eq\(userWallets\.userId, user\.id\)/);
  assert.match(cockpitRoutes, /eq\(userWallets\.walletAddress, wallet\)/);
  assert.match(cockpitRoutes, /\.status\(403\)[\s\S]*wallet is not linked to your account/);
});
