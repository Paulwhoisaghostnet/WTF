import type { OwnedToken } from "../../components/OwnedTokensGallery";

export interface LinkedWallet {
  id: number;
  walletAddress: string;
  isPrimary: boolean;
  tokenCount?: number;
  tezDomain?: string;
}

export interface SelectedToken {
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  creatorName?: string;
  creatorAddress?: string;
  collectionName?: string;
  tradeBoardQuantity?: number;
}

export interface OnChainListing {
  id: number;
  seller: string;
  sellerUserId: number | null;
  sellerUsername: string | null;
  sellerDisplayName: string | null;
  tokenContract: string;
  tokenId: string;
  tokenAmount: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  priceWtf: string;
  royaltyRecipient: string | null;
  royaltyBps: string;
  active: boolean;
}

export interface OnChainAuctionShare {
  amount: string;
  recipient: string;
}

export interface OnChainAuction {
  id: number;
  creator: string;
  creatorUserId: number | null;
  creatorUsername: string | null;
  creatorDisplayName: string | null;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  reserve: string;
  startTime: string;
  endTime: string;
  extensionTime: string;
  priceIncrement: string;
  currentPrice: string;
  highestBidder: string;
  highestBidderUsername: string | null;
  highestBidderDisplayName: string | null;
  hasBid: boolean;
  shares: OnChainAuctionShare[];
  active: boolean;
}

export interface OnChainOffer {
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  offerer: string;
  offererUserId: number | null;
  offererUsername: string | null;
  offererDisplayName: string | null;
  targetOwner: string;
  targetOwnerUserId: number | null;
  targetOwnerUsername: string | null;
  targetOwnerDisplayName: string | null;
  tokenAmount: string;
  amountWtf: string;
}

export interface OnChainState {
  contractAddress: string;
  admin: string;
  paused: boolean;
  listings: OnChainListing[];
  auctions: OnChainAuction[];
  offers: OnChainOffer[];
  counts: {
    listings: number;
    auctions: number;
    offers: number;
  };
}

export interface TradeBoardItem {
  ownerWallet: string;
  ownerUserId: number | null;
  ownerUsername: string | null;
  ownerDisplayName: string | null;
  tokenContract: string;
  tokenId: string;
  tokenAmount: string;
  tradeBoardQuantity: number;
  walletBalance: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  metadata: Record<string, any> | null;
  creatorName?: string | null;
  creatorAddress?: string | null;
  collectionName?: string | null;
  activeOffer: {
    tokenContract: string;
    tokenId: string;
    offerer: string;
    tokenAmount: string;
    amountWtf: string;
    targetOwner: string;
  } | null;
}

export interface TradeBoardResponse {
  items: TradeBoardItem[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

export interface ExternalMarketplaceListing {
  id: number;
  listingId: string;
  bigmapKey: number;
  marketplaceContract: string;
  marketplaceName: string;
  cancelEntrypoint: string | null;
  cancellable: boolean;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  sellerAddress: string;
  priceMutez: string;
  editions: number;
  listedAt: string | null;
  fetchedAt: string | null;
}

export interface ExternalMarketplaceListingsResponse {
  rows: ExternalMarketplaceListing[];
  fetchedAt: string;
}

export interface MarketplaceProps {
  initialTab?: number;
}

export type CreateFormState = {
  amount: string;
  listingType: string;
  priceWtf: string;
  auctionReserveWtf: string;
  startTime: string;
  endTime: string;
  extensionTimeSec: string;
  priceIncrementWtf: string;
  sharesCsv: string;
};

export type PendingOfferAccept = {
  tokenContract: string;
  tokenId: string;
  listed: boolean;
  quantity: number;
} | null;

export type DetailToken = OwnedToken | null;
