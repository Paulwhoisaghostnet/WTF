import assert from "node:assert/strict";
import test from "node:test";
import { fetchTzktCursorPages } from "./tzkt";

test("TzKT cursor pagination walks bounded pages with id.gt", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const pages = [
    [{ id: 11 }, { id: 12 }],
    [{ id: 13 }, { id: 14 }],
    [{ id: 15 }],
  ];

  const items = await fetchTzktCursorPages({
    endpoint: "/tokens/transfers",
    sinceId: 10,
    totalLimit: 5,
    pageSize: 2,
    params: { status: "applied" },
    loadPage: async (params) => {
      calls.push(params);
      return pages.shift() ?? [];
    },
  });

  assert.deepEqual(items.map((item) => item.id), [11, 12, 13, 14, 15]);
  assert.deepEqual(calls, [
    { status: "applied", "id.gt": 10, "sort.asc": "id", limit: 2 },
    { status: "applied", "id.gt": 12, "sort.asc": "id", limit: 2 },
    { status: "applied", "id.gt": 14, "sort.asc": "id", limit: 1 },
  ]);
});

test("TzKT cursor pagination refuses non-advancing pages", async () => {
  await assert.rejects(
    () =>
      fetchTzktCursorPages({
        endpoint: "/operations/transactions",
        sinceId: 10,
        totalLimit: 2,
        pageSize: 2,
        loadPage: async () => [{ id: 10 }, { id: 10 }],
      }),
    /did not advance beyond 10/
  );
});
