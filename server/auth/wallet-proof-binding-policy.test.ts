import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildChallengeMessage } from "./wallet-verify";

test("wallet proof message binds origin, action, wallet, expiry, and nonce", () => {
  const input = {
    nonce: "a".repeat(64),
    walletAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    origin: "https://wtfos.app",
    action: "login" as const,
    expiresAt: new Date("2026-09-01T21:30:00.000Z"),
  };
  const message = buildChallengeMessage(input);

  assert.match(message, /Origin: https:\/\/wtfos\.app/);
  assert.match(message, /Action: Sign in/);
  assert.match(message, /Wallet: tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb/);
  assert.match(message, /Expires: 2026-09-01T21:30:00\.000Z/);
  assert.match(message, new RegExp(`Nonce: ${input.nonce}`));
  assert.notEqual(
    message,
    buildChallengeMessage({ ...input, walletAddress: "tz1burnburnburnburnburnburnburjAYjjX" })
  );
});

test("wallet auth routes prove public-key ownership before consuming a scoped nonce", () => {
  const routes = readFileSync("server/auth/routes.ts", "utf8");
  const verifyRoute = routes.slice(
    routes.indexOf('router.post("/api/auth/wallet/verify"'),
    routes.indexOf('router.post("/api/auth/wallet/register"')
  );
  const registerRoute = routes.slice(
    routes.indexOf('router.post("/api/auth/wallet/register"'),
    routes.indexOf('if (process.env.GITHUB_CLIENT_ID)')
  );

  for (const source of [verifyRoute, registerRoute]) {
    const ownership = source.indexOf("verifyPublicKeyOwnership(walletAddress, publicKey)");
    const consume = source.indexOf("consumeWalletAuthNonce(walletAddress, nonce");
    assert.ok(ownership >= 0 && consume > ownership);
    assert.doesNotMatch(source, /derivedAddress \|\| walletAddress|derivedAddr \|\| walletAddress/);
  }
  assert.match(verifyRoute, /action: "login"/);
  assert.match(registerRoute, /action: "register"/);
});
