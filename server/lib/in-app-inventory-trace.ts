export interface InAppInventoryTraceInput {
  currency: "exp" | "wtf" | "reward_wtf";
  cause: "in_app_market_purchase" | "chain_purchase";
  purchaseId: number;
  sku: string;
  quantity: number;
  purchaseRef?: string | null;
  paymentIntentId?: number | null;
  walletAddress?: string | null;
  opHash?: string | null;
  tzktTransferId?: number | null;
  contractAddress?: string | null;
  contractListingId?: number | null;
  amountWtfUnits?: string | null;
  amountExp?: number | null;
  observedAt?: Date | string | null;
}

export function buildInAppInventoryTraceMetadata(input: InAppInventoryTraceInput) {
  return {
    source: input.cause,
    sourceType: "purchase",
    sourceId: input.purchaseId,
    domain: "market",
    ownerType: "user",
    state: "owned",
    visibility: "user_inventory",
    sku: input.sku,
    quantity: input.quantity,
    currency: input.currency,
    purchaseId: input.purchaseId,
    purchaseRef: input.purchaseRef ?? null,
    paymentIntentId: input.paymentIntentId ?? null,
    walletAddress: input.walletAddress ?? null,
    opHash: input.opHash ?? null,
    tzktTransferId: input.tzktTransferId ?? null,
    contractAddress: input.contractAddress ?? null,
    contractListingId: input.contractListingId ?? null,
    amountWtfUnits: input.amountWtfUnits ?? "0",
    amountExp: input.amountExp ?? 0,
    observedAt:
      input.observedAt instanceof Date
        ? input.observedAt.toISOString()
        : input.observedAt ?? null,
    traceRule: "P6.CA3/08",
  };
}

export interface InAppInventoryTipTraceInput {
  transferId: number;
  sku: string;
  quantity: number;
  senderUserId: number;
  receiverUserId: number;
  roomId?: string | null;
  note?: string | null;
  createdAt?: Date | string | null;
}

export function buildInAppInventoryTipMetadata(input: InAppInventoryTipTraceInput) {
  return {
    source: "wtf_live_tip",
    sourceType: "in_app_inventory_transfer",
    sourceId: input.transferId,
    domain: "wtf-live",
    ownerType: "user",
    state: "owned",
    visibility: "user_inventory",
    sku: input.sku,
    quantity: input.quantity,
    senderUserId: input.senderUserId,
    receiverUserId: input.receiverUserId,
    roomId: input.roomId ?? null,
    note: input.note ?? null,
    createdAt:
      input.createdAt instanceof Date
        ? input.createdAt.toISOString()
        : input.createdAt ?? null,
    traceRule: "P6.CA3/08",
  };
}

export function buildInAppInventoryTipRedemptionMetadata(input: {
  transferId: number;
  rewardLedgerId: number;
  sku: string;
  quantity: number;
  amountWtf: number;
  roomId?: string | null;
  redeemedAt?: Date | string | null;
}) {
  return {
    source: "wtf_live_tip_redeemed",
    sourceType: "in_app_inventory_transfer",
    sourceId: input.transferId,
    domain: "market",
    ownerType: "user",
    state: "redeemed",
    visibility: "reward_ledger",
    sku: input.sku,
    quantity: input.quantity,
    amountWtf: input.amountWtf,
    rewardLedgerId: input.rewardLedgerId,
    roomId: input.roomId ?? null,
    redeemedAt:
      input.redeemedAt instanceof Date
        ? input.redeemedAt.toISOString()
        : input.redeemedAt ?? null,
    traceRule: "P6.CA3/08",
  };
}
