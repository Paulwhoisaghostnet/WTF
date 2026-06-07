import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  LinkedWallet,
  ExternalMarketplaceListingsResponse,
  OnChainOffer,
  OnChainState,
  TradeBoardResponse,
} from "./types";

interface UseMarketplaceDataArgs {
  address?: string | null;
  boardSearch: string;
  hasUser: boolean;
}

export function useMarketplaceData({
  address,
  boardSearch,
  hasUser,
}: UseMarketplaceDataArgs) {
  const qc = useQueryClient();

  const { data: onchain, isLoading: loadingOnchain } = useQuery({
    queryKey: ["marketplace", "onchain"],
    queryFn: () => api.get<OnChainState>("/api/marketplace/onchain"),
    refetchInterval: 15_000,
  });

  const { data: tradeBoard, isLoading: loadingBoard } = useQuery({
    queryKey: ["marketplace", "trade-board", boardSearch],
    queryFn: () =>
      api.get<TradeBoardResponse>(
        `/api/marketplace/trade-board?limit=200&q=${encodeURIComponent(boardSearch)}`
      ),
    refetchInterval: 15_000,
  });

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<LinkedWallet[]>("/api/wallets"),
    enabled: hasUser,
  });

  const { data: externalListings } = useQuery({
    queryKey: ["marketplace", "external", "mine"],
    queryFn: () => api.get<ExternalMarketplaceListingsResponse>("/api/marketplace/external/mine"),
    enabled: hasUser,
    refetchInterval: 60_000,
  });

  const normalizedOnchain = useMemo<OnChainState | undefined>(() => {
    if (!onchain) return undefined;
    const raw = onchain as Partial<OnChainState> & {
      counts?: Partial<OnChainState["counts"]>;
    };
    const listings = raw.listings ?? [];
    const auctions = raw.auctions ?? [];
    const offers = raw.offers ?? [];
    return {
      contractAddress: raw.contractAddress ?? "",
      legacyContractAddress: raw.legacyContractAddress ?? null,
      contractVersion: raw.contractVersion ?? "legacy",
      acceptancePolicy: raw.acceptancePolicy,
      admin: raw.admin ?? "",
      paused: Boolean(raw.paused),
      listings,
      auctions,
      offers,
      counts: {
        listings: raw.counts?.listings ?? listings.length,
        auctions: raw.counts?.auctions ?? auctions.length,
        offers: raw.counts?.offers ?? offers.length,
      },
    };
  }, [onchain]);

  const walletOptions =
    wallets?.map((w) => ({
      label: `${w.walletAddress.slice(0, 10)}...${w.walletAddress.slice(-6)}${w.isPrimary ? " *" : ""} [${w.tokenCount ?? 0}]`,
      value: w.walletAddress,
    })) ?? [];

  const offersByToken = useMemo(() => {
    const map = new Map<string, OnChainOffer>();
    for (const offer of onchain?.offers ?? []) {
      map.set(`${offer.targetOwner}:${offer.tokenContract}:${offer.tokenId}`, offer);
    }
    return map;
  }, [onchain?.offers]);

  const myListings = useMemo(
    () => (onchain?.listings ?? []).filter((l) => l.seller === address),
    [onchain?.listings, address]
  );

  const myAuctions = useMemo(
    () => (onchain?.auctions ?? []).filter((a) => a.creator === address),
    [onchain?.auctions, address]
  );

  const myOffers = useMemo(
    () => (onchain?.offers ?? []).filter((o) => o.offerer === address),
    [onchain?.offers, address]
  );

  const offersToMe = useMemo(
    () => (onchain?.offers ?? []).filter((o) => o.targetOwner === address),
    [onchain?.offers, address]
  );

  const invalidateMarket = () => {
    qc.invalidateQueries({ queryKey: ["marketplace"] });
  };

  return {
    invalidateMarket,
    loadingBoard,
    loadingOnchain,
    myAuctions,
    myListings,
    myOffers,
    externalListings: externalListings?.rows ?? [],
    offersByToken,
    offersToMe,
    onchain: normalizedOnchain,
    tradeBoard,
    wallets,
    walletOptions,
  };
}
