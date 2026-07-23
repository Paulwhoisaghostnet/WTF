export type ObjktCreatorReviewStatus = "pending" | "approved" | "rejected";

export interface ObjktCreatorScorePart {
  score: number;
  weight: number;
  contribution: number;
}

export interface ObjktCreatorScoreBreakdown {
  sales: ObjktCreatorScorePart;
  buyers: ObjktCreatorScorePart;
  volume: ObjktCreatorScorePart;
  recency: ObjktCreatorScorePart;
  verification: ObjktCreatorScorePart;
  inventoryDepth: ObjktCreatorScorePart;
  floorFit: ObjktCreatorScorePart;
}

export interface ObjktCreatorPortfolioItem {
  id: string;
  contract: string;
  tokenId: string;
  name: string;
  displayUri?: string | null;
  thumbnailUri?: string | null;
  mime?: string | null;
  supply?: number | null;
  mintedAt?: string | null;
  lowestAskXtz?: number | null;
  medianSaleXtz?: number | null;
  averageSaleXtz?: number | null;
  recentSales30d: number;
  recentSales180d: number;
  uniqueRecentBuyers: number;
  objktUrl: string;
}

export interface ObjktOperatorCreator {
  address: string;
  alias?: string | null;
  logo?: string | null;
  verified: boolean;
  reviewStatus: ObjktCreatorReviewStatus;
  salesCount: number;
  volumeXtz: number;
  uniqueBuyers: number;
  lastSaleAt?: string | null;
  affordableListingCount: number;
  lowestAskXtz?: number | null;
  score: number;
  scoreParts: ObjktCreatorScoreBreakdown;
}

export interface ObjktPurchaseIntent {
  schema: "objkt-marketplace-listing-v1";
  network: "mainnet";
  chainId: "NetXdQprcVkpaWU";
  tokenContract: string;
  tokenId: string;
  listingId: number;
  onchainListingKey: number;
  marketplaceContract: string;
  marketplaceName?: string | null;
  sellerAddress: string;
  priceMutez: number;
  amount: 1;
  currency: "XTZ";
  entrypoint?: string | null;
  fingerprint: string;
}

export interface ObjktMarketCandidate {
  id: string;
  tokenPk: number;
  tokenId: string;
  contract: string;
  name: string;
  creatorAddress: string;
  creatorAlias?: string | null;
  creatorVerified: boolean;
  displayUri?: string | null;
  thumbnailUri?: string | null;
  mime?: string | null;
  supply?: number | null;
  activeListingCount: number;
  listingId?: number | null;
  listingBigmapKey?: number | null;
  listingSellerAddress?: string | null;
  marketplaceContract?: string | null;
  marketplaceName?: string | null;
  listingPriceMutez?: number | null;
  purchaseIntent?: ObjktPurchaseIntent | null;
  lowestAskXtz: number;
  medianSaleXtz?: number | null;
  averageSaleXtz?: number | null;
  highestOfferXtz?: number | null;
  resale: {
    suggestedListXtz: number;
    estimatedGrossProfitXtz: number;
    estimatedGrossReturnPct: number;
    referenceSaleXtz?: number | null;
    referenceSource: "median_sale" | "average_sale" | "markup_only";
    confidence: number;
    liquidityGrade: "A" | "B" | "C" | "D";
    holdWindowDays: number;
    exitPlan: string;
  };
  recentSales30d: number;
  recentSales180d: number;
  uniqueRecentBuyers: number;
  lastListedAt?: string | null;
  mintedAt?: string | null;
  objktUrl: string;
  score: number;
  scoreParts: {
    discount: number;
    velocity: number;
    scarcity: number;
    collectors: number;
    verification: number;
    budgetFit: number;
  };
  thesis: string;
  riskFlags: string[];
}

