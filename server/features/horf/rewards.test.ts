import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { buildHorfRewardEntitlements, completedHorfRewardSource, HORF_HORSE_REWARD_RAW_PER_UNIT,
  readyStableClaimSources, stableClaimRewardEvents } from "./rewards";
import { horfLedgerPolicyVersion } from "./ledger";

const sender = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const recipient = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const horseArt = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
const horseCurrency = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
const stableV2 = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const stableV3 = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

test("each outbound current-season edition accrues 10 HORSE only to its sender", () => {
  const rows = buildHorfRewardEntitlements([
    { kind: "direct", sourceKey: "100", from: sender, to: recipient, units: "3", tokenContract: horseArt, tokenId: "1" },
    { kind: "stable", sourceKey: "KT1Stable:200", from: recipient, to: sender, units: "1", tokenContract: horseArt, tokenId: "1" },
  ], horseCurrency);
  assert.equal(HORF_HORSE_REWARD_RAW_PER_UNIT.toString(), "1000000000");
  assert.deepEqual(rows.map((row) => [row.sourceKind, row.sourceKey, row.traderAddress, row.units, row.amountRaw]), [
    ["direct", "100", sender, "3", "3000000000"],
    ["stable", "KT1Stable:200", recipient, "1", "1000000000"],
  ]);
});

test("self sends and HORSE currency transfers never produce entitlement rows", () => {
  assert.deepEqual(buildHorfRewardEntitlements([
    { kind: "direct", sourceKey: "self", from: sender, to: sender, units: "1", tokenContract: horseArt, tokenId: "1" },
    { kind: "direct", sourceKey: "currency", from: sender, to: recipient, units: "1", tokenContract: horseCurrency, tokenId: "0" },
    { kind: "direct", sourceKey: "zero", from: sender, to: recipient, units: "0", tokenContract: horseArt, tokenId: "1" },
  ], horseCurrency), []);
});

test("a return send is a new outbound award for its own sender", () => {
  const rows = buildHorfRewardEntitlements([
    { kind: "direct", sourceKey: "1", from: sender, to: recipient, units: "1", tokenContract: horseArt, tokenId: "1" },
    { kind: "direct", sourceKey: "2", from: recipient, to: sender, units: "1", tokenContract: horseArt, tokenId: "1" },
  ], horseCurrency);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.traderAddress), [sender, recipient]);
  assert.deepEqual(rows.map((row) => row.amountRaw), ["1000000000", "1000000000"]);
});

test("a ready source with an old horse classifier cannot issue rewards", () => {
  const source = { status: "ready", as_of: new Date("2026-11-04T00:00:00.000Z"),
    policy_version: horfLedgerPolicyVersion() };
  assert.equal(completedHorfRewardSource(source), true);
  assert.equal(completedHorfRewardSource({ ...source, policy_version: "marshal-approval-changed" }), false);
  assert.equal(completedHorfRewardSource({ ...source, policy_version: "2:old" }), false);
  assert.equal(completedHorfRewardSource({ ...source, as_of: null }), false);
});

test("a Marshal nonhorse decision removes only that exact token from every reward source", () => {
  const events = (["direct", "stable", "market", "objkt"] as const).map((kind, index) => ({
    kind, sourceKey: String(index + 1), from: sender, to: recipient, units: "1",
    tokenContract: horseArt, tokenId: "1",
  }));
  events.push({ kind: "stable", sourceKey: "5", from: sender, to: recipient, units: "1",
    tokenContract: horseArt, tokenId: "2" });
  const eligible = buildHorfRewardEntitlements(events, horseCurrency, new Set([`${horseArt}/1`]));
  assert.deepEqual(eligible.map((row) => row.sourceKey), ["5"]);
});

test("reward reconciliation requires every legacy and active Stable source to be complete", async () => {
  const visited: string[] = [];
  const client = { query: async (_sql: string, params: string[]) => {
    visited.push(params[0]!);
    return { rows: params[0] === stableV2
      ? [{ status: "ready", as_of: new Date("2026-11-05T12:00:00Z") }]
      : [{ status: "ready", as_of: new Date("2026-11-05T12:01:00Z") }] };
  } } as unknown as PoolClient;
  assert.deepEqual(await readyStableClaimSources(client, [stableV3, stableV2]), [
    `${stableV3}:2026-11-05T12:01:00.000Z`, `${stableV2}:2026-11-05T12:00:00.000Z`,
  ]);
  assert.deepEqual(visited, [stableV3, stableV2]);
  const incomplete = { query: async (_sql: string, params: string[]) => ({ rows: params[0] === stableV2
    ? [{ status: "syncing", as_of: null }] : [{ status: "ready", as_of: new Date() }] }) } as unknown as PoolClient;
  assert.equal(await readyStableClaimSources(incomplete, [stableV3, stableV2]), null);
});

test("legacy and active Stable claims retain separate HORSE reward source keys", () => {
  const events = stableClaimRewardEvents([stableV2, stableV3].map((contract_address) => ({
    contract_address, tzkt_event_id: "42", owner_address: sender,
    claimant_address: recipient, token_contract: horseArt, token_id: "1",
  })));
  const entitlements = buildHorfRewardEntitlements(events, horseCurrency);
  assert.deepEqual(entitlements.map((row) => row.sourceKey), [`${stableV2}:42`, `${stableV3}:42`]);
  assert.deepEqual(entitlements.map((row) => row.amountRaw), ["1000000000", "1000000000"]);
});
