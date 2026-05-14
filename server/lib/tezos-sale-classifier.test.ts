import assert from "node:assert/strict";
import test from "node:test";

import { classifyTezosSaleOperation } from "./tezos-sale-classifier";

const BUYER = "tz1Buyer1111111111111111111111111111";
const SELLER = "tz1Seller111111111111111111111111111";
const OBJKT_V6 = "KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4";
const TEIA = "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w";

test("classifies a known objkt sale even when the paid XTZ leg targets the seller", () => {
  const result = classifyTezosSaleOperation({
    buyerAddress: BUYER,
    fallbackSellerAddress: SELLER,
    operations: [
      {
        sender: { address: BUYER },
        target: { address: SELLER },
        amount: 4_200_000,
      },
      {
        sender: { address: BUYER },
        target: { address: OBJKT_V6 },
        amount: 0,
        parameter: { entrypoint: "collect", value: {} },
      },
    ],
  });

  assert.equal(result.paidMutez, 4_200_000);
  assert.equal(result.sellerAddress, SELLER);
  assert.equal(result.marketplaceContract, OBJKT_V6);
  assert.equal(result.marketplace, "objkt v6");
});

test("classifies a known Teia sale when the marketplace is the paid target", () => {
  const result = classifyTezosSaleOperation({
    buyerAddress: BUYER,
    fallbackSellerAddress: SELLER,
    operations: [
      {
        sender: { address: BUYER },
        target: { address: TEIA },
        amount: 1_500_000,
        parameter: { entrypoint: "collect", value: {} },
      },
    ],
  });

  assert.equal(result.paidMutez, 1_500_000);
  assert.equal(result.sellerAddress, SELLER);
  assert.equal(result.marketplaceContract, TEIA);
  assert.equal(result.marketplace, "Teia");
});
