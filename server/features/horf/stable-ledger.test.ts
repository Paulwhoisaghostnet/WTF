import assert from "node:assert/strict";
import test from "node:test";
import { collectStableClaimSnapshots, combineStableClaimSnapshots, type StableClaimSnapshot } from "./stable-ledger";
import { horfStableClaimSourceAddresses, HorfStablesUnconfiguredError } from "./stables/config";

const v2 = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const v3 = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const sender = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const recipient = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

function snapshot(id: number, asOf: string, status: StableClaimSnapshot["status"] = "ready"): StableClaimSnapshot {
  return {
    status, asOf, error: status === "error" ? "Stable source unavailable" : null,
    nextRefreshAt: "2026-11-05T13:00:06.000Z",
    transfers: [{ id, timestamp: asOf, from: sender, to: recipient, amount: 1,
      token: { contract: v2, tokenId: String(id), name: `Horse ${id}`, image: null },
      settlement: "stable", stableMode: 0 }],
  };
}

test("legacy Stable claim sources are explicit, Mainnet-only, and deduplicated", () => {
  assert.deepEqual(horfStableClaimSourceAddresses({ TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: v2 }), [v2]);
  assert.deepEqual(horfStableClaimSourceAddresses({ TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: v3,
    HORF_STABLES_LEGACY_CONTRACT_ADDRESSES: `${v2}, ${v3}, ${v2}` }), [v3, v2]);
  assert.deepEqual(horfStableClaimSourceAddresses({ TEZOS_NETWORK: "shadownet", HORF_STABLES_CONTRACT_ADDRESS: v3,
    HORF_STABLES_LEGACY_CONTRACT_ADDRESSES: v2 }), []);
  assert.throws(() => horfStableClaimSourceAddresses({ TEZOS_NETWORK: "mainnet", HORF_STABLES_CONTRACT_ADDRESS: v3,
    HORF_STABLES_LEGACY_CONTRACT_ADDRESSES: `${v2},bad-address` }), HorfStablesUnconfiguredError);
});

test("season Stable claims combine active and legacy sources without losing either receipt", async () => {
  const visited: string[] = [];
  const combined = await collectStableClaimSnapshots([v3, v2], async (address) => {
    visited.push(address);
    return address === v3 ? snapshot(-43, "2026-11-05T12:01:00.000Z")
      : snapshot(-42, "2026-11-05T12:00:00.000Z");
  });
  assert.deepEqual(visited, [v3, v2]);
  assert.deepEqual(combined.transfers.map((transfer) => transfer.id), [-43, -42]);
  assert.equal(combined.asOf, "2026-11-05T12:00:00.000Z");
  assert.equal(combined.status, "ready");
});

test("an incomplete or failed legacy source keeps the combined ledger incomplete", () => {
  const ready = snapshot(-43, "2026-11-05T12:01:00.000Z");
  const syncing = snapshot(-42, "2026-11-05T12:00:00.000Z", "syncing");
  const failed = snapshot(-42, "2026-11-05T12:00:00.000Z", "error");
  assert.equal(combineStableClaimSnapshots([ready, syncing]).status, "syncing");
  const combined = combineStableClaimSnapshots([ready, failed]);
  assert.equal(combined.status, "error");
  assert.equal(combined.error, "Stable source unavailable");
  assert.equal(combined.transfers.length, 2);
});
