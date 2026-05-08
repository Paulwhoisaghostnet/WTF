import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDiscountToRawUnits,
  buildPricingBands,
  ceilRawUnitsToWholeWtf,
  IN_APP_MARKET_PRICING_TIERS,
  suggestPriceForItem,
  WTF_RAW_UNITS_PER_WHOLE,
} from "./pricing";

function raw(wholeWtf: number): string {
  return (BigInt(wholeWtf) * WTF_RAW_UNITS_PER_WHOLE).toString();
}

test("pricing tiers reserve double-digit common items and triple-digit uncommon floor", () => {
  assert.deepEqual(
    IN_APP_MARKET_PRICING_TIERS.slice(0, 3).map((tier) => ({
      tier: tier.tier,
      minWtf: tier.minWtf,
      maxWtf: tier.maxWtf,
      curve: tier.curve,
    })),
    [
      { tier: 1, minWtf: 1, maxWtf: 99, curve: "linear" },
      { tier: 2, minWtf: 100, maxWtf: 499, curve: "linear" },
      { tier: 3, minWtf: 500, maxWtf: 1999, curve: "linear" },
    ]
  );
});

test("locked arcade and mop anchors shape the low-tier price bands", () => {
  const bands = buildPricingBands([
    {
      id: 1,
      sku: "arcade-play-card",
      category: "arcade",
      priceWtfUnits: raw(1),
      rarityTier: 1,
      priceScore: 1,
      priceWtfLocked: true,
      priceScoreLocked: true,
      metadata: {},
    },
    {
      id: 2,
      sku: "arcade-play-ticket",
      category: "arcade",
      priceWtfUnits: raw(10),
      rarityTier: 1,
      priceScore: 2,
      priceWtfLocked: true,
      priceScoreLocked: true,
      metadata: {},
    },
    {
      id: 3,
      sku: "desktop-mop",
      category: "desktop_fun",
      priceWtfUnits: raw(100),
      rarityTier: 2,
      priceScore: 1,
      priceWtfLocked: true,
      priceScoreLocked: true,
      metadata: {},
    },
  ]);

  assert.equal(bands[0].effectiveMinWtf, 1);
  assert.equal(bands[0].effectiveMaxWtf, 99);
  assert.equal(bands[0].anchorCount, 2);
  assert.equal(bands[1].effectiveMinWtf, 100);
  assert.equal(bands[1].anchorCount, 1);
});

test("rare vacuum suggestion lands above uncommon floor without locking WTF", () => {
  const bands = buildPricingBands([]);
  const suggested = BigInt(
    suggestPriceForItem(
      {
        rarityTier: 3,
        priceScore: 2,
        priceWtfUnits: raw(70),
        priceWtfLocked: false,
        metadata: {},
      },
      bands
    )
  );
  assert.ok(suggested >= BigInt(raw(500)));
  assert.ok(suggested <= BigInt(raw(800)));
});

test("sale discounts round the cart total up to whole WTF", () => {
  const halfWtf = applyDiscountToRawUnits(rawBigInt(1), 50);
  assert.equal(halfWtf.toString(), "50000000");
  assert.equal(ceilRawUnitsToWholeWtf(halfWtf).toString(), raw(1));

  const eightPointFive = applyDiscountToRawUnits(rawBigInt(10), 15);
  assert.equal(eightPointFive.toString(), "850000000");
  assert.equal(ceilRawUnitsToWholeWtf(eightPointFive).toString(), raw(9));
});

function rawBigInt(wholeWtf: number): bigint {
  return BigInt(raw(wholeWtf));
}
