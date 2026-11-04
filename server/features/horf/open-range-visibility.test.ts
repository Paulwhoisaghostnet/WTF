import test from "node:test";
import assert from "node:assert/strict";
import { visibleOpenRangeItems } from "./open-range-visibility";
import type { OpenRangeItem } from "./open-range-source";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
function item(tokenId: string, eligibility: OpenRangeItem["eligibility"]): OpenRangeItem {
  return { contract, tokenId, name: `Token ${tokenId}`, description: null,
    image: null, artifactUri: null, mime: null, mintedAt: null,
    creatorAddress: null, eligibility };
}

test("HAHA-only candidates stay in Marshal patrol and enter public Open Range only after approval", () => {
  const candidates = [item("1", "auto"), item("2", "marshal-review")];
  assert.deepEqual(visibleOpenRangeItems(candidates, new Set(), false).map((row) => row.tokenId), ["1"]);
  assert.deepEqual(visibleOpenRangeItems(candidates, new Set(), true).map((row) => row.tokenId), ["1", "2"]);
  assert.deepEqual(visibleOpenRangeItems(candidates, new Set([`${contract}/2`]), false).map((row) => row.tokenId), ["1", "2"]);
});
