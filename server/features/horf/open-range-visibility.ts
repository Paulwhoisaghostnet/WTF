import type { OpenRangeItem } from "./open-range-source";

export function visibleOpenRangeItems(
  items: readonly OpenRangeItem[], marshalApproved: ReadonlySet<string>, marshalPatrol: boolean,
): OpenRangeItem[] {
  return items.filter((item) => marshalPatrol || item.eligibility === "auto" ||
    marshalApproved.has(`${item.contract}/${item.tokenId}`));
}
