import test from "node:test";
import assert from "node:assert/strict";
import { buildTz2atFirehoseSnapshot, extractTz2atEventItems, filterTz2atEventItems } from "./firehose";

test("tz2at firehose item extractor accepts common upstream envelope shapes", () => {
  assert.deepEqual(extractTz2atEventItems([{ id: 1 }, "skip"]), [{ id: 1 }]);
  assert.deepEqual(extractTz2atEventItems({ items: [{ $type: "xyz.tz2at.transaction" }] }), [
    { $type: "xyz.tz2at.transaction" },
  ]);
  assert.deepEqual(extractTz2atEventItems({ events: [{ id: "event" }] }), [{ id: "event" }]);
  assert.deepEqual(extractTz2atEventItems({ records: [{ uri: "at://record" }] }), [{ uri: "at://record" }]);
});

test("tz2at firehose snapshot keeps WTFOS as read-only appview consumer", () => {
  const snapshot = buildTz2atFirehoseSnapshot({
    baseUrl: "https://tz2at.xyz",
    sourceUrl: "https://tz2at.xyz/wallet/tz1/activity",
    chain: "tezos",
    walletAddress: "tz1",
    limit: 3,
    upstream: { items: [{ opHash: "oo" }], cursor: "42" },
  });

  assert.equal(snapshot.mode, "wallet-activity-snapshot");
  assert.equal(snapshot.cursor, "42");
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.walletAddress, "tz1");
  assert.equal(snapshot.scannedItems, 1);
  assert.equal(snapshot.matchedItems, 1);
});

test("tz2at firehose filters support replay appview search beyond personal wallets", () => {
  const items = [
    {
      $type: "xyz.tz2at.marketplace.collect",
      network: "mainnet",
      marketplace: "KT1Market",
      tokenId: "42",
      buyer: "tz1Buyer",
      operationHash: "ooCollect",
    },
    {
      $type: "xyz.tz2at.fa2.transfer",
      contract: "KT1Token",
      tokenId: "99",
      from: "tz1Seller",
      to: "tz1Buyer",
      operationHash: "ooTransfer",
    },
  ];

  assert.deepEqual(filterTz2atEventItems(items, { chain: "tezos", eventType: "xyz.tz2at.marketplace.collect", marketplace: "kt1market" }), [items[0]]);
  assert.deepEqual(filterTz2atEventItems(items, { address: "tz1buyer", tokenId: "99" }), [items[1]]);
  assert.deepEqual(filterTz2atEventItems(items, { query: "oocollect" }), [items[0]]);
});

test("tz2at replay snapshot reports scanned versus matched item counts", () => {
  const snapshot = buildTz2atFirehoseSnapshot({
    mode: "relay-replay-search",
    baseUrl: "https://tz2at.xyz",
    sourceUrl: "https://tz2at.xyz/replay?limit=25",
    limit: 25,
    upstream: {
      items: [
        { $type: "xyz.tz2at.marketplace.collect", marketplace: "KT1Market" },
        { $type: "xyz.tz2at.transaction", destination: "KT1Other" },
      ],
      cursor: "next",
    },
    filters: { eventType: "xyz.tz2at.marketplace.collect" },
  });

  assert.equal(snapshot.mode, "relay-replay-search");
  assert.equal(snapshot.walletAddress, null);
  assert.equal(snapshot.scannedItems, 2);
  assert.equal(snapshot.matchedItems, 1);
  assert.equal(snapshot.items[0].$type, "xyz.tz2at.marketplace.collect");
});
