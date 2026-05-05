import assert from "node:assert/strict";
import { test } from "node:test";
import { selectDirectListingItem } from "./in-app-market-policy";

const MARKET = "KT1JYEAg9FSC6mY9KHNR7Z7kpHpwsDnjKkKE";

test("selectDirectListingItem uses an active generic listing when no contract-specific row exists", () => {
  const item = selectDirectListingItem(
    [
      { sku: "pet-food", contractAddress: null, active: true },
      { sku: "old-food", contractAddress: null, active: false },
    ],
    MARKET
  );

  assert.equal(item?.sku, "pet-food");
});

test("selectDirectListingItem blocks inactive contract-specific listings", () => {
  const item = selectDirectListingItem(
    [
      { sku: "retired-food", contractAddress: MARKET, active: false },
      { sku: "generic-food", contractAddress: null, active: true },
    ],
    MARKET
  );

  assert.equal(item, null);
});

test("selectDirectListingItem ignores inactive generic listings", () => {
  const item = selectDirectListingItem(
    [{ sku: "retired-food", contractAddress: null, active: false }],
    MARKET
  );

  assert.equal(item, null);
});
