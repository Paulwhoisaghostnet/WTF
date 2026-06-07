import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TZ2AT_CEX_ADDRESS_BOOK,
  buildTz2atEcosystemAnalytics,
  buildTz2atCexAddressBook,
  mergeTz2atCexAddressBooks,
  normalizeMarketWindowHours,
  normalizeToComparableMutez,
  parseTz2atCexAddressBook,
} from "./ecosystem-analytics";

type AnalyticsFetchJson = <T>(url: string) => Promise<T>;

function withAnalyticsRelayStubs(impl: AnalyticsFetchJson): AnalyticsFetchJson {
  return async <T>(url: string): Promise<T> => {
    if (url.includes("/health")) {
      return {
        ok: true,
        rollingIndexer: {
          lastLevel: 1_000_000,
          headLevel: 1_000_000,
          ok: true,
          state: "fresh",
          ageMs: 1_000,
          maxStaleMs: 600_000,
          headLagBlocks: 0,
          maxHeadLagBlocks: 50,
        },
      } as T;
    }
    if (url.includes("/replay")) return [] as T;
    if (url.includes("/hydrate/")) return { ok: true, jobId: "job-1" } as T;
    return impl<T>(url);
  };
}

function recentIso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

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
          timestamp: recentIso(240),
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
          timestamp: recentIso(239),
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
          timestamp: recentIso(238),
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
          timestamp: recentIso(237),
          blockLevel: 13,
        },
      },
    ],
  });
  responses.set("collection=xyz.tz2at.fa2.transfer", { records: [] });

  const analytics = await buildTz2atEcosystemAnalytics({
    limitPerCollection: 10,
    sampleReposPerHost: 1,
    hydrateCex: false,
    cexAddresses: [{ address: "tz1Cex", label: "Example CEX" }],
    fetchJson: withAnalyticsRelayStubs(async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname !== "tz2at.store") {
        if (parsed.pathname.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` };
        if (parsed.pathname.endsWith("listRepos")) return { repos: [] };
      }
      for (const [needle, value] of responses) {
        if (url.includes(needle)) return value as any;
      }
      throw new Error(`unexpected URL ${url}`);
    }),
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
    hydrateCex: false,
    filters: {
      collection: "xyz.tz2at.xtz.flow",
      address: "tz1Buyer",
      minAmountMutez: "6000000",
      fromLevel: 11,
      toLevel: 11,
    },
    fetchJson: withAnalyticsRelayStubs(async <T>(url: string): Promise<T> => {
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
                timestamp: recentIso(180),
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
                timestamp: recentIso(179),
                blockLevel: 12,
              },
            },
          ],
        } as T;
      }
      if (url.includes("collection=xyz.tz2at.marketplace.collect")) return { records: [] } as T;
      throw new Error(`unexpected URL ${url}`);
    }),
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

test("tz2at ecosystem analytics pages past the Etherlink head to classify Tezos CEX custody flows", async () => {
  const etherlinkFlowPage = {
    cursor: "page-2",
    records: Array.from({ length: 5 }, (_, index) => ({
      uri: `at://did:plc:main/xyz.tz2at.xtz.flow/eth-${index}`,
      cid: `bafyeth${index}`,
      value: {
        $type: "xyz.tz2at.xtz.flow",
        network: "etherlink-mainnet",
        flowKind: "transaction_amount",
        from: "0x5644D4101D569C73d1c187ef32862fAaD50aaD77",
        to: `0x${index}aBcDeF0123456789aBcDeF0123456789aBcDeF01`,
        amountMutez: "2000000000000000",
        operationHash: `evm-${index}`,
        timestamp: recentIso(120 - index),
        blockLevel: 44066000 + index,
      },
    })),
  };

  const tezosFlowPage = {
    records: [
      {
        uri: "at://did:plc:main/xyz.tz2at.xtz.flow/tz-withdraw",
        cid: "bafytz1",
        value: {
          $type: "xyz.tz2at.xtz.flow",
          network: "mainnet",
          flowKind: "transaction_amount",
          from: "tz1Cex",
          to: "tz1Buyer",
          amountMutez: "7000000",
          operationHash: "ooWithdraw",
          timestamp: recentIso(90),
          blockLevel: 5050,
        },
      },
      {
        uri: "at://did:plc:main/xyz.tz2at.xtz.flow/tz-deposit",
        cid: "bafytz2",
        value: {
          $type: "xyz.tz2at.xtz.flow",
          network: "mainnet",
          flowKind: "transaction_amount",
          from: "tz1Seller",
          to: "tz1Cex",
          amountMutez: "2000000",
          operationHash: "ooDeposit",
          timestamp: recentIso(89),
          blockLevel: 5051,
        },
      },
    ],
  };

  const respond = <T>(url: string): T => {
    const parsed = new URL(url);
    if (parsed.hostname !== "tz2at.store") {
      if (parsed.pathname.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` } as T;
      return { repos: [] } as T;
    }
    if (parsed.pathname.endsWith("describeServer")) return { did: "did:web:tz2at.store" } as T;
    if (parsed.pathname.endsWith("listRepos")) {
      return { repos: [{ did: "did:plc:main", rev: "1", head: "bafy", active: true }] } as T;
    }
    if (parsed.pathname.endsWith("describeRepo")) return { collections: ["xyz.tz2at.xtz.flow", "xyz.tz2at.transaction"] } as T;
    if (parsed.pathname.endsWith("listRecords")) {
      const collection = parsed.searchParams.get("collection");
      const cursor = parsed.searchParams.get("cursor");
      if (collection === "xyz.tz2at.xtz.flow") {
        return (cursor === "page-2" ? tezosFlowPage : etherlinkFlowPage) as T;
      }
      return { records: [] } as T;
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const baseOptions = {
    limitPerCollection: 40,
    sampleReposPerHost: 1,
    hydrateCex: false,
    windowHours: 168,
    cexAddresses: [{ address: "tz1Cex", label: "Example CEX" }],
    fetchJson: withAnalyticsRelayStubs(async <T>(url: string): Promise<T> => respond<T>(url)),
  };

  // Reading only the recency-ordered Etherlink head (single page) cannot classify
  // any Tezos custody flow: this is the bug the deeper read fixes.
  const shallow = await buildTz2atEcosystemAnalytics({ ...baseOptions, flowDeepMaxPages: 1 });
  assert.equal(shallow.cexFlow.configured, true);
  assert.equal(shallow.cexFlow.totalWithdrawnFromCexMutez, "0");
  assert.equal(shallow.cexFlow.totalDepositedToCexMutez, "0");
  assert.equal(shallow.cexFlow.flows.length, 0);

  // Paging deeper surfaces the Tezos `mainnet` flows that reference CEX custody.
  const deep = await buildTz2atEcosystemAnalytics({ ...baseOptions, flowDeepMaxPages: 8, flowDeepTezosTarget: 1 });
  assert.equal(deep.cexFlow.totalWithdrawnFromCexMutez, "7000000");
  assert.equal(deep.cexFlow.totalDepositedToCexMutez, "2000000");
  assert.equal(deep.cexFlow.topBuyersFromCex[0]?.id, "tz1Buyer");
  assert.equal(deep.cexFlow.topSellersToCex[0]?.id, "tz1Seller");
  assert.equal(deep.cexFlow.flows.length, 2);
  // Etherlink head records are still retained for the wider ecosystem view.
  assert.equal(deep.overview.scannedRecords > shallow.overview.scannedRecords, true);
  // The Tezos-only custody book keeps 0x candidates out of the unclassified list.
  assert.equal(
    deep.cexFlow.unclassifiedCandidates.every((entry) => !entry.id.toLowerCase().startsWith("0x")),
    true
  );
});

test("tz2at ecosystem analytics resolves CEX flow from per-entity wallet repos, deduped against the main mirror", async () => {
  const mainWithdrawal = {
    uri: "at://did:plc:main/xyz.tz2at.xtz.flow/withdraw",
    cid: "bafymain1",
    value: {
      $type: "xyz.tz2at.xtz.flow",
      network: "mainnet",
      flowKind: "transaction_amount",
      from: "tz1Cex",
      to: "tz1Buyer",
      amountMutez: "7000000",
      operationHash: "ooWithdraw",
      eventIndex: 1,
      timestamp: recentIso(60),
      blockLevel: 5050,
    },
  };
  // Same canonical event as mainWithdrawal, mirrored into the CEX wallet's own
  // repo under the store.tz2at.* prefix. It must be deduped, not double counted.
  const walletWithdrawal = {
    uri: "at://did:plc:cexwallet/store.tz2at.xtz.flow/withdraw",
    cid: "bafywallet1",
    value: { ...mainWithdrawal.value, $type: "store.tz2at.xtz.flow" },
  };
  const walletDeposit = {
    uri: "at://did:plc:cexwallet/store.tz2at.xtz.flow/deposit",
    cid: "bafywallet2",
    value: {
      $type: "store.tz2at.xtz.flow",
      network: "mainnet",
      flowKind: "transaction_amount",
      from: "tz1Seller",
      to: "tz1Cex",
      amountMutez: "2000000",
      operationHash: "ooDeposit",
      eventIndex: 2,
      timestamp: recentIso(59),
      blockLevel: 5051,
    },
  };
  const walletFee = {
    uri: "at://did:plc:cexwallet/store.tz2at.xtz.flow/fee",
    cid: "bafywallet3",
    value: {
      $type: "store.tz2at.xtz.flow",
      network: "mainnet",
      flowKind: "fee",
      from: "tz1Cex",
      to: "tz1Baker",
      amountMutez: "1500",
      operationHash: "ooWithdraw",
      eventIndex: 9,
      timestamp: recentIso(58),
      blockLevel: 5050,
    },
  };

  const respond = <T>(url: string): T => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` } as T;
    if (path.endsWith("resolveHandle")) {
      const handle = parsed.searchParams.get("handle") ?? "";
      // The code derives this handle deterministically from (mainnet, wallets, tz1Cex).
      return (handle.startsWith("m-w-tz1cex.") ? { did: "did:plc:cexwallet" } : {}) as T;
    }
    if (parsed.hostname === "tz2at.store") {
      if (path.endsWith("listRepos")) return { repos: [{ did: "did:plc:main", rev: "1", head: "bafy", active: true }] } as T;
      if (path.endsWith("describeRepo")) return { collections: ["xyz.tz2at.xtz.flow"] } as T;
      if (path.endsWith("listRecords")) {
        return (parsed.searchParams.get("collection") === "xyz.tz2at.xtz.flow" ? { records: [mainWithdrawal] } : { records: [] }) as T;
      }
    }
    if (parsed.hostname === "wallets.tz2at.store") {
      if (path.endsWith("listRepos")) return { repos: [] } as T;
      if (path.endsWith("listRecords")) {
        return (parsed.searchParams.get("collection") === "store.tz2at.xtz.flow"
          ? { records: [walletWithdrawal, walletDeposit, walletFee] }
          : { records: [] }) as T;
      }
    }
    if (path.endsWith("listRepos")) return { repos: [] } as T;
    if (path.endsWith("listRecords")) return { records: [] } as T;
    throw new Error(`unexpected URL ${url}`);
  };

  const analytics = await buildTz2atEcosystemAnalytics({
    sampleReposPerHost: 1,
    hydrateCex: false,
    windowHours: 168,
    cexAddresses: [{ address: "tz1Cex", label: "Example CEX" }],
    fetchJson: withAnalyticsRelayStubs(async <T>(url: string): Promise<T> => respond<T>(url)),
  });

  // Withdrawal counted once despite appearing in both the main mirror and the
  // wallet repo; deposit sourced from the wallet repo; fee flow excluded.
  assert.equal(analytics.cexFlow.configured, true);
  assert.equal(analytics.cexFlow.totalWithdrawnFromCexMutez, "7000000");
  assert.equal(analytics.cexFlow.totalDepositedToCexMutez, "2000000");
  assert.equal(analytics.cexFlow.flows.length, 2);
  assert.equal(analytics.cexFlow.topBuyersFromCex[0]?.id, "tz1Buyer");
  assert.equal(analytics.cexFlow.topSellersToCex[0]?.id, "tz1Seller");
  // The mirrored withdrawal event is collapsed, not duplicated.
  assert.equal(
    analytics.records.sample.filter((record) => record.uri.endsWith("/withdraw")).length,
    1
  );
});

