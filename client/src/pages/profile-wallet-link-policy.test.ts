import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileSource = readFileSync(new URL("./Profile.tsx", import.meta.url), "utf8");

test("Profile wallet linking uses the signed wallet connect proof path", () => {
  assert.match(
    profileSource,
    /const \{ address, connect, isConnecting \} = useWallet\(\)/,
    "Profile should use the shared wallet context connect path"
  );
  assert.match(
    profileSource,
    /mutationFn:\s*\(\) => connect\(\)/,
    "Profile link action should trigger explicit wallet connect and ownership proof"
  );
  assert.match(
    profileSource,
    /Wallet linking requires an ownership signature from the connected wallet/,
    "Profile should explain why typed addresses are not accepted"
  );
  assert.doesNotMatch(
    profileSource,
    /api\.post\("\/api\/wallets",\s*\{\s*walletAddress\s*\}\)/,
    "Profile must not submit address-only wallet links"
  );
  assert.doesNotMatch(
    profileSource,
    /aria-label="Wallet address to link"/,
    "Profile must not expose a raw wallet-address link field for new links"
  );
});
