import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSkywireTokenPurchaseIntent,
  parseSkywireTokenUrl,
  resolveSkywireTokenMarket,
  type SkywireObjktGraphql,
} from "./skywire-token-market";

test("Skywire token parser recognizes objkt asset, token, collection, open edition, and Teia links", () => {
  assert.deepEqual(parseSkywireTokenUrl("https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123"), {
    source: "objkt",
    sourceUrl: "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123",
    faContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    faSlug: null,
    tokenId: "123",
    marketUrl: "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://objkt.com/tokens/clean_slug/456"), {
    source: "objkt",
    sourceUrl: "https://objkt.com/tokens/clean_slug/456",
    faContract: null,
    faSlug: "clean_slug",
    tokenId: "456",
    marketUrl: "https://objkt.com/tokens/clean_slug/456",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://objkt.com/token/clean_slug/456"), {
    source: "objkt",
    sourceUrl: "https://objkt.com/token/clean_slug/456",
    faContract: null,
    faSlug: "clean_slug",
    tokenId: "456",
    marketUrl: "https://objkt.com/tokens/clean_slug/456",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://objkt.com/asset/open_objkt/111"), {
    source: "objkt",
    sourceUrl: "https://objkt.com/asset/open_objkt/111",
    faContract: "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E",
    faSlug: "open_objkt",
    tokenId: "111",
    marketUrl: "https://objkt.com/tokens/open_objkt/111",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://objkt.com/collections/clean_slug/tokens/222"), {
    source: "objkt",
    sourceUrl: "https://objkt.com/collections/clean_slug/tokens/222",
    faContract: null,
    faSlug: "clean_slug",
    tokenId: "222",
    marketUrl: "https://objkt.com/tokens/clean_slug/222",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://objkt.com/open-edition/333"), {
    source: "objkt",
    sourceUrl: "https://objkt.com/open-edition/333",
    faContract: "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E",
    faSlug: "open_objkt",
    tokenId: "333",
    marketUrl: "https://objkt.com/tokens/open_objkt/333",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://teia.art/objkt/789"), {
    source: "teia",
    sourceUrl: "https://teia.art/objkt/789",
    faContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    faSlug: null,
    tokenId: "789",
    marketUrl: "https://teia.art/objkt/789",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789"), {
    source: "teia",
    sourceUrl: "https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
    faContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    faSlug: null,
    tokenId: "789",
    marketUrl: "https://teia.art/objkt/789",
  });
  assert.deepEqual(parseSkywireTokenUrl("https://teia.art/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789"), {
    source: "teia",
    sourceUrl: "https://teia.art/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
    faContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    faSlug: null,
    tokenId: "789",
    marketUrl: "https://teia.art/objkt/789",
  });
});

test("Skywire token market resolver maps the lowest tez listing to a direct purchase intent", async () => {
  const graphql: SkywireObjktGraphql = async <T = any>(query: string): Promise<T> => {
    assert.match(query, /SkywireTokenMarket/);
    return {
      token: [
        {
          fa_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          token_id: "123",
          name: "Radio Token",
          thumbnail_uri: "ipfs://bafy/thumb.png",
          fa: { name: "Radio Collection", path: "radio" },
          creators: [{ creator_address: "tz1Creator", holder: { alias: "Creator" } }],
          listings_active: [
            {
              marketplace_contract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
              id: "999",
              bigmap_key: "777",
              price: "2500000",
              currency_id: 1,
              seller_address: "tz1Seller",
              amount_left: 1,
              target_address: null,
            },
          ],
          open_edition_active: null,
        },
      ],
    } as T;
  };

  const market = await resolveSkywireTokenMarket(
    "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123",
    graphql,
  );

  assert.equal(market.token?.title, "Radio Token");
  assert.equal(market.token?.imageUrl, "https://ipfs.io/ipfs/bafy/thumb.png");
  assert.equal(market.listing?.priceTez, "2.5");
  assert.equal(market.purchaseIntent.supported, true);
  assert.equal(market.purchaseIntent.entrypoint, "fulfill_ask");
  assert.equal(market.purchaseIntent.listingId, "777");
});

