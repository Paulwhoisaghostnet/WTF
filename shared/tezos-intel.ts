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
