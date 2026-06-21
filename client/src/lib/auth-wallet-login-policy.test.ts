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

test("login page bounds wallet auth and uses real password-field names", () => {
  assert.match(loginSource, /withWalletLoginTimeout\(walletLogin\(\)\)/);
  assert.match(loginSource, /void disconnectWallet\(\)\.catch/);
  assert.match(loginSource, /setUsername\(""\)/);
  assert.match(loginSource, /setPassword\(""\)/);
  assert.match(loginSource, /new FormData\(e\.currentTarget as HTMLFormElement\)/);
  assert.match(loginSource, /htmlFor="wtfos-login-username"/);
  assert.match(loginSource, /name="username"/);
  assert.match(loginSource, /htmlFor="wtfos-login-password"/);
  assert.match(loginSource, /name="password"/);
});
