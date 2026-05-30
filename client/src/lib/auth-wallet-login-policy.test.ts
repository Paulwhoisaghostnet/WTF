import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("./auth-context.tsx", import.meta.url), "utf8");
const walletSource = readFileSync(new URL("./wallet-context.tsx", import.meta.url), "utf8");

test("wallet login always requests fresh wallet permissions", () => {
  assert.match(
    authSource,
    /connectWallet\(\{ forcePermissions: true \}\)/,
    "sign-in must not reuse a stale Beacon/Octez session from another visitor"
  );
});

test("explicit wallet connect always requests fresh wallet permissions", () => {
  assert.match(
    walletSource,
    /connectWallet\(\{ forcePermissions: true \}\)/,
    "user-initiated connect should show the wallet picker instead of cached Kukai/Temple state"
  );
});
