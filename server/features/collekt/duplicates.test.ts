import assert from "node:assert/strict";
import test from "node:test";

import {
  isTezosWalletAddress,
  normalizeDuplicateBalance,
} from "./duplicates";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

function balance(overrides: Record<string, unknown> = {}) {
  return {
    balance: "2",
    firstTime: "2024-01-01T00:00:00Z",
    lastTime: "2025-01-01T00:00:00Z",
    token: {
      contract: { address: contract },
      tokenId: "42",
      totalSupply: "100",
      metadata: { name: "Two of a kind", decimals: "0" },
    },
    ...overrides,
  };
}

test("duplicate art policy accepts integer FA2 editions held two or more times", () => {
  const result = normalizeDuplicateBalance(balance());
  assert.equal(result.excluded, null);
  assert.deepEqual(result.item, {
    contract,
    tokenId: "42",
    balance: 2,
    totalSupply: 100,
    decimals: 0,
    firstTime: "2024-01-01T00:00:00Z",
    lastTime: "2025-01-01T00:00:00Z",
    metadata: { name: "Two of a kind", decimals: "0" },
  });
});

test("duplicate art policy excludes currency decimals and supply above 5,000", () => {
  const decimals = balance({
    token: {
      contract: { address: contract },
      tokenId: "1",
      totalSupply: "100",
      metadata: { decimals: "6" },
    },
  });
  const supply = balance({
    token: {
      contract: { address: contract },
      tokenId: "2",
      totalSupply: "5001",
      metadata: { decimals: "0" },
    },
  });
  assert.equal(normalizeDuplicateBalance(decimals).excluded, "decimals");
  assert.equal(normalizeDuplicateBalance(supply).excluded, "supply");
});

test("duplicate art policy fails closed when supply or balance is not a safe integer", () => {
  assert.equal(
    normalizeDuplicateBalance(balance({ balance: "1.5" })).excluded,
    "malformed"
  );
  assert.equal(
    normalizeDuplicateBalance(balance({
      token: {
        contract: { address: contract },
        tokenId: "2",
        metadata: { decimals: 0 },
      },
    })).excluded,
    "malformed"
  );
});

test("wallet validation accepts canonical implicit and originated addresses", () => {
  assert.equal(isTezosWalletAddress("tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"), true);
  assert.equal(isTezosWalletAddress(contract), true);
  assert.equal(isTezosWalletAddress("not-a-wallet"), false);
});
