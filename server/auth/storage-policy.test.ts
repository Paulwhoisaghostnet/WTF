import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("wallet auth nonce consumption is one conditional database claim", () => {
  const source = readFileSync("server/auth/storage.ts", "utf8");
  const consume = source.slice(
    source.indexOf("export async function consumeWalletAuthNonce"),
    source.indexOf("export async function cleanupExpiredNonces")
  );

  assert.match(consume, /\.update\(walletAuthNonces\)/);
  assert.match(consume, /eq\(walletAuthNonces\.walletAddress, walletAddress\)/);
  assert.match(consume, /eq\(walletAuthNonces\.nonce, nonce\)/);
  assert.match(consume, /eq\(walletAuthNonces\.origin, context\.origin\)/);
  assert.match(consume, /eq\(walletAuthNonces\.action, context\.action\)/);
  assert.match(consume, /eq\(walletAuthNonces\.consumed, false\)/);
  assert.match(consume, /gt\(walletAuthNonces\.expiresAt, new Date\(\)\)/);
  assert.match(consume, /\.returning\(\{ expiresAt: walletAuthNonces\.expiresAt \}\)/);
  assert.match(consume, /return context \? claimed\[0\] \?\? null : claimed\.length === 1/);
  assert.doesNotMatch(consume, /\.select\(\)/);
});
