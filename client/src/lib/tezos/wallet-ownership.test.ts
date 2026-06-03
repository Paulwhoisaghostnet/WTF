import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWalletLinkedToRows,
  sameTezosWalletAddress,
} from "./wallet-ownership";

test("sameTezosWalletAddress requires exact linked wallet identity", () => {
  assert.equal(sameTezosWalletAddress("tz1AliceWallet", "tz1AliceWallet"), true);
  assert.equal(sameTezosWalletAddress(" tz1AliceWallet ", "tz1AliceWallet"), true);
  assert.equal(sameTezosWalletAddress("tz1AliceWallet", "tz1BobWallet"), false);
  assert.equal(sameTezosWalletAddress("tz1AliceWallet", "TZ1AliceWallet"), false);
});

test("assertWalletLinkedToRows refuses stale wallets from another signed-in user", () => {
  assert.equal(
    assertWalletLinkedToRows("tz1AliceWallet", [
      { walletAddress: "tz1AliceWallet" },
      { walletAddress: "tz1AliceCold" },
    ]),
    "tz1AliceWallet",
  );

  assert.throws(
    () => assertWalletLinkedToRows("tz1AliceWallet", [{ walletAddress: "tz1BobWallet" }]),
    /not linked to this signed-in WTF OS account/i,
  );
  assert.throws(
    () => assertWalletLinkedToRows(null, [{ walletAddress: "tz1BobWallet" }]),
    /Connect a Tezos wallet/i,
  );
});
