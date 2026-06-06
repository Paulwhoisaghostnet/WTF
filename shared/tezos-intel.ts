export interface TezosIntelSource {
  name: string;
  sourcePath: string;
  targetOwner: string;
  status: "imported" | "reference" | "deferred";
  notes: string;
}

export interface CreatorScoreInput {
  creatorAddress: string;
  tokenCount: number;
  saleCount: number;
  collectorCount: number;
  activeListingCount: number;
  totalVolumeMutez: number;
  highestSaleMutez: number;
  floorMutez: number;
  lastSaleAt?: string | null;
}

export interface CreatorScoreBreakdown {
  liquidity: number;
  volume: number;
  collectors: number;
  recency: number;
  activeMarket: number;
}

export interface CreatorScoreResult extends CreatorScoreInput {
  score: number;
  grade: "A" | "B" | "C" | "D" | "unrated";
  breakdown: CreatorScoreBreakdown;
}

export interface MarketPulseMarketplace {
  marketplace: string;
  saleCount: number;
  volumeMutez: number;
}

export interface MarketPulse {
  windowDays: number;
  saleCount: number;
  volumeMutez: number;
  primarySaleCount: number;
  secondarySaleCount: number;
  activeListingCount: number;
  topMarketplaces: MarketPulseMarketplace[];
  generatedAt: string;
}

export interface RatRacePurchaseIntent {
  supported: boolean;
  reason: string | null;
  marketplaceContract: string | null;
  marketplaceName: string | null;
  entrypoint: "fulfill_ask" | "buy" | "collect" | "claim" | null;
  listingId: string | null;
  amount: number;
  priceMutez: string | null;
  totalMutez: string | null;
}

export interface RatRaceHotToken {
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  tokenThumbnail: string | null;
  creatorAddress: string | null;
  totalEditions: number;
  soldEditions: number;
  soldPercent: number;
  recentSaleCount: number;
  recentEditionsSold: number;
  activeListingCount: number;
  floorMutez: string | null;
  mintedAt: string | null;
  firstListedAt: string | null;
  lastSaleAt: string | null;
  estimatedSelloutAt: string | null;
  hoursToSellout: number | null;
  urgencyScore: number;
  salesVelocityPerHour: number;
  remainingEditions: number;
  marketUrl: string;
  source: "tz2at-firehose" | "local-index";
  purchaseIntent: RatRacePurchaseIntent;
}

export interface RatRaceNearMiss {
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  totalEditions: number;
  soldEditions: number;
  soldPercent: number;
  recentSaleCount: number;
  activeListingCount: number;
  mintedAt: string | null;
  lastSaleAt: string | null;
  marketUrl: string;
  reasons: string[];
}

export interface RatRaceSourceFreshness {
  ok: boolean | null;
  state: string | null;
  lastLevel: number | null;
  headLevel: number | null;
  headLagBlocks: number | null;
  maxHeadLagBlocks: number | null;
  processedLevel: number | null;
  intakeLevel: number | null;
  processedLagBlocks: number | null;
  updatedAt: string | null;
  ageMs: number | null;
  maxStaleMs: number | null;
}

export interface RatRaceReplayScanCoverage {
  requestedWindowHours: number;
  requestedBlocks: number;
  chunkBlocks: number;
  maxPages: number;
  pagesScanned: number;
  fromLevel: number | null;
  toLevel: number | null;
  scannedFromLevel: number | null;
  scannedToLevel: number | null;
  estimatedScannedHours: number;
  completedWindow: boolean;
  stopReason: "window-covered" | "page-limit" | "page-error" | "stale-health" | "missing-head" | "no-ranges";
  replayEventCount: number;
  collectRecordCount: number;
  listingSignalRecordCount: number;
  transferRecordCount: number;
  pageCapHitCount: number;
  pageErrorCount: number;
  oldestEventAt: string | null;
  newestEventAt: string | null;
  oldestCollectAt: string | null;
}

export interface RatRaceSupplementSource {
  source: "objkt" | "tzkt";
  used: boolean;
  purpose: string;
}

export interface RatRaceFeedDiagnostics {
  source: "local-index" | "tz2at-replay" | "tz2at-atproto" | "none";
  sourceFreshness?: RatRaceSourceFreshness | null;
  replayScan?: RatRaceReplayScanCoverage | null;
  supplementSources: RatRaceSupplementSource[];
  localCandidateRows: number;
  tz2atCandidateRows: number;
  rankedItems: number;
  rejectedByUnknownSupply: number;
  rejectedByNoActiveListing: number;
  rejectedByMintWindow: number;
  rejectedByRecentSales: number;
  rejectedBySoldPercent: number;
  nearMisses: RatRaceNearMiss[];
  note: string;
}

export interface RatRaceHotTokensResponse {
  limit: number;
  windowHours: number;
  mintedWithinDays: number;
  minSoldPercent: number;
  minRecentSales: number;
  generatedAt: string;
  diagnostics?: RatRaceFeedDiagnostics;
  items: RatRaceHotToken[];
}
