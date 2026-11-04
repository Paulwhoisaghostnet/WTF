import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenRangePageCache,
  mergeOpenRangeMintPages,
  type OpenRangeMintPage,
  type OpenRangePageStore,
  type StoredOpenRangePage,
} from "./open-range-cache";

const CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const BLOCK_MS = 6_000;

function page(tokenIds: string[], nextCursor: string | null, hasMore: boolean, label = "Horse"): OpenRangeMintPage {
  return {
    items: tokenIds.map((tokenId) => ({ contract: CONTRACT, tokenId,
      name: `${label} ${tokenId}`, description: null, image: null, artifactUri: null, mime: null,
      mintedAt: "2026-11-03T00:00:00.000Z", creatorAddress: null })),
    nextCursor, hasMore, asOf: "2026-11-03T00:00:00.000Z", sourceRows: tokenIds.length, mediaVersion: 1,
  };
}

function memoryStore() {
  const rows = new Map<string, StoredOpenRangePage>();
  const key = (mode: string, cursor: string) => `${mode}:${cursor}`;
  const store: OpenRangePageStore = {
    async read(mode, cursor) { return rows.get(key(mode, cursor)) ?? null; },
    async write(mode, cursor, fresh) {
      const previous = rows.get(key(mode, cursor))?.page ?? null;
      const merged = mergeOpenRangeMintPages(previous, fresh);
      rows.set(key(mode, cursor), { page: merged, fetchedAt: Date.now() });
      return merged;
    },
  };
  return { rows, store, key };
}

test("a discovered page survives a new cache instance without another source lookup", async () => {
  const { store } = memoryStore();
  let lookups = 0;
  const source = async () => { lookups++; return page(["1"], "9", true); };
  const first = createOpenRangePageCache(store, source);
  assert.equal((await first("neighvember-2025", "0")).cacheStatus, "refreshed");

  const afterRestart = createOpenRangePageCache(store, source);
  const result = await afterRestart("neighvember-2025", "0");
  assert.equal(result.cacheStatus, "cached");
  assert.deepEqual(result.items.map((item) => item.tokenId), ["1"]);
  assert.equal(result.nextCursor, "9");
  assert.equal(lookups, 1);
});

test("a legacy cached page refreshes its missing per-token media on first read", async () => {
  const { store, rows, key } = memoryStore();
  const old = page(["180", "181"], null, false);
  delete (old as Partial<typeof old>).mediaVersion;
  for (const item of old.items) {
    delete (item as Partial<typeof item>).artifactUri;
    delete (item as Partial<typeof item>).mime;
  }
  rows.set(key("all-horse-search", "0"), { page: old, fetchedAt: Date.now() });
  let lookups = 0;
  const cached = createOpenRangePageCache(store, async () => {
    lookups++;
    const fresh = page(["181"], null, false);
    fresh.items[0].artifactUri = "https://ipfs.fileship.xyz/QmHorseVideo";
    fresh.items[0].mime = "video/mp4";
    return fresh;
  });
  const result = await cached("all-horse-search", "0");
  assert.equal(result.cacheStatus, "refreshed");
  assert.equal(result.items.find((item) => item.tokenId === "181")?.artifactUri, "https://ipfs.fileship.xyz/QmHorseVideo");
  assert.deepEqual(result.items.map((item) => item.tokenId), ["180", "181"]);
  assert.equal((await cached("all-horse-search", "0")).cacheStatus, "cached");
  assert.equal(lookups, 1);
});

test("explicit refresh updates metadata and retains earlier horses and cursor path", async () => {
  const { store } = memoryStore();
  const snapshots = [page(["1", "2"], "12", true), page(["2", "3"], "13", true, "Fresh")];
  const cached = createOpenRangePageCache(store, async () => snapshots.shift()!);
  await cached("neighvember-2025", "0");
  const updated = await cached("neighvember-2025", "0", { refresh: true });
  assert.equal(updated.cacheStatus, "refreshed");
  assert.deepEqual(updated.items.map((item) => item.tokenId), ["1", "2", "3"]);
  assert.equal(updated.items[1].name, "Fresh 2");
  assert.equal(updated.nextCursor, "12");
  assert.equal(updated.hasMore, true);
});

test("a filtered empty page still keeps its next cursor, including after refresh failure", async () => {
  const { store } = memoryStore();
  let fail = false;
  const cached = createOpenRangePageCache(store, async () => {
    if (fail) throw new Error("Objkt unavailable");
    return page([], "42", true);
  });
  const first = await cached("all-horse-search", "1");
  assert.deepEqual(first.items, []);
  assert.equal(first.nextCursor, "42");
  fail = true;
  const stale = await cached("all-horse-search", "1", { refresh: true });
  assert.equal(stale.cacheStatus, "stale");
  assert.equal(stale.hasMore, true);
  assert.equal(stale.nextCursor, "42");
});

test("active pages return cached data before a background update completes", async () => {
  const { store, rows, key } = memoryStore();
  let clock = Date.now();
  let release!: (value: OpenRangeMintPage) => void;
  let lookups = 0;
  const source = async () => {
    lookups++;
    if (lookups === 1) return page(["1"], "5", true);
    return new Promise<OpenRangeMintPage>((resolve) => { release = resolve; });
  };
  const cached = createOpenRangePageCache(store, source, () => clock);
  await cached("current-2026", "0");
  rows.get(key("current-2026", "0"))!.fetchedAt = clock - BLOCK_MS;
  clock += BLOCK_MS;
  const immediate = await cached("current-2026", "0");
  assert.equal(immediate.cacheStatus, "cached");
  assert.deepEqual(immediate.items.map((item) => item.tokenId), ["1"]);
  assert.equal(lookups, 2);
  release(page(["1", "2"], "6", true, "Updated"));
  await new Promise((resolve) => setImmediate(resolve));
  const latest = await cached("current-2026", "0");
  assert.deepEqual(latest.items.map((item) => item.tokenId), ["1", "2"]);
  assert.equal(latest.items[0].name, "Updated 1");
  assert.equal(lookups, 2);
});
