import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTz2atAtprotoRatRaceRows,
  normalizeTz2atCollectRecord,
  normalizeTz2atTransferRecord,
  type Tz2atRepoRecord,
} from "./tz2at-atproto";
import type { RatRaceFilter } from "./hot-tokens";

const tokenContract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

const filter: RatRaceFilter = {
  windowHours: 24,
  mintedWithinDays: 14,
  minSoldPercent: 50,
  minRecentSales: 2,
  limit: 10,
  now: new Date("2026-05-26T20:00:00Z"),
};

test("normalizes tz2at marketplace collect and FA2 transfer records", () => {
  const collect = normalizeTz2atCollectRecord({
    value: {
      buyer: "tz1Buyer",
      tokenId: 7,
      timestamp: "2026-05-26T18:00:00Z",
      priceMutez: "100000",
      marketplace: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
      operationHash: "opHash",
      subjectAddresses: [tokenContract, "tz1Buyer"],
    },
  });
  const transfer = normalizeTz2atTransferRecord({
    value: {
      from: "tz1Seller",
      to: "tz1Buyer",
      amount: "2",
      tokenId: "7",
      contract: tokenContract,
      timestamp: "2026-05-26T18:00:01Z",
      operationHash: "opHash",
    },
  });

  assert.equal(collect?.tokenId, "7");
  assert.equal(collect?.priceMutez, "100000");
  assert.equal(transfer?.amount, 2);
  assert.equal(transfer?.tokenContract, tokenContract);
});

test("builds Rat Race rows by resolving collect records through Objkt metadata and listings", async () => {
  const collectRecords: Tz2atRepoRecord<any>[] = [
    {
      value: {
        buyer: "tz1Buyer",
        tokenId: "77",
        timestamp: "2026-05-26T18:00:00Z",
        priceMutez: "100000",
        marketplace: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
        operationHash: "opA",
        subjectAddresses: [
          "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
          tokenContract,
          "tz1Buyer",
        ],
      },
    },
    {
      value: {
        buyer: "tz1Buyer2",
        tokenId: "77",
        timestamp: "2026-05-26T19:00:00Z",
        priceMutez: "110000",
        marketplace: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
        operationHash: "opB",
        subjectAddresses: [
          "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
          tokenContract,
          "tz1Buyer2",
        ],
      },
    },
  ];
  const collects = collectRecords.map(normalizeTz2atCollectRecord).filter(Boolean) as any;
  const hydrated = new Map([
    [
      `${tokenContract}:77`,
      {
        token: {
          fa_contract: tokenContract,
          token_id: "77",
          name: "Running Out",
          supply: 4,
          timestamp: "2026-05-25T18:00:00Z",
          thumbnail_uri: "ipfs://bafy/thumb.png",
          creators: [{ creator_address: "tz1Creator" }],
        },
        listings: [
          {
            id: "300",
            price: "120000",
            amount_left: 2,
            status: "active",
            seller_address: "tz1Seller",
            marketplace_contract: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
            timestamp: "2026-05-25T19:00:00Z",
            token: { fa_contract: tokenContract, token_id: "77" },
          },
        ],
      },
    ],
  ]);

  const rows = await buildTz2atAtprotoRatRaceRows(collects, [], filter, hydrated);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_contract, tokenContract);
  assert.equal(rows[0].token_name, "Running Out");
  assert.equal(rows[0].metadata_supply, 4);
  assert.equal(rows[0].sold_editions, 2);
  assert.equal(rows[0].recent_sale_count, 2);
  assert.equal(rows[0].listing_id, "300");
});
