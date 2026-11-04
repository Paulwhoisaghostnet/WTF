import type { HorfStableListing } from "./chain";

export function marshalMarketListings(
  listings: readonly HorfStableListing[],
  approved: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
): HorfStableListing[] {
  return listings.filter((listing) => {
    const key = `${listing.tokenContract}/${listing.tokenId}`;
    return BigInt(listing.remaining) > 0n && approved.has(key) && !excluded.has(key);
  });
}
