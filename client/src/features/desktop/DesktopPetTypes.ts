import { type HamsterAction, type HamsterState } from "@shared/desktop";

export type PetResponse = {
  pet: HamsterState;
  events: Array<{ id: number; action: string; xpAmount: number; createdAt: string }>;
};

export type InAppMarketItem = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  kind: string | null;
  priceWtfUnits: string;
  priceWtfFormatted: string;
  priceExp: number;
  contractAddress: string | null;
  contractListingId: number | null;
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
  };
  items: InAppMarketItem[];
};

export type PetTool =
  | "food"
  | "water"
  | "scoop"
  | "pet"
  | "pillow"
  | "medicine"
  | "ball"
  | null;

export type PetActionMutationInput =
  | HamsterAction
  | { action: HamsterAction; metadata?: Record<string, unknown> };
