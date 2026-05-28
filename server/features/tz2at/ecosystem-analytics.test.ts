import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TZ2AT_CEX_ADDRESS_BOOK,
  buildTz2atEcosystemAnalytics,
  buildTz2atCexAddressBook,
  mergeTz2atCexAddressBooks,
  parseTz2atCexAddressBook,
} from "./ecosystem-analytics";

test("tz2at ecosystem analytics aggregates repo records into usage, liquidity, and CEX flow", async () => {
  const responses = new Map<string, unknown>();
  responses.set("/xrpc/com.atproto.server.describeServer", { did: "did:web:test.tz2at.store" });
  responses.set("/xrpc/com.atproto.sync.listRepos", {
    repos: [{ did: "did:plc:main", rev: "1", head: "bafy", active: true }],
  });
  responses.set("/xrpc/com.atproto.repo.describeRepo", {
    collections: [
      "xyz.tz2at.transaction",
      "xyz.tz2at.xtz.flow",
      "xyz.tz2at.marketplace.collect",
      "xyz.tz2at.fa2.transfer",
    ],
  });
  responses.set("collection=xyz.tz2at.transaction", {
    records: [
      {
        uri: "at://did:plc:main/xyz.tz2at.transaction/one",
        cid: "bafy1",
        value: {
          $type: "xyz.tz2at.transaction",
          network: "mainnet",
          source: "tz1Seller",
          destination: "tz1Buyer",
          amountMutez: "3000000",
          timestamp: "2026-05-28T09:00:00Z",
          blockLevel: 10,
        },
      },
    ],
  });
  responses.set("collection=xyz.tz2at.xtz.flow", {
    records: [
      {
        uri: "at://did:plc:main/xyz.tz2at.xtz.flow/one",
        cid: "bafy2",
        value: {
          $type: "xyz.tz2at.xtz.flow",
          network: "mainnet",
          from: "tz1Cex",
          to: "tz1Buyer",
          amountMutez: "7000000",
          operationHash: "ooWithdraw",
          timestamp: "2026-05-28T09:01:00Z",
          blockLevel: 11,
        },
      },
      {
        uri: "at://did:plc:main/xyz.tz2at.xtz.flow/two",
        cid: "bafy3",
        value: {
          $type: "xyz.tz2at.xtz.flow",
          network: "mainnet",
          from: "tz1Seller",
          to: "tz1Cex",
          amountMutez: "2000000",
          operationHash: "ooDeposit",
          timestamp: "2026-05-28T09:02:00Z",
          blockLevel: 12,
        },
      },
    ],
  });
  responses.set("collection=xyz.tz2at.marketplace.collect", {
    records: [
      {
        uri: "at://did:plc:main/xyz.tz2at.marketplace.collect/one",
        cid: "bafy4",
        value: {
          $type: "xyz.tz2at.marketplace.collect",
          network: "mainnet",
          buyer: "tz1Buyer",
          seller: "tz1Artist",
          marketplace: "KT1Market",
          priceMutez: "5000000",
          tokenRef: "tezos:mainnet:KT1Token:token:42",
          timestamp: "2026-05-28T09:03:00Z",
          blockLevel: 13,
        },
      },
    ],
  });
  responses.set("collection=xyz.tz2at.fa2.transfer", { records: [] });

  const analytics = await buildTz2atEcosystemAnalytics({
    limitPerCollection: 10,
    sampleReposPerHost: 1,
    cexAddresses: [{ address: "tz1Cex", label: "Example CEX" }],
    fetchJson: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname !== "tz2at.store") {
        if (parsed.pathname.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` };
        if (parsed.pathname.endsWith("listRepos")) return { repos: [] };
      }
      for (const [needle, value] of responses) {
        if (url.includes(needle)) return value as any;
      }
      throw new Error(`unexpected URL ${url}`);
    },
  });

  assert.equal(analytics.overview.totalRepos, 1);
  assert.equal(analytics.overview.scannedRecords, 4);
  assert.equal(analytics.overview.matchedRecords, 4);
  assert.equal(analytics.overview.latestBlockLevel, 13);
  assert.equal(analytics.segments.byCollection.some((segment) => segment.name === "xyz.tz2at.xtz.flow" && segment.count === 2), true);
  assert.equal(analytics.segments.addressRoles.some((role) => role.name === "xtz_in"), true);
  assert.equal(analytics.intelligence.lanes.some((lane) => lane.lane === "liquidity" && lane.amountMutez === "12000000"), true);
  assert.equal(analytics.intelligence.valueFlows[0].amountMutez, "7000000");
  assert.equal(analytics.intelligence.routes.some((route) => route.from === "tz1Cex" && route.to === "tz1Buyer" && route.amountMutez === "7000000"), true);
  assert.equal(analytics.intelligence.routes.some((route) => route.via === "KT1Market" && route.amountMutez === "5000000"), true);
  assert.equal(analytics.intelligence.valueAdders[0].id, "tz1Buyer");
  assert.equal(analytics.liquidity.totalXtzFlowMutez, "12000000");
  assert.equal(analytics.liquidity.marketplaceVolumeMutez, "5000000");
  assert.equal(analytics.cexFlow.configured, true);
  assert.equal(analytics.cexFlow.totalWithdrawnFromCexMutez, "7000000");
  assert.equal(analytics.cexFlow.totalDepositedToCexMutez, "2000000");
  assert.equal(analytics.cexFlow.topBuyersFromCex[0].id, "tz1Buyer");
  assert.equal(analytics.cexFlow.topSellersToCex[0].id, "tz1Seller");
  assert.equal(analytics.cexFlow.unclassifiedCandidates.some((entry) => entry.id === "tz1Buyer"), true);
  assert.equal(analytics.usage.topMarketplaces[0].id, "KT1Market");
});

test("tz2at ecosystem analytics filters records before building operator segments", async () => {
  const analytics = await buildTz2atEcosystemAnalytics({
    limitPerCollection: 10,
    sampleReposPerHost: 1,
    filters: {
      collection: "xyz.tz2at.xtz.flow",
      address: "tz1Buyer",
      minAmountMutez: "6000000",
      fromLevel: 11,
      toLevel: 11,
    },
    fetchJson: async <T>(url: string): Promise<T> => {
      const parsed = new URL(url);
      if (parsed.hostname !== "tz2at.store") {
        if (parsed.pathname.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` } as T;
        if (parsed.pathname.endsWith("listRepos")) return { repos: [] } as T;
      }
      if (parsed.pathname.endsWith("describeServer")) return { did: "did:web:test.tz2at.store" } as T;
      if (parsed.pathname.endsWith("listRepos")) return { repos: [{ did: "did:plc:main", rev: "1", head: "bafy", active: true }] } as T;
      if (parsed.pathname.endsWith("describeRepo")) return { collections: ["xyz.tz2at.xtz.flow", "xyz.tz2at.marketplace.collect"] } as T;
      if (url.includes("collection=xyz.tz2at.xtz.flow")) {
        return {
          records: [
            {
              uri: "at://did:plc:main/xyz.tz2at.xtz.flow/one",
              cid: "bafy1",
              value: {
                $type: "xyz.tz2at.xtz.flow",
                network: "mainnet",
                from: "tz1Cex",
                to: "tz1Buyer",
                amountMutez: "7000000",
                timestamp: "2026-05-28T09:01:00Z",
                blockLevel: 11,
              },
            },
            {
              uri: "at://did:plc:main/xyz.tz2at.xtz.flow/two",
              cid: "bafy2",
              value: {
                $type: "xyz.tz2at.xtz.flow",
                network: "mainnet",
                from: "tz1Other",
                to: "tz1Small",
                amountMutez: "1000000",
                timestamp: "2026-05-28T09:02:00Z",
                blockLevel: 12,
              },
            },
          ],
        } as T;
      }
      if (url.includes("collection=xyz.tz2at.marketplace.collect")) return { records: [] } as T;
      throw new Error(`unexpected URL ${url}`);
    },
  });

  assert.equal(analytics.overview.scannedRecords, 2);
  assert.equal(analytics.overview.matchedRecords, 1);
  assert.equal(analytics.liquidity.totalXtzFlowMutez, "7000000");
  assert.equal(analytics.intelligence.lanes[0].lane, "liquidity");
  assert.equal(analytics.intelligence.valueFlows.length, 1);
  assert.equal(analytics.intelligence.routes.length, 1);
  assert.equal(analytics.segments.byCollection[0].name, "xyz.tz2at.xtz.flow");
  assert.equal(analytics.usage.topAddresses[0].id, "tz1Buyer");
});

