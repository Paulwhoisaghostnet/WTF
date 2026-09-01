import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExpectedWalletAddress,
  WalletAccountMismatchError,
} from "./wallet-signer-binding";

const EXPECTED = "tz1ExpectedWallet111111111111111111111";
const OTHER = "tz1OtherWallet222222222222222222222222";

test("signer binding accepts an exact expected wallet", () => {
  assert.doesNotThrow(() => assertExpectedWalletAddress(EXPECTED, EXPECTED));
});

test("signer binding allows operations that do not declare an expected wallet", () => {
  assert.doesNotThrow(() => assertExpectedWalletAddress(undefined, OTHER));
});

test("signer binding rejects a switched wallet with actionable account details", () => {
  assert.throws(
    () => assertExpectedWalletAddress(EXPECTED, OTHER),
    (error: unknown) => {
      assert.ok(error instanceof WalletAccountMismatchError);
      assert.equal(error.code, "WALLET_ACCOUNT_MISMATCH");
      assert.equal(error.expectedAddress, EXPECTED);
      assert.equal(error.actualAddress, OTHER);
      assert.match(error.message, /operation was prepared for/);
      return true;
    },
  );
});

test("signer binding trims transport whitespace without changing address identity", () => {
  assert.doesNotThrow(() =>
    assertExpectedWalletAddress(` ${EXPECTED} `, `\n${EXPECTED}\t`),
  );
});
