import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WTF_TOKEN } from "@shared/types";
import {
  PAYROLL_CHAIN_ID,
  PAYROLL_STORAGE_PREFIX,
  assertPayrollRecipient,
  formatAtomic,
  parseDecimalToAtomic,
} from "./payroll-wallet";

test("Payroll parses XTZ and WTF decimal amounts without floating-point loss", () => {
  assert.equal(parseDecimalToAtomic("1.25", 6), "1250000");
  assert.equal(parseDecimalToAtomic("0.00000001", 8), "1");
  assert.equal(parseDecimalToAtomic("2.00000001", 8), "200000001");
});

test("Payroll rejects ambiguous, zero, negative, and over-precision amounts", () => {
  for (const value of ["", "0", "0.0", "-1", "1e3", ".5", "01"]) {
    assert.throws(() => parseDecimalToAtomic(value, 8));
  }
  assert.throws(
    () => parseDecimalToAtomic("1.000000001", 8),
    /no more than 8 decimal places/,
  );
});

test("Payroll formats atomic balances for review without rounding", () => {
  assert.equal(formatAtomic("1250000", 6, 6), "1.25");
  assert.equal(formatAtomic("5000000000", 8, 8), "50");
  assert.equal(formatAtomic("200000001", 8, 8), "2.00000001");
});

test("Payroll accepts Tezos implicit and originated destinations only", () => {
  assert.equal(assertPayrollRecipient(" tz1burnburnburnburnburnburnburjAYjjX "), "tz1burnburnburnburnburnburnburjAYjjX");
  assert.equal(assertPayrollRecipient(` ${WTF_TOKEN.contract} `), WTF_TOKEN.contract);
  assert.throws(() => assertPayrollRecipient("0x1234"), /valid Tezos wallet or contract address/);
});

test("Payroll keeps its connector isolated and rechecks signer, chain, and confirmation", () => {
  const source = readFileSync(new URL("./payroll-wallet.ts", import.meta.url), "utf8");

  assert.equal(PAYROLL_STORAGE_PREFIX, "wtf-payroll");
  assert.equal(PAYROLL_CHAIN_ID, "NetXdQprcVkpaWU");
  assert.match(source, /storage:\s*new LocalStorage\(PAYROLL_STORAGE_PREFIX\)/);
  assert.doesNotMatch(source, /wtf:wallet-session|WALLET_SESSION_KEY|useWallet/);
  assert.match(source, /getActiveAddress\(\)/);
  assert.match(source, /getChainId\(\)/);
  assert.match(source, /confirmation\(1\)/);
});
