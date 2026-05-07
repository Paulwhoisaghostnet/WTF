import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePortfolioCosting } from "./portfolio-costing";

const wallet = "tz1BuyerWallet11111111111111111111111";
const other = "tz1OtherWallet111111111111111111111111";
const contract = "KT1TokenContract1111111111111111111111";

test("FIFO realized P&L consumes purchase lots and leaves remaining cost for holdings", () => {
  const result = calculatePortfolioCosting({
    wallets: [wallet],
    holdings: [
      {
        walletAddress: wallet,
        tokenContract: contract,
        tokenId: "1",
        quantity: 1,
        floorMutez: 7_000_000,
      },
    ],
    sales: [
      {
        buyerAddress: wallet,
        sellerAddress: other,
        tokenContract: contract,
        tokenId: "1",
        priceMutez: 10_000_000,
        soldAt: "2026-01-01T00:00:00Z",
        opHash: "opBuy",
        editionsSold: 2,
      },
      {
        buyerAddress: other,
        sellerAddress: wallet,
        tokenContract: contract,
        tokenId: "1",
        priceMutez: 8_000_000,
        soldAt: "2026-02-01T00:00:00Z",
        opHash: "opSell",
        editionsSold: 1,
      },
    ],
  });

  assert.equal(result.realized[0].costBasisMutez, 5_000_000n);
  assert.equal(result.realized[0].realizedPnlMutez, 3_000_000n);
  assert.equal(result.rows[0].costBasisMutez, 5_000_000n);
  assert.equal(result.rows[0].estimatedValueMutez, 7_000_000n);
  assert.equal(result.rows[0].unrealizedPnlMutez, 2_000_000n);
  assert.equal(result.totals.unrealizedPnlMutez, 2_000_000n);
});

test("free-transfer evidence labels a holding without treating the gift as priced P&L", () => {
  const result = calculatePortfolioCosting({
    wallets: [wallet],
    holdings: [
      {
        walletAddress: wallet,
        tokenContract: contract,
        tokenId: "2",
        quantity: 1,
        floorMutez: 3_000_000,
      },
    ],
    sales: [],
    freeTransfers: [
      {
        walletAddress: wallet,
        tokenContract: contract,
        tokenId: "2",
        timestamp: "2026-01-05T00:00:00Z",
        opHash: "opGift",
      },
    ],
  });

  assert.deepEqual(result.rows[0].acquisitionTypes, ["free_transfer"]);
  assert.equal(result.rows[0].costBasisMutez, null);
  assert.equal(result.rows[0].unknownQuantity, 1);
  assert.equal(result.totals.pricedPositions, 0);
  assert.equal(result.totals.freeTransferPositions, 1);
});

test("BIN traps are excluded from totals but preserved on rows", () => {
  const result = calculatePortfolioCosting({
    wallets: [wallet],
    holdings: [
      {
        walletAddress: wallet,
        tokenContract: contract,
        tokenId: "3",
        quantity: 1,
        floorMutez: 600_000_000,
      },
    ],
    sales: [
      {
        buyerAddress: wallet,
        sellerAddress: other,
        tokenContract: contract,
        tokenId: "3",
        priceMutez: 5_000_000,
        soldAt: "2026-01-01T00:00:00Z",
        opHash: "opBuyTrap",
      },
    ],
  });

  assert.equal(result.rows[0].binTrap, true);
  assert.equal(result.rows[0].unrealizedPnlMutez, 595_000_000n);
  assert.equal(result.totals.binTrapPositions, 1);
  assert.equal(result.totals.pricedPositions, 0);
  assert.equal(result.totals.estimatedValueMutez, 0n);
});

test("duplicate sale rows with the same op hash can be excluded before costing", () => {
  const result = calculatePortfolioCosting({
    wallets: [wallet],
    holdings: [],
    sales: [
      {
        buyerAddress: wallet,
        sellerAddress: other,
        tokenContract: contract,
        tokenId: "4",
        priceMutez: 4_000_000,
        soldAt: "2026-01-01T00:00:00Z",
        opHash: "opBuyOnce",
      },
      {
        buyerAddress: other,
        sellerAddress: wallet,
        tokenContract: contract,
        tokenId: "4",
        priceMutez: 5_000_000,
        soldAt: "2026-02-01T00:00:00Z",
        opHash: "opSellOnce",
      },
    ],
  });

  assert.equal(result.realized[0].costBasisMutez, 4_000_000n);
  assert.equal(result.realized[0].realizedPnlMutez, 1_000_000n);
});