test("tz2at CEX address book parser accepts JSON and comma formats", () => {
  assert.deepEqual(parseTz2atCexAddressBook('[{"address":"tz1A","label":"A"}]'), [{ address: "tz1A", label: "A", source: "operator" }]);
  assert.deepEqual(parseTz2atCexAddressBook("CoinOne=tz1B,tz1C"), [
    { address: "tz1B", label: "CoinOne", source: "operator" },
    { address: "tz1C", label: "tz1C", source: "operator" },
  ]);
});

test("tz2at built-in CEX address book seeds common exchange custody labels and lets operators override", () => {
  assert.ok(DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.length >= 20);
  assert.ok(DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.some((entry) => entry.label.includes("Coinbase") && entry.address.startsWith("tz")));
  assert.ok(DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.some((entry) => entry.label.includes("Binance") && entry.address.startsWith("tz")));
  assert.ok(DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.some((entry) => entry.label.includes("Kraken") && entry.address.startsWith("tz")));

  const coinbase = DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.find((entry) => entry.label === "Coinbase 1");
  assert.ok(coinbase);
  const merged = mergeTz2atCexAddressBooks(DEFAULT_TZ2AT_CEX_ADDRESS_BOOK, [{ address: coinbase.address, label: "Coinbase custom", source: "operator" }]);
  assert.equal(merged.length, DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.length);
  assert.equal(merged.find((entry) => entry.address === coinbase.address)?.label, "Coinbase custom");

  const defaulted = buildTz2atCexAddressBook();
  assert.equal(defaulted.length, DEFAULT_TZ2AT_CEX_ADDRESS_BOOK.length);
  assert.equal(buildTz2atCexAddressBook({ disableDefault: true }).length, 0);
  assert.equal(buildTz2atCexAddressBook({ disableDefault: true, query: "Custom=tz1Custom" })[0]?.label, "Custom");
});
