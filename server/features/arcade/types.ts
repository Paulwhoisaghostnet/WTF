import type { ConsoleCartridge } from "../console/types";

export type ArcadePaymentConfig = {
  sku: string;
  currency: "wtf";
  feeWtfUnits: string;
  feeWtfFormatted: string;
  contractAddress: string | null;
  routerListingId: number;
  configured: boolean;
};

export type ArcadeCatalog = {
  demos: ConsoleCartridge[];
  published: ConsoleCartridge[];
  mine: ConsoleCartridge[];
  all: ConsoleCartridge[];
  payment: ArcadePaymentConfig;
};

export type ArcadePlayIntentDTO = {
  id: number;
  purchaseRef: string;
  currency: "wtf";
  status: string;
  walletAddress: string | null;
  items: unknown;
  subtotalWtfUnits: string;
  subtotalWtfFormatted: string;
  estimatedFeeMutez: number;
  contractAddress: string | null;
  routerListingId: number;
  expiresAt: string | Date;
};

export type ArcadePlayStatusDTO = {
  userId: number;
  sku: string;
  cardSku: string;
  cardsOwned: number;
  ticketsOwned: number;
  creditsRequired: boolean;
  creditsPerPlay: number;
  bypass: boolean;
  canPlay: boolean;
  payment: ArcadePaymentConfig;
};