test("tz2at ecosystem analytics filters records to the requested market window", async () => {
  const analytics = await buildTz2atEcosystemAnalytics({
    windowHours: 24,
    hydrateCex: false,
    marketNetwork: "mainnet",
    sampleReposPerHost: 1,
    cexAddresses: [{ address: "tz1Cex", label: "Example CEX" }],
    fetchJson: withAnalyticsRelayStubs(async <T>(url: string): Promise<T> => {
      const parsed = new URL(url);
      if (parsed.hostname !== "tz2at.store") {
        if (parsed.pathname.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` } as T;
        if (parsed.pathname.endsWith("listRepos")) return { repos: [] } as T;
      }
      if (parsed.pathname.endsWith("describeServer")) return { did: "did:web:tz2at.store" } as T;
      if (parsed.pathname.endsWith("listRepos")) return { repos: [{ did: "did:plc:main", rev: "1", head: "bafy", active: true }] } as T;
      if (parsed.pathname.endsWith("describeRepo")) return { collections: ["xyz.tz2at.xtz.flow"] } as T;
      if (url.includes("collection=xyz.tz2at.xtz.flow")) {
        return {
          records: [
            {
              uri: "at://did:plc:main/xyz.tz2at.xtz.flow/in-window",
              cid: "bafy1",
              value: {
                $type: "xyz.tz2at.xtz.flow",
                network: "mainnet",
                flowKind: "transaction_amount",
                from: "tz1Cex",
                to: "tz1Buyer",
                amountMutez: "5000000",
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                blockLevel: 10,
              },
            },
            {
              uri: "at://did:plc:main/xyz.tz2at.xtz.flow/stale",
              cid: "bafy2",
              value: {
                $type: "xyz.tz2at.xtz.flow",
                network: "mainnet",
                flowKind: "transaction_amount",
                from: "tz1Cex",
                to: "tz1Old",
                amountMutez: "9000000",
                timestamp: "2020-01-01T00:00:00.000Z",
                blockLevel: 1,
              },
            },
          ],
        } as T;
      }
      if (parsed.pathname.endsWith("resolveHandle")) return {} as T;
      if (parsed.pathname.endsWith("listRecords")) return { records: [] } as T;
      throw new Error(`unexpected URL ${url}`);
    }),
  });

  assert.equal(analytics.query.windowHours, 24);
  assert.equal(analytics.cexFlow.totalWithdrawnFromCexMutez, "5000000");
  assert.equal(analytics.marketHealth.capitalEnteredFromCexMutez, "5000000");
  assert.equal(analytics.marketHealth.flowRecordCount, 1);
});

test("tz2at etherlink bridge analytics classifies credit and debit rollup flows", async () => {
  const analytics = await buildTz2atEcosystemAnalytics({
    windowHours: 72,
    hydrateCex: false,
    sampleReposPerHost: 1,
    fetchJson: async <T>(url: string): Promise<T> => {
      if (url.includes("/health")) {
        return {
          ok: true,
          rollingIndexer: { lastLevel: 1_000_000, headLevel: 1_000_000, ok: true, state: "fresh", ageMs: 1_000, maxStaleMs: 600_000, headLagBlocks: 0, maxHeadLagBlocks: 50 },
        } as T;
      }
      if (url.includes("/hydrate/")) return { ok: true, jobId: "job-1" } as T;
      const parsed = new URL(url);
      if (url.includes("/replay")) {
        return [
          {
            event: {
              $type: "xyz.tz2at.xtz.flow",
              network: "etherlink-mainnet",
              flowKind: "transaction_amount",
              entrypoint: "credit",
              from: "0xBridge",
              to: "0xUser",
              amountMutez: "1000000000000000000",
              operationHash: "0xCredit",
              eventIndex: "0",
              timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            },
          },
          {
            event: {
              $type: "xyz.tz2at.xtz.flow",
              network: "etherlink-mainnet",
              flowKind: "transaction_amount",
              entrypoint: "debit",
              from: "0xUser",
              to: "0xBridge",
              amountMutez: "500000000000000000",
              operationHash: "0xDebit",
              eventIndex: "0",
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
          },
        ] as T;
      }
      if (parsed.pathname.endsWith("describeServer")) return { did: `did:web:${parsed.hostname}` } as T;
      if (parsed.pathname.endsWith("listRepos")) return { repos: [] } as T;
      if (parsed.pathname.endsWith("describeRepo")) return { collections: [] } as T;
      if (parsed.pathname.endsWith("resolveHandle")) return {} as T;
      if (parsed.pathname.endsWith("listRecords")) return { records: [] } as T;
      throw new Error(`unexpected URL ${url}`);
    },
  });

  assert.equal(analytics.etherlinkBridge.l1ToEtherlinkVolumeRaw, "1000000000000000000");
  assert.equal(analytics.etherlinkBridge.etherlinkToL1VolumeRaw, "500000000000000000");
  assert.equal(analytics.etherlinkBridge.etherlinkFlowRecordCount, 2);
  assert.ok(analytics.etherlinkBridge.flows.some((flow) => flow.source === "replay-etherlink" || flow.source === "replay-mainnet"));
  assert.ok(analytics.etherlinkBridge.readout.includes("L1→L2"));
});

test("tz2at comparable mutez normalizes etherlink wei before cross-network liquidity totals", () => {
  assert.equal(normalizeToComparableMutez(3n, "mainnet"), 3n);
  assert.equal(normalizeToComparableMutez(2_000_000_000_000_000n, "etherlink-mainnet"), 2000n);
  const rawMixed = 3n + 2_000_000_000_000_000n;
  const comparableMixed = normalizeToComparableMutez(3n, "mainnet") + normalizeToComparableMutez(2_000_000_000_000_000n, "etherlink-mainnet");
  assert.notEqual(rawMixed.toString(), comparableMixed.toString());
  assert.equal(comparableMixed, 2003n);
});

test("tz2at market window hours normalize to supported presets", () => {
  assert.equal(normalizeMarketWindowHours(72), 72);
  assert.equal(normalizeMarketWindowHours(50), 48);
  assert.equal(normalizeMarketWindowHours(200), 168);
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