test("Skywire token market resolver resolves objkt collection slugs before token lookup", async () => {
  const queries: string[] = [];
  const graphql: SkywireObjktGraphql = async <T = any>(query: string): Promise<T> => {
    queries.push(query);
    if (/SkywireFaByPath/.test(query)) {
      return { fa: [{ contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" }] } as T;
    }
    return {
      token: [
        {
          fa_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          token_id: "123",
          name: "Slug Token",
          thumbnail_uri: null,
          fa: { name: "Slug Collection", path: "slug" },
          creators: [],
          listings_active: [],
          open_edition_active: null,
        },
      ],
    } as T;
  };

  const market = await resolveSkywireTokenMarket("https://objkt.com/asset/slug/123", graphql);
  assert.equal(market.reference.faContract, "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton");
  assert.equal(market.token?.title, "Slug Token");
  assert.equal(queries.length, 2);
});

test("Skywire token market resolver maps contractful Teia objkt links to Teia collect intents", async () => {
  const graphql: SkywireObjktGraphql = async <T = any>(query: string): Promise<T> => {
    assert.match(query, /SkywireTokenMarket/);
    return {
      token: [
        {
          fa_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          token_id: "789",
          name: "Teia Swap",
          thumbnail_uri: null,
          fa: { name: "Teia Collection", path: "teia" },
          creators: [{ creator_address: "tz1Creator", holder: { alias: "Teia Creator" } }],
          listings_active: [
            {
              marketplace_contract: "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w",
              id: "2002",
              bigmap_key: "12002",
              price: "1500000",
              currency_id: 1,
              seller_address: "tz1Seller",
              amount_left: 3,
              target_address: null,
            },
          ],
          open_edition_active: null,
        },
      ],
    } as T;
  };

  const market = await resolveSkywireTokenMarket(
    "https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
    graphql,
  );

  assert.equal(market.reference.source, "teia");
  assert.equal(market.reference.faContract, "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton");
  assert.equal(market.reference.tokenId, "789");
  assert.equal(market.listing?.marketplaceName, "Teia");
  assert.equal(market.listing?.priceTez, "1.5");
  assert.equal(market.purchaseIntent.supported, true);
  assert.equal(market.purchaseIntent.marketplaceName, "Teia");
  assert.equal(market.purchaseIntent.entrypoint, "collect");
  assert.equal(market.purchaseIntent.listingId, "12002");
});

test("Skywire token market resolver maps open editions to one in-app claim", async () => {
  const graphql: SkywireObjktGraphql = async <T = any>(query: string): Promise<T> => {
    assert.match(query, /SkywireTokenMarket/);
    return {
      token: [
        {
          fa_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          token_id: "123",
          name: "Open Radio",
          thumbnail_uri: null,
          fa: { name: "Radio Collection", path: "radio" },
          creators: [{ creator_address: "tz1Creator", holder: { alias: "Creator" } }],
          listings_active: [],
          open_edition_active: {
            price: "1000000",
            seller_address: "tz1Seller",
          },
        },
      ],
    } as T;
  };

  const market = await resolveSkywireTokenMarket(
    "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123",
    graphql,
  );

  assert.equal(market.listing?.kind, "open_edition");
  assert.equal(market.purchaseIntent.supported, true);
  assert.equal(market.purchaseIntent.entrypoint, "claim");
  assert.equal(market.purchaseIntent.listingId, "123");
  assert.equal(market.purchaseIntent.amount, 1);
  assert.equal(market.purchaseIntent.totalMutez, "1000000");
});

test("Skywire direct-buy intent refuses targeted, non-tez, and unknown listings", () => {
  assert.equal(
    buildSkywireTokenPurchaseIntent({
      kind: "fixed_listing",
      marketplaceContract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
      listingId: "1",
      priceMutez: "1000000",
      currencyId: 2,
      targetAddress: null,
    }).supported,
    false,
  );
  assert.equal(
    buildSkywireTokenPurchaseIntent({
      kind: "fixed_listing",
      marketplaceContract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
      listingId: "1",
      priceMutez: "1000000",
      currencyId: 1,
      targetAddress: "tz1Target",
    }).supported,
    false,
  );
  assert.equal(
    buildSkywireTokenPurchaseIntent({
      kind: "fixed_listing",
      marketplaceContract: "KT1Unknown",
      listingId: "1",
      priceMutez: "1000000",
      currencyId: 1,
      targetAddress: null,
    }).supported,
    false,
  );
  const openEditionIntent = buildSkywireTokenPurchaseIntent({
    kind: "open_edition",
    marketplaceContract: "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E",
    listingId: "1",
    priceMutez: "0",
  });
  assert.equal(openEditionIntent.supported, true);
  assert.equal(openEditionIntent.entrypoint, "claim");
  assert.equal(openEditionIntent.amount, 1);
});
