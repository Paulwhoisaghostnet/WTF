import test from "node:test";
import assert from "node:assert/strict";
import { buildTz2atFirehoseSnapshot, extractTz2atEventItems } from "./firehose";

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
});
