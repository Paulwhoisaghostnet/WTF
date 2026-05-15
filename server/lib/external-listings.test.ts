import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

const {
  buildObjktListingsQuery,
  fetchObjktListingsForWallet,
  normalizeObjktListingRows,
} = await import("./external-listings");

test("WTF-BB-027 builds a bounded Objkt seller listing query", () => {
  const payload = buildObjktListingsQuery("tz1Seller");

  assert.match(payload.query, /seller_address: \{ _eq: \$seller \}/);
  assert.match(payload.query, /status: \{ _eq: "active" \}/);
  assert.match(payload.query, /token \{/);
  assert.deepEqual(payload.variables, { seller: "tz1Seller", limit: 200 });
});

test("WTF-BB-027 normalizes and dedupes active Objkt listing rows", () => {
  const normalized = normalizeObjktListingRows([
    {
      id: 9,
      status: "active",
      price: "1200000",
      amount_left: "2",
      marketplace_contract: "KT1ObjktMarket",
      token: { fa_contract: "KT1Token", token_id: "7" },
    },
    {
      id: 9,
      status: "active",
      price: "1200000",
      amount_left: "2",
      marketplace_contract: "KT1ObjktMarket",
      token: { fa_contract: "KT1Token", token_id: "7" },
    },
    {
      id: 10,
      status: "cancelled",
      price: "990000",
      amount_left: "1",
      marketplace_contract: "KT1ObjktMarket",
      token: { fa_contract: "KT1Token", token_id: "8" },
    },
    {
      id: 11,
      status: "active",
      price: null,
      amount_left: null,
      token: { fa_contract: "KT1Token", token_id: 9 },
    },
    {
      id: 12,
      status: "active",
      price: "1",
      amount_left: "1",
      token: { fa_contract: "", token_id: "10" },
    },
  ]);

  assert.deepEqual(normalized, [
    {
      tokenContract: "KT1Token",
      tokenId: "7",
      quantity: 2,
      priceMutez: 1200000,
      externalUrl: "https://objkt.com/tokens/KT1Token/7",
      marketplace: "KT1ObjktMarket",
      listingId: "9",
    },
    {
      tokenContract: "KT1Token",
      tokenId: "9",
      quantity: 1,
      priceMutez: undefined,
      externalUrl: "https://objkt.com/tokens/KT1Token/9",
      marketplace: "objkt",
      listingId: "11",
    },
  ]);
});

test("WTF-BB-027 fetchObjktListingsForWallet uses the shared client shape", async () => {
  const calls: unknown[] = [];
  const client = {
    async postJson(_path: string, body: unknown) {
      calls.push(body);
      return {
        data: {
          listing: [
            {
              id: "abc",
              status: "active",
              price: 42,
              amount_left: 1,
              token: { fa_contract: "KT1Token", token_id: "1" },
            },
          ],
        },
      };
    },
  };

  const listings = await fetchObjktListingsForWallet(" tz1Seller ", client);

  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as any).variables, { seller: "tz1Seller", limit: 200 });
  assert.equal(listings.length, 1);
  assert.equal(listings[0].listingId, "abc");
});

test("WTF-BB-027 fetchObjktListingsForWallet fails closed on GraphQL errors", async () => {
  const client = {
    async postJson() {
      return { errors: [{ message: "schema changed" }] };
    },
  };

  await assert.rejects(
    fetchObjktListingsForWallet("tz1Seller", client),
    /Objkt listings GraphQL error: schema changed/
  );
});
