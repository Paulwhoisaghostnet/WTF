import assert from "node:assert/strict";
import test from "node:test";
import type { HorfStableListing } from "./chain";
import { marshalMarketListings } from "./market-visibility";

test("Marshal's Market exposes only active approved horse swaps", () => {
  const listing = (id: string, remaining = "1"): HorfStableListing => ({
    id, mode: 0, owner: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    tokenContract: "KT1SLmPYea1jVP71yp5yYoC55DxQmLYsZeSh", tokenId: id,
    submitted: "1", remaining, claimedByWallet: null,
  });
  const listings = [listing("1"), listing("2"), listing("3"), listing("4", "0")];
  const approved = new Set(["KT1SLmPYea1jVP71yp5yYoC55DxQmLYsZeSh/1",
    "KT1SLmPYea1jVP71yp5yYoC55DxQmLYsZeSh/3",
    "KT1SLmPYea1jVP71yp5yYoC55DxQmLYsZeSh/4"]);
  const excluded = new Set(["KT1SLmPYea1jVP71yp5yYoC55DxQmLYsZeSh/3"]);
  assert.deepEqual(marshalMarketListings(listings, approved, excluded).map((item) => item.id), ["1"]);
});
