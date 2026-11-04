import assert from "node:assert/strict";
import test from "node:test";
import { combineHorfSeasonSnapshots, dueForSync, withoutExcludedHorseTokens } from "./ledger";
import { summarizeSeason, type HorfTransfer } from "./model";
import { HORF_ALL_TIME_SEASON, HORF_SEASONS, HORF_SEASON_CHOICES, resolveHorfSeason } from "./seasons";
import { horseContractAddress } from "./horse-config";

const alice = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const bob = "tz1cVRngPTBNK2VZQJSUCQDjPNqtzJ2H7Cgt";
const stable = "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU";
const token = { contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", tokenId: "1", name: "Horse", image: null };

function snapshot(index: number, transfers: HorfTransfer[], options: {
  status?: "ready" | "syncing" | "error";
  asOf?: string | null;
  nextRefreshAt?: string | null;
} = {}) {
  const season = HORF_SEASONS[index]!;
  return {
    season,
    seasons: HORF_SEASON_CHOICES,
    asOf: options.asOf === undefined ? "2026-11-03T12:00:00.000Z" : options.asOf,
    status: options.status || "ready",
    error: options.status === "error" ? "One source is unavailable" : null,
    nextRefreshAt: options.nextRefreshAt === undefined ? null : options.nextRefreshAt,
    countingRule: "Each qualifying horse counts for both traders.",
    ...summarizeSeason(transfers, alice),
  };
}

test("All time combines tracked windows and settles a return ride across seasons", () => {
  const first = snapshot(0, [{ id: 11, timestamp: "2023-08-01T12:00:00.000Z", from: bob, to: alice, amount: 2, token }]);
  const second = snapshot(7, [
    { id: 22, timestamp: "2025-11-02T12:00:00.000Z", from: alice, to: bob, amount: 1, token },
    { id: 23, timestamp: "2025-11-03T12:00:00.000Z", from: alice, to: stable, amount: 1, token, settlement: "stable", stableMode: 0 },
  ]);
  // A duplicate source row must not appear twice in the personal event list.
  second.currentUser!.recent.push({ ...second.currentUser!.recent[0]! });
  const combined = combineHorfSeasonSnapshots([first, second], alice);

  assert.deepEqual(combined.season, HORF_ALL_TIME_SEASON);
  assert.equal(combined.seasons[0]?.key, "all-time");
  assert.deepEqual(combined.leaderboard.map((row) => [row.address, row.sent, row.received, row.trades]), [
    [alice, 2, 2, 4], [bob, 2, 1, 3], [stable, 0, 1, 1],
  ]);
  assert.equal(combined.currentUser?.recent.length, 3);
  assert.deepEqual(combined.currentUser?.owedTo, [{ address: bob, name: null, count: 1 }]);
  assert.deepEqual(combined.currentUser?.owedBy, []);
  assert.deepEqual(combined.currentUser?.waitingHorses.map((row) => [row.id, row.amount]), [[11, 1]]);
  assert.match(combined.countingRule, /tracked by Horf; gaps between those campaigns are excluded/i);
  assert.equal(resolveHorfSeason("all-time"), null);
});

test("All time reports partial freshness and the earliest pending refresh", () => {
  const first = snapshot(0, [], { nextRefreshAt: "2026-11-03T12:05:00.000Z" });
  const second = snapshot(8, [], { status: "syncing", asOf: null, nextRefreshAt: "2026-11-03T12:03:00.000Z" });
  const combined = combineHorfSeasonSnapshots([first, second], alice);
  assert.equal(combined.status, "syncing");
  assert.equal(combined.asOf, null);
  assert.equal(combined.nextRefreshAt, "2026-11-03T12:03:00.000Z");
  assert.equal(combined.currentUser?.trades, 0);
});

test("completed closed seasons do not each launch a scan on an All time read", () => {
  const archive = HORF_SEASONS[0]!;
  const current = HORF_SEASONS[HORF_SEASONS.length - 1]!;
  const state = {
    season_end: new Date(archive.endsAt!), cursor: "0", status: "ready" as const,
    as_of: new Date("2026-11-02T00:00:00.000Z"),
    updated_at: new Date("2026-11-02T00:00:00.000Z"),
    policy_version: `3:${horseContractAddress() ?? ""}`,
  } as Parameters<typeof dueForSync>[0];
  const now = Date.parse("2026-11-03T00:00:00.000Z");
  assert.equal(dueForSync(state, archive, now), false);
  assert.equal(dueForSync({ ...state, season_end: null }, current, now), true);
  assert.equal(dueForSync({ ...state, policy_version: "old-policy" }, archive, now), true);
  assert.equal(dueForSync({ ...state, season_end: new Date("2023-09-02T00:00:00.000Z") }, archive, now), true);
});

test("an exact nonhorse decision removes that edition from every trade settlement", () => {
  const transfers: HorfTransfer[] = [
    { id: 1, timestamp: "2026-11-03T00:00:00.000Z", from: alice, to: bob, amount: 1, token },
    { id: 2, timestamp: "2026-11-03T00:00:00.000Z", from: alice, to: bob, amount: 1, token, settlement: "stable" },
    { id: 3, timestamp: "2026-11-03T00:00:00.000Z", from: alice, to: bob, amount: 1, token, settlement: "market" },
    { id: 4, timestamp: "2026-11-03T00:00:00.000Z", from: alice, to: bob, amount: 1, token, settlement: "objkt" },
    { id: 5, timestamp: "2026-11-03T00:00:00.000Z", from: alice, to: bob, amount: 1,
      token: { ...token, tokenId: "2" }, settlement: "stable" },
  ];
  const visible = withoutExcludedHorseTokens(transfers, new Set([`${token.contract}/${token.tokenId}`]));
  assert.deepEqual(visible.map((transfer) => transfer.id), [5]);
});
