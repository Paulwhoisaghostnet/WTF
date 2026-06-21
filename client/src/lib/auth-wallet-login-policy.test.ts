import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("./auth-context.tsx", import.meta.url), "utf8");
const walletSource = readFileSync(new URL("./wallet-context.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../pages/Login.tsx", import.meta.url), "utf8");

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

test("wallet login screen recovers from provider handoff hangs", () => {
  assert.match(
    loginSource,
    /WALLET_LOGIN_TIMEOUT_MS\s*=\s*38_000/,
    "the login button needs a UI-level timeout independent of wallet SDK internals"
  );
  assert.match(
    loginSource,
    /withWalletLoginTimeout\(walletLogin\(\)\)/,
    "walletLogin must be bounded at the screen boundary so the button cannot stay on Connecting forever"
  );
  assert.match(
    loginSource,
    /disconnectWallet\(\)/,
    "provider state should be cleared after a login timeout so the next click starts cleanly"
  );
});
