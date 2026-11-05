export type HorfOwnedToken = {
  contract: string;
  tokenId: string;
  name?: string;
  balance: string;
  walletAddress: string;
  creatorAddress?: string | null;
};

export type HorfOwnedTokenPage = {
  items: HorfOwnedToken[];
  pagination: { hasMore: boolean; nextOffset: number };
};

export function parseHorfOwnedTokenPage(value: unknown): HorfOwnedTokenPage {
  const page = value as Partial<HorfOwnedTokenPage> | null;
  if (!page || !Array.isArray(page.items) ||
      page.items.some((item) => !item || typeof item !== "object" ||
        typeof item.contract !== "string" || typeof item.tokenId !== "string" ||
        typeof item.balance !== "string" || typeof item.walletAddress !== "string" ||
        (item.name != null && typeof item.name !== "string") ||
        (item.creatorAddress != null && typeof item.creatorAddress !== "string")) ||
      !page.pagination || typeof page.pagination.hasMore !== "boolean" ||
      !Number.isSafeInteger(page.pagination.nextOffset) || page.pagination.nextOffset < 0) {
    throw new Error("Owned horse tokens could not be read. Paste an Objkt token link instead.");
  }
  return page as HorfOwnedTokenPage;
}
