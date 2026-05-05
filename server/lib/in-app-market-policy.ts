export type DirectListingItemCandidate = {
  active: boolean;
  contractAddress: string | null;
};

export function selectDirectListingItem<T extends DirectListingItemCandidate>(
  candidates: T[],
  contractAddress: string
): T | null {
  const specific = candidates.find((item) => item.contractAddress === contractAddress);
  if (specific) return specific.active ? specific : null;
  return candidates.find((item) => item.contractAddress === null && item.active) ?? null;
}