export interface ObjktOperatorSettings {
  spendCapXtz: number;
  maxItemPriceXtz: number;
  perCreatorLimit: number;
  walletReserveXtz: number;
  minCandidateScore: number;
  minResaleConfidence: number;
  minRecentSales180d: number;
  requireSaleReference: boolean;
}

export interface ObjktOperatorScan {
  candidates: ObjktMarketCandidate[];
  summary: {
    approvedCreators: number;
    queriedCreators: number;
    tokenRows: number;
    filteredCandidates: number;
    generatedAt: string;
    dataSource: "objkt";
    fallbackNotes: string[];
  };
}

export type ObjktQueueStatus =
  | "queued"
  | "checkout"
  | "signing"
  | "signed"
  | "verified"
  | "skipped"
  | "failed";

export interface ObjktQueueItem extends ObjktMarketCandidate {
  queuedAt: string;
  status: ObjktQueueStatus;
  openedAt?: string | null;
  signingAt?: string | null;
  signedAt?: string | null;
  verifiedAt?: string | null;
  failedAt?: string | null;
  operationHash?: string | null;
}

export interface ObjktOperatorSession {
  kukaiStatus: "not_started" | "opened" | "ready";
  kukaiTabOpenedAt?: string | null;
  kukaiReadyAt?: string | null;
  objktAccountStatus: "not_started" | "opened" | "ready";
  objktAccountOpenedAt?: string | null;
  objktWalletAddress?: string | null;
  objktWalletLinkedAt?: string | null;
  runArmed: boolean;
}

export interface ObjktOperatorEvent {
  id: string;
  at: string;
  type: "wallet" | "objkt" | "scan" | "queue" | "purchase" | "risk";
  message: string;
  href?: string;
}

export interface ObjktOperatorState {
  version: number;
  walletAddress: string | null;
  settings: ObjktOperatorSettings;
  creators: ObjktOperatorCreator[];
  scan: ObjktOperatorScan | null;
  queue: ObjktQueueItem[];
  session: ObjktOperatorSession;
  events: ObjktOperatorEvent[];
  createdAt: string | null;
  updatedAt: string | null;
}

export const DEFAULT_OBJKT_OPERATOR_SETTINGS: ObjktOperatorSettings = {
  spendCapXtz: 10,
  maxItemPriceXtz: 2,
  perCreatorLimit: 20,
  walletReserveXtz: 0.15,
  minCandidateScore: 55,
  minResaleConfidence: 44,
  minRecentSales180d: 2,
  requireSaleReference: true,
};

export const DEFAULT_OBJKT_OPERATOR_SESSION: ObjktOperatorSession = {
  kukaiStatus: "not_started",
  kukaiTabOpenedAt: null,
  kukaiReadyAt: null,
  objktAccountStatus: "not_started",
  objktAccountOpenedAt: null,
  objktWalletAddress: null,
  objktWalletLinkedAt: null,
  runArmed: false,
};

export function defaultObjktOperatorState(): ObjktOperatorState {
  return {
    version: 1,
    walletAddress: null,
    settings: { ...DEFAULT_OBJKT_OPERATOR_SETTINGS },
    creators: [],
    scan: null,
    queue: [],
    session: { ...DEFAULT_OBJKT_OPERATOR_SESSION },
    events: [],
    createdAt: null,
    updatedAt: null,
  };
}

export function evaluateObjktCandidatePolicy(
  candidate: ObjktMarketCandidate,
  settings: ObjktOperatorSettings,
) {
  const blockers: string[] = [];
  if (candidate.score < settings.minCandidateScore) blockers.push("candidate_score_below_floor");
  if (candidate.resale.confidence < settings.minResaleConfidence) {
    blockers.push("resale_confidence_below_floor");
  }
  if (candidate.recentSales180d < settings.minRecentSales180d) {
    blockers.push("secondary_sales_below_floor");
  }
  if (settings.requireSaleReference && candidate.resale.referenceSource === "markup_only") {
    blockers.push("sale_reference_missing");
  }
  return { eligible: blockers.length === 0, blockers };
}
