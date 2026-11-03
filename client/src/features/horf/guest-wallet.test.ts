import assert from "node:assert/strict";
import test from "node:test";
import { proveHorfGuestWallet } from "./guest-wallet";

const wallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const otherWallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";

test("guest Horf proof signs the scoped challenge and binds verification to the selected wallet", async () => {
  let signedMessage = "";
  let posted: unknown = null;
  const address = await proveHorfGuestWallet(wallet, {
    challenge: async (walletAddress) => {
      assert.equal(walletAddress, wallet);
      return { nonce: "nonce-1", message: "Use Horf on Tezos Mainnet", expiresAt: "2026-11-03T12:00:00Z", action: "horf", origin: "https://wtfos.app" };
    },
    sign: async (message) => { signedMessage = message; return { signature: "sig", publicKey: "edpk" }; },
    verify: async (proof) => { posted = proof; return { walletAddress: wallet, verified: true, source: "wallet-proof" }; },
  });
  assert.equal(address, wallet);
  assert.equal(signedMessage, "Use Horf on Tezos Mainnet");
  assert.deepEqual(posted, { walletAddress: wallet, publicKey: "edpk", signature: "sig", nonce: "nonce-1" });
});

test("guest Horf proof rejects a verification response for another wallet", async () => {
  await assert.rejects(() => proveHorfGuestWallet(wallet, {
    challenge: async () => ({ nonce: "nonce-2", message: "Use Horf on Tezos Mainnet", expiresAt: "2026-11-03T12:00:00Z", action: "horf", origin: "https://wtfos.app" }),
    sign: async () => ({ signature: "sig", publicKey: "edpk" }),
    verify: async () => ({ walletAddress: otherWallet, verified: true, source: "wallet-proof" }),
  }), /could not verify the selected wallet/);
});
