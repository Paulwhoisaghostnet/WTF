import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateCreatorScore, compareCreatorScores } from "./scoring";

describe("tezos-intel creator scoring", () => {
  it("grades creators from bounded market signals", () => {
    const score = calculateCreatorScore({
      creatorAddress: "tz1Creator11111111111111111111111111",
      tokenCount: 80,
      saleCount: 40,
      collectorCount: 55,
      activeListingCount: 12,
      totalVolumeMutez: 250_000_000,
      highestSaleMutez: 50_000_000,
      floorMutez: 2_000_000,
      lastSaleAt: new Date().toISOString(),
    });

    assert.equal(score.grade === "A" || score.grade === "B", true);
    assert.equal(score.score > 60, true);
    assert.equal(score.breakdown.liquidity > 0, true);
  });

  it("sorts compare output by score", () => {
    const [top] = compareCreatorScores([
      {
        creatorAddress: "tz1Quiet111111111111111111111111111",
        tokenCount: 2,
        saleCount: 0,
        collectorCount: 0,
        activeListingCount: 0,
        totalVolumeMutez: 0,
        highestSaleMutez: 0,
        floorMutez: 0,
        lastSaleAt: null,
      },
      {
        creatorAddress: "tz1Active11111111111111111111111111",
        tokenCount: 12,
        saleCount: 14,
        collectorCount: 10,
        activeListingCount: 4,
        totalVolumeMutez: 90_000_000,
        highestSaleMutez: 20_000_000,
        floorMutez: 2_000_000,
        lastSaleAt: new Date().toISOString(),
      },
    ]);

    assert.equal(top.creatorAddress, "tz1Active11111111111111111111111111");
  });
});
