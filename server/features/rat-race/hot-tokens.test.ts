import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRatRacePurchaseIntent,
  rankRatRaceCandidates,
  type RatRaceCandidateRow,
} from "./hot-tokens";

const now = new Date("2026-05-26T12:00:00Z");

function row(overrides: Partial<RatRaceCandidateRow> = {}): RatRaceCandidateRow {
  return {
    token_contract: "KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4",
    token_id: "42",
    token_name: "Fast Edition",
    token_thumbnail: "ipfs://bafy/thumb.png",
    creator_address: "tz1Creator",
    metadata_supply: 10,
    minted_editions: 10,
    minted_at: "2026-05-25T12:00:00Z",
    first_listed_at: "2026-05-25T13:00:00Z",
    last_sale_at: "2026-05-26T11:30:00Z",
    sale_count: 6,
    sold_editions: 6,
    primary_sold_editions: 6,
    recent_sale_count: 3,
    recent_editions_sold: 3,
    active_listing_count: 4,
    floor_mutez: "1200000",
    listing_id: "101",
    marketplace_contract: "KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4",
    listing_price_mutez: "1200000",
    ...overrides,
  };
}

test("Rat Race filters for half-sold tokens with multiple recent sales", () => {
  const ranked = rankRatRaceCandidates(
    [
      row({ token_id: "1", sold_editions: 6, recent_sale_count: 3 }),
      row({ token_id: "2", sold_editions: 4, primary_sold_editions: 4, recent_sale_count: 3 }),
      row({ token_id: "3", sold_editions: 8, recent_sale_count: 1 }),
    ],
    {
      windowHours: 24,
      mintedWithinDays: 7,
      minSoldPercent: 50,
      minRecentSales: 2,
      limit: 10,
      now,
    }
  );

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].tokenId, "1");
  assert.equal(ranked[0].soldPercent, 60);
  assert.equal(ranked[0].source, "tz2at-firehose");
});

test("Rat Race ranks shortest estimated sellout first", () => {
  const ranked = rankRatRaceCandidates(
    [
      row({ token_id: "slow", sold_editions: 5, recent_editions_sold: 2, recent_sale_count: 2 }),
      row({ token_id: "fast", sold_editions: 9, recent_editions_sold: 4, recent_sale_count: 4 }),
    ],
    {
      windowHours: 24,
      mintedWithinDays: 7,
      minSoldPercent: 50,
      minRecentSales: 2,
      limit: 10,
      now,
    }
  );

  assert.equal(ranked[0].tokenId, "fast");
  assert.ok((ranked[0].hoursToSellout ?? 99) < (ranked[1].hoursToSellout ?? 100));
});

test("Rat Race excludes editions minted outside the hot mint window", () => {
  const ranked = rankRatRaceCandidates(
    [row({ token_id: "old", minted_at: "2026-04-01T12:00:00Z" }), row({ token_id: "fresh" })],
    {
      windowHours: 24,
      mintedWithinDays: 7,
      minSoldPercent: 50,
      minRecentSales: 2,
      limit: 10,
      now,
    }
  );

  assert.deepEqual(ranked.map((item) => item.tokenId), ["fresh"]);
});

test("Rat Race refuses to rank when total edition supply is unknown", () => {
  const ranked = rankRatRaceCandidates(
    [row({ metadata_supply: null, minted_editions: null, sold_editions: 2, recent_sale_count: 3 })],
    {
      windowHours: 24,
      mintedWithinDays: 7,
      minSoldPercent: 50,
      minRecentSales: 2,
      limit: 10,
      now,
    }
  );

  assert.equal(ranked.length, 0);
});

test("Rat Race refuses to rank without an active rolling listing signal", () => {
  const ranked = rankRatRaceCandidates(
    [row({ active_listing_count: 0, listing_id: null, floor_mutez: null, listing_price_mutez: null })],
    {
      windowHours: 24,
      mintedWithinDays: 7,
      minSoldPercent: 50,
      minRecentSales: 2,
      limit: 10,
      now,
    }
  );

  assert.equal(ranked.length, 0);
});

test("Rat Race exposes direct contract purchase only for allowlisted marketplace shapes", () => {
  assert.equal(buildRatRacePurchaseIntent(row()).entrypoint, "fulfill_ask");
  assert.equal(
    buildRatRacePurchaseIntent(
      row({
        marketplace_contract: "KT1KzmnX6Ffip7zVgGiCUV6ygqDU8hhGsMAy",
      })
    ).entrypoint,
    "buy"
  );
  assert.equal(
    buildRatRacePurchaseIntent(row({ marketplace_contract: "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w" })).entrypoint,
    "collect"
  );
  assert.equal(buildRatRacePurchaseIntent(row({ marketplace_contract: "KT1Unknown" })).supported, false);
});
