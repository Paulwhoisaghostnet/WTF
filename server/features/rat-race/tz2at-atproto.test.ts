import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTz2atAtprotoRatRaceRows,
  loadTz2atRatRaceRows,
  loadTz2atReplayRatRaceRows,
  normalizeTz2atCollectRecord,
  normalizeTz2atListingSignalRecord,
  normalizeTz2atTransferRecord,
  type Tz2atRepoRecord,
} from "./tz2at-atproto";
import { buildRatRacePurchaseIntent, type RatRaceFilter } from "./hot-tokens";

const tokenContract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

const filter: RatRaceFilter = {
  windowHours: 24,
  mintedWithinDays: 7,
  minSoldPercent: 50,
  minRecentSales: 2,
  limit: 10,
  now: new Date("2026-05-26T20:00:00Z"),
};

test("normalizes tz2at marketplace collect and FA2 transfer records", () => {
  const collect = normalizeTz2atCollectRecord({
    value: {
      buyer: "tz1Buyer",
      seller: "tz1Seller",
      amount: "2",
      tokenId: 7,
      tokenContract,
      tokenRef: `tezos:mainnet:${tokenContract}:token:7`,
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
  assert.equal(collect?.tokenContract, tokenContract);
  assert.equal(collect?.amount, 2);
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

test("uses tz2at listing signals while keeping Objkt direct-buy keys", async () => {
  const collects = [
    normalizeTz2atCollectRecord({
      value: {
        buyer: "tz1Buyer",
        seller: "tz1Seller",
        amount: "1",
        tokenId: "78",
        tokenContract,
        timestamp: "2026-05-26T18:00:00Z",
        priceMutez: "100000",
        marketplace: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
        operationHash: "opA",
        subjectAddresses: [tokenContract, "tz1Buyer", "tz1Seller"],
      },
    }),
    normalizeTz2atCollectRecord({
      value: {
        buyer: "tz1Buyer2",
        seller: "tz1Seller",
        amount: "1",
        tokenId: "78",
        tokenContract,
        timestamp: "2026-05-26T19:00:00Z",
        priceMutez: "110000",
        marketplace: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
        operationHash: "opB",
        subjectAddresses: [tokenContract, "tz1Buyer2", "tz1Seller"],
      },
    }),
  ].filter(Boolean) as any;
  const listingSignals = [
    normalizeTz2atListingSignalRecord({
      value: {
        $type: "store.tz2at.marketplace.swap",
        amount: "2",
        tokenId: "78",
        tokenContract,
        timestamp: "2026-05-26T17:00:00Z",
        priceMutez: "90000",
        marketplace: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
        operationHash: "opList",
        entrypoint: "list_create",
        subjectAddresses: [tokenContract, "tz1Seller"],
      },
    }),
  ].filter(Boolean) as any;
  const hydrated = new Map([
    [
      `${tokenContract}:78`,
      {
        token: {
          fa_contract: tokenContract,
          token_id: "78",
          name: "tz2at Listed",
          supply: 4,
          timestamp: "2026-05-25T18:00:00Z",
          creators: [{ creator_address: "tz1Creator" }],
        },
        listings: [
          {
            id: "999",
            bigmap_key: "301",
            currency_id: 1,
            target_address: null,
            price: "100000",
            amount_left: 1,
            status: "active",
            marketplace_contract: "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
            timestamp: "2026-05-26T17:30:00Z",
            token: { fa_contract: tokenContract, token_id: "78" },
          },
        ],
      },
    ],
  ]);

  const rows = await buildTz2atAtprotoRatRaceRows(collects, [], filter, hydrated, listingSignals);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].active_listing_count, 1);
  assert.equal(rows[0].floor_mutez, "90000");
  assert.equal(rows[0].listing_id, "301");
  assert.equal(rows[0].listing_price_mutez, "100000");
  assert.equal(rows[0].marketplace_contract, "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq");
  assert.equal(buildRatRacePurchaseIntent(rows[0]).supported, true);
});

test("builds Rat Race rows from the fresh tz2at replay record stream", async () => {
  const replayEvents = [
    {
      event: {
        $type: "xyz.tz2at.marketplace.collect",
        buyer: "tz1Buyer",
        seller: "tz1Seller",
        amount: "1",
        network: "mainnet",
        tokenId: "88",
        tokenContract,
        tokenRef: `tezos:mainnet:${tokenContract}:token:88`,
        timestamp: "2026-05-26T18:00:00Z",
        blockLevel: 1000,
        priceMutez: "100000",
        marketplace: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        operationHash: "opA",
        eventIndex: 10001,
        subjectAddresses: ["KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X", tokenContract, "tz1Buyer", "tz1Seller"],
      },
    },
    {
      event: {
        $type: "xyz.tz2at.marketplace.collect",
        buyer: "tz1Buyer2",
        seller: "tz1Seller",
        amount: "1",
        network: "mainnet",
        tokenId: "88",
        tokenContract,
        tokenRef: `tezos:mainnet:${tokenContract}:token:88`,
        timestamp: "2026-05-26T19:00:00Z",
        blockLevel: 1001,
        priceMutez: "110000",
        marketplace: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        operationHash: "opB",
        eventIndex: 10001,
        subjectAddresses: ["KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X", tokenContract, "tz1Buyer2", "tz1Seller"],
      },
    },
  ];
  const tz2atClient = {
    async getJson<T>(path: string): Promise<T> {
      if (path === "/health") return { rollingIndexer: { lastLevel: 1001, headLevel: 1001, ok: true } } as T;
      if (path === "/replay") return replayEvents as T;
      throw new Error(`unexpected tz2at path ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      return {
        data: {
          token: [
            {
              fa_contract: tokenContract,
              token_id: "88",
              name: "Replay Runner",
              supply: 4,
              timestamp: "2026-05-25T18:00:00Z",
              creators: [{ creator_address: "tz1Creator" }],
            },
          ],
          listing: [
            {
              id: "900",
              price: "130000",
              amount_left: 2,
              status: "active",
              marketplace_contract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
              timestamp: "2026-05-26T17:00:00Z",
              token: { fa_contract: tokenContract, token_id: "88" },
            },
          ],
        },
      } as T;
    },
  };

  const rows = await loadTz2atReplayRatRaceRows(filter, { tz2atClient, objktClient });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_contract, tokenContract);
  assert.equal(rows[0].token_name, "Replay Runner");
  assert.equal(rows[0].metadata_supply, 4);
  assert.equal(rows[0].sold_editions, 2);
  assert.equal(rows[0].recent_sale_count, 2);
  assert.equal(rows[0].listing_id, "900");
});

test("hydrates Objkt replay records that carry token pk instead of FA2 token id", async () => {
  const objktContract = "KT1NffzaN4wHEXviSXgAnwwxDHRUJ5g7ZC44";
  const replayEvents = [
    {
      event: {
        $type: "xyz.tz2at.marketplace.collect",
        buyer: "tz1Buyer",
        amount: "1",
        network: "mainnet",
        tokenId: "77144222",
        tokenContract: objktContract,
        tokenRef: `tezos:mainnet:${objktContract}:token:77144222`,
        timestamp: "2026-05-26T18:00:00Z",
        blockLevel: 1000,
        priceMutez: "35000000",
        marketplace: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        operationHash: "opObjktA",
        subjectAddresses: [objktContract, "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X", "tz1Buyer"],
      },
    },
    {
      event: {
        $type: "xyz.tz2at.marketplace.collect",
        buyer: "tz1Buyer2",
        amount: "1",
        network: "mainnet",
        tokenId: "77144222",
        tokenContract: objktContract,
        tokenRef: `tezos:mainnet:${objktContract}:token:77144222`,
        timestamp: "2026-05-26T19:00:00Z",
        blockLevel: 1001,
        priceMutez: "35000000",
        marketplace: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        operationHash: "opObjktB",
        subjectAddresses: [objktContract, "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X", "tz1Buyer2"],
      },
    },
  ];
  const tz2atClient = {
    async getJson<T>(path: string): Promise<T> {
      if (path === "/health") return { rollingIndexer: { lastLevel: 1001, headLevel: 1001, ok: true } } as T;
      if (path === "/replay") return replayEvents as T;
      throw new Error(`unexpected tz2at path ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      return {
        data: {
          token: [
            {
              pk: 77144222,
              fa_contract: objktContract,
              token_id: "161",
              name: "c r y s t a l l i n e",
              supply: 15,
              timestamp: "2026-05-25T18:00:00Z",
              creators: [{ creator_address: "tz1Creator" }],
            },
          ],
          listing: [
            {
              id: "8505312",
              price: "98890000",
              amount_left: 1,
              status: "active",
              marketplace_contract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
              timestamp: "2026-05-26T17:00:00Z",
              token: { fa_contract: objktContract, token_id: "161" },
            },
          ],
        },
      } as T;
    },
  };

  const rows = await loadTz2atReplayRatRaceRows(filter, { tz2atClient, objktClient });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_contract, objktContract);
  assert.equal(rows[0].token_id, "161");
  assert.equal(rows[0].token_name, "c r y s t a l l i n e");
  assert.equal(rows[0].recent_sale_count, 2);
  assert.equal(rows[0].listing_id, "8505312");
});

test("keeps healthy empty replay windows as replay diagnostics instead of falling back to legacy repos", async () => {
  const tz2atClient = {
    async getJson<T>(path: string): Promise<T> {
      if (path === "/health") return { rollingIndexer: { lastLevel: 1001, headLevel: 1001, ok: true } } as T;
      if (path === "/replay") return [] as T;
      throw new Error(`legacy fallback should not be called: ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      throw new Error("empty replay should not hydrate Objkt");
    },
  };

  const result = await loadTz2atRatRaceRows(filter, { tz2atClient, objktClient });

  assert.equal(result.source, "tz2at-replay");
  assert.equal(result.sourceFreshness?.ok, true);
  assert.equal(result.sourceFreshness?.headLevel, 1001);
  assert.deepEqual(result.rows, []);
});

test("builds Rat Race rows from store.tz2at replay collect records", async () => {
  const replayEvents = [
    {
      event: {
        $type: "store.tz2at.marketplace.collect",
        buyer: "tz1Buyer",
        seller: "tz1Seller",
        amount: "1",
        network: "mainnet",
        tokenId: "89",
        tokenContract,
        tokenRef: `tezos:mainnet:${tokenContract}:token:89`,
        timestamp: "2026-05-26T18:00:00Z",
        blockLevel: 1000,
        priceMutez: "100000",
        marketplace: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        operationHash: "opStoreA",
        eventIndex: 10001,
        subjectAddresses: ["KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X", tokenContract, "tz1Buyer", "tz1Seller"],
      },
    },
    {
      event: {
        $type: "store.tz2at.marketplace.collect",
        buyer: "tz1Buyer2",
        seller: "tz1Seller",
        amount: "1",
        network: "mainnet",
        tokenId: "89",
        tokenContract,
        tokenRef: `tezos:mainnet:${tokenContract}:token:89`,
        timestamp: "2026-05-26T19:00:00Z",
        blockLevel: 1001,
        priceMutez: "110000",
        marketplace: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        operationHash: "opStoreB",
        eventIndex: 10001,
        subjectAddresses: ["KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X", tokenContract, "tz1Buyer2", "tz1Seller"],
      },
    },
  ];
  const tz2atClient = {
    async getJson<T>(path: string): Promise<T> {
      if (path === "/health") {
        return {
          ok: true,
          rollingIndexer: { lastLevel: 5000, headLevel: 5000, ok: true },
          processed: { lastLevel: 1001 },
        } as T;
      }
      if (path === "/replay") return replayEvents as T;
      throw new Error(`unexpected tz2at path ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      return {
        data: {
          token: [
            {
              fa_contract: tokenContract,
              token_id: "89",
              name: "Store Prefix Runner",
              supply: 4,
              timestamp: "2026-05-25T18:00:00Z",
              creators: [{ creator_address: "tz1Creator" }],
            },
          ],
          listing: [
            {
              id: "901",
              price: "130000",
              amount_left: 2,
              status: "active",
              marketplace_contract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
              timestamp: "2026-05-26T17:00:00Z",
              token: { fa_contract: tokenContract, token_id: "89" },
            },
          ],
        },
      } as T;
    },
  };

  const rows = await loadTz2atReplayRatRaceRows(filter, { tz2atClient, objktClient });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_name, "Store Prefix Runner");
  assert.equal(rows[0].recent_sale_count, 2);
});

test("caps replay scans at processed checkpoint instead of intake head", async () => {
  process.env.RAT_RACE_TZ2AT_MAX_REPLAY_PAGES = "999";
  const replayRanges: Array<{ fromLevel: number; toLevel: number }> = [];
  const tz2atClient = {
    async getJson<T>(path: string, params?: Record<string, unknown>): Promise<T> {
      if (path === "/health") {
        return {
          ok: true,
          rollingIndexer: { lastLevel: 200_000, headLevel: 200_000, ok: true },
          processed: { lastLevel: 150_000 },
          intake: { lastLevel: 200_000 },
        } as T;
      }
      if (path === "/replay") {
        replayRanges.push({
          fromLevel: Number(params?.fromLevel),
          toLevel: Number(params?.toLevel),
        });
        return [] as T;
      }
      throw new Error(`legacy fallback should not be called: ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      throw new Error("empty replay should not hydrate Objkt");
    },
  };

  await loadTz2atRatRaceRows(filter, { tz2atClient, objktClient });

  assert.equal(Math.max(...replayRanges.map((range) => range.toLevel)), 150_000);
  assert.equal(Math.min(...replayRanges.map((range) => range.fromLevel)), 135_600);
});

test("scans the full requested replay window for multi-day Rat Race filters", async () => {
  process.env.RAT_RACE_TZ2AT_MAX_REPLAY_PAGES = "999";
  const replayRanges: Array<{ fromLevel: number; toLevel: number }> = [];
  const wideFilter: RatRaceFilter = {
    ...filter,
    windowHours: 72,
  };
  const tz2atClient = {
    async getJson<T>(path: string, params?: Record<string, unknown>): Promise<T> {
      if (path === "/health") return { rollingIndexer: { lastLevel: 200_000, headLevel: 200_000, ok: true } } as T;
      if (path === "/replay") {
        replayRanges.push({
          fromLevel: Number(params?.fromLevel),
          toLevel: Number(params?.toLevel),
        });
        return [] as T;
      }
      throw new Error(`legacy fallback should not be called: ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      throw new Error("empty replay should not hydrate Objkt");
    },
  };

  const result = await loadTz2atRatRaceRows(wideFilter, { tz2atClient, objktClient });

  assert.equal(result.source, "tz2at-replay");
  assert.deepEqual(result.rows, []);
  assert.ok(replayRanges.length > 1);
  assert.equal(Math.min(...replayRanges.map((range) => range.fromLevel)), 156_800);
  assert.equal(Math.max(...replayRanges.map((range) => range.toLevel)), 200_000);
});

test("honors replay max pages within concurrent batches", async () => {
  process.env.RAT_RACE_TZ2AT_MAX_REPLAY_PAGES = "1";
  const replayRanges: Array<{ fromLevel: number; toLevel: number }> = [];
  const wideFilter: RatRaceFilter = {
    ...filter,
    windowHours: 72,
  };
  const tz2atClient = {
    async getJson<T>(path: string, params?: Record<string, unknown>): Promise<T> {
      if (path === "/health") return { rollingIndexer: { lastLevel: 200_000, headLevel: 200_000, ok: true } } as T;
      if (path === "/replay") {
        replayRanges.push({
          fromLevel: Number(params?.fromLevel),
          toLevel: Number(params?.toLevel),
        });
        return [] as T;
      }
      throw new Error(`legacy fallback should not be called: ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      throw new Error("empty replay should not hydrate Objkt");
    },
  };

  await loadTz2atRatRaceRows(wideFilter, { tz2atClient, objktClient });

  assert.equal(replayRanges.length, 1);
  assert.deepEqual(replayRanges[0], { fromLevel: 199_501, toLevel: 200_000 });
});

test("fails closed on stale tz2at replay health without probing replay pages", async () => {
  const tz2atClient = {
    async getJson<T>(path: string): Promise<T> {
      if (path === "/health") {
        return {
          ok: true,
          rollingIndexer: {
            lastLevel: 900,
            headLevel: 1001,
            headLagBlocks: 101,
            maxHeadLagBlocks: 20,
            ageMs: 180_000,
            maxStaleMs: 120_000,
            ok: false,
            state: "stale",
          },
        } as T;
      }
      throw new Error(`stale replay health should not fetch ${path}`);
    },
    async postJson<T>(): Promise<T> {
      throw new Error("unexpected tz2at post");
    },
  };
  const objktClient = {
    async getJson<T>(): Promise<T> {
      throw new Error("unexpected objkt get");
    },
    async postJson<T>(): Promise<T> {
      throw new Error("stale replay should not hydrate Objkt");
    },
  };

  const result = await loadTz2atRatRaceRows(filter, { tz2atClient, objktClient });

  assert.equal(result.source, "tz2at-replay");
  assert.deepEqual(result.rows, []);
  assert.equal(result.sourceFreshness?.ok, false);
  assert.equal(result.sourceFreshness?.state, "stale");
  assert.equal(result.sourceFreshness?.headLagBlocks, 101);
});
