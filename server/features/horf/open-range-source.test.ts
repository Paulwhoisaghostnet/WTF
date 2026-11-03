import assert from "node:assert/strict";
import test from "node:test";
import { fetchOpenRangeMintPage, openRangeWhere, validOpenRangeCursor, type OpenRangeMint } from "./open-range-source";

const contract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";

test("Open Range keeps horse filters and bounds historical scans by date", () => {
  const allHorse = openRangeWhere("all-horse-search") as Record<string, unknown>;
  assert.ok(Array.isArray(allHorse._or));
  assert.equal("_and" in allHorse, false);
  const archive = openRangeWhere("all-seasons") as { _and: Array<Record<string, unknown>> };
  assert.deepEqual(archive._and[1], { timestamp: { _gte: "2023-07-30T00:00:00.000Z" } });
  const current = openRangeWhere("current-2026") as { _and: Array<Record<string, unknown>> };
  assert.deepEqual(current._and[1], { timestamp: { _gte: "2026-11-01T00:00:00.000Z" } });
});

test("historical timestamp and PK cursor crosses gaps and equal timestamps without losing mints", async () => {
  const rows: OpenRangeMint[] = [
    { pk: "90", fa_contract: contract, token_id: "1", name: "horse", timestamp: "2023-07-30T22:52:41Z" },
    { pk: "10", fa_contract: contract, token_id: "2", name: "horse", timestamp: "2023-12-05T00:00:00Z" },
    { pk: "30", fa_contract: contract, token_id: "3", name: "horse", timestamp: "2024-02-15T00:00:00Z" },
  ];
  const first = await fetchOpenRangeMintPage("all-seasons", "0", async () => rows);
  assert.deepEqual(first.items.map((item) => item.tokenId), ["1", "3"]);
  assert.equal(first.nextCursor, "2024-02-15T00:00:00.000Z|30");
  assert.ok(validOpenRangeCursor("all-seasons", first.nextCursor!));
  assert.equal(validOpenRangeCursor("all-seasons", "30"), false);
  assert.equal(validOpenRangeCursor("all-horse-search", first.nextCursor!), false);
  const nextWhere = openRangeWhere("all-seasons", first.nextCursor!) as { _and: Array<Record<string, unknown>> };
  assert.deepEqual(nextWhere._and[2], { _or: [
    { timestamp: { _gt: "2024-02-15T00:00:00.000Z" } },
    { _and: [{ timestamp: { _eq: "2024-02-15T00:00:00.000Z" } }, { pk: { _gt: "30" } }] },
  ] });
  const second = await fetchOpenRangeMintPage("all-seasons", first.nextCursor!, async () => [
    { pk: "31", fa_contract: contract, token_id: "4", name: "horse", timestamp: "2024-02-15T00:00:00Z" },
  ]);
  assert.deepEqual(second.items.map((item) => item.tokenId), ["4"]);
  assert.equal(second.nextCursor, "2024-02-15T00:00:00.000Z|31");
});

test("Open Range keeps explicit tiny tags, null-date all-horse mints, and source cursor", async () => {
  const rows: OpenRangeMint[] = [
    { pk: "1", fa_contract: contract, token_id: "4", name: "Untitled", timestamp: null,
      tags: [{ tag: { name: "horf", token_count: 1 } }] },
    { pk: "2", fa_contract: contract, token_id: "5", name: "horsepower engine", timestamp: "2026-11-02T00:00:00Z" },
    { pk: "3", fa_contract: contract, token_id: "6", name: "horse 2026", timestamp: "2026-11-02T00:00:00Z" },
  ];
  const all = await fetchOpenRangeMintPage("all-horse-search", "0", async () => rows);
  assert.deepEqual(all.items.map((row) => row.tokenId), ["4", "6"]);
  assert.equal(all.items[0]?.mintedAt, null);
  assert.equal(all.nextCursor, "3");
  const current = await fetchOpenRangeMintPage("current-2026", "0", async () => rows);
  assert.deepEqual(current.items.map((row) => row.tokenId), ["6"]);
  assert.equal(current.nextCursor, "3");
});
