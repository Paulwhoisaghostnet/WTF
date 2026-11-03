import assert from "node:assert/strict";
import test from "node:test";
import { fetchOpenRangeMintPage, openRangeWhere, type OpenRangeMint } from "./open-range-source";

const contract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";

test("Open Range uses source-side horse filters and all known season windows", () => {
  const allHorse = openRangeWhere("all-horse-search") as Record<string, unknown>;
  assert.ok(Array.isArray(allHorse._or));
  assert.equal("_and" in allHorse, false);
  const archive = openRangeWhere("all-seasons") as { _and: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(archive._and[1]?._or));
  const current = openRangeWhere("current-2026") as { _and: Array<Record<string, unknown>> };
  assert.equal((current._and[1]?._or as unknown[]).length, 1);
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
