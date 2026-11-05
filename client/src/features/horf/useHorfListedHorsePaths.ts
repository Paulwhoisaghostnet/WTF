import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type HorfListingPath = { id: string; kind: "outlaw" | "marshal" | "horse"; label: string; href: string };

function key(contract: string, tokenId: string): string { return `${contract}/${tokenId}`; }

/** Contract-backed choices, kept separate from wallet-held availability signs. */
export function useHorfListedHorsePaths(seasonKey: string) {
  const rooms = useQuery({
    queryKey: ["horf", "rooms", "public-listings"],
    queryFn: () => api.get<{ listings: Array<{ id: string; mode: 0 | 1 | 2; tokenContract: string; tokenId: string; publicVisible?: boolean }> }>("/api/horf/rooms?market=all"),
    refetchOnWindowFocus: true,
  });
  const sales = useQuery({
    queryKey: ["horf", "horse-market", "listings"],
    queryFn: () => api.get<{ listings: Array<{ id: string; tokenContract: string; tokenId: string }> }>("/api/horf/horse-market/listings"),
    refetchOnWindowFocus: true,
  });
  const paths = useMemo(() => {
    const result = new Map<string, HorfListingPath[]>();
    const add = (contract: string, tokenId: string, path: HorfListingPath) =>
      result.set(key(contract, tokenId), [...(result.get(key(contract, tokenId)) ?? []), path]);
    for (const listing of rooms.data?.listings ?? []) {
      if (listing.publicVisible === false || listing.mode === 1) continue;
      const outlaw = listing.mode === 2;
      add(listing.tokenContract, listing.tokenId, {
        id: listing.id, kind: outlaw ? "outlaw" : "marshal",
        label: outlaw ? "For trade now · Outlaw room" : "For trade now · Reciprocal pool",
        href: outlaw
          ? `/horf/horse-market?season=${encodeURIComponent(seasonKey)}&market=outlaw&outlaw=rooms&listing=${encodeURIComponent(listing.id)}`
          : `/horf/horse-market?season=${encodeURIComponent(seasonKey)}&market=marshals&listing=${encodeURIComponent(listing.id)}`,
      });
    }
    for (const listing of sales.data?.listings ?? []) {
      add(listing.tokenContract, listing.tokenId, {
        id: listing.id, kind: "horse", label: "For sale now · HORSE",
        href: `/horf/horse-market?season=${encodeURIComponent(seasonKey)}&market=horse4horse&listing=${encodeURIComponent(listing.id)}`,
      });
    }
    return result;
  }, [rooms.data, sales.data, seasonKey]);
  return { paths, roomsPending: rooms.isPending, salesPending: sales.isPending };
}
