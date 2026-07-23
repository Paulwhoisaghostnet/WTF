import assert from "node:assert/strict";
import test from "node:test";
import { discoverObjktCreators, fetchObjktCreatorPortfolio } from "./market";

const creatorA = `tz1${"2".repeat(33)}`;
const creatorB = `tz1${"3".repeat(33)}`;
const creatorC = `tz1${"4".repeat(33)}`;

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("creator discovery excludes the current review set so the next round rotates", async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    calls.push(body);
    if (calls.length === 1) {
      return jsonResponse({
        listing_sale: [
          {
            price_xtz: 1_000_000,
            timestamp: new Date().toISOString(),
            buyer_address: creatorB,
            token: { creators: [{ creator_address: creatorA, verified: true, holder: { alias: "Pinned artist" } }] },
          },
          {
            price_xtz: 2_000_000,
            timestamp: new Date().toISOString(),
            buyer_address: creatorB,
            token: { creators: [{ creator_address: creatorB, verified: true, holder: { alias: "New artist B" } }] },
          },
          {
            price_xtz: 3_000_000,
            timestamp: new Date().toISOString(),
            buyer_address: creatorC,
            token: { creators: [{ creator_address: creatorC, verified: false, holder: { alias: "New artist C" } }] },
          },
        ],
      });
    }
    return jsonResponse({
      token: [creatorB, creatorC].map((address) => ({
        lowest_ask: 500_000,
        creators: [{ creator_address: address }],
        listings_active: [{
          amount_left: 1,
          price_xtz: 500_000,
          currency: { type: "tez", symbol: "XTZ", decimals: 6 },
        }],
      })),
    });
  };

  const creators = await discoverObjktCreators(2, 2, fetchImpl, [creatorA]);

  assert.deepEqual(new Set(creators.map((creator) => creator.address)), new Set([creatorB, creatorC]));
  assert.equal(calls[0]?.variables.limit, 300);
  assert.deepEqual(new Set(calls[1]?.variables.creators as string[]), new Set([creatorB, creatorC]));
});

test("creator portfolio normalizes recent work and sales activity", async () => {
  const fetchImpl = async () => jsonResponse({
    token: [{
      token_id: "42",
      fa_contract: `KT1${"1".repeat(33)}`,
      name: "Recent Study",
      display_uri: "ipfs://bafybeirecent",
      thumbnail_uri: "ipfs://bafybeithumb",
      mime: "image/png",
      supply: 10,
      timestamp: new Date().toISOString(),
      lowest_ask: 750_000,
      average: 1_250_000,
      listing_sales: [
        { price_xtz: 1_000_000, timestamp: new Date().toISOString(), buyer_address: creatorB },
        { price_xtz: 1_500_000, timestamp: new Date().toISOString(), buyer_address: creatorC },
      ],
    }],
  });

  const works = await fetchObjktCreatorPortfolio(creatorA, 12, fetchImpl);

  assert.equal(works.length, 1);
  assert.deepEqual(works[0], {
    id: `KT1${"1".repeat(33)}:42`,
    contract: `KT1${"1".repeat(33)}`,
    tokenId: "42",
    name: "Recent Study",
    displayUri: "ipfs://bafybeirecent",
    thumbnailUri: "ipfs://bafybeithumb",
    mime: "image/png",
    supply: 10,
    mintedAt: works[0]!.mintedAt,
    lowestAskXtz: 0.75,
    medianSaleXtz: 1.25,
    averageSaleXtz: 1.25,
    recentSales30d: 2,
    recentSales180d: 2,
    uniqueRecentBuyers: 2,
    objktUrl: `https://objkt.com/asset/KT1${"1".repeat(33)}/42`,
  });
});
