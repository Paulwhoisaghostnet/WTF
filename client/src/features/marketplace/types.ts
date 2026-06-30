import type { OwnedToken } from "../../components/OwnedTokensGallery";
import type { ConsoleTokenProvenance } from "@shared/console-provenance";

export type MarketplaceContractVersion = "legacy" | "v2";

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
  provenance?: ConsoleTokenProvenance | null;
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
  remainingQuantity: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  metadata?: Record<string, any> | null;
  provenance?: ConsoleTokenProvenance | null;
  priceWtf: string;
  unitPriceWtf: string;
  royaltyRecipient: string | null;
  royaltyBps: string;
  active: boolean;
  contractVersion: MarketplaceContractVersion;
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
  quantity: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  metadata?: Record<string, any> | null;
  provenance?: ConsoleTokenProvenance | null;
  reserve: string;
  reserveWtf: string;
  startTime: string;
  endTime: string;
  extensionTime: string;
  priceIncrement: string;
  minIncrementWtf: string;
  currentPrice: string;
  currentBidWtf: string;
  highestBidder: string;
  highestBidderUsername: string | null;
  highestBidderDisplayName: string | null;
  hasBid: boolean;
  shares: OnChainAuctionShare[];
  active: boolean;
  contractVersion: MarketplaceContractVersion;
}

export interface OnChainOffer {
  offerId: number | null;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  metadata?: Record<string, any> | null;
  provenance?: ConsoleTokenProvenance | null;
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
  unitPriceWtf: string;
  totalWtf: string;
  contractVersion: MarketplaceContractVersion;
}

export interface OnChainState {
  contractAddress: string;
  legacyContractAddress: string | null;
  contractVersion: MarketplaceContractVersion;
  acceptancePolicy?: {
    legacyAcceptsRequireTokenAmountOne?: boolean;
    acceptsBlockedWhenQuantityMissing?: boolean;
    expectedTermsRequired?: boolean;
  };
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
  provenance?: ConsoleTokenProvenance | null;
  activeOffer: {
    offerId: number | null;
    tokenContract: string;
    tokenId: string;
    offerer: string;
    tokenAmount: string;
    amountWtf: string;
    unitPriceWtf: string;
    totalWtf: string;
    targetOwner: string;
    contractVersion: MarketplaceContractVersion;
  } | null;
}

export interface TradeBoardResponse {
  contractAddress?: string;
  legacyContractAddress?: string | null;
  contractVersion?: MarketplaceContractVersion;
  acceptancePolicy?: OnChainState["acceptancePolicy"];
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
  metadata?: Record<string, any> | null;
  provenance?: ConsoleTokenProvenance | null;
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
  surfaceVariant?: "marketplace" | "trade-boards";
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
  offerId: number | null;
  tokenContract: string;
  tokenId: string;
  listed: boolean;
  quantity: number;
  unitPriceWtf: string;
  totalWtf: string;
  targetOwner: string;
  offerer: string;
  contractVersion: MarketplaceContractVersion;
  legacyContractAddress?: string | null;
  tokenName?: string | null;
} | null;

export type DetailToken = OwnedToken | null;
