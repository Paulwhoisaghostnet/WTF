import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("./auth-context.tsx", import.meta.url), "utf8");
const walletSource = readFileSync(new URL("./wallet-context.tsx", import.meta.url), "utf8");

test("wallet login always requests fresh mainnet wallet permissions", () => {
  assert.match(
    authSource,
    /connectAuthWallet\(\)/,
    "sign-in must not reuse a stale Beacon/Octez session or inherit Shadownet app state"
  );
  assert.match(
    authSource,
    /signAuthPayload\(message\)/,
    "sign-in challenge signatures must stay on the same mainnet auth wallet lane"
  );
});

test("explicit identity wallet connect always requests fresh mainnet wallet permissions", () => {
  assert.match(
    walletSource,
    /connectAuthWallet\(\)/,
    "user-initiated identity connect should show the wallet picker on mainnet instead of cached Kukai/Temple state"
  );
  assert.match(
    walletSource,
    /signAuthPayload\(message\)/,
    "identity wallet linking must not inherit Shadownet app state for ownership proof"
  );
});
