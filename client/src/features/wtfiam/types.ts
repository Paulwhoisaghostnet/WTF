export type WtfIamCategoryKey =
  | "desktop_pet"
  | "desktop_fun"
  | "system_appearance"
  | "tv"
  | "arcade"
  | "casino"
  | "studio"
  | "preservation"
  | "wtf_live";

export type WtfIamListingSource = "live" | "staged";

export type MarketCurrency = "wtf" | "reward_wtf" | "exp";

export type InAppMarketItem = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  kind: string | null;
  priceWtfUnits: string;
  priceWtfFormatted: string;
  priceExp: number;
  sale?: {
    id: number;
    name: string;
    discountPercent: number;
    salePriceWtfUnits: string;
    salePriceWtfFormatted: string;
  } | null;
  contractAddress: string | null;
  contractListingId: number | null;
  metadata: Record<string, unknown>;
  stockQuantity: number;
  quantityOwned: number;
};

export type InAppMarketResponse = {
  config: {
    configured: boolean;
    contractAddress: string | null;
    treasuryAddress: string;
    network: string;
  };
  balances: {
    exp: number;
    rewardWtf: number;
  };
  items: InAppMarketItem[];
  inventory: Array<{
    sku: string;
    quantity: number;
    metadata: Record<string, unknown>;
    updatedAt: string;
  }>;
  purchases: Array<{
    id: number;
    sku: string;
    quantity: number;
    currency: string;
    amountWtfUnits: string;
    amountExp: number;
    opHash: string | null;
    walletAddress: string | null;
    contractListingId: number | null;
    purchaseRef: string | null;
    observedAt: string;
    createdAt: string;
  }>;
  tipLedger?: {
    received: InAppMarketTipTransfer[];
    sent: InAppMarketTipTransfer[];
  };
};

export type InAppMarketTipTransfer = {
  id: number;
  senderUserId: number | null;
  receiverUserId: number;
  sku: string;
  name: string;
  quantity: number;
  source: string;
  sourceRoomId: string | null;
  note: string | null;
  status: string;
  redeemWtf: number;
  metadata: Record<string, unknown>;
  redeemedAt: string | null;
  rewardLedgerId: number | null;
  createdAt: string;
};

export type InAppMarketIntentResponse = {
  ok: boolean;
  intent: {
    id: number;
    purchaseRef: string;
    currency: MarketCurrency;
    status: string;
    walletAddress: string | null;
    items: unknown[];
    subtotalWtfUnits: string;
    subtotalWtfFormatted: string;
    subtotalExp: number;
    estimatedFeeMutez: number;
    estimatedFeeTez: string;
    contractAddress: string | null;
    contractVersion: "v1" | "v2" | string;
    cartHash: string;
    expectedTreasuryAddress: string;
    expectedWtfTokenContract: string;
    expectedWtfTokenId: number;
    routerListingId: number;
    expiresAt: string;
  };
  totals?: {
    subtotalWtfUnits: string;
    subtotalWtfFormatted: string;
    subtotalExp: number;
    estimatedFeeMutez: number;
    estimatedFeeTez: string;
  };
};

export type WtfIamCategory = {
  key: WtfIamCategoryKey;
  label: string;
  shortLabel: string;
  monogram: string;
  accent: string;
  shadow: string;
};

export type WtfIamListing = {
  sku: string;
  name: string;
  description: string | null;
  kind: string | null;
  category: WtfIamCategoryKey;
  source: WtfIamListingSource;
  priceWtfUnits: string;
  priceWtfFormatted: string;
  priceExp: number;
  sale?: InAppMarketItem["sale"];
  stockQuantity: number;
  quantityOwned: number;
  accent: string;
  monogram: string;
  metadata?: Record<string, unknown>;
  comingSoon?: boolean;
};

export type WtfIamCartEntry = {
  item: WtfIamListing;
  quantity: number;
};
