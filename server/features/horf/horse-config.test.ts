import assert from "node:assert/strict";
import test from "node:test";
import { getHorfHorseActivity, HORF_HORSE_CODE_HASH, HORF_HORSE_ORIGINATOR } from "./horse-config";

const contract = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
const wallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const other = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

test("HORSE cumulative participation excludes a wallet's self-transfer", async () => {
  const transfer = (id: number, from: string, to: string, amount: string) => ({
    id, token: { contract: { address: contract }, tokenId: "0" },
    from: { address: from }, to: { address: to }, amount,
  });
  const rows = [
    transfer(1, HORF_HORSE_ORIGINATOR, wallet, "12"),
    transfer(2, wallet, wallet, "5"),
    transfer(3, wallet, other, "2"),
  ];
  const reader = { getJson: async (path: string, params?: Record<string, unknown>) => {
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU", timestamp: "2026-11-03T00:00:00Z" } as never;
    if (path === `/contracts/${contract}`) return { codeHash: HORF_HORSE_CODE_HASH, creator: { address: HORF_HORSE_ORIGINATOR } } as never;
    if (path === "/tokens") return [{ contract: { address: contract }, tokenId: "0", standard: "fa2", metadata: { symbol: "HORSE", decimals: "8" } }] as never;
    if (path === "/tokens/transfers") return rows.filter((row) =>
      Number(row.id) > Number(params?.["id.gt"] ?? 0) &&
      row[(params?.from ? "from" : "to")].address === (params?.from || params?.to)) as never;
    throw new Error(path);
  } };
  const activity = await getHorfHorseActivity(wallet, reader);
  assert.equal(activity.receivedRaw, "12");
  assert.equal(activity.sentRaw, "2");
  assert.equal(activity.awardedRaw, "12");
});
